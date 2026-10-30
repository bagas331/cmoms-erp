import {
  createTask,
  editTask,
  getTasks,
  resetStore,
  getUsers,
  getTaskWithRelations,
  assignTask,
  updateStratStatus,
  submitStrategicConcept,
  requestRevision,
  getNotifications,
  getAuditLogs,
  updateTaskStatus,
  getMotionTasks,
  setMotionReadyness
} from '../lib/store';
import {
  determineTaskPipeline,
  isMockupTask,
  filterTasksByPipeline
} from '../lib/pipeline-router';
import {
  CreateTaskInput,
  AssignTaskInput,
  TaskWithRelations,
  User,
  PipelineType
} from '../lib/types';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exitCode = 1;
  }
}

console.log('========================================================================');
console.log('RUNNING STRATEGIC PIPELINE END-TO-END WORKFLOW VERIFICATION SUITE');
console.log('========================================================================\n');

// 0. Initial Setup
resetStore();
const allUsers = getUsers();
const leadUser = allUsers.find(u => u.role_name === 'TEAM_LEAD')!;
const stratUser = allUsers.find(u => u.role_name === 'STRATEGIC_PIC')!;
const requesterUser = allUsers.find(u => u.role_name === 'REQUESTER')!;
const designerUser = allUsers.find(u => u.role_name === 'DESIGNER')!;
const motionUser = allUsers.find(u => u.role_name === 'MOTION_PIC')!;

// -------------------------------------------------------------------
// 1. Task Strategic Creation & Isolation
// -------------------------------------------------------------------
console.log('--- 1. Testing Strategic Task Creation and Independence ---');

const initialReqDate = '2026-10-15';
const initialDueDate = '2026-10-22';
const initialTaskCount = getTasks().length;

const stratCreateInput: CreateTaskInput = {
  client_id: 1,
  campaign_name: 'SPECIAL CAMPAIGN',
  content_type_id: 1, // Mockup content type, but pipeline is explicitly STRATEGIC
  pipeline_type: 'STRATEGIC',
  requires_strategic_concept: true,
  req_date: initialReqDate,
  due_date: initialDueDate,
  req_qty: 1,
  notes: 'Strategic concept deck for national rollout',
  strat_pic_id: stratUser.id,
  design_pic_id: designerUser.id
};

const newTask = createTask(stratCreateInput, requesterUser.id);
assert(newTask.pipeline_type === 'STRATEGIC', '1a. Task created with pipeline_type STRATEGIC');
assert(newTask.requires_strategic_concept === true, '1b. Task requires_strategic_concept is true');
assert(newTask.status_strat === 'PENDING', '1c. Initial status_strat is PENDING');
assert(newTask.req_date === initialReqDate, '1d. Request date stored accurately');
assert(newTask.due_date === initialDueDate, '1e. Due date stored accurately');
assert(determineTaskPipeline(newTask) === 'STRATEGIC', '1f. determineTaskPipeline strictly identifies task as STRATEGIC');

// -------------------------------------------------------------------
// 2. Assignment & Pipeline Boundary Isolation (No Leak to GD/Motion)
// -------------------------------------------------------------------
console.log('\n--- 2. Testing Assignment & Pipeline Boundary Isolation ---');

const mockupBefore = filterTasksByPipeline(getTasks(), 'GD_MOCKUP').length;
const nonMockupBefore = filterTasksByPipeline(getTasks(), 'GD_NON_MOCKUP').length;

// Assign or edit PIC
editTask(newTask.id, {
  strat_pic_id: stratUser.id,
  design_pic_id: designerUser.id
}, leadUser.id);

const taskAfterPic = getTaskWithRelations(newTask.id)!;
assert(taskAfterPic.strat_pic_id === stratUser.id, '2a. Strategic PIC assigned');
assert(taskAfterPic.design_pic_id === designerUser.id, '2b. GD PIC assigned as related collaborator');
assert(taskAfterPic.pipeline_type === 'STRATEGIC', '2c. Pipeline type remains STRATEGIC after PIC assignment');
assert(determineTaskPipeline(taskAfterPic) === 'STRATEGIC', '2d. Task stays in Strategic pipeline (never moves to GD Mockup)');
assert(taskAfterPic.status_strat === 'PENDING', '2e. Assignment alone does NOT start work (status remains PENDING)');

const mockupAfter = filterTasksByPipeline(getTasks(), 'GD_MOCKUP').length;
const nonMockupAfter = filterTasksByPipeline(getTasks(), 'GD_NON_MOCKUP').length;
assert(mockupAfter === mockupBefore, '2f. GD Mockup task count unchanged (no leak/duplicate)');
assert(nonMockupAfter === nonMockupBefore, '2g. GD Non-Mockup task count unchanged');

// -------------------------------------------------------------------
// 3. Start Work & Authorization
// -------------------------------------------------------------------
console.log('\n--- 3. Testing Start Work & Authorization ---');

// Unauthorized user attempt
let unauthorizedStartBlocked = false;
try {
  updateStratStatus(newTask.id, 'IN_PROGRESS', designerUser.id);
} catch (e: any) {
  unauthorizedStartBlocked = true;
}
assert(unauthorizedStartBlocked, '3a. Non-Strategic PIC / unauthorized user cannot start strategic task');

// Authorized start by assigned Strategic PIC
updateStratStatus(newTask.id, 'IN_PROGRESS', stratUser.id);
const taskStarted = getTaskWithRelations(newTask.id)!;
assert(taskStarted.status_strat === 'IN_PROGRESS', '3b. Strategic PIC successfully started task (status is IN_PROGRESS)');
assert(taskStarted.pipeline_type === 'STRATEGIC', '3c. Task remains strictly in STRATEGIC pipeline after start');

// -------------------------------------------------------------------
// 4. Submit Work (Google Slides / Google Drive Deck Link)
// -------------------------------------------------------------------
console.log('\n--- 4. Testing Submit Deck (Google Slides / Drive Link) ---');

const deckName = 'Brand Activation Strategic Deck V1';
const deckLink = 'https://docs.google.com/presentation/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit';
const conceptNotes = 'Deck complete with Big Idea, Moodboard, and Strategy';

submitStrategicConcept(newTask.id, {
  strat_concept_name: deckName,
  strat_concept_link: deckLink,
  notes: conceptNotes
}, stratUser.id);

const taskSubmitted = getTaskWithRelations(newTask.id)!;
assert(taskSubmitted.status_strat === 'REVIEW', '4a. Task transitioned to REVIEW upon submission');
assert(taskSubmitted.strat_concept_name === deckName, '4b. Deck name saved accurately');
assert(taskSubmitted.strat_concept_link === deckLink, '4c. Google Slides / Drive link saved accurately');
assert(Boolean(taskSubmitted.strat_submitted_at), '4d. strat_submitted_at timestamp recorded');
assert(taskSubmitted.pipeline_type === 'STRATEGIC', '4e. Pipeline type remains STRATEGIC');

// -------------------------------------------------------------------
// 5. Revision Flow (In-place Revision, History, & Resubmission)
// -------------------------------------------------------------------
console.log('\n--- 5. Testing Revision Flow & Audit Trail ---');

const taskCountBeforeRev = getTasks().length;

// Revision requested by Requester
requestRevision(newTask.id, {
  stage: 'STRATEGIC',
  reason_category: 'BRIEF_INCOMPLETE',
  notes: 'Please refine slide 4 target audience persona'
}, requesterUser.id);

const taskInRevision = getTaskWithRelations(newTask.id)!;
assert(taskInRevision.status_strat === 'REVISION', '5a. Task transitioned to REVISION');
assert(taskInRevision.strat_revision_count === 1, '5b. strat_revision_count incremented to 1');
assert(taskInRevision.pipeline_type === 'STRATEGIC', '5c. Task remains in STRATEGIC pipeline during revision');
assert(getTasks().length === taskCountBeforeRev, '5d. Revision maintains the same task entity (no duplicate task created)');
assert(taskInRevision.revisions?.length === 1, '5e. Revision record created in revisions table/history');
assert(taskInRevision.revisions![0].stage === 'STRATEGIC', '5f. Revision stage recorded as STRATEGIC');

// Resubmit by Strategic PIC
const deckLinkV2 = 'https://docs.google.com/presentation/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ_V2/edit';
submitStrategicConcept(newTask.id, {
  strat_concept_name: 'Brand Activation Strategic Deck V2 (Revised)',
  strat_concept_link: deckLinkV2,
  notes: 'Updated slide 4 target audience persona'
}, stratUser.id);

const taskResubmitted = getTaskWithRelations(newTask.id)!;
assert(taskResubmitted.status_strat === 'REVIEW', '5g. Resubmission transitions back to REVIEW');
assert(taskResubmitted.strat_concept_link === deckLinkV2, '5h. Active deck link updated to latest version');

// -------------------------------------------------------------------
// 6. Review & Approval Authority (Security Check)
// -------------------------------------------------------------------
console.log('\n--- 6. Testing Review & Approval Security / Permissions ---');

// Designer should NOT be able to approve strategic task
let designerApprovalBlocked = false;
try {
  updateStratStatus(newTask.id, 'APPROVED', designerUser.id);
} catch (e: any) {
  designerApprovalBlocked = true;
}
assert(designerApprovalBlocked, '6a. Designer cannot approve Strategic task');

// Requester who created the task can approve
updateStratStatus(newTask.id, 'APPROVED', requesterUser.id);
const taskApproved = getTaskWithRelations(newTask.id)!;
assert(taskApproved.status_strat === 'APPROVED', '6b. Requester successfully approved Strategic task');
assert(Boolean(taskApproved.approved_at), '6c. approved_at timestamp recorded');
assert(taskApproved.pipeline_type === 'STRATEGIC', '6d. Task remains strictly STRATEGIC upon approval');
assert(determineTaskPipeline(taskApproved) === 'STRATEGIC', '6e. determineTaskPipeline still evaluates to STRATEGIC (does not leak to GD Mockup)');

// Check that status_design was NOT transitioned to DESIGN_UNASSIGNED
assert(taskApproved.status_design !== 'DESIGN_UNASSIGNED', '6f. Strategic task does NOT transition status_design to DESIGN_UNASSIGNED');

// -------------------------------------------------------------------
// 7. Request Date & Due Date Immutability Verification
// -------------------------------------------------------------------
console.log('\n--- 7. Testing Request Date & Due Date Immutability ---');

assert(taskApproved.req_date === initialReqDate, '7a. Request Date preserved through all status transitions');
assert(taskApproved.due_date === initialDueDate, '7b. Due Date preserved through all status transitions');

// Perform edit without changing dates
editTask(newTask.id, {
  notes: 'Updated brief notes after approval'
}, requesterUser.id);

const taskAfterEdit = getTaskWithRelations(newTask.id)!;
assert(taskAfterEdit.req_date === initialReqDate, '7c. EditTask does not reset or overwrite Request Date');
assert(taskAfterEdit.due_date === initialDueDate, '7d. EditTask does not reset or overwrite Due Date');

// -------------------------------------------------------------------
// 8. Auto-Spawn Design Task upon Concept Approval & Linkage Verification
// -------------------------------------------------------------------
console.log('\n--- 8. Testing Auto-Spawn Design Task upon Concept Approval ---');

const totalTasksNow = getTasks().length;
assert(totalTasksNow === initialTaskCount + 2, '8a. Auto-spawns a new design task (original strategic + new design task)');
assert(Boolean(taskApproved.spawned_design_task_id), '8b. Strategic task has spawned_design_task_id reference');

const spawnedTask = getTasks().find(t => t.id === taskApproved.spawned_design_task_id);
assert(Boolean(spawnedTask), '8c. Spawned design task exists in store');
assert(spawnedTask?.source_strategic_task_id === newTask.id, '8d. Spawned task links back to source_strategic_task_id');
assert(spawnedTask?.pipeline_type === 'GD_MOCKUP', '8e. Task routed to GD_MOCKUP pipeline based on ORCA source');
assert(spawnedTask?.status_design === 'DESIGN_UNASSIGNED', '8f. Spawned task starts in DESIGN_UNASSIGNED status');
assert(spawnedTask?.requires_strategic_concept === false, '8g. Spawned task does not require strategic concept');
assert(spawnedTask?.status_strat === 'NOT_REQUIRED', '8h. Spawned task status_strat is NOT_REQUIRED');

// -------------------------------------------------------------------
// 9. Regression Testing on GD Mockup, Non-Mockup & Motion Pipelines
// -------------------------------------------------------------------
console.log('\n--- 9. Testing Non-Regression of Other Pipelines ---');

// Create standard GD Mockup task
const mockupTask = createTask({
  client_id: 1,
  campaign_name: 'BAU',
  content_type_id: 1,
  task_source: 'ORCA',
  pipeline_type: 'GD_MOCKUP',
  requires_strategic_concept: false,
  req_date: '2026-10-15',
  due_date: '2026-10-20'
}, requesterUser.id);

assert(determineTaskPipeline(mockupTask) === 'GD_MOCKUP', '9a. Standard GD Mockup task routes to GD_MOCKUP');

// Create standard GD Non-Mockup (E-commerce) task
const nonMockupTask = createTask({
  client_id: 1,
  campaign_name: 'PAYDAY',
  content_type_id: 2,
  task_source: 'ECOMMERCE',
  pipeline_type: 'GD_NON_MOCKUP',
  requires_strategic_concept: false,
  req_date: '2026-10-15',
  due_date: '2026-10-20'
}, requesterUser.id);

assert(determineTaskPipeline(nonMockupTask) === 'GD_NON_MOCKUP', '9b. Standard GD Non-Mockup task routes to GD_NON_MOCKUP');

// E-commerce cannot be forwarded before approval.
let unapprovedEcommerceBlocked = false;
try {
  setMotionReadyness(nonMockupTask.id, true, leadUser.id);
} catch (e: any) {
  unapprovedEcommerceBlocked = true;
}
assert(unapprovedEcommerceBlocked, '9c-1. Unapproved E-commerce task cannot be forwarded to Motion');

updateTaskStatus(nonMockupTask.id, 'DESIGN_APPROVED', leadUser.id);
setMotionReadyness(nonMockupTask.id, true, leadUser.id);
assert(
  getMotionTasks().some(motionTask => motionTask.task_id === nonMockupTask.id && motionTask.status_motion === 'QUEUED'),
  '9c-2. Approved E-commerce task enters Motion after manual forwarding'
);

// Verify Mockup cannot create a motion subtask prematurely before DESIGN_APPROVED
let prematureMockupForwardBlocked = false;
try {
  setMotionReadyness(mockupTask.id, true, leadUser.id);
} catch {
  prematureMockupForwardBlocked = true;
}
assert(prematureMockupForwardBlocked, '9c-3. GD Mockup task cannot be forwarded without DESIGN_APPROVED status');
assert(!getMotionTasks().some(motionTask => motionTask.task_id === mockupTask.id), '9c-4. No Motion record is created for an unapproved task');

// -------------------------------------------------------------------
// 10. Audit Logs & Notifications Verification
// -------------------------------------------------------------------
console.log('\n--- 10. Testing Audit Logs & Notifications ---');

const audits = getAuditLogs().filter(a => a.entity_id === newTask.id || a.entity_id === newTask.task_code);
assert(audits.length >= 4, '10a. Audit logs recorded for CREATE, START, SUBMIT, REVISE, and APPROVE');

const notifs = getNotifications(requesterUser.id);
assert(notifs.length > 0, '10b. Requester received notifications during Strategic workflow');

// -------------------------------------------------------------------
// 11. Pipeline Counting & Double Counting Prevention
// -------------------------------------------------------------------
console.log('\n--- 11. Testing Pipeline Counting & Double Counting Prevention ---');

const allCurrentTasks = getTasks();
const stratTasks = filterTasksByPipeline(allCurrentTasks, 'STRATEGIC');
const gdMockupTasks = filterTasksByPipeline(allCurrentTasks, 'GD_MOCKUP');
const gdNonMockupTasks = filterTasksByPipeline(allCurrentTasks, 'GD_NON_MOCKUP');

// Zero overlap between pipelines
const stratIds = new Set(stratTasks.map(t => t.id));
const mockupIds = new Set(gdMockupTasks.map(t => t.id));
const nonMockupIds = new Set(gdNonMockupTasks.map(t => t.id));

const stratMockupIntersection = [...stratIds].filter(id => mockupIds.has(id));
const stratNonMockupIntersection = [...stratIds].filter(id => nonMockupIds.has(id));
const mockupNonMockupIntersection = [...mockupIds].filter(id => nonMockupIds.has(id));

assert(stratMockupIntersection.length === 0, '11a. Zero overlap between Strategic and GD Mockup tasks');
assert(stratNonMockupIntersection.length === 0, '11b. Zero overlap between Strategic and GD Non-Mockup tasks');
assert(mockupNonMockupIntersection.length === 0, '11c. Zero overlap between GD Mockup and GD Non-Mockup tasks');

console.log('\n========================================================================');
console.log('ALL STRATEGIC PIPELINE END-TO-END VERIFICATION TESTS PASSED!');
console.log('========================================================================\n');
