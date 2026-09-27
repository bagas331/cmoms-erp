// ============================================================
// CMOMS - Constants & Configuration
// ============================================================

import { DesignDifficulty, DesignStatus, MotionDifficulty, MotionStatus, OperationalExcellence, ReasonCategory, RoleName, StratStatus, TaskSource } from './types';

// --- DIFFICULTY POINT WEIGHTS ---
export const DIFFICULTY_WEIGHTS: Record<DesignDifficulty, number> = {
  LOW: 2.5,
  MEDIUM: 3.5,
  HIGH: 4.5,
};

export const MOTION_DIFFICULTY_WEIGHTS: Record<MotionDifficulty, number> = {
  LVL_1_SIMPLE: 2.0,
  LVL_2_MEDIUM: 3.0,
  LVL_3_ADVANCED: 4.0,
  LVL_4_PERIOD: 5.0,
};

// --- STATUS LABELS ---
export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
  DRAFT: 'Draft',
  STRAT_PENDING: 'Strategic Pending',
  DESIGN_UNASSIGNED: 'Unassigned',
  DESIGN_ASSIGNED: 'Assigned',
  DESIGN_IN_PROGRESS: 'In Progress',
  DESIGN_SUBMITTED: 'Submitted',
  DESIGN_REVISION: 'Revision',
  DESIGN_APPROVED: 'Approved',
  TASK_CLOSED: 'Closed',
};

export const DESIGN_STATUS_COLORS: Record<DesignStatus, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  STRAT_PENDING: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  DESIGN_UNASSIGNED: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  DESIGN_ASSIGNED: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  DESIGN_IN_PROGRESS: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  DESIGN_SUBMITTED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  DESIGN_REVISION: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  DESIGN_APPROVED: 'bg-green-500/20 text-green-300 border-green-500/30',
  TASK_CLOSED: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export const MOTION_STATUS_LABELS: Record<MotionStatus, string> = {
  QUEUED: 'Queued',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  REVISION: 'Revision',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
};

export const MOTION_STATUS_COLORS: Record<MotionStatus, string> = {
  QUEUED: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  IN_PROGRESS: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  SUBMITTED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  REVISION: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  APPROVED: 'bg-green-500/20 text-green-300 border-green-500/30',
  COMPLETED: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export const STRAT_STATUS_LABELS: Record<StratStatus, string> = {
  NOT_REQUIRED: 'Not Required',
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  REVIEW: 'Review',
  APPROVED: 'Approved',
};

export const EXCELLENCE_LABELS: Record<OperationalExcellence, string> = {
  EXCELLENCE: 'Excellence',
  GOOD: 'Good',
  BAD: 'Bad',
};

export const EXCELLENCE_COLORS: Record<OperationalExcellence, string> = {
  EXCELLENCE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  GOOD: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  BAD: 'bg-red-500/20 text-red-300 border-red-500/30',
};

export const DIFFICULTY_LABELS: Record<DesignDifficulty, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const DIFFICULTY_COLORS: Record<DesignDifficulty, string> = {
  LOW: 'bg-green-500/20 text-green-300 border-green-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  HIGH: 'bg-red-500/20 text-red-300 border-red-500/30',
};

export const MOTION_DIFFICULTY_LABELS: Record<MotionDifficulty, string> = {
  LVL_1_SIMPLE: 'LVL 1 - Simple',
  LVL_2_MEDIUM: 'LVL 2 - Medium',
  LVL_3_ADVANCED: 'LVL 3 - Advanced',
  LVL_4_PERIOD: 'LVL 4 - Period',
};

export const SOURCE_LABELS: Record<TaskSource, string> = {
  ORCA: 'Orca',
  ECOMMERCE: 'E-Commerce',
};

export const REASON_LABELS: Record<ReasonCategory, string> = {
  CLIENT_CHANGE: 'Client Change Request',
  BRIEF_MISMATCH: 'Brief Mismatch',
  TYPO: 'Typo / Error',
  QUALITY_ISSUE: 'Quality Issue',
  SCOPE_CHANGE: 'Scope Change',
  OTHER: 'Other',
};

export const ROLE_LABELS: Record<RoleName, string> = {
  ADMIN: 'Admin',
  TEAM_LEAD: 'Team Lead',
  STRATEGIC_PIC: 'Strategic PIC',
  DESIGNER: 'Graphic Designer',
  MOTION_PIC: 'Motion Designer',
  REQUESTER: 'Requester',
  OPERATOR: 'Operator',
};

export const ROLE_COLORS: Record<RoleName, string> = {
  ADMIN: 'bg-red-500/20 text-red-300 border-red-500/30',
  TEAM_LEAD: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  STRATEGIC_PIC: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  DESIGNER: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  MOTION_PIC: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  REQUESTER: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  OPERATOR: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

// --- KANBAN COLUMNS ---
export const DESIGN_KANBAN_COLUMNS: { status: DesignStatus; label: string; color: string }[] = [
  { status: 'STRAT_PENDING', label: 'Strat Pending', color: '#a855f7' },
  { status: 'DESIGN_UNASSIGNED', label: 'Unassigned', color: '#f97316' },
  { status: 'DESIGN_ASSIGNED', label: 'Assigned', color: '#3b82f6' },
  { status: 'DESIGN_IN_PROGRESS', label: 'In Progress', color: '#06b6d4' },
  { status: 'DESIGN_SUBMITTED', label: 'Submitted', color: '#10b981' },
  { status: 'DESIGN_REVISION', label: 'Revision', color: '#f59e0b' },
  { status: 'DESIGN_APPROVED', label: 'Approved', color: '#22c55e' },
];

export const MOTION_KANBAN_COLUMNS: { status: MotionStatus; label: string; color: string }[] = [
  { status: 'QUEUED', label: 'Queued', color: '#f97316' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: '#06b6d4' },
  { status: 'SUBMITTED', label: 'Submitted', color: '#10b981' },
  { status: 'REVISION', label: 'Revision', color: '#f59e0b' },
  { status: 'APPROVED', label: 'Approved', color: '#22c55e' },
  { status: 'COMPLETED', label: 'Completed (Handover)', color: '#64748b' },
];

// --- CAPACITY DEFAULTS ---
export const DEFAULT_CAPACITY_STAFF = 7.0;
export const DEFAULT_CAPACITY_INTERN = 5.0;
export const MAX_CAPACITY_MONTHLY_STAFF = 140;
export const MAX_CAPACITY_MONTHLY_INTERN = 100;
