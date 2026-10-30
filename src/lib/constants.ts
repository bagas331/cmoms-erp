// ============================================================
// CMOS - Constants & Configuration
// ============================================================

import { DesignDifficulty, DesignStatus, MotionDifficulty, MotionStatus, OperationalExcellence, PipelineType, ReasonCategory, RoleName, StratStatus, TaskSource, WeekPartitionKey } from './types';

// --- CAMPAIGN NAMES ---
export const CAMPAIGN_NAMES = ['BAU', 'DD', 'PAYDAY', 'SPECIAL CAMPAIGN'] as const;
export type CampaignName = typeof CAMPAIGN_NAMES[number];

export function isValidCampaignName(name?: string | null): name is CampaignName {
  if (!name) return false;
  return (CAMPAIGN_NAMES as readonly string[]).includes(name.trim().toUpperCase());
}

export function normalizeCampaignName(raw?: string | null): CampaignName | string {
  if (!raw) return 'BAU';
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (upper === 'BAU') return 'BAU';
  if (upper === 'DD' || upper === 'DOUBLE DATE' || upper === 'DOUBLE DATE (DD)') return 'DD';
  if (upper === 'PAYDAY' || upper === 'PAY DAY') return 'PAYDAY';
  if (upper === 'SPECIAL' || upper === 'SPECIAL CAMPAIGN') return 'SPECIAL CAMPAIGN';
  if (/\bBAU\b/i.test(trimmed)) return 'BAU';
  if (/\bPAYDAY\b/i.test(trimmed)) return 'PAYDAY';
  if (/\b(DOUBLE DATE|DD)\b/i.test(trimmed)) return 'DD';
  if (/\bSPECIAL\b/i.test(trimmed)) return 'SPECIAL CAMPAIGN';
  return raw; // preserve legacy value safely
}

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
  DESIGN_POSTPONE: 'Postpone',
  DESIGN_CANCEL: 'Cancel',
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
  DESIGN_POSTPONE: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  DESIGN_CANCEL: 'bg-red-500/20 text-red-400 border-red-500/30',
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
  REVIEW: 'Submit',
  REVISION: 'Revision',
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
  STRATEGIC_PIC: 'Strategic (Creative Strategic)',
  DESIGNER: 'GD (Graphic Designer)',
  MOTION_PIC: 'Motion (Motion Designer)',
  REQUESTER: 'AE (Account Executive)',
  OPERATOR: 'OP (Operator)',
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  ADMIN: 'System Administrator: Akses penuh ke konfigurasi sistem, master data, manajemen user & audit log.',
  TEAM_LEAD: 'Creative Director / Team Lead: Triage brief, assign tugas, review & approval kualitas, serta manajemen beban tim.',
  STRATEGIC_PIC: 'Strategic (Creative Strategic): Mengembangkan konsep visual, ideasi ilustrasi, mockup background (2 periode / 2 opsi), dan tagging AE.',
  DESIGNER: 'GD (Graphic Designer): Quality check konsep bersama OP, produksi desain grafis statis, penyerahan aset ke Motion, dan piket campaign (DD/PD).',
  MOTION_PIC: 'Motion (Motion Designer): Produksi animasi & motion graphic, kompilasi link preview harian (cut-off 13.00 & 17.00), dan serah terima ke OP.',
  REQUESTER: 'AE (Account Executive): Inisiasi brief & Trello card tgl 20, follow-up promo brand tgl 27, submit hasil ke Brand, dan update approval tim.',
  OPERATOR: 'OP (Operator / Tim Live): Quality check awal konsep bersama GD, Operator Last Checkpoint (pukul 23.00), dan operasional live streaming.',
};

export const ROLE_COLORS: Record<RoleName, string> = {
  ADMIN: 'bg-red-500/20 text-red-400 border-red-500/30',
  TEAM_LEAD: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  STRATEGIC_PIC: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  DESIGNER: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  MOTION_PIC: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  REQUESTER: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  OPERATOR: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

// --- PIPELINE LABELS & COLORS ---
export const PIPELINE_LABELS: Record<PipelineType, string> = {
  STRATEGIC: 'Strategic Pipeline',
  GD_MOCKUP: 'GD Mockup Pipeline',
  GD_NON_MOCKUP: 'GD E-Commerce Pipeline',
  MOTION: 'Motion Pipeline',
};

export const PIPELINE_COLORS: Record<PipelineType, string> = {
  STRATEGIC: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  GD_MOCKUP: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  GD_NON_MOCKUP: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  MOTION: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
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

export type StrategicKanbanStatus =
  | 'STRAT_PENDING'
  | 'STRAT_IN_PROGRESS'
  | 'STRAT_REVIEW'
  | 'STRAT_REVISION'
  | 'APPROVED';

export const STRATEGIC_KANBAN_COLUMNS: { status: StrategicKanbanStatus; label: string; color: string }[] = [
  { status: 'STRAT_PENDING', label: 'Brief In', color: '#a855f7' },
  { status: 'STRAT_IN_PROGRESS', label: 'In Progress', color: '#06b6d4' },
  { status: 'STRAT_REVIEW', label: 'Submit', color: '#3b82f6' },
  { status: 'STRAT_REVISION', label: 'Revision', color: '#f59e0b' },
  { status: 'APPROVED', label: 'Approved', color: '#22c55e' },
];

export const GD_MOCKUP_KANBAN_COLUMNS: { status: DesignStatus; label: string; color: string }[] = [
  { status: 'DESIGN_UNASSIGNED', label: 'Unassigned', color: '#f97316' },
  { status: 'DESIGN_ASSIGNED', label: 'Assigned', color: '#3b82f6' },
  { status: 'DESIGN_IN_PROGRESS', label: 'In Progress', color: '#06b6d4' },
  { status: 'DESIGN_SUBMITTED', label: 'Submitted', color: '#10b981' },
  { status: 'DESIGN_REVISION', label: 'Revision', color: '#f59e0b' },
  { status: 'DESIGN_APPROVED', label: 'Approve', color: '#22c55e' },
];

export const GD_NON_MOCKUP_KANBAN_COLUMNS: { status: DesignStatus; label: string; color: string }[] = [
  { status: 'DESIGN_UNASSIGNED', label: 'Unassigned', color: '#f97316' },
  { status: 'DESIGN_ASSIGNED', label: 'Assigned', color: '#3b82f6' },
  { status: 'DESIGN_IN_PROGRESS', label: 'In Progress', color: '#06b6d4' },
  { status: 'DESIGN_SUBMITTED', label: 'Submitted', color: '#10b981' },
  { status: 'DESIGN_REVISION', label: 'Revision', color: '#f59e0b' },
  { status: 'DESIGN_APPROVED', label: 'Approve', color: '#22c55e' },
];

export const MOTION_KANBAN_COLUMNS: {
  status: MotionStatus | WeekPartitionKey | string;
  label: string;
  color: string;
  isWeekly?: boolean;
  dateRange?: string;
}[] = [
  { status: 'QUEUED', label: 'Queued', color: '#f97316' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: '#06b6d4' },
  { status: 'SUBMITTED', label: 'Submitted', color: '#10b981' },
  { status: 'REVISION', label: 'Revision', color: '#f59e0b' },
  { status: 'APPROVED', label: 'Approved', color: '#22c55e' },
  { status: 'W1', label: 'Week 1 (Tgl 1 - 7)', color: '#a855f7', isWeekly: true, dateRange: 'Tgl 1 - 7' },
  { status: 'W2', label: 'Week 2 (Tgl 8 - 14)', color: '#8b5cf6', isWeekly: true, dateRange: 'Tgl 8 - 14' },
  { status: 'W3', label: 'Week 3 (Tgl 15 - 21)', color: '#6366f1', isWeekly: true, dateRange: 'Tgl 15 - 21' },
  { status: 'W4', label: 'Week 4 (Tgl 22 - Akhir)', color: '#ec4899', isWeekly: true, dateRange: 'Tgl 22 - Akhir' },
];

export const MOTION_FLOW_COLUMNS: { status: MotionStatus; label: string; color: string }[] = [
  { status: 'QUEUED', label: 'Queued', color: '#f97316' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: '#06b6d4' },
  { status: 'SUBMITTED', label: 'Submitted', color: '#10b981' },
  { status: 'REVISION', label: 'Revision', color: '#f59e0b' },
  { status: 'APPROVED', label: 'Approved', color: '#22c55e' },
];

export const MOTION_WEEKLY_COLUMNS: { weekKey: 'W1' | 'W2' | 'W3' | 'W4'; label: string; dateRange: string; color: string }[] = [
  { weekKey: 'W1', label: 'Week 1', dateRange: 'Tgl 1 - 7', color: '#6366f1' },
  { weekKey: 'W2', label: 'Week 2', dateRange: 'Tgl 8 - 14', color: '#8b5cf6' },
  { weekKey: 'W3', label: 'Week 3', dateRange: 'Tgl 15 - 21', color: '#ec4899' },
  { weekKey: 'W4', label: 'Week 4', dateRange: 'Tgl 22 - Akhir', color: '#f43f5e' },
];

// --- CAPACITY DEFAULTS ---
export const DEFAULT_CAPACITY_STAFF = 7.0;
export const DEFAULT_CAPACITY_INTERN = 5.0;
export const MAX_CAPACITY_MONTHLY_STAFF = 140;
export const MAX_CAPACITY_MONTHLY_INTERN = 100;

export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
] as const;

export const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
] as const;

// --- SEED USER UUID MAPPINGS & NORMALIZATION ---
export const SEED_UUID_REVERSE_MAP: Record<string, string> = {
  '00000000-0000-0000-0000-000000000001': 'u-admin-001',
  '00000000-0000-0000-0000-000000000002': 'u-lead-alfie',
  '00000000-0000-0000-0000-000000000003': 'u-strat-ira',
  '00000000-0000-0000-0000-000000000004': 'u-strat-mahes',
  '00000000-0000-0000-0000-000000000005': 'u-des-nadya',
  '00000000-0000-0000-0000-000000000006': 'u-des-yusuf',
  '00000000-0000-0000-0000-000000000007': 'u-des-bad',
  '00000000-0000-0000-0000-000000000008': 'u-mot-jova',
  '00000000-0000-0000-0000-000000000009': 'u-mot-bima',
  '00000000-0000-0000-0000-000000000010': 'u-req-sarah',
  '00000000-0000-0000-0000-000000000011': 'u-req-reza',
  '00000000-0000-0000-0000-000000000012': 'u-op-sam',
};

export const SEED_ID_TO_UUID_MAP: Record<string, string> = {
  'u-admin-001': '00000000-0000-0000-0000-000000000001',
  'u-lead-alfie': '00000000-0000-0000-0000-000000000002',
  'u-strat-ira': '00000000-0000-0000-0000-000000000003',
  'u-strat-mahes': '00000000-0000-0000-0000-000000000004',
  'u-des-nadya': '00000000-0000-0000-0000-000000000005',
  'u-des-yusuf': '00000000-0000-0000-0000-000000000006',
  'u-des-bad': '00000000-0000-0000-0000-000000000007',
  'u-mot-jova': '00000000-0000-0000-0000-000000000008',
  'u-mot-bima': '00000000-0000-0000-0000-000000000009',
  'u-req-sarah': '00000000-0000-0000-0000-000000000010',
  'u-req-reza': '00000000-0000-0000-0000-000000000011',
  'u-op-sam': '00000000-0000-0000-0000-000000000012',
};

export function normalizeUserId(id?: string | null): string {
  if (!id) return '';
  const clean = String(id).trim();
  const lower = clean.toLowerCase();
  return SEED_UUID_REVERSE_MAP[clean] || SEED_UUID_REVERSE_MAP[lower] || clean;
}

export function isSameUserId(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const cleanA = String(a).trim();
  const cleanB = String(b).trim();
  if (cleanA.toLowerCase() === cleanB.toLowerCase()) return true;
  const normA = normalizeUserId(cleanA).toLowerCase();
  const normB = normalizeUserId(cleanB).toLowerCase();
  return normA === normB;
}

