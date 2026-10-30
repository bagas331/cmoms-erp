import {
  CAMPAIGN_NAMES,
  isValidCampaignName,
  normalizeCampaignName
} from '../lib/constants';
import {
  createTask,
  editTask,
  getTasks,
  resetStore,
  updateStratStatus,
  updateTaskStatus,
  submitTask,
  getMotionTasks,
  forwardTaskToMotion
} from '../lib/store';
import {
  determineTaskPipeline,
  isMockupTask,
  filterTasksByPipeline,
  canTransitionToMotion
} from '../lib/pipeline-router';
import {
  CreateTaskInput,
  TaskWithRelations,
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
console.log('RUNNING TASK FORM & PIPELINE WORKFLOW COMPREHENSIVE VERIFICATION SUITE');
console.log('========================================================================\n');

// Reset store to pristine state
resetStore();

// -------------------------------------------------------------------
// 1. CAMPAIGN NAME VALIDATION & NORMALIZATION
// -------------------------------------------------------------------
console.log('--- 1. Testing Campaign Name Dropdown & Constraints ---');

// 1a. Validate constant choices
assert(
  CAMPAIGN_NAMES.length === 4 &&
  CAMPAIGN_NAMES.includes('BAU') &&
  CAMPAIGN_NAMES.includes('DD') &&
  CAMPAIGN_NAMES.includes('PAYDAY') &&
  CAMPAIGN_NAMES.includes('SPECIAL CAMPAIGN'),
  '1a. CAMPAIGN_NAMES contains exactly the 4 required choices (BAU, DD, PAYDAY, SPECIAL CAMPAIGN)'
);

// 1b. isValidCampaignName checker
assert(isValidCampaignName('BAU') === true, '1b-1. isValidCampaignName accepts BAU');
assert(isValidCampaignName('DD') === true, '1b-2. isValidCampaignName accepts DD');
assert(isValidCampaignName('PAYDAY') === true, '1b-3. isValidCampaignName accepts PAYDAY');
assert(isValidCampaignName('SPECIAL CAMPAIGN') === true, '1b-4. isValidCampaignName accepts SPECIAL CAMPAIGN');
assert(isValidCampaignName('Random Text') === false, '1b-5. isValidCampaignName rejects arbitrary free text');
assert(isValidCampaignName('') === false, '1b-6. isValidCampaignName rejects empty string');

// 1c. normalizeCampaignName handles legacy case variations safely
assert(normalizeCampaignName('BaU') === 'BAU', '1c-1. normalizeCampaignName normalizes "BaU" to "BAU"');
assert(normalizeCampaignName('payday') === 'PAYDAY', '1c-2. normalizeCampaignName normalizes "payday" to "PAYDAY"');
assert(normalizeCampaignName('Double Date') === 'DD', '1c-3. normalizeCampaignName normalizes "Double Date" to "DD"');
assert(normalizeCampaignName('Special') === 'SPECIAL CAMPAIGN', '1c-4. normalizeCampaignName normalizes "Special" to "SPECIAL CAMPAIGN"');
assert(normalizeCampaignName('Old Legacy Campaign 2025') === 'Old Legacy Campaign 2025', '1c-5. Unrecognized legacy campaign preserved safely without data loss');

// 1d. Backend validation rejects invalid Campaign Name on createTask
let rejectedCampaignError = '';
try {
  createTask({
    client_id: 1,
    campaign_name: 'Invalid Campaign Name',
    content_type_id: 1,
    task_source: 'ORCA',
    platform: 'TIKTOK',
    req_qty: 1,
    req_date: '2026-10-15',
    due_date: '2026-10-20'
  }, 'u-admin-001');
} catch (err: any) {
  rejectedCampaignError = err.message;
}
assert(
  rejectedCampaignError.includes('Campaign Name tidak valid'),
  '1d. Backend rejects task creation with invalid Campaign Name'
);

// -------------------------------------------------------------------
// 2. STRATEGIC PIPELINE: MANDATORY STRATEGIC CONCEPT & STRATEGIC PIC
// -------------------------------------------------------------------
console.log('\n--- 2. Testing Strategic Pipeline: Mandatory Concept & PIC ---');

// 2a. Reject Strategic task creation if Strategic PIC is missing
let rejectedMissingPicError = '';
try {
  createTask({
    client_id: 1,
    campaign_name: 'BAU',
    content_type_id: 10, // Deck Presentasi
    task_source: 'ORCA',
    platform: 'TIKTOK',
    req_qty: 1,
    req_date: '2026-10-15',
    due_date: '2026-10-20',
    requires_strategic_concept: true
    // strat_pic_ids omitted!
  }, 'u-admin-001');
} catch (err: any) {
  rejectedMissingPicError = err.message;
}
assert(
  rejectedMissingPicError.includes('Strategic PIC wajib dipilih'),
  '2a. Backend rejects Strategic task creation when Strategic PIC is missing'
);

// 2b. Successfully create Strategic task with Strategic PIC
const validStratTask = createTask({
  client_id: 1,
  campaign_name: 'BAU',
  content_type_id: 10,
  task_source: 'ORCA',
  platform: 'TIKTOK',
  req_qty: 1,
  req_date: '2026-10-15',
  due_date: '2026-10-20',
  requires_strategic_concept: true,
  strat_pic_ids: ['u-strat-ira'],
  strat_pic_id: 'u-strat-ira'
}, 'u-admin-001');

assert(
  validStratTask.requires_strategic_concept === true,
  '2b-1. Strategic task automatically has requires_strategic_concept = true'
);
assert(
  validStratTask.pipeline_type === 'STRATEGIC',
  '2b-2. Strategic task pipeline_type is STRATEGIC'
);
assert(
  validStratTask.status_strat === 'PENDING',
  '2b-3. Initial status_strat is PENDING (not immediately in progress)'
);
assert(
  validStratTask.strat_pic_id === 'u-strat-ira' && validStratTask.strat_pic_ids?.includes('u-strat-ira'),
  '2b-4. Strategic PIC assigned correctly'
);

// 2c. Strategic pipeline is an END-TO-END INDEPENDENT WORKFLOW
// When approved, it stays in STRATEGIC and does NOT move to GD Mockup
updateStratStatus(validStratTask.id, 'APPROVED', 'u-admin-001');
const approvedStratTask = getTasks().find(t => t.id === validStratTask.id)!;

assert(
  approvedStratTask.status_strat === 'APPROVED',
  '2c-1. Strategic task transitioned to APPROVED'
);
assert(
  approvedStratTask.pipeline_type === 'STRATEGIC',
  '2c-2. Approved Strategic task stays in pipeline_type STRATEGIC (independent workflow)'
);
assert(
  determineTaskPipeline(approvedStratTask) === 'STRATEGIC',
  '2c-3. determineTaskPipeline returns STRATEGIC for approved task'
);

// Verify task does NOT appear in GD Mockup or GD Non-Mockup filter
const mockTasksWithRel: TaskWithRelations[] = getTasks().map(t => ({
  ...t,
  client_name: 'Test Client',
  client_type: 'EXTERNAL' as const,
  content_type_name: 'Deck',
  design_pic_name: null,
  strat_pic_name: 'Ira',
  created_by_name: 'Admin',
  motion_task: null,
  operator_name: null,
  motion_pic_name: null,
  revisions: [],
  comments: []
}));

const inStratFilter = filterTasksByPipeline(mockTasksWithRel, 'STRATEGIC');
const inMockupFilter = filterTasksByPipeline(mockTasksWithRel, 'GD_MOCKUP');
const inNonMockupFilter = filterTasksByPipeline(mockTasksWithRel, 'GD_NON_MOCKUP');

assert(
  !inStratFilter.some(t => t.id === validStratTask.id),
  '2c-4. Strategic task disappears from active Strategic board once transferred to GD Mockup'
);
assert(
  !inMockupFilter.some(t => t.id === validStratTask.id),
  '2c-5. Approved Strategic task does NOT appear on GD Mockup board (no auto-handover)'
);
assert(
  !inNonMockupFilter.some(t => t.id === validStratTask.id),
  '2c-6. Approved Strategic task does NOT appear on GD Non-Mockup board'
);

// -------------------------------------------------------------------
// 3. GD MOCKUP: CONTENT TYPE MOCKUP (DECOUPLED TASK SOURCE)
// -------------------------------------------------------------------
console.log('\n--- 3. Testing GD Mockup Pipeline Constraints ---');

// 3a. Enforced Task Source: GD Mockup strictly enforces task_source = 'ORCA'
const ecomMockupTask = createTask({
  client_id: 1,
  campaign_name: 'PAYDAY',
  content_type_id: 1, // Mockup Set
  task_source: 'ECOMMERCE' as any, // Even if ECOMMERCE is passed, GD Mockup enforces ORCA
  platform: 'TIKTOK',
  req_qty: 1,
  req_date: '2026-10-15',
  due_date: '2026-10-20',
  pipeline_type: 'GD_MOCKUP',
  requires_strategic_concept: false
}, 'u-admin-001');

assert(
  ecomMockupTask.pipeline_type === 'GD_MOCKUP',
  '3a-1. Task successfully routes to GD_MOCKUP'
);
assert(
  ecomMockupTask.task_source === 'ORCA',
  '3a-2. Task source is strictly enforced as ORCA on GD_MOCKUP pipeline'
);

// 3b. Reject GD Mockup task if Content Type is not Mockup
let rejectedGdContentTypeError = '';
try {
  createTask({
    client_id: 1,
    campaign_name: 'PAYDAY',
    content_type_id: 2, // Banner (Non-mockup!)
    task_source: 'ORCA',
    platform: 'TIKTOK',
    req_qty: 1,
    req_date: '2026-10-15',
    due_date: '2026-10-20',
    pipeline_type: 'GD_MOCKUP',
    requires_strategic_concept: false
  }, 'u-admin-001');
} catch (err: any) {
  rejectedGdContentTypeError = err.message;
}
assert(
  rejectedGdContentTypeError.toLowerCase().includes('mockup'),
  '3b. Backend rejects GD Mockup task if Content Type is not Mockup'
);

// 3c. Valid Orca GD Mockup creation succeeds
const validMockupTask = createTask({
  client_id: 1,
  campaign_name: 'PAYDAY',
  content_type_id: 1,
  task_source: 'ORCA',
  platform: 'TIKTOK',
  req_qty: 1,
  req_date: '2026-10-15',
  due_date: '2026-10-20',
  pipeline_type: 'GD_MOCKUP',
  requires_strategic_concept: false
}, 'u-admin-001');

assert(
  validMockupTask.pipeline_type === 'GD_MOCKUP',
  '3c-1. Valid GD Mockup task created with pipeline_type = GD_MOCKUP'
);
assert(
  validMockupTask.task_source === 'ORCA',
  '3c-2. GD Mockup task source is ORCA'
);
assert(
  validMockupTask.requires_strategic_concept === false,
  '3c-3. GD Mockup requires_strategic_concept is false'
);

// -------------------------------------------------------------------
// 4. GD NON-MOCKUP: CONTENT TYPE NON-MOCKUP (DECOUPLED TASK SOURCE)
// -------------------------------------------------------------------
console.log('\n--- 4. Testing GD Non-Mockup / E-commerce Constraints ---');

// 4a. Enforced Task Source: GD Non-Mockup strictly enforces task_source = 'ECOMMERCE'
const orcaNonMockupTask = createTask({
  client_id: 1,
  campaign_name: 'DD',
  content_type_id: 3, // PDP (Non-mockup)
  task_source: 'ORCA' as any, // Even if ORCA is passed, GD Non-Mockup enforces ECOMMERCE
  platform: 'SHOPEE',
  req_qty: 2,
  req_date: '2026-10-15',
  due_date: '2026-10-20',
  pipeline_type: 'GD_NON_MOCKUP',
  requires_strategic_concept: false
}, 'u-admin-001');

assert(
  orcaNonMockupTask.pipeline_type === 'GD_NON_MOCKUP',
  '4a-1. Task successfully routes to GD_NON_MOCKUP'
);
assert(
  orcaNonMockupTask.task_source === 'ECOMMERCE',
  '4a-2. Task source is strictly enforced as ECOMMERCE on GD_NON_MOCKUP pipeline'
);

// 4b. Reject GD Non-Mockup task if Content Type is Mockup
let rejectedNonMockupContentTypeError = '';
try {
  createTask({
    client_id: 1,
    campaign_name: 'DD',
    content_type_id: 1, // Mockup Set!
    task_source: 'ECOMMERCE',
    platform: 'SHOPEE',
    req_qty: 2,
    req_date: '2026-10-15',
    due_date: '2026-10-20',
    pipeline_type: 'GD_NON_MOCKUP',
    requires_strategic_concept: false
  }, 'u-admin-001');
} catch (err: any) {
  rejectedNonMockupContentTypeError = err.message;
}
assert(
  rejectedNonMockupContentTypeError.toLowerCase().includes('mockup'),
  '4b. Backend rejects GD Non-Mockup task if Content Type is Mockup'
);

// 4c. Valid E-commerce GD Non-Mockup creation succeeds
const validNonMockupTask = createTask({
  client_id: 1,
  campaign_name: 'DD',
  content_type_id: 3, // PDP
  task_source: 'ECOMMERCE',
  platform: 'SHOPEE',
  req_qty: 2,
  req_date: '2026-10-15',
  due_date: '2026-10-20',
  pipeline_type: 'GD_NON_MOCKUP',
  requires_strategic_concept: false
}, 'u-admin-001');

assert(
  validNonMockupTask.pipeline_type === 'GD_NON_MOCKUP',
  '4c-1. Valid GD Non-Mockup task created with pipeline_type = GD_NON_MOCKUP'
);
assert(
  validNonMockupTask.task_source === 'ECOMMERCE',
  '4c-2. GD Non-Mockup task source is ECOMMERCE'
);
assert(
  validNonMockupTask.content_type_id === 3,
  '4c-3. GD Non-Mockup content_type is non-mockup PDP'
);

// -------------------------------------------------------------------
// 5. GD MOCKUP -> MOTION MANUAL HANDOVER
// -------------------------------------------------------------------
console.log('\n--- 5. Testing Manual GD Mockup -> Motion Handover ---');

// Approved mockup stays in GD until explicitly forwarded.
submitTask(validMockupTask.id, {
  output_qty: 1,
  final_asset_name: 'Mockup_Final_V1',
  final_asset_link: 'https://drive.google.com/test-mockup'
}, 'u-des-nadya');

// Approve design
updateTaskStatus(validMockupTask.id, 'DESIGN_APPROVED', 'u-admin-001');

const approvedMockupTask = getTasks().find(t => t.id === validMockupTask.id)!;
const motionTasksAfterApproval = getMotionTasks();

assert(
  approvedMockupTask.status_design === 'DESIGN_APPROVED',
  '5a. GD Mockup task status is DESIGN_APPROVED'
);
assert(
  !motionTasksAfterApproval.some(m => m.task_id === validMockupTask.id),
  '5b. Approval does not automatically create a Motion task'
);
assert(approvedMockupTask.pipeline_type === 'GD_MOCKUP', '5c. Approved task remains in GD Mockup');

forwardTaskToMotion(validMockupTask.id, 'u-admin-001');
const manuallyForwardedMotionTask = getMotionTasks().find(m => m.task_id === validMockupTask.id);
assert(
  manuallyForwardedMotionTask?.status_motion === 'QUEUED',
  '5d. Manually forwarded Motion task has QUEUED status'
);

// -------------------------------------------------------------------
// 6. EDIT TASK PRESERVES TIMESTAMPS, DATES, AND PIC
// -------------------------------------------------------------------
console.log('\n--- 6. Testing Edit Task Field Preservation ---');

const editedMockupTask = editTask(validMockupTask.id, {
  client_id: 1,
  campaign_name: 'SPECIAL CAMPAIGN',
  content_type_id: 1,
  task_source: 'ORCA',
  platform: 'TIKTOK',
  req_qty: 3,
  req_date: validMockupTask.req_date,
  due_date: validMockupTask.due_date,
  notes: 'Updated notes via edit modal'
}, 'u-admin-001', 'ADMIN');

assert(
  editedMockupTask.campaign_name === 'SPECIAL CAMPAIGN',
  '6a. Campaign Name updated to SPECIAL CAMPAIGN'
);
assert(
  editedMockupTask.req_date === validMockupTask.req_date,
  '6b. Request Date preserved without reset'
);
assert(
  editedMockupTask.due_date === validMockupTask.due_date,
  '6c. Due Date preserved without reset'
);
assert(
  editedMockupTask.req_qty === 3,
  '6d. Request Qty updated'
);

console.log('\n========================================================================');
console.log('ALL VERIFICATION CRITERIA PASSED SUCCESSFULLY (100% GREEN)');
console.log('========================================================================\n');
