// ============================================================
// CMOMS - Data Store (localStorage-based)
// ============================================================

import {
  TaskComment,
  AuditLog, Client, ContentType, CreativeTask, Holiday,
  MotionTask, Notification, Role, TaskRevision, User,
  TaskWithRelations, DesignerWorkload, DashboardStats,
  CreateTaskInput, AssignTaskInput, SubmitTaskInput, RevisionInput,
  DesignStatus, MotionStatus, AuditAction,
} from './types';
import {
  SEED_ROLES, SEED_USERS, SEED_CLIENTS, SEED_CONTENT_TYPES,
  SEED_HOLIDAYS, SEED_TASKS, SEED_MOTION_TASKS, SEED_REVISIONS,
  SEED_AUDIT_LOGS, SEED_NOTIFICATIONS,
} from './seed-data';
import { DIFFICULTY_WEIGHTS } from './constants';
import { calculateBusinessDays, evaluateOperationalExcellence, formatDate } from './sla-engine';
import { generateUUID, generateTaskCode, now, getCurrentYear } from './utils';

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
function getStore<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback;
  const data = localStorage.getItem(key);
  if (!data) return fallback;
  try { return JSON.parse(data); } catch { return fallback; }
}

function setStore<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('store_changed'));
}

function getSequence(): number {
  if (typeof window === 'undefined') return 36;
  return parseInt(localStorage.getItem(STORE_KEYS.taskSequence) || '36', 10);
}

function setSequence(seq: number): void {
  if (typeof window === 'undefined') return;
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
  const stratPic = task.strat_pic_id ? getUserById(task.strat_pic_id) : null;
  const createdBy = getUserById(task.created_by);
  const motionTask = getMotionTasks().find(mt => mt.task_id === task.id);
  const motionPic = motionTask?.motion_pic_id ? getUserById(motionTask.motion_pic_id) : null;
  const revisions = getRevisions().filter(r => r.task_id === task.id);

  return {
    ...task,
    client_name: client?.name || 'Unknown',
    client_type: client?.client_type || 'EXTERNAL',
    content_type_name: contentType?.name || 'Unknown',
    design_pic_name: designPic?.full_name || null,
    strat_pic_name: stratPic?.full_name || null,
    created_by_name: createdBy?.full_name || 'Unknown',
    motion_task: motionTask || null,
    operator_name: null,
      motion_pic_name: motionPic?.full_name || null,
    revisions,
  };
}

export function getAllTasksWithRelations(): TaskWithRelations[] {
  return getTasks().map(task => getTaskWithRelations(task.id)!).filter(Boolean);
}

export function getDesignerWorkloads(): DesignerWorkload[] {
  const users = getUsers().filter(u => u.role_name === 'DESIGNER' || u.role_name === 'TEAM_LEAD');
  const tasks = getTasks();

  return users.filter(u => u.daily_capacity_points > 0).map(user => {
    const activeTasks = tasks.filter(
      t => t.design_pic_id === user.id &&
        !['TASK_CLOSED', 'DESIGN_APPROVED'].includes(t.status_design)
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

export function getDashboardStats(): DashboardStats {
  const tasks = getAllTasksWithRelations();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const thisMonthTasks = tasks.filter(t => {
    const d = new Date(t.req_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const activeTasks = tasks.filter(t => !['TASK_CLOSED'].includes(t.status_design));
  const submittedOrApproved = thisMonthTasks.filter(t => t.operational_excellence);
  const excellenceCount = submittedOrApproved.filter(t => t.operational_excellence === 'EXCELLENCE').length;

  return {
    active_tasks: activeTasks.length,
    unassigned_tasks: tasks.filter(t => t.status_design === 'DESIGN_UNASSIGNED').length,
    in_progress_tasks: tasks.filter(t => t.status_design === 'DESIGN_IN_PROGRESS').length,
    submitted_tasks: tasks.filter(t => t.status_design === 'DESIGN_SUBMITTED').length,
    completed_tasks: tasks.filter(t => t.status_design === 'TASK_CLOSED').length,
    motion_queue: getMotionTasks().filter(mt => mt.status_motion === 'QUEUED' || mt.status_motion === 'IN_PROGRESS').length,
    sla_compliance_rate: submittedOrApproved.length > 0
      ? (excellenceCount / submittedOrApproved.length) * 100
      : 0,
    total_tasks_this_month: thisMonthTasks.length,
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
export function addComment(taskId: string, userId: string, content: string): TaskComment {
  const comments = getComments();
  const user = getUserById(userId);
  const task = getTasks().find(t => t.id === taskId);
  
  const newComment: TaskComment = {
    id: generateUUID(),
    task_id: taskId,
    user_id: userId,
    user_name: user ? user.full_name : 'Unknown User',
    user_avatar: user ? user.avatar_initials : '?',
    content,
    created_at: now(),
  };
  comments.push(newComment);
  setStore(STORE_KEYS.comments, comments);
  
  // Create notification for other involved parties
  if (task) {
    const notifyUsers = new Set<string>();
    if (task.created_by && task.created_by !== userId) notifyUsers.add(task.created_by);
    if (task.design_pic_id && task.design_pic_id !== userId) notifyUsers.add(task.design_pic_id);
    if (task.strat_pic_id && task.strat_pic_id !== userId) notifyUsers.add(task.strat_pic_id);
    
    notifyUsers.forEach(id => {
      addNotification(id, 'New Comment', `${newComment.user_name} commented on task ${task.task_code}`, 'info', '/dashboard/tasks');
    });
  }
  
  return newComment;
}

export function deleteUser(userId: string): void {
  const users = getUsers();
  const filteredUsers = users.filter(u => u.id !== userId);
  setStore(STORE_KEYS.users, filteredUsers);
}

export function createUser(input: {
  email: string;
  role_name: any;
  daily_capacity_points?: number;
}): User {
  const users = getUsers();
  const avatar_initials = input.email.substring(0, 2).toUpperCase();
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
  users[userIdx].avatar_initials = full_name.substring(0, 2).toUpperCase();
  users[userIdx].password_hash = password_hash;
  users[userIdx].is_active = true;
  users[userIdx].is_registered = true;
  users[userIdx].updated_at = now();
  
  setStore(STORE_KEYS.users, users);
  return true;
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

function addNotification(userId: string, title: string, message: string, type: Notification['type'] = 'info', link?: string): void {
  const notifications = getNotifications();
  notifications.unshift({
    id: generateUUID(),
    user_id: userId,
    title,
    message,
    type,
    read: false,
    link,
    created_at: now(),
  });
  setStore(STORE_KEYS.notifications, notifications);
}

export function createTask(input: CreateTaskInput, createdBy: string): CreativeTask {
  const tasks = getTasks();
  const seq = getSequence() + 1;
  setSequence(seq);

  const taskCode = generateTaskCode(getCurrentYear(), seq);
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
    strat_pic_id: input.strat_pic_id || null,
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
    notes: input.notes,
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
  
  task.client_id = input.client_id;
  task.campaign_name = input.campaign_name;
  task.content_type_id = input.content_type_id;
  task.task_source = input.task_source;
  task.platform = input.platform;
  task.req_qty = input.req_qty;
  task.req_date = input.req_date;
  task.due_date = input.due_date;
  task.requires_strategic_concept = input.requires_strategic_concept;
  task.strat_pic_id = input.strat_pic_id || null;
  task.notes = input.notes;
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
  if (!input.design_pic_id) return;
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  const beforeState = { design_pic: task.design_pic_id, status_design: task.status_design, difficulty: task.design_difficulty };

  task.design_pic_id = input.design_pic_id;
  task.design_difficulty = input.design_difficulty || null;
  task.status_design = 'DESIGN_ASSIGNED';
  task.updated_at = now();

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  const designer = getUserById(input.design_pic_id);
  addAuditLog('creative_tasks', task.task_code, 'ASSIGN', assignedBy, beforeState, {
    design_pic: designer?.full_name,
    status_design: 'DESIGN_ASSIGNED',
    difficulty: input.design_difficulty,
  });

  addNotification(input.design_pic_id, 'Task Assigned',
    `Anda ditugaskan mengerjakan ${task.task_code} - ${getClientById(task.client_id)?.name} (${input.design_difficulty}). Due: ${task.due_date}.`,
    'info', '/dashboard/tasks'
  );
}

export function updateTaskStatus(taskId: string, newStatus: DesignStatus, userId: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  const beforeState = { status_design: task.status_design };
  task.status_design = newStatus;
  task.updated_at = now();

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
  if (newStatus === 'DESIGN_APPROVED' && task.motion_readiness === 'READY_TO_ANIMATE') {
    createMotionSubtask(task.id, userId);
  }
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
}

export function requestRevision(taskId: string, input: RevisionInput, requestedBy: string): void {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  task.design_revision_count += 1;
  task.status_design = 'DESIGN_REVISION';
  task.updated_at = now();

  tasks[idx] = task;
  setStore(STORE_KEYS.tasks, tasks);

  const revisions = getRevisions();
  revisions.push({
    id: generateUUID(),
    task_id: taskId,
    stage: input.stage,
    revision_number: task.design_revision_count,
    reason_category: input.reason_category,
    notes: input.notes,
    requested_by: requestedBy,
    created_at: now(),
  });
  setStore(STORE_KEYS.revisions, revisions);

  addAuditLog('creative_tasks', task.task_code, 'REVISION_REQUEST', requestedBy,
    { status_design: 'DESIGN_SUBMITTED', revision_count: task.design_revision_count - 1 },
    { status_design: 'DESIGN_REVISION', revision_count: task.design_revision_count }
  );

  if (task.design_pic_id) {
    addNotification(task.design_pic_id, 'Revision Requested',
      `${task.task_code} memerlukan revisi - ${input.reason_category}: ${input.notes}`,
      'warning', '/dashboard/tasks'
    );
  }
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

export function updateMotionStatus(motionTaskId: string, newStatus: MotionStatus, userId: string): void {
  const motionTasks = getMotionTasks();
  const idx = motionTasks.findIndex(mt => mt.id === motionTaskId);
  if (idx === -1) return;

  motionTasks[idx].status_motion = newStatus;
  motionTasks[idx].updated_at = now();
  setStore(STORE_KEYS.motionTasks, motionTasks);
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

export function submitMotionTask(motionTaskId: string, linkMotion: string, notes: string, userId: string): void {
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

export function assignMotionPic(motionTaskId: string, motionPicId: string, userId: string): void {
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

export function addContentType(name: string, defaultDifficulty: 'LOW' | 'MEDIUM' | 'HIGH'): ContentType {
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
