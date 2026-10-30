'use client';

import React from 'react';
import {
  GripVertical,
  Film,
  User,
  Clock,
  Play,
  CheckCircle2,
  RotateCcw,
  Undo2,
  ExternalLink,
  Edit2,
  FileText,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';
import {
  MotionStatus,
  MotionTask,
  TaskWithRelations,
  User as UserType,
  Client,
  MotionDifficulty
} from '@/lib/types';
import {
  formatDisplayDate,
  getInitials,
  getDueDateSemanticStatus,
  getPriorityDetails,
  getSLAFormatted,
  sanitizeUrl,
  canUserDeleteMotionTask
} from '@/lib/utils';
import {
  MOTION_DIFFICULTY_LABELS
} from '@/lib/constants';
import { canUserRestoreTask } from '@/lib/archive-engine';

export type EnrichedMotionTask = MotionTask & { parentTask?: TaskWithRelations };

export interface MotionKanbanCardProps {
  mt: EnrichedMotionTask;
  isMovable?: boolean;
  isBeingDragged?: boolean;
  isArchive?: boolean;
  isReadOnly?: boolean;
  clientName: string;
  picUser?: UserType | null;
  user?: UserType | null;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onClick?: () => void;
  // Action Handlers
  onEdit?: (id: string) => void;
  onAssign?: (id: string) => void;
  onStatusChange?: (id: string, newStatus: MotionStatus) => void;
  onSubmit?: (id: string) => void;
  onRevision?: (id: string) => void;
  onHandover?: (id: string) => void;
  onUndo?: (id: string, prevStatus: MotionStatus) => void;
  onRestore?: (id: string) => void;
  onDelete?: (motionTaskId: string, taskCode?: string, clientName?: string) => void;
}

const MOTION_DIFFICULTY_STYLES: Record<string, string> = {
  LVL_1_SIMPLE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  LVL_2_MEDIUM: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  LVL_3_ADVANCED: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  LVL_4_PERIOD: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

export function MotionKanbanCard({
  mt,
  isMovable = false,
  isBeingDragged = false,
  isArchive = false,
  isReadOnly = false,
  clientName,
  picUser,
  user,
  onDragStart,
  onDragEnd,
  onClick,
  onEdit,
  onAssign,
  onStatusChange,
  onSubmit,
  onRevision,
  onHandover,
  onUndo,
  onRestore,
  onDelete
}: MotionKanbanCardProps) {
  const canDelete = canUserDeleteMotionTask(user, mt);
  const isFinished = mt.status_motion === 'APPROVED' || mt.status_motion === 'COMPLETED';
  const targetDueDate = mt.parentTask?.due_date || mt.period_end || mt.production_date || mt.apply_date;
  const dueInfo = getDueDateSemanticStatus(targetDueDate, isFinished);
  const priorityInfo = getPriorityDetails(
    mt.parentTask?.priority,
    mt.motion_difficulty === 'LVL_3_ADVANCED' || mt.motion_difficulty === 'LVL_4_PERIOD' ? 'HARD' : mt.motion_difficulty === 'LVL_1_SIMPLE' ? 'LIGHT' : 'MEDIUM',
    dueInfo.isOverdue
  );
  const slaInfo = getSLAFormatted(mt.parentTask?.sla_working_days, dueInfo.isOverdue, dueInfo.overdueDays);
  const taskCode = mt.parentTask?.task_code || (mt.id || '').substring(0, 10).toUpperCase();
  const campaignTitle = mt.parentTask?.campaign_name || mt.campaign_type || mt.motion_type || 'Standalone Motion';
  const approvalTimestamp = mt.approved_at || mt.apply_date || mt.updated_at || mt.created_at;

  const isStandalone = !mt.parentTask;

  // Motion Brief & Objective image preview
  const motionAttachments = mt.attachments?.length ? mt.attachments : (mt.parentTask?.attachments || []);
  const briefAttachments = motionAttachments.filter(
    att => (att.section === 'brief' || !att.section) &&
           (!att.type || att.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(att.url || att.name))
  );
  const primaryBriefImage = briefAttachments[0];
  const isUserMotionPic = Boolean(user && mt.motion_pic_id === user.id);
  const isLeadOrAdmin = Boolean(user && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name));
  const isReviewer = Boolean(user && ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'REQUESTER'].includes(user.role_name));

  // Determine Undo prev status
  let prevUndoStatus: MotionStatus | null = null;
  if (isLeadOrAdmin && mt.status_motion !== 'QUEUED') {
    switch (mt.status_motion) {
      case 'IN_PROGRESS': prevUndoStatus = 'QUEUED'; break;
      case 'SUBMITTED': prevUndoStatus = 'IN_PROGRESS'; break;
      case 'REVISION': prevUndoStatus = 'SUBMITTED'; break;
      case 'APPROVED': prevUndoStatus = 'SUBMITTED'; break;
      case 'COMPLETED': prevUndoStatus = 'APPROVED'; break;
    }
  }

  const hasAnyActions =
    !isReadOnly &&
    !isArchive &&

    ((isLeadOrAdmin && isStandalone) ||
      (mt.status_motion === 'QUEUED' && isLeadOrAdmin) ||
      (mt.status_motion === 'QUEUED' && mt.motion_pic_id && (isUserMotionPic || isLeadOrAdmin)) ||
      ((mt.status_motion === 'IN_PROGRESS' || mt.status_motion === 'REVISION') && (isUserMotionPic || isLeadOrAdmin)) ||
      (mt.status_motion === 'SUBMITTED' && isReviewer) ||
      (mt.status_motion === 'APPROVED' && isLeadOrAdmin) ||
      Boolean(prevUndoStatus));

  return (
    <div
      draggable={isMovable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`kanban-card group transition-all select-none relative flex flex-col justify-between p-3.5 bg-[var(--bg-card)] rounded-xl border border-[var(--border-primary)] ${
        isMovable ? 'cursor-grab active:cursor-grabbing hover:border-[var(--accent-pink)]' : 'cursor-pointer hover:border-[var(--accent-pink)]'
      } ${
        isBeingDragged
          ? 'opacity-40 scale-95 border-dashed border-2 border-[var(--accent-pink)] shadow-xl'
          : 'hover:shadow-md hover:border-[var(--border-primary)]'
      }`}
    >
      <div>
        {/* ============================================================
            LEVEL 1: HEADER (Motion Code / ID & Priority/Difficulty Badges)
            ============================================================ */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {isMovable && (
              <span title="Tarik kartu untuk pindah status" className="cursor-grab shrink-0">
                <GripVertical className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-40 group-hover:opacity-100 transition-opacity" />
              </span>
            )}
            <span className="text-xs font-mono font-bold text-[var(--accent-pink)] tracking-tight truncate group-hover:underline">
              {taskCode}
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
                {/* Revision Counter Badge */}
                {mt.motion_revision_count > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Rev #{mt.motion_revision_count}
                  </span>
                )}

                {/* Difficulty Badge */}
                <span
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                    MOTION_DIFFICULTY_STYLES[mt.motion_difficulty] || 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  }`}
                >
                  {MOTION_DIFFICULTY_LABELS[mt.motion_difficulty] || mt.motion_difficulty}
                </span>

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
                  onDelete(mt.id, taskCode, clientName);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                title="Hapus tiket motion ini"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ============================================================
            LEVEL 1: BRAND / CLIENT & CAMPAIGN TITLE (Dominant Identity)
            ============================================================ */}
        <div className="mb-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-[13px] sm:text-sm font-bold text-[var(--text-primary)] leading-tight truncate group-hover:text-[var(--accent-pink)] transition-colors">
              {clientName}
            </h4>
            {isStandalone ? (
              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 shrink-0">
                STANDALONE
              </span>
            ) : mt.parentTask?.client_type ? (
              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-secondary)] shrink-0">
                {mt.parentTask.client_type}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-1 leading-snug font-normal">
            {campaignTitle}
          </p>
        </div>

        {/* ============================================================
            LEVEL 3 & 4: WORK METADATA (Platform, Studio, Motion Type Chips)
            ============================================================ */}
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {/* Platform Chip */}
          {mt.platform && (
            <span className="inline-flex items-center px-1.5 py-0.2 text-[9.5px] font-semibold rounded bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-secondary)]">
              {mt.platform}
            </span>
          )}

          {/* Studio Chip */}
          {mt.studio && (
            <span className="inline-flex items-center px-1.5 py-0.2 text-[9.5px] font-medium rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
              {mt.studio}
            </span>
          )}

          {/* Motion Type Chip */}
          {mt.motion_type && (
            <span className="inline-flex items-center px-1.5 py-0.2 text-[9.5px] font-medium rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 truncate max-w-[140px]">
              {mt.motion_type}
            </span>
          )}

          {/* Concept Deck Link Button */}
          {mt.parentTask?.strat_concept_link && (
            <a
              href={sanitizeUrl(mt.parentTask.strat_concept_link)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[9px] font-semibold rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
              title={mt.parentTask.strat_concept_name || "Buka Strategic Concept Deck"}
            >
              <FileText className="w-2.5 h-2.5" />
              <span>Deck</span>
              <ExternalLink className="w-2 h-2 ml-0.5" />
            </a>
          )}

          {/* Asset GD Link Button */}
          {mt.parentTask?.final_asset_link && (
            <a
              href={sanitizeUrl(mt.parentTask.final_asset_link)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[9px] font-semibold rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
              title={mt.parentTask.final_asset_name || "Buka Asset Desain GD"}
            >
              <ExternalLink className="w-2.5 h-2.5" />
              <span>Asset GD</span>
            </a>
          )}

          {/* Render Output Link Button */}
          {mt.link_motion && (
            <a
              href={sanitizeUrl(mt.link_motion)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[9px] font-semibold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              title="Buka Output Video / Render"
            >
              <Film className="w-2.5 h-2.5" />
              <span>Render</span>
              <ExternalLink className="w-2 h-2 ml-0.5" />
            </a>
          )}
        </div>

        {/* ============================================================
            MOTION BRIEF & OBJECTIVE IMAGE PREVIEW BANNER
            ============================================================ */}
        {primaryBriefImage && (
          <div className="mb-2.5 overflow-hidden rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] relative group/preview shadow-2xs">
            <div className="relative w-full h-28 sm:h-32 bg-black/10 dark:bg-black/30 flex items-center justify-center overflow-hidden">
              <img
                src={primaryBriefImage.url.startsWith('http') || primaryBriefImage.url.startsWith('/') ? primaryBriefImage.url : `/${primaryBriefImage.url}`}
                alt={primaryBriefImage.name || 'Motion Brief Preview'}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 pointer-events-none"
                draggable={false}
                loading="lazy"
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />

              {/* Centered Video / Teaser Icon (matching user's reference image!) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/45 backdrop-blur-xs flex items-center justify-center text-white border border-white/20 shadow-md group-hover:scale-110 group-hover:bg-pink-600/70 transition-all">
                  <Play className="w-3.5 h-3.5 fill-white translate-x-0.5" />
                </div>
              </div>

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
            LEVEL 2: TIMELINE SECTION (DUE DATE & SLA / TARGET)
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
                <span className="text-[10px] font-semibold text-emerald-400">
                  {mt.status_motion === 'COMPLETED' ? 'Completed' : 'Approved'}
                </span>
                {mt.studio && (
                  <span className="text-[8.5px] font-semibold px-1 py-0.2 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
                    {mt.studio}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1.5 text-xs">
              {/* Target Date */}
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

              {/* SLA / Target */}
              <div className="shrink-0 text-[10.5px]">
                <span className={`font-medium ${slaInfo.isWarning ? 'text-rose-500 font-bold' : slaInfo.isCalculated ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>
                  {mt.parentTask ? slaInfo.text : mt.period_end ? `End: ${formatDisplayDate(mt.period_end)}` : 'Standard SLA'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================
            LEVEL 3: PEOPLE SECTION (AE & MOTION PIC INLINE)
            ============================================================ */}
        <div className="pt-1.5 border-t border-[var(--border-secondary)] flex items-center justify-between gap-1.5 text-xs">
          {/* AE (Requester) */}
          <div className="flex items-center gap-1 min-w-0" title={`Requester: ${mt.parentTask?.created_by_name || 'AE'}`}>
            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)]">AE:</span>
            <span className="text-[10.5px] font-medium text-[var(--text-secondary)] truncate max-w-[90px]">
              {mt.parentTask?.created_by_name || 'AE'}
            </span>
          </div>

          {/* Motion PIC */}
          <div className="flex items-center gap-1 shrink-0">
            {picUser?.full_name ? (
              <div className="flex items-center gap-1" title={`Motion PIC: ${picUser.full_name}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <div className="w-4 h-4 rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center justify-center text-[7.5px] font-bold shrink-0">
                  {getInitials(picUser.full_name)}
                </div>
                <span className="text-[10.5px] font-semibold text-[var(--text-primary)] truncate max-w-[80px]">
                  {picUser.full_name}
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
          {/* Edit Standalone */}
          {isLeadOrAdmin && isStandalone && (
            <button
              onClick={() => onEdit?.(mt.id)}
              className="btn-ghost text-[11px] py-1 px-2 text-[var(--text-secondary)] flex items-center gap-1"
            >
              <Edit2 className="w-3 h-3" /> Edit
            </button>
          )}

          {/* Assign PIC */}
          {mt.status_motion === 'QUEUED' && isLeadOrAdmin && (
            <button
              onClick={() => onAssign?.(mt.id)}
              className="btn-ghost text-[11px] py-1 px-2 text-blue-400 font-medium flex items-center gap-1"
              title={mt.motion_pic_id ? 'Edit PIC Assignment' : 'Assign Motion PIC'}
            >
              <User className="w-3 h-3" /> {mt.motion_pic_id ? 'Edit PIC' : 'Assign PIC'}
            </button>
          )}

          {/* Start Work */}
          {mt.status_motion === 'QUEUED' && mt.motion_pic_id && (isUserMotionPic || isLeadOrAdmin) && (
            <button
              onClick={() => onStatusChange?.(mt.id, 'IN_PROGRESS')}
              className="btn-ghost text-[11px] py-1 px-2 text-cyan-400 font-medium flex items-center gap-1"
            >
              <Play className="w-3 h-3" /> Start
            </button>
          )}

          {/* Submit */}
          {(mt.status_motion === 'IN_PROGRESS' || mt.status_motion === 'REVISION') && (isUserMotionPic || isLeadOrAdmin) && (
            <button
              onClick={() => onSubmit?.(mt.id)}
              className="btn-ghost text-[11px] py-1 px-2 text-emerald-400 font-medium flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" /> Submit
            </button>
          )}

          {/* Revision */}
          {mt.status_motion === 'SUBMITTED' && isReviewer && (
            <button
              onClick={() => onRevision?.(mt.id)}
              className="btn-ghost text-[11px] py-1 px-2 text-amber-400 font-medium flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Revisi
            </button>
          )}

          {/* Approve */}
          {mt.status_motion === 'SUBMITTED' && isReviewer && (
            <button
              onClick={() => onStatusChange?.(mt.id, 'APPROVED')}
              className="btn-ghost text-[11px] py-1 px-2 text-emerald-400 font-medium flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" /> Approve
            </button>
          )}

          {/* Handover / Complete */}
          {mt.status_motion === 'APPROVED' && isLeadOrAdmin && (
            <button
              onClick={() => onHandover?.(mt.id)}
              className="btn-ghost text-[11px] py-1 px-2 text-cyan-400 font-medium flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" /> Handover
            </button>
          )}

          {/* Undo Status */}
          {prevUndoStatus && (
            <button
              onClick={() => onUndo?.(mt.id, prevUndoStatus!)}
              className="btn-ghost text-[11px] py-1 px-2 ml-auto text-rose-400 hover:bg-rose-500/10 flex items-center gap-1"
              title="Rollback ke status sebelumnya"
            >
              <Undo2 className="w-3 h-3" /> Undo
            </button>
          )}
        </div>
      )}

      {/* Archive / Restore Footer */}
      {(isArchive || mt.is_archived) && (
        <div className="mt-2.5 pt-2 border-t border-[var(--border-secondary)] flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
            Arsip Motion ({mt.archive_period || 'Selesai'})
          </span>
          {user && canUserRestoreTask(user.role_name, user.id, mt) && onRestore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestore(mt.id);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all shadow-sm"
              title="Pulihkan motion task dari arsip ke board Motion aktif"
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
