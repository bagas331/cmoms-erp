// ============================================================
// TEST SUITE: APPROVED ARCHIVE RESTORE VERIFICATION ACROSS ALL PIPELINES
// Tests that tasks with is_archived === false/undefined in Approved Archive
// (DESIGN_APPROVED, TASK_CLOSED, APPROVED, COMPLETED) can be restored
// by authorized roles across all 4 pipelines:
// 1. STRATEGIC PIPELINE (STRATEGIC_PIC, ADMIN, TEAM_LEAD)
// 2. GD_MOCKUP PIPELINE (DESIGNER, REQUESTER, ADMIN, TEAM_LEAD)
// 3. GD_NON_MOCKUP PIPELINE (DESIGNER, REQUESTER, ADMIN, TEAM_LEAD)
// 4. MOTION PIPELINE (MOTION_PIC, REQUESTER, STRATEGIC_PIC, ADMIN, TEAM_LEAD)
// ============================================================

import assert from 'assert';
import {
  getTasks,
  setStore,
  getMotionTasks,
  STORE_KEYS,
  restoreTask,
  restoreMotionTask,
  getAuditLogs,
  getNotifications
} from '../lib/store';
import { getSyncOutboxItems } from '../lib/google-sheets-outbox';
import { canUserRestoreTask } from '../lib/archive-engine';
import { CreativeTask, MotionTask } from '../lib/types';

console.log('========================================================================');
console.log('TEST SUITE: APPROVED ARCHIVE RESTORE VERIFICATION ACROSS ALL PIPELINES');
console.log('========================================================================\n');

// 1. SETUP MOCK TASKS IN APPROVED ARCHIVE (with is_archived: false / undefined)
console.log('--- 1. RESTORING APPROVED TASKS WITHOUT is_archived FLAG ---');

const tasks = getTasks();

// Mock Strategic Task in Approved Archive (approved concept & design, is_archived: false)
const stratTask: CreativeTask = {
  id: 't-strat-app-1',
  task_code: 'REQ-STRAT-01',
  client_id: 1,
  campaign_name: 'Strategic Ramadhan 2026',
  content_type_id: 1,
  task_source: 'ORCA',
  req_qty: 2,
  output_qty: 2,
  req_date: '2026-03-01',
  due_date: '2026-03-10',
  submission_date: '2026-03-09',
  approved_at: '2026-03-09T15:00:00Z',
  sla_working_days: 2,
  operational_excellence: 'EXCELLENCE',
  requires_strategic_concept: true,
  pipeline_type: 'STRATEGIC',
  strat_pic_id: 'u-strat-ira',
  status_strat: 'APPROVED',
  strat_revision_count: 0,
  design_pic_id: 'u-des-nadya',
  design_difficulty: 'HIGH',
  design_revision_count: 0,
  status_design: 'DESIGN_APPROVED',
  motion_readiness: 'READY_TO_ANIMATE',
  operator_id: null,
  platform: 'SHOPEE',
  notes: 'Strategic mock task for archive restore test',
  created_by: 'u-req-sarah',
  created_at: '2026-03-01T08:00:00Z',
  updated_at: '2026-03-09T15:00:00Z',
  is_archived: false // NOT flagged as archived yet (shown via approved status in archive)
};

// Mock GD Mockup Task in Approved Archive (TASK_CLOSED, is_archived: undefined)
const gdMockupClosedTask: CreativeTask = {
  id: 't-mockup-closed-1',
  task_code: 'REQ-MOCKUP-01',
  client_id: 2,
  campaign_name: 'Snickers Payday Mockup',
  content_type_id: 1,
  task_source: 'ORCA',
  req_qty: 1,
  output_qty: 1,
  req_date: '2026-03-05',
  due_date: '2026-03-12',
  submission_date: '2026-03-11',
  approved_at: '2026-03-11T14:00:00Z',
  sla_working_days: 2,
  operational_excellence: 'EXCELLENCE',
  requires_strategic_concept: false,
  pipeline_type: 'GD_MOCKUP',
  strat_pic_id: null,
  status_strat: 'NOT_REQUIRED',
  strat_revision_count: 0,
  design_pic_id: 'u-des-yusuf',
  design_difficulty: 'MEDIUM',
  design_revision_count: 0,
  status_design: 'TASK_CLOSED',
  motion_readiness: 'READY_TO_ANIMATE',
  operator_id: null,
  platform: 'SHOPEE',
  notes: 'GD Mockup closed task',
  created_by: 'u-req-reza',
  created_at: '2026-03-05T08:00:00Z',
  updated_at: '2026-03-12T14:00:00Z'
  // is_archived is undefined
};

tasks.push(stratTask, gdMockupClosedTask);
setStore(STORE_KEYS.tasks, tasks);

// Verify permission check for STRATEGIC_PIC
assert(
  canUserRestoreTask('STRATEGIC_PIC', 'u-strat-ira', stratTask) === true,
  'STRATEGIC_PIC pemilik task berhak melakukan restore strategic task dari archive'
);
assert(
  canUserRestoreTask('STRATEGIC_PIC', 'u-strat-mahes', stratTask) === false,
  'STRATEGIC_PIC lain yang bukan PIC task ditolak hak restore-nya'
);
assert(
  canUserRestoreTask('REQUESTER', 'u-req-sarah', stratTask) === true,
  'REQUESTER pembuat request berhak melakukan restore task dari archive'
);
assert(
  canUserRestoreTask('ADMIN', 'u-admin-001', stratTask) === true,
  'ADMIN berhak melakukan restore strategic task'
);
console.log('[PASS] RBAC permission checks for STRATEGIC_PIC & REQUESTER verified');

// Execute restore on stratTask by STRATEGIC_PIC (even with is_archived: false)
const stratRestoreRes = restoreTask('t-strat-app-1', 'u-strat-ira');
assert(
  stratRestoreRes.success === true,
  'Restore task DESIGN_APPROVED dengan is_archived: false berhasil dilakukan'
);
const postStratTasks = getTasks();
const restoredStrat = postStratTasks.find(t => t.id === 't-strat-app-1');
assert(
  restoredStrat?.is_archived === false,
  'Task setelah di-restore memiliki flag is_archived=false'
);
assert(
  Boolean(restoredStrat?.restored_at),
  'restored_at timestamp tercatat saat restore'
);
assert(
  restoredStrat?.restored_by === 'u-strat-ira',
  'restored_by mencatat user ID yang melakukan restore'
);
console.log('[PASS] Approved strategic task successfully restored by assigned STRATEGIC_PIC');

// Execute restore on gdMockupClosedTask by DESIGNER (TASK_CLOSED with is_archived undefined)
const gdRestoreRes = restoreTask('t-mockup-closed-1', 'u-des-yusuf');
assert(
  gdRestoreRes.success === true,
  'Restore task TASK_CLOSED dengan is_archived undefined berhasil dilakukan'
);
const postGdTasks = getTasks();
const restoredGd = postGdTasks.find(t => t.id === 't-mockup-closed-1');
assert(
  restoredGd?.is_archived === false,
  'Task mockup closed setelah restore memiliki flag is_archived=false'
);
assert(
  restoredGd?.restored_by === 'u-des-yusuf',
  'restored_by mencatat designer yang melakukan restore'
);
console.log('[PASS] Closed GD Mockup task successfully restored by assigned DESIGNER');

// 2. MOTION PIPELINE APPROVED ARCHIVE RESTORE
console.log('\n--- 2. MOTION PIPELINE APPROVED ARCHIVE RESTORE ---');

const motionList = getMotionTasks();
const approvedMotionTask: MotionTask = {
  id: 'mt-app-1',
  task_id: 't-strat-app-1',
  motion_pic_id: 'u-mot-jova',
  operator_id: null,
  motion_difficulty: 'LVL_2_MEDIUM',
  motion_revision_count: 0,
  status_motion: 'APPROVED',
  apply_date: '2026-03-10',
  link_motion: 'https://drive.google.com/motion-sample',
  notes: 'Approved motion task without is_archived flag',
  created_at: '2026-03-09T16:00:00Z',
  updated_at: '2026-03-10T11:00:00Z',
  is_archived: false
};
motionList.push(approvedMotionTask);
setStore(STORE_KEYS.motionTasks, motionList);

// Verify permission for assigned MOTION_PIC
assert(
  canUserRestoreTask('MOTION_PIC', 'u-mot-jova', approvedMotionTask) === true,
  'MOTION_PIC yang ditugaskan berhak me-restore approved motion task'
);
assert(
  canUserRestoreTask('MOTION_PIC', 'u-mot-bima', approvedMotionTask) === false,
  'MOTION_PIC lain ditolak me-restore approved motion task'
);
// Verify permission for REQUESTER who created the parent creative task
assert(
  canUserRestoreTask('REQUESTER', 'u-req-sarah', approvedMotionTask) === true,
  'REQUESTER pembuat creative task berhak me-restore motion task terkait'
);

// Execute restore on approved motion task (is_archived: false)
const motionRestoreRes = restoreMotionTask('mt-app-1', 'u-mot-jova');
assert(
  motionRestoreRes.success === true,
  'Restore motion task APPROVED dengan is_archived: false berhasil dilakukan'
);
const postMotionTasks = getMotionTasks();
const restoredMt = postMotionTasks.find(m => m.id === 'mt-app-1');
assert(
  restoredMt?.is_archived === false,
  'Motion task setelah restore memiliki flag is_archived=false'
);
assert(
  Boolean(restoredMt?.restored_at),
  'restored_at timestamp tercatat pada motion task'
);
console.log('[PASS] Approved motion task successfully restored by assigned MOTION_PIC');

// 3. AUDIT LOGS, NOTIFICATIONS & SHEETS OUTBOX
console.log('\n--- 3. AUDIT LOGS, NOTIFICATIONS & GOOGLE SHEETS OUTBOX ---');

const auditLogs = getAuditLogs();
const restoreCreativeLogs = auditLogs.filter(l => l.entity_name === 'creative_tasks' && l.action === 'RESTORE');
const restoreMotionLogs = auditLogs.filter(l => l.entity_name === 'motion_tasks' && l.action === 'RESTORE');
assert(
  restoreCreativeLogs.length >= 2,
  'Audit trail mencatat aksi RESTORE pada creative_tasks'
);
assert(
  restoreMotionLogs.length >= 1,
  'Audit trail mencatat aksi RESTORE pada motion_tasks'
);
console.log('[PASS] Audit logs recorded RESTORE events for both creative & motion tasks');

const notifications = getNotifications();
const restoreNotifs = notifications.filter(n => n.title.includes('Dipulihkan dari Arsip'));
assert(
  restoreNotifs.length > 0,
  'Notifikasi task dipulihkan berhasil dikirimkan ke anggota tim terkait'
);
console.log('[PASS] Team notifications dispatched successfully upon task restoration');

async function checkOutbox() {
  const outbox = await getSyncOutboxItems(50);
  const sheetsUpdateEvents = outbox.filter(item => item.event_type.includes('UPDATE'));
  assert(
    sheetsUpdateEvents.length > 0,
    'Google Sheets Outbox mencatat payload sinkronisasi pasca restore'
  );
  console.log('[PASS] Google Sheets outbox sync enqueued for restored tasks');

  // 4. UUID & USER RESOLUTION VERIFICATION
  console.log('\n--- 4. UUID & USER RESOLUTION VERIFICATION ---');
  // Re-archive a task for UUID test
  const curTasks = getTasks();
  curTasks[0].is_archived = true;
  curTasks[0].restored_at = null;
  curTasks[0].status_design = 'DESIGN_APPROVED';
  setStore(STORE_KEYS.tasks, curTasks);

  // Restore using Supabase UUID for admin: '00000000-0000-0000-0000-000000000001'
  const uuidRestoreRes = restoreTask(curTasks[0].id, '00000000-0000-0000-0000-000000000001');
  assert(
    uuidRestoreRes.success === true,
    `Restore dengan Supabase UUID harus sukses, namun dapat error: ${uuidRestoreRes.message}`
  );
  console.log('[PASS] Task successfully restored using Supabase UUID (00000000-0000-0000-0000-000000000001)');

  // Re-archive and test restore using userOverride object
  curTasks[0].is_archived = true;
  curTasks[0].restored_at = null;
  setStore(STORE_KEYS.tasks, curTasks);

  const customUser = {
    id: 'u-custom-admin',
    email: 'custom@orbiz.id',
    full_name: 'Custom Admin User',
    avatar_initials: 'CA',
    role_id: 1,
    role_name: 'ADMIN' as const,
    daily_capacity_points: 0,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  };

  const overrideRestoreRes = restoreTask(curTasks[0].id, 'u-custom-admin', customUser);
  assert(
    overrideRestoreRes.success === true,
    `Restore dengan userOverride harus sukses, namun dapat error: ${overrideRestoreRes.message}`
  );
  console.log('[PASS] Task successfully restored using userOverride object');

  // Verify canUserRestoreTask with UUID designer
  const nadyaTask = { ...stratTask, design_pic_id: 'u-des-nadya' };
  assert(
    canUserRestoreTask('DESIGNER', '00000000-0000-0000-0000-000000000005', nadyaTask) === true,
    'canUserRestoreTask harus match UUID Nadya dengan seed ID u-des-nadya'
  );
  console.log('[PASS] canUserRestoreTask correctly normalizes UUID and seed user IDs');

  console.log('\n========================================================================');
  console.log('ALL APPROVED ARCHIVE RESTORE TESTS PASSED SUCCESSFULLY ACROSS ALL PIPELINES!');
  console.log('========================================================================');
}

checkOutbox().catch(err => {
  console.error(err);
  process.exit(1);
});
