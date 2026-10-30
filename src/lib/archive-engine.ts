// ============================================================
// CMOS - Centralized Archive & Weekly Partition Engine
// Features:
// 1. Weekly Partition: W1 (1-7), W2 (8-14), W3 (15-21), W4 (22-end), No Due Date
// 2. Monthly Auto-Archive: Completed tasks from previous months
// 3. Revert / Restore: Role-based task restoration
// ============================================================

import {
  CreativeTask,
  MotionTask,
  PipelineType,
  RoleName,
  WeekPartitionInfo,
  WeekPartitionKey,
  User,
  DesignStatus,
  MotionStatus
} from './types';
import { MONTH_NAMES_SHORT, MONTH_NAMES_ID, isSameUserId } from './constants';
import { now, today } from './utils';

// ------------------------------------------------------------
// 1. WEEKLY PARTITION LOGIC
// ------------------------------------------------------------

/**
 * Categorize a task's due date into standard Weekly Partitions:
 * - W1: Day 1 - 7 of the month
 * - W2: Day 8 - 14 of the month
 * - W3: Day 15 - 21 of the month
 * - W4: Day 22 - last day of the month
 * - NO_DUE_DATE: Missing or invalid due date
 */
export function getDueWeekPartition(dueDateStr: string | null | undefined): WeekPartitionKey {
  if (!dueDateStr || typeof dueDateStr !== 'string' || dueDateStr.trim() === '') {
    return 'NO_DUE_DATE';
  }

  // Parse YYYY-MM-DD
  const cleanDate = dueDateStr.split('T')[0];
  const parts = cleanDate.split('-');
  if (parts.length < 3) return 'NO_DUE_DATE';

  const day = parseInt(parts[2], 10);
  if (isNaN(day) || day < 1 || day > 31) return 'NO_DUE_DATE';

  if (day >= 1 && day <= 7) return 'W1';
  if (day >= 8 && day <= 14) return 'W2';
  if (day >= 15 && day <= 21) return 'W3';
  return 'W4'; // 22 through end of month (28, 29, 30, 31)
}

/**
 * Returns partition definitions for a specific year and month.
 */
export function getWeeklyPartitionsForMonth(year: number, month: number): WeekPartitionInfo[] {
  const safeYear = year || new Date().getFullYear();
  const safeMonth = month >= 1 && month <= 12 ? month : (new Date().getMonth() + 1);
  const daysInMonth = new Date(safeYear, safeMonth, 0).getDate();
  const monthShort = MONTH_NAMES_SHORT[safeMonth - 1] || '';

  return [
    {
      key: 'W1',
      label: 'W1',
      title: `W1 (1 - 7 ${monthShort})`,
      startDay: 1,
      endDay: 7,
      dateRange: `1 - 7 ${monthShort}`
    },
    {
      key: 'W2',
      label: 'W2',
      title: `W2 (8 - 14 ${monthShort})`,
      startDay: 8,
      endDay: 14,
      dateRange: `8 - 14 ${monthShort}`
    },
    {
      key: 'W3',
      label: 'W3',
      title: `W3 (15 - 21 ${monthShort})`,
      startDay: 15,
      endDay: 21,
      dateRange: `15 - 21 ${monthShort}`
    },
    {
      key: 'W4',
      label: 'W4',
      title: `W4 (22 - ${daysInMonth} ${monthShort})`,
      startDay: 22,
      endDay: daysInMonth,
      dateRange: `22 - ${daysInMonth} ${monthShort}`
    },
    {
      key: 'NO_DUE_DATE',
      label: 'No Due Date',
      title: 'Tanpa Tenggat Waktu',
      dateRange: 'Tidak Ditentukan'
    }
  ];
}

/**
 * Groups a collection of tasks into Weekly Partition buckets based on their `due_date`.
 */
export function groupTasksByWeeklyPartition<T extends { due_date?: string | null }>(
  tasks: T[]
): Record<WeekPartitionKey, T[]> {
  const result: Record<WeekPartitionKey, T[]> = {
    W1: [],
    W2: [],
    W3: [],
    W4: [],
    NO_DUE_DATE: []
  };

  for (const t of tasks) {
    const partition = getDueWeekPartition(t.due_date);
    result[partition].push(t);
  }

  return result;
}

/**
 * Determines if a task is overdue relative to a reference date (default today).
 */
export function isTaskOverdue(
  dueDateStr: string | null | undefined,
  status: string,
  referenceDateStr?: string
): boolean {
  if (!dueDateStr) return false;
  // Final completed states are not overdue
  if (['TASK_CLOSED', 'COMPLETED', 'DESIGN_APPROVED'].includes(status)) return false;

  const ref = referenceDateStr || today();
  const due = dueDateStr.split('T')[0];
  return due < ref;
}

// ------------------------------------------------------------
// 2. MONTHLY AUTO-ARCHIVE LOGIC
// ------------------------------------------------------------

/**
 * Extracts the actual completion date of a creative or motion task.
 */
export function getTaskCompletionDate(
  task: CreativeTask | MotionTask
): string | null {
  if ('status_design' in task) {
    // CreativeTask
    return task.approved_at || task.submission_date || task.updated_at || null;
  }
  // MotionTask
  return task.apply_date || task.approved_at || task.updated_at || null;
}

/**
 * Check if the completion date falls in a PREVIOUS month relative to reference date.
 */
export function isCompletedInPreviousMonth(
  completionDateStr: string | null | undefined,
  referenceDate?: Date
): boolean {
  if (!completionDateStr) return false;

  const compDate = new Date(completionDateStr);
  if (isNaN(compDate.getTime())) return false;

  const ref = referenceDate || new Date();
  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth() + 1; // 1-12

  const compYear = compDate.getFullYear();
  const compMonth = compDate.getMonth() + 1;

  if (compYear < refYear) return true;
  if (compYear === refYear && compMonth < refMonth) return true;
  return false;
}

/**
 * Checks if a task is in a final completed state.
 * - CreativeTask: TASK_CLOSED
 * - MotionTask: COMPLETED
 */
export function isTaskInFinalState(task: CreativeTask | MotionTask): boolean {
  if ('status_design' in task) {
    return task.status_design === 'TASK_CLOSED';
  }
  if ('status_motion' in task) {
    return task.status_motion === 'COMPLETED';
  }
  return false;
}

/**
 * Validates whether a task qualifies for Monthly Auto-Archive:
 * 1. Must not already be archived (`!task.is_archived`).
 * 2. Must be in final state (`TASK_CLOSED` or `COMPLETED`).
 * 3. Must NOT be an active/in-progress/revision/postpone/cancel task.
 * 4. Completion date must belong to a PREVIOUS month relative to reference date.
 */
export function qualifiesForAutoArchive(
  task: CreativeTask | MotionTask,
  referenceDate?: Date
): boolean {
  if (task.is_archived === true) return false;
  if (!isTaskInFinalState(task)) return false;

  const completionDate = getTaskCompletionDate(task);
  if (!completionDate) return false;

  return isCompletedInPreviousMonth(completionDate, referenceDate);
}

/**
 * Computes the archive period string ('YYYY-MM') for a given completion date.
 */
export function computeArchivePeriod(dateStr: string | null | undefined): string {
  if (!dateStr) return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ------------------------------------------------------------
// 3. REVERT / RESTORE AUTHORIZATION & RULES
// ------------------------------------------------------------

/**
 * Validates whether a user role is permitted to restore an archived task.
 * Rules:
 * - ADMIN & TEAM_LEAD: Full restore rights across all pipelines.
 * - DESIGNER: Can restore creative tasks assigned to them (`design_pic_id === user.id`).
 * - STRATEGIC_PIC: Can restore strategic creative tasks assigned to them (`strat_pic_id === user.id` or in `strat_pic_ids`).
 * - REQUESTER: Can restore creative tasks created by them (`created_by === user.id`) and motion tasks linked to their creative tasks.
 * - MOTION_PIC: Can restore motion tasks assigned to them (`motion_pic_id === user.id`).
 * - Others / Read-Only / Operators: Denied.
 */
export function canUserRestoreTask(
  userRole: RoleName,
  userId: string,
  task: CreativeTask | MotionTask
): boolean {
  if (['ADMIN', 'TEAM_LEAD'].includes(userRole)) return true;

  if ('status_design' in task) {
    // CreativeTask
    if (userRole === 'DESIGNER' && isSameUserId(task.design_pic_id, userId)) return true;
    if (userRole === 'STRATEGIC_PIC' && (isSameUserId(task.strat_pic_id, userId) || (task.strat_pic_ids && task.strat_pic_ids.some(id => isSameUserId(id, userId))))) return true;
    if (userRole === 'REQUESTER' && isSameUserId(task.created_by, userId)) return true;
    return false;
  }

  if ('status_motion' in task) {
    // MotionTask
    if (userRole === 'MOTION_PIC' && isSameUserId(task.motion_pic_id, userId)) return true;
    let parentTask = (task as any).parentTask as CreativeTask | undefined;
    if (!parentTask && task.task_id) {
      try {
        const { getTasks } = require('./store');
        parentTask = getTasks().find((t: any) => t.id === task.task_id);
      } catch {
        // ignore
      }
    }
    if (userRole === 'REQUESTER' && (isSameUserId(parentTask?.created_by, userId) || isSameUserId((task as any).created_by, userId))) return true;
    if (userRole === 'STRATEGIC_PIC' && (isSameUserId(parentTask?.strat_pic_id, userId) || (parentTask?.strat_pic_ids && parentTask.strat_pic_ids.some(id => isSameUserId(id, userId))))) return true;
    if (userRole === 'DESIGNER' && isSameUserId(parentTask?.design_pic_id, userId)) return true;
    return false;
  }

  return false;
}


