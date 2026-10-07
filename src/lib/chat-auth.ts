import { TaskWithRelations, CreativeTask, User as UserType } from './types';
import { getInvolvedUserIds } from './supabase-store';

/**
 * Determine if a user is authorized to view and participate in a task's discussion.
 * Prevents Insecure Direct Object Reference (IDOR) attacks.
 */
export function canUserAccessTaskChat(
  task: TaskWithRelations | CreativeTask | any,
  user: { id: string; role_name?: string } | null | undefined
): boolean {
  if (!task || !user || !user.id) return false;

  const role = user.role_name || '';

  // 1. Organizational supervisors have read/write access
  if (role === 'ADMIN' || role === 'TEAM_LEAD') {
    return true;
  }

  // 2. Requester check
  if (task.created_by === user.id) {
    return true;
  }

  // 3. Assigned PIC & Participants check
  const involvedIds = getInvolvedUserIds(task);
  if (involvedIds.includes(user.id)) {
    return true;
  }

  // 4. Standalone motion PIC check
  if (task.motion_pic_id === user.id) {
    return true;
  }

  return false;
}

/**
 * Determine if a user can edit a specific message.
 * Rule: Only the author of the message can edit it.
 */
export function canUserEditComment(
  commentUserId: string,
  currentUserId: string | null | undefined
): boolean {
  if (!commentUserId || !currentUserId) return false;
  return commentUserId === currentUserId;
}

/**
 * Determine if a user can delete a specific message.
 * Rule: The author of the message OR an Admin / Team Lead can delete it.
 */
export function canUserDeleteComment(
  commentUserId: string,
  user: { id: string; role_name?: string } | null | undefined
): boolean {
  if (!commentUserId || !user || !user.id) return false;
  if (commentUserId === user.id) return true;
  if (user.role_name === 'ADMIN' || user.role_name === 'TEAM_LEAD') return true;
  return false;
}
