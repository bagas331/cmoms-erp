// ============================================================
// CMOMS - Creative & Motion Operations Management System
// Core TypeScript Type Definitions
// ============================================================

// --- ENUMS & CONSTANTS ---

export type RoleName = 'ADMIN' | 'TEAM_LEAD' | 'STRATEGIC_PIC' | 'DESIGNER' | 'MOTION_PIC' | 'REQUESTER' | 'OPERATOR';

export type ClientType = 'INTERNAL' | 'EXTERNAL';

export type TaskSource = 'ORCA' | 'ECOMMERCE';

export type Platform = 'TIKTOK' | 'SHOPEE' | 'TOKOPEDIA' | 'LAZADA' | 'OTHER';

export type DesignDifficulty = 'LOW' | 'MEDIUM' | 'HIGH';

export type MotionDifficulty = 'LVL_1_SIMPLE' | 'LVL_2_MEDIUM' | 'LVL_3_ADVANCED' | 'LVL_4_PERIOD';

export type OperationalExcellence = 'EXCELLENCE' | 'GOOD' | 'BAD';

export type DesignStatus =
  | 'DRAFT'
  | 'STRAT_PENDING'
  | 'DESIGN_UNASSIGNED'
  | 'DESIGN_ASSIGNED'
  | 'DESIGN_IN_PROGRESS'
  | 'DESIGN_SUBMITTED'
  | 'DESIGN_REVISION'
  | 'DESIGN_APPROVED'
  | 'TASK_CLOSED';

export type StratStatus = 'NOT_REQUIRED' | 'PENDING' | 'IN_PROGRESS' | 'REVIEW' | 'REVISION' | 'APPROVED';

export type MotionReadiness = 'WAITING_ASSET_GD' | 'READY_TO_ANIMATE' | 'RENDERING';

export type MotionStatus = 'QUEUED' | 'IN_PROGRESS' | 'SUBMITTED' | 'REVISION' | 'APPROVED' | 'COMPLETED';

export type RevisionStage = 'STRATEGIC' | 'DESIGN' | 'MOTION';

export type ReasonCategory = 'CLIENT_CHANGE' | 'BRIEF_MISMATCH' | 'TYPO' | 'QUALITY_ISSUE' | 'SCOPE_CHANGE' | 'OTHER';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'STATUS_TRANSITION'
  | 'ASSIGN'
  | 'REASSIGN'
  | 'SUBMIT'
  | 'APPROVE'
  | 'REVISION_REQUEST';

// --- DATA MODELS ---

export interface Role {
  id: number;
  name: RoleName;
  label: string;
  description: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  avatar_initials: string;
  role_id: number;
  role_name: RoleName;
  daily_capacity_points: number;
  is_active: boolean;
  is_registered?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;
  name: string;
  client_type: ClientType;
  is_active: boolean;
  created_at: string;
}

export interface ContentType {
  id: number;
  name: string;
  default_difficulty: DesignDifficulty;
  created_at: string;
}

export interface Holiday {
  id?: number | string;
  holiday_date: string; // YYYY-MM-DD
  description: string;
}

export interface CreativeTask {
  id: string;
  task_code: string; // REQ-YYYY-XXXX
  client_id: number;
  campaign_name: string;
  content_type_id: number;
  task_source: TaskSource;
  platform: Platform;
  req_qty: number;
  output_qty: number;
  req_date: string; // YYYY-MM-DD
  due_date: string;
  submission_date: string | null;
  sla_working_days: number | null;
  operational_excellence: OperationalExcellence | null;
  requires_strategic_concept: boolean;
  strat_pic_id: string | null;
  strat_pic_ids?: string[] | null;
  status_strat: StratStatus;
  strat_revision_count: number;
  strat_concept_name?: string | null;
  strat_concept_link?: string | null;
  strat_submitted_at?: string | null;
  design_pic_id: string | null;
  design_difficulty: DesignDifficulty | null;
  design_revision_count: number;
  status_design: DesignStatus;
  motion_readiness: MotionReadiness;
  final_asset_name: string | null;
  final_asset_link: string | null;
  operator_id: string | null;
  approved_at?: string | null;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW' | string | null;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MotionTask {
  id: string;
  task_id: string | null; // FK to creative_tasks, null if standalone
  
  // Standalone fields (when task_id is null)
  client_id?: number;
  platform?: 'TIKTOK' | 'SHOPEE' | 'TOKOPEDIA' | 'LAZADA' | 'OTHER';
  motion_type?: string;
  campaign_type?: 'BaU' | 'PayDay' | 'DD' | 'Special' | string;
  production_date?: string;
  period_start?: string;
  period_end?: string;
  studio?: 'Jakarta' | 'Bandung';
  operator_id?: string | null;

  motion_pic_id: string | null;
  motion_difficulty: MotionDifficulty;
  motion_revision_count: number;
  status_motion: MotionStatus;
  apply_date: string | null;
  link_motion: string | null;
  approved_at?: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}


export interface TaskComment {
  id: string;
  task_id: string;
  request_id?: string;
  user_id: string;
  sender_id?: string;
  user_name: string;
  sender_name?: string;
  user_avatar: string;
  user_role?: RoleName;
  content: string;
  message?: string;
  attachment_url?: string | null;
  attachment_type?: 'image' | 'video' | 'file' | null;
  attachment_name?: string | null;
  is_edited?: boolean;
  edited_at?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  read_by?: string[];
  created_at: string;
}

export interface TaskRevision {
  id: string;
  task_id: string;
  stage: RevisionStage;
  revision_number: number;
  reason_category: ReasonCategory;
  notes: string;
  requested_by: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  entity_name: string;
  entity_id: string;
  action: AuditAction;
  performed_by: string;
  performer_name: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  timestamp: string;
}

export type NotificationType =
  | 'NEW_MESSAGE'
  | 'REQUEST_STATUS_UPDATED'
  | 'REQUEST_ASSIGNED'
  | 'REQUEST_REASSIGNED'
  | 'REQUEST_SUBMITTED'
  | 'REQUEST_REVISION'
  | 'REQUEST_APPROVED'
  | 'REQUEST_CLOSED'
  | 'MOTION_STATUS_UPDATED'
  | 'MOTION_ASSIGNED'
  | 'MOTION_SUBMITTED'
  | 'MOTION_REVISION'
  | 'MOTION_APPROVED'
  | 'MOTION_COMPLETED'
  | 'SYSTEM_ALERT';

export interface Notification {
  id: string;
  user_id: string;
  recipient_user_id?: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  notification_type?: NotificationType | string;
  read: boolean;
  is_read?: boolean;
  read_at?: string | null;
  link?: string;
  request_id?: string;
  task_id?: string;
  sender_id?: string;
  actor_user_id?: string;
  sender_name?: string;
  old_status?: string | null;
  new_status?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

// --- VIEW MODELS (for UI display) ---

export interface TaskWithRelations extends CreativeTask {
  client_name: string;
  client_type: ClientType;
  content_type_name: string;
  design_pic_name: string | null;
  strat_pic_name: string | null;
  strat_pic_names?: string[] | null;
  strat_pic_ids?: string[] | null;
  created_by_name: string;
  motion_task?: MotionTask | null;
  motion_pic_name?: string | null;
  operator_name: string | null;
  revisions: TaskRevision[];
  comments?: TaskComment[];
}

export interface DesignerWorkload {
  designer_id: string;
  designer_name: string;
  role_name: RoleName;
  active_tasks_count: number;
  accumulated_points: number;
  daily_capacity: number;
  occupancy_rate: number; // percentage
  tasks: {
    task_code: string;
    campaign_name: string;
    difficulty: DesignDifficulty | null;
    points: number;
    status: DesignStatus;
    due_date: string;
  }[];
}

export interface SLAReport {
  total_tasks: number;
  excellence_count: number;
  good_count: number;
  bad_count: number;
  excellence_rate: number;
  good_rate: number;
  bad_rate: number;
  by_brand: {
    brand_name: string;
    total: number;
    excellence: number;
    good: number;
    bad: number;
  }[];
  by_month: {
    month: string;
    total: number;
    excellence: number;
    good: number;
    bad: number;
  }[];
}

export interface DashboardStats {
  active_tasks: number;
  unassigned_tasks: number;
  in_progress_tasks: number;
  submitted_tasks: number;
  completed_tasks: number;
  motion_queue: number;
  sla_compliance_rate: number;
  total_tasks_this_month: number;
  approaching_deadline: TaskWithRelations[];
  overdue_tasks: TaskWithRelations[];
}

// --- FORM TYPES ---

export interface CreateTaskInput {
  client_id: number;
  campaign_name: string;
  content_type_id: number;
  task_source: TaskSource;
  platform: Platform;
  req_qty: number;
  req_date: string;
  due_date: string;
  requires_strategic_concept: boolean;
  strat_pic_id?: string;
  strat_pic_ids?: string[];
  notes: string;
}

export interface AssignTaskInput {
  design_pic_id?: string;
  design_difficulty?: DesignDifficulty;
  strat_pic_id?: string;
  strat_pic_ids?: string[];
}

export interface SubmitTaskInput {
  output_qty: number;
  final_asset_name: string;
  final_asset_link: string;
}

export interface SubmitStrategicInput {
  strat_concept_name?: string;
  strat_concept_link?: string;
  strat_link?: string;
  notes?: string;
}

export interface RevisionInput {
  stage: RevisionStage;
  reason_category: ReasonCategory;
  notes: string;
}

