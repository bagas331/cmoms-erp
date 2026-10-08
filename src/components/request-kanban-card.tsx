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
  AlertTriangle
} from 'lucide-react';
import {
  TaskWithRelations,
  User as UserType,
  DesignStatus,
  StratStatus
} from '@/lib/types';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  getInitials,
  getDueDateSemanticStatus,
  getPriorityDetails,
  getSLAFormatted,
  getQuantityStatus,
  sanitizeUrl
} from '@/lib/utils';
import {
  STRAT_STATUS_LABELS,
  EXCELLENCE_COLORS,
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS
} from '@/lib/constants';

export interface RequestKanbanCardProps {
  task: TaskWithRelations;
  isMovable?: boolean;
  isBeingDragged?: boolean;
  isArchive?: boolean;
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
}

export function RequestKanbanCard({
  task,
  isMovable = false,
  isBeingDragged = false,
  isArchive = false,
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
  onMoveToMotion
}: RequestKanbanCardProps) {
  const isFinished = task.status_design === 'DESIGN_APPROVED' || task.status_design === 'TASK_CLOSED';
  const dueInfo = getDueDateSemanticStatus(task.due_date, isFinished);
  const priorityInfo = getPriorityDetails(task.priority, task.design_difficulty, dueInfo.isOverdue);
  const slaInfo = getSLAFormatted(task.sla_working_days, dueInfo.isOverdue, dueInfo.overdueDays);
  const qtyStatus = getQuantityStatus(task.req_qty, task.output_qty);
  const approvalTimestamp = task.approved_at || task.submission_date || task.updated_at || task.created_at;

  // Action button visibility logic
  const hasStratPic = Boolean(task.strat_pic_id || (task.strat_pic_ids && task.strat_pic_ids.length > 0));
  const isUserStratPic = Boolean(
    user &&
    ((task.strat_pic_id === user.id) ||
      (task.strat_pic_ids && task.strat_pic_ids.includes(user.id)) ||
      ['ADMIN', 'TEAM_LEAD'].includes(user.role_name))
  );

  const showMotionAction = !isArchive && task.status_design === 'DESIGN_APPROVED';
  const showStratActions = !isArchive && task.status_design === 'STRAT_PENDING' && user;
  const showAssignDesignAction = !isArchive && task.status_design === 'DESIGN_UNASSIGNED' && user && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name);
  const showStartWorkAction = !isArchive && task.status_design === 'DESIGN_ASSIGNED' && user && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name));

  const hasAnyActions = showMotionAction || showStratActions || showAssignDesignAction || showStartWorkAction;

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
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          {/* Content Type Chip */}
          {task.content_type_name && (
            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-secondary)]">
              {task.content_type_name}
            </span>
          )}

          {/* Source & Qty Chip */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-secondary)]">
            <span>{task.task_source || 'Orca'}</span>
            <span className="opacity-40">·</span>
            <span className={qtyStatus.hasDiscrepancy ? "text-amber-500 font-bold" : "text-[var(--text-primary)] font-semibold"}>
              {qtyStatus.display}
            </span>
          </span>

          {/* Quantity Discrepancy Alert Tag */}
          {qtyStatus.hasDiscrepancy && (
            <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" />
              <span>{qtyStatus.remaining} rem</span>
            </span>
          )}

          {/* Difficulty Badge (if active & present) */}
          {task.design_difficulty && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${DIFFICULTY_COLORS[task.design_difficulty]}`}>
              {DIFFICULTY_LABELS[task.design_difficulty]}
            </span>
          )}

          {/* Operational Excellence Badge (if present) */}
          {task.operational_excellence && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${EXCELLENCE_COLORS[task.operational_excellence]}`}>
              {task.operational_excellence}
            </span>
          )}
        </div>

        {/* ============================================================
            LEVEL 2: TIMELINE SECTION (DUE DATE & SLA)
            ============================================================ */}
        <div className="pt-2.5 border-t border-[var(--border-secondary)] mb-2.5">
          {isArchive ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-muted)] block">
                  Approved At
                </span>
                <div className="flex flex-col mt-0.5">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    {formatDisplayDate(approvalTimestamp)}
                  </span>
                  <span className="text-[9px] text-[var(--text-muted)] font-mono">
                    {approvalTimestamp ? new Date(approvalTimestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':') + ' WIB' : ''}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-muted)] block">
                  SLA Quality
                </span>
                <div className="flex items-center gap-1 mt-1">
                  {task.operational_excellence ? (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${EXCELLENCE_COLORS[task.operational_excellence]}`}>
                      {task.operational_excellence}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-[var(--text-muted)]">
                      {task.sla_working_days ? `${task.sla_working_days} working days` : 'Standard'}
                    </span>
                  )}
                  {task.final_asset_link && (
                    <a
                      href={sanitizeUrl(task.final_asset_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded bg-blue-500/10 text-[var(--accent-blue)] hover:bg-blue-500/20 transition-colors ml-auto"
                      title="Buka Drive Asset"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {/* Due Date Column */}
              <div>
                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-muted)] block">
                  Due Date
                </span>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  <span className={`text-xs ${dueInfo.textClass}`}>
                    {dueInfo.formattedDate}
                  </span>
                  {dueInfo.badge && (
                    <span className={`text-[8px] px-1 py-0.2 rounded shrink-0 ${dueInfo.badgeClass}`}>
                      {dueInfo.badge}
                    </span>
                  )}
                </div>
              </div>

              {/* SLA Column */}
              <div>
                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-muted)] block">
                  SLA
                </span>
                <span className={`text-xs font-medium mt-0.5 block ${slaInfo.isWarning ? 'text-rose-500 font-bold' : slaInfo.isCalculated ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                  {slaInfo.text}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================
            LEVEL 3: PEOPLE SECTION (AE, Strategic & GD PIC)
            ============================================================ */}
        <div className="pt-2.5 border-t border-[var(--border-secondary)] space-y-1.5">
          {/* AE (Requester) */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-muted)]">
              AE
            </span>
            <div className="flex items-center gap-1.5 truncate max-w-[150px]">
              <div className="w-4 h-4 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] flex items-center justify-center text-[8px] font-bold text-[var(--text-secondary)] shrink-0">
                {getInitials(task.created_by_name || 'AE')}
              </div>
              <span className="text-xs font-medium text-[var(--text-secondary)] truncate">
                {task.created_by_name || 'AE'}
              </span>
            </div>
          </div>

          {/* Strategic PIC (if applicable) */}
          {task.requires_strategic_concept && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[9px] uppercase tracking-wider font-bold text-purple-400">
                Strategic
              </span>
              <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                <div className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-[8px] font-bold shrink-0">
                  {getInitials(task.strat_pic_name || 'S')}
                </div>
                <span className="text-xs font-medium text-purple-300 truncate">
                  {task.strat_pic_name || 'Unassigned'}
                </span>
              </div>
            </div>
          )}

          {/* GD PIC */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-muted)]">
              GD PIC
            </span>
            <div className="flex items-center gap-1.5 truncate max-w-[150px]">
              {task.design_pic_name ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[8px] font-bold shrink-0">
                    {getInitials(task.design_pic_name)}
                  </div>
                  <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {task.design_pic_name}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                  <span className="text-xs italic text-[var(--text-muted)]">
                    Unassigned
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          LEVEL 4: QUICK ACTION BUTTONS (Contextual Workflow Actions)
          ============================================================ */}
      {hasAnyActions && (
        <div
          className="mt-2.5 pt-2 border-t border-[var(--border-secondary)] flex flex-wrap items-center gap-1.5"
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
                onClick={() => onMoveToMotion?.(task.id)}
                className="btn-ghost text-[11px] py-1 px-2 text-pink-400 hover:bg-pink-500/10 flex items-center gap-1 font-medium"
              >
                <Film className="w-3 h-3" /> Move to Motion
              </button>
            )
          )}

          {/* Strategic Workflow Actions */}
          {showStratActions && (
            <>
              {!hasStratPic && user && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
                <button
                  onClick={() => onAssignClick?.(task.id)}
                  className="btn-ghost text-[11px] py-1 px-2 text-blue-400 font-medium flex items-center gap-1"
                >
                  <User className="w-3 h-3" /> Assign Strat PIC
                </button>
              )}
              {task.status_strat === 'PENDING' && hasStratPic && isUserStratPic && (
                <button
                  onClick={() => onStratStart?.(task.id)}
                  className="btn-ghost text-[11px] py-1 px-2 text-cyan-400 font-medium flex items-center gap-1"
                >
                  <Play className="w-3 h-3" /> Start Strat
                </button>
              )}
              {(task.status_strat === 'IN_PROGRESS' || task.status_strat === 'REVISION') && isUserStratPic && (
                <button
                  onClick={() => onStratSubmit?.(task.id)}
                  className="btn-ghost text-[11px] py-1 px-2 text-emerald-400 font-medium flex items-center gap-1"
                >
                  <Presentation className="w-3 h-3" /> Submit Deck
                </button>
              )}
              {task.status_strat === 'REVIEW' && user && ['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name) && (
                <>
                  <button
                    onClick={() => onStratApprove?.(task.id)}
                    className="btn-ghost text-[11px] py-1 px-2 text-emerald-400 font-medium flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Approve Strat
                  </button>
                  <button
                    onClick={() => onStratRevise?.(task.id)}
                    className="btn-ghost text-[11px] py-1 px-2 text-amber-400 font-medium flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Revise
                  </button>
                </>
              )}
            </>
          )}

          {/* Design Assign Action */}
          {showAssignDesignAction && (
            <button
              onClick={() => onAssignClick?.(task.id)}
              className="btn-ghost text-[11px] py-1 px-2 text-blue-400 font-medium flex items-center gap-1"
            >
              <User className="w-3 h-3" /> {task.design_pic_id ? 'Confirm Assignment' : 'Assign Design PIC'}
            </button>
          )}

          {/* Design Start Work Action */}
          {showStartWorkAction && (
            <button
              onClick={() => onStartWork?.(task.id)}
              className="btn-ghost text-[11px] py-1 px-2 text-cyan-400 font-medium flex items-center gap-1"
            >
              <Play className="w-3 h-3" /> Start Work
            </button>
          )}
        </div>
      )}
    </div>
  );
}
