// ============================================================
// CMOS - Task Status & Lifecycle Single Source of Truth
// ============================================================

import { CreativeTask, MotionTask, TaskWithRelations } from './types';

/**
 * Checks whether a task is archived.
 */
export function isTaskArchived(task: CreativeTask | TaskWithRelations | MotionTask | any): boolean {
  if (!task) return false;
  return Boolean(task.is_archived);
}

/**
 * Checks whether a motion task is archived.
 */
export function isMotionArchived(motion: MotionTask | any): boolean {
  return isTaskArchived(motion);
}

/**
 * Checks whether a creative task is postponed or cancelled.
 */
export function isTaskPostponedOrCancelled(task: CreativeTask | TaskWithRelations | any): boolean {
  if (!task) return false;
  const status = String(task.status_design || '').toUpperCase();
  const stratStatus = String(task.status_strat || '').toUpperCase();
  return (
    status === 'DESIGN_POSTPONE' ||
    status === 'DESIGN_CANCEL' ||
    status === 'POSTPONE' ||
    status === 'CANCEL' ||
    stratStatus === 'POSTPONE' ||
    stratStatus === 'CANCEL' ||
    Boolean(task.is_postponed) ||
    Boolean(task.is_cancelled)
  );
}

/**
 * Checks whether a creative task is completed/approved.
 */
export function isTaskDone(task: CreativeTask | TaskWithRelations | any): boolean {
  if (!task) return false;
  if (isTaskPostponedOrCancelled(task)) return false;
  const status = String(task.status_design || '').toUpperCase();
  const stratStatus = String(task.status_strat || '').toUpperCase();

  // Active statuses take precedence over legacy approved_at timestamps
  const activeStatuses = [
    'IN_PROGRESS',
    'DESIGN_ASSIGNED',
    'DESIGN_REVISION',
    'REVISION',
    'QUEUED',
    'UNASSIGNED',
    'SUBMITTED',
    'STRAT_IN_PROGRESS',
    'STRAT_REVISION',
    'STRAT_ASSIGNED'
  ];
  if (activeStatuses.includes(status) || activeStatuses.includes(stratStatus)) {
    return false;
  }

  return (
    status === 'DESIGN_APPROVED' ||
    status === 'TASK_CLOSED' ||
    status === 'APPROVED' ||
    status === 'COMPLETED' ||
    stratStatus === 'APPROVED' ||
    Boolean(task.approved_at)
  );
}

/**
 * Checks whether a creative task is an active request in progress.
 * Active = Not archived, Not postponed/cancelled, Not completed/approved.
 */
export function isTaskActive(task: CreativeTask | TaskWithRelations | any): boolean {
  if (!task) return false;
  if (isTaskArchived(task)) return false;
  if (isTaskPostponedOrCancelled(task)) return false;
  if (isTaskDone(task)) return false;
  return true;
}

/**
 * Checks whether a motion task is postponed or cancelled.
 */
export function isMotionPostponedOrCancelled(motion: MotionTask | any): boolean {
  if (!motion) return false;
  const status = String(motion.status_motion || '').toUpperCase();
  return (
    status === 'CANCEL' ||
    status === 'POSTPONE' ||
    Boolean(motion.is_postponed) ||
    Boolean(motion.is_cancelled)
  );
}

/**
 * Checks whether a motion task is completed/approved.
 */
export function isMotionDone(motion: MotionTask | any): boolean {
  if (!motion) return false;
  if (isMotionPostponedOrCancelled(motion)) return false;
  const status = String(motion.status_motion || '').toUpperCase();
  if (['QUEUED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION'].includes(status)) {
    return false;
  }
  return status === 'APPROVED' || status === 'COMPLETED' || Boolean(motion.approved_at);
}

/**
 * Checks whether a motion task is an active request in progress.
 */
export function isMotionActive(motion: MotionTask | any): boolean {
  if (!motion) return false;
  if (isTaskArchived(motion)) return false;
  if (isMotionPostponedOrCancelled(motion)) return false;
  if (isMotionDone(motion)) return false;
  return ['QUEUED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION'].includes(String(motion.status_motion || '').toUpperCase());
}

/**
 * Determines which week partition a date falls into (1-7: W1, 8-14: W2, 15-21: W3, 22+: W4).
 */
export function getWeekKeyFromDate(dateStr: string | null | undefined): 'W1' | 'W2' | 'W3' | 'W4' | null {
  if (!dateStr) return null;
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = clean.split('-');
  if (parts.length < 3) return null;
  const day = parseInt(parts[2], 10);
  if (isNaN(day)) return null;

  if (day >= 1 && day <= 7) return 'W1';
  if (day >= 8 && day <= 14) return 'W2';
  if (day >= 15 && day <= 21) return 'W3';
  return 'W4';
}

/**
 * Evaluates whether a date matches the specified period filter (year, month, week, or date range).
 */
export function matchesPeriod(
  dateStr: string | null | undefined,
  filter: {
    year?: string;
    month?: string;
    week?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): boolean {
  if (!dateStr) return true;
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = clean.split('-');
  if (parts.length < 3) return true;

  const y = parts[0];
  const m = parts[1];

  if (filter.dateFrom && filter.dateTo) {
    if (clean < filter.dateFrom || clean > filter.dateTo) return false;
  }

  if (filter.year && filter.year !== 'all' && y !== filter.year) {
    return false;
  }

  if (filter.month && filter.month !== 'all' && m !== filter.month) {
    return false;
  }

  if (filter.week && filter.week !== 'all') {
    const wk = getWeekKeyFromDate(dateStr);
    if (wk !== filter.week) return false;
  }

  return true;
}
