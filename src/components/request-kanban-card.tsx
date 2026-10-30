'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  GripVertical,
  Clock,
  User,
  CheckCircle2,
  RotateCcw,
  Play,
  Presentation,
  Film,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  Compass,
  ArrowRight,
  Image as ImageIcon,
  Loader2,
  Trash2
} from 'lucide-react';
import {
  TaskWithRelations,
  User as UserType,
  DesignStatus,
  StratStatus,
  PipelineType
} from '@/lib/types';
import { canUserRestoreTask } from '@/lib/archive-engine';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  getInitials,
  getDueDateSemanticStatus,
  getPriorityDetails,
  getSLAFormatted,
  getQuantityStatus,
  sanitizeUrl,
  extractErrorMessage,
  canUserDeleteTask
} from '@/lib/utils';
import {
  STRAT_STATUS_LABELS,
  EXCELLENCE_COLORS,
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS
} from '@/lib/constants';

export interface RequestKanbanCardProps {
  task: TaskWithRelations;
  currentPipeline?: PipelineType;
  isMovable?: boolean;
  isBeingDragged?: boolean;
  isArchive?: boolean;
  isReadOnly?: boolean;
  user?: UserType | null;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onClick?: () => void;
  // Action Handlers
  onAssignClick?: (taskId: string) => void;
  onStratStart?: (taskId: string) => void;
  onStratSubmit?: (taskId: string) => void;
  onStratApprove?: (taskId: string) => void;
  onStratRevise?: (taskId: string) => void;
  onStartWork?: (taskId: string) => void;
  onMoveToMotion?: (taskId: string) => void;
  onRestore?: (taskId: string) => void;
  onHandoverToGD?: (taskId: string) => void;
  onDelete?: (taskId: string, taskCode?: string, clientName?: string) => void;
}

export function RequestKanbanCard({
  task,
  currentPipeline = 'GD_MOCKUP',
  isMovable = false,
  isBeingDragged = false,
  isArchive = false,
  isReadOnly = false,
  user,
  onDragStart,
  onDragEnd,
  onClick,
  onAssignClick,
  onStratStart,
  onStratSubmit,
  onStratApprove,
  onStratRevise,
  onStartWork,
  onMoveToMotion,
  onRestore,
  onHandoverToGD,
  onDelete
}: RequestKanbanCardProps) {
  const [isForwarding, setIsForwarding] = React.useState(false);
  const canDelete = canUserDeleteTask(user, task);
  const isFinished = task.status_design === 'DESIGN_APPROVED' || task.status_design === 'TASK_CLOSED';
  const dueInfo = getDueDateSemanticStatus(task.due_date, isFinished);
  const priorityInfo = getPriorityDetails(task.priority, task.design_difficulty, dueInfo.isOverdue);
  const slaInfo = getSLAFormatted(task.sla_working_days, dueInfo.isOverdue, dueInfo.overdueDays);
  const qtyStatus = getQuantityStatus(task.req_qty, task.output_qty);
  const approvalTimestamp = task.approved_at || task.submission_date || task.updated_at || task.created_at;

  // Creative Brief & Objective image preview
  const briefAttachments = (task.attachments || []).filter(
    att => (att.section === 'brief' || !att.section) &&
           (!att.type || att.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(att.url || att.name))
  );
  const primaryBriefImage = briefAttachments[0];

  // Action button visibility logic
  const hasStratPic = Boolean(task.strat_pic_id || (task.strat_pic_ids && task.strat_pic_ids.length > 0));
  const isUserStratPic = Boolean(
    user &&
    ((task.strat_pic_id === user.id) ||
      (task.strat_pic_ids && task.strat_pic_ids.includes(user.id)) ||
      ['ADMIN', 'TEAM_LEAD'].includes(user.role_name))
  );

  const isStrategicPipeline = currentPipeline === 'STRATEGIC';
  const isDesignPipeline = currentPipeline === 'GD_MOCKUP' || currentPipeline === 'GD_NON_MOCKUP';

  const isStrategicTask = task.pipeline_type === 'STRATEGIC' || Boolean(task.requires_strategic_concept && task.status_strat !== 'NOT_REQUIRED');
  const canUserActOnStrat = Boolean(
    user && (
      ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) ||
      isUserStratPic ||
      (user.role_name === 'REQUESTER' && task.created_by === user.id)
    )
  );

  const showMotionAction = !isReadOnly && !isArchive && isDesignPipeline && task.status_design === 'DESIGN_APPROVED';

  // Strategic actions: show in Strategic Pipeline while concept is active (PENDING, IN_PROGRESS, REVIEW, REVISION)
  const showStratActions = !isArchive && isStrategicTask && canUserActOnStrat && task.status_strat !== 'APPROVED';

  // Strategic Handover to GD: when concept is APPROVED in Strategic Pipeline
  const showStrategicHandoverAction = !isArchive && isStrategicPipeline && task.status_strat === 'APPROVED' && !isReadOnly && Boolean(onHandoverToGD);

  // Design assign action: strictly in design pipelines (NOT in Strategic pipeline)
  const showAssignDesignAction = !isReadOnly && !isArchive && !isStrategicPipeline && task.pipeline_type !== 'STRATEGIC' && task.status_design === 'DESIGN_UNASSIGNED' && user && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name);

  // Start work action: strictly in design pipelines (NOT in Strategic pipeline)
  const showStartWorkAction = !isReadOnly && !isArchive && !isStrategicPipeline && task.pipeline_type !== 'STRATEGIC' && task.status_design === 'DESIGN_ASSIGNED' && user && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name));

  const hasAnyActions = showMotionAction || showStratActions || showStrategicHandoverAction || showAssignDesignAction || showStartWorkAction;


  return (
    <div
      draggable={isMovable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`kanban-card group transition-all select-none relative flex flex-col justify-between p-3.5 bg-[var(--bg-card)] rounded-xl border border-[var(--border-primary)] ${
        isMovable ? 'cursor-grab active:cursor-grabbing hover:border-[var(--accent-blue)]' : 'cursor-pointer'
      } ${
        isBeingDragged
          ? 'opacity-40 scale-95 border-dashed border-2 border-[var(--accent-blue)] shadow-xl'
          : 'hover:shadow-md hover:border-[var(--border-primary)]'
      }`}
    >
      <div>
        {/* ============================================================
            LEVEL 1: HEADER (Request ID & Priority/Status Badges)
            ============================================================ */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {isMovable && (
              <span title="Tarik kartu untuk pindah status" className="cursor-grab shrink-0">
                <GripVertical className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-40 group-hover:opacity-100 transition-opacity" />
              </span>
            )}
            <span className="text-xs font-mono font-bold text-[var(--accent-blue)] tracking-tight truncate group-hover:underline">
              {task.task_code}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isArchive ? (
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Approved</span>
              </span>
            ) : (
              <>
                {/* Strategic Concept Badge */}
                {task.requires_strategic_concept && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    Strat: {STRAT_STATUS_LABELS[task.status_strat] || task.status_strat}
                  </span>
                )}

                {/* Priority Badge */}
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityInfo.badgeClass}`}
                  title={`Priority: ${priorityInfo.label}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${priorityInfo.dotClass}`} />
                  <span>{priorityInfo.label}</span>
                </span>
              </>
            )}

            {canDelete && onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(task.id, task.task_code, task.client_name);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                title="Hapus request ini"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ============================================================
            LEVEL 1: BRAND / CLIENT & REQUEST TITLE (Dominant Identity)
            ============================================================ */}
        <div className="mb-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-[13px] sm:text-sm font-bold text-[var(--text-primary)] leading-tight truncate group-hover:text-[var(--accent-blue)] transition-colors">
              {task.client_name}
            </h4>
            {task.client_type && (
              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-secondary)] shrink-0">
                {task.client_type}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-1 leading-snug font-normal">
            {task.campaign_name}
          </p>
        </div>

        {/* ============================================================
            LEVEL 3 & 4: WORK METADATA (Content Type + Source & Qty Chips)
            ============================================================ */}
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {/* Content Type Chip */}
          {task.content_type_name && (
            <span className="inline-flex items-center px-1.5 py-0.2 text-[9.5px] font-semibold rounded bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-secondary)]">
              {task.content_type_name}
            </span>
          )}

          {/* Source & Qty Chip */}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 text-[9.5px] font-medium rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-secondary)]">
            <span>{task.task_source || 'Orca'}</span>
            <span className="opacity-40">·</span>
            <span className={qtyStatus.hasDiscrepancy ? "text-amber-500 font-bold" : "text-[var(--text-primary)] font-semibold"}>
              {qtyStatus.display}
            </span>
          </span>

          {/* Quantity Discrepancy Alert Tag */}
          {qtyStatus.hasDiscrepancy && (
            <span className="text-[8.5px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" />
              <span>{qtyStatus.remaining} rem</span>
            </span>
          )}

          {/* Difficulty Badge (if present) */}
          {task.design_difficulty && (
            <span className={`text-[8.5px] font-semibold px-1 py-0.2 rounded border ${DIFFICULTY_COLORS[task.design_difficulty]}`}>
              {DIFFICULTY_LABELS[task.design_difficulty]}
            </span>
          )}

          {/* Operational Excellence Badge (if present) */}
          {task.operational_excellence && (
            <span className={`text-[8.5px] font-bold px-1 py-0.2 rounded border ${EXCELLENCE_COLORS[task.operational_excellence]}`}>
              {task.operational_excellence}
            </span>
          )}

          {/* Strategic Deck Link (if available) */}
          {task.strat_concept_link && (
            <a
              href={sanitizeUrl(task.strat_concept_link)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-[8.5px] font-semibold text-purple-300 bg-purple-500/15 border border-purple-500/30 px-1 py-0.2 rounded hover:bg-purple-500/25 transition-colors"
              title={task.strat_concept_name || "Buka Deck Strategi"}
            >
              <Presentation className="w-2.5 h-2.5" />
              <span>Deck</span>
              <ExternalLink className="w-2 h-2 opacity-70" />
            </a>
          )}

          {/* Final Asset Link (if available) */}
          {task.final_asset_link && (
            <a
              href={sanitizeUrl(task.final_asset_link)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-[8.5px] font-semibold text-blue-300 bg-blue-500/15 border border-blue-500/30 px-1 py-0.2 rounded hover:bg-blue-500/25 transition-colors"
              title={task.final_asset_name || "Buka Asset Desain GD"}
            >
              <ExternalLink className="w-2.5 h-2.5" />
              <span>Asset</span>
            </a>
          )}

          {/* Linkage badge: Strategic Task spawned to design pipeline */}
          {isStrategicPipeline && task.status_strat === 'APPROVED' && (
            <span className="inline-flex items-center gap-1 text-[8.5px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 rounded" title={`Task desain di ${task.task_source === 'ECOMMERCE' ? 'Ecommerce Pipeline' : 'Mockup Pipeline'}`}>
              <Sparkles className="w-2.5 h-2.5" />
              <span>{task.task_source === 'ECOMMERCE' ? 'Ecommerce' : 'Mockup'}</span>
            </span>
          )}

          {/* Linkage badge: Spawned Design Task from Strategic */}
          {task.source_strategic_task_id && (
            <span className="inline-flex items-center gap-1 text-[8.5px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1 py-0.2 rounded" title="Dibuat dari Strategic Concept">
              <Compass className="w-2.5 h-2.5" />
              <span>From Strat</span>
            </span>
          )}
        </div>

        {/* ============================================================
            CREATIVE BRIEF & OBJECTIVE IMAGE PREVIEW BANNER
            ============================================================ */}
        {primaryBriefImage && (
          <div className="mb-2.5 overflow-hidden rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] relative group/preview shadow-2xs">
            <div className="relative w-full h-28 sm:h-32 bg-black/10 dark:bg-black/30 flex items-center justify-center overflow-hidden">
              <img
                src={primaryBriefImage.url.startsWith('http') || primaryBriefImage.url.startsWith('/') ? primaryBriefImage.url : `/${primaryBriefImage.url}`}
                alt={primaryBriefImage.name || 'Creative Brief Preview'}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 pointer-events-none"
                draggable={false}
                loading="lazy"
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />

              {/* Multi-photo indicator badge if more than 1 photo */}
              {briefAttachments.length > 1 && (
                <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[9px] font-semibold border border-white/10 shadow-xs pointer-events-none">
                  <ImageIcon className="w-2.5 h-2.5" />
                  <span>+{briefAttachments.length - 1} Foto</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            LEVEL 2: TIMELINE SECTION (DUE DATE & SLA)
            ============================================================ */}
        <div className="pt-2 border-t border-[var(--border-secondary)] mb-1.5">
          {isArchive ? (
            <div className="flex items-center justify-between gap-1.5 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-muted)]">Approved:</span>
                <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                  {formatDisplayDate(approvalTimestamp)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {task.operational_excellence ? (
                  <span className={`text-[8.5px] font-bold px-1 py-0.2 rounded border ${EXCELLENCE_COLORS[task.operational_excellence]}`}>
                    {task.operational_excellence}
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {task.sla_working_days ? `${task.sla_working_days}d SLA` : 'Standard'}
                  </span>
                )}
                {task.final_asset_link && (
                  <a
                    href={sanitizeUrl(task.final_asset_link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-0.5 rounded bg-blue-500/10 text-[var(--accent-blue)] hover:bg-blue-500/20 transition-colors"
                    title="Buka Drive Asset"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1.5 text-xs">
              {/* Due Date */}
              <div className="flex items-center gap-1 min-w-0">
                <Clock className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                <span className={`text-[11px] font-medium ${dueInfo.textClass}`}>
                  {dueInfo.formattedDate}
                </span>
                {dueInfo.badge && (
                  <span className={`text-[8px] px-1 py-0.2 rounded shrink-0 ${dueInfo.badgeClass}`}>
                    {dueInfo.badge}
                  </span>
                )}
              </div>

              {/* SLA */}
              <div className="shrink-0 text-[10.5px]">
                <span className={`font-medium ${slaInfo.isWarning ? 'text-rose-500 font-bold' : slaInfo.isCalculated ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>
                  {slaInfo.text}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================
            LEVEL 3: PEOPLE SECTION (AE & PIC INLINE)
            ============================================================ */}
        <div className="pt-1.5 border-t border-[var(--border-secondary)] flex items-center justify-between gap-1.5 text-xs">
          {/* AE (Requester) */}
          <div className="flex items-center gap-1 min-w-0" title={`Requester: ${task.created_by_name || 'AE'}`}>
            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)]">AE:</span>
            <span className="text-[10.5px] font-medium text-[var(--text-secondary)] truncate max-w-[90px]">
              {task.created_by_name || 'AE'}
            </span>
          </div>

          {/* Assigned PIC */}
          <div className="flex items-center gap-1 shrink-0">
            {isStrategicPipeline ? (
              task.strat_pic_name ? (
                <div className="flex items-center gap-1" title={`Strategic PIC: ${task.strat_pic_name}`}>
                  <div className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-[7.5px] font-bold shrink-0">
                    {getInitials(task.strat_pic_name)}
                  </div>
                  <span className="text-[10.5px] font-medium text-purple-300 truncate max-w-[80px]">
                    {task.strat_pic_name}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] italic text-[var(--text-muted)]">Unassigned</span>
              )
            ) : task.design_pic_name ? (
              <div className="flex items-center gap-1" title={`GD PIC: ${task.design_pic_name}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[7.5px] font-bold shrink-0">
                  {getInitials(task.design_pic_name)}
                </div>
                <span className="text-[10.5px] font-semibold text-[var(--text-primary)] truncate max-w-[80px]">
                  {task.design_pic_name}
                </span>
              </div>
            ) : task.strat_pic_name ? (
              <div className="flex items-center gap-1" title={`Strategic PIC: ${task.strat_pic_name}`}>
                <div className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-[7.5px] font-bold shrink-0">
                  {getInitials(task.strat_pic_name)}
                </div>
                <span className="text-[10.5px] font-medium text-purple-300 truncate max-w-[80px]">
                  {task.strat_pic_name}
                </span>
              </div>
            ) : (
              <span className="text-[10px] italic text-[var(--text-muted)]">Unassigned</span>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================
          LEVEL 4: QUICK ACTION BUTTONS (Contextual Workflow Actions)
          ============================================================ */}
      {hasAnyActions && (
        <div
          className="mt-2 pt-1.5 border-t border-[var(--border-secondary)] flex flex-wrap items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Move to Motion */}
          {showMotionAction && (
            task.motion_task ? (
              <span className="text-[11px] font-medium text-pink-400 flex items-center gap-1">
                <Film className="w-3 h-3" /> Motion: {task.motion_task.status_motion}
              </span>
            ) : (
              <button
                disabled={isForwarding || !onMoveToMotion}
                onClick={async (event) => {
                  event.stopPropagation();
                  if (!onMoveToMotion || isForwarding) return;
                  if (!window.confirm(`Teruskan request ${task.task_code} ke Motion Pipeline?`)) return;

                  setIsForwarding(true);
                  try {
                    await onMoveToMotion(task.id);
                  } catch (error) {
                    const message = extractErrorMessage(error);
                    window.alert(`Gagal meneruskan request ke Motion: ${message}`);
                  } finally {
                    setIsForwarding(false);
                  }
                }}
                className="btn-ghost text-[11px] py-1 px-2 text-pink-400 hover:bg-pink-500/10 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
                title="Teruskan request yang telah disetujui ke antrean Motion"
              >
                {isForwarding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
                {isForwarding ? 'Forwarding...' : 'Forward to Motion Pipeline'}
              </button>
            )
          )}

          {/* Strategic Workflow Actions */}
          {showStratActions && (
            <>
              {!hasStratPic && user && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
                <button
                  onClick={() => onAssignClick?.(task.id)}
                  className="btn-ghost text-[11px] py-1 px-2 text-blue-400 font-medium flex items-center gap-1"
                >
                  <User className="w-3 h-3" /> Assign Strat PIC
                </button>
              )}
              {task.status_strat === 'PENDING' && hasStratPic && user && (isUserStratPic || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                <button
                  onClick={() => onStratStart?.(task.id)}
                  className="btn-ghost text-[11px] py-1 px-2 text-cyan-400 font-medium flex items-center gap-1"
                >
                  <Play className="w-3 h-3" /> Start Strat
                </button>
              )}
              {(task.status_strat === 'IN_PROGRESS' || task.status_strat === 'REVISION') && user && (isUserStratPic || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                <button
                  onClick={() => onStratSubmit?.(task.id)}
                  className="btn-ghost text-[11px] py-1 px-2 text-emerald-400 font-medium flex items-center gap-1"
                >
                  <Presentation className="w-3 h-3" /> {task.status_strat === 'REVISION' ? 'Resubmit Deck' : 'Submit Deck'}
                </button>
              )}
              {task.status_strat === 'REVIEW' && user && (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === user.id)) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStratRevise?.(task.id);
                    }}
                    className="btn-ghost text-[11px] py-1 px-2 text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 rounded-md font-medium flex items-center gap-1 cursor-pointer"
                    title="Minta revisi konsep strategi"
                  >
                    <RotateCcw className="w-3 h-3" /> Revisi
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStratApprove?.(task.id);
                    }}
                    className="btn-ghost text-[11px] py-1 px-2 text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 rounded-md font-medium flex items-center gap-1 cursor-pointer"
                    title="Setujui konsep strategi"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Approve Strat
                  </button>
                </div>
              )}
            </>
          )}

          {/* Strategic Handover to GD Action (Approved Column in Strategic Pipeline) */}
          {showStrategicHandoverAction && (
            <div className="w-full flex items-center justify-between gap-1.5 pt-0.5">
              {task.spawned_design_task_id ? (
                <div className="w-full flex items-center justify-between gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Dialihkan ke GD {task.design_pic_name ? `(${task.design_pic_name})` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onHandoverToGD?.(task.id);
                    }}
                    className="btn-ghost text-[10px] py-1 px-2 text-cyan-400 hover:bg-cyan-500/10 border border-cyan-500/20 rounded-md font-medium flex items-center gap-1 cursor-pointer"
                    title="Ubah GD PIC atau alihkan ulang"
                  >
                    <User className="w-2.5 h-2.5" /> Ganti GD PIC
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHandoverToGD?.(task.id);
                  }}
                  className="w-full py-1.5 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] rounded-lg shadow-sm border border-emerald-500/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Alihkan konsep ini ke Graphic Design dan tetapkan GD PIC"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Alihkan ke GD</span>
                </button>
              )}
            </div>
          )}

          {/* Design Assign Action */}
          {showAssignDesignAction && (
            <button
              onClick={() => onAssignClick?.(task.id)}
              className="btn-ghost text-[11px] py-1 px-2 text-blue-400 font-medium flex items-center gap-1"
            >
              <User className="w-3 h-3" /> {task.design_pic_id ? 'Confirm Assignment' : (isStrategicPipeline ? 'Assign GD PIC' : 'Assign Design PIC')}
            </button>
          )}

          {/* Design Start Work Action */}
          {showStartWorkAction && (
            <button
              onClick={() => onStartWork?.(task.id)}
              className="btn-ghost text-[11px] py-1 px-2 text-cyan-400 font-medium flex items-center gap-1"
            >
              <Play className="w-3 h-3" /> {isStrategicPipeline ? 'Start GD Work' : 'Start Work'}
            </button>
          )}
        </div>
      )}

      {/* Archive / Restore Footer */}
      {(isArchive || task.is_archived) && (
        <div className="mt-2.5 pt-2 border-t border-[var(--border-secondary)] flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
            Arsip ({task.archive_period || 'Selesai'})
          </span>
          {user && canUserRestoreTask(user.role_name, user.id, task) && onRestore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestore(task.id);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all shadow-sm"
              title="Pulihkan task dari arsip ke board kerja aktif"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
