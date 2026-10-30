import assert from 'assert';
import {
  validateStageTransition,
  filterTasksByPipeline,
  isMockupTask
} from '../lib/pipeline-router';
import {
  createTask,
  getTasks,
  resetStore,
  getUsers,
  getTaskWithRelations,
  assignTask,
  updateStratStatus,
  submitStrategicConcept,
  requestRevision,
  updateTaskStatus,
  submitTask,
  createStandaloneMotionTask,
  assignMotionPic,
  updateMotionStatus,
  submitMotionTask,
  requestMotionRevision,
  getMotionTasks
} from '../lib/store';
import { RoleName } from '../lib/types';

console.log('========================================================================');
console.log('RUNNING COMPREHENSIVE PIPELINE SEQUENTIAL STAGE & MODAL VERIFICATION');
console.log('========================================================================\n');

// 0. Setup
resetStore();
const allUsers = getUsers();
const adminUser = allUsers.find(u => u.role_name === 'ADMIN')!;
const leadUser = allUsers.find(u => u.role_name === 'TEAM_LEAD')!;
const stratUser = allUsers.find(u => u.role_name === 'STRATEGIC_PIC')!;
const designerUser = allUsers.find(u => u.role_name === 'DESIGNER')!;
const motionUser = allUsers.find(u => u.role_name === 'MOTION_PIC')!;
const requesterUser = allUsers.find(u => u.role_name === 'REQUESTER')!;

// -------------------------------------------------------------------
// 1. STRATEGIC PIPELINE SEQUENTIAL STAGES ENFORCEMENT
// -------------------------------------------------------------------
console.log('--- 1. Testing Strategic Pipeline Stage Transitions ---');

// 1a. From PENDING: cannot jump to REVIEW, REVISION, or APPROVED
const stratPendingToReview = validateStageTransition('STRATEGIC', 'PENDING', 'REVIEW', { hasPic: true });
assert.strictEqual(stratPendingToReview.allowed, false, '1a-1. Cannot jump from PENDING to REVIEW');
assert.ok(stratPendingToReview.reason?.includes('In Progress'), 'Reason mentions In Progress requirement');

const stratPendingToApproved = validateStageTransition('STRATEGIC', 'PENDING', 'APPROVED', { hasPic: true });
assert.strictEqual(stratPendingToApproved.allowed, false, '1a-2. Cannot jump from PENDING to APPROVED');

const stratPendingToRevision = validateStageTransition('STRATEGIC', 'PENDING', 'REVISION', { hasPic: true });
assert.strictEqual(stratPendingToRevision.allowed, false, '1a-3. Cannot jump from PENDING to REVISION');

// 1b. From PENDING to IN_PROGRESS: requires PIC assigned
const stratPendingNoPic = validateStageTransition('STRATEGIC', 'PENDING', 'IN_PROGRESS', { hasPic: false });
assert.strictEqual(stratPendingNoPic.allowed, false, '1b-1. PENDING to IN_PROGRESS without assigned PIC is blocked');
assert.ok(stratPendingNoPic.reason?.includes('Assign'), 'Reason mentions assigning Strategic PIC');

const stratPendingWithPic = validateStageTransition('STRATEGIC', 'PENDING', 'IN_PROGRESS', { hasPic: true });
assert.strictEqual(stratPendingWithPic.allowed, true, '1b-2. PENDING to IN_PROGRESS with assigned PIC is allowed');

// 1c. From IN_PROGRESS: can move to REVIEW (modal submit), cannot jump to APPROVED or REVISION
const stratInProgToReview = validateStageTransition('STRATEGIC', 'IN_PROGRESS', 'REVIEW', { hasPic: true });
assert.strictEqual(stratInProgToReview.allowed, true, '1c-1. IN_PROGRESS to REVIEW is allowed');

const stratInProgToApproved = validateStageTransition('STRATEGIC', 'IN_PROGRESS', 'APPROVED', { hasPic: true });
assert.strictEqual(stratInProgToApproved.allowed, false, '1c-2. IN_PROGRESS cannot jump directly to APPROVED');

const stratInProgToRevision = validateStageTransition('STRATEGIC', 'IN_PROGRESS', 'REVISION', { hasPic: true });
assert.strictEqual(stratInProgToRevision.allowed, false, '1c-3. IN_PROGRESS cannot jump directly to REVISION');

// 1d. From REVIEW: can move to APPROVED or REVISION
const stratReviewToApproved = validateStageTransition('STRATEGIC', 'REVIEW', 'APPROVED', { hasPic: true });
assert.strictEqual(stratReviewToApproved.allowed, true, '1d-1. REVIEW to APPROVED is allowed');

const stratReviewToRevision = validateStageTransition('STRATEGIC', 'REVIEW', 'REVISION', { hasPic: true });
assert.strictEqual(stratReviewToRevision.allowed, true, '1d-2. REVIEW to REVISION is allowed');

// 1e. From REVISION: can re-submit to REVIEW, cannot jump directly to APPROVED
const stratRevToReview = validateStageTransition('STRATEGIC', 'REVISION', 'REVIEW', { hasPic: true });
assert.strictEqual(stratRevToReview.allowed, true, '1e-1. REVISION to REVIEW is allowed (resubmit)');

const stratRevToApproved = validateStageTransition('STRATEGIC', 'REVISION', 'APPROVED', { hasPic: true });
assert.strictEqual(stratRevToApproved.allowed, false, '1e-2. REVISION cannot jump directly to APPROVED');
assert.ok(stratRevToApproved.reason?.includes('revisi'), 'Reason explains revision must be re-submitted first');

console.log('[PASS] Strategic Pipeline validation checks passed 100%');


// -------------------------------------------------------------------
// 2. GD PIPELINES (MOCKUP & NON-MOCKUP) SEQUENTIAL STAGES ENFORCEMENT
// -------------------------------------------------------------------
console.log('\n--- 2. Testing GD Pipelines Stage Transitions ---');

for (const gdPipeline of ['GD_MOCKUP', 'GD_NON_MOCKUP'] as const) {
  console.log(`Checking ${gdPipeline}...`);

  // 2a. From UNASSIGNED: cannot jump to IN_PROGRESS, SUBMITTED, REVISION, or APPROVED
  const unassignedToInProg = validateStageTransition(gdPipeline, 'DESIGN_UNASSIGNED', 'DESIGN_IN_PROGRESS', { hasPic: false });
  assert.strictEqual(unassignedToInProg.allowed, false, '2a-1. Cannot jump from UNASSIGNED to IN_PROGRESS');

  const unassignedToSub = validateStageTransition(gdPipeline, 'DESIGN_UNASSIGNED', 'DESIGN_SUBMITTED', { hasPic: false });
  assert.strictEqual(unassignedToSub.allowed, false, '2a-2. Cannot jump from UNASSIGNED to SUBMITTED');

  const unassignedToApp = validateStageTransition(gdPipeline, 'DESIGN_UNASSIGNED', 'DESIGN_APPROVED', { hasPic: false });
  assert.strictEqual(unassignedToApp.allowed, false, '2a-3. Cannot jump from UNASSIGNED to APPROVED');

  // Can move to ASSIGNED
  const unassignedToAssigned = validateStageTransition(gdPipeline, 'DESIGN_UNASSIGNED', 'DESIGN_ASSIGNED', { userRole: 'TEAM_LEAD' });
  assert.strictEqual(unassignedToAssigned.allowed, true, '2a-4. UNASSIGNED to ASSIGNED is allowed');

  // 2b. From ASSIGNED: cannot jump to SUBMITTED, REVISION, or APPROVED
  const assignedToSub = validateStageTransition(gdPipeline, 'DESIGN_ASSIGNED', 'DESIGN_SUBMITTED', { hasPic: true });
  assert.strictEqual(assignedToSub.allowed, false, '2b-1. Cannot jump from ASSIGNED to SUBMITTED');

  const assignedToApp = validateStageTransition(gdPipeline, 'DESIGN_ASSIGNED', 'DESIGN_APPROVED', { hasPic: true });
  assert.strictEqual(assignedToApp.allowed, false, '2b-2. Cannot jump from ASSIGNED to APPROVED');

  // Can start work to IN_PROGRESS
  const assignedToInProg = validateStageTransition(gdPipeline, 'DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', { hasPic: true });
  assert.strictEqual(assignedToInProg.allowed, true, '2b-3. ASSIGNED to IN_PROGRESS is allowed');

  // 2c. From IN_PROGRESS: can move to SUBMITTED (via modal), cannot jump to APPROVED or REVISION
  const inProgToSub = validateStageTransition(gdPipeline, 'DESIGN_IN_PROGRESS', 'DESIGN_SUBMITTED', { hasPic: true });
  assert.strictEqual(inProgToSub.allowed, true, '2c-1. IN_PROGRESS to SUBMITTED is allowed');

  const inProgToApp = validateStageTransition(gdPipeline, 'DESIGN_IN_PROGRESS', 'DESIGN_APPROVED', { hasPic: true });
  assert.strictEqual(inProgToApp.allowed, false, '2c-2. IN_PROGRESS cannot jump directly to APPROVED');

  const inProgToRev = validateStageTransition(gdPipeline, 'DESIGN_IN_PROGRESS', 'DESIGN_REVISION', { hasPic: true });
  assert.strictEqual(inProgToRev.allowed, false, '2c-3. IN_PROGRESS cannot jump directly to REVISION');

  // 2d. From SUBMITTED: can move to APPROVED or REVISION
  const subToApp = validateStageTransition(gdPipeline, 'DESIGN_SUBMITTED', 'DESIGN_APPROVED', { hasPic: true });
  assert.strictEqual(subToApp.allowed, true, '2d-1. SUBMITTED to APPROVED is allowed');

  const subToRev = validateStageTransition(gdPipeline, 'DESIGN_SUBMITTED', 'DESIGN_REVISION', { hasPic: true });
  assert.strictEqual(subToRev.allowed, true, '2d-2. SUBMITTED to REVISION is allowed');

  // 2e. From REVISION: can re-submit to SUBMITTED, cannot jump directly to APPROVED
  const revToSub = validateStageTransition(gdPipeline, 'DESIGN_REVISION', 'DESIGN_SUBMITTED', { hasPic: true });
  assert.strictEqual(revToSub.allowed, true, '2e-1. REVISION to SUBMITTED is allowed');

  const revToApp = validateStageTransition(gdPipeline, 'DESIGN_REVISION', 'DESIGN_APPROVED', { hasPic: true });
  assert.strictEqual(revToApp.allowed, false, '2e-2. REVISION cannot jump directly to APPROVED');
}

console.log('[PASS] GD Mockup and GD Non-Mockup validation checks passed 100%');


// -------------------------------------------------------------------
// 3. MOTION PIPELINE SEQUENTIAL STAGES ENFORCEMENT
// -------------------------------------------------------------------
console.log('\n--- 3. Testing Motion Pipeline Stage Transitions ---');

// 3a. From QUEUED: cannot jump to SUBMITTED, REVISION, APPROVED, or COMPLETED
const motQueuedToSub = validateStageTransition('MOTION', 'QUEUED', 'SUBMITTED', { hasPic: false });
assert.strictEqual(motQueuedToSub.allowed, false, '3a-1. Cannot jump from QUEUED to SUBMITTED');

const motQueuedToApp = validateStageTransition('MOTION', 'QUEUED', 'APPROVED', { hasPic: false });
assert.strictEqual(motQueuedToApp.allowed, false, '3a-2. Cannot jump from QUEUED to APPROVED');

const motQueuedToRev = validateStageTransition('MOTION', 'QUEUED', 'REVISION', { hasPic: false });
assert.strictEqual(motQueuedToRev.allowed, false, '3a-3. Cannot jump from QUEUED to REVISION');

const motQueuedToComp = validateStageTransition('MOTION', 'QUEUED', 'COMPLETED', { hasPic: false });
assert.strictEqual(motQueuedToComp.allowed, false, '3a-4. Cannot jump from QUEUED to COMPLETED');

// QUEUED to IN_PROGRESS requires assigned PIC
const motQueuedNoPic = validateStageTransition('MOTION', 'QUEUED', 'IN_PROGRESS', { hasPic: false });
assert.strictEqual(motQueuedNoPic.allowed, false, '3a-5. QUEUED to IN_PROGRESS without PIC is blocked');

const motQueuedWithPic = validateStageTransition('MOTION', 'QUEUED', 'IN_PROGRESS', { hasPic: true });
assert.strictEqual(motQueuedWithPic.allowed, true, '3a-6. QUEUED to IN_PROGRESS with PIC is allowed');

// 3b. From IN_PROGRESS: can move to SUBMITTED, cannot jump to APPROVED, REVISION, or COMPLETED
const motInProgToSub = validateStageTransition('MOTION', 'IN_PROGRESS', 'SUBMITTED', { hasPic: true });
assert.strictEqual(motInProgToSub.allowed, true, '3b-1. IN_PROGRESS to SUBMITTED is allowed');

const motInProgToApp = validateStageTransition('MOTION', 'IN_PROGRESS', 'APPROVED', { hasPic: true });
assert.strictEqual(motInProgToApp.allowed, false, '3b-2. IN_PROGRESS cannot jump directly to APPROVED');

const motInProgToRev = validateStageTransition('MOTION', 'IN_PROGRESS', 'REVISION', { hasPic: true });
assert.strictEqual(motInProgToRev.allowed, false, '3b-3. IN_PROGRESS cannot jump directly to REVISION');

const motInProgToComp = validateStageTransition('MOTION', 'IN_PROGRESS', 'COMPLETED', { hasPic: true });
assert.strictEqual(motInProgToComp.allowed, false, '3b-4. IN_PROGRESS cannot jump directly to COMPLETED');

// 3c. From SUBMITTED: can move to APPROVED or REVISION, cannot jump to COMPLETED
const motSubToApp = validateStageTransition('MOTION', 'SUBMITTED', 'APPROVED', { hasPic: true });
assert.strictEqual(motSubToApp.allowed, true, '3c-1. SUBMITTED to APPROVED is allowed');

const motSubToRev = validateStageTransition('MOTION', 'SUBMITTED', 'REVISION', { hasPic: true });
assert.strictEqual(motSubToRev.allowed, true, '3c-2. SUBMITTED to REVISION is allowed');

const motSubToComp = validateStageTransition('MOTION', 'SUBMITTED', 'COMPLETED', { hasPic: true });
assert.strictEqual(motSubToComp.allowed, false, '3c-3. SUBMITTED cannot jump directly to COMPLETED');

// 3d. From REVISION: can re-submit to SUBMITTED, cannot jump directly to APPROVED or COMPLETED
const motRevToSub = validateStageTransition('MOTION', 'REVISION', 'SUBMITTED', { hasPic: true });
assert.strictEqual(motRevToSub.allowed, true, '3d-1. REVISION to SUBMITTED is allowed');

const motRevToApp = validateStageTransition('MOTION', 'REVISION', 'APPROVED', { hasPic: true });
assert.strictEqual(motRevToApp.allowed, false, '3d-2. REVISION cannot jump directly to APPROVED');

const motRevToComp = validateStageTransition('MOTION', 'REVISION', 'COMPLETED', { hasPic: true });
assert.strictEqual(motRevToComp.allowed, false, '3d-3. REVISION cannot jump directly to COMPLETED');

// 3e. From APPROVED: can move to COMPLETED (handover)
const motAppToComp = validateStageTransition('MOTION', 'APPROVED', 'COMPLETED', { hasPic: true });
assert.strictEqual(motAppToComp.allowed, true, '3e-1. APPROVED to COMPLETED is allowed');

console.log('[PASS] Motion Pipeline validation checks passed 100%');


// -------------------------------------------------------------------
// 4. END-TO-END WORKFLOW SIMULATION & CANCEL SAFETY
// -------------------------------------------------------------------
console.log('\n--- 4. Testing End-to-End Workflow with Modal Incomplete Safety ---');

// 4a. Strategic Task: creation -> start -> submit -> revise -> resubmit -> approve
const stratTask = createTask({
  client_id: 1,
  campaign_name: 'BAU',
  content_type_id: 1,
  task_source: 'ORCA',
  requires_strategic_concept: true,
  pipeline_type: 'STRATEGIC',
  strat_pic_id: stratUser.id,
  req_qty: 1,
  req_date: '2026-10-20',
  due_date: '2026-10-27',
  notes: 'Sequential strategic brief'
}, requesterUser.id);

assert.strictEqual(stratTask.status_strat, 'PENDING');

// Unassigned check simulated on validateStageTransition
assert.strictEqual(validateStageTransition('STRATEGIC', 'PENDING', 'IN_PROGRESS', { hasPic: false }).allowed, false);

// Task has PIC assigned
assert.strictEqual(stratTask.strat_pic_id, stratUser.id);

// Start
updateStratStatus(stratTask.id, 'IN_PROGRESS', stratUser.id);
const taskInProgress = getTaskWithRelations(stratTask.id)!;
assert.strictEqual(taskInProgress.status_strat, 'IN_PROGRESS');

// Attempting to approve while IN_PROGRESS is blocked
assert.strictEqual(validateStageTransition('STRATEGIC', taskInProgress.status_strat, 'APPROVED').allowed, false);

// Submit concept deck (simulating SubmitStratModal)
submitStrategicConcept(stratTask.id, {
  strat_concept_name: 'Key Visual Concept Deck V1',
  strat_concept_link: 'https://docs.google.com/presentation/d/strat-deck-1'
}, stratUser.id);

const taskSubmitted = getTaskWithRelations(stratTask.id)!;
assert.strictEqual(taskSubmitted.status_strat, 'REVIEW');
assert.strictEqual(taskSubmitted.strat_concept_link, 'https://docs.google.com/presentation/d/strat-deck-1');

// Request revision
requestRevision(stratTask.id, {
  stage: 'STRATEGIC',
  reason_category: 'BRIEF_MISMATCH',
  notes: 'Tolong pertegas call-to-action pada slide 3.'
}, requesterUser.id);

const taskRevised = getTaskWithRelations(stratTask.id)!;
assert.strictEqual(taskRevised.status_strat, 'REVISION');

// Attempting to approve while in REVISION is blocked
assert.strictEqual(validateStageTransition('STRATEGIC', taskRevised.status_strat, 'APPROVED').allowed, false);

// Re-submit revised deck (simulating SubmitStratModal for revision)
submitStrategicConcept(stratTask.id, {
  strat_concept_name: 'Key Visual Concept Deck V2 (Revised)',
  strat_concept_link: 'https://docs.google.com/presentation/d/strat-deck-2'
}, stratUser.id);

const taskResubmitted = getTaskWithRelations(stratTask.id)!;
assert.strictEqual(taskResubmitted.status_strat, 'REVIEW');

// Now approval is permitted
assert.strictEqual(validateStageTransition('STRATEGIC', taskResubmitted.status_strat, 'APPROVED').allowed, true);
updateStratStatus(stratTask.id, 'APPROVED', leadUser.id);

const taskApproved = getTaskWithRelations(stratTask.id)!;
assert.strictEqual(taskApproved.status_strat, 'APPROVED');
console.log('[PASS] 4a. Strategic sequential flow verified completely');


// 4b. GD Mockup Task: unassigned -> assigned -> in_progress -> submit -> approve
const gdTask = createTask({
  client_id: 1,
  campaign_name: 'PAYDAY',
  content_type_id: 1,
  task_source: 'ORCA',
  pipeline_type: 'GD_MOCKUP',
  is_mockup: true,
  req_qty: 1,
  req_date: '2026-10-21',
  due_date: '2026-10-28',
  notes: 'Sequential GD brief'
}, requesterUser.id);

assert.strictEqual(gdTask.status_design, 'DESIGN_UNASSIGNED');

// Assign modal simulated
assignTask(gdTask.id, { design_pic_id: designerUser.id, design_difficulty: 'MEDIUM' }, leadUser.id);
updateTaskStatus(gdTask.id, 'DESIGN_ASSIGNED', leadUser.id);
const gdAssigned = getTaskWithRelations(gdTask.id)!;
assert.strictEqual(gdAssigned.status_design, 'DESIGN_ASSIGNED');

// Start work
updateTaskStatus(gdTask.id, 'DESIGN_IN_PROGRESS', designerUser.id);
const gdInProg = getTaskWithRelations(gdTask.id)!;
assert.strictEqual(gdInProg.status_design, 'DESIGN_IN_PROGRESS');

// Submit output modal simulated
submitTask(gdTask.id, {
  output_qty: 1,
  final_asset_name: 'Payday_Banner_V1',
  final_asset_link: 'https://drive.google.com/banner-1'
}, designerUser.id);

const gdSubmitted = getTaskWithRelations(gdTask.id)!;
assert.strictEqual(gdSubmitted.status_design, 'DESIGN_SUBMITTED');

// Approve
assert.strictEqual(validateStageTransition('GD_MOCKUP', gdSubmitted.status_design, 'DESIGN_APPROVED').allowed, true);
updateTaskStatus(gdTask.id, 'DESIGN_APPROVED', leadUser.id);

const gdApproved = getTaskWithRelations(gdTask.id)!;
assert.strictEqual(gdApproved.status_design, 'DESIGN_APPROVED');
console.log('[PASS] 4b. GD Mockup sequential flow verified completely');


// 4c. Motion Task: queued -> assign & in_progress -> submit render -> approve -> complete
const motionTask = createStandaloneMotionTask({
  client_id: 1,
  campaign_name: 'BAU',
  content_type_id: 1,
  motion_difficulty: 'LVL_2_MEDIUM',
  due_date: '2026-10-31',
  notes: 'Sequential Motion task'
}, adminUser.id);

assert.strictEqual(motionTask.status_motion, 'QUEUED');

// Cannot jump to SUBMITTED or APPROVED
assert.strictEqual(validateStageTransition('MOTION', motionTask.status_motion, 'SUBMITTED').allowed, false);
assert.strictEqual(validateStageTransition('MOTION', motionTask.status_motion, 'APPROVED').allowed, false);

// Assign & start
assignMotionPic(motionTask.id, motionUser.id, leadUser.id);
updateMotionStatus(motionTask.id, 'IN_PROGRESS', motionUser.id);

const motInProg = getMotionTasks().find(m => m.id === motionTask.id)!;
assert.strictEqual(motInProg.status_motion, 'IN_PROGRESS');

// Submit render modal simulated
submitMotionTask(motionTask.id, 'https://drive.google.com/render-v1', 'Final render 1080p', motionUser.id);

const motSubmitted = getMotionTasks().find(m => m.id === motionTask.id)!;
assert.strictEqual(motSubmitted.status_motion, 'SUBMITTED');

// Approve
assert.strictEqual(validateStageTransition('MOTION', motSubmitted.status_motion, 'APPROVED').allowed, true);
updateMotionStatus(motionTask.id, 'APPROVED', leadUser.id);

const motApproved = getMotionTasks().find(m => m.id === motionTask.id)!;
assert.strictEqual(motApproved.status_motion, 'APPROVED');

// Handover to complete
assert.strictEqual(validateStageTransition('MOTION', motApproved.status_motion, 'COMPLETED').allowed, true);
updateMotionStatus(motionTask.id, 'COMPLETED', leadUser.id);

const motCompleted = getMotionTasks().find(m => m.id === motionTask.id)!;
assert.strictEqual(motCompleted.status_motion, 'COMPLETED');
console.log('[PASS] 4c. Motion sequential flow verified completely');

console.log('\n========================================================================');
console.log('ALL SEQUENTIAL PIPELINE STAGE & MODAL TESTS PASSED (100%)');
console.log('========================================================================\n');
