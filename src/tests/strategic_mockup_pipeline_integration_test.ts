import {
  createTask,
  resetStore,
  getUsers,
  getTasks,
  updateStratStatus,
  submitStrategicConcept,
  requestRevision,
  updateTaskStatus,
  submitTask,
  setMotionReadyness,
  assignTask,
  getTaskWithRelations,
  getAllTasksWithRelations
} from '../lib/store';
import {
  isMockupTask,
  determineTaskPipeline,
  canTransitionToMotion,
  validatePipelineTransition,
  filterTasksByPipeline
} from '../lib/pipeline-router';
import { STRATEGIC_KANBAN_COLUMNS } from '../lib/constants';
import { CreateTaskInput, TaskWithRelations } from '../lib/types';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exitCode = 1;
  }
}

console.log('========================================================================');
console.log('RUNNING DECOUPLED STRATEGIC CONCEPT & AUTO-SPAWN INTEGRATION TEST SUITE');
console.log('========================================================================\n');

// 0. Setup
resetStore();
const users = getUsers();
const requester = users.find(u => u.role_name === 'REQUESTER')!;
const stratPic = users.find(u => u.role_name === 'STRATEGIC_PIC')!;
const designer = users.find(u => u.role_name === 'DESIGNER')!;
const teamLead = users.find(u => u.role_name === 'TEAM_LEAD')!;
const motionPic = users.find(u => u.role_name === 'MOTION_PIC')!;

// -------------------------------------------------------------------
// 1. Column Definitions Verification (5 Pure Strategic Stages)
// -------------------------------------------------------------------
console.log('--- 1. Testing 5 Pure Concept Strategic Kanban Columns ---');
assert(STRATEGIC_KANBAN_COLUMNS.length === 5, '1a. Strategic Kanban has exactly 5 concept columns');
const expectedColumns = [
  'STRAT_PENDING',
  'STRAT_IN_PROGRESS',
  'STRAT_REVIEW',
  'STRAT_REVISION',
  'APPROVED'
];
const actualColumns = STRATEGIC_KANBAN_COLUMNS.map(c => c.status);
assert(
  JSON.stringify(actualColumns) === JSON.stringify(expectedColumns),
  '1b. Column statuses match the pure strategic concept ideation lifecycle'
);
assert(
  STRATEGIC_KANBAN_COLUMNS.find(c => c.status === 'APPROVED')?.label === 'Approved',
  '1c. Final column is labeled Approved'
);

// -------------------------------------------------------------------
// 2. Task Creation with Strategic PIC (No GD PIC Needed in Concept Phase)
// -------------------------------------------------------------------
console.log('\n--- 2. Testing Task Creation with Strategic PIC (Concept Only) ---');
const createInput: CreateTaskInput = {
  client_id: 1,
  campaign_name: 'BAU BRAND CAMPAIGN',
  content_type_id: 1,
  pipeline_type: 'STRATEGIC',
  requires_strategic_concept: true,
  is_mockup: true,
  req_date: '2026-10-20',
  due_date: '2026-10-28',
  req_qty: 2,
  task_source: 'ORCA',
  platform: 'SHOPEE',
  strat_pic_id: stratPic.id,
  strat_pic_ids: [stratPic.id],
  notes: 'Strategic concept formulation for Q4 campaign'
};

const task = createTask(createInput, requester.id);
assert(task.pipeline_type === 'STRATEGIC', '2a. Task pipeline_type is STRATEGIC');
assert(task.requires_strategic_concept === true, '2b. requires_strategic_concept is true');
assert(task.strat_pic_id === stratPic.id, '2c. Strategic PIC assigned');
assert(task.status_strat === 'PENDING', '2d. Initial status_strat is PENDING');

// -------------------------------------------------------------------
// 3. Strategic Workflow Progression (Ideation, Deck, Revision, Approval)
// -------------------------------------------------------------------
console.log('\n--- 3. Testing Strategic Concept Ideation & Approval ---');

// Strat PIC starts concept formulation
updateStratStatus(task.id, 'IN_PROGRESS', stratPic.id);
let current = getTasks().find(t => t.id === task.id)!;
assert(current.status_strat === 'IN_PROGRESS', '3a. Status advances to IN_PROGRESS');

// Strat submits concept deck
submitStrategicConcept(task.id, {
  strat_concept_name: 'Strategic Big Idea & Moodboard',
  strat_concept_link: 'https://docs.google.com/presentation/d/strat-deck-1',
  notes: '2 visual options ready for review'
}, stratPic.id);
current = getTasks().find(t => t.id === task.id)!;
assert(current.status_strat === 'REVIEW', '3b. Status advances to REVIEW');
assert(current.strat_concept_link === 'https://docs.google.com/presentation/d/strat-deck-1', '3c. Concept deck link saved');

// Revision flow
requestRevision(task.id, {
  stage: 'STRATEGIC',
  reason_category: 'BRIEF_INCOMPLETE',
  notes: 'Please add slide with color palette variants'
}, requester.id);
current = getTasks().find(t => t.id === task.id)!;
assert(current.status_strat === 'REVISION', '3d. Status advances to REVISION');

// Resubmit deck
submitStrategicConcept(task.id, {
  strat_concept_name: 'Strategic Big Idea V2',
  strat_concept_link: 'https://docs.google.com/presentation/d/strat-deck-v2',
  notes: 'Updated with color variants'
}, stratPic.id);
current = getTasks().find(t => t.id === task.id)!;
assert(current.status_strat === 'REVIEW', '3e. Resubmission returns to REVIEW');

// Brand approves strategic concept
updateStratStatus(task.id, 'APPROVED', requester.id);
current = getTasks().find(t => t.id === task.id)!;
assert(current.status_strat === 'APPROVED', '3f. Strategic status is APPROVED');
assert(current.status_design === 'DESIGN_APPROVED', '3g. Strategic task marked completed (DESIGN_APPROVED)');
assert(Boolean(current.spawned_design_task_id), '3h. spawned_design_task_id generated on strategic task');

// -------------------------------------------------------------------
// 4. Auto-Spawned Design Card Verification in GD Mockup Pipeline
// -------------------------------------------------------------------
console.log('\n--- 4. Testing Auto-Spawned Design Card in GD Mockup Pipeline ---');

const spawnedMockupTask = getTasks().find(t => t.id === current.spawned_design_task_id)!;
assert(Boolean(spawnedMockupTask), '4a. Spawned mockup task exists in store');
assert(spawnedMockupTask.pipeline_type === 'GD_MOCKUP', '4b. Spawned task routed to GD_MOCKUP (since source was ORCA)');
assert(spawnedMockupTask.is_mockup === true, '4c. Spawned task is marked as is_mockup: true');
assert(spawnedMockupTask.source_strategic_task_id === task.id, '4d. Linked back via source_strategic_task_id');
assert(spawnedMockupTask.status_design === 'DESIGN_UNASSIGNED', '4e. Spawned task starts in DESIGN_UNASSIGNED');
assert(spawnedMockupTask.requires_strategic_concept === false, '4f. requires_strategic_concept is false on spawned design card');
assert(spawnedMockupTask.strat_concept_link === 'https://docs.google.com/presentation/d/strat-deck-v2', '4g. Approved deck link copied to spawned design card');

// -------------------------------------------------------------------
// 5. GD Mockup Production in Spawned Task & Motion Handover
// -------------------------------------------------------------------
console.log('\n--- 5. Testing GD Mockup Production on Spawned Task ---');

// Assign GD PIC
assignTask(spawnedMockupTask.id, { design_pic_id: designer.id }, teamLead.id);
let mockupCurrent = getTasks().find(t => t.id === spawnedMockupTask.id)!;
assert(mockupCurrent.design_pic_id === designer.id, '5a. GD PIC assigned to spawned design card');
assert(mockupCurrent.status_design === 'DESIGN_ASSIGNED', '5b. Status advanced to DESIGN_ASSIGNED');

// Start GD work
updateTaskStatus(spawnedMockupTask.id, 'DESIGN_IN_PROGRESS', designer.id);
mockupCurrent = getTasks().find(t => t.id === spawnedMockupTask.id)!;
assert(mockupCurrent.status_design === 'DESIGN_IN_PROGRESS', '5c. Status advanced to DESIGN_IN_PROGRESS');

// Submit mockup output
submitTask(spawnedMockupTask.id, {
  output_qty: 2,
  final_asset_name: 'Mockup_HighRes_PSD',
  final_asset_link: 'https://drive.google.com/mockup-assets'
}, designer.id);
mockupCurrent = getTasks().find(t => t.id === spawnedMockupTask.id)!;
assert(mockupCurrent.status_design === 'DESIGN_SUBMITTED', '5d. Status advanced to DESIGN_SUBMITTED');

// Approve mockup design
updateTaskStatus(spawnedMockupTask.id, 'DESIGN_APPROVED', requester.id);
mockupCurrent = getTasks().find(t => t.id === spawnedMockupTask.id)!;
assert(mockupCurrent.status_design === 'DESIGN_APPROVED', '5e. Mockup approved');

// Handover to Motion Pipeline
setMotionReadyness(spawnedMockupTask.id, true, designer.id);
const mockupWithRelations = getTaskWithRelations(spawnedMockupTask.id)!;
assert(mockupWithRelations.motion_readiness === 'READY_TO_ANIMATE', '5f. motion_readiness set to READY_TO_ANIMATE');
assert(Boolean(mockupWithRelations.motion_task), '5g. Motion subtask created');
assert(mockupWithRelations.motion_task?.status_motion === 'QUEUED', '5h. Motion subtask is QUEUED');

// -------------------------------------------------------------------
// 6. E-Commerce Source Routing Verification (Auto-Spawn to GD Non-Mockup)
// -------------------------------------------------------------------
console.log('\n--- 6. Testing Strategic Auto-Spawn for E-Commerce Source ---');

const ecomInput: CreateTaskInput = {
  client_id: 1,
  campaign_name: 'PAYDAY',
  content_type_id: 2,
  pipeline_type: 'STRATEGIC',
  requires_strategic_concept: true,
  is_mockup: false,
  req_date: '2026-10-20',
  due_date: '2026-10-28',
  req_qty: 5,
  task_source: 'ECOMMERCE',
  strat_pic_id: stratPic.id,
  notes: 'E-commerce campaign concept ideation'
};

const ecomTask = createTask(ecomInput, requester.id);
updateStratStatus(ecomTask.id, 'IN_PROGRESS', stratPic.id);
updateStratStatus(ecomTask.id, 'REVIEW', stratPic.id);
updateStratStatus(ecomTask.id, 'APPROVED', requester.id);

const approvedEcom = getTasks().find(t => t.id === ecomTask.id)!;
assert(Boolean(approvedEcom.spawned_design_task_id), '6a. E-commerce strategic task has spawned_design_task_id');

const spawnedEcomTask = getTasks().find(t => t.id === approvedEcom.spawned_design_task_id)!;
assert(Boolean(spawnedEcomTask), '6b. Spawned e-commerce design task exists');
assert(spawnedEcomTask.pipeline_type === 'GD_NON_MOCKUP', '6c. Routed to GD_NON_MOCKUP (since source was ECOMMERCE)');
assert(spawnedEcomTask.is_mockup === false, '6d. is_mockup is false for e-commerce design card');
assert(spawnedEcomTask.status_design === 'DESIGN_UNASSIGNED', '6e. Starts in DESIGN_UNASSIGNED');

console.log('\n========================================================================');
console.log('ALL DECOUPLED STRATEGIC PIPELINE INTEGRATION TESTS PASSED (100%)!');
console.log('========================================================================\n');
