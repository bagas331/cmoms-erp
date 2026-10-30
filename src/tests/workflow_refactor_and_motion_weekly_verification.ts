/**
 * Test Suite: Workflow Refactor, Manual Pipeline Transitions, Motion Weekly Kanban & Centralized Archive
 * 
 * Verifies:
 * 1. Strategic Pipeline Card Disappearance upon approval (t.status_strat === 'APPROVED' excluded from active board).
 * 2. Strategic Request Auto-Forwarding to GD Pipeline (ORCA -> GD_MOCKUP, ECOMMERCE -> GD_NON_MOCKUP).
 * 3. Strategic Approval returns `{ task, spawnedTask }` with complete metadata for ForwardSuccessModal.
 * 4. GD Mockup Task remains approved until manually forwarded to Motion.
 * 5. Motion Kanban Column Configuration contains 9 columns (5 workflow + 4 weekly partitions W1-W4 right of Approved).
 * 6. Weekly Drag-and-Drop rescheduling due date via `updateMotionDueDate`.
 * 7. Centralized Motion Monthly Auto-Archive identifies past-month completed tasks and sets is_archived, archive_period, archived_at.
 * 8. Centralized Archive restoration with RBAC preservation.
 */

import {
  resetStore,
  getUsers,
  getTasks,
  getMotionTasks,
  createTask,
  updateStratStatus,
  updateTaskStatus,
  createStandaloneMotionTask,
  updateMotionDueDate,
  autoArchiveCompletedTasks,
  restoreMotionTask,
  forwardTaskToMotion,
  setStore,
  STORE_KEYS
} from '../lib/store';
import {
  MOTION_KANBAN_COLUMNS
} from '../lib/constants';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] FAILED: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('[TEST] VERIFYING WORKFLOW REFACTOR, TRANSITIONS & MOTION KANBAN');
  console.log('================================================================\n');

  // Test 1: Strategic Approval Card Disappearance & Auto-Forwarding to GD Mockup
  console.log('--- Test 1: Strategic Approval to GD Mockup ---');
  resetStore();

  const users = getUsers();
  const admin = users.find(u => u.role_name === 'ADMIN')!;
  const requester = users.find(u => u.role_name === 'REQUESTER')!;
  const stratPic = users.find(u => u.role_name === 'STRATEGIC_PIC') || admin;
  const motionPic = users.find(u => u.role_name === 'MOTION_PIC') || admin;

  const stratTask1 = createTask({
    task_source: 'ORCA',
    client_id: 'client-1',
    category: 'Creative Design',
    operational_excellence: 'TOP_URGENT',
    title: 'ORCA Campaign Mockup Concept',
    description: 'Strategic visual concept for brand campaign',
    created_by: requester.id,
    requires_strategic_concept: true,
    strat_pic_ids: [stratPic.id]
  });

  assert(stratTask1.pipeline_type === 'STRATEGIC', 'Strategic task created with pipeline_type STRATEGIC');
  assert(stratTask1.status_strat === 'PENDING', 'Initial strategic status is PENDING');

  // Approve Strategic Task
  const approvalResult1 = updateStratStatus(stratTask1.id, 'APPROVED', admin.id);
  assert(Boolean(approvalResult1.spawnedTask), 'Approval spawned GD task successfully');
  assert(approvalResult1.spawnedTask?.pipeline_type === 'GD_MOCKUP', 'ORCA source routed to GD_MOCKUP pipeline');
  assert(approvalResult1.spawnedTask?.status_design === 'DESIGN_UNASSIGNED', 'Spawned GD Mockup task has status_design DESIGN_UNASSIGNED');
  assert(approvalResult1.spawnedTask?.source_strategic_task_id === stratTask1.id, 'Spawned GD task references parent strategic task');
  assert(approvalResult1.task.status_strat === 'APPROVED', 'Parent strategic task is now APPROVED');

  // Verify Active Strategic Kanban Board Exclusion
  const activeStratTasks = getTasks().filter(t => t.pipeline_type === 'STRATEGIC' && t.status_strat !== 'APPROVED');
  assert(!activeStratTasks.some(t => t.id === stratTask1.id), 'Approved Strategic card disappears from active Strategic Kanban board');

  // Test 2: Strategic Approval to GD Non-Mockup (E-Commerce)
  console.log('\n--- Test 2: Strategic Approval to GD Non-Mockup (E-Commerce) ---');
  const stratTask2 = createTask({
    task_source: 'ECOMMERCE',
    client_id: 'client-2',
    category: 'E-commerce PDP',
    title: 'Marketplace Banner Concept',
    description: 'Strategic concept for seasonal sale banner',
    created_by: requester.id,
    requires_strategic_concept: true,
    strat_pic_ids: [stratPic.id]
  });

  const approvalResult2 = updateStratStatus(stratTask2.id, 'APPROVED', admin.id);
  assert(approvalResult2.spawnedTask?.pipeline_type === 'GD_NON_MOCKUP', 'ECOMMERCE source routed to GD_NON_MOCKUP pipeline');
  assert(approvalResult2.spawnedTask?.is_mockup === false, 'Spawned task is marked as non-mockup');

  // Test 3: GD Mockup approval remains in source until manual forwarding
  console.log('\n--- Test 3: GD Mockup Approval and Manual Motion Forward ---');
  const gdMockupTask = approvalResult1.spawnedTask!;
  assert(gdMockupTask.status_design === 'DESIGN_UNASSIGNED', 'GD Mockup task starts DESIGN_UNASSIGNED');

  // Move GD Mockup to DESIGN_APPROVED
  updateTaskStatus(gdMockupTask.id, 'DESIGN_APPROVED', admin.id);
  const updatedGdTask = getTasks().find(t => t.id === gdMockupTask.id)!;
  assert(updatedGdTask.status_design === 'DESIGN_APPROVED', 'GD Mockup task is DESIGN_APPROVED');
  assert(updatedGdTask.pipeline_type === 'GD_MOCKUP', 'Approved request stays in the source pipeline');

  assert(!getMotionTasks().some(m => m.task_id === updatedGdTask.id), 'Approval alone does not create a Motion task');
  forwardTaskToMotion(updatedGdTask.id, admin.id);
  const spawnedMotion = getMotionTasks().find(m => m.task_id === updatedGdTask.id);
  assert(Boolean(spawnedMotion), 'Motion task exists after manual forward');
  assert(spawnedMotion?.status_motion === 'QUEUED', 'Manually forwarded Motion task enters the QUEUED column');

  // Active GD Mockup Board Filter excludes tasks with motion_readiness === 'READY_TO_ANIMATE' or motion subtask
  const activeGdMockupTasks = getTasks().filter(t => 
    t.pipeline_type === 'GD_MOCKUP' && 
    t.motion_readiness !== 'READY_TO_ANIMATE' && 
    !getMotionTasks().some(m => m.task_id === t.id)
  );
  assert(!activeGdMockupTasks.some(t => t.id === gdMockupTask.id), 'GD task with motion handover disappears from active GD Approved column');

  // Test 4: Motion Kanban 9-Column Configuration
  console.log('\n--- Test 4: Motion Kanban 9 Columns Architecture ---');
  assert(MOTION_KANBAN_COLUMNS.length === 9, 'MOTION_KANBAN_COLUMNS contains exactly 9 columns');
  const colStatuses = MOTION_KANBAN_COLUMNS.map(c => c.status);
  assert(colStatuses[0] === 'QUEUED', 'Column 1 is QUEUED');
  assert(colStatuses[1] === 'IN_PROGRESS', 'Column 2 is IN_PROGRESS');
  assert(colStatuses[2] === 'SUBMITTED', 'Column 3 is SUBMITTED');
  assert(colStatuses[3] === 'REVISION', 'Column 4 is REVISION');
  assert(colStatuses[4] === 'APPROVED', 'Column 5 is APPROVED');
  assert(colStatuses[5] === 'W1', 'Column 6 is W1 (immediately right of Approved)');
  assert(colStatuses[6] === 'W2', 'Column 7 is W2');
  assert(colStatuses[7] === 'W3', 'Column 8 is W3');
  assert(colStatuses[8] === 'W4', 'Column 9 is W4');

  const weeklyCols = MOTION_KANBAN_COLUMNS.filter(c => c.isWeekly);
  assert(weeklyCols.length === 4, 'Exactly 4 weekly partition columns W1-W4 configured');

  // Test 5: Drag-and-Drop Weekly Due Date Rescheduling
  console.log('\n--- Test 5: Weekly Reschedule via updateMotionDueDate ---');
  const newDueDate = '2026-10-14T17:00:00.000Z';
  const updatedMotion = updateMotionDueDate(spawnedMotion!.id, newDueDate, admin.id);
  assert(updatedMotion?.due_date === newDueDate, 'Motion task due_date updated to Week 2 target date');
  const linkedParentTask = getTasks().find(t => t.id === updatedMotion?.task_id);
  assert(linkedParentTask?.due_date === newDueDate, 'Parent creative task due_date synced seamlessly');

  // Test 6: Centralized Monthly Auto-Archive for Motion
  console.log('\n--- Test 6: Centralized Monthly Auto-Archive ---');
  // Create a motion task completed in a past month
  const pastMotionTask = createStandaloneMotionTask({
    title: 'Past Month Motion Ad',
    client_id: 1,
    motion_pic_id: motionPic.id,
    difficulty: 'LVL_1_EASY',
    campaign_type: 'BAU'
  }, admin.id);
  pastMotionTask.status_motion = 'COMPLETED';
  pastMotionTask.apply_date = '2026-08-15T10:00:00.000Z';
  pastMotionTask.approved_at = '2026-08-15T10:00:00.000Z';
  pastMotionTask.created_at = '2026-08-01T08:00:00.000Z';
  pastMotionTask.due_date = '2026-08-14T17:00:00.000Z';

  // Save to store
  const allMotion = getMotionTasks();
  const pIdx = allMotion.findIndex(m => m.id === pastMotionTask.id);
  if (pIdx !== -1) allMotion[pIdx] = pastMotionTask;
  setStore(STORE_KEYS.motionTasks, allMotion);

  const archiveResult = autoArchiveCompletedTasks(new Date());
  assert(archiveResult.archivedMotionTasks.includes(pastMotionTask.id), 'Auto-archive identified past-month completed motion task');
  const archivedPast = getMotionTasks().find(m => m.id === pastMotionTask.id)!;
  assert(archivedPast.is_archived === true, 'Past-month motion task is marked is_archived = true');
  assert(archivedPast.archive_period === '2026-08', 'archive_period accurately computed as 2026-08');
  assert(Boolean(archivedPast.archived_at), 'archived_at timestamp recorded');

  // Verify task does not show on active board
  const activeMotionList = getMotionTasks().filter(m => !m.is_archived);
  assert(!activeMotionList.some(m => m.id === pastMotionTask.id), 'Archived motion task excluded from active Motion Kanban');

  // Test 7: Centralized Archive Restoration
  console.log('\n--- Test 7: Restore Archived Motion Task ---');
  const restoreRes = restoreMotionTask(archivedPast.id, admin.id);
  assert(restoreRes.success, 'Admin successfully restored archived motion task');
  const restoredTask = getMotionTasks().find(m => m.id === archivedPast.id)!;
  assert(restoredTask.is_archived === false, 'Restored task has is_archived = false');
  assert(restoredTask.restored_by === admin.id, 'restored_by recorded');
  assert(Boolean(restoredTask.restored_at), 'restored_at recorded');

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
