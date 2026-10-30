import assert from 'assert';
import {
  createTask,
  updateStratStatus,
  updateTaskStatus,
  submitTask,
  getTaskWithRelations,
  getUsers,
  getTasks,
  getMotionTasks,
  resetStore,
  forwardTaskToMotion,
  handoverStrategicTaskToGD
} from '../lib/store';
import { filterTasksByPipeline, extractAttachmentsFromNotes } from '../lib/pipeline-router';
import { TaskAttachment } from '../lib/types';

console.log('[TEST] Starting All Pipelines Approved Forward & Disappear Verification Suite...');

resetStore();
const users = getUsers();
const admin = users.find(u => u.role_name === 'ADMIN')!;
const requester = users.find(u => u.role_name === 'REQUESTER')!;
const stratPic = users.find(u => u.role_name === 'STRATEGIC_PIC')!;
const designer = users.find(u => u.role_name === 'DESIGNER')!;

const testAttachments: TaskAttachment[] = [
  {
    id: 'att-img-1',
    name: 'brief-sketch.png',
    size: 102400,
    type: 'image/png',
    url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    section: 'brief',
    uploaded_at: new Date().toISOString()
  },
  {
    id: 'att-img-2',
    name: 'reference-moodboard.jpg',
    size: 204800,
    type: 'image/jpeg',
    url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    section: 'brief',
    uploaded_at: new Date().toISOString()
  }
];

// ============================================================================
// 1. STRATEGIC PIPELINE -> GD MOCKUP / ECOMMERCE HANDOVER
// ============================================================================
console.log('\n--- 1. Testing STRATEGIC Pipeline: Disappears from Approved after Handover to GD ---');

const stratTask = createTask({
  campaign_name: 'SPECIAL CAMPAIGN',
  client_id: 'client-1',
  pipeline_type: 'STRATEGIC',
  requires_strategic_concept: true,
  status_strat: 'IN_REVIEW',
  task_source: 'REGULAR',
  strat_pic_ids: [stratPic.id],
  notes: 'Strategic Concept Brief with images',
  attachments: testAttachments
}, requester.id);

console.log('1a. Created strategic task:', stratTask.task_code);

let stratWithRel = getTaskWithRelations(stratTask.id)!;
let stratBoardTasks = filterTasksByPipeline([stratWithRel], 'STRATEGIC');
assert.strictEqual(stratBoardTasks.length, 1, 'Strategic task in progress/review must be visible in Strategic board');

// Approve Strategic Concept (spawns and links design task)
updateStratStatus(stratTask.id, 'APPROVED', admin.id);
stratWithRel = getTaskWithRelations(stratTask.id)!;
assert.strictEqual(stratWithRel.status_strat, 'APPROVED', 'Strategic task should be APPROVED');

// Assign GD PIC and finalize handover parameters to GD Mockup
const handoverRes = handoverStrategicTaskToGD(stratTask.id, {
  target_pipeline: 'GD_MOCKUP',
  design_pic_id: designer.id,
  design_difficulty: 'HIGH',
  due_date: '2026-11-05',
  handover_notes: 'Transferred from concept to mockup design'
}, admin.id);

assert.strictEqual(handoverRes.success, true, 'Handover to GD should succeed');
assert.ok(handoverRes.spawnedTask, 'Spawned design task should exist');
const spawnedMockup = handoverRes.spawnedTask!;
console.log('1b. Spawned Mockup task code:', spawnedMockup.task_code);

// Reload parent strategic task
stratWithRel = getTaskWithRelations(stratTask.id)!;
assert.ok(stratWithRel.spawned_design_task_id, 'Strategic task should have spawned_design_task_id set');

// CRITICAL ASSERTION: The strategic task MUST HIDE from the Strategic active board / Approved column!
stratBoardTasks = filterTasksByPipeline([stratWithRel], 'STRATEGIC');
assert.strictEqual(
  stratBoardTasks.length,
  0,
  'CRITICAL: Once handed over to GD, Strategic request MUST DISAPPEAR from Strategic Kanban/Approved column'
);
console.log('[PASS] Strategic request cleanly disappeared from Strategic Approved column after handover');

// The spawned task MUST appear in the destination GD_MOCKUP board!
const spawnedWithRel = getTaskWithRelations(spawnedMockup.id)!;
const gdMockupBoardTasks = filterTasksByPipeline([spawnedWithRel], 'GD_MOCKUP');
assert.strictEqual(
  gdMockupBoardTasks.length,
  1,
  'CRITICAL: Spawned request MUST appear in the destination GD_MOCKUP pipeline'
);
console.log('[PASS] Spawned request cleanly appeared in destination GD_MOCKUP pipeline');

// Verify attachments were cleanly transferred to spawned task
assert.strictEqual(spawnedWithRel.attachments?.length, testAttachments.length, 'Attachments should transfer to spawned task');
assert.strictEqual(spawnedWithRel.attachments?.[0].id, testAttachments[0].id, 'Attachment 1 ID preserved');
console.log('[PASS] Attachments and images preserved in spawned task');

// ============================================================================
// 2. GD MOCKUP PIPELINE -> MOTION PIPELINE FORWARD
// ============================================================================
console.log('\n--- 2. Testing GD MOCKUP Pipeline: Disappears from Approved after Forward to Motion ---');

// Designer submits mockup output
submitTask(spawnedMockup.id, {
  output_qty: 2,
  final_asset_name: 'Mockup_Asset_Final_V1',
  final_asset_link: 'https://drive.google.com/test-mockup'
}, designer.id);

// Admin approves GD Mockup
updateTaskStatus(spawnedMockup.id, 'DESIGN_APPROVED', admin.id);
let mockupWithRel = getTaskWithRelations(spawnedMockup.id)!;
assert.strictEqual(mockupWithRel.status_design, 'DESIGN_APPROVED');

// Verify it is visible in GD_MOCKUP Approve column BEFORE forwarding
let mockupActiveBoard = filterTasksByPipeline([mockupWithRel], 'GD_MOCKUP');
assert.strictEqual(mockupActiveBoard.length, 1, 'Approved Mockup must be visible in GD_MOCKUP Approve column before forward');

// Forward to Motion
forwardTaskToMotion(spawnedMockup.id, admin.id);

// Reload mockup task
mockupWithRel = getTaskWithRelations(spawnedMockup.id)!;
assert.strictEqual(mockupWithRel.motion_readiness, 'READY_TO_ANIMATE');
assert.ok(mockupWithRel.motion_task, 'Motion subtask should exist');

// CRITICAL ASSERTION: The mockup task MUST HIDE from GD_MOCKUP active board / Approve column!
mockupActiveBoard = filterTasksByPipeline([mockupWithRel], 'GD_MOCKUP');
assert.strictEqual(
  mockupActiveBoard.length,
  0,
  'CRITICAL: Once forwarded to Motion, Mockup request MUST DISAPPEAR from GD_MOCKUP Approve column'
);
console.log('[PASS] Mockup request cleanly disappeared from GD_MOCKUP Approve column after forward to Motion');

// The task MUST appear in the destination MOTION pipeline!
const motionBoardTasks = filterTasksByPipeline([mockupWithRel], 'MOTION');
assert.strictEqual(
  motionBoardTasks.length,
  1,
  'CRITICAL: Forwarded request MUST appear in destination MOTION pipeline'
);
console.log('[PASS] Request cleanly appeared in destination MOTION pipeline');

// ============================================================================
// 3. GD NON-MOCKUP (ECOMMERCE) PIPELINE -> MOTION PIPELINE FORWARD
// ============================================================================
console.log('\n--- 3. Testing GD NON-MOCKUP (Ecommerce) Pipeline: Disappears from Approved after Forward ---');

const ecomTask = createTask({
  campaign_name: 'PAYDAY',
  client_id: 'client-1',
  pipeline_type: 'GD_NON_MOCKUP',
  is_mockup: false,
  content_type_id: 2, // Banner Marketplace
  task_source: 'ECOMMERCE',
  design_pic_id: designer.id,
  notes: 'E-commerce PDP Banners with attachments',
  attachments: testAttachments
}, requester.id);

console.log('3a. Created E-commerce task:', ecomTask.task_code);

// Designer submits ecommerce output
submitTask(ecomTask.id, {
  output_qty: 3,
  final_asset_name: 'Shopee_1111_Banners_V1',
  final_asset_link: 'https://drive.google.com/test-ecom'
}, designer.id);

// Admin approves E-commerce design
updateTaskStatus(ecomTask.id, 'DESIGN_APPROVED', admin.id);
let ecomWithRel = getTaskWithRelations(ecomTask.id)!;
assert.strictEqual(ecomWithRel.status_design, 'DESIGN_APPROVED');

// Verify it is visible in GD_NON_MOCKUP Approve column BEFORE forwarding
let ecomActiveBoard = filterTasksByPipeline([ecomWithRel], 'GD_NON_MOCKUP');
assert.strictEqual(ecomActiveBoard.length, 1, 'Approved Ecommerce must be visible in GD_NON_MOCKUP Approve column before forward');

// Forward to Motion
forwardTaskToMotion(ecomTask.id, designer.id);

// Reload ecommerce task
ecomWithRel = getTaskWithRelations(ecomTask.id)!;
assert.strictEqual(ecomWithRel.motion_readiness, 'READY_TO_ANIMATE');
assert.ok(ecomWithRel.motion_task, 'Motion subtask should exist for ecommerce task');

// CRITICAL ASSERTION: The ecommerce task MUST HIDE from GD_NON_MOCKUP active board / Approve column!
ecomActiveBoard = filterTasksByPipeline([ecomWithRel], 'GD_NON_MOCKUP');
assert.strictEqual(
  ecomActiveBoard.length,
  0,
  'CRITICAL: Once forwarded to Motion, Ecommerce request MUST DISAPPEAR from GD_NON_MOCKUP Approve column'
);
console.log('[PASS] Ecommerce request cleanly disappeared from GD_NON_MOCKUP Approve column after forward to Motion');

// The ecommerce task MUST appear in destination MOTION pipeline!
const ecomMotionTasks = filterTasksByPipeline([ecomWithRel], 'MOTION');
assert.strictEqual(
  ecomMotionTasks.length,
  1,
  'CRITICAL: Forwarded ecommerce request MUST appear in destination MOTION pipeline'
);
console.log('[PASS] Ecommerce request cleanly appeared in destination MOTION pipeline');

console.log('\n========================================================================');
console.log('[SUCCESS] ALL PIPELINES APPROVED FORWARD & DISAPPEAR VERIFICATION TESTS PASSED 100%!');
console.log('========================================================================\n');
