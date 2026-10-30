// ============================================================
// CMOS - Centralized Pipeline Routing Engine
// Four Independent Pipelines:
// 1. STRATEGIC: Creative strategic briefs & decks
// 2. GD_MOCKUP: Design mockup workflow (linked with Strategic & Motion)
// 3. GD_NON_MOCKUP: Standalone Graphic Design & E-Commerce (PDP, Banners, Promo)
// 4. MOTION: Manual handoff queue for approved GD Mockup and GD E-Commerce tasks
// ============================================================

import {
  CreativeTask,
  PipelineType,
  RoleName,
  StratStatus,
  DesignStatus,
  MotionReadiness,
  TaskWithRelations
} from './types';

/**
 * Checks whether a task is classified as a Mockup task.
 * Criteria:
 * - Explicit `is_mockup === true`
 * - content_type_id === 1 ('Mockup Set')
 * - Content type name or campaign name contains 'mockup' (case-insensitive)
 */
export function isMockupTask(task: {
  is_mockup?: boolean;
  content_type_id?: number;
  content_type_name?: string;
  campaign_name?: string;
}): boolean {
  if (task.is_mockup === true) return true;
  if (task.is_mockup === false) return false;
  if (task.content_type_id === 1) return true;
  if (task.content_type_name && task.content_type_name.toLowerCase().includes('mockup')) {
    return true;
  }
  return false;
}

/**
 * Determines the target / current pipeline for a given task.
 * Centralized business logic:
 * 1. Strategic tasks (pipeline_type === 'STRATEGIC' or requires_strategic_concept === true)
 *    belong to STRATEGIC pipeline end-to-end (independent workflow).
 * 2. If pipeline_type is explicitly set (e.g. GD_MOCKUP, GD_NON_MOCKUP), respect it.
 * 3. GD Mockup if isMockupTask is true, else GD Non-Mockup / E-commerce.
 */
export function determineTaskPipeline(task: {
  requires_strategic_concept?: boolean;
  status_strat?: StratStatus;
  is_mockup?: boolean;
  content_type_id?: number;
  content_type_name?: string;
  campaign_name?: string;
  pipeline_type?: PipelineType;
  task_source?: string;
}): PipelineType {
  // Strategic pipeline is an end-to-end independent workflow
  if (task.pipeline_type === 'STRATEGIC' || task.requires_strategic_concept) {
    return 'STRATEGIC';
  }

  if (task.pipeline_type) {
    return task.pipeline_type;
  }

  if (task.task_source === 'ECOMMERCE') {
    return 'GD_NON_MOCKUP';
  }

  if (task.task_source === 'ORCA') {
    return 'GD_MOCKUP';
  }

  const isMockup = isMockupTask(task);
  if (isMockup) {
    return 'GD_MOCKUP';
  }

  return 'GD_NON_MOCKUP';
}

/**
 * Checks whether an approved design-pipeline task may be forwarded to Motion.
 */
export function canForwardToMotion(task: {
  status_design?: DesignStatus;
  pipeline_type?: PipelineType;
  requires_strategic_concept?: boolean;
  is_mockup?: boolean;
  content_type_id?: number;
  content_type_name?: string;
  campaign_name?: string;
}): boolean {
  if (task.status_design !== 'DESIGN_APPROVED') return false;
  const pipeline = determineTaskPipeline(task);
  return pipeline === 'GD_MOCKUP' || pipeline === 'GD_NON_MOCKUP';
}

/**
 * Checks whether an approved and explicitly forwarded design task is in Motion.
 */
export function canTransitionToMotion(task: {
  status_design?: DesignStatus;
  motion_readiness?: MotionReadiness;
  pipeline_type?: PipelineType;
  requires_strategic_concept?: boolean;
  is_mockup?: boolean;
  content_type_id?: number;
  content_type_name?: string;
  campaign_name?: string;
}): boolean {
  return canForwardToMotion(task) && task.motion_readiness === 'READY_TO_ANIMATE';
}

/**
 * Retained for callers that need to determine whether a mockup asset can be animated.
 * Request forwarding itself is manual and also supports GD E-Commerce tasks.
 */
export function qualifiesForMotionAutoHandover(task: {
  is_mockup?: boolean;
  content_type_id?: number;
  content_type_name?: string;
  campaign_name?: string;
  motion_readiness?: MotionReadiness;
  final_asset_link?: string | null;
}): boolean {
  if (!isMockupTask(task)) return false;
  if (task.motion_readiness === 'NOT_APPLICABLE') return false;
  return Boolean(task.final_asset_link && task.final_asset_link.trim() !== '');
}


/**
 * Validates permission for a user role to manage / take actions on a specific pipeline.
 */
export function canUserManagePipeline(pipeline: PipelineType, userRole?: RoleName): boolean {
  if (!userRole) return false;
  if (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(userRole)) return true;

  switch (pipeline) {
    case 'STRATEGIC':
      return userRole === 'STRATEGIC_PIC';
    case 'GD_MOCKUP':
    case 'GD_NON_MOCKUP':
      return userRole === 'DESIGNER';
    case 'MOTION':
      return userRole === 'MOTION_PIC';
    default:
      return false;
  }
}

/**
 * Validates whether a transition to a target pipeline is allowed by business rules.
 */
export function validatePipelineTransition(
  task: CreativeTask,
  targetPipeline: PipelineType,
  userRole?: RoleName
): { allowed: boolean; reason?: string } {
  // Check role authorization
  if (userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(userRole)) {
    const canManageTarget = targetPipeline === 'MOTION'
      ? userRole === 'DESIGNER'
      : canUserManagePipeline(targetPipeline, userRole);
    if (!canManageTarget) {
      return { allowed: false, reason: `Role ${userRole} tidak memiliki izin untuk memindahkan task ke pipeline ${targetPipeline}.` };
    }
  }

  switch (targetPipeline) {
    case 'STRATEGIC':
      if (!task.requires_strategic_concept && task.pipeline_type !== 'STRATEGIC') {
        return { allowed: false, reason: 'Task tidak memerlukan konsep strategis.' };
      }
      return { allowed: true };

    case 'GD_MOCKUP':
      if (task.pipeline_type === 'STRATEGIC' || task.requires_strategic_concept) {
        return { allowed: false, reason: 'Task Strategic tidak dapat dipindahkan ke GD Mockup karena merupakan workflow mandiri.' };
      }
      if (!isMockupTask(task)) {
        return { allowed: false, reason: 'Task ini bertipe non-mockup dan harus masuk ke pipeline GD Non-Mockup / E-commerce.' };
      }
      return { allowed: true };

    case 'GD_NON_MOCKUP':
      if (task.pipeline_type === 'STRATEGIC' || task.requires_strategic_concept) {
        return { allowed: false, reason: 'Task Strategic tidak dapat dipindahkan ke GD Non-Mockup karena merupakan workflow mandiri.' };
      }
      if (isMockupTask(task)) {
        return { allowed: false, reason: 'Task berbasis mockup harus diproses melalui pipeline GD Mockup.' };
      }
      return { allowed: true };

    case 'MOTION':
      if (!canForwardToMotion(task)) {
        return { allowed: false, reason: 'Task harus berasal dari pipeline desain dan berstatus Approved sebelum diteruskan ke Motion.' };
      }
      return { allowed: true };

    default:
      return { allowed: false, reason: 'Pipeline tujuan tidak dikenal.' };
  }
}

/**
 * Checks whether a user role has read-only access (can view but cannot edit or move cards) for a pipeline.
 */
export function isUserReadOnlyForPipeline(pipeline: PipelineType, userRole?: RoleName): boolean {
  if (!userRole) return true;
  if (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(userRole)) return false;
  return !canUserManagePipeline(pipeline, userRole);
}

/**
 * Checks whether a user role can view a specific pipeline.
 * All authenticated team members have cross-pipeline visibility for coordination.
 */
export function canUserViewPipeline(pipeline: PipelineType, userRole?: RoleName): boolean {
  if (!userRole) return false;
  return ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'DESIGNER', 'MOTION_PIC', 'REQUESTER', 'OPERATOR'].includes(userRole);
}

/**
 * Filter an array of tasks so each task cleanly belongs to ONE active pipeline board without duplicates.
 * Pipeline isolation rules:
 * - Strategic tasks stay strictly in STRATEGIC pipeline across entire lifecycle (independent workflow).
 * - GD Mockup tasks only show Mockup tasks (and exclude those handed over to active Motion).
 * - GD Non-Mockup / E-commerce tasks only show non-mockup tasks.
 * - Motion tasks show tasks with motion animation subtasks.
 */
export function filterTasksByPipeline(
  tasks: TaskWithRelations[],
  pipeline: PipelineType,
  options?: { includeArchived?: boolean }
): TaskWithRelations[] {
  return tasks.filter(t => {
    // Exclude archived tasks from active boards unless explicitly requested
    if (!options?.includeArchived && t.is_archived) {
      return false;
    }

    switch (pipeline) {
      case 'STRATEGIC': {
        // Belongs to active Strategic pipeline: independent workflow from brief to approval/done.
        // Once approved and handed over to GD (mockup or ecommerce), hide from the active Strategic board / Approved column.
        const isHandedOverToGD = Boolean(
          t.spawned_design_task_id ||
          tasks.some(st => st.source_strategic_task_id === t.id)
        );
        if (!options?.includeArchived && isHandedOverToGD) {
          return false;
        }
        return Boolean(t.pipeline_type === 'STRATEGIC' || (t.requires_strategic_concept && t.status_strat !== 'NOT_REQUIRED'));
      }

      case 'GD_MOCKUP':
        // Strategic tasks NEVER appear on GD Mockup board!
        if (t.pipeline_type === 'STRATEGIC' || t.requires_strategic_concept) return false;
        if (!isMockupTask(t)) return false;
        // Mockup pipeline ONLY allows Orca task source
        if (t.task_source && t.task_source !== 'ORCA') return false;
        // Approved tasks stay visible in the Approved column for manual forward to Motion.
        // Once forwarded to Motion (has motion_task or marked ready) AND design is approved, hide from active board.
        if (!options?.includeArchived && t.status_design === 'DESIGN_APPROVED' && (Boolean(t.motion_task) || t.motion_readiness === 'READY_TO_ANIMATE')) {
          return false;
        }
        return true;

      case 'GD_NON_MOCKUP':
        // Strategic tasks NEVER appear on GD Non-Mockup board!
        if (t.pipeline_type === 'STRATEGIC' || t.requires_strategic_concept) return false;
        // Mockup tasks belong to GD Mockup, not here
        if (isMockupTask(t)) return false;
        // E-Commerce pipeline ONLY allows E-Commerce task source
        if (t.task_source && t.task_source !== 'ECOMMERCE') return false;
        // Approved tasks stay visible for manual forward to Motion.
        // Once forwarded to Motion (has motion_task or marked ready) AND design is approved, hide from active board.
        if (!options?.includeArchived && t.status_design === 'DESIGN_APPROVED' && (Boolean(t.motion_task) || t.motion_readiness === 'READY_TO_ANIMATE')) {
          return false;
        }
        return true;

      case 'MOTION':
        // Belongs to Motion if it has a motion subtask
        if (!options?.includeArchived && t.motion_task?.is_archived) {
          return false;
        }
        return Boolean(t.motion_task);

      default:
        return false;
    }
  });
}

/**
 * Contextual data for evaluating whether a stage transition is permitted.
 */
export interface StageTransitionContext {
  hasPic?: boolean;
  hasSubmission?: boolean;
  userRole?: RoleName;
}

/**
 * Validates whether transitioning a card from currentStatus to targetStatus within a pipeline is allowed.
 * Business Rule:
 * Every request must strictly undergo all stages sequentially without skipping.
 * If any prerequisite stage or modal has not been completed, the transition is blocked.
 */
export function validateStageTransition(
  pipeline: PipelineType,
  currentStatus: string,
  targetStatus: string,
  context?: StageTransitionContext
): { allowed: boolean; reason?: string } {
  // Idempotent drop on the same column
  if (currentStatus === targetStatus) {
    return { allowed: true };
  }

  // 1. STRATEGIC PIPELINE: PENDING -> IN_PROGRESS -> REVIEW -> REVISION / APPROVED
  if (pipeline === 'STRATEGIC') {
    switch (targetStatus) {
      case 'STRAT_PENDING':
      case 'PENDING':
        // Rollback to Brief In permitted for Admin, Team Lead, AE, or Strategic
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat mengembalikan status ke Brief In.' };
        }
        return { allowed: true };

      case 'STRAT_IN_PROGRESS':
      case 'IN_PROGRESS':
        if (currentStatus === 'PENDING' || currentStatus === 'STRAT_PENDING') {
          if (context?.hasPic === false) {
            return { allowed: false, reason: 'Tahapan belum selesai: Tugaskan (Assign) Strategic PIC terlebih dahulu sebelum memulai pengerjaan strategi.' };
          }
          return { allowed: true };
        }
        // Rollback from REVIEW/REVISION/APPROVED
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat mengembalikan status ke In Progress.' };
        }
        return { allowed: true };

      case 'STRAT_REVIEW':
      case 'REVIEW':
        if (currentStatus === 'PENDING' || currentStatus === 'STRAT_PENDING') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Request pada tahap "Brief In" harus dimulai pengerjaannya ("In Progress") terlebih dahulu sebelum dapat di-submit.'
          };
        }
        if (
          currentStatus === 'IN_PROGRESS' || currentStatus === 'STRAT_IN_PROGRESS' ||
          currentStatus === 'REVISION' || currentStatus === 'STRAT_REVISION'
        ) {
          return { allowed: true };
        }
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat mengembalikan status ke Review.' };
        }
        return { allowed: true };

      case 'STRAT_REVISION':
      case 'REVISION':
        if (currentStatus !== 'REVIEW' && currentStatus !== 'STRAT_REVIEW') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Request harus melalui tahap "In Progress" dan telah di-submit (Submit) dengan melampirkan deck konsep sebelum dapat diminta revisi.'
          };
        }
        return { allowed: true };

      case 'APPROVED':
        if (currentStatus === 'PENDING' || currentStatus === 'STRAT_PENDING' || currentStatus === 'IN_PROGRESS' || currentStatus === 'STRAT_IN_PROGRESS') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Request harus melalui tahap "In Progress" dan telah di-submit (Submit) dengan melampirkan deck konsep sebelum dapat disetujui (Approved).'
          };
        }
        if (currentStatus === 'REVISION' || currentStatus === 'STRAT_REVISION') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Konsep dalam masa revisi harus di-submit ulang terlebih dahulu dengan melampirkan deck hasil revisi sebelum dapat disetujui.'
          };
        }
        if (currentStatus === 'REVIEW' || currentStatus === 'STRAT_REVIEW') {
          return { allowed: true };
        }
        return { allowed: false, reason: 'Request tidak dapat langsung disetujui dari status saat ini.' };

      default:
        return { allowed: false, reason: `Status tujuan "${targetStatus}" tidak dikenal dalam Strategic Pipeline.` };
    }
  }

  // 2 & 3. GD PIPELINES: UNASSIGNED -> ASSIGNED -> IN_PROGRESS -> SUBMITTED -> REVISION / APPROVED -> CLOSED
  if (pipeline === 'GD_MOCKUP' || pipeline === 'GD_NON_MOCKUP') {
    switch (targetStatus) {
      case 'DESIGN_UNASSIGNED':
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat memindahkan tiket ke Unassigned.' };
        }
        return { allowed: true };

      case 'DESIGN_ASSIGNED':
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat menetapkan PIC Desainer.' };
        }
        return { allowed: true };

      case 'DESIGN_IN_PROGRESS':
        if (currentStatus === 'DESIGN_UNASSIGNED' || context?.hasPic === false) {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Request harus di-assign terlebih dahulu kepada Graphic Designer dan menentukan tingkat kesulitan (difficulty).'
          };
        }
        if (currentStatus === 'DESIGN_ASSIGNED' || currentStatus === 'DESIGN_REVISION') {
          return { allowed: true };
        }
        // Rollback from SUBMITTED or APPROVED
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat mengembalikan status ke In Progress.' };
        }
        return { allowed: true };

      case 'DESIGN_SUBMITTED':
        if (currentStatus === 'DESIGN_UNASSIGNED' || currentStatus === 'DESIGN_ASSIGNED') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Request harus dimulai pengerjaannya ("In Progress") terlebih dahulu sebelum dapat di-submit.'
          };
        }
        if (currentStatus === 'DESIGN_IN_PROGRESS' || currentStatus === 'DESIGN_REVISION') {
          return { allowed: true };
        }
        // Rollback from APPROVED
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat mengembalikan status ke Submitted.' };
        }
        return { allowed: true };

      case 'DESIGN_REVISION':
        if (currentStatus !== 'DESIGN_SUBMITTED') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Desain harus melalui pengerjaan dan telah di-submit (Submitted) dengan melampirkan link asset sebelum dapat diajukan revisi.'
          };
        }
        return { allowed: true };

      case 'DESIGN_APPROVED':
        if (currentStatus === 'DESIGN_REVISION') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Desain dalam masa revisi harus di-submit ulang terlebih dahulu oleh desainer dengan melampirkan hasil revisi sebelum dapat di-approve.'
          };
        }
        if (currentStatus !== 'DESIGN_SUBMITTED') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Desain harus melalui tahapan pengerjaan dan telah di-submit (Submitted) dengan melampirkan link asset sebelum dapat di-approve.'
          };
        }
        return { allowed: true };

      case 'TASK_CLOSED':
        if (currentStatus !== 'DESIGN_APPROVED') {
          return { allowed: false, reason: 'Tahapan belum selesai: Hanya tiket yang sudah di-approve yang dapat di-close.' };
        }
        return { allowed: true };

      case 'STRAT_PENDING':
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat memindahkan ke Strategic Pending.' };
        }
        return { allowed: true };

      default:
        return { allowed: false, reason: `Status tujuan "${targetStatus}" tidak dikenal dalam Design Pipeline.` };
    }
  }

  // 4. MOTION PIPELINE: QUEUED -> IN_PROGRESS -> SUBMITTED -> REVISION / APPROVED -> COMPLETED
  if (pipeline === 'MOTION') {
    switch (targetStatus) {
      case 'QUEUED':
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat mengembalikan status ke Queued.' };
        }
        return { allowed: true };

      case 'IN_PROGRESS':
        if (currentStatus === 'QUEUED') {
          if (context?.hasPic === false) {
            return {
              allowed: false,
              reason: 'Tahapan belum selesai: Tugaskan (Assign) Motion PIC dan bobot kesulitan terlebih dahulu sebelum memulai pengerjaan motion.'
            };
          }
          return { allowed: true };
        }
        if (currentStatus === 'REVISION') {
          return { allowed: true };
        }
        // Rollback from SUBMITTED, APPROVED, COMPLETED
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat mengembalikan status ke In Progress.' };
        }
        return { allowed: true };

      case 'SUBMITTED':
        if (currentStatus === 'QUEUED') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Motion task pada tahap "Queued" harus dimulai pengerjaannya ("In Progress") terlebih dahulu sebelum dapat di-submit.'
          };
        }
        if (currentStatus === 'IN_PROGRESS' || currentStatus === 'REVISION') {
          return { allowed: true };
        }
        if (context?.userRole && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(context.userRole)) {
          return { allowed: false, reason: 'Hanya Admin, Team Lead, AE, atau Strategic yang dapat mengembalikan status ke Submitted.' };
        }
        return { allowed: true };

      case 'REVISION':
        if (currentStatus !== 'SUBMITTED') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Hasil render motion harus melalui tahap "In Progress" dan telah di-submit terlebih dahulu sebelum dapat diajukan revisi.'
          };
        }
        return { allowed: true };

      case 'APPROVED':
        if (currentStatus === 'REVISION') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Motion dalam masa revisi harus di-submit ulang terlebih dahulu dengan melampirkan link render sebelum dapat di-approve.'
          };
        }
        if (currentStatus !== 'SUBMITTED') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Hasil render motion harus melalui tahap "In Progress" dan telah di-submit terlebih dahulu sebelum dapat di-approve.'
          };
        }
        return { allowed: true };

      case 'COMPLETED':
        if (currentStatus !== 'APPROVED') {
          return {
            allowed: false,
            reason: 'Tahapan belum selesai: Motion task harus berstatus "Approved" terlebih dahulu sebelum dapat diselesaikan/handover ke Operator.'
          };
        }
        return { allowed: true };

      default:
        return { allowed: false, reason: `Status tujuan "${targetStatus}" tidak dikenal dalam Motion Pipeline.` };
    }
  }

  return { allowed: true };
}
