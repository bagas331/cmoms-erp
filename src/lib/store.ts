// ============================================================
// CMOMS - Data Store (localStorage-based)
// ============================================================

import {
  TaskComment,
  AuditLog, Client, ContentType, CreativeTask, Holiday,
  MotionTask, Notification, Role, TaskRevision, User,
  TaskWithRelations, DesignerWorkload, DashboardStats,
  CreateTaskInput, AssignTaskInput, SubmitTaskInput, RevisionInput,
  DesignStatus, MotionStatus, AuditAction, StratStatus, SubmitStrategicInput, MotionDifficulty, RoleName, DesignDifficulty,
  NotificationType
} from './types';
import {
  SEED_ROLES, SEED_USERS, SEED_CLIENTS, SEED_CONTENT_TYPES,
  SEED_HOLIDAYS, SEED_TASKS, SEED_MOTION_TASKS, SEED_REVISIONS,
  SEED_AUDIT_LOGS, SEED_NOTIFICATIONS,
} from './seed-data';
import { DIFFICULTY_WEIGHTS, ROLE_LABELS, DESIGN_STATUS_LABELS, MOTION_STATUS_LABELS } from './constants';
import { calculateBusinessDays, evaluateOperationalExcellence, formatDate } from './sla-engine';
import { generateUUID, generateTaskCode, now, getCurrentYear, safeJsonParse, sanitizeUrl, sanitizeChatMessage, validateChatAttachment, sanitizeChatMediaUrl } from './utils';

const STORE_KEYS = {
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
  initialized: 'cmoms_initialized',
};

// --- HELPERS ---
const memoryStore = new Map<string, string>();

function getStore<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') {
    const data = memoryStore.get(key);
    if (!data) return fallback;
    return safeJsonParse<T[]>(data, fallback);
  }
  const data = localStorage.getItem(key);
  if (!data) return fallback;
  return safeJsonParse<T[]>(data, fallback);
}

function setStore<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') {
    memoryStore.set(key, JSON.stringify(data));
    return;
  }
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('store_changed'));
}

function getSequence(): number {
  if (typeof window === 'undefined') {
    return parseInt(memoryStore.get(STORE_KEYS.taskSequence) || '36', 10);
  }
  return parseInt(localStorage.getItem(STORE_KEYS.taskSequence) || '36', 10);
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
  setStore(STORE_KEYS.tasks, SEED_TASKS);
  setStore(STORE_KEYS.motionTasks, SEED_MOTION_TASKS);
  setStore(STORE_KEYS.revisions, SEED_REVISIONS);
  setStore(STORE_KEYS.auditLogs, SEED_AUDIT_LOGS);
  setStore(STORE_KEYS.notifications, SEED_NOTIFICATIONS);
  setSequence(36);
  localStorage.setItem(STORE_KEYS.initialized, 'true');
}

export function resetStore(): void {
  if (typeof window === 'undefined') return;
  Object.values(STORE_KEYS).forEach(key => localStorage.removeItem(key));
  initializeStore();
}

// --- GETTERS ---
export function getRoles(): Role[] { return getStore<Role>(STORE_KEYS.roles, SEED_ROLES); }
export function getUsers(): User[] { return getStore<User>(STORE_KEYS.users, SEED_USERS); }
export function getClients(): Client[] { return getStore<Client>(STORE_KEYS.clients, SEED_CLIENTS); }
export function getContentTypes(): ContentType[] { return getStore<ContentType>(STORE_KEYS.contentTypes, SEED_CONTENT_TYPES); }
export function getHolidays(): Holiday[] { return getStore<Holiday>(STORE_KEYS.holidays, SEED_HOLIDAYS); }
export function getTasks(): CreativeTask[] { return getStore<CreativeTask>(STORE_KEYS.tasks, SEED_TASKS); }
export function getMotionTasks(): MotionTask[] { return getStore<MotionTask>(STORE_KEYS.motionTasks, SEED_MOTION_TASKS); }
export function getRevisions(): TaskRevision[] { return getStore<TaskRevision>(STORE_KEYS.revisions, SEED_REVISIONS); }
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
  return getUsers().find(u => u.id === id);
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

  const strat_pic_names = strat_pic_ids.map(id => getUserById(id)?.full_name || '').filter(Boolean);
  const strat_pic_name = strat_pic_names.length > 0 
    ? strat_pic_names.join(', ') 
    : (task.strat_pic_id ? getUserById(task.strat_pic_id)?.full_name || null : null);

  const isApprovedOrClosed = task.status_design === 'DESIGN_APPROVED' || task.status_design === 'TASK_CLOSED';
  const resolvedApprovedAt = task.approved_at || (isApprovedOrClosed ? (task.submission_date ? `${task.submission_date}T00:00:00Z` : task.updated_at || task.created_at) : null);

  return {
    ...task,
    approved_at: resolvedApprovedAt,
    notes: displayNotes,
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
  const seq = getSequence() + 1;
  setSequence(seq);

  const taskCode = generateTaskCode(getCurrentYear(), seq);

  let rawStratPicIds: string[] = [];
  if (input.strat_pic_ids && Array.isArray(input.strat_pic_ids)) {
    rawStratPicIds = input.strat_pic_ids.filter(id => Boolean(id && id.trim()));
  } else if (input.strat_pic_id && input.strat_pic_id.trim()) {
    rawStratPicIds = [input.strat_pic_id.trim()];
  }

  let finalNotes = input.notes || '';
  if (input.requires_strategic_concept && rawStratPicIds.length > 0) {
    finalNotes = `[STRAT_PICS:${JSON.stringify(rawStratPicIds)}]\n${finalNotes}`.trim();
  }

  const newTask: CreativeTask = {
    id: generateUUID(),
    task_code: taskCode,
    client_id: input.client_id,
    campaign_name: input.campaign_name,
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
    requires_strategic_concept: input.requires_strategic_concept,
    strat_pic_id: (input.requires_strategic_concept && rawStratPicIds.length > 0) ? rawStratPicIds[0] : null,
    strat_pic_ids: rawStratPicIds,
    status_strat: input.requires_strategic_concept ? 'PENDING' : 'NOT_REQUIRED',
    strat_revision_count: 0,
    design_pic_id: null,
    design_difficulty: null,
    design_revision_count: 0,
    status_design: input.requires_strategic_concept ? 'STRAT_PENDING' : 'DESIGN_UNASSIGNED',
    motion_readiness: 'WAITING_ASSET_GD',
    final_asset_name: null,
    final_asset_link: null,
    operator_id: null,
    notes: finalNotes,
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
    campaign: input.campaign_name,
  });

  // Notify team lead
  const leads = getUsers().filter(u => u.role_name === 'TEAM_LEAD');
  leads.forEach(lead => {
    addNotification(lead.id, 'New Task Created', `${taskCode} - ${client?.name} ${input.campaign_name} telah didaftarkan.`, 'info', '/dashboard/tasks');
  });

  return newTask;
}

export function editTask(taskId: string, input: CreateTaskInput, editedBy: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  const beforeState = { 
    client_id: task.client_id, campaign_name: task.campaign_name, content_type_id: task.content_type_id,
    task_source: task.task_source, platform: task.platform, req_qty: task.req_qty, 
    req_date: task.req_date, due_date: task.due_date, notes: task.notes 
  };

  let rawStratPicIds: string[] | null = null;
  if (input.strat_pic_ids !== undefined) {
    rawStratPicIds = input.strat_pic_ids.filter(id => Boolean(id && id.trim()));
  } else if (input.strat_pic_id !== undefined) {
    rawStratPicIds = input.strat_pic_id ? [input.strat_pic_id.trim()] : [];
  }

  let baseNotes = input.notes || '';
  let stratConceptTag = '';
  if (task.notes && task.notes.includes('[STRAT_CONCEPT:')) {
    const match = task.notes.match(/\[STRAT_CONCEPT:\{[\s\S]*?\}\]/);
    if (match) stratConceptTag = match[0];
  }
  baseNotes = baseNotes.replace(/\[STRAT_CONCEPT:\{[\s\S]*?\}\]\n?/g, '')
                       .replace(/\[STRAT_PICS:\[[\s\S]*?\]\]\n?/g, '')
                       .trim();

  let stratPicsTag = '';
  if (rawStratPicIds && rawStratPicIds.length > 0 && input.requires_strategic_concept) {
    stratPicsTag = `[STRAT_PICS:${JSON.stringify(rawStratPicIds)}]`;
  }

  let finalNotes = baseNotes;
  if (stratConceptTag) finalNotes = `${stratConceptTag}\n${finalNotes}`.trim();
  if (stratPicsTag) finalNotes = `${stratPicsTag}\n${finalNotes}`.trim();
  
  task.client_id = input.client_id;
  task.campaign_name = input.campaign_name;
  task.content_type_id = input.content_type_id;
  task.task_source = input.task_source;
  task.platform = input.platform;
  task.req_qty = input.req_qty;
  task.req_date = input.req_date;
  task.due_date = input.due_date;
  task.requires_strategic_concept = input.requires_strategic_concept;
  if (rawStratPicIds !== null) {
    task.strat_pic_id = (input.requires_strategic_concept && rawStratPicIds.length > 0) ? rawStratPicIds[0] : null;
    task.strat_pic_ids = rawStratPicIds;
  }
  task.notes = finalNotes;
  task.updated_at = now();

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  const client = getClientById(input.client_id);
  addAuditLog('creative_tasks', task.task_code, 'EDIT' as any, editedBy, beforeState, {
    client_id: task.client_id, campaign_name: task.campaign_name, content_type_id: task.content_type_id,
    task_source: task.task_source, platform: task.platform, req_qty: task.req_qty, 
    req_date: task.req_date, due_date: task.due_date, notes: task.notes 
  });
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

  const isStratPhase = task.status_design === 'STRAT_PENDING' || (task.requires_strategic_concept && task.status_strat !== 'APPROVED');

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
      assignedBy
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

export function updateStratStatus(taskId: string, newStatus: StratStatus, userId: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  const beforeState = { status_strat: task.status_strat };
  task.status_strat = newStatus;
  if (newStatus === 'APPROVED') {
    task.status_design = task.design_pic_id ? 'DESIGN_ASSIGNED' : 'DESIGN_UNASSIGNED';
  }
  task.updated_at = now();

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  addAuditLog('creative_tasks', task.task_code, 'STATUS_TRANSITION', userId, beforeState, {
    status_strat: newStatus,
    status_design: task.status_design
  });

  if (newStatus === 'APPROVED') {
    const recipients = new Set<string>();
    if (task.strat_pic_id) recipients.add(task.strat_pic_id);
    if (task.created_by) recipients.add(task.created_by);
    if (task.design_pic_id) recipients.add(task.design_pic_id);
    recipients.delete(userId);

    recipients.forEach(uid => {
      addNotification(
        uid,
        'Strategic Concept Disetujui',
        `Strategic Concept pada request ${task.task_code} telah disetujui.`,
        'success',
        `/dashboard/tasks?taskId=${task.id}&tab=details`,
        task.id,
        userId
      );
    });
  }
}

export function submitStrategicConcept(taskId: string, input: SubmitStrategicInput, userId: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  task.status_strat = 'REVIEW';
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
    notes: input.notes
  });

  const recipients = new Set<string>();
  if (task.created_by) recipients.add(task.created_by);
  if (task.design_pic_id) recipients.add(task.design_pic_id);
  recipients.delete(userId);

  recipients.forEach(uid => {
    addNotification(
      uid,
      'Strategic Concept Disubmit',
      `Strategic Concept untuk request ${task.task_code} telah disubmit untuk review.`,
      'info',
      `/dashboard/tasks?taskId=${task.id}&tab=details`,
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
  const oldStatus = task.status_design;
  const beforeState = { status_design: task.status_design };
  task.status_design = newStatus;
  task.updated_at = now();
  if (newStatus === 'DESIGN_APPROVED') {
    task.approved_at = task.approved_at || now();
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

  addAuditLog('creative_tasks', task.task_code, 'STATUS_TRANSITION', userId, beforeState, {
    status_design: newStatus,
    ...(task.submission_date ? { submission_date: task.submission_date, sla_working_days: task.sla_working_days, operational_excellence: task.operational_excellence } : {}),
  });

  // If approved and motion_readyness, create motion subtask
  if (newStatus === 'DESIGN_APPROVED') {
    if (task.motion_readiness === 'READY_TO_ANIMATE') {
      createMotionSubtask(task.id, userId);
    }
  }

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
  if (input.stage === 'STRATEGIC') {
    task.strat_revision_count = (task.strat_revision_count || 0) + 1;
    task.status_strat = 'REVISION';
  } else {
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
  });
  setStore(STORE_KEYS.revisions, revisions);

  addAuditLog('creative_tasks', task.task_code, 'REVISION_REQUEST', requestedBy,
    { status_design: 'DESIGN_SUBMITTED' },
    { status_design: task.status_design, revision_count: task.design_revision_count }
  );

  const performerName = getUserById(requestedBy)?.full_name || 'User';
  const recipients = new Set<string>();

  if (input.stage === 'STRATEGIC') {
    if (task.strat_pic_id) recipients.add(task.strat_pic_id);
    if (task.strat_pic_ids) task.strat_pic_ids.forEach(id => id && recipients.add(id));
    if (task.created_by) recipients.add(task.created_by);
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
      'Request Membutuhkan Revisi',
      `Request ${task.task_code} (${task.campaign_name}) membutuhkan revisi [${input.stage}] dari ${performerName}.`,
      'warning',
      `/dashboard/tasks?taskId=${task.id}&tab=details`,
      task.id,
      requestedBy,
      performerName
    );
  });
}

export function setMotionReadyness(taskId: string, ready: boolean, userId: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  tasks[idx].motion_readiness = ready ? 'READY_TO_ANIMATE' : 'WAITING_ASSET_GD';
  tasks[idx].updated_at = now();
  setStore(STORE_KEYS.tasks, tasks);

  if (ready && tasks[idx].status_design === 'DESIGN_APPROVED') {
    createMotionSubtask(taskId, userId);

    const task = tasks[idx];
    const recipients = new Set<string>();
    if (task.created_by) recipients.add(task.created_by);
    recipients.delete(userId);

    recipients.forEach(uid => {
      addNotification(
        uid,
        'Asset Siap untuk Motion',
        `Asset GD untuk request ${task.task_code} (${task.campaign_name}) telah siap dianimasikan.`,
        'info',
        '/dashboard/motion',
        task.id,
        userId
      );
    });
  }
}

function createMotionSubtask(taskId: string, userId: string): void {
  const motionTasks = getMotionTasks();
  const existing = motionTasks.find(mt => mt.task_id === taskId);
  if (existing) return;

  const task = getTasks().find(t => t.id === taskId);
  if (!task) return;

  const newMotion: MotionTask = {
    id: generateUUID(),
    task_id: taskId,
    motion_pic_id: null,
    motion_difficulty: 'LVL_2_MEDIUM',
    motion_revision_count: 0,
    status_motion: 'QUEUED',
    apply_date: null,
    link_motion: null,
    notes: '',
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
}

export function createStandaloneMotionTask(input: CreateStandaloneMotionInput, userId: string): MotionTask {
  const motionTasks = getMotionTasks();
  const seq = getSequence();
  setSequence(seq + 1);
  const idStr = seq.toString().padStart(4, '0');
  const taskId = `MOT-${new Date().getFullYear()}-${idStr}`;

  const newTask: MotionTask = {
    id: taskId,
    task_id: null,
    client_id: input.client_id,
    platform: input.platform,
    motion_type: input.motion_type,
    campaign_type: input.campaign_type,
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
    notes: '',
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

  return newTask;
}

export function editStandaloneMotionTask(motionTaskId: string, input: CreateStandaloneMotionInput, userId: string): void {
  const motionTasks = getMotionTasks();
  const idx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (idx === -1) return;

  const task = motionTasks[idx];
  const beforeState = { ...task };
  
  task.client_id = input.client_id;
  task.platform = input.platform;
  task.motion_type = input.motion_type;
  task.campaign_type = input.campaign_type;
  task.production_date = input.production_date;
  task.period_start = input.period_start;
  task.period_end = input.period_end;
  task.studio = input.studio;
  
  // Only update motion_pic_id if it's currently unassigned to avoid accidentally removing assigned PIC
  if (input.motion_pic_id) {
    task.motion_pic_id = input.motion_pic_id;
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


export function assignOperatorToMotionTask(motionTaskId: string, operatorId: string, userId: string): void {
  const motionTasks = getMotionTasks();
  const mtIdx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (mtIdx === -1) return;
  
  motionTasks[mtIdx].operator_id = operatorId;
  motionTasks[mtIdx].status_motion = 'COMPLETED';
  motionTasks[mtIdx].updated_at = now();
  setStore(STORE_KEYS.motionTasks, motionTasks);

  const taskId = motionTasks[mtIdx].task_id;
  if (taskId) {
    const tasks = getTasks();
    const tIdx = tasks.findIndex(t => t.id === taskId);
    if (tIdx !== -1) {
      tasks[tIdx].operator_id = operatorId;
      tasks[tIdx].status_design = 'TASK_CLOSED';
      tasks[tIdx].updated_at = now();
      setStore(STORE_KEYS.tasks, tasks);
    }
  }

  addAuditLog(
    'MotionTask',
    motionTaskId,
    'STATUS_TRANSITION',
    userId,
    null,
    { status_motion: 'COMPLETED', operator_id: operatorId }
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
  if ((status === 'APPROVED' || status === 'COMPLETED') && !mt.approved_at) {
    mt.approved_at = now();
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
