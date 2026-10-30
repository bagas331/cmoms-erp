import {
  isMockupTask,
  determineTaskPipeline,
  canTransitionToMotion,
  canUserManagePipeline,
  validatePipelineTransition,
  filterTasksByPipeline
} from '../lib/pipeline-router';
import {
  CreativeTask,
  TaskWithRelations,
  PipelineType,
  RoleName
} from '../lib/types';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exitCode = 1;
  }
}

console.log('======================================================');
console.log('RUNNING 4-PIPELINE ARCHITECTURE AUTOMATED VERIFICATION');
console.log('======================================================\n');

// -------------------------------------------------------------------
// 1. Pipeline Routing & Strategic Workflow
// -------------------------------------------------------------------
const stratMockupTask: CreativeTask = {
  id: 'task-strat-001',
  task_code: 'REQ-STRAT-001',
  client_id: 1,
  campaign_name: 'Summer Campaign 2026',
  content_type_id: 1, // Mockup Set
  is_mockup: true,
  task_source: 'ORCA',
  req_qty: 1,
  output_qty: 1,
  req_date: '2026-10-01',
  due_date: '2026-10-10',
  submission_date: null,
  sla_working_days: 3,
  operational_excellence: null,
  requires_strategic_concept: true,
  strat_pic_id: 'user-strat-1',
  status_strat: 'PENDING',
  strat_revision_count: 0,
  design_pic_id: null,
  design_difficulty: null,
  design_revision_count: 0,
  status_design: 'STRAT_PENDING',
  motion_readiness: 'NOT_APPLICABLE',
  operator_id: null,
  platform: 'SHOPEE',
  final_asset_name: null,
  final_asset_link: null,
  notes: '',
  created_by: 'user-req-1',
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z'
};

// Test 1: Task requiring strategic concept routes to STRATEGIC pipeline
const initialPipeline = determineTaskPipeline(stratMockupTask);
assert(initialPipeline === 'STRATEGIC', 'Test 1: Strategic task before approval enters STRATEGIC pipeline');

// Test 2: Strategic pipeline is an end-to-end independent workflow (remains STRATEGIC even when APPROVED)
const approvedStratMockupTask: CreativeTask = {
  ...stratMockupTask,
  status_strat: 'APPROVED',
  pipeline_type: 'STRATEGIC'
};
const currentPipeline = determineTaskPipeline(approvedStratMockupTask);
assert(
  currentPipeline === 'STRATEGIC' && approvedStratMockupTask.id === stratMockupTask.id,
  'Test 2: Approved strategic task remains strictly in STRATEGIC pipeline (end-to-end independent workflow)'
);

// -------------------------------------------------------------------
// 2. Standalone GD Non-Mockup / E-Commerce Isolation
// -------------------------------------------------------------------
const pdpEcommerceTask: CreativeTask = {
  id: 'task-pdp-002',
  task_code: 'REQ-PDP-002',
  client_id: 2,
  campaign_name: 'PDP Skin Care Series',
  content_type_id: 3, // PDP
  is_mockup: false,
  task_source: 'ECOMMERCE',
  req_qty: 5,
  output_qty: 5,
  req_date: '2026-10-02',
  due_date: '2026-10-07',
  submission_date: null,
  sla_working_days: 2,
  operational_excellence: null,
  requires_strategic_concept: false,
  strat_pic_id: null,
  status_strat: 'NOT_REQUIRED',
  strat_revision_count: 0,
  design_pic_id: 'user-gd-1',
  design_difficulty: 'MEDIUM',
  design_revision_count: 0,
  status_design: 'DESIGN_ASSIGNED',
  motion_readiness: 'NOT_APPLICABLE',
  operator_id: null,
  platform: 'SHOPEE',
  final_asset_name: null,
  final_asset_link: null,
  notes: '',
  created_by: 'user-req-1',
  created_at: '2026-10-02T08:00:00Z',
  updated_at: '2026-10-02T08:00:00Z'
};

const bannerRedesignTask: CreativeTask = {
  id: 'task-banner-003',
  task_code: 'REQ-BAN-003',
  client_id: 3,
  campaign_name: 'Flash Sale Redesign Banner',
  content_type_id: 2, // Banner
  is_mockup: false,
  task_source: 'ECOMMERCE',
  req_qty: 2,
  output_qty: 2,
  req_date: '2026-10-03',
  due_date: '2026-10-05',
  submission_date: null,
  sla_working_days: 2,
  operational_excellence: null,
  requires_strategic_concept: false,
  strat_pic_id: null,
  status_strat: 'NOT_REQUIRED',
  strat_revision_count: 0,
  design_pic_id: null,
  design_difficulty: null,
  design_revision_count: 0,
  status_design: 'DESIGN_UNASSIGNED',
  motion_readiness: 'NOT_APPLICABLE',
  operator_id: null,
  platform: 'TOKOPEDIA',
  final_asset_name: null,
  final_asset_link: null,
  notes: '',
  created_by: 'user-req-1',
  created_at: '2026-10-03T08:00:00Z',
  updated_at: '2026-10-03T08:00:00Z'
};

// Test 3: Standalone PDP & Redesign Banner route to GD_NON_MOCKUP
assert(
  determineTaskPipeline(pdpEcommerceTask) === 'GD_NON_MOCKUP',
  'Test 3a: E-commerce PDP task routes directly to GD_NON_MOCKUP'
);
assert(
  determineTaskPipeline(bannerRedesignTask) === 'GD_NON_MOCKUP',
  'Test 3b: Banner redesign routes directly to GD_NON_MOCKUP'
);

// Test 4: Approved E-commerce tasks can enter Motion only through explicit forwarding
const approvedNonMockupTask: CreativeTask = {
  ...pdpEcommerceTask,
  status_design: 'DESIGN_APPROVED',
  motion_readiness: 'READY_TO_ANIMATE' // Even if flag is artificially set!
};
assert(
  canTransitionToMotion(approvedNonMockupTask) === true,
  'Test 4: Approved GD E-commerce task with ready status qualifies for Motion'
);

const nonMockupTransitionCheck = validatePipelineTransition(pdpEcommerceTask, 'MOTION', 'ADMIN');
assert(
  nonMockupTransitionCheck.allowed === false,
  'Test 5: validatePipelineTransition rejects an unapproved E-commerce task'
);
assert(
  validatePipelineTransition(approvedNonMockupTask, 'MOTION', 'ADMIN').allowed,
  'Test 5b: validatePipelineTransition allows an approved E-commerce task to be forwarded'
);
assert(
  validatePipelineTransition(approvedNonMockupTask, 'MOTION', 'DESIGNER').allowed,
  'Test 5c: Assigned design role is authorized to forward an approved task'
);

// -------------------------------------------------------------------
// 3. GD Mockup to Motion Transition Rules
// -------------------------------------------------------------------
const gdMockupTask: CreativeTask = {
  id: 'task-mockup-004',
  task_code: 'REQ-MOK-004',
  client_id: 1,
  campaign_name: 'Delfi Chocolate 11.11 Mockup Set',
  content_type_id: 1,
  is_mockup: true,
  task_source: 'ORCA',
  req_qty: 3,
  output_qty: 3,
  req_date: '2026-10-04',
  due_date: '2026-10-08',
  submission_date: null,
  sla_working_days: 2,
  operational_excellence: null,
  requires_strategic_concept: false,
  strat_pic_id: null,
  status_strat: 'NOT_REQUIRED',
  strat_revision_count: 0,
  design_pic_id: 'user-gd-1',
  design_difficulty: 'HIGH',
  design_revision_count: 0,
  status_design: 'DESIGN_IN_PROGRESS',
  motion_readiness: 'WAITING_ASSET_GD',
  operator_id: null,
  platform: 'SHOPEE',
  final_asset_name: null,
  final_asset_link: null,
  notes: '',
  created_by: 'user-req-1',
  created_at: '2026-10-04T08:00:00Z',
  updated_at: '2026-10-04T08:00:00Z'
};

// Test 6: In-progress mockup cannot enter Motion yet
assert(
  canTransitionToMotion(gdMockupTask) === false,
  'Test 6: In-progress mockup cannot enter Motion'
);

// Test 7: Mockup approved but not READY_TO_ANIMATE cannot enter Motion yet
const approvedWaitingMotion = {
  ...gdMockupTask,
  status_design: 'DESIGN_APPROVED' as const,
  motion_readiness: 'WAITING_ASSET_GD' as const
};
assert(
  canTransitionToMotion(approvedWaitingMotion) === false,
  'Test 7: Approved mockup waiting for assets cannot enter Motion'
);

// Test 8: Mockup approved AND ready to animate qualifies for Motion
const fullyQualifiedMotion = {
  ...gdMockupTask,
  status_design: 'DESIGN_APPROVED' as const,
  motion_readiness: 'READY_TO_ANIMATE' as const
};
assert(
  canTransitionToMotion(fullyQualifiedMotion) === true,
  'Test 8: Approved and READY_TO_ANIMATE mockup qualifies for Motion pipeline'
);

// -------------------------------------------------------------------
// 4. Role-Based Access Control (RBAC) per Pipeline
// -------------------------------------------------------------------
assert(
  canUserManagePipeline('STRATEGIC', 'STRATEGIC_PIC') === true &&
  canUserManagePipeline('STRATEGIC', 'REQUESTER') === true &&
  canUserManagePipeline('STRATEGIC', 'DESIGNER') === false &&
  canUserManagePipeline('STRATEGIC', 'ADMIN') === true,
  'Test 9: Strategic pipeline management is accessible to STRATEGIC_PIC, REQUESTER, and Admin/Lead'
);

assert(
  canUserManagePipeline('GD_MOCKUP', 'DESIGNER') === true &&
  canUserManagePipeline('GD_MOCKUP', 'STRATEGIC_PIC') === true &&
  canUserManagePipeline('GD_MOCKUP', 'REQUESTER') === true &&
  canUserManagePipeline('GD_MOCKUP', 'MOTION_PIC') === false &&
  canUserManagePipeline('GD_MOCKUP', 'ADMIN') === true,
  'Test 10: GD Mockup pipeline management is accessible to DESIGNER, STRATEGIC_PIC, REQUESTER, and Admin/Lead'
);

assert(
  canUserManagePipeline('GD_NON_MOCKUP', 'DESIGNER') === true &&
  canUserManagePipeline('GD_NON_MOCKUP', 'STRATEGIC_PIC') === true &&
  canUserManagePipeline('GD_NON_MOCKUP', 'REQUESTER') === true &&
  canUserManagePipeline('GD_NON_MOCKUP', 'MOTION_PIC') === false &&
  canUserManagePipeline('GD_NON_MOCKUP', 'ADMIN') === true,
  'Test 11: GD Non-Mockup pipeline management is accessible to DESIGNER, STRATEGIC_PIC, REQUESTER, and Admin/Lead'
);

assert(
  canUserManagePipeline('MOTION', 'MOTION_PIC') === true &&
  canUserManagePipeline('MOTION', 'STRATEGIC_PIC') === true &&
  canUserManagePipeline('MOTION', 'REQUESTER') === true &&
  canUserManagePipeline('MOTION', 'DESIGNER') === false &&
  canUserManagePipeline('MOTION', 'ADMIN') === true,
  'Test 12: Motion pipeline management is accessible to MOTION_PIC, STRATEGIC_PIC, REQUESTER, and Admin/Lead'
);

// -------------------------------------------------------------------
// 5. Board Partitioning & Deduplication (filterTasksByPipeline)
// -------------------------------------------------------------------
const tasksWithRelations: TaskWithRelations[] = [
  {
    ...stratMockupTask,
    client_name: 'Client A',
    client_type: 'EXTERNAL',
    content_type_name: 'Mockup Set',
    design_pic_name: null,
    strat_pic_name: 'Ira Strategic',
    created_by_name: 'Requester Sarah',
    motion_task: null,
    operator_name: null,
    motion_pic_name: null,
    revisions: [],
    comments: []
  },
  {
    ...approvedStratMockupTask,
    client_name: 'Client A',
    client_type: 'EXTERNAL',
    content_type_name: 'Mockup Set',
    design_pic_name: 'Nadya Designer',
    strat_pic_name: 'Ira Strategic',
    created_by_name: 'Requester Sarah',
    motion_task: null,
    operator_name: null,
    motion_pic_name: null,
    revisions: [],
    comments: []
  },
  {
    ...pdpEcommerceTask,
    client_name: 'Client B',
    client_type: 'EXTERNAL',
    content_type_name: 'PDP E-Commerce',
    design_pic_name: 'Yusuf Designer',
    strat_pic_name: null,
    created_by_name: 'Requester Sarah',
    motion_task: null,
    operator_name: null,
    motion_pic_name: null,
    revisions: [],
    comments: []
  },
  {
    ...fullyQualifiedMotion,
    client_name: 'Client C',
    client_type: 'EXTERNAL',
    content_type_name: 'Mockup Set',
    design_pic_name: 'Nadya Designer',
    strat_pic_name: null,
    created_by_name: 'Requester Sarah',
    motion_task: {
      id: 'mot-001',
      task_id: fullyQualifiedMotion.id,
      client_id: 1,
      campaign_type: 'Promo 11.11',
      motion_type: 'ANIMATED_MOCKUP',
      motion_pic_id: 'user-motion-1',
      status_motion: 'IN_PROGRESS',
      motion_difficulty: 'MEDIUM',
      revision_count: 0,
      apply_date: '2026-10-06',
      notes: '',
      created_at: '2026-10-06T08:00:00Z',
      updated_at: '2026-10-06T08:00:00Z'
    },
    operator_name: null,
    motion_pic_name: 'Reza Motion',
    revisions: [],
    comments: []
  }
];

const stratBoard = filterTasksByPipeline(tasksWithRelations, 'STRATEGIC');
const gdMockupBoard = filterTasksByPipeline(tasksWithRelations, 'GD_MOCKUP');
const gdNonMockupBoard = filterTasksByPipeline(tasksWithRelations, 'GD_NON_MOCKUP');
const motionBoard = filterTasksByPipeline(tasksWithRelations, 'MOTION');

// Active strategic task should be in strategic board
assert(
  stratBoard.some(t => t.id === 'task-strat-001'),
  'Test 13a: Active strategic task appears in STRATEGIC board'
);
// Active strategic task must NOT appear in GD Mockup board before approval
assert(
  !gdMockupBoard.some(t => t.id === 'task-strat-001' && t.status_strat !== 'APPROVED'),
  'Test 13b: Pending strategic task does NOT leak into GD_MOCKUP board'
);

// Approved strategic task remains in STRATEGIC board and does NOT leak into GD Mockup board
assert(
  stratBoard.some(t => t.id === 'task-strat-001' && t.status_strat === 'APPROVED') &&
  !gdMockupBoard.some(t => t.id === 'task-strat-001'),
  'Test 14: Approved strategic task stays in STRATEGIC board and does not transfer to GD_MOCKUP'
);

// PDP task appears strictly in GD Non-Mockup board
assert(
  gdNonMockupBoard.some(t => t.id === 'task-pdp-002') &&
  !gdMockupBoard.some(t => t.id === 'task-pdp-002') &&
  !motionBoard.some(t => t.id === 'task-pdp-002'),
  'Test 15: PDP task appears strictly in GD_NON_MOCKUP and never in GD Mockup or Motion'
);

// Motion task appears in Motion board
assert(
  motionBoard.some(t => t.id === 'task-mockup-004'),
  'Test 16: Motion task appears in Motion board'
);

console.log('\n======================================================');
console.log('ALL 16 FOUR-PIPELINE ARCHITECTURE TESTS COMPLETED');
console.log('======================================================\n');
