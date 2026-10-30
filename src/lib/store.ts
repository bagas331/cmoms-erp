// ============================================================
// CMOMS - Data Store (localStorage-based)
// ============================================================

import {
  TaskComment,
  AuditLog, Client, ContentType, CreativeTask, Holiday,
  MotionTask, Notification, Role, TaskRevision, User,
  TaskWithRelations, DesignerWorkload, DashboardStats,
  CreateTaskInput, AssignTaskInput, HandoverStrategicToGDInput, SubmitTaskInput, RevisionInput,
  DesignStatus, MotionStatus, AuditAction, StratStatus, SubmitStrategicInput, MotionDifficulty, RoleName, DesignDifficulty,
  NotificationType, PipelineType, CampaignName, TaskAttachment,
  WeeklyIssue, CreateWeeklyIssueInput
} from './types';

import {
  SEED_ROLES, SEED_USERS, SEED_CLIENTS, SEED_CONTENT_TYPES,
  SEED_HOLIDAYS, SEED_TASKS, SEED_MOTION_TASKS, SEED_REVISIONS,
  SEED_AUDIT_LOGS, SEED_NOTIFICATIONS,
} from './seed-data';
import { DIFFICULTY_WEIGHTS, ROLE_LABELS, DESIGN_STATUS_LABELS, MOTION_STATUS_LABELS, CAMPAIGN_NAMES, isValidCampaignName, normalizeCampaignName, SEED_UUID_REVERSE_MAP, SEED_ID_TO_UUID_MAP, normalizeUserId, isSameUserId } from './constants';
import { calculateBusinessDays, evaluateOperationalExcellence, formatDate } from './sla-engine';
import { generateUUID, generateTaskCode, now, getCurrentYear, safeJsonParse, sanitizeUrl, sanitizeChatMessage, validateChatAttachment, sanitizeChatMediaUrl } from './utils';
import { determineTaskPipeline, isMockupTask, canForwardToMotion, canTransitionToMotion } from './pipeline-router';
import {
  qualifiesForAutoArchive,
  getTaskCompletionDate,
  computeArchivePeriod,
  canUserRestoreTask
} from './archive-engine';
import {
  enqueueGoogleSheetsSync,
  buildTaskSyncPayload,
  buildMotionTaskSyncPayload
} from './google-sheets-outbox';

export const STORE_KEYS = {
  roles: 'cmoms_roles',
  users: 'cmoms_users',
  clients: 'cmoms_clients',
  contentTypes: 'cmoms_content_types',
  holidays: 'cmoms_holidays',
  tasks: 'cmoms_tasks',
  motionTasks: 'cmoms_motion_tasks',
  revisions: 'cmoms_revisions',
  auditLogs: 'cmoms_audit_logs',
  notifications: 'cmoms_notifications',
  comments: 'cmoms_comments',
  taskSequence: 'cmoms_task_sequence',
  weeklyIssues: 'cmoms_weekly_issues',
  initialized: 'cmoms_initialized',
};

// --- HELPERS ---
const memoryStore = new Map<string, string>();

export function getStore<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') {
    const data = memoryStore.get(key);
    if (!data) {
      const cloned = JSON.parse(JSON.stringify(fallback));
      memoryStore.set(key, JSON.stringify(cloned));
      return cloned;
    }
    return safeJsonParse<T[]>(data, fallback);
  }
  const data = localStorage.getItem(key);
  if (!data) return fallback;
  return safeJsonParse<T[]>(data, fallback);
}

export function setStore<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') {
    memoryStore.set(key, JSON.stringify(data));
    return;
  }
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('store_changed'));
}

function getSequence(): number {
  let stored = 0;
  if (typeof window === 'undefined') {
    stored = parseInt(memoryStore.get(STORE_KEYS.taskSequence) || '0', 10);
  } else {
    stored = parseInt(localStorage.getItem(STORE_KEYS.taskSequence) || '0', 10);
  }
  try {
    const tasks = getTasks();
    const currentYear = getCurrentYear();
    const prefix = `REQ-${currentYear}-`;
    for (const t of tasks) {
      if (t.task_code && t.task_code.startsWith(prefix)) {
        const num = parseInt(t.task_code.slice(prefix.length), 10);
        if (!isNaN(num) && num > stored) {
          stored = num;
        }
      }
    }
  } catch {}
  return stored;
}

function setSequence(seq: number): void {
  if (typeof window === 'undefined') {
    memoryStore.set(STORE_KEYS.taskSequence, String(seq));
    return;
  }
  localStorage.setItem(STORE_KEYS.taskSequence, String(seq));
}

// --- INITIALIZATION ---
export function initializeStore(): void {
  if (typeof window === 'undefined') return;
  const initialized = localStorage.getItem(STORE_KEYS.initialized);
  if (initialized === 'true') return;

  setStore(STORE_KEYS.roles, SEED_ROLES);
  setStore(STORE_KEYS.users, SEED_USERS);
  setStore(STORE_KEYS.clients, SEED_CLIENTS);
  setStore(STORE_KEYS.contentTypes, SEED_CONTENT_TYPES);
  setStore(STORE_KEYS.holidays, SEED_HOLIDAYS);
  setStore(STORE_KEYS.tasks, []);
  setStore(STORE_KEYS.motionTasks, []);
  setStore(STORE_KEYS.revisions, []);
  setStore(STORE_KEYS.auditLogs, []);
  setStore(STORE_KEYS.notifications, []);
  setSequence(0);
  localStorage.setItem(STORE_KEYS.initialized, 'true');
}

export function clearAllRequests(): void {
  if (typeof window === 'undefined') {
    memoryStore.set(STORE_KEYS.tasks, '[]');
    memoryStore.set(STORE_KEYS.motionTasks, '[]');
    memoryStore.set(STORE_KEYS.revisions, '[]');
    memoryStore.set(STORE_KEYS.comments, '[]');
    memoryStore.set(STORE_KEYS.auditLogs, '[]');
    memoryStore.set(STORE_KEYS.notifications, '[]');
    memoryStore.set(STORE_KEYS.taskSequence, '0');
    return;
  }
  setStore(STORE_KEYS.tasks, []);
  setStore(STORE_KEYS.motionTasks, []);
  setStore(STORE_KEYS.revisions, []);
  setStore(STORE_KEYS.comments, []);
  setStore(STORE_KEYS.auditLogs, []);
  setStore(STORE_KEYS.notifications, []);
  setSequence(0);
}

export function resetStore(): void {
  if (typeof window === 'undefined') {
    memoryStore.clear();
    setStore(STORE_KEYS.roles, JSON.parse(JSON.stringify(SEED_ROLES)));
    setStore(STORE_KEYS.users, JSON.parse(JSON.stringify(SEED_USERS)));
    setStore(STORE_KEYS.clients, JSON.parse(JSON.stringify(SEED_CLIENTS)));
    setStore(STORE_KEYS.contentTypes, JSON.parse(JSON.stringify(SEED_CONTENT_TYPES)));
    setStore(STORE_KEYS.holidays, JSON.parse(JSON.stringify(SEED_HOLIDAYS)));
    setStore(STORE_KEYS.tasks, JSON.parse(JSON.stringify(SEED_TASKS)));
    setStore(STORE_KEYS.motionTasks, JSON.parse(JSON.stringify(SEED_MOTION_TASKS)));
    setStore(STORE_KEYS.revisions, JSON.parse(JSON.stringify(SEED_REVISIONS)));
    setStore(STORE_KEYS.auditLogs, JSON.parse(JSON.stringify(SEED_AUDIT_LOGS)));
    setStore(STORE_KEYS.notifications, JSON.parse(JSON.stringify(SEED_NOTIFICATIONS)));
    setSequence(36);
    return;
  }
  Object.values(STORE_KEYS).forEach(key => localStorage.removeItem(key));
  initializeStore();
}

// --- GETTERS ---
export function getRoles(): Role[] { return getStore<Role>(STORE_KEYS.roles, SEED_ROLES); }
export function getUsers(): User[] { return getStore<User>(STORE_KEYS.users, SEED_USERS); }
export function getClients(): Client[] { return getStore<Client>(STORE_KEYS.clients, SEED_CLIENTS); }
export function getContentTypes(): ContentType[] { return getStore<ContentType>(STORE_KEYS.contentTypes, SEED_CONTENT_TYPES); }
export function getHolidays(): Holiday[] { return getStore<Holiday>(STORE_KEYS.holidays, SEED_HOLIDAYS); }
export function getTasks(): CreativeTask[] { return getStore<CreativeTask>(STORE_KEYS.tasks, []); }
export function getMotionTasks(): MotionTask[] { return getStore<MotionTask>(STORE_KEYS.motionTasks, []); }
export function getRevisions(): TaskRevision[] { return getStore<TaskRevision>(STORE_KEYS.revisions, []); }
export function getAuditLogs(): AuditLog[] { return getStore<AuditLog>(STORE_KEYS.auditLogs, SEED_AUDIT_LOGS); }
export function getComments(): TaskComment[] { return getStore<TaskComment>(STORE_KEYS.comments, []); }
export function getNotifications(): Notification[] { 
  const allNotifs = getStore<Notification>(STORE_KEYS.notifications, SEED_NOTIFICATIONS);
  const nowTime = new Date().getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  
  const validNotifs = allNotifs.filter(n => {
    const notifTime = new Date(n.created_at).getTime();
    return (nowTime - notifTime) <= twentyFourHours;
  });

  if (validNotifs.length !== allNotifs.length) {
    setStore(STORE_KEYS.notifications, validNotifs);
  }

  return validNotifs;
}

export function getUserById(id: string): User | undefined {
  if (!id) return undefined;
  const cleanId = String(id).trim();
  const lowerId = cleanId.toLowerCase();
  const users = getUsers();

  // 1. Direct match by exact or case-insensitive ID
  let match = users.find(u => u.id === cleanId || u.id.toLowerCase() === lowerId);
  if (match) return match;

  // 2. Deterministic UUID reverse mapping (Supabase UUID -> Seed User ID)
  const mappedSeedId = SEED_UUID_REVERSE_MAP[cleanId] || SEED_UUID_REVERSE_MAP[lowerId];
  if (mappedSeedId) {
    match = users.find(u => u.id === mappedSeedId || u.id.toLowerCase() === mappedSeedId.toLowerCase());
    if (match) return match;
  }

  // 3. Inverse mapping (Seed User ID -> Supabase UUID)
  const mappedUuid = SEED_ID_TO_UUID_MAP[cleanId] || SEED_ID_TO_UUID_MAP[lowerId];
  if (mappedUuid) {
    match = users.find(u => u.id === mappedUuid || u.id.toLowerCase() === mappedUuid.toLowerCase());
    if (match) return match;
  }

  // 4. Match by email
  match = users.find(u => u.email && u.email.toLowerCase() === lowerId);
  if (match) return match;

  // 5. Match by full_name
  match = users.find(u => u.full_name && u.full_name.toLowerCase() === lowerId);
  if (match) return match;

  // 6. Check active session user in localStorage (browser environment)
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('cmoms_current_user');
      if (stored) {
        const curUser = safeJsonParse<User | null>(stored, null);
        if (curUser && curUser.id) {
          const curId = String(curUser.id).trim();
          const curLower = curId.toLowerCase();
          if (
            curId === cleanId ||
            curLower === lowerId ||
            (curUser.email && curUser.email.toLowerCase() === lowerId) ||
            (mappedSeedId && (curId === mappedSeedId || curLower === mappedSeedId.toLowerCase())) ||
            (mappedUuid && (curId === mappedUuid || curLower === mappedUuid.toLowerCase()))
          ) {
            return curUser;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return undefined;
}

export function getClientById(id: number): Client | undefined {
  return getClients().find(c => c.id === id);
}

export function getContentTypeById(id: number): ContentType | undefined {
  return getContentTypes().find(ct => ct.id === id);
}

// --- ENRICHED GETTERS ---
export function getTaskWithRelations(taskId: string): TaskWithRelations | undefined {
  const task = getTasks().find(t => t.id === taskId);
  if (!task) return undefined;

  const client = getClientById(task.client_id);
  const contentType = getContentTypeById(task.content_type_id);
  const designPic = task.design_pic_id ? getUserById(task.design_pic_id) : null;
  const createdBy = getUserById(task.created_by);
  const motionTask = getMotionTasks().find(mt => mt.task_id === task.id);
  const motionPic = motionTask?.motion_pic_id ? getUserById(motionTask.motion_pic_id) : null;
  const revisions = getRevisions().filter(r => r.task_id === task.id);

  let strat_pic_ids: string[] = [];
  let displayNotes = task.notes || '';
  if (task.notes && task.notes.includes('[STRAT_PICS:')) {
    const matchPics = task.notes.match(/\[STRAT_PICS:(\[[\s\S]*?\])\]/);
    if (matchPics) {
      try {
        strat_pic_ids = JSON.parse(matchPics[1]);
        displayNotes = displayNotes.replace(/\[STRAT_PICS:\[[\s\S]*?\]\]\n?/g, '').trim();
      } catch {
        // ignore
      }
    }
  }
  if (strat_pic_ids.length === 0 && task.strat_pic_id) {
    strat_pic_ids = [task.strat_pic_id];
  }

  let taskAttachments = task.attachments || [];
  if (task.notes && task.notes.includes('[ATTACHMENTS:')) {
    const matchAtt = task.notes.match(/\[ATTACHMENTS:(\[[\s\S]*?\])\]/);
    if (matchAtt) {
      try {
        const parsedAtts = JSON.parse(matchAtt[1]);
        if (Array.isArray(parsedAtts) && parsedAtts.length > 0) {
          taskAttachments = parsedAtts;
        }
        displayNotes = displayNotes.replace(/\[ATTACHMENTS:\[[\s\S]*?\]\]\n?/g, '').trim();
      } catch {
        // ignore
      }
    }
  }
  if (taskAttachments.length === 0) {
    taskAttachments = getTaskAttachments(task.id);
  }
  // Extract and resolve source strategic task ID from property or notes
  const allCurrentTasks = getTasks();
  let resolvedSourceStratId = task.source_strategic_task_id || null;
  if (!resolvedSourceStratId && task.notes) {
    const matchSourceId = task.notes.match(/\[SOURCE_STRATEGIC_TASK_ID:([^\]]+)\]/);
    if (matchSourceId) {
      resolvedSourceStratId = matchSourceId[1].trim();
    } else {
      const matchStratCode = task.notes.match(/\[Berasal dari Konsep Strategic\s+([^\]]+)\]/);
      if (matchStratCode) {
        const pt = allCurrentTasks.find(p => p.task_code === matchStratCode[1].trim());
        if (pt) resolvedSourceStratId = pt.id;
      }
    }
  }

  // Inherit attachments from parent strategic task if this is a spawned design task
  if (taskAttachments.length === 0 && resolvedSourceStratId) {
    const parentTask = allCurrentTasks.find(pt => pt.id === resolvedSourceStratId);
    if (parentTask) {
      if (Array.isArray(parentTask.attachments) && parentTask.attachments.length > 0) {
        taskAttachments = parentTask.attachments;
      } else if (parentTask.notes && parentTask.notes.includes('[ATTACHMENTS:')) {
        const matchParentAtt = parentTask.notes.match(/\[ATTACHMENTS:(\[[\s\S]*?\])\]/);
        if (matchParentAtt) {
          taskAttachments = safeJsonParse<TaskAttachment[]>(matchParentAtt[1], []);
        }
      }
      if (taskAttachments.length === 0) {
        taskAttachments = getTaskAttachments(parentTask.id);
      }
    }
  }

  // Inherit concept deck from parent strategic task if this is a spawned design task
  let strat_concept_name = task.strat_concept_name || null;
  let strat_concept_link = task.strat_concept_link || null;
  let strat_submitted_at = task.strat_submitted_at || null;

  if (!strat_concept_link && resolvedSourceStratId) {
    const parentTask = allCurrentTasks.find(pt => pt.id === resolvedSourceStratId);
    if (parentTask) {
      strat_concept_name = parentTask.strat_concept_name || strat_concept_name;
      strat_concept_link = parentTask.strat_concept_link || strat_concept_link;
      strat_submitted_at = parentTask.strat_submitted_at || strat_submitted_at;
    }
  }

  // Also check notes for Link Konsep Strategic if not yet populated
  if (!strat_concept_link && task.notes) {
    const linkMatch = task.notes.match(/Link Konsep Strategic:\s*(https?:\/\/[^\s\n\r]+)/i);
    if (linkMatch && linkMatch[1] && linkMatch[1] !== '-') {
      strat_concept_link = linkMatch[1];
      if (!strat_concept_name) strat_concept_name = 'Strategic Concept Deck';
    }
  }

  const strat_pic_names = strat_pic_ids.map(id => getUserById(id)?.full_name || '').filter(Boolean);
  const strat_pic_name = strat_pic_names.length > 0 
    ? strat_pic_names.join(', ') 
    : (task.strat_pic_id ? getUserById(task.strat_pic_id)?.full_name || null : null);

  const isApprovedOrClosed = task.status_design === 'DESIGN_APPROVED' || task.status_design === 'TASK_CLOSED';
  const resolvedApprovedAt = task.approved_at || (isApprovedOrClosed ? (task.submission_date ? `${task.submission_date}T00:00:00Z` : task.updated_at || task.created_at) : null);

  const spawnedTask = allCurrentTasks.find(t => {
    if (t.source_strategic_task_id === task.id) return true;
    if (t.notes && (
      t.notes.includes(`[SOURCE_STRATEGIC_TASK_ID:${task.id}]`) ||
      t.notes.includes(`[Berasal dari Konsep Strategic ${task.task_code}]`)
    )) return true;
    return false;
  });
  let resolvedSpawnedDesignTaskId = task.spawned_design_task_id || spawnedTask?.id || null;
  if (!resolvedSpawnedDesignTaskId && task.notes) {
    const matchSpawnedId = task.notes.match(/\[SPAWNED_DESIGN_TASK_ID:([^\]]+)\]/);
    if (matchSpawnedId) {
      resolvedSpawnedDesignTaskId = matchSpawnedId[1].trim();
    }
  }

  const resolvedFinalAssetLink = task.final_asset_link || (task.pipeline_type === 'STRATEGIC' ? spawnedTask?.final_asset_link || null : null);
  const resolvedFinalAssetName = task.final_asset_name || (task.pipeline_type === 'STRATEGIC' ? spawnedTask?.final_asset_name || null : null);

  displayNotes = displayNotes
    .replace(/\[SOURCE_STRATEGIC_TASK_ID:[^\]]+\]\n?/g, '')
    .replace(/\[SPAWNED_DESIGN_TASK_ID:[^\]]+\]\n?/g, '')
    .replace(/\[SPAWNED_DESIGN_TASK_CODE:[^\]]+\]\n?/g, '')
    .trim();

  return {
    ...task,
    strat_concept_name,
    strat_concept_link,
    strat_submitted_at,
    final_asset_link: resolvedFinalAssetLink,
    final_asset_name: resolvedFinalAssetName,
    approved_at: resolvedApprovedAt,
    source_strategic_task_id: resolvedSourceStratId,
    spawned_design_task_id: resolvedSpawnedDesignTaskId,
    notes: displayNotes,
    attachments: taskAttachments,
    client_name: client?.name || 'Unknown',
    client_type: client?.client_type || 'EXTERNAL',
    content_type_name: contentType?.name || 'Unknown',
    design_pic_name: designPic?.full_name || null,
    strat_pic_id: task.strat_pic_id || (strat_pic_ids[0] || null),
    strat_pic_ids,
    strat_pic_name,
    strat_pic_names,
    created_by_name: createdBy?.full_name || 'Unknown',
    motion_task: motionTask || null,
    operator_name: null,
    motion_pic_name: motionPic?.full_name || null,
    revisions,
    comments: getComments().filter(c => c.task_id === task.id),
    is_mockup: task.is_mockup !== undefined ? task.is_mockup : isMockupTask({ ...task, content_type_name: contentType?.name }),
    pipeline_type: task.pipeline_type || determineTaskPipeline({ ...task, content_type_name: contentType?.name }),
    active_pipeline: determineTaskPipeline({ ...task, content_type_name: contentType?.name }),
  };
}

export function getAllTasksWithRelations(): TaskWithRelations[] {
  return getTasks().map(task => getTaskWithRelations(task.id)!).filter(Boolean);
}

export function getDesignerWorkloads(filterMonth?: string, filterYear?: string): DesignerWorkload[] {
  const users = getUsers().filter(u => u.role_name === 'DESIGNER' || u.role_name === 'TEAM_LEAD');
  let tasks = getTasks();

  if (filterYear && filterYear !== 'all') {
    tasks = tasks.filter(t => new Date(t.req_date).getFullYear().toString() === filterYear);
  }
  if (filterMonth && filterMonth !== 'all') {
    tasks = tasks.filter(t => String(new Date(t.req_date).getMonth() + 1).padStart(2, '0') === filterMonth);
  }

  return users.filter(u => u.daily_capacity_points > 0).map(user => {
    const activeTasks = tasks.filter(
      t => t.design_pic_id === user.id &&
        !['TASK_CLOSED'].includes(t.status_design)
    );

    const accumulated = activeTasks.reduce((sum, t) => {
      const weight = t.design_difficulty ? DIFFICULTY_WEIGHTS[t.design_difficulty] : 0;
      return sum + (t.output_qty * weight);
    }, 0);

    return {
      designer_id: user.id,
      designer_name: user.full_name,
      role_name: user.role_name,
      active_tasks_count: activeTasks.length,
      accumulated_points: accumulated,
      daily_capacity: user.daily_capacity_points,
      occupancy_rate: user.daily_capacity_points > 0
        ? (accumulated / (user.daily_capacity_points * 20)) * 100
        : 0,
      tasks: activeTasks.map(t => ({
        task_code: t.task_code,
        campaign_name: t.campaign_name,
        difficulty: t.design_difficulty,
        points: t.design_difficulty ? t.output_qty * DIFFICULTY_WEIGHTS[t.design_difficulty] : 0,
        status: t.status_design,
        due_date: t.due_date,
      })),
    };
  });
}

export function getDashboardStats(filterMonth?: string, filterYear?: string, filterDateFrom?: string, filterDateTo?: string): DashboardStats {
  let tasks = getAllTasksWithRelations();
  let motionTasks = getMotionTasks();

  if (filterDateFrom && filterDateTo) {
    tasks = tasks.filter(t => {
      const d = t.req_date ? t.req_date.substring(0, 10) : '';
      return d >= filterDateFrom && d <= filterDateTo;
    });
    motionTasks = motionTasks.filter(m => {
      const d = m.created_at ? m.created_at.substring(0, 10) : '';
      return d >= filterDateFrom && d <= filterDateTo;
    });
  } else {
    if (filterYear && filterYear !== 'all') {
      tasks = tasks.filter(t => new Date(t.req_date).getFullYear().toString() === filterYear);
      motionTasks = motionTasks.filter(m => new Date(m.created_at).getFullYear().toString() === filterYear);
    }
    if (filterMonth && filterMonth !== 'all') {
      tasks = tasks.filter(t => String(new Date(t.req_date).getMonth() + 1).padStart(2, '0') === filterMonth);
      motionTasks = motionTasks.filter(m => String(new Date(m.created_at).getMonth() + 1).padStart(2, '0') === filterMonth);
    }
  }

  const thisPeriodTasks = tasks;
  const activeTasks = tasks.filter(t => !['TASK_CLOSED'].includes(t.status_design));
  const submittedOrApproved = thisPeriodTasks.filter(t => t.operational_excellence);
  const excellenceCount = submittedOrApproved.filter(t => t.operational_excellence === 'EXCELLENCE').length;

  return {
    active_tasks: activeTasks.length,
    unassigned_tasks: tasks.filter(t => t.status_design === 'DESIGN_UNASSIGNED' || t.status_design === 'STRAT_PENDING').length,
    in_progress_tasks: tasks.filter(t => t.status_design === 'DESIGN_IN_PROGRESS' || t.status_design === 'DESIGN_ASSIGNED').length,
    submitted_tasks: tasks.filter(t => t.status_design === 'DESIGN_SUBMITTED').length,
    completed_tasks: tasks.filter(t => t.status_design === 'TASK_CLOSED' || t.status_design === 'DESIGN_APPROVED').length,
    motion_queue: motionTasks.filter(mt => mt.status_motion === 'QUEUED' || mt.status_motion === 'IN_PROGRESS').length,
    sla_compliance_rate: submittedOrApproved.length > 0
      ? (excellenceCount / submittedOrApproved.length) * 100
      : 100,
    total_tasks_this_month: thisPeriodTasks.length,
    approaching_deadline: activeTasks.filter(t => {
      const due = new Date(t.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = (due.getTime() - today.getTime()) / 86400000;
      return diff <= 1 && diff >= 0 && !['DESIGN_SUBMITTED', 'DESIGN_APPROVED', 'TASK_CLOSED'].includes(t.status_design);
    }),
    overdue_tasks: activeTasks.filter(t => {
      const due = new Date(t.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return due < today && !['DESIGN_SUBMITTED', 'DESIGN_APPROVED', 'TASK_CLOSED'].includes(t.status_design);
    }),
  };
}


// --- MUTATORS ---


export function deleteUser(userId: string): void {
  const users = getUsers();
  const target = users.find(u => u.id === userId);
  if (target?.role_name === 'ADMIN') {
    throw new Error('Akun Administrator bersifat permanen dan tidak dapat dihapus.');
  }
  const filteredUsers = users.filter(u => u.id !== userId);
  setStore(STORE_KEYS.users, filteredUsers);
}

export function createUser(input: {
  email: string;
  role_name: any;
  daily_capacity_points?: number;
}): User {
  const users = getUsers();
  const avatar_initials = (input.email || '').substring(0, 2).toUpperCase();
  const roles = getRoles();
  const role = roles.find(r => r.name === input.role_name);
  const newUser: User = {
    id: `U${Math.floor(Math.random() * 1000) + 100}`,
    email: input.email,
    password_hash: '',
    full_name: 'Pending Registration',
    avatar_initials,
    role_id: role ? role.id : 6,
    role_name: input.role_name,
    daily_capacity_points: input.daily_capacity_points || 0,
    is_active: false,
    is_registered: false,
    created_at: now(),
    updated_at: now(),
  };
  users.push(newUser);
  setStore(STORE_KEYS.users, users);
  return newUser;
}

export function registerUser(email: string, full_name: string, password_hash: string): boolean {
  const users = getUsers();
  const userIdx = users.findIndex(u => u.email === email);
  if (userIdx === -1 || users[userIdx].is_registered) return false;
  
  users[userIdx].full_name = full_name;
  users[userIdx].avatar_initials = (full_name || email || '').trim().substring(0, 2).toUpperCase();
  users[userIdx].password_hash = password_hash;
  users[userIdx].is_active = true;
  users[userIdx].is_registered = true;
  users[userIdx].updated_at = now();
  
  setStore(STORE_KEYS.users, users);
  return true;
}

export function updateUserCapacity(userId: string, dailyCapacityPoints: number): boolean {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return false;
  users[idx].daily_capacity_points = dailyCapacityPoints;
  users[idx].updated_at = now();
  setStore(STORE_KEYS.users, users);
  return true;
}

export function updateUserRole(
  userId: string,
  newRole: RoleName,
  dailyCapacityPoints?: number,
  performedByUserId?: string,
  performerName?: string
): User | null {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return null;

  const currentUser = users[idx];
  if (currentUser.role_name === 'ADMIN' && newRole !== 'ADMIN') {
    console.warn('Role Administrator bersifat permanen/terkunci dan tidak dapat diubah.');
    return null;
  }
  const beforeState = {
    role_name: currentUser.role_name,
    role_id: currentUser.role_id,
    daily_capacity_points: currentUser.daily_capacity_points,
  };

  const roles = getRoles();
  const role = roles.find(r => r.name === newRole);
  const roleIdMap: Record<RoleName, number> = {
    ADMIN: 1,
    TEAM_LEAD: 2,
    STRATEGIC_PIC: 3,
    DESIGNER: 4,
    MOTION_PIC: 5,
    REQUESTER: 6,
    OPERATOR: 7,
  };
  const roleId = role?.id || roleIdMap[newRole] || 6;

  let finalCapacity = 0;
  if (['DESIGNER', 'MOTION_PIC'].includes(newRole)) {
    finalCapacity = typeof dailyCapacityPoints === 'number' && dailyCapacityPoints >= 0
      ? dailyCapacityPoints
      : (currentUser.daily_capacity_points > 0 ? currentUser.daily_capacity_points : 7.0);
  }

  users[idx] = {
    ...currentUser,
    role_id: roleId,
    role_name: newRole,
    daily_capacity_points: finalCapacity,
    updated_at: now(),
  };

  setStore(STORE_KEYS.users, users);

  if (performedByUserId) {
    addAuditLog(
      'users',
      userId,
      'UPDATE',
      performedByUserId,
      beforeState,
      {
        role_name: newRole,
        role_id: roleId,
        daily_capacity_points: finalCapacity,
      }
    );

    if (userId !== performedByUserId) {
      addNotification(
        userId,
        'Perubahan Role Akun',
        `Role Anda telah diperbarui menjadi ${ROLE_LABELS[newRole]} oleh ${performerName || 'Administrator'}.`,
        'info',
        '/dashboard'
      );
    }
  }

  return users[idx];
}

function addAuditLog(
  entityName: string, entityId: string, action: AuditAction,
  performedBy: string, beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null
): void {
  const logs = getAuditLogs();
  const user = getUserById(performedBy);
  logs.push({
    id: logs.length + 1,
    entity_name: entityName,
    entity_id: entityId,
    action,
    performed_by: performedBy,
    performer_name: user?.full_name || 'System',
    before_state: beforeState,
    after_state: afterState,
    timestamp: now(),
  });
  setStore(STORE_KEYS.auditLogs, logs);
}

export function getInvolvedUserIds(
  task?: {
    created_by?: string | null;
    design_pic_id?: string | null;
    strat_pic_id?: string | null;
    strat_pic_ids?: string[] | null;
    operator_id?: string | null;
    notes?: string | null;
    motion_task?: { motion_pic_id?: string | null } | null;
    motion_tasks?: Array<{ motion_pic_id?: string | null }>;
  } | null,
  excludeUserId?: string
): string[] {
  if (!task) return [];
  const ids = new Set<string>();

  if (task.created_by) ids.add(task.created_by);
  if (task.design_pic_id) ids.add(task.design_pic_id);
  if (task.strat_pic_id) ids.add(task.strat_pic_id);
  if (task.strat_pic_ids && Array.isArray(task.strat_pic_ids)) {
    task.strat_pic_ids.forEach(id => {
      if (id && typeof id === 'string' && id.trim()) ids.add(id.trim());
    });
  }
  if (task.notes && task.notes.includes('[STRAT_PICS:')) {
    const match = task.notes.match(/\[STRAT_PICS:(\[[\s\S]*?\])\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]) as string[];
        if (Array.isArray(parsed)) {
          parsed.forEach(id => {
            if (id && typeof id === 'string' && id.trim()) ids.add(id.trim());
          });
        }
      } catch {
        // ignore parse error
      }
    }
  }
  if (task.operator_id) ids.add(task.operator_id);
  if (task.motion_task?.motion_pic_id) {
    ids.add(task.motion_task.motion_pic_id);
  }
  if (task.motion_tasks && Array.isArray(task.motion_tasks)) {
    task.motion_tasks.forEach(m => {
      if (m?.motion_pic_id) ids.add(m.motion_pic_id);
    });
  }

  if (excludeUserId) {
    ids.delete(excludeUserId);
  }

  return Array.from(ids).filter(id => Boolean(id && id.trim()));
}

// Deduplication cache for localStorage store
const localNotifDedupe = new Map<string, number>();
const LOCAL_NOTIF_DEDUPE_MS = 3000;

export function addNotification(
  userId: string,
  title: string,
  message: string,
  type: Notification['type'] = 'info',
  link?: string,
  requestId?: string,
  senderId?: string,
  senderName?: string,
  options?: {
    notificationType?: NotificationType | string;
    oldStatus?: string | null;
    newStatus?: string | null;
    metadata?: Record<string, any>;
  }
): void {
  const notifType = options?.notificationType || (type === 'info' ? 'NEW_MESSAGE' : 'REQUEST_STATUS_UPDATED');
  const dedupeKey = `${userId}:${requestId || ''}:${notifType}:${title}:${message}`;
  const nowMs = Date.now();
  const lastTime = localNotifDedupe.get(dedupeKey);
  if (lastTime && (nowMs - lastTime) < LOCAL_NOTIF_DEDUPE_MS) {
    return; // Ignore duplicate within 3s
  }
  localNotifDedupe.set(dedupeKey, nowMs);

  const notifications = getNotifications();
  const nowIso = now();
  notifications.unshift({
    id: generateUUID(),
    user_id: userId,
    recipient_user_id: userId,
    actor_user_id: senderId,
    task_id: requestId,
    title,
    message,
    type,
    notification_type: notifType,
    old_status: options?.oldStatus || null,
    new_status: options?.newStatus || null,
    metadata: options?.metadata || null,
    read: false,
    is_read: false,
    link: link || '/dashboard/tasks',
    request_id: requestId,
    sender_id: senderId,
    sender_name: senderName,
    created_at: nowIso,
  });
  setStore(STORE_KEYS.notifications, notifications);
}

export function dispatchStatusUpdateNotifications(
  task: any,
  oldStatus: string | null | undefined,
  newStatus: string,
  actorId?: string,
  actorName?: string,
  isMotion: boolean = false
): void {
  if (!task || !newStatus || oldStatus === newStatus) return;

  const recipients = getInvolvedUserIds(task, actorId);
  if (recipients.length === 0) return;

  const taskCode = task.task_code || task.id || 'Request';
  const campaignName = task.campaign_name || 'Request';

  let oldLabel = oldStatus || 'Draft';
  let newLabel = newStatus;
  if (isMotion) {
    oldLabel = (MOTION_STATUS_LABELS as any)[oldStatus || ''] || oldStatus || 'Queued';
    newLabel = (MOTION_STATUS_LABELS as any)[newStatus] || newStatus;
  } else {
    oldLabel = (DESIGN_STATUS_LABELS as any)[oldStatus || ''] || oldStatus || 'Draft';
    newLabel = (DESIGN_STATUS_LABELS as any)[newStatus] || newStatus;
  }

  let notifType: NotificationType = isMotion ? 'MOTION_STATUS_UPDATED' : 'REQUEST_STATUS_UPDATED';
  let level: 'info' | 'warning' | 'success' | 'error' = 'info';

  if (newStatus === 'DESIGN_APPROVED' || newStatus === 'APPROVED') {
    notifType = isMotion ? 'MOTION_APPROVED' : 'REQUEST_APPROVED';
    level = 'success';
  } else if (newStatus === 'DESIGN_SUBMITTED' || newStatus === 'SUBMITTED') {
    notifType = isMotion ? 'MOTION_SUBMITTED' : 'REQUEST_SUBMITTED';
    level = 'success';
  } else if (newStatus === 'DESIGN_REVISION' || newStatus === 'REVISION') {
    notifType = isMotion ? 'MOTION_REVISION' : 'REQUEST_REVISION';
    level = 'warning';
  } else if (newStatus === 'DESIGN_ASSIGNED') {
    notifType = 'REQUEST_ASSIGNED';
    level = 'info';
  } else if (newStatus === 'TASK_CLOSED' || newStatus === 'COMPLETED') {
    notifType = isMotion ? 'MOTION_COMPLETED' : 'REQUEST_CLOSED';
    level = 'info';
  }

  const title = isMotion 
    ? `Status Motion Diperbarui: ${newLabel}`
    : `Status Request Diperbarui: ${newLabel}`;
  
  const actorText = actorName ? ` oleh ${actorName}` : '';
  const message = `[${taskCode}] Status berubah dari "${oldLabel}" menjadi "${newLabel}"${actorText}.`;
  
  const link = isMotion
    ? `/dashboard/motion?taskId=${task.id}&tab=details`
    : `/dashboard/tasks?taskId=${task.id}&tab=details`;

  recipients.forEach(uid => {
    addNotification(
      uid,
      title,
      message,
      level,
      link,
      task.id,
      actorId,
      actorName,
      {
        notificationType: notifType,
        oldStatus: oldStatus || null,
        newStatus: newStatus,
        metadata: { task_code: taskCode, campaign_name: campaignName }
      }
    );
  });
}

export function addComment(
  taskId: string, 
  userId: string, 
  content: string,
  attachment?: { url: string; type: 'image' | 'video' | 'file'; name?: string }
): TaskComment {
  const comments = getComments();
  const user = getUserById(userId);
  const task = getTaskWithRelations(taskId);

  let cleanContent = content ? content.trim() : '';
  let validatedAttachment: { url: string; type: 'image' | 'video' | 'file'; name?: string } | undefined = undefined;

  if (attachment) {
    const val = validateChatAttachment({
      name: attachment.name,
      type: attachment.type,
      url: attachment.url
    });
    if (val.valid) {
      validatedAttachment = {
        url: val.cleanUrl,
        type: val.mediaType,
        name: val.cleanName
      };
    }
  }

  if (!cleanContent && !validatedAttachment) {
    throw new Error('Pesan atau lampiran tidak boleh kosong');
  }

  const newComment: TaskComment = {
    id: generateUUID(),
    task_id: taskId,
    request_id: taskId,
    user_id: userId,
    sender_id: userId,
    user_name: user ? user.full_name : 'User',
    sender_name: user ? user.full_name : 'User',
    user_avatar: user ? user.avatar_initials : '?',
    user_role: user?.role_name,
    content: cleanContent,
    message: cleanContent,
    attachment_url: validatedAttachment?.url || null,
    attachment_type: (validatedAttachment?.type as any) || null,
    attachment_name: validatedAttachment?.name || null,
    is_edited: false,
    edited_at: null,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    read_by: [userId],
    created_at: now(),
  };

  comments.push(newComment);
  setStore(STORE_KEYS.comments, comments);

  if (task) {
    const recipients = getInvolvedUserIds(task, userId);
    const senderName = user?.full_name || 'User';
    const mediaLabel = validatedAttachment?.type === 'image' ? ' [Gambar]' : validatedAttachment?.type === 'video' ? ' [Video]' : '';
    recipients.forEach(uid => {
      addNotification(
        uid,
        `Pesan baru dari ${senderName}${mediaLabel}`,
        `[${task.task_code}] ${senderName}: ${cleanContent.slice(0, 80)}${cleanContent.length > 80 ? '...' : ''}`,
        'info',
        `/dashboard/tasks?taskId=${task.id}&tab=chat`,
        task.id,
        userId,
        senderName,
        {
          notificationType: 'NEW_MESSAGE',
          metadata: { task_code: task.task_code }
        }
      );
    });

    addAuditLog(
      'TASK_CHAT',
      taskId,
      'POST_CHAT_MESSAGE' as any,
      userId,
      null,
      { comment_id: newComment.id, preview: cleanContent.slice(0, 50) }
    );
  }

  return newComment;
}

export function editComment(
  commentId: string,
  userId: string,
  newContent: string
): TaskComment {
  const comments = getComments();
  const cmt = comments.find(c => c.id === commentId);
  if (!cmt) throw new Error('Pesan tidak ditemukan');

  if (cmt.user_id !== userId) {
    throw new Error('Hanya penulis yang berhak mengedit pesan ini');
  }

  if (cmt.is_deleted) {
    throw new Error('Pesan yang telah dihapus tidak dapat diedit');
  }

  const val = sanitizeChatMessage(newContent);
  if (!val.valid) throw new Error(val.error || 'Konten tidak valid');

  cmt.content = val.content;
  cmt.is_edited = true;
  cmt.edited_at = now();

  setStore(STORE_KEYS.comments, comments);

  addAuditLog(
    'TASK_CHAT',
    cmt.task_id,
    'EDIT_CHAT_MESSAGE' as any,
    userId,
    null,
    { comment_id: commentId }
  );

  return cmt;
}

export function deleteComment(
  commentId: string,
  userId?: string,
  roleName?: string
): void {
  const comments = getComments();
  const cmt = comments.find(c => c.id === commentId);
  if (!cmt) return;

  // Soft delete for audit compliance
  cmt.is_deleted = true;
  cmt.deleted_at = now();
  cmt.deleted_by = userId || 'SYSTEM';
  cmt.content = 'Pesan ini telah dihapus';
  cmt.attachment_url = null;
  cmt.attachment_name = null;
  cmt.attachment_type = null;

  setStore(STORE_KEYS.comments, comments);

  if (userId) {
    addAuditLog(
      'TASK_CHAT',
      cmt.task_id,
      'DELETE_CHAT_MESSAGE' as any,
      userId,
      null,
      { comment_id: commentId }
    );
  }
}

export function markCommentsAsRead(taskId: string, userId: string): void {
  if (!taskId || !userId) return;
  const comments = getComments();
  let modified = false;

  comments.forEach(c => {
    if (c.task_id === taskId && c.user_id !== userId && !c.is_deleted) {
      if (!c.read_by) c.read_by = [c.user_id];
      if (!c.read_by.includes(userId)) {
        c.read_by.push(userId);
        modified = true;
      }
    }
  });

  if (modified) {
    setStore(STORE_KEYS.comments, comments);
  }

  // Also mark notifications for this task as read for this user
  const notifs = getStore<Notification>(STORE_KEYS.notifications, []);
  let notifsModified = false;
  notifs.forEach(n => {
    if (n.user_id === userId && !n.read && n.link && n.link.includes(taskId)) {
      n.read = true;
      notifsModified = true;
    }
  });
  if (notifsModified) {
    setStore(STORE_KEYS.notifications, notifs);
  }
}

export function getUnreadCommentCount(taskId: string, userId: string): number {
  if (!taskId || !userId) return 0;
  const comments = getComments();
  return comments.filter(c => 
    c.task_id === taskId && 
    c.user_id !== userId && 
    !c.is_deleted && 
    !(c.read_by || []).includes(userId)
  ).length;
}

export function createTask(input: CreateTaskInput, createdBy: string): CreativeTask {
  const tasks = getTasks();

  // Validate Campaign Name: must be one of BAU, DD, PAYDAY, SPECIAL CAMPAIGN
  const rawCampaign = (input.campaign_name || '').trim();
  const normalizedCampaign = normalizeCampaignName(rawCampaign);
  if (!isValidCampaignName(normalizedCampaign)) {
    throw new Error(`Campaign Name tidak valid (${rawCampaign}). Pilihan yang tersedia: BAU, DD, PAYDAY, SPECIAL CAMPAIGN.`);
  }
  const validCampaignName: CampaignName = normalizedCampaign;

  let rawStratPicIds: string[] = [];
  if (input.strat_pic_ids && Array.isArray(input.strat_pic_ids)) {
    rawStratPicIds = input.strat_pic_ids.filter(id => Boolean(id && id.trim()));
  } else if (input.strat_pic_id && input.strat_pic_id.trim()) {
    rawStratPicIds = [input.strat_pic_id.trim()];
  }

  const contentType = getContentTypeById(input.content_type_id);
  const isMockup = input.is_mockup !== undefined ? input.is_mockup : isMockupTask({
    content_type_id: input.content_type_id,
    content_type_name: contentType?.name,
    campaign_name: validCampaignName,
  });

  // Determine target pipeline
  let pipelineType: PipelineType = input.pipeline_type || (
    input.requires_strategic_concept
      ? 'STRATEGIC'
      : isMockup
        ? 'GD_MOCKUP'
        : 'GD_NON_MOCKUP'
  );

  let requiresStrategic = Boolean(input.requires_strategic_concept);

  // Pipeline specific rules & validations
  if (pipelineType === 'STRATEGIC' || requiresStrategic) {
    pipelineType = 'STRATEGIC';
    requiresStrategic = true;
    // Strategic PIC is strictly mandatory
    if (rawStratPicIds.length === 0) {
      throw new Error('Strategic PIC wajib dipilih untuk task pada pipeline Strategic.');
    }
  } else if (pipelineType === 'GD_MOCKUP') {
    requiresStrategic = false;
    rawStratPicIds = [];
    if (!isMockup) {
      throw new Error('Content Type untuk pipeline GD Mockup hanya boleh Mockup.');
    }
    input.task_source = 'ORCA';
  } else if (pipelineType === 'GD_NON_MOCKUP') {
    requiresStrategic = false;
    rawStratPicIds = [];
    if (isMockup) {
      throw new Error('Task berbasis Mockup tidak diizinkan pada pipeline GD Non-Mockup. Silakan gunakan pipeline GD Mockup.');
    }
    input.task_source = 'ECOMMERCE';
  }

  const seq = getSequence() + 1;
  setSequence(seq);
  const taskCode = generateTaskCode(getCurrentYear(), seq);

  let finalNotes = input.notes || '';
  if (requiresStrategic && rawStratPicIds.length > 0) {
    finalNotes = `[STRAT_PICS:${JSON.stringify(rawStratPicIds)}]\n${finalNotes}`.trim();
  }
  if (input.attachments && input.attachments.length > 0) {
    finalNotes = `[ATTACHMENTS:${JSON.stringify(input.attachments)}]\n${finalNotes}`.trim();
  }

  const newTask: CreativeTask = {
    id: (input as any).id || generateUUID(),
    task_code: taskCode,
    client_id: input.client_id,
    campaign_name: validCampaignName,
    content_type_id: input.content_type_id,
    task_source: input.task_source,
    platform: input.platform,
    req_qty: input.req_qty,
    output_qty: input.req_qty,
    req_date: input.req_date,
    due_date: input.due_date,
    submission_date: null,
    sla_working_days: null,
    operational_excellence: null,
    requires_strategic_concept: requiresStrategic,
    strat_pic_id: (requiresStrategic && rawStratPicIds.length > 0) ? rawStratPicIds[0] : null,
    strat_pic_ids: requiresStrategic ? rawStratPicIds : [],
    status_strat: requiresStrategic ? 'PENDING' : 'NOT_REQUIRED',
    strat_revision_count: 0,
    design_pic_id: input.design_pic_id || null,
    design_difficulty: null,
    design_revision_count: 0,
    status_design: requiresStrategic ? 'STRAT_PENDING' : 'DESIGN_UNASSIGNED',
    motion_readiness: 'WAITING_ASSET_GD',
    final_asset_name: null,
    final_asset_link: null,
    operator_id: null,
    pipeline_type: pipelineType,
    is_mockup: isMockup,
    notes: finalNotes,
    attachments: input.attachments || [],
    created_by: createdBy,
    created_at: now(),
    updated_at: now(),
  };

  tasks.push(newTask);
  setStore(STORE_KEYS.tasks, tasks);

  const client = getClientById(input.client_id);
  addAuditLog('creative_tasks', taskCode, 'CREATE', createdBy, null, {
    status_design: newTask.status_design,
    client: client?.name,
    campaign: validCampaignName,
    pipeline_type: pipelineType,
    design_pic_id: newTask.design_pic_id
  });

  // Notify team lead
  const leads = getUsers().filter(u => u.role_name === 'TEAM_LEAD');
  leads.forEach(lead => {
    addNotification(lead.id, 'New Task Created', `${taskCode} - ${client?.name} ${validCampaignName} telah didaftarkan.`, 'info', '/dashboard/tasks');
  });

  // Notify GD PIC if assigned upon creation
  if (input.design_pic_id && input.design_pic_id !== createdBy) {
    addNotification(
      input.design_pic_id,
      'Penugasan Desain Baru',
      `Anda ditugaskan mengerjakan request ${taskCode} (${validCampaignName}).`,
      'info',
      `/dashboard/tasks?taskId=${newTask.id}&tab=details`,
      newTask.id,
      createdBy,
      undefined,
      { notificationType: 'REQUEST_ASSIGNED' }
    );
  }

  // Real-Time Google Sheets Sync
  try {
    const contentType = getContentTypeById(input.content_type_id);
    const { targetTab, payload } = buildTaskSyncPayload(
      newTask,
      client?.name,
      contentType?.name
    );
    void enqueueGoogleSheetsSync({
      idempotencyKey: `CREATE_TASK_${taskCode}`,
      eventType: 'CREATE_TASK',
      entityId: newTask.id,
      taskCode: taskCode,
      targetTab,
      payload,
    });
  } catch {
    // Graceful offline fallback
  }

  return newTask;
}

export function editTask(taskId: string, input: CreateTaskInput, editedBy: string, userRole?: string): CreativeTask {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return null as any;

  const task = tasks[idx];

  // Backend permission validation
  if (userRole) {
    const isLeadOrAdmin = ['ADMIN', 'TEAM_LEAD'].includes(userRole);
    const isCreatorRequester = userRole === 'REQUESTER' && task.created_by === editedBy;
    const isAssignedStratPic = userRole === 'STRATEGIC_PIC' && (
      task.strat_pic_id === editedBy ||
      (task.strat_pic_ids && task.strat_pic_ids.includes(editedBy))
    );
    if (!isLeadOrAdmin && !isCreatorRequester && !isAssignedStratPic) {
      throw new Error('Unauthorized: Anda tidak memiliki izin untuk mengedit task ini.');
    }
  }

  const beforeState = { 
    client_id: task.client_id, campaign_name: task.campaign_name, content_type_id: task.content_type_id,
    task_source: task.task_source, platform: task.platform, req_qty: task.req_qty, 
    req_date: task.req_date, due_date: task.due_date, notes: task.notes,
    design_pic_id: task.design_pic_id, strat_pic_id: task.strat_pic_id
  };

  // Campaign Name validation (preserve legacy safely if unchanged)
  let campaignName = task.campaign_name;
  if (input.campaign_name !== undefined) {
    const rawCamp = String(input.campaign_name).trim();
    const normalizedCamp = normalizeCampaignName(rawCamp);
    if (isValidCampaignName(normalizedCamp)) {
      campaignName = normalizedCamp;
    } else if (rawCamp === task.campaign_name) {
      campaignName = task.campaign_name;
    } else {
      throw new Error(`Campaign Name tidak valid (${rawCamp}). Pilihan yang tersedia: BAU, DD, PAYDAY, SPECIAL CAMPAIGN.`);
    }
  }

  const currentPipeline = task.pipeline_type || (task.requires_strategic_concept ? 'STRATEGIC' : isMockupTask(task) ? 'GD_MOCKUP' : 'GD_NON_MOCKUP');

  let rawStratPicIds: string[] | null = null;
  if (input.strat_pic_ids !== undefined) {
    rawStratPicIds = input.strat_pic_ids.filter(id => Boolean(id && id.trim()));
  } else if (input.strat_pic_id !== undefined) {
    rawStratPicIds = input.strat_pic_id ? [input.strat_pic_id.trim()] : [];
  }

  // In Strategic pipeline, Strategic PIC cannot be cleared to empty
  if (currentPipeline === 'STRATEGIC' && rawStratPicIds !== null && rawStratPicIds.length === 0) {
    throw new Error('Strategic PIC wajib diisi untuk task Strategic.');
  }

  let baseNotes = input.notes || '';
  let stratConceptTag = '';
  if (task.notes && task.notes.includes('[STRAT_CONCEPT:')) {
    const match = task.notes.match(/\[STRAT_CONCEPT:\{[\s\S]*?\}\]/);
    if (match) stratConceptTag = match[0];
  }

  let attachmentsTag = '';
  if (input.attachments !== undefined) {
    if (input.attachments.length > 0) {
      attachmentsTag = `[ATTACHMENTS:${JSON.stringify(input.attachments)}]`;
    }
  } else if (task.notes && task.notes.includes('[ATTACHMENTS:')) {
    const matchAtt = task.notes.match(/\[ATTACHMENTS:(\[[\s\S]*?\])\]/);
    if (matchAtt) attachmentsTag = matchAtt[0];
  }

  baseNotes = baseNotes.replace(/\[STRAT_CONCEPT:\{[\s\S]*?\}\]\n?/g, '')
                       .replace(/\[STRAT_PICS:\[[\s\S]*?\]\]\n?/g, '')
                       .replace(/\[ATTACHMENTS:\[[\s\S]*?\]\]\n?/g, '')
                       .trim();

  let stratPicsTag = '';
  if (rawStratPicIds && rawStratPicIds.length > 0 && (task.requires_strategic_concept || input.requires_strategic_concept)) {
    stratPicsTag = `[STRAT_PICS:${JSON.stringify(rawStratPicIds)}]`;
  }

  let finalNotes = baseNotes;
  if (stratConceptTag) finalNotes = `${stratConceptTag}\n${finalNotes}`.trim();
  if (stratPicsTag) finalNotes = `${stratPicsTag}\n${finalNotes}`.trim();
  if (attachmentsTag) finalNotes = `${attachmentsTag}\n${finalNotes}`.trim();
  
  task.client_id = input.client_id;
  task.campaign_name = campaignName;
  task.content_type_id = input.content_type_id;
  if (currentPipeline === 'GD_MOCKUP') {
    task.task_source = 'ORCA';
    task.is_mockup = true;
  } else if (currentPipeline === 'GD_NON_MOCKUP') {
    task.task_source = 'ECOMMERCE';
    task.is_mockup = false;
  } else if (input.task_source !== undefined) {
    task.task_source = input.task_source;
  }
  task.platform = input.platform;
  task.req_qty = input.req_qty || task.req_qty;
  if (input.is_mockup !== undefined) {
    task.is_mockup = input.is_mockup;
  }
  if (input.req_date && input.req_date.trim() !== '') {
    task.req_date = input.req_date;
  }
  if (input.due_date && input.due_date.trim() !== '') {
    task.due_date = input.due_date;
  }
  if (currentPipeline === 'STRATEGIC' || input.requires_strategic_concept) {
    task.requires_strategic_concept = true;
    task.pipeline_type = 'STRATEGIC';
  } else if (input.requires_strategic_concept !== undefined) {
    task.requires_strategic_concept = input.requires_strategic_concept;
  }
  if (rawStratPicIds !== null) {
    task.strat_pic_id = (task.requires_strategic_concept && rawStratPicIds.length > 0) ? rawStratPicIds[0] : null;
    task.strat_pic_ids = rawStratPicIds;
  }
  if (input.design_pic_id !== undefined) {
    const oldDesignPicId = task.design_pic_id;
    task.design_pic_id = input.design_pic_id || null;
    if (input.design_pic_id && input.design_pic_id !== oldDesignPicId && input.design_pic_id !== editedBy) {
      addNotification(
        input.design_pic_id,
        'Penugasan Desain Baru',
        `Anda ditugaskan mengerjakan request ${task.task_code} (${campaignName}).`,
        'info',
        `/dashboard/tasks?taskId=${task.id}&tab=details`,
        task.id,
        editedBy,
        undefined,
        { notificationType: 'REQUEST_ASSIGNED' }
      );
    }
  }
  task.notes = finalNotes;
  if (input.attachments !== undefined) {
    task.attachments = input.attachments;
  }
  task.updated_at = now();

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  const client = getClientById(input.client_id);
  addAuditLog('creative_tasks', task.task_code, 'EDIT' as any, editedBy, beforeState, {
    client_id: task.client_id, campaign_name: task.campaign_name, content_type_id: task.content_type_id,
    task_source: task.task_source, platform: task.platform, req_qty: task.req_qty, 
    req_date: task.req_date, due_date: task.due_date, notes: task.notes,
    design_pic_id: task.design_pic_id, strat_pic_id: task.strat_pic_id
  });

  return task;
}

export function assignTask(taskId: string, input: AssignTaskInput, assignedBy: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  const beforeState = { design_pic: task.design_pic_id, status_design: task.status_design, difficulty: task.design_difficulty, strat_pic_id: task.strat_pic_id };

  let rawStratPicIds: string[] | null = null;
  if (input.strat_pic_ids !== undefined) {
    rawStratPicIds = input.strat_pic_ids.filter(id => Boolean(id && id.trim()));
  } else if (input.strat_pic_id !== undefined) {
    rawStratPicIds = input.strat_pic_id ? [input.strat_pic_id.trim()] : [];
  }

  if (rawStratPicIds !== null) {
    task.strat_pic_id = rawStratPicIds.length > 0 ? rawStratPicIds[0] : null;
    task.strat_pic_ids = rawStratPicIds;

    let currentNotes = task.notes || '';
    currentNotes = currentNotes.replace(/\[STRAT_PICS:\[[\s\S]*?\]\]\n?/g, '').trim();
    if (rawStratPicIds.length > 0) {
      currentNotes = `[STRAT_PICS:${JSON.stringify(rawStratPicIds)}]\n${currentNotes}`.trim();
    }
    task.notes = currentNotes;
  }

  const isStratPhase = task.status_design === 'STRAT_PENDING' || task.pipeline_type === 'STRATEGIC' || (task.requires_strategic_concept && task.status_strat !== 'APPROVED');

  if (input.design_pic_id) {
    task.design_pic_id = input.design_pic_id;
    if (input.design_difficulty) task.design_difficulty = input.design_difficulty;
    if (!isStratPhase) {
      task.status_design = 'DESIGN_ASSIGNED';
    }
  } else if (input.design_difficulty) {
    task.design_difficulty = input.design_difficulty;
  }

  task.updated_at = now();
  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  const designer = input.design_pic_id ? getUserById(input.design_pic_id) : null;
  addAuditLog('creative_tasks', task.task_code, 'ASSIGN', assignedBy, beforeState, {
    design_pic: designer?.full_name,
    status_design: task.status_design,
    difficulty: task.design_difficulty,
    strat_pic_id: task.strat_pic_id,
  });

  const clientName = getClientById(task.client_id)?.name || 'Client';

  if (input.design_pic_id && input.design_pic_id !== assignedBy) {
    addNotification(
      input.design_pic_id,
      'Penugasan Desain Baru',
      `Anda ditugaskan mengerjakan request ${task.task_code} (${task.campaign_name}).`,
      'info',
      `/dashboard/tasks?taskId=${task.id}&tab=details`,
      task.id,
      assignedBy,
      undefined,
      { notificationType: 'REQUEST_ASSIGNED' }
    );
  }

  if (rawStratPicIds && rawStratPicIds.length > 0) {
    for (const stratId of rawStratPicIds) {
      if (stratId !== assignedBy) {
        addNotification(
          stratId,
          'Penugasan Strategic PIC',
          `Anda ditugaskan sebagai Strategic PIC pada request ${task.task_code} (${task.campaign_name}).`,
          'info',
          `/dashboard/tasks?taskId=${task.id}&tab=details`,
          task.id,
          assignedBy
        );
      }
    }
  }
}

export function updateStratStatus(
  taskId: string,
  newStatus: StratStatus,
  userId: string
): { success: boolean; task?: CreativeTask; spawnedTask?: CreativeTask } {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return { success: false };

  const task = tasks[idx];
  const user = getUserById(userId);

  // Authorization checks
  if (newStatus === 'IN_PROGRESS') {
    const isAssigned = task.strat_pic_id === userId || Boolean(task.strat_pic_ids && task.strat_pic_ids.includes(userId));
    const isAuthorized = user && (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || isAssigned);
    if (!isAuthorized) {
      throw new Error('Hanya Strategic PIC yang ditugaskan, Lead/Admin, atau AE yang dapat memulai pengerjaan strategi.');
    }
  } else if (newStatus === 'APPROVED') {
    const isAssigned = task.strat_pic_id === userId || Boolean(task.strat_pic_ids && task.strat_pic_ids.includes(userId));
    const isAuthorized = user && (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === userId) || (user.role_name === 'STRATEGIC_PIC' && isAssigned));
    if (!isAuthorized) {
      throw new Error(`User ${userId} tidak memiliki izin untuk menyetujui strategic concept.`);
    }
    // Idempotency check: already approved
    if (task.status_strat === 'APPROVED') {
      const existingSpawned = task.spawned_design_task_id ? tasks.find(t => t.id === task.spawned_design_task_id) : undefined;
      return { success: true, task, spawnedTask: existingSpawned };
    }
  }

  const beforeState = { status_strat: task.status_strat, pipeline_type: task.pipeline_type, status_design: task.status_design };
  task.status_strat = newStatus;

  // Strategic pipeline is an end-to-end independent workflow.
  // The task remains strictly in STRATEGIC pipeline across entire lifecycle.
  task.pipeline_type = 'STRATEGIC';
  task.requires_strategic_concept = true;
  task.updated_at = now();

  let spawnedTask: CreativeTask | undefined;
  if (newStatus === 'APPROVED') {
    task.approved_at = task.approved_at || now();
    task.status_design = 'DESIGN_APPROVED';

    // Auto-spawn new card in GD Mockup or GD Non-Mockup according to task_source
    if (!task.spawned_design_task_id) {
      const targetPipeline: PipelineType = task.task_source === 'ECOMMERCE' ? 'GD_NON_MOCKUP' : 'GD_MOCKUP';
      const isMockup = targetPipeline === 'GD_MOCKUP';

      let targetContentTypeId = task.content_type_id;
      if (isMockup) {
        if (targetContentTypeId !== 1 && !isMockupTask(task)) {
          targetContentTypeId = 1; // 'Mockup Set'
        }
      } else {
        if (targetContentTypeId === 1) {
          targetContentTypeId = 2; // 'Banner Marketplace'
        }
      }

      const seq = getSequence() + 1;
      setSequence(seq);
      const spawnedTaskCode = generateTaskCode(getCurrentYear(), seq);

      spawnedTask = {
        id: generateUUID(),
        task_code: spawnedTaskCode,
        client_id: task.client_id,
        campaign_name: task.campaign_name,
        content_type_id: targetContentTypeId,
        task_source: isMockup ? 'ORCA' : 'ECOMMERCE',
        platform: task.platform,
        req_qty: task.req_qty || 1,
        output_qty: task.output_qty || task.req_qty || 1,
        req_date: now().slice(0, 10),
        due_date: task.due_date || now().slice(0, 10),
        submission_date: null,
        sla_working_days: null,
        operational_excellence: null,
        requires_strategic_concept: false,
        strat_pic_id: task.strat_pic_id,
        strat_pic_ids: task.strat_pic_ids || [],
        status_strat: 'NOT_REQUIRED',
        strat_revision_count: 0,
        strat_concept_name: task.strat_concept_name,
        strat_concept_link: task.strat_concept_link || task.final_asset_link,
        strat_submitted_at: task.strat_submitted_at,
        design_pic_id: null,
        design_difficulty: null,
        design_revision_count: 0,
        status_design: 'DESIGN_UNASSIGNED',
        motion_readiness: isMockup ? 'WAITING_ASSET_GD' : 'NOT_APPLICABLE',
        final_asset_name: null,
        final_asset_link: null,
        operator_id: null,
        pipeline_type: targetPipeline,
        is_mockup: isMockup,
        notes: (task.attachments && task.attachments.length > 0)
          ? `[ATTACHMENTS:${JSON.stringify(task.attachments)}]\n[STRAT_CONCEPT:${JSON.stringify({ name: task.strat_concept_name || 'Strategic Concept Deck', link: task.strat_concept_link || task.final_asset_link || '', submitted_at: task.strat_submitted_at || '' })}]\n[Berasal dari Konsep Strategic ${task.task_code}]\nLink Konsep Strategic: ${task.strat_concept_link || task.final_asset_link || '-'}\n\n${task.notes || ''}`.trim()
          : `[STRAT_CONCEPT:${JSON.stringify({ name: task.strat_concept_name || 'Strategic Concept Deck', link: task.strat_concept_link || task.final_asset_link || '', submitted_at: task.strat_submitted_at || '' })}]\n[Berasal dari Konsep Strategic ${task.task_code}]\nLink Konsep Strategic: ${task.strat_concept_link || task.final_asset_link || '-'}\n\n${task.notes || ''}`.trim(),
        attachments: task.attachments ? JSON.parse(JSON.stringify(task.attachments)) : [],
        source_strategic_task_id: task.id,
        created_by: task.created_by || userId,
        created_at: now(),
        updated_at: now(),
      };

      task.spawned_design_task_id = spawnedTask.id;
      tasks.push(spawnedTask);

      addAuditLog('creative_tasks', spawnedTask.task_code, 'CREATE', userId, null, {
        source_strategic_task: task.task_code,
        pipeline_type: targetPipeline,
        status_design: 'DESIGN_UNASSIGNED'
      });

      try {
        const client = getClientById(spawnedTask.client_id);
        const { targetTab, payload } = buildTaskSyncPayload(spawnedTask, client?.name);
        void enqueueGoogleSheetsSync({
          idempotencyKey: `CREATE_TASK_${spawnedTask.id}`,
          eventType: 'CREATE_TASK',
          entityId: spawnedTask.id,
          taskCode: spawnedTask.task_code,
          targetTab,
          payload
        });
      } catch {}

      const leads = getUsers().filter(u => ['TEAM_LEAD', 'ADMIN'].includes(u.role_name));
      const pipelineLabel = targetPipeline === 'GD_MOCKUP' ? 'GD Mockup' : 'GD Non-Mockup / E-Commerce';
      if (spawnedTask) {
        const currentSpawned = spawnedTask;
        leads.forEach(l => {
          addNotification(
            l.id,
            `Request Desain Baru (${pipelineLabel})`,
            `Konsep strategic ${task.task_code} telah disetujui. Request desain baru [${currentSpawned.task_code}] telah dibuat di pipeline ${pipelineLabel} (Unassigned).`,
            'info',
            `/dashboard/tasks?taskId=${currentSpawned.id}&tab=details&pipeline=${targetPipeline}`,
            currentSpawned.id,
            userId
          );
        });
      }
    } else {
      spawnedTask = tasks.find(t => t.id === task.spawned_design_task_id);
    }
  }

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  addAuditLog('creative_tasks', task.task_code, newStatus === 'APPROVED' ? 'APPROVE' : 'STATUS_TRANSITION', userId, beforeState, {
    status_strat: newStatus,
    status_design: task.status_design,
    pipeline_type: 'STRATEGIC'
  });

  const actorName = user?.full_name || 'User';

  if (newStatus === 'IN_PROGRESS') {
    if (task.created_by && task.created_by !== userId) {
      addNotification(
        task.created_by,
        'Pengerjaan Strategic Dimulai',
        `Strategic PIC (${actorName}) telah memulai perumusan konsep strategi untuk ${task.task_code} (${task.campaign_name}).`,
        'info',
        `/dashboard/tasks?taskId=${task.id}&tab=details&pipeline=STRATEGIC`,
        task.id,
        userId
      );
    }
  } else if (newStatus === 'APPROVED') {
    const recipients = new Set<string>();
    if (task.strat_pic_id) recipients.add(task.strat_pic_id);
    if (task.strat_pic_ids) task.strat_pic_ids.forEach(id => id && recipients.add(id));
    if (task.created_by) recipients.add(task.created_by);
    if (task.design_pic_id) recipients.add(task.design_pic_id);
    
    // Also notify leads
    const leads = getUsers().filter(u => ['TEAM_LEAD', 'ADMIN'].includes(u.role_name));
    leads.forEach(l => recipients.add(l.id));
    recipients.delete(userId);

    recipients.forEach(uid => {
      addNotification(
        uid,
        'Strategic Concept Disetujui (Selesai)',
        `Konsep strategi ${task.task_code} (${task.campaign_name}) telah disetujui dalam pipeline Strategic.`,
        'success',
        `/dashboard/tasks?taskId=${task.id}&tab=details&pipeline=STRATEGIC`,
        task.id,
        userId
      );
    });
  }

  return { success: true, task, spawnedTask };
}

export function handoverStrategicTaskToGD(
  taskId: string,
  input: HandoverStrategicToGDInput,
  userId: string
): { success: boolean; strategicTask?: CreativeTask; spawnedTask?: CreativeTask } {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId || t.task_code === taskId);
  if (idx === -1) throw new Error('Task strategic tidak ditemukan');

  const task = tasks[idx];
  const user = getUserById(userId);
  if (user && !['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) {
    const isAssignedStrat = task.strat_pic_id === userId || Boolean(task.strat_pic_ids && task.strat_pic_ids.includes(userId));
    if (!isAssignedStrat) {
      throw new Error('Anda tidak memiliki izin untuk mengalihkan task ke Graphic Design.');
    }
  }

  const targetPipeline: PipelineType = input.target_pipeline || (task.task_source === 'ECOMMERCE' ? 'GD_NON_MOCKUP' : 'GD_MOCKUP');
  const isMockup = targetPipeline === 'GD_MOCKUP';
  const assignedDesigner = input.design_pic_id ? getUserById(input.design_pic_id) : undefined;

  let spawnedTask: CreativeTask | undefined;
  if (task.spawned_design_task_id) {
    const spawnedIdx = tasks.findIndex(t => t.id === task.spawned_design_task_id);
    if (spawnedIdx !== -1) {
      spawnedTask = tasks[spawnedIdx];
      spawnedTask.design_pic_id = input.design_pic_id || null;
      spawnedTask.status_design = input.design_pic_id ? 'DESIGN_ASSIGNED' : 'DESIGN_UNASSIGNED';
      if (input.design_difficulty) spawnedTask.design_difficulty = input.design_difficulty;
      if (input.due_date) spawnedTask.due_date = input.due_date;
      spawnedTask.pipeline_type = targetPipeline;
      spawnedTask.is_mockup = isMockup;
      spawnedTask.task_source = isMockup ? 'ORCA' : 'ECOMMERCE';
      spawnedTask.strat_concept_name = task.strat_concept_name || spawnedTask.strat_concept_name;
      spawnedTask.strat_concept_link = task.strat_concept_link || task.final_asset_link || spawnedTask.strat_concept_link;
      spawnedTask.strat_submitted_at = task.strat_submitted_at || spawnedTask.strat_submitted_at;
      if (input.handover_notes) {
        spawnedTask.notes = `${spawnedTask.notes || ''}\n[Catatan Handover]: ${input.handover_notes}`.trim();
      }
      spawnedTask.updated_at = now();
      tasks[spawnedIdx] = spawnedTask;
    }
  }

  if (!spawnedTask) {
    let targetContentTypeId = task.content_type_id;
    if (isMockup) {
      if (targetContentTypeId !== 1 && !isMockupTask(task)) {
        targetContentTypeId = 1; // 'Mockup Set'
      }
    } else {
      if (targetContentTypeId === 1) {
        targetContentTypeId = 2; // 'Banner Marketplace'
      }
    }

    const seq = getSequence() + 1;
    setSequence(seq);
    const spawnedTaskCode = generateTaskCode(getCurrentYear(), seq);

    const attachmentTag = task.notes?.match(/\[ATTACHMENTS:(\[[\s\S]*?\])\]/);
    const taskAttachments = (task.attachments && task.attachments.length > 0)
      ? task.attachments
      : (attachmentTag ? safeJsonParse<TaskAttachment[]>(attachmentTag[1], []) : []);
    const cleanNotes = (task.notes || '').replace(/\[ATTACHMENTS:\[[\s\S]*?\]\]\n?/g, '').trim();

    const stratConceptTag = (task.strat_concept_link || task.final_asset_link)
      ? `[STRAT_CONCEPT:${JSON.stringify({ name: task.strat_concept_name || 'Strategic Concept Deck', link: task.strat_concept_link || task.final_asset_link || '', submitted_at: task.strat_submitted_at || '' })}]\n`
      : '';

    const sourceStrategicTag = `[SOURCE_STRATEGIC_TASK_ID:${task.id}]\n`;

    const baseNotes = (taskAttachments && taskAttachments.length > 0)
      ? `[ATTACHMENTS:${JSON.stringify(taskAttachments)}]\n${stratConceptTag}${sourceStrategicTag}[Berasal dari Konsep Strategic ${task.task_code}]\nLink Konsep Strategic: ${task.strat_concept_link || task.final_asset_link || '-'}\n\n${cleanNotes}`.trim()
      : `${stratConceptTag}${sourceStrategicTag}[Berasal dari Konsep Strategic ${task.task_code}]\nLink Konsep Strategic: ${task.strat_concept_link || task.final_asset_link || '-'}\n\n${cleanNotes}`.trim();

    const finalNotes = input.handover_notes
      ? `${baseNotes}\n[Catatan Handover]: ${input.handover_notes}`.trim()
      : baseNotes;

    spawnedTask = {
      id: generateUUID(),
      task_code: spawnedTaskCode,
      client_id: task.client_id,
      campaign_name: task.campaign_name,
      content_type_id: targetContentTypeId,
      task_source: isMockup ? 'ORCA' : 'ECOMMERCE',
      platform: task.platform,
      req_qty: task.req_qty || 1,
      output_qty: task.output_qty || task.req_qty || 1,
      req_date: now().slice(0, 10),
      due_date: input.due_date || task.due_date || now().slice(0, 10),
      submission_date: null,
      sla_working_days: null,
      operational_excellence: null,
      requires_strategic_concept: false,
      strat_pic_id: task.strat_pic_id,
      strat_pic_ids: task.strat_pic_ids || [],
      status_strat: 'NOT_REQUIRED',
      strat_revision_count: 0,
      strat_concept_name: task.strat_concept_name,
      strat_concept_link: task.strat_concept_link || task.final_asset_link,
      strat_submitted_at: task.strat_submitted_at,
      design_pic_id: input.design_pic_id || null,
      design_difficulty: input.design_difficulty || 'MEDIUM',
      design_revision_count: 0,
      status_design: input.design_pic_id ? 'DESIGN_ASSIGNED' : 'DESIGN_UNASSIGNED',
      motion_readiness: isMockup ? 'WAITING_ASSET_GD' : 'NOT_APPLICABLE',
      final_asset_name: null,
      final_asset_link: null,
      operator_id: null,
      pipeline_type: targetPipeline,
      is_mockup: isMockup,
      notes: finalNotes,
      attachments: taskAttachments.length > 0 ? JSON.parse(JSON.stringify(taskAttachments)) : [],
      source_strategic_task_id: task.id,
      created_by: task.created_by || userId,
      created_at: now(),
      updated_at: now(),
    };

    task.spawned_design_task_id = spawnedTask.id;
    let parentCleanNotes = (task.notes || '')
      .replace(/\[SPAWNED_DESIGN_TASK_ID:[^\]]+\]\n?/g, '')
      .replace(/\[SPAWNED_DESIGN_TASK_CODE:[^\]]+\]\n?/g, '')
      .trim();
    task.notes = `[SPAWNED_DESIGN_TASK_ID:${spawnedTask.id}]\n[SPAWNED_DESIGN_TASK_CODE:${spawnedTask.task_code}]\n${parentCleanNotes}`.trim();
    tasks.push(spawnedTask);
  }

  // Update parent strategic task with the assigned GD PIC and status
  task.design_pic_id = input.design_pic_id || task.design_pic_id || null;
  task.status_design = 'DESIGN_APPROVED';
  task.updated_at = now();
  tasks[idx] = task;

  setStore(STORE_KEYS.tasks, tasks);

  addAuditLog('creative_tasks', task.task_code, 'HANDOVER_TO_GD', userId, null, {
    spawned_task_code: spawnedTask.task_code,
    design_pic_id: input.design_pic_id,
    design_pic_name: assignedDesigner?.full_name,
    target_pipeline: targetPipeline,
    status_design: spawnedTask.status_design
  });

  if (assignedDesigner && spawnedTask) {
    addNotification(
      assignedDesigner.id,
      'Penugasan Desain Baru dari Strategic',
      `Anda ditugaskan sebagai GD PIC untuk [${spawnedTask.task_code}] (${task.campaign_name}) yang dialihkan dari Strategic Concept ${task.task_code}.`,
      'info',
      `/dashboard/tasks?taskId=${spawnedTask.id}&tab=details&pipeline=${targetPipeline}`,
      spawnedTask.id,
      userId
    );
  }

  try {
    const client = getClientById(spawnedTask.client_id);
    const { targetTab, payload } = buildTaskSyncPayload(spawnedTask, client?.name);
    void enqueueGoogleSheetsSync({
      idempotencyKey: `HANDOVER_TASK_${spawnedTask.id}`,
      eventType: 'CREATE_TASK',
      entityId: spawnedTask.id,
      taskCode: spawnedTask.task_code,
      targetTab,
      payload
    });
  } catch (syncErr) {
    console.warn('Sheets sync enqueue error on handoverStrategicTaskToGD:', syncErr);
  }

  return { success: true, strategicTask: task, spawnedTask };
}

export function submitStrategicConcept(taskId: string, input: SubmitStrategicInput, userId: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  const user = getUserById(userId);

  // Authorization check: only assigned Strategic PIC or Lead/Admin/AE can submit
  const isAssigned = task.strat_pic_id === userId || Boolean(task.strat_pic_ids && task.strat_pic_ids.includes(userId));
  const isAuthorized = user && (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || isAssigned);
  if (!isAuthorized) {
    throw new Error('Hanya Strategic PIC yang ditugaskan atau Lead/Admin/AE yang dapat submit hasil Strategic.');
  }

  task.status_strat = 'REVIEW';
  task.pipeline_type = 'STRATEGIC';
  task.requires_strategic_concept = true;
  task.strat_concept_name = input.strat_concept_name || 'Strategic Concept Deck';
  task.strat_concept_link = input.strat_concept_link || input.strat_link || '';
  task.strat_submitted_at = now();
  if (input.notes) {
    task.notes = input.notes;
  }
  task.updated_at = now();

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  addAuditLog('creative_tasks', task.task_code, 'SUBMIT', userId, null, {
    status_strat: 'REVIEW',
    strat_concept_name: task.strat_concept_name,
    strat_concept_link: task.strat_concept_link,
    notes: input.notes,
    revision_count: task.strat_revision_count || 0,
    pipeline_type: 'STRATEGIC'
  });

  const isResubmission = (task.strat_revision_count || 0) > 0;
  const notifTitle = isResubmission
    ? `Strategic Concept Disubmit Ulang (Revisi #${task.strat_revision_count})`
    : 'Strategic Concept Disubmit';
  const notifMsg = isResubmission
    ? `Strategic Concept untuk request ${task.task_code} (${task.campaign_name}) telah disubmit ulang untuk review.`
    : `Strategic Concept untuk request ${task.task_code} (${task.campaign_name}) telah disubmit untuk review.`;

  const recipients = new Set<string>();
  if (task.created_by) recipients.add(task.created_by);
  if (task.design_pic_id) recipients.add(task.design_pic_id);
  const leads = getUsers().filter(u => ['TEAM_LEAD', 'ADMIN'].includes(u.role_name));
  leads.forEach(l => recipients.add(l.id));
  recipients.delete(userId);

  recipients.forEach(uid => {
    addNotification(
      uid,
      notifTitle,
      notifMsg,
      'info',
      `/dashboard/tasks?taskId=${task.id}&tab=details&pipeline=STRATEGIC`,
      task.id,
      userId
    );
  });
}

export function updateTaskStatus(taskId: string, newStatus: DesignStatus, userId: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  const user = getUserById(userId);

  // Authorization check for design approval
  if (newStatus === 'DESIGN_APPROVED') {
    const isAuthorized = user && (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === userId));
    if (!isAuthorized) {
      console.warn(`User ${userId} does not have authority to approve design.`);
      return;
    }
    // Idempotency: already approved
    if (task.status_design === 'DESIGN_APPROVED') return;
  }

  const oldStatus = task.status_design;
  const beforeState = { status_design: task.status_design, pipeline_type: task.pipeline_type, motion_readiness: task.motion_readiness };
  task.status_design = newStatus;
  task.updated_at = now();
  if (newStatus === 'DESIGN_APPROVED') {
    task.approved_at = task.approved_at || now();
    task.restored_at = null;
    task.restored_by = null;
  } else if (newStatus === 'TASK_CLOSED') {
    task.restored_at = null;
    task.restored_by = null;
  }

  // If submitted, calculate SLA
  if (newStatus === 'DESIGN_SUBMITTED' && !task.submission_date) {
    const submissionDate = formatDate(new Date());
    task.submission_date = submissionDate;
    const holidays = getHolidays();
    const workingDays = calculateBusinessDays(task.req_date, submissionDate, holidays);
    task.sla_working_days = workingDays;
    task.operational_excellence = workingDays !== null ? evaluateOperationalExcellence(workingDays) : null;
  }

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  addAuditLog(
    'creative_tasks',
    task.task_code,
    'STATUS_TRANSITION',
    userId,
    beforeState,
    {
      status_design: newStatus,
      ...(task.submission_date ? { submission_date: task.submission_date, sla_working_days: task.sla_working_days, operational_excellence: task.operational_excellence } : {}),
    }
  );

  // Dispatch status update notifications (actor excluded)
  const performerName = getUserById(userId)?.full_name || 'User';
  dispatchStatusUpdateNotifications(task, oldStatus, newStatus, userId, performerName, false);
}

export function submitTask(taskId: string, input: SubmitTaskInput, userId: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  task.output_qty = input.output_qty;
  task.final_asset_name = input.final_asset_name;
  task.final_asset_link = input.final_asset_link;
  task.status_design = 'DESIGN_SUBMITTED';
  task.submission_date = formatDate(new Date());
  task.updated_at = now();

  const holidays = getHolidays();
  const workingDays = calculateBusinessDays(task.req_date, task.submission_date, holidays);
  task.sla_working_days = workingDays;
  task.operational_excellence = workingDays !== null ? evaluateOperationalExcellence(workingDays) : null;

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  addAuditLog('creative_tasks', task.task_code, 'SUBMIT', userId,
    { status_design: 'DESIGN_IN_PROGRESS' },
    { status_design: 'DESIGN_SUBMITTED', submission_date: task.submission_date, sla_working_days: task.sla_working_days, operational_excellence: task.operational_excellence }
  );

  const performerName = getUserById(userId)?.full_name || 'Designer';
  const recipients = new Set<string>();
  if (task.created_by) recipients.add(task.created_by);
  recipients.delete(userId);

  recipients.forEach(uid => {
    addNotification(
      uid,
      'Output Desain Selesai',
      `Desain untuk request ${task.task_code} (${task.campaign_name}) telah disubmit oleh ${performerName}.`,
      'success',
      `/dashboard/tasks?taskId=${task.id}&tab=details`,
      task.id,
      userId,
      performerName
    );
  });
}

export function requestRevision(taskId: string, input: RevisionInput, requestedBy: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  const user = getUserById(requestedBy);

  if (input.stage === 'STRATEGIC') {
    const isAuthorized = user && (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === requestedBy));
    if (!isAuthorized) {
      throw new Error('Hanya Requester, Strategic, Team Lead, atau Admin yang dapat meminta revisi Strategic.');
    }
  }

  let assetName: string | null = null;
  let assetLink: string | null = null;
  let submittedBy: string | null = null;
  let submittedAt: string | null = null;

  if (input.stage === 'STRATEGIC') {
    assetName = task.strat_concept_name || null;
    assetLink = task.strat_concept_link || null;
    submittedBy = task.strat_pic_id || null;
    submittedAt = task.strat_submitted_at || null;
    task.strat_revision_count = (task.strat_revision_count || 0) + 1;
    task.status_strat = 'REVISION';
    task.pipeline_type = 'STRATEGIC';
  } else {
    assetName = task.final_asset_name || null;
    assetLink = task.final_asset_link || null;
    submittedBy = task.design_pic_id || null;
    submittedAt = task.submission_date || null;
    task.design_revision_count += 1;
    task.status_design = 'DESIGN_REVISION';
  }
  task.updated_at = now();

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  const revisions = getRevisions();
  revisions.push({
    id: generateUUID(),
    task_id: taskId,
    stage: input.stage,
    revision_number: input.stage === 'STRATEGIC' ? task.strat_revision_count : task.design_revision_count,
    reason_category: input.reason_category,
    notes: input.notes,
    requested_by: requestedBy,
    created_at: now(),
    asset_name: assetName,
    asset_link: assetLink,
    submitted_by: submittedBy,
    submitted_at: submittedAt,
  });
  setStore(STORE_KEYS.revisions, revisions);

  if (input.stage === 'STRATEGIC') {
    addAuditLog('creative_tasks', task.task_code, 'REVISION_REQUEST', requestedBy,
      { status_strat: 'REVIEW' },
      { status_strat: task.status_strat, strat_revision_count: task.strat_revision_count, reason: input.reason_category, notes: input.notes, pipeline_type: 'STRATEGIC' }
    );
  } else {
    addAuditLog('creative_tasks', task.task_code, 'REVISION_REQUEST', requestedBy,
      { status_design: 'DESIGN_SUBMITTED' },
      { status_design: task.status_design, revision_count: task.design_revision_count, reason: input.reason_category, notes: input.notes }
    );
  }

  const performerName = getUserById(requestedBy)?.full_name || 'User';
  const recipients = new Set<string>();

  if (input.stage === 'STRATEGIC') {
    if (task.strat_pic_id) recipients.add(task.strat_pic_id);
    if (task.strat_pic_ids) task.strat_pic_ids.forEach(id => id && recipients.add(id));
  } else if (input.stage === 'DESIGN') {
    if (task.design_pic_id) recipients.add(task.design_pic_id);
    if (task.created_by) recipients.add(task.created_by);
  } else {
    if (task.created_by) recipients.add(task.created_by);
  }

  recipients.delete(requestedBy);

  recipients.forEach(uid => {
    addNotification(
      uid,
      input.stage === 'STRATEGIC' ? 'Revisi Strategic Concept Diperlukan' : 'Request Membutuhkan Revisi',
      input.stage === 'STRATEGIC' 
        ? `Strategic Concept untuk request ${task.task_code} (${task.campaign_name}) memerlukan revisi dari ${performerName}. Catatan: ${input.notes}`
        : `Request ${task.task_code} (${task.campaign_name}) membutuhkan revisi [${input.stage}] dari ${performerName}.`,
      'warning',
      input.stage === 'STRATEGIC' ? `/dashboard/tasks?taskId=${task.id}&tab=details&pipeline=STRATEGIC` : `/dashboard/tasks?taskId=${task.id}&tab=details`,
      task.id,
      requestedBy,
      performerName
    );
  });
}

export function setMotionReadyness(taskId: string, ready: boolean, userId: string): void {
  if (ready) {
    forwardTaskToMotion(taskId, userId);
    return;
  }

  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  if (getMotionTasks().some(motionTask => motionTask.task_id === taskId)) {
    throw new Error('Request yang sudah diteruskan tidak dapat dibatalkan melalui perubahan readiness.');
  }
  tasks[idx].motion_readiness = 'WAITING_ASSET_GD';
  tasks[idx].updated_at = now();
  setStore(STORE_KEYS.tasks, tasks);
}

export function forwardTaskToMotion(taskId: string, userId: string): void {
  const task = getTasks().find(candidate => candidate.id === taskId);
  if (!task) throw new Error('Request tidak ditemukan.');
  if (!canForwardToMotion(task)) {
    throw new Error('Hanya request Approved dari pipeline GD Mockup atau GD E-Commerce yang dapat diteruskan ke Motion.');
  }

  const actor = getUserById(userId);
  if (!actor || !['ADMIN', 'TEAM_LEAD', 'DESIGNER', 'REQUESTER', 'STRATEGIC_PIC'].includes(actor.role_name)) {
    throw new Error('Anda tidak memiliki izin untuk meneruskan request ke Motion.');
  }

  if (getMotionTasks().some(motionTask => motionTask.task_id === taskId)) {
    if (task.motion_readiness !== 'READY_TO_ANIMATE') {
      task.motion_readiness = 'READY_TO_ANIMATE';
      task.updated_at = now();
      setStore(STORE_KEYS.tasks, getTasks().map(current => current.id === taskId ? task : current));
    }
    return;
  }

  task.motion_readiness = 'READY_TO_ANIMATE';
  task.updated_at = now();
  setStore(STORE_KEYS.tasks, getTasks().map(current => current.id === taskId ? task : current));

  const createdMotion = createMotionSubtask(taskId, userId);
  if (!createdMotion) {
    task.motion_readiness = 'WAITING_ASSET_GD';
    task.updated_at = now();
    setStore(STORE_KEYS.tasks, getTasks().map(current => current.id === taskId ? task : current));
    throw new Error('Request gagal diteruskan ke antrean Motion.');
  }

  const recipients = new Set<string>();
  if (task.created_by) recipients.add(task.created_by);
  recipients.delete(userId);
  recipients.forEach(uid => {
    addNotification(
      uid,
      'Request Diteruskan ke Motion',
      `Request ${task.task_code} (${task.campaign_name}) telah diteruskan ke antrean Motion.`,
      'info',
      '/dashboard/motion',
      task.id,
      userId
    );
  });
}

function createMotionSubtask(taskId: string, userId: string): MotionTask | null {
  const motionTasks = getMotionTasks();
  const existing = motionTasks.find(mt => mt.task_id === taskId);
  if (existing) return existing;

  const task = getTasks().find(t => t.id === taskId);
  if (!task || !canTransitionToMotion(task)) return null;

  const attachmentTag = task.notes?.match(/\[ATTACHMENTS:(\[[\s\S]*?\])\]/);
  const taskAttachments = task.attachments?.length
    ? task.attachments
    : (attachmentTag ? safeJsonParse<TaskAttachment[]>(attachmentTag[1], []) : []);
  const motionAttachments = taskAttachments.length ? JSON.parse(JSON.stringify(taskAttachments)) as TaskAttachment[] : [];
  const cleanNotes = (task.notes || '').replace(/\[ATTACHMENTS:\[[\s\S]*?\]\]\n?/g, '').trim();
  const packedMotionNotes = motionAttachments.length > 0
    ? `[ATTACHMENTS:${JSON.stringify(motionAttachments)}]\n${cleanNotes}`.trim()
    : cleanNotes;

  const newMotion: MotionTask = {
    id: generateUUID(),
    task_id: taskId,
    motion_pic_id: null,
    motion_difficulty: 'LVL_2_MEDIUM',
    motion_revision_count: 0,
    status_motion: 'QUEUED',
    apply_date: null,
    link_motion: null,
    notes: packedMotionNotes,
    attachments: motionAttachments,
    created_at: now(),
    updated_at: now(),
  };

  motionTasks.push(newMotion);
  setStore(STORE_KEYS.motionTasks, motionTasks);

  addAuditLog('motion_tasks', task.task_code, 'CREATE', userId, null, {
    status_motion: 'QUEUED',
  });

  // Notify motion team
  const motionUsers = getUsers().filter(u => ['MOTION_PIC', 'TEAM_LEAD'].includes(u.role_name));
  motionUsers.forEach(mu => {
    addNotification(mu.id, 'Motion Handoff',
      `[HANDOFF] Desain ${task.task_code} - ${getClientById(task.client_id)?.name} telah disetujui. Subtask motion telah dibuat.`,
      'success', '/dashboard/motion'
    );
  });

  // Real-Time Google Sheets Sync (Motion Tab)
  try {
    const client = getClientById(task.client_id);
    const { targetTab, payload } = buildMotionTaskSyncPayload(
      newMotion,
      client?.name
    );
    payload.task_code = task.task_code;
    void enqueueGoogleSheetsSync({
      idempotencyKey: `HANDOVER_MOTION_${task.task_code}`,
      eventType: 'CREATE_MOTION',
      entityId: newMotion.id,
      taskCode: task.task_code,
      targetTab,
      payload,
    });
  } catch {
    // Graceful
  }

  return newMotion;
}

export interface CreateStandaloneMotionInput {
  client_id: number;
  platform: 'TIKTOK' | 'SHOPEE' | 'TOKOPEDIA' | 'LAZADA' | 'OTHER';
  motion_type: string;
  campaign_type: string;
  motion_pic_id: string | null;
  production_date: string;
  period_start: string;
  period_end: string;
  studio: 'Jakarta' | 'Bandung';
  notes?: string;
  attachments?: TaskAttachment[];
}

export function createStandaloneMotionTask(input: CreateStandaloneMotionInput, userId: string): MotionTask {
  const motionTasks = getMotionTasks();
  const seq = getSequence();
  setSequence(seq + 1);
  const idStr = seq.toString().padStart(4, '0');
  const taskId = `MOT-${new Date().getFullYear()}-${idStr}`;

  const rawCampaign = (input.campaign_type || '').trim();
  const normalizedCampaign = normalizeCampaignName(rawCampaign);
  const validCampaign = isValidCampaignName(normalizedCampaign) ? normalizedCampaign : input.campaign_type;

  const newTask: MotionTask = {
    id: taskId,
    task_id: null,
    client_id: input.client_id,
    platform: input.platform,
    motion_type: input.motion_type,
    campaign_type: validCampaign,
    production_date: input.production_date,
    period_start: input.period_start,
    period_end: input.period_end,
    studio: input.studio,
    motion_pic_id: input.motion_pic_id,
    motion_difficulty: 'LVL_1_SIMPLE',
    motion_revision_count: 0,
    status_motion: input.motion_pic_id ? 'IN_PROGRESS' : 'QUEUED',
    apply_date: input.motion_pic_id ? now() : null,
    link_motion: null,
    notes: input.notes || '',
    attachments: input.attachments || [],
    created_at: now(),
    updated_at: now(),
  };

  motionTasks.push(newTask);
  setStore(STORE_KEYS.motionTasks, motionTasks);

  addAuditLog(
    'MotionTask',
    taskId,
    'CREATE',
    userId,
    null,
    newTask as unknown as Record<string, unknown>
  );

  // Real-Time Google Sheets Sync (Standalone Motion)
  try {
    const client = getClientById(input.client_id);
    const { targetTab, payload } = buildMotionTaskSyncPayload(
      newTask,
      client?.name
    );
    void enqueueGoogleSheetsSync({
      idempotencyKey: `CREATE_MOTION_${newTask.id}`,
      eventType: 'CREATE_MOTION',
      entityId: newTask.id,
      taskCode: newTask.id,
      targetTab,
      payload,
    });
  } catch {
    // Graceful
  }

  return newTask;
}

export function editStandaloneMotionTask(motionTaskId: string, input: CreateStandaloneMotionInput, userId: string): void {
  const motionTasks = getMotionTasks();
  const idx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (idx === -1) return;

  const task = motionTasks[idx];
  const beforeState = { ...task };

  let validCampaign = task.campaign_type;
  if (input.campaign_type !== undefined) {
    const rawCamp = String(input.campaign_type).trim();
    const normalizedCamp = normalizeCampaignName(rawCamp);
    if (isValidCampaignName(normalizedCamp)) {
      validCampaign = normalizedCamp;
    } else if (rawCamp === task.campaign_type) {
      validCampaign = task.campaign_type;
    } else {
      validCampaign = input.campaign_type;
    }
  }
  
  task.client_id = input.client_id;
  task.platform = input.platform;
  task.motion_type = input.motion_type;
  task.campaign_type = validCampaign;
  task.production_date = input.production_date;
  task.period_start = input.period_start;
  task.period_end = input.period_end;
  task.studio = input.studio;
  
  // Only update motion_pic_id if it's currently unassigned to avoid accidentally removing assigned PIC
  if (input.motion_pic_id) {
    task.motion_pic_id = input.motion_pic_id;
  }
  if (input.notes !== undefined) {
    task.notes = input.notes;
  }
  if (input.attachments !== undefined) {
    task.attachments = input.attachments;
  }
  
  task.updated_at = now();
  
  motionTasks[idx] = task;
  setStore(STORE_KEYS.motionTasks, motionTasks);

  addAuditLog(
    'MotionTask',
    motionTaskId,
    'EDIT' as any,
    userId,
    beforeState,
    task as unknown as Record<string, unknown>
  );
}

export function submitMotionTask(motionTaskId: string, linkMotion: string, notes?: string, userId?: string): void {
  const motionTasks = getMotionTasks();
  const idx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (idx === -1) return;

  motionTasks[idx].link_motion = linkMotion;
  if (notes) {
    motionTasks[idx].notes = notes;
  }
  motionTasks[idx].status_motion = 'SUBMITTED';
  motionTasks[idx].updated_at = now();
  setStore(STORE_KEYS.motionTasks, motionTasks);
}

export function assignMotionPic(motionTaskId: string, motionPicId: string, userId?: string): void {
  if (!motionPicId) return;
  const motionTasks = getMotionTasks();
  const idx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (idx === -1) return;

  motionTasks[idx].motion_pic_id = motionPicId;
  motionTasks[idx].status_motion = 'IN_PROGRESS';
  motionTasks[idx].updated_at = now();
  setStore(STORE_KEYS.motionTasks, motionTasks);

  addNotification(motionPicId, 'Motion Task Assigned', 'Anda ditugaskan mengerjakan motion task baru.', 'info', '/dashboard/motion');
}

export function updateMotionStatus(motionTaskId: string, status: MotionStatus, userId?: string): void {
  const motionTasks = getMotionTasks();
  const idx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (idx === -1) return;

  const mt = motionTasks[idx];
  const oldStatus = mt.status_motion;
  mt.status_motion = status;
  mt.updated_at = now();
  if ((status === 'APPROVED' || status === 'COMPLETED')) {
    if (!mt.approved_at) mt.approved_at = now();
    mt.restored_at = null;
    mt.restored_by = null;
  }
  motionTasks[idx] = mt;
  setStore(STORE_KEYS.motionTasks, motionTasks);

  if (userId) {
    addAuditLog('motion_tasks', mt.id, 'STATUS_TRANSITION', userId, { status: oldStatus }, { status });
  }

  let taskForNotif: any = mt;
  if (mt.task_id) {
    const parentTask = getTasks().find(t => t.id === mt.task_id);
    if (parentTask) {
      taskForNotif = { ...parentTask, motion_task: mt };
    }
  }

  const performerName = userId ? (getUserById(userId)?.full_name || 'User') : undefined;
  dispatchStatusUpdateNotifications(taskForNotif, oldStatus, status, userId, performerName, true);
}

export function deleteMotionTask(motionTaskId: string): void {
  const motionTasks = getMotionTasks().filter(mt => mt.id !== motionTaskId);
  setStore(STORE_KEYS.motionTasks, motionTasks);
}

export function updateMotionDueDate(motionTaskId: string, dueDate: string, userId?: string): MotionTask | undefined {
  const motionTasks = getMotionTasks();
  const idx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (idx === -1) return undefined;

  const mt = motionTasks[idx];
  const oldDate = mt.due_date;
  mt.due_date = dueDate;
  mt.updated_at = now();
  motionTasks[idx] = mt;
  setStore(STORE_KEYS.motionTasks, motionTasks);

  if (mt.task_id) {
    const tasks = getTasks();
    const tIdx = tasks.findIndex(t => t.id === mt.task_id);
    if (tIdx !== -1) {
      tasks[tIdx].due_date = dueDate;
      tasks[tIdx].updated_at = now();
      setStore(STORE_KEYS.tasks, tasks);
    }
  }

  if (userId) {
    addAuditLog('motion_tasks', mt.id, 'UPDATE', userId, { due_date: oldDate }, { due_date: dueDate });
  }

  return mt;
}

export function requestMotionRevision(
  motionTaskId: string,
  input: { reason_category: import('./types').ReasonCategory; notes: string },
  requestedBy: string
): void {
  const motionTasks = getMotionTasks();
  const idx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (idx === -1) return;

  const mt = motionTasks[idx];
  mt.motion_revision_count = (mt.motion_revision_count || 0) + 1;
  mt.status_motion = 'REVISION';
  mt.updated_at = now();
  motionTasks[idx] = mt;
  setStore(STORE_KEYS.motionTasks, motionTasks);

  const assetLink = mt.link_motion || (mt as any).final_video_link || null;
  const assetName = 'Motion Render Output';
  const submittedBy = mt.motion_pic_id || null;
  const submittedAt = (mt as any).submission_date || mt.updated_at || null;

  const revisions = getRevisions();
  revisions.push({
    id: generateUUID(),
    task_id: mt.task_id || mt.id,
    stage: 'MOTION',
    revision_number: mt.motion_revision_count,
    reason_category: input.reason_category,
    notes: input.notes,
    requested_by: requestedBy,
    created_at: now(),
    asset_name: assetName,
    asset_link: assetLink,
    submitted_by: submittedBy,
    submitted_at: submittedAt,
  });
  setStore(STORE_KEYS.revisions, revisions);

  addAuditLog('motion_tasks', mt.id, 'REVISION_REQUEST', requestedBy,
    { status_motion: 'SUBMITTED' },
    { status_motion: 'REVISION', revision_count: mt.motion_revision_count }
  );

  const performerName = getUserById(requestedBy)?.full_name || 'User';
  const recipients = new Set<string>();
  if (mt.motion_pic_id) recipients.add(mt.motion_pic_id);
  recipients.delete(requestedBy);

  recipients.forEach(uid => {
    addNotification(
      uid,
      'Motion Membutuhkan Revisi',
      `Motion task #${mt.id.substring(0, 8)} membutuhkan revisi dari ${performerName}.`,
      'warning',
      `/dashboard/motion?taskId=${mt.id}&tab=details`,
      mt.task_id || mt.id,
      requestedBy,
      performerName
    );
  });
}

export function assignOperatorToMotionTask(motionTaskId: string, operatorId: string, userId: string): void {
  const motionTasks = getMotionTasks();
  const idx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (idx === -1) return;

  const mt = motionTasks[idx];
  const oldStatus = mt.status_motion;
  mt.status_motion = 'COMPLETED';
  (mt as any).operator_id = operatorId;
  mt.updated_at = now();
  if (!mt.approved_at) mt.approved_at = now();
  motionTasks[idx] = mt;
  setStore(STORE_KEYS.motionTasks, motionTasks);

  if (mt.task_id) {
    const tasks = getTasks();
    const tIdx = tasks.findIndex(t => t.id === mt.task_id);
    if (tIdx !== -1) {
      tasks[tIdx].operator_id = operatorId;
      tasks[tIdx].status_design = 'TASK_CLOSED';
      tasks[tIdx].updated_at = now();
      setStore(STORE_KEYS.tasks, tasks);
    }
  }

  addAuditLog('motion_tasks', mt.id, 'STATUS_TRANSITION', userId, { status: oldStatus }, { status: 'COMPLETED', operator_id: operatorId });
}

export function markNotificationsRead(userId: string): void {
  const notifications = getNotifications();
  const updated = notifications.map(n => n.user_id === userId ? { ...n, read: true } : n);
  setStore(STORE_KEYS.notifications, updated);
}

export function markNotificationAsRead(notificationId: string): void {
  const notifications = getNotifications();
  const updated = notifications.map(n => n.id === notificationId ? { ...n, read: true } : n);
  setStore(STORE_KEYS.notifications, updated);
}

export function getUserNotifications(userId: string): Notification[] {
  return getNotifications().filter(n => n.user_id === userId);
}

// --- MASTER DATA MUTATORS ---
export function addClient(name: string, clientType: 'INTERNAL' | 'EXTERNAL'): Client {
  const clients = getClients();
  const newClient: Client = {
    id: Math.max(...clients.map(c => c.id), 0) + 1,
    name,
    client_type: clientType,
    is_active: true,
    created_at: now(),
  };
  clients.push(newClient);
  setStore(STORE_KEYS.clients, clients);
  return newClient;
}

export function deleteClient(id: number, reassignToClientId?: number): void {
  if (reassignToClientId) {
    const tasks = getTasks();
    tasks.forEach(t => {
      if (t.client_id === id) {
        t.client_id = reassignToClientId;
      }
    });
    setStore(STORE_KEYS.tasks, tasks);
  }
  const clients = getClients().filter(c => c.id !== id);
  setStore(STORE_KEYS.clients, clients);
}

export function addContentType(name: string, defaultDifficulty: DesignDifficulty = 'MEDIUM'): ContentType {
  const types = getContentTypes();
  const newType: ContentType = {
    id: Math.max(...types.map(t => t.id), 0) + 1,
    name,
    default_difficulty: defaultDifficulty,
    created_at: now(),
  };
  types.push(newType);
  setStore(STORE_KEYS.contentTypes, types);
  return newType;
}

export function deleteContentType(id: number, reassignToTypeId?: number): void {
  if (reassignToTypeId) {
    const tasks = getTasks();
    tasks.forEach(t => {
      if (t.content_type_id === id) {
        t.content_type_id = reassignToTypeId;
      }
    });
    setStore(STORE_KEYS.tasks, tasks);
  }
  const types = getContentTypes().filter(t => t.id !== id);
  setStore(STORE_KEYS.contentTypes, types);
}

export function addHoliday(date: string, description: string): Holiday {
  const holidays = getHolidays();
  const newHoliday: Holiday = { holiday_date: date, description };
  holidays.push(newHoliday);
  holidays.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
  setStore(STORE_KEYS.holidays, holidays);
  return newHoliday;
}

export function setHolidays(holidays: Holiday[]): void {
  const sorted = [...holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
  setStore(STORE_KEYS.holidays, sorted);
}

export function deleteHoliday(date: string): void {
  const holidays = getHolidays().filter(h => h.holiday_date !== date);
  setStore(STORE_KEYS.holidays, holidays);
}


export function deleteTask(taskId: string, userId: string): void {
  const tasks = getTasks();
  const taskToDelete = tasks.find(t => t.id === taskId);
  if (!taskToDelete) return;
  
  const updatedTasks = tasks.filter(t => t.id !== taskId);
  setStore(STORE_KEYS.tasks, updatedTasks);

  // Optionally delete motion tasks and comments related to this task, but for now just removing it from tasks is enough
  addAuditLog(
    'creative_tasks',
    taskId,
    'DELETE',
    userId,
    { status_design: taskToDelete.status_design },
    { status: 'DELETED' }
  );
}

// ------------------------------------------------------------
// MONTHLY AUTO-ARCHIVE & RESTORE
// ------------------------------------------------------------

export function autoArchiveCompletedTasks(referenceDate?: Date): {
  archivedTasks: string[];
  archivedMotionTasks: string[];
} {
  const ref = referenceDate || new Date();
  const tasks = getTasks();
  const motionTasks = getMotionTasks();

  const newlyArchivedTasks: string[] = [];
  const newlyArchivedMotionTasks: string[] = [];

  let tasksChanged = false;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (qualifiesForAutoArchive(t, ref)) {
      const compDate = getTaskCompletionDate(t);
      const period = computeArchivePeriod(compDate);
      const beforeState = { is_archived: t.is_archived, status_design: t.status_design };
      
      t.is_archived = true;
      t.archived_at = now();
      t.archived_by = 'system';
      t.archive_period = period;
      t.archive_reason = 'Monthly auto-archive of completed tasks';
      t.updated_at = now();
      tasksChanged = true;
      newlyArchivedTasks.push(t.id);

      addAuditLog('creative_tasks', t.task_code, 'AUTO_ARCHIVE', 'system', beforeState, {
        is_archived: true,
        archive_period: period,
        completion_date: compDate
      });
    }
  }

  let motionChanged = false;
  for (let i = 0; i < motionTasks.length; i++) {
    const mt = motionTasks[i];
    if (qualifiesForAutoArchive(mt, ref)) {
      const compDate = getTaskCompletionDate(mt);
      const period = computeArchivePeriod(compDate);
      const beforeState = { is_archived: mt.is_archived, status_motion: mt.status_motion };

      mt.is_archived = true;
      mt.archived_at = now();
      mt.archived_by = 'system';
      mt.archive_period = period;
      mt.archive_reason = 'Monthly auto-archive of completed motion tasks';
      mt.updated_at = now();
      motionChanged = true;
      newlyArchivedMotionTasks.push(mt.id);

      addAuditLog('motion_tasks', mt.id, 'AUTO_ARCHIVE', 'system', beforeState, {
        is_archived: true,
        archive_period: period,
        completion_date: compDate
      });
    }
  }

  if (tasksChanged) {
    setStore(STORE_KEYS.tasks, tasks);
  }
  if (motionChanged) {
    setStore(STORE_KEYS.motionTasks, motionTasks);
  }

  return {
    archivedTasks: newlyArchivedTasks,
    archivedMotionTasks: newlyArchivedMotionTasks
  };
}

export function restoreTask(
  taskId: string,
  userId: string,
  userOverride?: User
): { success: boolean; message: string; task?: CreativeTask } {
  const user = userOverride || getUserById(userId);
  if (!user) {
    return { success: false, message: 'User tidak ditemukan.' };
  }

  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) {
    return { success: false, message: 'Task tidak ditemukan.' };
  }

  const task = tasks[idx];
  const isEligibleForRestore = task.is_archived === true ||
    task.status_design === 'DESIGN_APPROVED' ||
    task.status_design === 'TASK_CLOSED';

  if (!isEligibleForRestore) {
    return { success: false, message: 'Task tidak berada dalam status terarsip atau disetujui.' };
  }

  // Authorization check
  if (!canUserRestoreTask(user.role_name, userId, task)) {
    return {
      success: false,
      message: `Role ${user.role_name} tidak memiliki kewenangan untuk memulihkan task ini.`
    };
  }

  const beforeState = { is_archived: task.is_archived, archived_at: task.archived_at, status_design: task.status_design };
  task.is_archived = false;
  task.archived_at = null;
  task.archived_by = null;
  task.archive_period = null;
  task.archive_reason = null;
  task.restored_at = now();
  task.restored_by = userId;
  task.updated_at = now();

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  addAuditLog('creative_tasks', task.task_code, 'RESTORE', userId, beforeState, {
    is_archived: false,
    restored_at: task.restored_at,
    restored_by: userId
  });

  try {
    const client = getClientById(task.client_id);
    const contentType = getContentTypeById(task.content_type_id);
    const { targetTab, payload } = buildTaskSyncPayload(
      task,
      client?.name,
      contentType?.name
    );
    void enqueueGoogleSheetsSync({
      idempotencyKey: `RESTORE_TASK_${task.task_code}_${Date.now()}`,
      eventType: 'UPDATE_TASK',
      entityId: task.id,
      taskCode: task.task_code,
      targetTab,
      payload,
    });
  } catch {
    // Graceful offline fallback
  }

  // Notify team
  const recipients = new Set<string>();
  if (task.created_by) recipients.add(task.created_by);
  if (task.design_pic_id) recipients.add(task.design_pic_id);
  if (task.strat_pic_id) recipients.add(task.strat_pic_id);
  if (task.strat_pic_ids) task.strat_pic_ids.forEach(id => id && recipients.add(id));
  recipients.delete(userId);

  recipients.forEach(uid => {
    addNotification(
      uid,
      'Task Dipulihkan dari Arsip',
      `Task ${task.task_code} (${task.campaign_name}) telah dipulihkan dari arsip oleh ${user.full_name}.`,
      'info',
      `/dashboard/tasks?taskId=${task.id}`
    );
  });

  return {
    success: true,
    message: `Task ${task.task_code} berhasil dipulihkan ke board kerja aktif.`,
    task
  };
}

export function restoreMotionTask(
  motionTaskId: string,
  userId: string,
  userOverride?: User
): { success: boolean; message: string; motionTask?: MotionTask } {
  const user = userOverride || getUserById(userId);
  if (!user) {
    return { success: false, message: 'User tidak ditemukan.' };
  }

  const motionTasks = getMotionTasks();
  const idx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (idx === -1) {
    return { success: false, message: 'Motion task tidak ditemukan.' };
  }

  const mt = motionTasks[idx];
  const isEligibleForRestore = mt.is_archived === true ||
    mt.status_motion === 'APPROVED' ||
    mt.status_motion === 'COMPLETED';

  if (!isEligibleForRestore) {
    return { success: false, message: 'Motion task tidak berada dalam status terarsip atau disetujui.' };
  }

  // Ensure parentTask is populated if needed for permission check
  if (mt.task_id && !(mt as any).parentTask) {
    const parentTask = getTasks().find(t => t.id === mt.task_id);
    if (parentTask) {
      (mt as any).parentTask = parentTask;
    }
  }

  // Authorization check
  if (!canUserRestoreTask(user.role_name, userId, mt)) {
    return {
      success: false,
      message: `Role ${user.role_name} tidak memiliki kewenangan untuk memulihkan motion task ini.`
    };
  }

  const beforeState = { is_archived: mt.is_archived, archived_at: mt.archived_at, status_motion: mt.status_motion };
  mt.is_archived = false;
  mt.archived_at = null;
  mt.archived_by = null;
  mt.archive_period = null;
  mt.archive_reason = null;
  mt.restored_at = now();
  mt.restored_by = userId;
  mt.updated_at = now();

  motionTasks[idx] = mt;
  setStore(STORE_KEYS.motionTasks, motionTasks);

  // If linked to a parent task that is also archived, unarchive parent task
  if (mt.task_id) {
    const tasks = getTasks();
    const parentIdx = tasks.findIndex(t => t.id === mt.task_id);
    if (parentIdx !== -1 && tasks[parentIdx].is_archived) {
      tasks[parentIdx].is_archived = false;
      tasks[parentIdx].restored_at = now();
      tasks[parentIdx].restored_by = userId;
      tasks[parentIdx].updated_at = now();
      setStore(STORE_KEYS.tasks, tasks);
    }
  }

  addAuditLog('motion_tasks', mt.id, 'RESTORE', userId, beforeState, {
    is_archived: false,
    restored_at: mt.restored_at,
    restored_by: userId
  });

  try {
    const parent = mt.task_id ? getTasks().find(t => t.id === mt.task_id) : undefined;
    const client = mt.client_id ? getClientById(mt.client_id) : (parent?.client_id ? getClientById(parent.client_id) : undefined);
    const { targetTab, payload } = buildMotionTaskSyncPayload(
      mt,
      client?.name
    );
    const taskCode = parent?.task_code || mt.id;
    void enqueueGoogleSheetsSync({
      idempotencyKey: `RESTORE_MOTION_${mt.id}_${Date.now()}`,
      eventType: 'UPDATE_MOTION',
      entityId: mt.id,
      taskCode,
      targetTab,
      payload,
    });
  } catch {
    // Graceful offline fallback
  }

  // Notify team
  const recipients = new Set<string>();
  if (mt.motion_pic_id) recipients.add(mt.motion_pic_id);
  recipients.delete(userId);

  recipients.forEach(uid => {
    addNotification(
      uid,
      'Motion Task Dipulihkan dari Arsip',
      `Motion task telah dipulihkan dari arsip oleh ${user.full_name}.`,
      'info',
      `/dashboard/motion?taskId=${mt.id}`
    );
  });

  return {
    success: true,
    message: `Motion task berhasil dipulihkan ke board kerja aktif.`,
    motionTask: mt
  };
}


// ============================================================
// TASK ATTACHMENTS MANAGEMENT (BRIEF & DETAIL SECTIONS)
// ============================================================

export function getTaskAttachments(taskId: string): TaskAttachment[] {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === taskId || t.task_code === taskId);
  if (task) {
    return task.attachments || [];
  }
  const motionTasks = getMotionTasks();
  const mTask = motionTasks.find(mt => mt.id === taskId || mt.task_id === taskId);
  if (mTask) {
    return mTask.attachments || [];
  }
  return [];
}

export function addTaskAttachment(taskId: string, attachment: TaskAttachment): CreativeTask | MotionTask | null {
  const tasks = getTasks();
  const taskIdx = tasks.findIndex(t => t.id === taskId || t.task_code === taskId);
  if (taskIdx !== -1) {
    const task = tasks[taskIdx];
    const current = task.attachments || [];
    const updated = [...current.filter(a => a.id !== attachment.id), attachment];
    task.attachments = updated;
    const cleanNotes = (task.notes || '').replace(/\[ATTACHMENTS:\[[\s\S]*?\]\]\n?/g, '').trim();
    task.notes = `[ATTACHMENTS:${JSON.stringify(updated)}]\n${cleanNotes}`.trim();
    task.updated_at = now();
    tasks[taskIdx] = task;
    setStore(STORE_KEYS.tasks, tasks);
    return task;
  }

  const motionTasks = getMotionTasks();
  const mIdx = motionTasks.findIndex(mt => mt.id === taskId);
  if (mIdx !== -1) {
    const mTask = motionTasks[mIdx];
    const current = mTask.attachments || [];
    const updated = [...current.filter(a => a.id !== attachment.id), attachment];
    mTask.attachments = updated;
    const cleanNotes = (mTask.notes || '').replace(/\[ATTACHMENTS:\[[\s\S]*?\]\]\n?/g, '').trim();
    mTask.notes = `[ATTACHMENTS:${JSON.stringify(updated)}]\n${cleanNotes}`.trim();
    mTask.updated_at = now();
    motionTasks[mIdx] = mTask;
    setStore(STORE_KEYS.motionTasks, motionTasks);
    return mTask;
  }

  return null;
}

export function removeTaskAttachment(taskId: string, attachmentId: string): CreativeTask | MotionTask | null {
  const tasks = getTasks();
  const taskIdx = tasks.findIndex(t => t.id === taskId || t.task_code === taskId);
  if (taskIdx !== -1) {
    const task = tasks[taskIdx];
    const updated = (task.attachments || []).filter(a => a.id !== attachmentId);
    task.attachments = updated;
    const cleanNotes = (task.notes || '').replace(/\[ATTACHMENTS:\[[\s\S]*?\]\]\n?/g, '').trim();
    if (updated.length > 0) {
      task.notes = `[ATTACHMENTS:${JSON.stringify(updated)}]\n${cleanNotes}`.trim();
    } else {
      task.notes = cleanNotes;
    }
    task.updated_at = now();
    tasks[taskIdx] = task;
    setStore(STORE_KEYS.tasks, tasks);
    return task;
  }

  const motionTasks = getMotionTasks();
  const mIdx = motionTasks.findIndex(mt => mt.id === taskId);
  if (mIdx !== -1) {
    const mTask = motionTasks[mIdx];
    const updated = (mTask.attachments || []).filter(a => a.id !== attachmentId);
    mTask.attachments = updated;
    const cleanNotes = (mTask.notes || '').replace(/\[ATTACHMENTS:\[[\s\S]*?\]\]\n?/g, '').trim();
    if (updated.length > 0) {
      mTask.notes = `[ATTACHMENTS:${JSON.stringify(updated)}]\n${cleanNotes}`.trim();
    } else {
      mTask.notes = cleanNotes;
    }
    mTask.updated_at = now();
    motionTasks[mIdx] = mTask;
    setStore(STORE_KEYS.motionTasks, motionTasks);
    return mTask;
  }

  return null;
}

// ------------------------------------------------------------
// WEEKLY ISSUES & CHALLENGES REPORTING
// ------------------------------------------------------------

export const SEED_WEEKLY_ISSUES: WeeklyIssue[] = [
  {
    id: 'issue-w1-01',
    year: 2026,
    month: 10,
    week: 'W1',
    title: 'Asset Delay dari Client (SLA Breach)',
    category: 'ASSET_DELAY',
    severity: 'HIGH',
    status: 'ACTIVE',
    description: 'Raw asset foto produk resolusi tinggi terlambat dikirim dari brand 3 hari sehingga pengerjaan tertunda.',
    affected_pipeline: 'GD_MOCKUP',
    related_task_code: 'REQ-2026-0005',
    reported_by_name: 'Nadya (Designer)',
    created_at: '2026-10-05T09:00:00Z',
    updated_at: '2026-10-05T09:00:00Z'
  },
  {
    id: 'issue-w2-01',
    year: 2026,
    month: 10,
    week: 'W2',
    title: 'Perubahan Brief Campaign di Tengah Jalan',
    category: 'CAMPAIGN',
    severity: 'MEDIUM',
    status: 'RESOLVED',
    description: 'Tema promo campaign Payday mendadak diganti dari diskon 50% menjadi cashback voucher, konsep deck dan desain dirombak.',
    affected_pipeline: 'STRATEGIC',
    related_task_code: 'REQ-2026-0012',
    reported_by_name: 'Ira (Strategic Lead)',
    resolution_notes: 'Konsep telah disepakati ulang dengan brand manager, revisi v2 disetujui.',
    created_at: '2026-10-12T11:00:00Z',
    updated_at: '2026-10-13T16:00:00Z'
  },
  {
    id: 'issue-w3-01',
    year: 2026,
    month: 10,
    week: 'W3',
    title: 'Siklus Kerja Aman & On-Time',
    category: 'AMAN',
    severity: 'LOW',
    status: 'AMAN',
    description: 'Seluruh brief dan asset diterima tepat waktu. Delivery mockup dan e-commerce selesai tanpa kendala.',
    affected_pipeline: 'ALL',
    reported_by_name: 'System / Team Lead',
    created_at: '2026-10-18T10:00:00Z',
    updated_at: '2026-10-18T10:00:00Z'
  }
];

export function getWeeklyIssues(year?: number, month?: number): WeeklyIssue[] {
  const all = getStore<WeeklyIssue>(STORE_KEYS.weeklyIssues, SEED_WEEKLY_ISSUES);
  if (year && month) {
    return all.filter(i => Number(i.year) === Number(year) && Number(i.month) === Number(month));
  }
  if (year) {
    return all.filter(i => Number(i.year) === Number(year));
  }
  return all;
}

export function createWeeklyIssue(input: CreateWeeklyIssueInput, userId?: string): WeeklyIssue {
  const issues = getWeeklyIssues();
  const newIssue: WeeklyIssue = {
    id: generateUUID(),
    year: input.year,
    month: input.month,
    week: input.week,
    title: input.title.trim(),
    category: input.category,
    severity: input.severity || (input.category === 'AMAN' ? 'LOW' : 'MEDIUM'),
    status: input.status || (input.category === 'AMAN' ? 'AMAN' : 'ACTIVE'),
    description: input.description.trim(),
    affected_pipeline: input.affected_pipeline || 'ALL',
    related_task_code: input.related_task_code?.trim() || null,
    reported_by: userId || input.reported_by || 'system',
    reported_by_name: input.reported_by_name || 'Team Member',
    created_at: now(),
    updated_at: now(),
  };

  issues.unshift(newIssue);
  setStore(STORE_KEYS.weeklyIssues, issues);
  return newIssue;
}

export function updateWeeklyIssue(id: string, updates: Partial<WeeklyIssue>): WeeklyIssue | null {
  const issues = getWeeklyIssues();
  const idx = issues.findIndex(i => i.id === id);
  if (idx === -1) return null;

  const current = issues[idx];
  const updated: WeeklyIssue = {
    ...current,
    ...updates,
    updated_at: now(),
  };
  issues[idx] = updated;
  setStore(STORE_KEYS.weeklyIssues, issues);
  return updated;
}

export function deleteWeeklyIssue(id: string): boolean {
  const issues = getWeeklyIssues();
  const filtered = issues.filter(i => i.id !== id);
  if (filtered.length !== issues.length) {
    setStore(STORE_KEYS.weeklyIssues, filtered);
    return true;
  }
  return false;
}

