import { canUserAccessTaskChat, canUserEditComment, canUserDeleteComment } from '../lib/chat-auth';
import { checkRateLimit } from '../lib/rate-limiter';
import { 
  sanitizeChatMessage, 
  validateChatAttachment, 
  sanitizeChatMediaUrl
} from '../lib/utils';
import { unpackCommentData } from '../lib/supabase-store';
import * as localStore from '../lib/store';
import { TaskWithRelations, User, TaskComment } from '../lib/types';

interface TestResult {
  suite: string;
  test: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, suite: string, test: string, details?: string) {
  if (condition) {
    results.push({ suite, test, status: 'PASS', details });
    console.log(`  ✓ [PASS] ${test}`);
  } else {
    results.push({ suite, test, status: 'FAIL', details: details || 'Assertion failed' });
    console.error(`  ✗ [FAIL] ${test}: ${details}`);
  }
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('--- STARTING CMOMS REQUEST CHAT FULL AUDIT & VERIFICATION ---');
  console.log('======================================================\n');

  // -------------------------------------------------------------------------
  // 1. PARTICIPANT AUTHORIZATION & IDOR PREVENTION
  // -------------------------------------------------------------------------
  console.log('Suite 1: Participant Authorization & IDOR Access Control');

  const mockTask: any = {
    id: 'req-uuid-101',
    task_code: 'REQ-2026-0001',
    client_id: 1,
    client_name: 'Test Client',
    client_type: 'INTERNAL',
    campaign_name: 'Holiday Campaign',
    content_type_id: 1,
    content_type_name: 'Poster',
    task_source: 'ORCA',
    req_date: '2026-10-01',
    due_date: '2026-10-10',
    req_qty: 1,
    output_qty: 1,
    status_strat: 'NOT_REQUIRED',
    status_design: 'DESIGN_IN_PROGRESS',
    created_by: 'user-requester-1',
    created_by_name: 'Requester 1',
    design_pic_id: 'user-designer-1',
    design_pic_name: 'Designer 1',
    strat_pic_id: 'user-strat-1',
    strat_pic_name: 'Strat 1',
    motion_pic_id: 'user-motion-1',
    motion_pic_name: 'Motion 1',
    operator_id: 'user-operator-1',
    operator_name: 'Operator 1',
    strat_revision_count: 0,
    design_revision_count: 0,
    motion_revision_count: 0,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    comments: [],
    revisions: [],
    timeline: []
  };

  const createMockUser = (id: string, full_name: string, email: string, role_name: any, role_id: number, avatar_initials: string, daily_capacity_points = 0): User => ({
    id, full_name, email, role_name, role_id, avatar_initials, is_active: true, daily_capacity_points,
    password_hash: 'mock', created_at: '2026-01-01', updated_at: '2026-01-01'
  });

  const adminUser: User = createMockUser('admin-1', 'Admin User', 'admin@orbiz.id', 'ADMIN', 1, 'AD');
  const teamLeadUser: User = createMockUser('lead-1', 'Team Lead User', 'lead@orbiz.id', 'TEAM_LEAD', 2, 'TL');
  const requesterUser: User = createMockUser('user-requester-1', 'Requester', 'req@orbiz.id', 'REQUESTER', 3, 'RQ');
  const designPicUser: User = createMockUser('user-designer-1', 'Design PIC', 'des@orbiz.id', 'DESIGNER', 4, 'DP', 4);
  const stratPicUser: User = createMockUser('user-strat-1', 'Strategic PIC', 'strat@orbiz.id', 'STRATEGIC_PIC', 5, 'SP');
  const motionPicUser: User = createMockUser('user-motion-1', 'Motion PIC', 'motion@orbiz.id', 'MOTION_PIC', 6, 'MP', 4);
  const operatorUser: User = createMockUser('user-operator-1', 'Operator', 'op@orbiz.id', 'OPERATOR', 7, 'OP');
  
  // Unauthorized users
  const unauthorizedOtherRequester: User = createMockUser('user-other-requester', 'Rando Requester', 'rando@orbiz.id', 'REQUESTER', 3, 'RR');
  const unauthorizedOtherDesigner: User = createMockUser('user-other-designer', 'Rando Designer', 'otherdes@orbiz.id', 'DESIGNER', 4, 'OD', 4);

  assert(canUserAccessTaskChat(mockTask, adminUser), 'Authorization', 'Admin can access chat');
  assert(canUserAccessTaskChat(mockTask, teamLeadUser), 'Authorization', 'Team Lead can access chat');
  assert(canUserAccessTaskChat(mockTask, requesterUser), 'Authorization', 'Requester (creator) can access chat');
  assert(canUserAccessTaskChat(mockTask, designPicUser), 'Authorization', 'Design PIC can access chat');
  assert(canUserAccessTaskChat(mockTask, stratPicUser), 'Authorization', 'Strategic PIC can access chat');
  assert(canUserAccessTaskChat(mockTask, motionPicUser), 'Authorization', 'Motion PIC can access chat');
  assert(canUserAccessTaskChat(mockTask, operatorUser), 'Authorization', 'Operator can access chat');
  
  assert(!canUserAccessTaskChat(mockTask, unauthorizedOtherRequester), 'Authorization & IDOR', 'Unrelated requester is BLOCKED (IDOR protection)');
  assert(!canUserAccessTaskChat(mockTask, unauthorizedOtherDesigner), 'Authorization & IDOR', 'Unassigned designer is BLOCKED (IDOR protection)');

  // -------------------------------------------------------------------------
  // 2. MESSAGE EDIT & SOFT-DELETE PERMISSIONS
  // -------------------------------------------------------------------------
  console.log('\nSuite 2: Edit & Delete Permissions');

  const sampleComment: TaskComment = {
    id: 'comment-1',
    task_id: mockTask.id,
    user_id: designPicUser.id,
    user_name: designPicUser.full_name,
    user_avatar: designPicUser.avatar_initials,
    user_role: designPicUser.role_name,
    content: 'Initial design preview is uploaded.',
    created_at: '2026-10-02T10:00:00Z',
    is_edited: false,
    is_deleted: false,
    read_by: [designPicUser.id]
  };

  assert(canUserEditComment(sampleComment.user_id, designPicUser.id), 'Edit Authorization', 'Author can edit their own message');
  assert(!canUserEditComment(sampleComment.user_id, requesterUser.id), 'Edit Authorization', 'Non-author (Requester) CANNOT edit another user message');
  assert(!canUserEditComment(sampleComment.user_id, adminUser.id), 'Edit Authorization', 'Admin cannot modify words written by another user');

  assert(canUserDeleteComment(sampleComment.user_id, designPicUser), 'Delete Authorization', 'Author can delete their own message');
  assert(canUserDeleteComment(sampleComment.user_id, adminUser), 'Delete Authorization', 'Admin can moderate/delete any message');
  assert(canUserDeleteComment(sampleComment.user_id, teamLeadUser), 'Delete Authorization', 'Team Lead can moderate/delete any message');
  assert(!canUserDeleteComment(sampleComment.user_id, requesterUser), 'Delete Authorization', 'Non-author regular user CANNOT delete another user message');

  // -------------------------------------------------------------------------
  // 3. RATE LIMITING & FLOODING PROTECTION
  // -------------------------------------------------------------------------
  console.log('\nSuite 3: Rate Limiting / Anti-Spam Protection');

  const testUserId = 'spam-test-user';
  let allowedCount = 0;
  let blockedCount = 0;

  for (let i = 0; i < 15; i++) {
    const rateCheck = checkRateLimit(testUserId, 10, 10000);
    if (rateCheck.allowed) {
      allowedCount++;
    } else {
      blockedCount++;
    }
  }

  assert(allowedCount === 10, 'Rate Limiter', `Allowed exactly 10 requests under burst limit (got ${allowedCount})`);
  assert(blockedCount === 5, 'Rate Limiter', `Blocked subsequent burst requests (got ${blockedCount} blocked)`);

  // -------------------------------------------------------------------------
  // 4. XSS PROTECTION & INPUT VALIDATION
  // -------------------------------------------------------------------------
  console.log('\nSuite 4: XSS Protection & Input Validation');

  const emptyResult = sanitizeChatMessage('');
  assert(!emptyResult.valid, 'Input Validation', 'Rejects empty messages');

  const whitespaceResult = sanitizeChatMessage('     \n\t   ');
  assert(!whitespaceResult.valid, 'Input Validation', 'Rejects whitespace-only messages');

  const normalResult = sanitizeChatMessage('Halo tim, tolong dicek ya.');
  assert(normalResult.valid && normalResult.content === 'Halo tim, tolong dicek ya.', 'Input Validation', 'Accepts valid text');

  const pureScript = "<script>alert('XSS')</script>";
  const cleanPure = sanitizeChatMessage(pureScript);
  assert(!cleanPure.valid, 'XSS Protection', 'Completely rejects pure script injection payload');

  const mixedScript = "Tolong perbaiki warna background. <script>alert('XSS')</script>";
  const cleanMixed = sanitizeChatMessage(mixedScript);
  assert(cleanMixed.valid && !cleanMixed.content.includes('<script>'), 'XSS Protection', 'Strips script tags from mixed message content');

  const xssPayload2 = "<img src=x onerror=alert('PWNED')>";
  const cleanXss2 = sanitizeChatMessage(xssPayload2);
  assert(!cleanXss2.content.includes('onerror='), 'XSS Protection', 'Sanitizes inline event handlers');

  // URL Sanitization
  assert(sanitizeChatMediaUrl('javascript:alert(1)') === '', 'XSS URL Protection', 'Blocks javascript: pseudoprotocol');
  assert(sanitizeChatMediaUrl('data:image/svg+xml;utf8,<svg onload="alert(1)"></svg>') === '', 'XSS URL Protection', 'Blocks executable SVG data URLs');
  assert(sanitizeChatMediaUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==') !== '', 'XSS URL Protection', 'Permits safe PNG data URL');
  assert(sanitizeChatMediaUrl('https://example.com/asset.mp4') === 'https://example.com/asset.mp4', 'XSS URL Protection', 'Permits valid HTTPS media URL');

  // -------------------------------------------------------------------------
  // 5. ATTACHMENT WHITELIST VALIDATION
  // -------------------------------------------------------------------------
  console.log('\nSuite 5: Attachment Whitelist Validation');

  // Whitelisted image
  const validPng = validateChatAttachment({
    type: 'image',
    name: 'banner_output.png',
    size: 2 * 1024 * 1024,
    url: 'data:image/png;base64,testdata'
  });
  assert(validPng.valid, 'Attachment Whitelist', 'Allows valid PNG image');

  // Whitelisted video
  const validMp4 = validateChatAttachment({
    type: 'video',
    name: 'motion_render_final.mp4',
    size: 15 * 1024 * 1024,
    url: 'data:video/mp4;base64,testdata'
  });
  assert(validMp4.valid, 'Attachment Whitelist', 'Allows valid MP4 video under 25MB');

  // Disallowed executable / script
  const maliciousExe = validateChatAttachment({
    type: 'image',
    name: 'payload.exe',
    size: 1024,
    url: 'data:application/octet-stream;base64,test'
  });
  assert(!maliciousExe.valid, 'Attachment Security', 'Blocks executable files (.exe)');

  // SVG blocked
  const maliciousSvg = validateChatAttachment({
    type: 'image',
    name: 'vector.svg',
    size: 1024,
    url: 'data:image/svg+xml;base64,test'
  });
  assert(!maliciousSvg.valid, 'Attachment Security', 'Blocks SVG uploads due to script execution risk');

  // File size exceeded
  const hugeFile = validateChatAttachment({
    type: 'video',
    name: 'huge_render.mp4',
    size: 30 * 1024 * 1024, // 30MB
    url: 'data:video/mp4;base64,test'
  });
  assert(!hugeFile.valid, 'Attachment Security', 'Blocks files exceeding 25MB limit');

  // -------------------------------------------------------------------------
  // 6. BACKWARD-COMPATIBLE DATA PACKING & UNPACKING
  // -------------------------------------------------------------------------
  console.log('\nSuite 6: Data Packing & Schema Compatibility (unpackCommentData)');

  // Native row (when migration executed)
  const nativeRow = {
    id: 'c-native',
    task_id: 't-1',
    user_id: 'u-1',
    user_name: 'Budi',
    content: 'Revisi warna selesai',
    attachment_url: 'https://cdn.example.com/art.png',
    attachment_type: 'image',
    attachment_name: 'art.png',
    is_edited: true,
    edited_at: '2026-10-05T12:00:00Z',
    is_deleted: false,
    read_by: ['u-1', 'u-2']
  };
  const unpackedNative = unpackCommentData(nativeRow);
  assert(unpackedNative.is_edited === true, 'Data Unpack', 'Correctly reads native is_edited column');
  assert(unpackedNative.attachment_url === 'https://cdn.example.com/art.png', 'Data Unpack', 'Correctly reads native attachment_url');
  assert(Boolean(unpackedNative.read_by?.includes('u-2')), 'Data Unpack', 'Correctly reads native read_by array');

  // Fallback packed metadata row (when SQL migration has not been applied)
  const packedRow = {
    id: 'c-packed',
    task_id: 't-1',
    user_id: 'u-1',
    user_name: 'Budi',
    content: 'Pesan asli <!--CMOMS_CHAT_META:{"is_edited":true,"edited_at":"2026-10-05T12:00:00Z","attachment_url":"https://cdn.example.com/packed.png","attachment_type":"image","attachment_name":"packed.png","read_by":["u-1","u-3"]}-->',
    created_at: '2026-10-05T10:00:00Z'
  };
  const unpackedPacked = unpackCommentData(packedRow);
  assert(unpackedPacked.content === 'Pesan asli', 'Data Unpack', 'Strips packed metadata tag from visible content');
  assert(unpackedPacked.is_edited === true, 'Data Unpack', 'Extracted is_edited from packed metadata tag');
  assert(unpackedPacked.attachment_url === 'https://cdn.example.com/packed.png', 'Data Unpack', 'Extracted attachment_url from packed metadata tag');
  assert(Boolean(unpackedPacked.read_by?.includes('u-3')), 'Data Unpack', 'Extracted read_by from packed metadata tag');

  // -------------------------------------------------------------------------
  // 7. STORE MESSAGE OPERATIONS (Send, Edit, Soft-Delete, Read Receipts)
  // -------------------------------------------------------------------------
  console.log('\nSuite 7: Store Operations (localStore fallback)');

  const testTaskId = 'test-request-chat-001';
  const senderId = 'user-requester-1';
  const recipientId = 'user-designer-1';

  // 1. Send Message
  const postedComment = localStore.addComment(
    testTaskId,
    senderId,
    'Halo desainer, mohon perhatikan warna logo.'
  );
  assert(Boolean(postedComment.id && postedComment.content === 'Halo desainer, mohon perhatikan warna logo.'), 'Store', 'Message persisted successfully');
  assert(postedComment.read_by?.includes(senderId) === true, 'Store', 'Sender is automatically marked as read');
  assert(postedComment.read_by?.includes(recipientId) === false, 'Store', 'Recipient has not read message yet');

  // 2. Unread count check for recipient
  const unreadCountBefore = localStore.getUnreadCommentCount(testTaskId, recipientId);
  assert(unreadCountBefore >= 1, 'Store', `Unread count for recipient is >= 1 (got ${unreadCountBefore})`);

  // 3. Mark as read
  localStore.markCommentsAsRead(testTaskId, recipientId);
  const unreadCountAfter = localStore.getUnreadCommentCount(testTaskId, recipientId);
  assert(unreadCountAfter === 0, 'Store', `Unread count for recipient is 0 after markCommentsAsRead`);

  // 4. Edit message
  const editedComment = localStore.editComment(postedComment.id, senderId, 'Halo desainer, tolong gunakan logo versi putih.');
  assert(editedComment.is_edited === true, 'Store', 'Edited message is flagged with is_edited = true');
  assert(editedComment.content === 'Halo desainer, tolong gunakan logo versi putih.', 'Store', 'Edited content updated successfully');
  assert(editedComment.created_at === postedComment.created_at, 'Store', 'Original timestamp is preserved');

  // 5. Soft Delete
  localStore.deleteComment(postedComment.id, senderId, 'REQUESTER');
  const allComments = localStore.getComments();
  const deletedCmt = allComments.find(c => c.id === postedComment.id);
  assert(deletedCmt?.is_deleted === true, 'Store', 'Deleted message is soft-deleted (is_deleted = true)');
  assert(deletedCmt?.content === 'Pesan ini telah dihapus', 'Store', 'Content masked to "Pesan ini telah dihapus"');
  assert(deletedCmt?.deleted_by === senderId, 'Store', 'deleted_by audit identity preserved');

  // -------------------------------------------------------------------------
  // 8. CHAT BUBBLE ALIGNMENT & SENDER IDENTITY VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\nSuite 8: Chat Bubble Alignment & Identity Rules');

  const getBubbleAlignment = (comment: { user_id?: string; sender_id?: string }, currentUserId: string): 'RIGHT' | 'LEFT' => {
    const isOwnMessage = Boolean(currentUserId && (comment.user_id === currentUserId || comment.sender_id === currentUserId));
    return isOwnMessage ? 'RIGHT' : 'LEFT';
  };

  const userAId = 'user-requester-1';
  const userBId = 'user-designer-1';
  const userCId = 'user-strat-1';

  // Test 1: User A sends message
  const msgA1: TaskComment = {
    id: 'msg-101',
    task_id: testTaskId,
    user_id: userAId,
    sender_id: userAId,
    user_name: 'Budi Requester',
    sender_name: 'Budi Requester',
    user_avatar: 'BR',
    content: 'Halo tolong revisi warna',
    created_at: '2026-10-07T10:00:00Z'
  };
  assert(getBubbleAlignment(msgA1, userAId) === 'RIGHT', 'Bubble Alignment', 'User A sees own message on RIGHT');

  // Test 2: User B views the same request
  assert(getBubbleAlignment(msgA1, userBId) === 'LEFT', 'Bubble Alignment', 'User B sees User A message on LEFT');

  const msgB1: TaskComment = {
    id: 'msg-102',
    task_id: testTaskId,
    user_id: userBId,
    sender_id: userBId,
    user_name: 'Siti Designer',
    sender_name: 'Siti Designer',
    user_avatar: 'SD',
    content: 'Siap, sedang saya proses',
    created_at: '2026-10-07T10:02:00Z'
  };
  assert(getBubbleAlignment(msgB1, userBId) === 'RIGHT', 'Bubble Alignment', 'User B sees own message on RIGHT');
  assert(getBubbleAlignment(msgB1, userAId) === 'LEFT', 'Bubble Alignment', 'User A sees User B message on LEFT');

  // Test 3: Reload / Persistence retains correct alignment
  const unpackedMsg = unpackCommentData({
    id: 'msg-103',
    task_id: testTaskId,
    user_id: userAId,
    user_name: 'Budi Requester',
    content: 'Pesan terpersisten',
    created_at: '2026-10-07T10:05:00Z'
  });
  assert(getBubbleAlignment(unpackedMsg, userAId) === 'RIGHT', 'Bubble Alignment', 'Persisted message retains RIGHT alignment for author');
  assert(getBubbleAlignment(unpackedMsg, userBId) === 'LEFT', 'Bubble Alignment', 'Persisted message retains LEFT alignment for other users');

  // Test 4: Consecutive messages from same user
  const msgA2: TaskComment = { id: 'msg-104', task_id: testTaskId, user_id: userAId, user_name: 'Budi', content: 'Tambahan detail font', created_at: '2026-10-07T10:06:00Z', user_avatar: 'BR' };
  const msgA3: TaskComment = { id: 'msg-105', task_id: testTaskId, user_id: userAId, user_name: 'Budi', content: 'Gunakan Poppins ya', created_at: '2026-10-07T10:07:00Z', user_avatar: 'BR' };
  assert(
    getBubbleAlignment(msgA1, userAId) === 'RIGHT' &&
    getBubbleAlignment(msgA2, userAId) === 'RIGHT' &&
    getBubbleAlignment(msgA3, userAId) === 'RIGHT',
    'Bubble Alignment',
    'Multiple consecutive messages from same user all stay aligned to RIGHT'
  );

  // Test 5: Incoming message from User C (Strat)
  const msgC1: TaskComment = { id: 'msg-106', task_id: testTaskId, user_id: userCId, user_name: 'Ira Strat', content: 'Concept deck sudah approved', created_at: '2026-10-07T10:08:00Z', user_avatar: 'IS' };
  assert(getBubbleAlignment(msgC1, userAId) === 'LEFT', 'Bubble Alignment', 'User A sees User C message on LEFT');
  assert(getBubbleAlignment(msgC1, userBId) === 'LEFT', 'Bubble Alignment', 'User B sees User C message on LEFT');
  assert(getBubbleAlignment(msgC1, userCId) === 'RIGHT', 'Bubble Alignment', 'User C sees own message on RIGHT');

  // Test 6: String-tampering immunity (Name/role does NOT decide alignment, only ID)
  const spoofedNameMessage = {
    id: 'msg-107',
    task_id: testTaskId,
    user_id: 'attacker-uuid',
    user_name: 'Budi Requester', // Spoofed name
    user_role: 'REQUESTER',
    content: 'Pesan spoofing nama',
    created_at: '2026-10-07T10:09:00Z'
  };
  assert(getBubbleAlignment(spoofedNameMessage, userAId) === 'LEFT', 'Bubble Alignment', 'Spoofed name does NOT align to RIGHT (ID is source of truth)');

  // Test 7: Chat works across all Task Status transitions
  const statusList = ['DRAFT', 'STRAT_PENDING', 'DESIGN_UNASSIGNED', 'DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'DESIGN_SUBMITTED', 'DESIGN_REVISION', 'DESIGN_APPROVED', 'TASK_CLOSED'];
  statusList.forEach(st => {
    const taskWithStatus = { ...mockTask, status_design: st };
    const canAccess = canUserAccessTaskChat(taskWithStatus, requesterUser);
    assert(canAccess, 'Bubble Alignment', `Chat accessible and aligned in status ${st}`);
  });

  // -------------------------------------------------------------------------
  // 9. CHAT NOTIFICATION DELIVERY & RECIPIENT RESOLUTION
  // -------------------------------------------------------------------------
  console.log('\nSuite 9: Chat Notification Delivery & Recipient Resolution');

  const notifTask: any = {
    id: 'req-notif-999',
    task_code: 'REQ-2026-0999',
    campaign_name: 'Notification Test Campaign',
    created_by: 'user-a-requester',
    design_pic_id: 'user-b-designer',
    strat_pic_id: 'user-c-strat',
    operator_id: 'user-d-operator',
    motion_task: { motion_pic_id: 'user-e-motion' },
    status_design: 'DESIGN_ASSIGNED'
  };

  // Test 01: Recipient resolution - Actor User A sends message
  const userA_Id = 'user-a-requester';
  const recipientsForUserA = localStore.getInvolvedUserIds(notifTask, userA_Id);
  assert(
    !recipientsForUserA.includes(userA_Id),
    'Notifications: Chat Delivery',
    'Actor (User A) is excluded from receiving their own chat notification'
  );
  assert(
    recipientsForUserA.includes('user-b-designer') &&
    recipientsForUserA.includes('user-c-strat') &&
    recipientsForUserA.includes('user-d-operator') &&
    recipientsForUserA.includes('user-e-motion'),
    'Notifications: Chat Delivery',
    'All relevant participants (Designer, Strat, Operator, Motion PIC) are included in recipients'
  );

  // Test 02: Non-involved user is not in recipients
  const nonInvolvedId = 'user-z-unrelated';
  assert(
    !recipientsForUserA.includes(nonInvolvedId),
    'Notifications: Chat Delivery',
    'Non-involved user is NOT included in recipients'
  );

  // Test 03: Notification created as UNREAD
  const beforeNotifsCount = localStore.getUserNotifications('user-b-designer').length;
  localStore.addNotification(
    'user-b-designer',
    'Pesan baru dari Requester',
    '[REQ-2026-0999] Requester: Berikut revisi brief terbaru.',
    'info',
    '/dashboard/tasks?taskId=req-notif-999&tab=chat',
    'req-notif-999',
    userA_Id,
    'Requester',
    { notificationType: 'NEW_MESSAGE' }
  );
  const userB_Notifs = localStore.getUserNotifications('user-b-designer');
  const latestNotif = userB_Notifs[0];
  assert(
    userB_Notifs.length > beforeNotifsCount && latestNotif && latestNotif.read === false,
    'Notifications: State & Read/Unread',
    'Notification is created with read = false (UNREAD state)'
  );
  assert(
    latestNotif.notification_type === 'NEW_MESSAGE' && latestNotif.actor_user_id === userA_Id,
    'Notifications: Schema Integrity',
    'Notification contains correct notification_type and actor_user_id'
  );

  // Test 04: Notification Click Navigation link
  assert(
    latestNotif.link === '/dashboard/tasks?taskId=req-notif-999&tab=chat',
    'Notifications: Navigation',
    'Chat notification points directly to the task chat tab'
  );

  // Test 05: Mark single notification as read
  localStore.markNotificationAsRead(latestNotif.id);
  const updatedUserB_Notifs = localStore.getUserNotifications('user-b-designer');
  const readNotif = updatedUserB_Notifs.find(n => n.id === latestNotif.id);
  assert(
    readNotif?.read === true,
    'Notifications: State & Read/Unread',
    'Mark single notification as read updates read state to true'
  );

  // Test 06: Mark all notifications as read
  localStore.addNotification(
    'user-c-strat',
    'Notif 1',
    'Message 1',
    'info',
    '/dashboard/tasks',
    'req-notif-999',
    userA_Id
  );
  localStore.addNotification(
    'user-c-strat',
    'Notif 2',
    'Message 2',
    'info',
    '/dashboard/tasks',
    'req-notif-999',
    userA_Id
  );
  localStore.markNotificationsRead('user-c-strat');
  const userC_Unread = localStore.getUserNotifications('user-c-strat').filter(n => !n.read);
  assert(
    userC_Unread.length === 0,
    'Notifications: Mark All as Read',
    'markNotificationsRead marks all notifications for user as read (unread count = 0)'
  );

  // -------------------------------------------------------------------------
  // 10. STATUS UPDATE NOTIFICATIONS & DEDUPLICATION
  // -------------------------------------------------------------------------
  console.log('\nSuite 10: Status Update Notifications, Workflow Transitions & Deduplication');

  // Test 07: Status change Assigned -> In Progress sends notification to involved users (actor excluded)
  const taskStatusTarget: any = {
    id: 'req-status-888',
    task_code: 'REQ-2026-0888',
    campaign_name: 'Status Transition Test',
    created_by: 'user-requester-status',
    design_pic_id: 'user-designer-status',
    strat_pic_id: 'user-strat-status',
    status_design: 'DESIGN_ASSIGNED'
  };

  const designerActorId = 'user-designer-status';
  localStore.dispatchStatusUpdateNotifications(
    taskStatusTarget,
    'DESIGN_ASSIGNED',
    'DESIGN_IN_PROGRESS',
    designerActorId,
    'Designer User',
    false
  );

  const requesterStatusNotifs = localStore.getUserNotifications('user-requester-status');
  const designerStatusNotifs = localStore.getUserNotifications(designerActorId);
  const receivedNotif = requesterStatusNotifs.find(n => n.task_id === 'req-status-888' && n.new_status === 'DESIGN_IN_PROGRESS');
  const designerReceivedSelf = designerStatusNotifs.find(n => n.task_id === 'req-status-888' && n.new_status === 'DESIGN_IN_PROGRESS');

  assert(
    Boolean(receivedNotif),
    'Notifications: Status Updates',
    'Requester receives notification when Designer changes status Assigned -> In Progress'
  );
  assert(
    !designerReceivedSelf,
    'Notifications: Status Updates',
    'Actor (Designer) does NOT receive self-notification for their own status change'
  );

  // Test 08: Status change In Progress -> Completed / Submitted creates new notification
  localStore.dispatchStatusUpdateNotifications(
    taskStatusTarget,
    'DESIGN_IN_PROGRESS',
    'DESIGN_SUBMITTED',
    designerActorId,
    'Designer User',
    false
  );
  const submittedNotif = localStore.getUserNotifications('user-requester-status').find(
    n => n.task_id === 'req-status-888' && n.new_status === 'DESIGN_SUBMITTED'
  );
  assert(
    Boolean(submittedNotif && submittedNotif.notification_type === 'REQUEST_SUBMITTED'),
    'Notifications: Status Updates',
    'Transition to DESIGN_SUBMITTED creates REQUEST_SUBMITTED notification'
  );

  // Test 09: Motion Status transition creates MOTION_STATUS_UPDATED notification
  const motionStatusTarget: any = {
    id: 'mot-status-777',
    task_code: 'MOT-2026-0077',
    campaign_name: 'Motion Transition Test',
    created_by: 'user-requester-status',
    motion_pic_id: 'user-motion-actor',
    status_motion: 'QUEUED'
  };
  const motionActorId = 'user-motion-actor';
  localStore.dispatchStatusUpdateNotifications(
    motionStatusTarget,
    'QUEUED',
    'IN_PROGRESS',
    motionActorId,
    'Motion Artist',
    true
  );
  const motionNotif = localStore.getUserNotifications('user-requester-status').find(
    n => n.task_id === 'mot-status-777' && n.new_status === 'IN_PROGRESS'
  );
  assert(
    Boolean(motionNotif && motionNotif.notification_type === 'MOTION_STATUS_UPDATED'),
    'Notifications: Motion Pipeline',
    'Motion status transition dispatches MOTION_STATUS_UPDATED to Requester'
  );

  // Test 10: Deduplication test - Rapidly sending identical notification within window is ignored
  const notifCountBeforeDedupe = localStore.getUserNotifications('user-dedupe-test').length;
  localStore.addNotification(
    'user-dedupe-test',
    'Duplicate Title',
    'Duplicate Message Content',
    'info',
    '/dashboard/tasks',
    'task-dedupe-1'
  );
  // Immediate second call with identical payload
  localStore.addNotification(
    'user-dedupe-test',
    'Duplicate Title',
    'Duplicate Message Content',
    'info',
    '/dashboard/tasks',
    'task-dedupe-1'
  );
  const notifCountAfterDedupe = localStore.getUserNotifications('user-dedupe-test').length;
  assert(
    notifCountAfterDedupe === notifCountBeforeDedupe + 1,
    'Notifications: Deduplication',
    'Sliding deduplication window prevents duplicate notification from creating extra records'
  );

  // Test 11: XSS sanitization check
  const maliciousChat = '<script>alert("XSS")</script>Halo team';
  const sanitized = sanitizeChatMessage(maliciousChat);
  assert(
    sanitized.valid && !sanitized.content.includes('<script>') && sanitized.content === 'Halo team',
    'Notifications: Security & XSS',
    'XSS payload in message is sanitized and script tags stripped'
  );

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error during test suite:', err);
  process.exit(1);
});

