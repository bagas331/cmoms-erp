// ============================================================
// CMOS - Creative & Motion Operations System
// Core TypeScript Type Definitions
// ============================================================

// --- ENUMS & CONSTANTS ---

export type RoleName = 'ADMIN' | 'TEAM_LEAD' | 'STRATEGIC_PIC' | 'DESIGNER' | 'MOTION_PIC' | 'REQUESTER' | 'OPERATOR';

export type CampaignName = 'BAU' | 'DD' | 'PAYDAY' | 'SPECIAL CAMPAIGN';

export type ClientType = 'INTERNAL' | 'EXTERNAL';

export type TaskSource = 'ORCA' | 'ECOMMERCE';

export type Platform = 'TIKTOK' | 'SHOPEE' | 'TOKOPEDIA' | 'LAZADA' | 'OTHER';

export type PipelineType = 'STRATEGIC' | 'GD_MOCKUP' | 'GD_NON_MOCKUP' | 'MOTION';

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
  | 'TASK_CLOSED'
  | 'DESIGN_POSTPONE'
  | 'DESIGN_CANCEL';

export type StratStatus = 'NOT_REQUIRED' | 'PENDING' | 'IN_PROGRESS' | 'REVIEW' | 'REVISION' | 'APPROVED';

export type MotionReadiness = 'NOT_APPLICABLE' | 'WAITING_ASSET_GD' | 'READY_TO_ANIMATE' | 'RENDERING';

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
  | 'REVISION_REQUEST'
  | 'AUTO_HANDOVER'
  | 'HANDOVER_TO_GD'
  | 'SUBMIT_STRAT_CONCEPT'
  | 'AUTO_ARCHIVE'
  | 'RESTORE';

export type WeekPartitionKey = 'W1' | 'W2' | 'W3' | 'W4' | 'NO_DUE_DATE';

export interface WeekPartitionInfo {
  key: WeekPartitionKey;
  label: string;
  title: string;
  startDay?: number;
  endDay?: number;
  dateRange: string;
}

export type MotionColumnType = 'STATUS' | 'WEEK';

export interface MotionBoardColumn {
  id: string;
  type: MotionColumnType;
  status?: MotionStatus;
  weekKey?: WeekPartitionKey;
  label: string;
  subLabel?: string;
  color: string;
  dateRange?: string;
  description?: string;
}


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
  is_cuti_bersama?: boolean;
  is_official?: boolean;
  year?: number;
}

export type AttachmentSection = 'brief' | 'detail';

export interface TaskAttachment {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string; // 'image/jpeg' | 'image/png' | 'image/webp'
  section: AttachmentSection;
  uploaded_at: string;
  uploaded_by?: string;
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
  pipeline_type?: PipelineType;
  is_mockup?: boolean;
  notes: string;
  attachments?: TaskAttachment[];
  is_archived?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_period?: string | null;
  archive_reason?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
  spawned_design_task_id?: string | null;
  source_strategic_task_id?: string | null;
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
  campaign_type?: CampaignName | 'BaU' | 'PayDay' | 'DD' | 'Special' | string;
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
  due_date?: string | null;
  link_motion: string | null;
  approved_at?: string | null;
  notes: string;
  attachments?: TaskAttachment[];
  is_archived?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_period?: string | null;
  archive_reason?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
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
  asset_name?: string | null;
  asset_link?: string | null;
  submitted_by?: string | null;
  submitted_at?: string | null;
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
  active_pipeline?: PipelineType;
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
  campaign_name: CampaignName | string;
  content_type_id: number;
  task_source: TaskSource;
  platform: Platform;
  req_qty: number;
  req_date: string;
  due_date: string;
  requires_strategic_concept: boolean;
  strat_pic_id?: string;
  strat_pic_ids?: string[];
  design_pic_id?: string | null;
  pipeline_type?: PipelineType;
  is_mockup?: boolean;
  notes: string;
  attachments?: TaskAttachment[];
}

export interface AssignTaskInput {
  design_pic_id?: string;
  design_difficulty?: DesignDifficulty;
  strat_pic_id?: string;
  strat_pic_ids?: string[];
}

export interface HandoverStrategicToGDInput {
  design_pic_id: string;
  design_difficulty?: DesignDifficulty;
  target_pipeline?: PipelineType;
  due_date?: string;
  handover_notes?: string;
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

// --- CAMPAIGN USAGE MANAGEMENT TYPES ---

export interface CampaignDesignRecord {
  id: string;
  monthRequest: string;
  reqDate: string; // DD/MM/YYYY
  brand: string;
  campaign: string;
  withStrategic: string;
  stratPIC: string;
  designPIC: string;
  typeOfContent: string;
  taksSource: string; // 'Ecommerce' | 'Orca' | string
  reqQty: string;
  outputQty: string;
  dueDate: string; // DD/MM/YYYY
  submissionDate: string; // DD/MM/YYYY
  workingDay: string;
  operationalExcellence: 'Excellence' | 'Good' | 'Bad' | string;
  designDifficulty: 'Low' | 'Medium' | 'High' | string;
  stratRevision: string;
  statusStrat: string;
  designRevision: string;
  statusDesign: string;
  finalAssetName: string;
  motionPIC: string;
  typeOfCampaign: string;
  applyDate: string;
  motionDifficulty: string;
  motionRevision: string;
  statusMotion: string;
  linkMotion: string;
  remark: string;
}

export interface CampaignMotionRecord {
  id: string;
  namaAset: string;
  brand: string;
  platform: string;
  tipe: string;
  complexity?: string;
  typeOfCampaign: string; // Kampanye (DD, BaU, PayDay, etc.)
  bulan: string;
  tanggalProduksi?: string;
  periodeMulai: string;
  periodeSelesai: string;
  jamTayang: string;
  statusMotion: string; // Status Mockup (Ready, Done, On Progress, Waiting, Blocked)
  motionPIC: string;
  motionDifficulty?: string;
  revisiTipe?: string;
  tanggalRevisi?: string;
  picRevisi?: string;
  linkMotion: string; // Link File (Google Drive URL or direct link)
  qcPic?: string;
  catatan: string;
  studio: string;
  activeStatus?: 'active' | 'upcoming' | 'ended' | 'unknown';
}

export type CampaignTabType = 'by-design' | 'by-strategic' | 'by-motion';

export interface CampaignUsageApiResponse {
  success: boolean;
  message: string;
  source: 'live' | 'cached' | 'fallback';
  lastSyncedAt: string;
  totalRecordsDesign: number;
  totalRecordsMotion: number;
  summary: {
    excellence: number;
    good: number;
    bad: number;
    unclassified: number;
  };
  designRecords: CampaignDesignRecord[];
  motionRecords: CampaignMotionRecord[];
  metadata?: {
    spreadsheetId: string;
    tabName: string;
    cacheExpiresAt?: string;
  };
  error?: string;
}

// --- GOOGLE SHEETS REAL-TIME SYNC OUTBOX TYPES ---

export type SyncOutboxStatus = 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED';
export type SyncEventType = 'CREATE_TASK' | 'UPDATE_TASK' | 'CREATE_MOTION' | 'UPDATE_MOTION';
export type SyncTargetTab = 'Mockup' | 'By Strategic' | 'Motion';

export interface GoogleSheetsSyncOutboxItem {
  id: string;
  idempotency_key: string;
  event_type: SyncEventType;
  entity_id: string;
  task_code: string;
  target_tab: SyncTargetTab;
  payload: Record<string, unknown>;
  status: SyncOutboxStatus;
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  synced_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncOutboxSummary {
  total: number;
  synced: number;
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
}

// --- WEEKLY ISSUES & CHALLENGES REPORTING TYPES ---

export type IssueCategory =
  | 'CAMPAIGN'
  | 'BRIEF_MISMATCH'
  | 'ASSET_DELAY'
  | 'REVISION_OVERFLOW'
  | 'FAILED'
  | 'POSTPONE'
  | 'RESOURCE'
  | 'CLIENT_REQUEST'
  | 'OTHER'
  | 'AMAN';

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IssueStatus = 'AMAN' | 'ACTIVE' | 'RESOLVED';

export interface WeeklyIssue {
  id: string;
  year: number;
  month: number;
  week: 'W1' | 'W2' | 'W3' | 'W4' | 'W5';
  title: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: IssueStatus;
  description: string;
  affected_pipeline: 'ALL' | 'STRATEGIC' | 'GD_MOCKUP' | 'GD_NON_MOCKUP' | 'MOTION';
  related_task_code?: string | null;
  reported_by?: string;
  reported_by_name?: string;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWeeklyIssueInput {
  year: number;
  month: number;
  week: 'W1' | 'W2' | 'W3' | 'W4' | 'W5';
  title: string;
  category: IssueCategory;
  severity?: IssueSeverity;
  status?: IssueStatus;
  description: string;
  affected_pipeline?: 'ALL' | 'STRATEGIC' | 'GD_MOCKUP' | 'GD_NON_MOCKUP' | 'MOTION';
  related_task_code?: string | null;
  reported_by?: string;
  reported_by_name?: string;
}



