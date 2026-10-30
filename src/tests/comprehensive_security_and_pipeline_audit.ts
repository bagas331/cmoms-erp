import { signSessionToken, verifySessionToken, resolveAuthenticatedUser } from '../lib/server-auth';
import { GET as getApproved } from '../app/api/requests/approved/route';
import { GET as getMotionApproved } from '../app/api/motion/approved/route';
import { GET as getMessages, POST as postMessage } from '../app/api/requests/[id]/messages/route';
import { GET as getNotifications } from '../app/api/notifications/route';
import { POST as markNotificationRead } from '../app/api/notifications/read/route';
import { POST as postLogout } from '../app/api/auth/logout/route';
import {
  createTask,
  editTask,
  assignTask,
  submitTask,
  requestRevision,
  updateTaskStatus,
  getTasks,
  resetStore,
  getUsers,
  getMotionTasks,
  createStandaloneMotionTask,
  submitMotionTask,
  requestMotionRevision,
  getTaskWithRelations
} from '../lib/store';
import { getUsers as getDbUsers, unpackRevisionData } from '../lib/supabase-store';
import {
  determineTaskPipeline,
  isMockupTask,
  canTransitionToMotion,
  canUserManagePipeline,
  validatePipelineTransition,
  filterTasksByPipeline
} from '../lib/pipeline-router';
import { sanitizeChatMessage, sanitizeUrl } from '../lib/utils';
import { CreativeTask, TaskWithRelations } from '../lib/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (detail) console.error(`     Detail: ${detail}`);
    failed++;
  }
}

async function runAudit() {
  console.log('================================================================');
  console.log('[AUDIT] CMOS PHASE 3: COMPREHENSIVE INDEPENDENT AUDIT SUITE');
  console.log('================================================================\n');

  resetStore();
  const allUsers = getUsers();
  const adminUser = allUsers.find(u => u.role_name === 'ADMIN')!;
  const leadUser = allUsers.find(u => u.role_name === 'TEAM_LEAD')!;
  const stratUser = allUsers.find(u => u.role_name === 'STRATEGIC_PIC')!;
  const designerUser = allUsers.find(u => u.role_name === 'DESIGNER')!;
  const motionUser = allUsers.find(u => u.role_name === 'MOTION_PIC')!;
  const requesterUser = allUsers.find(u => u.role_name === 'REQUESTER')!;

  // --------------------------------------------------------------------------
  // SECTION 1: AUTHENTICATION & AUTHORIZATION HARDENING
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Authentication & Anti-Spoofing Audit ---');

  // 1.1 HMAC Token validation & Tampering resistance
  const validToken = signSessionToken({ id: adminUser.id, email: adminUser.email, role_name: adminUser.role_name });
  const verified = verifySessionToken(validToken);
  assert(Boolean(verified && verified.userId === adminUser.id), '1.1a Valid token signature verified');

  const tamperedPayload = Buffer.from(JSON.stringify({ userId: requesterUser.id, role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const forgedToken = `${tamperedPayload}.${validToken.split('.')[1]}`;
  assert(verifySessionToken(forgedToken) === null, '1.1b Forged payload with legitimate signature is rejected');

  const expiredToken = signSessionToken({ id: adminUser.id, email: adminUser.email, role_name: adminUser.role_name }, -100);
  assert(verifySessionToken(expiredToken) === null, '1.1c Expired session token is rejected');

  // 1.2 Identity & Role spoofing prevention
  const spoofHeaderReq = new Request('http://localhost:3000/api/test', {
    headers: { 'x-user-id': designerUser.id, 'x-user-role': 'ADMIN' }
  });
  const spoofResolved = await resolveAuthenticatedUser(spoofHeaderReq);
  assert(spoofResolved?.role_name === 'DESIGNER', '1.2a Role is authoritatively fetched from DB; header x-user-role is ignored');

  // 1.3 Query parameter spoofing prevention
  const querySpoofReq = new Request(`http://localhost:3000/api/test?userId=${adminUser.id}`);
  const queryResolved = await resolveAuthenticatedUser(querySpoofReq);
  assert(queryResolved === null, '1.3a Query param ?userId= cannot authenticate a request');

  // 1.4 Production mode isolation
  const origEnv = process.env.NODE_ENV;
  try {
    (process.env as any).NODE_ENV = 'production';
    const prodHeaderReq = new Request('http://localhost:3000/api/test', {
      headers: { 'x-user-id': adminUser.id }
    });
    const prodResolved = await resolveAuthenticatedUser(prodHeaderReq);
    assert(prodResolved === null, '1.4a In production mode, x-user-id header is STRICTLY disabled');

    const prodCookieReq = new Request('http://localhost:3000/api/test', {
      headers: { 'cookie': `cmoms_session=${validToken}` }
    });
    const prodCookieResolved = await resolveAuthenticatedUser(prodCookieReq);
    assert(Boolean(prodCookieResolved && prodCookieResolved.id === adminUser.id), '1.4b In production mode, signed session cookie is accepted');
  } finally {
    (process.env as any).NODE_ENV = origEnv;
  }

  // 1.5 Deactivated user rejection
  const dbUsers = await getDbUsers();
  const targetUser = dbUsers[dbUsers.length - 1];
  const origActive = targetUser.is_active;
  try {
    targetUser.is_active = false;
    const deactToken = signSessionToken({ id: targetUser.id, email: targetUser.email, role_name: targetUser.role_name });
    const deactReq = new Request('http://localhost:3000/api/test', { headers: { 'cookie': `cmoms_session=${deactToken}` } });
    assert(await resolveAuthenticatedUser(deactReq) === null, '1.5a Deactivated user (is_active === false) is rejected on token verification');
  } finally {
    targetUser.is_active = origActive;
  }

  // 1.6 Server logout cookie clearing
  const logoutRes = await postLogout();
  const setCookie = logoutRes.headers.get('set-cookie') || '';
  assert(setCookie.includes('cmoms_session=') && (setCookie.includes('Max-Age=0') || setCookie.includes('max-age=0')), '1.6a Logout clears cmoms_session cookie with Max-Age=0');

  // --------------------------------------------------------------------------
  // SECTION 2: FOUR-PIPELINE REGRESSION AUDIT
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Four-Pipeline Regression Audit ---');

  // 2.1 Strategic Pipeline independence
  const stratTask = createTask({
    client_id: 1,
    campaign_name: 'SPECIAL CAMPAIGN',
    content_type_id: 1, // Mockup Set
    task_source: 'ORCA',
    platform: 'SHOPEE',
    req_qty: 1,
    req_date: '2026-10-15',
    due_date: '2026-10-20',
    requires_strategic_concept: true,
    strat_pic_id: stratUser.id
  }, requesterUser.id);

  assert(determineTaskPipeline(stratTask) === 'STRATEGIC', '2.1a Initial strategic task routes to STRATEGIC');
  
  // Transition strategic task to APPROVED
  stratTask.status_strat = 'APPROVED';
  assert(determineTaskPipeline(stratTask) === 'STRATEGIC', '2.1b Approved strategic task remains strictly in STRATEGIC pipeline');
  assert(canTransitionToMotion(stratTask) === false, '2.1c Strategic task cannot transition to Motion');

  // 2.2 Task source does not force pipeline
  const orcaNonMockup = createTask({
    client_id: 1,
    campaign_name: 'BAU',
    content_type_id: 3, // PDP (is_mockup = false)
    task_source: 'ORCA',
    platform: 'SHOPEE',
    req_qty: 1,
    req_date: '2026-10-15',
    due_date: '2026-10-18'
  }, requesterUser.id);
  assert(determineTaskPipeline(orcaNonMockup) === 'GD_NON_MOCKUP', '2.2a ORCA source with non-mockup content routes to GD_NON_MOCKUP');

  const ecommerceMockup = createTask({
    client_id: 2,
    campaign_name: 'PAYDAY',
    content_type_id: 1, // Mockup (is_mockup = true)
    task_source: 'ECOMMERCE',
    platform: 'TOKOPEDIA',
    req_qty: 1,
    req_date: '2026-10-15',
    due_date: '2026-10-22'
  }, requesterUser.id);
  assert(determineTaskPipeline(ecommerceMockup) === 'GD_MOCKUP', '2.2b ECOMMERCE source with mockup content routes to GD_MOCKUP');

  // 2.3 E-commerce can enter Motion only after approval and explicit forwarding
  const approvedNonMockup = { ...orcaNonMockup, status_design: 'DESIGN_APPROVED' as const, motion_readiness: 'READY_TO_ANIMATE' as const };
  assert(canTransitionToMotion(approvedNonMockup) === true, '2.3a Approved E-commerce task can transition after it is marked ready');
  const transValidation = validatePipelineTransition(orcaNonMockup, 'MOTION', 'ADMIN');
  assert(transValidation.allowed === false, '2.3b validatePipelineTransition rejects an unapproved E-commerce task');
  assert(validatePipelineTransition(approvedNonMockup, 'MOTION', 'ADMIN').allowed, '2.3c approved E-commerce task may be forwarded');

  // 2.4 GD Mockup Motion handover prerequisites
  const rawMockup = { ...ecommerceMockup };
  assert(canTransitionToMotion(rawMockup) === false, '2.4a Unapproved mockup cannot transition to Motion');

  const approvedNotReadyMockup = { ...ecommerceMockup, status_design: 'DESIGN_APPROVED' as const, motion_readiness: 'WAITING_ASSET_GD' as const };
  assert(canTransitionToMotion(approvedNotReadyMockup) === false, '2.4b Approved mockup not ready to animate cannot transition to Motion');

  const readyMockup = { ...ecommerceMockup, status_design: 'DESIGN_APPROVED' as const, motion_readiness: 'READY_TO_ANIMATE' as const };
  assert(canTransitionToMotion(readyMockup) === true, '2.4c Approved and READY_TO_ANIMATE mockup qualifies for Motion handover');

  // 2.5 Date Immutability Verification
  const initialReqDate = '2026-10-15';
  const initialDueDate = '2026-10-22';
  const testDateTask = createTask({
    client_id: 1,
    campaign_name: 'DD',
    content_type_id: 1,
    task_source: 'ORCA',
    platform: 'SHOPEE',
    req_qty: 1,
    req_date: initialReqDate,
    due_date: initialDueDate
  }, requesterUser.id);

  assert(testDateTask.req_date === initialReqDate && testDateTask.due_date === initialDueDate, '2.5a Initial dates recorded correctly');

  // Action 1: Assign PIC
  assignTask(testDateTask.id, { design_pic_id: designerUser.id, design_difficulty: 'MEDIUM' }, leadUser.id);
  assert(testDateTask.req_date === initialReqDate && testDateTask.due_date === initialDueDate, '2.5b Assigning PIC does NOT modify req_date or due_date');

  // Action 2: Edit task without changing dates
  editTask(testDateTask.id, {
    client_id: 1,
    campaign_name: 'DD',
    content_type_id: 1,
    task_source: 'ORCA',
    platform: 'SHOPEE',
    req_qty: 2, // Changed quantity
    notes: 'Updated notes'
  }, requesterUser.id, requesterUser.role_name);
  assert(testDateTask.req_date === initialReqDate && testDateTask.due_date === initialDueDate, '2.5c Editing task details does NOT reset req_date or due_date');

  // Action 3: Submit Task (V1)
  submitTask(testDateTask.id, {
    output_qty: 2,
    final_asset_name: 'Mockup_V1.png',
    final_asset_link: 'https://drive.google.com/mockup-v1'
  }, designerUser.id);
  assert(testDateTask.req_date === initialReqDate && testDateTask.due_date === initialDueDate, '2.5d Submitting output does NOT modify req_date or due_date');

  // Action 4: Request Revision
  requestRevision(testDateTask.id, {
    stage: 'DESIGN',
    reason_category: 'BRIEF_MISALIGNMENT',
    notes: 'Tolong revisi warna.'
  }, requesterUser.id);
  assert(testDateTask.req_date === initialReqDate && testDateTask.due_date === initialDueDate, '2.5e Requesting revision does NOT modify req_date or due_date');

  // Action 5: Resubmit (V2) & Approve
  submitTask(testDateTask.id, {
    output_qty: 2,
    final_asset_name: 'Mockup_V2.png',
    final_asset_link: 'https://drive.google.com/mockup-v2'
  }, designerUser.id);
  updateTaskStatus(testDateTask.id, 'DESIGN_APPROVED', leadUser.id);
  assert(testDateTask.req_date === initialReqDate && testDateTask.due_date === initialDueDate, '2.5f Approving task does NOT modify req_date or due_date');

  // 2.6 Unauthorized Manipulation & RBAC
  let unauthorizedError = '';
  try {
    editTask(testDateTask.id, {
      client_id: 1,
      campaign_name: 'DD',
      content_type_id: 1,
      task_source: 'ORCA',
      platform: 'SHOPEE',
      req_qty: 1
    }, motionUser.id, motionUser.role_name); // Motion user trying to edit GD task
  } catch (err: any) {
    unauthorizedError = err.message;
  }
  assert(unauthorizedError.includes('Unauthorized'), '2.6a Unauthorized user cannot edit task (RBAC enforced)');

  // --------------------------------------------------------------------------
  // SECTION 3: REVISION ASSET HISTORY AUDIT
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Revision Asset History Audit ---');

  // 3.1 Multi-revision chain: V1 -> V2 -> V3
  const revTestTask = createTask({
    client_id: 1,
    campaign_name: 'BAU',
    content_type_id: 1,
    task_source: 'ORCA',
    platform: 'SHOPEE',
    req_qty: 1,
    req_date: '2026-10-10',
    due_date: '2026-10-15'
  }, requesterUser.id);

  // Submit V1
  submitTask(revTestTask.id, { output_qty: 1, final_asset_name: 'Asset_V1.png', final_asset_link: 'https://drive.google.com/asset-v1' }, designerUser.id);
  let taskRel = getTaskWithRelations(revTestTask.id)!;
  assert(taskRel.final_asset_link === 'https://drive.google.com/asset-v1', '3.1a Active asset link is V1');

  // Revision 1
  requestRevision(revTestTask.id, { stage: 'DESIGN', reason_category: 'COLOR_PALETTE', notes: 'Perbaiki kontras' }, requesterUser.id);
  taskRel = getTaskWithRelations(revTestTask.id)!;
  assert(taskRel.revisions.length === 1 && taskRel.revisions[0].asset_link === 'https://drive.google.com/asset-v1', '3.1b Revision 1 preserved V1 asset link snapshot');

  // Submit V2
  submitTask(revTestTask.id, { output_qty: 1, final_asset_name: 'Asset_V2.png', final_asset_link: 'https://drive.google.com/asset-v2' }, designerUser.id);
  taskRel = getTaskWithRelations(revTestTask.id)!;
  assert(taskRel.final_asset_link === 'https://drive.google.com/asset-v2', '3.1c Active asset link updated to V2');
  assert(taskRel.revisions[0].asset_link === 'https://drive.google.com/asset-v1', '3.1d Revision 1 snapshot STILL retains V1 link');

  // Revision 2
  requestRevision(revTestTask.id, { stage: 'DESIGN', reason_category: 'TYPOGRAPHY', notes: 'Ganti font' }, requesterUser.id);
  taskRel = getTaskWithRelations(revTestTask.id)!;
  assert(taskRel.revisions.length === 2 && taskRel.revisions[1].asset_link === 'https://drive.google.com/asset-v2', '3.1e Revision 2 preserved V2 asset link snapshot');

  // Submit V3
  submitTask(revTestTask.id, { output_qty: 1, final_asset_name: 'Asset_V3.png', final_asset_link: 'https://drive.google.com/asset-v3' }, designerUser.id);
  taskRel = getTaskWithRelations(revTestTask.id)!;
  assert(taskRel.final_asset_link === 'https://drive.google.com/asset-v3', '3.1f Active asset link updated to V3');
  assert(taskRel.revisions[0].asset_link === 'https://drive.google.com/asset-v1', '3.1g Revision 1 still has V1 link');
  assert(taskRel.revisions[1].asset_link === 'https://drive.google.com/asset-v2', '3.1h Revision 2 still has V2 link');

  // 3.2 Motion revision cycle & stage isolation
  const motionStandalone = createStandaloneMotionTask({
    client_id: 1,
    campaign_type: 'PAYDAY',
    motion_type: '2D Animation',
    notes: 'Motion Test'
  }, adminUser.id);

  submitMotionTask(motionStandalone.id, 'https://drive.google.com/motion-v1.mp4', 'Motion V1 render', motionUser.id);
  requestMotionRevision(motionStandalone.id, { reason_category: 'ANIMATION_TIMING', notes: 'Perlambat transisi' }, adminUser.id);
  
  taskRel = getTaskWithRelations(revTestTask.id)!;
  const motionRevs = taskRel.revisions.filter(r => r.stage === 'MOTION');
  assert(motionRevs.length === 0, '3.2a Creative task revisions do NOT contain motion revisions (stage isolation maintained)');

  // 3.3 Malicious URL sanitization in revision metadata
  const dangerousRawRow = {
    id: 'rev-mal-1',
    task_id: 't-x',
    stage: 'DESIGN',
    revision_notes: 'Revisi note\n<!--CMOMS_REVISION_ASSET:{"asset_link":"javascript:alert(1)","asset_name":"exploit.js"}-->',
    created_at: '2026-10-14T00:00:00Z'
  };
  const unpackedDangerous = unpackRevisionData(dangerousRawRow);
  assert(unpackedDangerous.asset_link === null, '3.3a Malicious javascript: link in revision tag is sanitized to null');

  // --------------------------------------------------------------------------
  // SECTION 4: SECURITY & IDOR REGRESSION TESTING
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Security & IDOR Regression Testing ---');

  // 4.1 Chat XSS Sanitization
  const rawXssMessage = '<script>alert("pwned")</script>Hello <b>World</b><img src=x onerror=alert(1)>';
  const cleanChat = sanitizeChatMessage(rawXssMessage);
  assert(cleanChat.valid && !cleanChat.content.includes('<script>') && !cleanChat.content.includes('onerror='), '4.1a Chat message XSS payloads stripped and sanitized');

  // 4.2 URL Sanitizer
  assert(sanitizeUrl('https://example.com/asset.png') === 'https://example.com/asset.png', '4.2a Safe HTTPS URL accepted');
  assert(sanitizeUrl('http://example.com/asset.png') === 'http://example.com/asset.png', '4.2b Safe HTTP URL accepted');
  assert(sanitizeUrl('javascript:alert(1)', null) === null, '4.2c javascript: pseudoprotocol sanitized to null when null fallback');
  assert(sanitizeUrl('data:text/html,<script>alert(1)</script>', null) === null, '4.2d data: URL sanitized to null when null fallback');
  assert(sanitizeUrl('vbscript:msgbox(1)', null) === null, '4.2e vbscript: pseudoprotocol sanitized to null when null fallback');
  assert(sanitizeUrl('javascript:alert(1)') === '#', '4.2f Dangerous URL with default fallback returns safe anchor #');

  // 4.3 Chat IDOR Protection
  const chatContext = { params: Promise.resolve({ id: testDateTask.id }) };
  // Requester Sarah created testDateTask, Designer Nadya is assigned.
  // Motion PIC Jova is NOT a participant.
  const motionChatReq = new Request(`http://localhost:3000/api/requests/${testDateTask.id}/messages`, {
    headers: { 'x-user-id': motionUser.id }
  });
  const motionChatRes = await getMessages(motionChatReq, chatContext);
  assert(motionChatRes.status === 403, '4.3a Non-participant user receives 403 Forbidden when attempting to access task chat');

  // 4.4 Notifications IDOR Protection
  // Designer attempting to view Admin notifications
  const idorNotifReq = new Request(`http://localhost:3000/api/notifications?userId=${adminUser.id}`, {
    headers: { 'x-user-id': designerUser.id }
  });
  const idorNotifRes = await getNotifications(idorNotifReq);
  assert(idorNotifRes.status === 403, '4.4a Non-admin user cannot read another user notifications (403 Forbidden)');

  console.log(`\n================================================================`);
  console.log(`FINAL AUDIT SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log(`================================================================`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Phase 3 Comprehensive Audit`);
  }
}

runAudit()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('Audit Suite Failed:', err);
    process.exit(1);
  });
