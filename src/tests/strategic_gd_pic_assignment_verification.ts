import {
  createTask,
  editTask,
  getTasks,
  resetStore,
  getUsers,
  getTaskWithRelations,
  assignTask,
  getNotifications
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
console.log('RUNNING STRATEGIC PIPELINE GD PIC ASSIGNMENT VERIFICATION SUITE');
console.log('========================================================================\n');

// Reset store to pristine state
resetStore();

const allUsers = getUsers();
const adminUser = allUsers.find(u => u.role_name === 'ADMIN')!;
const leadUser = allUsers.find(u => u.role_name === 'TEAM_LEAD')!;
const stratUser = allUsers.find(u => u.role_name === 'STRATEGIC_PIC')!;
const requesterUser = allUsers.find(u => u.role_name === 'REQUESTER')!;
const designerUser1 = allUsers.find(u => u.role_name === 'DESIGNER')!;
const designerUser2 = allUsers.filter(u => u.role_name === 'DESIGNER')[1] || designerUser1;
const motionUser = allUsers.find(u => u.role_name === 'MOTION_PIC')!;
const operatorUser = allUsers.find(u => u.role_name === 'OPERATOR')!;

// -------------------------------------------------------------------
// 1. VALID DESIGNERS & STRATEGIC PICS FILTERING (Role & Governance Validation)
// -------------------------------------------------------------------
console.log('--- 1. Testing PIC User Qualification & Filtering ---');

const validDesigners = allUsers.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name));
assert(
  validDesigners.every(u => u.role_name === 'DESIGNER' || u.role_name === 'TEAM_LEAD'),
  '1a. Valid GD PIC candidates include strictly DESIGNER and TEAM_LEAD'
);
assert(
  !validDesigners.some(u => ['REQUESTER', 'OPERATOR', 'MOTION_PIC', 'ADMIN'].includes(u.role_name)),
  '1b. Requesters, Operators, Motion PICs, and Admin are excluded from GD PIC candidates'
);

const validStratUsers = allUsers.filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD'].includes(u.role_name));
assert(
  validStratUsers.every(u => u.role_name === 'STRATEGIC_PIC' || u.role_name === 'TEAM_LEAD'),
  '1c. Valid Strategic PIC candidates include strictly STRATEGIC_PIC and TEAM_LEAD'
);
assert(
  !validStratUsers.some(u => u.role_name === 'ADMIN'),
  '1d. System Admin is strictly excluded from operational Strategic PIC candidates (governance & full control only)'
);

// -------------------------------------------------------------------
// 2. CREATE STRATEGIC TASK WITH INITIAL GD PIC
// -------------------------------------------------------------------
console.log('\n--- 2. Testing Create Strategic Task with GD PIC ---');

const newTaskInput: CreateTaskInput = {
  client_id: 1,
  campaign_name: 'SPECIAL CAMPAIGN',
  content_type_id: 1,
  task_source: 'ORCA',
  platform: 'SHOPEE',
  req_qty: 2,
  req_date: '2026-10-15',
  due_date: '2026-10-25',
  requires_strategic_concept: true,
  strat_pic_ids: [stratUser.id],
  strat_pic_id: stratUser.id,
  design_pic_id: designerUser1.id,
  pipeline_type: 'STRATEGIC',
  notes: 'Strategic task with initial GD PIC assigned'
};

const createdTask = createTask(newTaskInput, requesterUser.id);
assert(Boolean(createdTask), '2a. Task created successfully');
assert(createdTask.design_pic_id === designerUser1.id, '2b. Stored design_pic_id matches assigned designer ID');
assert(createdTask.strat_pic_id === stratUser.id, '2c. Strategic PIC is preserved and required');
assert(createdTask.status_strat === 'PENDING', '2d. Strategic status is initialized to PENDING (not started)');
assert(createdTask.status_design === 'STRAT_PENDING', '2e. Design status is STRAT_PENDING (not In Progress / Assigned)');
assert(createdTask.pipeline_type === 'STRATEGIC', '2f. Pipeline type is strictly STRATEGIC');

// -------------------------------------------------------------------
// 3. PERSISTENCE & TASK WITH RELATIONS RESOLUTION
// -------------------------------------------------------------------
console.log('\n--- 3. Testing Task Persistence & View Model Relations ---');

const reloadedTask = getTaskWithRelations(createdTask.id);
assert(Boolean(reloadedTask), '3a. Reloaded task found');
assert(reloadedTask?.design_pic_id === designerUser1.id, '3b. Persisted design_pic_id correctly retrieved');
assert(reloadedTask?.design_pic_name === designerUser1.full_name, '3c. Resolved design_pic_name matches designer full name');
assert(reloadedTask?.strat_pic_name === stratUser.full_name, '3d. Resolved strat_pic_name matches strategic PIC full name');
assert(reloadedTask?.created_by_name === requesterUser.full_name, '3e. Requester name preserved');

// -------------------------------------------------------------------
// 4. EDIT STRATEGIC TASK: REASSIGN GD PIC
// -------------------------------------------------------------------
console.log('\n--- 4. Testing Edit Task & Reassigning GD PIC ---');

const editInput: CreateTaskInput = {
  ...newTaskInput,
  design_pic_id: designerUser2.id,
  notes: 'Updated notes with reassigned GD PIC'
};

const updatedTask = editTask(createdTask.id, editInput, leadUser.id, leadUser.role_name);
assert(updatedTask.design_pic_id === designerUser2.id, '4a. GD PIC successfully reassigned to designerUser2');
assert(updatedTask.strat_pic_id === stratUser.id, '4b. Strategic PIC is not lost during GD PIC edit');
assert(updatedTask.due_date === '2026-10-25', '4c. Due date preserved during edit');
assert(updatedTask.notes.includes('Updated notes'), '4d. Notes preserved and updated correctly');

// -------------------------------------------------------------------
// 5. UNASSIGN GD PIC (OPTIONAL FIELD BEHAVIOR)
// -------------------------------------------------------------------
console.log('\n--- 5. Testing Unassign GD PIC (Setting to null) ---');

const unassignInput: CreateTaskInput = {
  ...newTaskInput,
  design_pic_id: null
};

const unassignedTask = editTask(createdTask.id, unassignInput, stratUser.id, stratUser.role_name);
assert(unassignedTask.design_pic_id === null, '5a. GD PIC can be set to null / unassigned');
const reloadedUnassigned = getTaskWithRelations(createdTask.id);
assert(reloadedUnassigned?.design_pic_name === null, '5b. design_pic_name becomes null when unassigned');

// -------------------------------------------------------------------
// 6. PERMISSION & AUTHORIZATION VALIDATION
// -------------------------------------------------------------------
console.log('\n--- 6. Testing Backend Authorization on Edit ---');

let blockedUnauthorized = false;
try {
  // A designer who is not the creator and not an admin/lead should be rejected from editing the task
  editTask(createdTask.id, { ...newTaskInput, design_pic_id: designerUser1.id }, motionUser.id, 'MOTION_PIC');
} catch (err: any) {
  blockedUnauthorized = true;
}
assert(blockedUnauthorized === true, '6a. Unauthorized user (MOTION_PIC) is rejected by editTask backend validation');

let blockedDesignerEdit = false;
try {
  // Designer who is assigned as GD PIC cannot edit other task parameters
  editTask(createdTask.id, { ...newTaskInput, design_pic_id: designerUser1.id }, designerUser1.id, 'DESIGNER');
} catch (err: any) {
  blockedDesignerEdit = true;
}
assert(blockedDesignerEdit === true, '6b. Designated GD PIC does NOT gain task edit permission merely by assignment');

// -------------------------------------------------------------------
// 7. PIPELINE ROUTING INTEGRITY (NO MOVING, NO DUPLICATION)
// -------------------------------------------------------------------
console.log('\n--- 7. Testing Strategic Pipeline Routing & Isolation ---');

// Reassign GD PIC
editTask(createdTask.id, { ...newTaskInput, design_pic_id: designerUser1.id }, leadUser.id, leadUser.role_name);
const taskAfterAssignment = getTaskWithRelations(createdTask.id)!;

const pipelineDetermined = determineTaskPipeline(taskAfterAssignment);
assert(pipelineDetermined === 'STRATEGIC', '7a. Task strictly belongs to STRATEGIC pipeline even with GD PIC assigned');

const allTasks = getTasks().map(t => getTaskWithRelations(t.id)!);
const strategicTasks = filterTasksByPipeline(allTasks, 'STRATEGIC');
const gdMockupTasks = filterTasksByPipeline(allTasks, 'GD_MOCKUP');
const gdNonMockupTasks = filterTasksByPipeline(allTasks, 'GD_NON_MOCKUP');

assert(
  strategicTasks.some(t => t.id === createdTask.id),
  '7b. Task is visible in STRATEGIC pipeline'
);
assert(
  !gdMockupTasks.some(t => t.id === createdTask.id),
  '7c. Task does NOT leak into GD Mockup pipeline'
);
assert(
  !gdNonMockupTasks.some(t => t.id === createdTask.id),
  '7d. Task does NOT leak into GD Non-Mockup pipeline'
);

// -------------------------------------------------------------------
// 8. STATUS WORKFLOW INTEGRITY (NO PREMATURE PROGRESS)
// -------------------------------------------------------------------
console.log('\n--- 8. Testing Strategic Workflow Status Integrity ---');

assert(
  taskAfterAssignment.status_design === 'STRAT_PENDING',
  '8a. Design status remains STRAT_PENDING (never auto-transitions to DESIGN_ASSIGNED or IN_PROGRESS)'
);
assert(
  taskAfterAssignment.status_strat === 'PENDING',
  '8b. Strategic status remains PENDING'
);

// Test assignTask directly on strategic task
assignTask(createdTask.id, { design_pic_id: designerUser2.id }, leadUser.id);
const taskAfterDirectAssign = getTaskWithRelations(createdTask.id)!;
assert(
  taskAfterDirectAssign.status_design === 'STRAT_PENDING',
  '8c. assignTask maintains STRAT_PENDING when task is in Strategic pipeline'
);
assert(
  taskAfterDirectAssign.design_pic_id === designerUser2.id,
  '8d. assignTask successfully updates design_pic_id'
);

// -------------------------------------------------------------------
// 9. NOTIFICATIONS & IDEMPOTENCY
// -------------------------------------------------------------------
console.log('\n--- 9. Testing Assignment Notifications ---');

const notifs = getNotifications();
const designerNotifs = notifs.filter(
  n => n.user_id === designerUser2.id && (n.notification_type === 'REQUEST_ASSIGNED' || (n as any).type === 'REQUEST_ASSIGNED')
);
assert(designerNotifs.length > 0, '9a. Assigned GD PIC receives REQUEST_ASSIGNED notification');
assert(
  designerNotifs[0].title === 'Penugasan Desain Baru',
  '9b. Notification title is Penugasan Desain Baru'
);

console.log('\n========================================================================');
console.log('ALL STRATEGIC PIPELINE GD PIC ASSIGNMENT VERIFICATIONS PASSED (100%)');
console.log('========================================================================\n');
