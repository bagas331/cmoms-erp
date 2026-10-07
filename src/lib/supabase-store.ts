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
  ClientType, RoleName, DesignDifficulty, MotionDifficulty, Platform,
  StratStatus, SubmitStrategicInput, NotificationType
} from './types';
import { DIFFICULTY_WEIGHTS, DESIGN_STATUS_LABELS, MOTION_STATUS_LABELS } from './constants';
import { calculateBusinessDays, evaluateOperationalExcellence } from './sla-engine';
import { generateTaskCode, getCurrentYear, safeJsonParse, sanitizeUrl, sanitizeChatMessage, validateChatAttachment, sanitizeChatMediaUrl } from './utils';
import { checkRateLimit } from './rate-limiter';
import { canUserAccessTaskChat, canUserEditComment, canUserDeleteComment } from './chat-auth';

import * as localStore from './store';

// --- IN-MEMORY REQUEST CACHE & PROMISE DEDUPLICATOR ---
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightPromises = new Map<string, Promise<any>>();
const DEFAULT_CACHE_TTL_MS = 2500; // 2.5 seconds cache for fast page transitions & parallel components

export function invalidateStoreCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    memoryCache.clear();
    inFlightPromises.clear();
    return;
  }
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(keyPrefix)) memoryCache.delete(key);
  }
  for (const key of Array.from(inFlightPromises.keys())) {
    if (key.startsWith(keyPrefix)) inFlightPromises.delete(key);
  }
}

async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): Promise<T> {
  const cached = memoryCache.get(key);
  const now = Date.now();
  if (cached && (now - cached.timestamp) < ttlMs) {
    return cached.data;
  }

  // Deduplicate concurrent in-flight calls
  if (inFlightPromises.has(key)) {
    return inFlightPromises.get(key) as Promise<T>;
  }

  const promise = fetcher()
    .then(data => {
      memoryCache.set(key, { data, timestamp: Date.now() });
      inFlightPromises.delete(key);
      return data;
    })
    .catch(err => {
      inFlightPromises.delete(key);
      throw err;
    });

  inFlightPromises.set(key, promise);
  return promise;
}

// --- GETTERS (ASYNC) ---

export async function getUsers(): Promise<User[]> {
  return cachedFetch('users', async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('users').select('*');
        if (!error && data && data.length > 0) return data as User[];
      } catch (err) {
        console.warn('Supabase getUsers failed, using localStore fallback:', err);
      }
    }
    return localStore.getUsers();
  }, 4000);
}

export async function getClients(): Promise<Client[]> {
  return cachedFetch('clients', async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('clients').select('*');
        if (!error && data && data.length > 0) return data as Client[];
      } catch (err) {
        console.warn('Supabase getClients failed, using localStore fallback:', err);
      }
    }
    return localStore.getClients();
  }, 5000);
}

export async function getContentTypes(): Promise<ContentType[]> {
  return cachedFetch('content_types', async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('content_types').select('*');
        if (!error && data && data.length > 0) return data as ContentType[];
      } catch (err) {
        console.warn('Supabase getContentTypes failed, using localStore fallback:', err);
      }
    }
    return localStore.getContentTypes();
  }, 5000);
}

export async function getHolidays(): Promise<Holiday[]> {
  return cachedFetch('holidays', async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('holidays').select('*');
        if (!error && data && data.length > 0) {
          return (data || []).map((h: any) => ({
            ...h,
            holiday_date: h.holiday_date || h.date
          })) as Holiday[];
        }
      } catch (err) {
        console.warn('Supabase getHolidays failed, using localStore fallback:', err);
      }
    }
    return localStore.getHolidays();
  }, 5000);
}

export async function getTasks(): Promise<CreativeTask[]> {
  return cachedFetch('tasks', async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('tasks').select('*');
        if (!error && data && data.length > 0) return data as CreativeTask[];
      } catch (err) {
        console.warn('Supabase getTasks failed, using localStore fallback:', err);
      }
    }
    return localStore.getTasks();
  }, 2000);
}

export async function getMotionTasks(): Promise<MotionTask[]> {
  return cachedFetch('motion_tasks', async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('motion_tasks').select('*');
        if (!error && data && data.length > 0) {
          return (data || []).map((m: any) => {
            const rawLink = m.final_video_link || m.link_motion || null;
            return {
              ...m,
              link_motion: rawLink ? sanitizeUrl(rawLink) : null,
              final_video_link: m.final_video_link ? sanitizeUrl(m.final_video_link) : null,
              motion_difficulty: m.motion_difficulty || 'LVL_1_SIMPLE',
              notes: m.notes || '',
              apply_date: m.due_date ? m.due_date.substring(0, 10) : null
            };
          }) as MotionTask[];
        }
      } catch (err) {
        console.warn('Supabase getMotionTasks failed, using localStore fallback:', err);
      }
    }
    return localStore.getMotionTasks();
  }, 2000);
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  return cachedFetch(`notifications_${userId}`, async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (!error && data) return data as Notification[];
      } catch (err) {
        console.warn('Supabase getNotifications failed, using localStore fallback:', err);
      }
    }
    return localStore.getUserNotifications(userId);
  }, 2000);
}

/**
 * Unpacks comment data ensuring backward and forward compatibility with Supabase schema.
 * Handles both native database columns and packed metadata fallbacks.
 */
export function unpackCommentData(raw: any): TaskComment {
  let content = raw.content || '';
  let meta: any = {};

  if (content.includes('<!--CMOMS_CHAT_META:')) {
    const match = content.match(/^([\s\S]*?)\s*<!--CMOMS_CHAT_META:([\s\S]*?)-->$/);
    if (match) {
      content = match[1];
      try {
        meta = JSON.parse(match[2]);
      } catch {
        // ignore parse error
      }
    }
  }

  const isDeleted = Boolean(raw.is_deleted ?? meta.is_deleted);
  const isEdited = Boolean(raw.is_edited ?? meta.is_edited);
  const editedAt = raw.edited_at || meta.edited_at || null;
  const deletedAt = raw.deleted_at || meta.deleted_at || null;
  const deletedBy = raw.deleted_by || meta.deleted_by || null;
  const readBy = Array.isArray(raw.read_by) ? raw.read_by : (Array.isArray(meta.read_by) ? meta.read_by : [raw.user_id]);

  let attachmentUrl = raw.attachment_url || meta.attachment_url || null;
  let attachmentType = raw.attachment_type || meta.attachment_type || null;
  let attachmentName = raw.attachment_name || meta.attachment_name || null;

  if (isDeleted) {
    content = 'Pesan ini telah dihapus';
    attachmentUrl = null;
    attachmentType = null;
    attachmentName = null;
  }

  const userId = raw.user_id || raw.sender_id || '';
  const userName = raw.user_name || raw.sender_name || 'User';
  const taskId = raw.task_id || raw.request_id || '';

  return {
    ...raw,
    task_id: taskId,
    request_id: taskId,
    user_id: userId,
    sender_id: userId,
    user_name: userName,
    sender_name: userName,
    content,
    message: content,
    attachment_url: attachmentUrl ? sanitizeChatMediaUrl(attachmentUrl) : null,
    attachment_type: attachmentType,
    attachment_name: attachmentName,
    is_edited: isEdited,
    edited_at: editedAt,
    is_deleted: isDeleted,
    deleted_at: deletedAt,
    deleted_by: deletedBy,
    read_by: readBy
  };
}

export async function getComments(taskId?: string): Promise<TaskComment[]> {
  const cacheKey = taskId ? `comments_${taskId}` : 'comments_all';
  return cachedFetch(cacheKey, async () => {
    let rawComments: TaskComment[] = [];
    if (supabase) {
      try {
        let query = supabase.from('task_comments').select('*').order('created_at', { ascending: true });
        if (taskId) {
          query = query.eq('task_id', taskId);
        }
        
        // Fast timeout race (2.5s) to avoid UI hanging if Supabase cloud is slow or cold
        const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) => 
          setTimeout(() => resolve({ data: null, error: new Error('Supabase query timeout') }), 2500)
        );
        
        const { data, error } = await Promise.race([query, timeoutPromise]);
        if (!error && data && data.length > 0) {
          rawComments = (data as any[]).map(unpackCommentData);
        }
      } catch (err) {
        console.warn('Supabase getComments failed, using localStore fallback:', err);
      }
    }
    if (rawComments.length === 0) {
      const localData = taskId 
        ? localStore.getComments().filter(c => c.task_id === taskId || (c as any).request_id === taskId) 
        : localStore.getComments();
      rawComments = localData.map(unpackCommentData);
    }

    try {
      const users = await getUsers();
      const userMap = new Map((users || []).map(u => [u.id, u]));
      return rawComments.map(c => {
        const matched = userMap.get(c.user_id);
        return {
          ...c,
          user_name: matched?.full_name || c.user_name || 'User',
          user_avatar: matched?.avatar_initials || c.user_avatar || (matched?.full_name || c.user_name || 'U').substring(0, 2).toUpperCase(),
          user_role: matched?.role_name || c.user_role
        };
      });
    } catch {
      return rawComments;
    }
  }, 2500);
}

// --- RELATIONAL GETTER ---

export async function getAllTasksWithRelations(): Promise<TaskWithRelations[]> {
  return cachedFetch('tasks_with_relations', async () => {
    if (supabase) {
      try {
        // Run tasks query and users query concurrently
        const [tasksResult, usersList] = await Promise.all([
          supabase
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
            .order('created_at', { ascending: false }),
          getUsers()
        ]);

        const { data, error } = tasksResult;

        if (!error && data && data.length > 0) {
          const userMap = new Map((usersList || []).map(u => [u.id, u.full_name]));

          return data.map((t: any) => {
            let strat_concept_name: string | null = null;
            let strat_concept_link: string | null = null;
            let strat_submitted_at: string | null = null;
            let displayNotes = t.notes || '';

            if (t.notes && t.notes.includes('[STRAT_CONCEPT:')) {
              const match = t.notes.match(/\[STRAT_CONCEPT:(\{[\s\S]*?\})\]/);
              if (match) {
                const parsed = safeJsonParse<{ name?: string; link?: string; submitted_at?: string }>(match[1], {});
                strat_concept_name = parsed.name || null;
                strat_concept_link = parsed.link ? sanitizeUrl(parsed.link) : null;
                strat_submitted_at = parsed.submitted_at || null;
                displayNotes = displayNotes.replace(/\[STRAT_CONCEPT:\{[\s\S]*?\}\]\n?/g, '').trim();
              }
            }

            let strat_pic_ids: string[] = [];
            if (t.notes && t.notes.includes('[STRAT_PICS:')) {
              const matchPics = t.notes.match(/\[STRAT_PICS:(\[[\s\S]*?\])\]/);
              if (matchPics) {
                strat_pic_ids = safeJsonParse<string[]>(matchPics[1], []);
                displayNotes = displayNotes.replace(/\[STRAT_PICS:\[[\s\S]*?\]\]\n?/g, '').trim();
              }
            }
            if (strat_pic_ids.length === 0 && t.strat_pic_id) {
              strat_pic_ids = [t.strat_pic_id];
            }

            const strat_pic_names = strat_pic_ids.map(id => userMap.get(id) || '').filter(Boolean);
            const strat_pic_name = strat_pic_names.length > 0
              ? strat_pic_names.join(', ')
              : (t.strat_pic?.full_name || null);

            const isApprovedOrClosed = t.status_design === 'DESIGN_APPROVED' || t.status_design === 'TASK_CLOSED';
            const resolvedApprovedAt = t.approved_at || (isApprovedOrClosed ? (t.submission_date ? `${t.submission_date}T00:00:00Z` : t.updated_at || t.created_at) : null);

            return {
              ...t,
              approved_at: resolvedApprovedAt,
              final_asset_link: t.final_asset_link ? sanitizeUrl(t.final_asset_link) : null,
              notes: displayNotes,
              strat_concept_name,
              strat_concept_link,
              strat_submitted_at,
              client_name: t.client?.name || 'Unknown',
              client_type: t.client?.client_type || 'EXTERNAL',
              content_type_name: t.content_type?.name || 'Unknown',
              design_pic_name: t.design_pic?.full_name || null,
              strat_pic_id: t.strat_pic_id || (strat_pic_ids[0] || null),
              strat_pic_ids,
              strat_pic_name,
              strat_pic_names,
              created_by_name: t.created_by_user?.full_name || 'Unknown',
              motion_task: t.motion_tasks && t.motion_tasks.length > 0 ? t.motion_tasks[0] : null,
              motion_pic_name: (t.motion_tasks && t.motion_tasks.length > 0) ? t.motion_tasks[0].motion_pic?.full_name : null,
              revisions: t.task_revisions || []
            } as TaskWithRelations;
          });
        }
      } catch (err) {
        console.warn('Supabase getAllTasksWithRelations failed, using localStore fallback:', err);
      }
    }

    return localStore.getAllTasksWithRelations();
  }, 2000);
}

// --- MUTATORS (ASYNC) ---

export async function createTask(input: CreateTaskInput, createdBy: string): Promise<CreativeTask | null> {
  if (!supabase) {
    invalidateStoreCache('tasks');
    return localStore.createTask(input, createdBy);
  }
  
  // Create task Code
  const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
  const seq = (count || 0) + 1;
  const taskCode = generateTaskCode(getCurrentYear(), seq);

  let rawStratPicIds: string[] = [];
  if (input.strat_pic_ids && Array.isArray(input.strat_pic_ids)) {
    rawStratPicIds = input.strat_pic_ids.filter(id => Boolean(id && id.trim()));
  } else if (input.strat_pic_id && input.strat_pic_id.trim()) {
    rawStratPicIds = [input.strat_pic_id.trim()];
  }

  const stratPicId = (input.requires_strategic_concept && rawStratPicIds.length > 0) 
    ? rawStratPicIds[0] 
    : null;

  let finalNotes = input.notes || '';
  if (input.requires_strategic_concept && rawStratPicIds.length > 0) {
    finalNotes = `[STRAT_PICS:${JSON.stringify(rawStratPicIds)}]\n${finalNotes}`.trim();
  }

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
    requires_strategic_concept: Boolean(input.requires_strategic_concept),
    strat_pic_id: stratPicId,
    status_strat: input.requires_strategic_concept ? 'PENDING' : 'NOT_REQUIRED',
    status_design: input.requires_strategic_concept ? 'STRAT_PENDING' : 'DESIGN_UNASSIGNED',
    notes: finalNotes,
    created_by: createdBy
  };

  const { data, error } = await supabase.from('tasks').insert([newTask]).select().single();
  if (error) {
    console.error('Supabase createTask error:', error);
    throw new Error(error.message || error.details || 'Gagal membuat task');
  }
  
  invalidateStoreCache('tasks');
  await addAuditLog('tasks', data.id, 'CREATE', createdBy, null, data);
  return data as CreativeTask;
}

export async function addAuditLog(
  entityName: string, entityId: string, action: AuditAction,
  performedBy: string, beforeState: any, afterState: any, performerName?: string
): Promise<void> {
  if (!supabase) return;
  let resolvedPerformerName = performerName;
  if (!resolvedPerformerName && performedBy) {
    try {
      const { data: user } = await supabase.from('users').select('full_name').eq('id', performedBy).single();
      if (user?.full_name) resolvedPerformerName = user.full_name;
    } catch {
      // ignore
    }
  }
  await supabase.from('audit_logs').insert([{
    entity_name: entityName,
    entity_id: entityId,
    action,
    performed_by: performedBy,
    performer_name: resolvedPerformerName || performedBy,
    before_state: beforeState,
    after_state: afterState,
    timestamp: new Date().toISOString()
  }]);
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

// Sliding deduplication window to prevent duplicate notifications during rapid event firing or reconnects
const recentNotifDedupe = new Map<string, number>();
const NOTIF_DEDUPE_WINDOW_MS = 3000;

export async function sendNotificationsSafe(
  userIds: string[],
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' | 'error' = 'info',
  link: string = '/dashboard/tasks',
  requestId?: string,
  senderId?: string,
  senderName?: string,
  options?: {
    notificationType?: NotificationType | string;
    oldStatus?: string | null;
    newStatus?: string | null;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  const uniqueIds = Array.from(new Set(userIds.filter(id => Boolean(id && id.trim()))));
  for (const uid of uniqueIds) {
    try {
      await addNotification(uid, title, message, type, link, requestId, senderId, senderName, options);
    } catch (err) {
      console.warn(`Failed to send notification to user ${uid}:`, err);
    }
  }
}

export async function markNotificationsRead(userId: string): Promise<void> {
  if (supabase) {
    try {
      await supabase.from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
    } catch (err) {
      console.warn('Supabase markNotificationsRead failed:', err);
    }
  }
  invalidateStoreCache('notifications');
  localStore.markNotificationsRead(userId);
}

export async function markNotificationAsRead(notifId: string): Promise<void> {
  if (supabase) {
    try {
      await supabase.from('notifications')
        .update({ read: true })
        .eq('id', notifId);
    } catch (err) {
      console.warn('Supabase markNotificationAsRead failed:', err);
    }
  }
  invalidateStoreCache('notifications');
  localStore.markNotificationAsRead(notifId);
}

export async function addNotification(
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' | 'error' = 'info',
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
): Promise<void> {
  // 1. Deduplication check
  const notifType = options?.notificationType || (type === 'info' ? 'NEW_MESSAGE' : 'REQUEST_STATUS_UPDATED');
  const dedupeKey = `${userId}:${requestId || ''}:${notifType}:${title}:${message}`;
  const nowMs = Date.now();
  const lastTime = recentNotifDedupe.get(dedupeKey);
  if (lastTime && (nowMs - lastTime) < NOTIF_DEDUPE_WINDOW_MS) {
    return; // Duplicate ignored within window
  }
  recentNotifDedupe.set(dedupeKey, nowMs);

  // Periodic cleanup if map grows
  if (recentNotifDedupe.size > 200) {
    for (const [k, v] of Array.from(recentNotifDedupe.entries())) {
      if (nowMs - v > NOTIF_DEDUPE_WINDOW_MS * 2) {
        recentNotifDedupe.delete(k);
      }
    }
  }

  const nowIso = new Date().toISOString();
  const newNotif = {
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
    created_at: nowIso
  };

  if (supabase) {
    try {
      await supabase.from('notifications').insert([newNotif]);
    } catch (e) {
      console.warn('Supabase addNotification error:', e);
    }
  }
  invalidateStoreCache('notifications');
  localStore.addNotification(userId, title, message, type, link, requestId, senderId, senderName, options);
}

export async function dispatchStatusUpdateNotifications(
  task: any,
  oldStatus: string | null | undefined,
  newStatus: string,
  actorId?: string,
  actorName?: string,
  isMotion: boolean = false
): Promise<void> {
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

  await sendNotificationsSafe(
    recipients,
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
}

export async function addComment(
  taskId: string, 
  userId: string, 
  content: string,
  userOverride?: { full_name?: string; avatar_initials?: string; role_name?: any },
  attachment?: { url: string; type: 'image' | 'video' | 'file'; name?: string }
): Promise<TaskComment> {
  // 1. Rate limiting check (max 10 messages per 10s per user)
  const rateLimit = checkRateLimit(`chat_user_${userId}`, 10, 10000);
  if (!rateLimit.allowed) {
    throw new Error('Terlalu banyak pesan terkirim dalam waktu singkat. Harap tunggu beberapa detik.');
  }

  // 2. Validate content & attachment
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
    } else {
      throw new Error(val.error || 'Lampiran tidak valid');
    }
  }

  if (!cleanContent && !validatedAttachment) {
    throw new Error('Pesan atau lampiran tidak boleh kosong');
  }

  if (cleanContent) {
    const valMsg = sanitizeChatMessage(cleanContent);
    if (!valMsg.valid) {
      throw new Error(valMsg.error || 'Pesan tidak valid');
    }
    cleanContent = valMsg.content;
  }

  const users = await getUsers();
  const user = users.find(u => u.id === userId);
  const tasks = await getAllTasksWithRelations();
  const task = tasks.find(t => t.id === taskId);

  const finalName = userOverride?.full_name || user?.full_name || 'User';
  const finalAvatar = userOverride?.avatar_initials || user?.avatar_initials || finalName.substring(0, 2).toUpperCase();
  const finalRole = userOverride?.role_name || user?.role_name;

  // 3. Authorization check
  const hasAccess = canUserAccessTaskChat(task, { id: userId, role_name: finalRole });
  if (!hasAccess) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin untuk mengirim pesan pada request ini.');
  }

  const commentId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Date.now().toString().padStart(12, '0').slice(-12)}`;
  const nowIso = new Date().toISOString();

  const meta = {
    attachment_url: validatedAttachment?.url || null,
    attachment_type: validatedAttachment?.type || null,
    attachment_name: validatedAttachment?.name || null,
    user_role: finalRole,
    is_edited: false,
    edited_at: null,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    read_by: [userId]
  };

  const newComment: TaskComment = {
    id: commentId,
    task_id: taskId,
    user_id: userId,
    user_name: finalName,
    user_avatar: finalAvatar,
    user_role: finalRole,
    content: cleanContent,
    attachment_url: meta.attachment_url,
    attachment_type: meta.attachment_type,
    attachment_name: meta.attachment_name,
    is_edited: false,
    edited_at: null,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    read_by: [userId],
    created_at: nowIso
  };

  invalidateStoreCache('comments');

  if (supabase) {
    try {
      // First attempt: insert with all columns
      const { data, error } = await supabase.from('task_comments').insert([newComment]).select().single();
      if (!error && data) {
        localStore.addComment(taskId, userId, cleanContent, validatedAttachment);
        await dispatchChatNotifications(task, userId, finalName, cleanContent, validatedAttachment);
        await logChatAudit('POST_CHAT_MESSAGE', taskId, userId, finalName, commentId, cleanContent);
        return unpackCommentData(data);
      } else if (error && (error.code === 'PGRST204' || error.message.includes('column'))) {
        // Fallback: column missing in Supabase, embed meta into content
        const packedContent = cleanContent + ' <!--CMOMS_CHAT_META:' + JSON.stringify(meta) + '-->';
        const { data: fallbackData, error: fbErr } = await supabase.from('task_comments').insert([{
          id: commentId,
          task_id: taskId,
          user_id: userId,
          user_name: finalName,
          user_avatar: finalAvatar,
          content: packedContent,
          created_at: nowIso
        }]).select().single();

        if (!fbErr && fallbackData) {
          localStore.addComment(taskId, userId, cleanContent, validatedAttachment);
          await dispatchChatNotifications(task, userId, finalName, cleanContent, validatedAttachment);
          await logChatAudit('POST_CHAT_MESSAGE', taskId, userId, finalName, commentId, cleanContent);
          return unpackCommentData(fallbackData);
        }
      }
    } catch (err) {
      console.warn('Supabase addComment exception, falling back to localStore:', err);
    }
  }

  const res = localStore.addComment(taskId, userId, cleanContent, validatedAttachment);
  await dispatchChatNotifications(task, userId, finalName, cleanContent, validatedAttachment);
  await logChatAudit('POST_CHAT_MESSAGE', taskId, userId, finalName, commentId, cleanContent);
  return res;
}

export async function editComment(
  commentId: string, 
  userId: string, 
  newContent: string
): Promise<TaskComment> {
  const valMsg = sanitizeChatMessage(newContent);
  if (!valMsg.valid) {
    throw new Error(valMsg.error || 'Pesan tidak valid');
  }

  const cleanContent = valMsg.content;
  const nowIso = new Date().toISOString();
  invalidateStoreCache('comments');

  if (supabase) {
    try {
      const { data: existing } = await supabase.from('task_comments').select('*').eq('id', commentId).single();
      if (existing) {
        const unpacked = unpackCommentData(existing);
        if (unpacked.user_id !== userId) {
          throw new Error('Hanya penulis yang berhak mengedit pesan ini');
        }
        if (unpacked.is_deleted) {
          throw new Error('Pesan yang telah dihapus tidak dapat diedit');
        }

        // Try direct update
        const { data: updated, error } = await supabase.from('task_comments')
          .update({ content: cleanContent, is_edited: true, edited_at: nowIso })
          .eq('id', commentId)
          .select()
          .single();

        if (!error && updated) {
          localStore.editComment(commentId, userId, cleanContent);
          await logChatAudit('EDIT_CHAT_MESSAGE', unpacked.task_id, userId, unpacked.user_name, commentId, cleanContent);
          return unpackCommentData(updated);
        } else if (error && (error.code === 'PGRST204' || error.message.includes('column'))) {
          // Fallback packed
          const meta = {
            attachment_url: unpacked.attachment_url,
            attachment_type: unpacked.attachment_type,
            attachment_name: unpacked.attachment_name,
            user_role: unpacked.user_role,
            is_edited: true,
            edited_at: nowIso,
            is_deleted: false,
            read_by: unpacked.read_by
          };
          const packedContent = cleanContent + ' <!--CMOMS_CHAT_META:' + JSON.stringify(meta) + '-->';
          const { data: fbUpdated } = await supabase.from('task_comments')
            .update({ content: packedContent })
            .eq('id', commentId)
            .select()
            .single();

          if (fbUpdated) {
            localStore.editComment(commentId, userId, cleanContent);
            await logChatAudit('EDIT_CHAT_MESSAGE', unpacked.task_id, userId, unpacked.user_name, commentId, cleanContent);
            return unpackCommentData(fbUpdated);
          }
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('Hanya penulis')) throw err;
      console.warn('Supabase editComment error:', err);
    }
  }

  const localRes = localStore.editComment(commentId, userId, cleanContent);
  await logChatAudit('EDIT_CHAT_MESSAGE', localRes.task_id, userId, localRes.user_name, commentId, cleanContent);
  return localRes;
}

export async function deleteComment(
  commentId: string, 
  userId?: string, 
  roleName?: string
): Promise<void> {
  invalidateStoreCache('comments');
  const nowIso = new Date().toISOString();

  if (supabase) {
    try {
      const { data: existing } = await supabase.from('task_comments').select('*').eq('id', commentId).single();
      if (existing) {
        const unpacked = unpackCommentData(existing);
        if (userId && !canUserDeleteComment(unpacked.user_id, { id: userId, role_name: roleName })) {
          throw new Error('Anda tidak memiliki izin untuk menghapus pesan ini');
        }

        // Soft delete update
        const { error } = await supabase.from('task_comments')
          .update({
            content: 'Pesan ini telah dihapus',
            is_deleted: true,
            deleted_at: nowIso,
            deleted_by: userId || 'SYSTEM',
            attachment_url: null,
            attachment_type: null,
            attachment_name: null
          })
          .eq('id', commentId);

        if (error && (error.code === 'PGRST204' || error.message.includes('column'))) {
          // Fallback packed
          const meta = {
            is_deleted: true,
            deleted_at: nowIso,
            deleted_by: userId || 'SYSTEM'
          };
          const packedContent = 'Pesan ini telah dihapus <!--CMOMS_CHAT_META:' + JSON.stringify(meta) + '-->';
          await supabase.from('task_comments')
            .update({ content: packedContent })
            .eq('id', commentId);
        }

        localStore.deleteComment(commentId, userId, roleName);
        if (userId) {
          await logChatAudit('DELETE_CHAT_MESSAGE', unpacked.task_id, userId, unpacked.user_name, commentId);
        }
        return;
      }
    } catch (err: any) {
      if (err?.message?.includes('izin')) throw err;
      console.warn('Supabase deleteComment failed, falling back:', err);
    }
  }

  localStore.deleteComment(commentId, userId, roleName);
}

export async function markCommentsAsRead(taskId: string, userId: string): Promise<void> {
  if (!taskId || !userId) return;
  invalidateStoreCache('comments');
  localStore.markCommentsAsRead(taskId, userId);

  if (supabase) {
    try {
      // Find all unread comments for this user
      const { data: comments } = await supabase.from('task_comments').select('*').eq('task_id', taskId);
      if (comments && comments.length > 0) {
        for (const c of comments) {
          const unpacked = unpackCommentData(c);
          if (unpacked.user_id !== userId && !unpacked.is_deleted && !(unpacked.read_by || []).includes(userId)) {
            const nextReadBy = [...(unpacked.read_by || []), userId];
            // Try updating read_by column
            const { error } = await supabase.from('task_comments')
              .update({ read_by: nextReadBy })
              .eq('id', c.id);

            if (error && (error.code === 'PGRST204' || error.message.includes('column'))) {
              // Pack fallback
              const meta = {
                attachment_url: unpacked.attachment_url,
                attachment_type: unpacked.attachment_type,
                attachment_name: unpacked.attachment_name,
                user_role: unpacked.user_role,
                is_edited: unpacked.is_edited,
                edited_at: unpacked.edited_at,
                is_deleted: unpacked.is_deleted,
                read_by: nextReadBy
              };
              const packedContent = unpacked.content + ' <!--CMOMS_CHAT_META:' + JSON.stringify(meta) + '-->';
              await supabase.from('task_comments')
                .update({ content: packedContent })
                .eq('id', c.id);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Supabase markCommentsAsRead error:', err);
    }
  }
}

export async function getUnreadCommentCount(taskId: string, userId: string): Promise<number> {
  if (!taskId || !userId) return 0;
  const comments = await getComments(taskId);
  return comments.filter(c => 
    c.user_id !== userId && 
    !c.is_deleted && 
    !(c.read_by || []).includes(userId)
  ).length;
}

async function dispatchChatNotifications(
  task: any, 
  senderId: string, 
  senderName: string, 
  content: string, 
  attachment?: { type?: string }
): Promise<void> {
  if (!task) return;
  const recipients = getInvolvedUserIds(task, senderId);
  if (recipients.length === 0) return;

  const mediaLabel = attachment?.type === 'image' ? ' [Gambar]' : attachment?.type === 'video' ? ' [Video]' : '';
  const title = `Pesan baru dari ${senderName}${mediaLabel}`;
  const message = `[${task.task_code}] ${senderName}: ${content.slice(0, 80)}${content.length > 80 ? '...' : ''}`;
  const isMotion = (task.task_code || '').startsWith('MOT-');
  const chatLink = isMotion 
    ? `/dashboard/motion?taskId=${task.id}&tab=chat`
    : `/dashboard/tasks?taskId=${task.id}&tab=chat`;

  await sendNotificationsSafe(
    recipients,
    title,
    message,
    'info',
    chatLink,
    task.id,
    senderId,
    senderName,
    {
      notificationType: 'NEW_MESSAGE',
      metadata: { task_code: task.task_code, attachment_type: attachment?.type }
    }
  );
}

async function logChatAudit(
  action: 'POST_CHAT_MESSAGE' | 'EDIT_CHAT_MESSAGE' | 'DELETE_CHAT_MESSAGE',
  taskId: string,
  userId: string,
  userName: string,
  commentId: string,
  previewText?: string
): Promise<void> {
  try {
    await addAuditLog(
      'TASK_CHAT',
      taskId,
      action as any,
      userId,
      null,
      { comment_id: commentId, preview: previewText ? previewText.slice(0, 60) : undefined },
      userName
    );
  } catch (err) {
    console.warn('Failed to log chat audit:', err);
  }
}


export async function assignTask(taskId: string, input: AssignTaskInput, performedBy: string, roleName?: string): Promise<void> {
  if (!supabase) {
    invalidateStoreCache('tasks');
    localStore.assignTask(taskId, input, performedBy);
    return;
  }
  
  // Check current task status to ensure STRAT_PENDING phase is respected
  const { data: currentTask } = await supabase
    .from('tasks')
    .select('task_code, campaign_name, status_design, requires_strategic_concept, status_strat, design_pic_id, strat_pic_id, notes, created_by')
    .eq('id', taskId)
    .single();

  const isStratPhase = currentTask?.status_design === 'STRAT_PENDING' || 
    (currentTask?.requires_strategic_concept && currentTask?.status_strat !== 'APPROVED');

  const updates: any = {};

  let rawStratPicIds: string[] | null = null;
  if (input.strat_pic_ids !== undefined) {
    rawStratPicIds = input.strat_pic_ids.filter(id => Boolean(id && id.trim()));
  } else if (input.strat_pic_id !== undefined) {
    rawStratPicIds = input.strat_pic_id ? [input.strat_pic_id.trim()] : [];
  }

  if (rawStratPicIds !== null) {
    updates.strat_pic_id = rawStratPicIds.length > 0 ? rawStratPicIds[0] : null;
    let currentNotes = currentTask?.notes || '';
    currentNotes = currentNotes.replace(/\[STRAT_PICS:\[[\s\S]*?\]\]\n?/g, '').trim();
    if (rawStratPicIds.length > 0) {
      currentNotes = `[STRAT_PICS:${JSON.stringify(rawStratPicIds)}]\n${currentNotes}`.trim();
    }
    updates.notes = currentNotes;
  }

  if (input.design_pic_id && input.design_pic_id.trim() !== '') {
    updates.design_pic_id = input.design_pic_id;
    if (input.design_difficulty) updates.design_difficulty = input.design_difficulty;
    // Only transition status to DESIGN_ASSIGNED if strategic phase is completed or not required
    if (!isStratPhase) {
      updates.status_design = 'DESIGN_ASSIGNED';
    }
  } else if (input.design_difficulty) {
    updates.design_difficulty = input.design_difficulty;
  }

  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (error) {
    console.error('Supabase assignTask error:', error);
    throw new Error(error.message || error.details || 'Gagal assign task');
  }
  invalidateStoreCache('tasks');
  await addAuditLog('tasks', taskId, 'ASSIGN', performedBy, null, updates);

  // Send notifications to assigned PICs
  const taskCode = currentTask?.task_code || taskId;
  const campaignName = currentTask?.campaign_name || 'Request';

  if (input.design_pic_id && input.design_pic_id !== performedBy && input.design_pic_id !== currentTask?.design_pic_id) {
    await sendNotificationsSafe(
      [input.design_pic_id],
      'Penugasan Desain Baru',
      `Anda ditugaskan mengerjakan request ${taskCode} (${campaignName}).`,
      'info',
      `/dashboard/tasks?taskId=${taskId}&tab=details`,
      taskId,
      performedBy
    );
  }

  if (rawStratPicIds && rawStratPicIds.length > 0) {
    for (const stratId of rawStratPicIds) {
      if (stratId !== performedBy) {
        await sendNotificationsSafe(
          [stratId],
          'Penugasan Strategic PIC',
          `Anda ditugaskan sebagai Strategic PIC pada request ${taskCode} (${campaignName}).`,
          'info',
          `/dashboard/tasks?taskId=${taskId}&tab=details`,
          taskId,
          performedBy
        );
      }
    }
  }
}

export async function updateStratStatus(taskId: string, newStatus: StratStatus, userId: string): Promise<void> {
  if (!supabase) {
    localStore.updateStratStatus(taskId, newStatus, userId);
    return;
  }
  const { data: currentTask } = await supabase.from('tasks').select('*').eq('id', taskId).single();
  const updates: any = {
    status_strat: newStatus,
    updated_at: new Date().toISOString()
  };
  if (newStatus === 'APPROVED') {
    if (currentTask?.design_pic_id) {
      updates.status_design = 'DESIGN_ASSIGNED';
    } else {
      updates.status_design = 'DESIGN_UNASSIGNED';
    }
  }
  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (error) throw error;
  invalidateStoreCache('tasks');
  await addAuditLog('creative_tasks', taskId, 'STATUS_TRANSITION', userId, null, updates);

  const taskCode = currentTask?.task_code || taskId;
  if (newStatus === 'APPROVED') {
    const recipients = new Set<string>();
    if (currentTask?.strat_pic_id) recipients.add(currentTask.strat_pic_id);
    if (currentTask?.created_by) recipients.add(currentTask.created_by);
    if (currentTask?.design_pic_id) recipients.add(currentTask.design_pic_id);
    recipients.delete(userId);

    await sendNotificationsSafe(
      Array.from(recipients),
      'Strategic Concept Disetujui',
      `Strategic Concept pada request ${taskCode} telah disetujui.`,
      'success',
      `/dashboard/tasks?taskId=${taskId}&tab=details`,
      taskId,
      userId
    );
  }
}

export async function submitStrategicConcept(taskId: string, input: SubmitStrategicInput, userId: string): Promise<void> {
  if (!supabase) {
    invalidateStoreCache('tasks');
    localStore.submitStrategicConcept(taskId, input, userId);
    return;
  }
  const { data: currentTask } = await supabase.from('tasks').select('*').eq('id', taskId).single();
  const rawNotes = currentTask?.notes || '';
  const baseNotes = rawNotes.replace(/\[STRAT_CONCEPT:\{[\s\S]*?\}\]\n?/g, '').trim();
  const deckName = input.strat_concept_name || 'Strategic Concept Deck';
  const deckLink = input.strat_concept_link || input.strat_link || '';
  const submittedAt = new Date().toISOString();

  const stratMetadata = JSON.stringify({
    name: deckName,
    link: deckLink,
    submitted_at: submittedAt
  });

  const finalNotes = input.notes 
    ? `[STRAT_CONCEPT:${stratMetadata}]\n${input.notes}`
    : (baseNotes ? `[STRAT_CONCEPT:${stratMetadata}]\n${baseNotes}` : `[STRAT_CONCEPT:${stratMetadata}]`);

  const updates: any = {
    status_strat: 'REVIEW',
    notes: finalNotes,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (error) {
    console.error('Supabase submitStrategicConcept error:', error);
    throw new Error(error.message || error.details || 'Gagal submit Strategic Concept');
  }
  invalidateStoreCache('tasks');
  await addAuditLog('creative_tasks', taskId, 'SUBMIT', userId, null, {
    strat_concept_name: deckName,
    strat_concept_link: deckLink,
    status_strat: 'REVIEW'
  });

  // Notify Requester and Design PIC
  const taskCode = currentTask?.task_code || taskId;
  const recipients = new Set<string>();
  if (currentTask?.created_by) recipients.add(currentTask.created_by);
  if (currentTask?.design_pic_id) recipients.add(currentTask.design_pic_id);
  recipients.delete(userId);

  await sendNotificationsSafe(
    Array.from(recipients),
    'Strategic Concept Disubmit',
    `Strategic Concept untuk request ${taskCode} telah disubmit untuk review.`,
    'info',
    `/dashboard/tasks?taskId=${taskId}&tab=details`,
    taskId,
    userId
  );
}


export async function updateTaskStatus(taskId: string, newStatus: DesignStatus, userId: string): Promise<void> {
  if (!supabase) {
    invalidateStoreCache('tasks');
    invalidateStoreCache('motion_tasks');
    localStore.updateTaskStatus(taskId, newStatus, userId);
    return;
  }
  const updates: any = {
    status_design: newStatus,
    updated_at: new Date().toISOString()
  };

  const { data: currentTask } = await supabase.from('tasks').select('*').eq('id', taskId).single();
  const oldStatus = currentTask?.status_design;

  if (newStatus === 'DESIGN_SUBMITTED') {
    if (currentTask && !currentTask.submission_date) {
      const holidays = await getHolidays();
      const submissionDate = new Date().toISOString().split('T')[0];
      const workingDays = calculateBusinessDays(currentTask.req_date, submissionDate, holidays);
      updates.submission_date = submissionDate;
      updates.sla_working_days = workingDays;
      updates.operational_excellence = workingDays !== null ? evaluateOperationalExcellence(workingDays) : null;
    }
  }

  if (newStatus === 'DESIGN_APPROVED') {
    updates.approved_at = new Date().toISOString();
  }

  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (error) throw error;

  invalidateStoreCache('tasks');
  invalidateStoreCache('motion_tasks');
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

  // Dispatch status update notifications to all involved parties (excluding actor)
  let performerName: string | undefined;
  if (userId) {
    try {
      const { data: user } = await supabase.from('users').select('full_name').eq('id', userId).single();
      if (user?.full_name) performerName = user.full_name;
    } catch {}
  }

  await dispatchStatusUpdateNotifications(
    currentTask || { id: taskId },
    oldStatus,
    newStatus,
    userId,
    performerName,
    false
  );
}

export async function submitTask(taskId: string, input: SubmitTaskInput, performedBy: string): Promise<void> {
  if (!supabase) {
    invalidateStoreCache('tasks');
    localStore.submitTask(taskId, input, performedBy);
    return;
  }
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
  invalidateStoreCache('tasks');
  await addAuditLog('creative_tasks', taskId, 'SUBMIT', performedBy, null, updates);

  // Send Notification on task submission
  let performerName = 'Designer';
  try {
    const { data: performerUser } = await supabase.from('users').select('full_name').eq('id', performedBy).single();
    if (performerUser?.full_name) performerName = performerUser.full_name;
  } catch {}
  
  const taskCode = currentTask?.task_code || taskId;
  const campaignName = currentTask?.campaign_name || 'Request';

  const recipients = new Set<string>();
  if (currentTask?.created_by) recipients.add(currentTask.created_by);
  recipients.delete(performedBy);

  await sendNotificationsSafe(
    Array.from(recipients),
    'Output Desain Selesai',
    `Desain untuk request ${taskCode} (${campaignName}) telah disubmit oleh ${performerName}.`,
    'success',
    `/dashboard/tasks?taskId=${taskId}&tab=details`,
    taskId,
    performedBy,
    performerName
  );
}

export async function requestRevision(taskId: string, input: RevisionInput, performedBy: string): Promise<void> {
  if (!supabase) {
    invalidateStoreCache('tasks');
    localStore.requestRevision(taskId, input, performedBy);
    return;
  }
  const { data: t } = await supabase.from('tasks').select('*').eq('id', taskId).single();
  const revCount = input.stage === 'STRATEGIC' ? (t?.strat_revision_count || 0) + 1 : (t?.design_revision_count || 0) + 1;

  const { error: revErr } = await supabase.from('task_revisions').insert([{
    task_id: taskId,
    stage: input.stage,
    revision_notes: `[${input.reason_category}] ${input.notes}`,
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
  invalidateStoreCache('tasks');
  await addAuditLog('creative_tasks', taskId, 'REVISION_REQUEST', performedBy, null, { ...input, revision_number: revCount });

  // Notification for Revision
  let performerName = 'User';
  try {
    const { data: performerUser } = await supabase.from('users').select('full_name').eq('id', performedBy).single();
    if (performerUser?.full_name) performerName = performerUser.full_name;
  } catch {}
  
  const taskCode = t?.task_code || taskId;
  const campaignName = t?.campaign_name || 'Request';

  // Determine recipients who need to know/act upon revision:
  // - If stage is STRATEGIC: Strategic PIC(s) + Requester
  // - If stage is DESIGN: Design PIC + Requester
  // - If stage is MOTION: Motion PIC + Requester
  const recipients = new Set<string>();
  if (input.stage === 'STRATEGIC') {
    if (t?.strat_pic_id) recipients.add(t.strat_pic_id);
    if (t?.notes && t.notes.includes('[STRAT_PICS:')) {
      const match = t.notes.match(/\[STRAT_PICS:(\[[\s\S]*?\])\]/);
      if (match) {
        try {
          const ids = JSON.parse(match[1]) as string[];
          ids.forEach(id => { if (id && typeof id === 'string') recipients.add(id); });
        } catch {}
      }
    }
    if (t?.created_by) recipients.add(t.created_by);
  } else if (input.stage === 'DESIGN') {
    if (t?.design_pic_id) recipients.add(t.design_pic_id);
    if (t?.created_by) recipients.add(t.created_by);
  } else {
    // Stage MOTION or general
    if (t?.created_by) recipients.add(t.created_by);
  }

  recipients.delete(performedBy);

  await sendNotificationsSafe(
    Array.from(recipients),
    'Request Membutuhkan Revisi',
    `Request ${taskCode} (${campaignName}) membutuhkan revisi [${input.stage}] dari ${performerName}.`,
    'warning',
    `/dashboard/tasks?taskId=${taskId}&tab=details`,
    taskId,
    performedBy,
    performerName
  );
}

export async function setMotionReadyness(taskId: string, isReady: boolean, performedBy: string): Promise<void> {
  if (!supabase) {
    invalidateStoreCache('tasks');
    invalidateStoreCache('motion_tasks');
    localStore.setMotionReadyness(taskId, isReady, performedBy);
    return;
  }
  const status = isReady ? 'READY_TO_ANIMATE' : 'WAITING_ASSET_GD';
  const { error } = await supabase.from('tasks').update({ motion_readiness: status }).eq('id', taskId);
  if (error) throw error;
  invalidateStoreCache('tasks');
  invalidateStoreCache('motion_tasks');

  if (isReady) {
    const { data } = await supabase.from('motion_tasks').select('id').eq('task_id', taskId).single();
    if (!data) {
      await supabase.from('motion_tasks').insert([{
        task_id: taskId,
        status_motion: 'QUEUED'
      }]);
    }

    const { data: currentTask } = await supabase.from('tasks').select('task_code, campaign_name, created_by').eq('id', taskId).single();
    const taskCode = currentTask?.task_code || taskId;
    const campaignName = currentTask?.campaign_name || 'Request';

    const recipients = new Set<string>();
    if (currentTask?.created_by) recipients.add(currentTask.created_by);
    recipients.delete(performedBy);

    await sendNotificationsSafe(
      Array.from(recipients),
      'Asset Siap untuk Motion',
      `Asset GD untuk request ${taskCode} (${campaignName}) telah siap dianimasikan.`,
      'info',
      '/dashboard/motion',
      taskId,
      performedBy
    );
  }
}


export async function editTask(taskId: string, input: Partial<CreateTaskInput>, updatedBy: string, userRole?: string): Promise<void> {
  if (!supabase) return;
  if (userRole === 'REQUESTER') {
    const { data: currentTask } = await supabase.from('tasks').select('created_by').eq('id', taskId).single();
    if (currentTask && currentTask.created_by !== updatedBy) {
      throw new Error('Unauthorized: Requester only allowed to edit tasks they created.');
    }
  }

  let rawStratPicIds: string[] | null = null;
  if (input.strat_pic_ids !== undefined) {
    rawStratPicIds = input.strat_pic_ids.filter(id => Boolean(id && id.trim()));
  } else if (input.strat_pic_id !== undefined) {
    rawStratPicIds = input.strat_pic_id ? [input.strat_pic_id.trim()] : [];
  }

  const stratPicId = (input.requires_strategic_concept !== false && rawStratPicIds && rawStratPicIds.length > 0)
    ? rawStratPicIds[0]
    : null;

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString()
  };

  if (input.client_id !== undefined) updates.client_id = input.client_id;
  if (input.campaign_name !== undefined) updates.campaign_name = input.campaign_name;
  if (input.content_type_id !== undefined) updates.content_type_id = input.content_type_id;
  if (input.task_source !== undefined) updates.task_source = input.task_source;
  if (input.platform !== undefined) updates.platform = input.platform;
  if (input.req_qty !== undefined) {
    updates.req_qty = input.req_qty;
    updates.output_qty = input.req_qty;
  }
  if (input.req_date !== undefined) updates.req_date = input.req_date;
  if (input.due_date !== undefined) updates.due_date = input.due_date;

  const { data: currentTaskNotes } = await supabase.from('tasks').select('notes').eq('id', taskId).single();
  let baseNotes = input.notes !== undefined ? (input.notes || '') : (currentTaskNotes?.notes || '');
  
  // Extract and preserve [STRAT_CONCEPT:...]
  let stratConceptTag = '';
  if (currentTaskNotes?.notes && currentTaskNotes.notes.includes('[STRAT_CONCEPT:')) {
    const match = currentTaskNotes.notes.match(/\[STRAT_CONCEPT:\{[\s\S]*?\}\]/);
    if (match) stratConceptTag = match[0];
  }

  // Strip existing tags
  baseNotes = baseNotes.replace(/\[STRAT_CONCEPT:\{[\s\S]*?\}\]\n?/g, '')
                       .replace(/\[STRAT_PICS:\[[\s\S]*?\]\]\n?/g, '')
                       .trim();

  let stratPicsTag = '';
  if (rawStratPicIds && rawStratPicIds.length > 0 && input.requires_strategic_concept !== false) {
    stratPicsTag = `[STRAT_PICS:${JSON.stringify(rawStratPicIds)}]`;
  }

  let finalNotes = baseNotes;
  if (stratConceptTag) finalNotes = `${stratConceptTag}\n${finalNotes}`.trim();
  if (stratPicsTag) finalNotes = `${stratPicsTag}\n${finalNotes}`.trim();

  if (input.notes !== undefined || rawStratPicIds !== null) {
    updates.notes = finalNotes;
  }

  if (input.requires_strategic_concept !== undefined) {
    updates.requires_strategic_concept = Boolean(input.requires_strategic_concept);
    if (!input.requires_strategic_concept) {
      updates.strat_pic_id = null;
      updates.status_strat = 'NOT_REQUIRED';
    } else {
      updates.strat_pic_id = stratPicId;
    }
  } else if (rawStratPicIds !== null) {
    updates.strat_pic_id = stratPicId;
  }

  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (error) {
    console.error('Supabase editTask error:', error);
    throw new Error(error.message || error.details || 'Gagal menyimpan perubahan task');
  }
  invalidateStoreCache('tasks');
  await addAuditLog('tasks', taskId, 'UPDATE', updatedBy, null, updates);
}

export async function deleteTask(taskId: string, deletedBy: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('task_revisions').delete().eq('task_id', taskId);
  await supabase.from('motion_tasks').delete().eq('task_id', taskId);
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
  invalidateStoreCache('tasks');
  invalidateStoreCache('motion_tasks');
  await addAuditLog('tasks', taskId, 'DELETE', deletedBy, null, null);
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('audit_logs').select('*').order('timestamp', { ascending: false });
  if (error) throw error;
  return data as AuditLog[];
}

export async function getDesignerWorkloads(filterMonth?: string, filterYear?: string): Promise<DesignerWorkload[]> {
  const users = await getUsers();
  const designers = users.filter(u => u.role_name === 'DESIGNER' || u.role_name === 'TEAM_LEAD');
  let tasks = await getTasks();

  if (filterYear && filterYear !== 'all') {
    tasks = tasks.filter(t => new Date(t.req_date).getFullYear().toString() === filterYear);
  }
  if (filterMonth && filterMonth !== 'all') {
    tasks = tasks.filter(t => String(new Date(t.req_date).getMonth() + 1).padStart(2, '0') === filterMonth);
  }

  return designers.filter(u => u.daily_capacity_points > 0).map(user => {
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

export async function getDashboardStats(
  filterMonthOrOptions?: string | { filterMonth?: string; filterYear?: string; filterDateFrom?: string; filterDateTo?: string },
  filterYearArg?: string,
  filterDateFromArg?: string,
  filterDateToArg?: string
): Promise<DashboardStats> {
  let filterMonth: string | undefined;
  let filterYear: string | undefined;
  let filterDateFrom: string | undefined;
  let filterDateTo: string | undefined;

  if (typeof filterMonthOrOptions === 'object' && filterMonthOrOptions !== null) {
    filterMonth = filterMonthOrOptions.filterMonth;
    filterYear = filterMonthOrOptions.filterYear;
    filterDateFrom = filterMonthOrOptions.filterDateFrom;
    filterDateTo = filterMonthOrOptions.filterDateTo;
  } else {
    filterMonth = filterMonthOrOptions;
    filterYear = filterYearArg;
    filterDateFrom = filterDateFromArg;
    filterDateTo = filterDateToArg;
  }

  let tasks = await getAllTasksWithRelations();
  let motionTasks = await getMotionTasks();

  // Apply date range / month filter if provided
  if (filterDateFrom && filterDateTo) {
    tasks = tasks.filter(t => {
      const d = t.req_date ? t.req_date.substring(0, 10) : '';
      return d >= filterDateFrom! && d <= filterDateTo!;
    });
    motionTasks = motionTasks.filter(m => {
      const d = m.created_at ? m.created_at.substring(0, 10) : '';
      return d >= filterDateFrom! && d <= filterDateTo!;
    });
  } else {
    if (filterYear && filterYear !== 'all') {
      tasks = tasks.filter(t => {
        const dStr = t.req_date || t.created_at || '';
        return dStr.substring(0, 4) === filterYear;
      });
      motionTasks = motionTasks.filter(m => {
        const dStr = m.created_at || '';
        return dStr.substring(0, 4) === filterYear;
      });
    }
    if (filterMonth && filterMonth !== 'all') {
      tasks = tasks.filter(t => {
        const dStr = t.req_date || t.created_at || '';
        return dStr.substring(5, 7) === filterMonth;
      });
      motionTasks = motionTasks.filter(m => {
        const dStr = m.created_at || '';
        return dStr.substring(5, 7) === filterMonth;
      });
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
  invalidateStoreCache('clients');
  return data as Client;
}

export async function deleteClient(id: number): Promise<void> {
  localStore.deleteClient(id);
  invalidateStoreCache('clients');

  if (!supabase) return;

  try {
    const { count, error: countErr } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', id);

    if (!countErr && count && count > 0) {
      throw new Error(`Klien/Brand ini tidak dapat dihapus karena masih terhubung dengan ${count} tiket request.`);
    }
  } catch (e: any) {
    if (e?.message?.includes('tiket request')) throw e;
  }

  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) {
    if (error.code === '23503' || error.message?.includes('foreign key constraint') || error.details?.includes('still referenced')) {
      throw new Error('Klien/Brand ini tidak dapat dihapus karena masih digunakan oleh tiket request aktif.');
    }
    console.error('Supabase deleteClient error:', error);
    throw new Error(error.message || error.details || 'Gagal menghapus client dari database');
  }
}

export async function addContentType(name: string, defaultDifficulty?: DesignDifficulty): Promise<ContentType | null> {
  const localRes = localStore.addContentType(name, defaultDifficulty || 'MEDIUM');
  if (!supabase) return localRes;
  try {
    const { data, error } = await supabase.from('content_types').insert([{
      name
    }]).select().single();
    if (error) {
      console.warn('Supabase addContentType error:', error);
      return localRes;
    }
    invalidateStoreCache('content_types');
    return { ...data, default_difficulty: defaultDifficulty || 'MEDIUM' } as ContentType;
  } catch (err) {
    console.warn('Supabase addContentType exception:', err);
    return localRes;
  }
}

export async function deleteContentType(id: number): Promise<void> {
  localStore.deleteContentType(id);
  invalidateStoreCache('content_types');

  if (!supabase) return;

  try {
    const { count, error: countErr } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('content_type_id', id);

    if (!countErr && count && count > 0) {
      throw new Error(`Tipe konten ini tidak dapat dihapus karena masih digunakan oleh ${count} tiket request.`);
    }
  } catch (e: any) {
    if (e?.message?.includes('tiket request')) throw e;
  }

  const { error } = await supabase.from('content_types').delete().eq('id', id);
  if (error) {
    if (error.code === '23503' || error.message?.includes('foreign key constraint') || error.details?.includes('still referenced')) {
      throw new Error('Tipe konten ini tidak dapat dihapus karena masih digunakan oleh tiket request aktif.');
    }
    console.error('Supabase deleteContentType error:', error);
    throw new Error(error.message || error.details || 'Gagal menghapus tipe konten dari database');
  }
}

export async function addHoliday(date: string, description: string): Promise<Holiday | null> {
  const localRes = localStore.addHoliday(date, description);
  if (!supabase) return localRes;
  try {
    const { data, error } = await supabase.from('holidays').insert([{
      date,
      description
    }]).select().single();
    if (error) {
      console.warn('Supabase addHoliday error:', error);
      return localRes;
    }
    invalidateStoreCache('holidays');
    return { ...data, holiday_date: data.date } as Holiday;
  } catch (err) {
    console.warn('Supabase addHoliday exception:', err);
    return localRes;
  }
}

export async function deleteHoliday(idOrDate: number | string): Promise<void> {
  const dateStr = typeof idOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(idOrDate) ? idOrDate : '';
  if (dateStr) {
    localStore.deleteHoliday(dateStr);
  }
  invalidateStoreCache('holidays');

  if (!supabase) return;
  const isDate = typeof idOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(idOrDate);
  const query = isDate
    ? supabase.from('holidays').delete().eq('date', idOrDate)
    : supabase.from('holidays').delete().eq('id', idOrDate);
  const { error } = await query;
  if (error) {
    console.error('Supabase deleteHoliday error:', error);
    throw new Error(error.message || error.details || 'Gagal menghapus hari libur dari database');
  }
}

export async function createUser(input: {
  email: string;
  role_name: RoleName;
  daily_capacity_points?: number;
}): Promise<User | null> {
  if (!supabase) return null;
  const { data: role } = await supabase.from('roles').select('id').eq('name', input.role_name).single();
  const avatar_initials = (input.email || '').substring(0, 2).toUpperCase();
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
  invalidateStoreCache('users');
  return data as User;
}

export async function deleteUser(userId: string): Promise<void> {
  if (!supabase) return;
  const { data: targetUser } = await supabase.from('users').select('role_name, email').eq('id', userId).single();
  if (targetUser?.role_name === 'ADMIN') {
    throw new Error('Akun Administrator bersifat permanen dan tidak dapat dihapus.');
  }
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw error;
  invalidateStoreCache('users');
}

export async function updateUserCapacity(userId: string, dailyCapacityPoints: number): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('users')
    .update({ 
      daily_capacity_points: dailyCapacityPoints,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);
  if (error) throw error;
  invalidateStoreCache('users');
}

export async function updateUserRole(
  userId: string,
  newRole: RoleName,
  dailyCapacityPoints?: number,
  performedByUserId?: string,
  performerName?: string
): Promise<User | null> {
  if (!supabase) return null;

  // 1. Fetch current user state for audit trail & comparison
  const { data: currentUser, error: fetchErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (fetchErr || !currentUser) throw new Error(fetchErr?.message || 'User not found');

  // Prevent changing the role of an ADMIN user
  if (currentUser.role_name === 'ADMIN' && newRole !== 'ADMIN') {
    throw new Error('Role Administrator bersifat permanen/terkunci dan tidak dapat diubah.');
  }

  // 2. Fetch role id
  const { data: role } = await supabase
    .from('roles')
    .select('id')
    .eq('name', newRole)
    .single();

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

  // Calculate capacity points: only designers & motion designers have daily capacity points
  let finalCapacity = 0;
  if (['DESIGNER', 'MOTION_PIC'].includes(newRole)) {
    finalCapacity = typeof dailyCapacityPoints === 'number' && dailyCapacityPoints >= 0
      ? dailyCapacityPoints
      : (currentUser.daily_capacity_points > 0 ? currentUser.daily_capacity_points : 7.0);
  }

  const updates = {
    role_id: roleId,
    role_name: newRole,
    daily_capacity_points: finalCapacity,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  invalidateStoreCache('users');

  // 3. Log Audit
  if (performedByUserId) {
    await addAuditLog(
      'users',
      userId,
      'UPDATE',
      performedByUserId,
      {
        role_name: currentUser.role_name,
        role_id: currentUser.role_id,
        daily_capacity_points: currentUser.daily_capacity_points,
      },
      {
        role_name: newRole,
        role_id: roleId,
        daily_capacity_points: finalCapacity,
      },
      performerName
    );

    // 4. Send in-app notification to affected user if updated by someone else
    if (userId !== performedByUserId) {
      try {
        const { ROLE_LABELS } = await import('./constants');
        await supabase.from('notifications').insert([{
          user_id: userId,
          title: 'Perubahan Role Akun',
          message: `Role Anda telah diperbarui menjadi ${ROLE_LABELS[newRole]} oleh ${performerName || 'Administrator'}.`,
          type: 'info',
          read: false,
          link: '/dashboard',
          created_at: new Date().toISOString()
        }]);
      } catch (err) {
        console.warn('Notification insert error:', err);
      }
    }
  }

  return data as User;
}

export async function updateUser(
  userId: string,
  updates: Partial<User>,
  performedByUserId?: string,
  performerName?: string
): Promise<User | null> {
  if (!supabase) return null;

  const { data: currentUser } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  const { data, error } = await supabase
    .from('users')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;

  if (performedByUserId && currentUser) {
    await addAuditLog(
      'users',
      userId,
      'UPDATE',
      performedByUserId,
      currentUser,
      data,
      performerName
    );
  }

  return data as User;
}

export async function registerUser(email: string, fullName: string, passwordHash: string): Promise<boolean> {
  if (!supabase) return false;
  const avatar_initials = (fullName || email || '').trim().substring(0, 2).toUpperCase();
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
  motion_difficulty?: MotionDifficulty;
  production_date: string;
  period_start: string;
  period_end: string;
  studio: 'Jakarta' | 'Bandung';
}

export async function createStandaloneMotionTask(input: CreateStandaloneMotionInput, userId: string): Promise<MotionTask> {
  if (!supabase) {
    return localStore.createStandaloneMotionTask(input as any, userId);
  }

  // Find the max existing MOT-xxxx sequence to avoid duplicates
  const { data: existingMotTasks } = await supabase
    .from('tasks')
    .select('task_code')
    .like('task_code', `MOT-${new Date().getFullYear()}-%`)
    .order('task_code', { ascending: false })
    .limit(1);

  let seq = 1;
  if (existingMotTasks && existingMotTasks.length > 0) {
    const lastCode = existingMotTasks[0].task_code;
    const lastSeq = parseInt(lastCode.split('-').pop() || '0', 10);
    seq = lastSeq + 1;
  }
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
    status_motion: 'QUEUED',
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
    motion_difficulty: input.motion_difficulty || 'LVL_1_SIMPLE',
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

  const validOperatorId = operatorId && operatorId.trim() !== '' ? operatorId : null;

  await supabase.from('motion_tasks').update({
    status_motion: 'COMPLETED',
    updated_at: new Date().toISOString()
  }).eq('id', motionTaskId);

  if (motion.task_id) {
    await supabase.from('tasks').update({
      operator_id: validOperatorId,
      updated_at: new Date().toISOString()
    }).eq('id', motion.task_id);
  }

  await addAuditLog('motion_tasks', motionTaskId, 'STATUS_TRANSITION', userId, { status: motion.status_motion }, { status: 'COMPLETED', operator_id: validOperatorId });
}

export async function assignMotionPic(motionTaskId: string, motionPicId: string, userId?: string, difficulty?: MotionDifficulty): Promise<void> {
  if (!supabase) {
    localStore.assignMotionPic(motionTaskId, motionPicId);
    return;
  }
  const validPicId = motionPicId && motionPicId.trim() !== '' ? motionPicId : null;
  const updates: any = {
    motion_pic_id: validPicId,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('motion_tasks').update(updates).eq('id', motionTaskId);
  if (error) {
    console.error('Supabase assignMotionPic error:', error);
    throw new Error(error.message || error.details || 'Gagal assign Motion PIC');
  }
  if (userId) {
    await addAuditLog('motion_tasks', motionTaskId, 'ASSIGN', userId, null, { motion_pic_id: validPicId, difficulty });
  }

  if (validPicId && userId && validPicId !== userId) {
    try {
      const { data: motion } = await supabase.from('motion_tasks').select('task_id').eq('id', motionTaskId).single();
      let taskCode = 'Motion Task';
      if (motion?.task_id) {
        const { data: parentTask } = await supabase.from('tasks').select('task_code').eq('id', motion.task_id).single();
        if (parentTask?.task_code) taskCode = parentTask.task_code;
      }

      await sendNotificationsSafe(
        [validPicId],
        'Penugasan Motion Task',
        `Anda ditugaskan mengerjakan motion task pada ${taskCode}.`,
        'info',
        '/dashboard/motion',
        motion?.task_id || undefined,
        userId
      );
    } catch (err) {
      console.warn('Failed to send motion assignment notification:', err);
    }
  }
}


export async function updateMotionStatus(motionTaskId: string, status: MotionStatus, userId?: string): Promise<void> {
  invalidateStoreCache('motion_tasks');
  invalidateStoreCache('tasks_with_relations');
  if (!supabase) {
    localStore.updateMotionStatus(motionTaskId, status, userId);
    return;
  }
  const { data: currentMotion } = await supabase.from('motion_tasks').select('*').eq('id', motionTaskId).single();
  const oldStatus = currentMotion?.status_motion;

  const updatePayload: Record<string, any> = {
    status_motion: status,
    updated_at: new Date().toISOString()
  };
  if ((status === 'APPROVED' || status === 'COMPLETED') && !currentMotion?.approved_at) {
    updatePayload.approved_at = new Date().toISOString();
  }

  const { error } = await supabase.from('motion_tasks').update(updatePayload).eq('id', motionTaskId);
  if (error) throw error;

  if (userId) {
    await addAuditLog('motion_tasks', motionTaskId, 'STATUS_TRANSITION', userId, { status: oldStatus }, { status });
  }

  let taskForNotif: any = currentMotion;
  if (currentMotion?.task_id) {
    const { data: parentTask } = await supabase.from('tasks').select('*').eq('id', currentMotion.task_id).single();
    if (parentTask) {
      taskForNotif = { ...parentTask, motion_task: currentMotion };
    }
  }

  let performerName: string | undefined;
  if (userId) {
    try {
      const { data: u } = await supabase.from('users').select('full_name').eq('id', userId).single();
      if (u?.full_name) performerName = u.full_name;
    } catch {}
  }

  await dispatchStatusUpdateNotifications(taskForNotif, oldStatus, status, userId, performerName, true);
}

export async function submitMotionTask(motionTaskId: string, link: string, notes?: string, userId?: string): Promise<void> {
  if (!supabase) {
    localStore.submitMotionTask(motionTaskId, link, notes);
    return;
  }
  const { error } = await supabase.from('motion_tasks').update({
    status_motion: 'SUBMITTED',
    final_video_link: link,
    submission_date: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', motionTaskId);
  if (error) throw error;

  if (userId) {
    await addAuditLog('motion_tasks', motionTaskId, 'SUBMIT', userId, null, { final_video_link: link, notes });

    try {
      const { data: motion } = await supabase.from('motion_tasks').select('task_id').eq('id', motionTaskId).single();
      if (motion?.task_id) {
        const { data: parentTask } = await supabase.from('tasks').select('task_code, campaign_name, created_by').eq('id', motion.task_id).single();
        if (parentTask?.created_by && parentTask.created_by !== userId) {
          await sendNotificationsSafe(
            [parentTask.created_by],
            'Motion Task Disubmit',
            `Hasil animasi untuk ${parentTask.task_code} (${parentTask.campaign_name}) telah disubmit.`,
            'success',
            '/dashboard/motion',
            motion.task_id,
            userId
          );
        }
      }
    } catch (err) {
      console.warn('Failed to send motion submit notification:', err);
    }
  }
}

export async function requestMotionRevision(
  motionTaskId: string,
  input: { reason_category: import('./types').ReasonCategory; notes: string },
  requestedBy: string
): Promise<void> {
  if (!supabase) {
    localStore.requestMotionRevision(motionTaskId, input, requestedBy);
    invalidateStoreCache('motion_tasks');
    invalidateStoreCache('tasks_with_relations');
    return;
  }

  const { data: mt } = await supabase.from('motion_tasks').select('*').eq('id', motionTaskId).single();
  const nextRevCount = (mt?.motion_revision_count || 0) + 1;

  const { error: revErr } = await supabase.from('task_revisions').insert([{
    task_id: mt?.task_id || motionTaskId,
    stage: 'MOTION',
    revision_notes: `[${input.reason_category}] ${input.notes}`,
    requested_by: requestedBy,
    status: 'PENDING'
  }]);
  if (revErr) console.warn('task_revisions insert warning:', revErr);

  const { error } = await supabase.from('motion_tasks').update({
    status_motion: 'REVISION',
    motion_revision_count: nextRevCount,
    updated_at: new Date().toISOString()
  }).eq('id', motionTaskId);

  if (error) throw error;
  invalidateStoreCache('motion_tasks');
  invalidateStoreCache('tasks_with_relations');

  await addAuditLog('motion_tasks', motionTaskId, 'REVISION_REQUEST', requestedBy, null, { ...input, revision_number: nextRevCount });

  let performerName = 'User';
  try {
    const { data: u } = await supabase.from('users').select('full_name').eq('id', requestedBy).single();
    if (u?.full_name) performerName = u.full_name;
  } catch {}

  if (mt?.motion_pic_id && mt.motion_pic_id !== requestedBy) {
    await sendNotificationsSafe(
      [mt.motion_pic_id],
      'Motion Membutuhkan Revisi',
      `Motion task #${motionTaskId.substring(0, 8)} membutuhkan revisi dari ${performerName}.`,
      'warning',
      `/dashboard/motion?taskId=${motionTaskId}&tab=details`,
      mt?.task_id || motionTaskId,
      requestedBy,
      performerName
    );
  }
}

export async function deleteMotionTask(motionTaskId: string, userId?: string): Promise<void> {
  localStore.deleteMotionTask(motionTaskId);
  if (supabase) {
    const { error } = await supabase.from('motion_tasks').delete().eq('id', motionTaskId);
    if (error) {
      console.warn('Supabase deleteMotionTask error:', error);
      throw new Error(error.message || error.details || 'Gagal menghapus motion task');
    }
  }
  invalidateStoreCache('motion_tasks');
  invalidateStoreCache('tasks_with_relations');
}




