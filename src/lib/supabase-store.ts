// ============================================================
// CMOMS - Supabase Data Store (Async)
// ============================================================
// Catatan: Ini adalah versi ASINKRON (Promise-based) dari store.ts
// Semua pemanggilan fungsi di bawah ini harus menggunakan await atau .then()

import { supabase } from './supabase';
import {
  TaskComment, AuditLog, Client, ContentType, CreativeTask, Holiday,
  MotionTask, Notification, Role, TaskRevision, User,
  TaskWithRelations, CreateTaskInput, AssignTaskInput, SubmitTaskInput, RevisionInput,
  DesignStatus, MotionStatus, AuditAction, DesignerWorkload, DashboardStats,
  ClientType, RoleName, DesignDifficulty, MotionDifficulty, Platform
} from './types';
import { DIFFICULTY_WEIGHTS } from './constants';
import { calculateBusinessDays, evaluateOperationalExcellence } from './sla-engine';
import { generateTaskCode, getCurrentYear } from './utils';

// --- GETTERS (ASYNC) ---

export async function getUsers(): Promise<User[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  return data as User[];
}

export async function getClients(): Promise<Client[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('clients').select('*');
  if (error) throw error;
  return data as Client[];
}

export async function getContentTypes(): Promise<ContentType[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('content_types').select('*');
  if (error) throw error;
  return data as ContentType[];
}

export async function getHolidays(): Promise<Holiday[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('holidays').select('*');
  if (error) throw error;
  return (data || []).map((h: any) => ({
    ...h,
    holiday_date: h.holiday_date || h.date
  })) as Holiday[];
}

export async function getTasks(): Promise<CreativeTask[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('tasks').select('*');
  if (error) throw error;
  return data as CreativeTask[];
}

export async function getMotionTasks(): Promise<MotionTask[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('motion_tasks').select('*');
  if (error) throw error;
  return (data || []).map((m: any) => ({
    ...m,
    link_motion: m.final_video_link || m.link_motion || null,
    motion_difficulty: m.motion_difficulty || 'LVL_1_SIMPLE',
    notes: m.notes || '',
    apply_date: m.due_date ? m.due_date.substring(0, 10) : null
  })) as MotionTask[];
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Notification[];
}

// --- RELATIONAL GETTER ---

export async function getAllTasksWithRelations(): Promise<TaskWithRelations[]> {
  if (!supabase) return [];
  // Using Supabase Joins
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      client:clients(name, client_type),
      content_type:content_types(name),
      strat_pic:users!strat_pic_id(full_name),
      design_pic:users!design_pic_id(full_name),
      created_by_user:users!created_by(full_name),
      motion_tasks(*, motion_pic:users!motion_pic_id(full_name)),
      task_revisions(*)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data.map((t: any) => ({
    ...t,
    client_name: t.client?.name || 'Unknown',
    client_type: t.client?.client_type || 'EXTERNAL',
    content_type_name: t.content_type?.name || 'Unknown',
    design_pic_name: t.design_pic?.full_name || null,
    strat_pic_name: t.strat_pic?.full_name || null,
    created_by_name: t.created_by_user?.full_name || 'Unknown',
    motion_task: t.motion_tasks && t.motion_tasks.length > 0 ? t.motion_tasks[0] : null,
    motion_pic_name: (t.motion_tasks && t.motion_tasks.length > 0) ? t.motion_tasks[0].motion_pic?.full_name : null,
    revisions: t.task_revisions || []
  }));
}

// --- MUTATORS (ASYNC) ---

export async function createTask(input: CreateTaskInput, createdBy: string): Promise<CreativeTask | null> {
  if (!supabase) return null;
  
  // Create task Code
  const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
  const seq = (count || 0) + 1;
  const taskCode = generateTaskCode(getCurrentYear(), seq);

  const newTask = {
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
    requires_strategic_concept: input.requires_strategic_concept,
    strat_pic_id: input.strat_pic_id || null,
    status_strat: input.requires_strategic_concept ? 'PENDING' : 'NOT_REQUIRED',
    status_design: input.requires_strategic_concept ? 'STRAT_PENDING' : 'DESIGN_UNASSIGNED',
    notes: input.notes,
    created_by: createdBy
  };

  const { data, error } = await supabase.from('tasks').insert([newTask]).select().single();
  if (error) throw error;
  
  await addAuditLog('tasks', data.id, 'CREATE', createdBy, null, data);
  return data as CreativeTask;
}

export async function addAuditLog(
  entityName: string, entityId: string, action: AuditAction,
  performedBy: string, beforeState: any, afterState: any
): Promise<void> {
  if (!supabase) return;
  await supabase.from('audit_logs').insert([{
    entity_name: entityName,
    entity_id: entityId,
    action,
    performed_by: performedBy,
    before_state: beforeState,
    after_state: afterState
  }]);
}

export async function markNotificationsRead(userId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
}

export async function markNotificationAsRead(notifId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('notifications')
    .update({ read: true })
    .eq('id', notifId);
}


export async function assignTask(taskId: string, input: AssignTaskInput, performedBy: string, roleName: string): Promise<void> {
  if (!supabase) return;
  const updates: any = {};
  if (input.design_pic_id) {
    updates.design_pic_id = input.design_pic_id;
    updates.status_design = 'DESIGN_IN_PROGRESS';
  }
  if (input.strat_pic_id) {
    updates.strat_pic_id = input.strat_pic_id;
    updates.status_strat = 'STRAT_IN_PROGRESS';
  }

  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (error) throw error;
  await addAuditLog('tasks', taskId, 'ASSIGN', performedBy, null, updates);
}

export async function updateTaskStatus(taskId: string, newStatus: DesignStatus, userId: string): Promise<void> {
  if (!supabase) return;
  const updates: any = {
    status_design: newStatus,
    updated_at: new Date().toISOString()
  };

  if (newStatus === 'DESIGN_SUBMITTED') {
    const { data: currentTask } = await supabase.from('tasks').select('*').eq('id', taskId).single();
    if (currentTask && !currentTask.submission_date) {
      const holidays = await getHolidays();
      const submissionDate = new Date().toISOString().split('T')[0];
      const workingDays = calculateBusinessDays(currentTask.req_date, submissionDate, holidays);
      updates.submission_date = submissionDate;
      updates.sla_working_days = workingDays;
      updates.operational_excellence = workingDays !== null ? evaluateOperationalExcellence(workingDays) : null;
    }
  }

  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (error) throw error;

  await addAuditLog('creative_tasks', taskId, 'STATUS_TRANSITION', userId, null, updates);

  if (newStatus === 'DESIGN_APPROVED') {
    const { data: t } = await supabase.from('tasks').select('motion_readiness').eq('id', taskId).single();
    if (t?.motion_readiness === 'READY_TO_ANIMATE') {
      const { data: existingMotion } = await supabase.from('motion_tasks').select('id').eq('task_id', taskId).single();
      if (!existingMotion) {
        await supabase.from('motion_tasks').insert([{
          task_id: taskId,
          status_motion: 'QUEUED'
        }]);
      }
    }
  }
}

export async function submitTask(taskId: string, input: SubmitTaskInput, performedBy: string): Promise<void> {
  if (!supabase) return;
  const holidays = await getHolidays();
  const { data: currentTask } = await supabase.from('tasks').select('*').eq('id', taskId).single();
  const submissionDate = new Date().toISOString().split('T')[0];
  let slaWorkingDays = null;
  let operationalExcellence = null;
  if (currentTask?.req_date) {
    slaWorkingDays = calculateBusinessDays(currentTask.req_date, submissionDate, holidays);
    operationalExcellence = slaWorkingDays !== null ? evaluateOperationalExcellence(slaWorkingDays) : null;
  }

  const updates = {
    output_qty: input.output_qty,
    final_asset_name: input.final_asset_name,
    final_asset_link: input.final_asset_link,
    submission_date: submissionDate,
    sla_working_days: slaWorkingDays,
    operational_excellence: operationalExcellence,
    status_design: 'DESIGN_SUBMITTED',
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (error) throw error;
  await addAuditLog('creative_tasks', taskId, 'SUBMIT', performedBy, null, updates);
}

export async function requestRevision(taskId: string, input: RevisionInput, performedBy: string): Promise<void> {
  if (!supabase) return;
  const { data: t } = await supabase.from('tasks').select('design_revision_count, strat_revision_count').eq('id', taskId).single();
  const revCount = input.stage === 'STRATEGIC' ? (t?.strat_revision_count || 0) + 1 : (t?.design_revision_count || 0) + 1;

  const { error: revErr } = await supabase.from('task_revisions').insert([{
    task_id: taskId,
    stage: input.stage,
    revision_number: revCount,
    reason_category: input.reason_category,
    revision_notes: input.notes,
    requested_by: performedBy,
    status: 'PENDING'
  }]);
  if (revErr) throw revErr;

  const updates: any = {
    updated_at: new Date().toISOString()
  };
  if (input.stage === 'STRATEGIC') {
    updates.status_strat = 'REVISION';
    updates.strat_revision_count = revCount;
  } else {
    updates.status_design = 'DESIGN_REVISION';
    updates.design_revision_count = revCount;
  }

  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (error) throw error;
  await addAuditLog('creative_tasks', taskId, 'REVISION_REQUEST', performedBy, null, { ...input, revision_number: revCount });
}

export async function setMotionReadyness(taskId: string, isReady: boolean, performedBy: string): Promise<void> {
  if (!supabase) return;
  const status = isReady ? 'READY_TO_ANIMATE' : 'WAITING_ASSET_GD';
  const { error } = await supabase.from('tasks').update({ motion_readiness: status }).eq('id', taskId);
  if (error) throw error;

  if (isReady) {
    const { data } = await supabase.from('motion_tasks').select('id').eq('task_id', taskId).single();
    if (!data) {
      await supabase.from('motion_tasks').insert([{
        task_id: taskId,
        status_motion: 'QUEUED'
      }]);
    }
  }
}


export async function editTask(taskId: string, input: Partial<CreateTaskInput>, updatedBy: string): Promise<void> {
  if (!supabase) return;
  const updates: any = { ...input, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (error) throw error;
  await addAuditLog('tasks', taskId, 'UPDATE', updatedBy, null, updates);
}

export async function deleteTask(taskId: string, deletedBy: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('task_revisions').delete().eq('task_id', taskId);
  await supabase.from('motion_tasks').delete().eq('task_id', taskId);
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
  await addAuditLog('tasks', taskId, 'DELETE', deletedBy, null, null);
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('audit_logs').select('*').order('timestamp', { ascending: false });
  if (error) throw error;
  return data as AuditLog[];
}

export async function getDesignerWorkloads(): Promise<DesignerWorkload[]> {
  const users = await getUsers();
  const designers = users.filter(u => u.role_name === 'DESIGNER' || u.role_name === 'TEAM_LEAD');
  const tasks = await getTasks();

  return designers.filter(u => u.daily_capacity_points > 0).map(user => {
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const tasks = await getAllTasksWithRelations();
  const motionTasks = await getMotionTasks();
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
    motion_queue: motionTasks.filter(mt => mt.status_motion === 'QUEUED' || mt.status_motion === 'IN_PROGRESS').length,
    sla_compliance_rate: submittedOrApproved.length > 0
      ? (excellenceCount / submittedOrApproved.length) * 100
      : 100,
    total_tasks_this_month: thisMonthTasks.length,
    approaching_deadline: activeTasks.filter(t => {
      if (!t.due_date) return false;
      const due = new Date(t.due_date);
      const diff = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 2;
    }),
    overdue_tasks: activeTasks.filter(t => {
      if (!t.due_date) return false;
      return new Date(t.due_date).getTime() < Date.now();
    }),
  };
}

export async function addClient(name: string, clientType: ClientType): Promise<Client | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('clients').insert([{
    name,
    client_type: clientType,
    is_active: true
  }]).select().single();
  if (error) throw error;
  return data as Client;
}

export async function addContentType(name: string, defaultDifficulty?: DesignDifficulty): Promise<ContentType | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('content_types').insert([{
    name
  }]).select().single();
  if (error) throw error;
  return { ...data, default_difficulty: defaultDifficulty || 'MEDIUM' } as ContentType;
}

export async function addHoliday(date: string, description: string): Promise<Holiday | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('holidays').insert([{
    date,
    description
  }]).select().single();
  if (error) throw error;
  return { ...data, holiday_date: data.date } as Holiday;
}

export async function deleteHoliday(idOrDate: number | string): Promise<void> {
  if (!supabase) return;
  const query = typeof idOrDate === 'number'
    ? supabase.from('holidays').delete().eq('id', idOrDate)
    : supabase.from('holidays').delete().eq('date', idOrDate);
  const { error } = await query;
  if (error) throw error;
}

export async function createUser(input: {
  email: string;
  role_name: RoleName;
  daily_capacity_points?: number;
}): Promise<User | null> {
  if (!supabase) return null;
  const { data: role } = await supabase.from('roles').select('id').eq('name', input.role_name).single();
  const avatar_initials = input.email.substring(0, 2).toUpperCase();
  const { data, error } = await supabase.from('users').insert([{
    email: input.email.trim().toLowerCase(),
    full_name: 'Pending Registration',
    password_hash: '',
    avatar_initials,
    role_id: role?.id || 6,
    role_name: input.role_name,
    daily_capacity_points: input.daily_capacity_points || 0,
    is_active: false,
    is_registered: false
  }]).select().single();
  if (error) throw error;
  return data as User;
}

export async function deleteUser(userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw error;
}

export async function registerUser(email: string, fullName: string, passwordHash: string): Promise<boolean> {
  if (!supabase) return false;
  const avatar_initials = fullName.substring(0, 2).toUpperCase();
  const { data, error } = await supabase.from('users')
    .update({
      full_name: fullName,
      avatar_initials,
      password_hash: passwordHash,
      is_active: true,
      is_registered: true,
      updated_at: new Date().toISOString()
    })
    .eq('email', email.trim().toLowerCase())
    .select();
  return !error && !!(data && data.length > 0);
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

export async function createStandaloneMotionTask(input: CreateStandaloneMotionInput, userId: string): Promise<MotionTask> {
  if (!supabase) throw new Error('Supabase not initialized');

  const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
  const seq = (count || 0) + 1;
  const taskCode = `MOT-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

  const parentTask = {
    task_code: taskCode,
    client_id: input.client_id,
    campaign_name: input.motion_type || 'Motion Task',
    content_type_id: 1,
    task_source: 'EXTERNAL_BRIEF',
    platform: input.platform,
    req_qty: 1,
    output_qty: 1,
    req_date: input.production_date ? `${input.production_date}T00:00:00Z` : new Date().toISOString(),
    due_date: input.period_end ? `${input.period_end}T00:00:00Z` : new Date().toISOString(),
    requires_strategic_concept: false,
    status_strat: 'NOT_REQUIRED',
    status_design: 'DESIGN_APPROVED',
    motion_readiness: 'READY_TO_ANIMATE',
    notes: `Studio: ${input.studio}, Campaign: ${input.campaign_type}`,
    created_by: userId
  };

  const { data: createdTask, error: taskErr } = await supabase.from('tasks').insert([parentTask]).select().single();
  if (taskErr) throw taskErr;

  const motionRecord = {
    task_id: createdTask.id,
    motion_pic_id: input.motion_pic_id || null,
    status_motion: input.motion_pic_id ? 'IN_PROGRESS' : 'QUEUED',
    due_date: input.period_end ? `${input.period_end}T00:00:00Z` : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: createdMotion, error: motionErr } = await supabase.from('motion_tasks').insert([motionRecord]).select().single();
  if (motionErr) throw motionErr;

  await addAuditLog('motion_tasks', createdMotion.id, 'CREATE', userId, null, createdMotion);

  return {
    ...createdMotion,
    client_id: input.client_id,
    platform: input.platform,
    motion_type: input.motion_type,
    campaign_type: input.campaign_type,
    production_date: input.production_date,
    period_start: input.period_start,
    period_end: input.period_end,
    studio: input.studio,
    motion_difficulty: 'LVL_1_SIMPLE',
    link_motion: null,
    notes: ''
  };
}

export async function editStandaloneMotionTask(motionTaskId: string, input: CreateStandaloneMotionInput, userId: string): Promise<void> {
  if (!supabase) return;
  const { data: motion } = await supabase.from('motion_tasks').select('*').eq('id', motionTaskId).single();
  if (!motion) return;

  const motionUpdates: any = {
    due_date: input.period_end ? `${input.period_end}T00:00:00Z` : null,
    updated_at: new Date().toISOString()
  };
  if (input.motion_pic_id) {
    motionUpdates.motion_pic_id = input.motion_pic_id;
  }
  await supabase.from('motion_tasks').update(motionUpdates).eq('id', motionTaskId);

  if (motion.task_id) {
    await supabase.from('tasks').update({
      client_id: input.client_id,
      platform: input.platform,
      campaign_name: input.motion_type,
      due_date: input.period_end ? `${input.period_end}T00:00:00Z` : new Date().toISOString(),
      notes: `Studio: ${input.studio}, Campaign: ${input.campaign_type}`,
      updated_at: new Date().toISOString()
    }).eq('id', motion.task_id);
  }

  await addAuditLog('motion_tasks', motionTaskId, 'UPDATE', userId, motion, motionUpdates);
}

export async function assignOperatorToMotionTask(motionTaskId: string, operatorId: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { data: motion } = await supabase.from('motion_tasks').select('*').eq('id', motionTaskId).single();
  if (!motion) return;

  await supabase.from('motion_tasks').update({
    status_motion: 'COMPLETED',
    updated_at: new Date().toISOString()
  }).eq('id', motionTaskId);

  if (motion.task_id) {
    await supabase.from('tasks').update({
      operator_id: operatorId,
      updated_at: new Date().toISOString()
    }).eq('id', motion.task_id);
  }

  await addAuditLog('motion_tasks', motionTaskId, 'STATUS_TRANSITION', userId, { status: motion.status_motion }, { status: 'COMPLETED', operator_id: operatorId });
}

export async function assignMotionPic(motionTaskId: string, motionPicId: string, userIdOrDiff?: string | MotionDifficulty, difficulty?: MotionDifficulty): Promise<void> {
  if (!supabase) return;
  const updates: any = {
    motion_pic_id: motionPicId,
    status_motion: 'IN_PROGRESS',
    updated_at: new Date().toISOString()
  };
  const diff = typeof userIdOrDiff === 'string' && userIdOrDiff.startsWith('LVL_') ? userIdOrDiff : difficulty;
  if (diff) updates.motion_difficulty = diff;
  const { error } = await supabase.from('motion_tasks').update(updates).eq('id', motionTaskId);
  if (error) throw error;
}

export async function updateMotionStatus(motionTaskId: string, status: MotionStatus): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('motion_tasks').update({
    status_motion: status,
    updated_at: new Date().toISOString()
  }).eq('id', motionTaskId);
  if (error) throw error;
}

export async function submitMotionTask(motionTaskId: string, link: string, notes?: string, userId?: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('motion_tasks').update({
    status_motion: 'COMPLETED',
    final_video_link: link,
    submission_date: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', motionTaskId);
  if (error) throw error;

  if (userId) {
    await addAuditLog('motion_tasks', motionTaskId, 'SUBMIT', userId, null, { final_video_link: link, notes });
  }
}




