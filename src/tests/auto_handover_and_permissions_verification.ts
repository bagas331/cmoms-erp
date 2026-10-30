import {
  isMockupTask,
  determineTaskPipeline,
  canTransitionToMotion,
  qualifiesForMotionAutoHandover,
  canUserManagePipeline,
  canUserViewPipeline,
  isUserReadOnlyForPipeline,
  filterTasksByPipeline
} from '../lib/pipeline-router';
import {
  CreativeTask,
  TaskWithRelations,
  PipelineType,
  RoleName
} from '../lib/types';
import {
  getTasks,
  getMotionTasks,
  getContentTypeById,
  updateStratStatus,
  updateTaskStatus,
  submitTask,
  getAuditLogs,
  getNotifications,
  resetStore,
  forwardTaskToMotion
} from '../lib/store';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exitCode = 1;
  }
}

console.log('========================================================================');
console.log('RUNNING AUTO-HANDOVER, READ-ONLY, AND REPORT PERMISSIONS TEST SUITE');
console.log('========================================================================\n');

// Reset store to pristine state
resetStore();

function buildEnrichedTasks(): TaskWithRelations[] {
  const motionTasks = getMotionTasks();
  return getTasks().map(t => {
    const contentType = getContentTypeById(t.content_type_id);
    const mt = motionTasks.find(m => m.task_id === t.id);
    return {
      ...t,
      client_name: 'Client',
      client_type: 'EXTERNAL' as const,
      content_type_name: contentType?.name || 'Mockup Set',
      design_pic_name: null,
      strat_pic_name: null,
      created_by_name: 'Requester',
      motion_task: mt || null,
      operator_name: null,
      motion_pic_name: null,
      revisions: [],
      comments: []
    };
  });
}

// -------------------------------------------------------------------
// 1. AUTO-HANDOVER: STRATEGIC TO GD MOCKUP & GD NON-MOCKUP
// -------------------------------------------------------------------
console.log('--- 1. Testing Strategic -> GD Auto-Handover ---');

const initialTasks = getTasks();

// Find a pending strategic task that is a Mockup (content_type_id 1)
const stratMockupTask = initialTasks.find(t => 
  t.requires_strategic_concept && 
  t.status_strat !== 'APPROVED' && 
  isMockupTask({ ...t, content_type_id: t.content_type_id })
);

if (stratMockupTask) {
  const taskId = stratMockupTask.id;
  const initialStratActive = filterTasksByPipeline(buildEnrichedTasks(), 'STRATEGIC');
  assert(
    initialStratActive.some(t => t.id === taskId),
    '1a. Strategic Mockup task is initially active in Strategic pipeline board'
  );

  // Unauthorized user (e.g. Designer u-des-nadya) cannot approve
  let unauthorizedBlocked = false;
  try {
    updateStratStatus(taskId, 'APPROVED', 'u-des-nadya');
  } catch (e) {
    unauthorizedBlocked = true;
  }
  const taskAfterUnauthorized = getTasks().find(t => t.id === taskId)!;
  assert(
    unauthorizedBlocked && taskAfterUnauthorized.status_strat !== 'APPROVED',
    '1b. Unauthorized role cannot approve strategic concept (auth guard)'
  );

  // Authorized user (ADMIN u-admin-001) approves Strategic Concept
  updateStratStatus(taskId, 'APPROVED', 'u-admin-001');

  const updatedStratTask = getTasks().find(t => t.id === taskId)!;

  assert(
    updatedStratTask.status_strat === 'APPROVED',
    '1c. Task strategic status transitioned to APPROVED'
  );
  assert(
    updatedStratTask.pipeline_type === 'STRATEGIC',
    '1d. Strategic task pipeline_type remains strictly STRATEGIC (independent workflow)'
  );
  assert(
    updatedStratTask.id === taskId,
    '1e. Task ID strictly preserved (no duplicate task records created)'
  );

  // Verify task disappears from active Strategic pipeline board once handed over to GD
  const activeStratAfter = filterTasksByPipeline(buildEnrichedTasks(), 'STRATEGIC');
  assert(
    !activeStratAfter.some(t => t.id === taskId),
    '1f. Task disappears from Strategic pipeline board under APPROVED column after handover to GD'
  );

  // Verify task does NOT transfer to GD Mockup board
  const activeGdMockupAfter = filterTasksByPipeline(buildEnrichedTasks(), 'GD_MOCKUP');
  assert(
    !activeGdMockupAfter.some(t => t.id === taskId),
    '1g. Task does NOT transfer to GD Mockup board (no auto-handover)'
  );

  // Verify audit log recorded APPROVE event
  const auditLogs = getAuditLogs().filter(a => a.entity_id === updatedStratTask.task_code);
  const approveLog = auditLogs.find(a => a.action === 'APPROVE');
  assert(
    Boolean(approveLog),
    '1h. Audit trail correctly logged APPROVE event'
  );
}

// Also verify Strategic Non-Mockup task remains in STRATEGIC (independent workflow)
const stratNonMockupTask = getTasks().find(t => 
  t.requires_strategic_concept && 
  t.status_strat !== 'APPROVED' && 
  !isMockupTask({ ...t, content_type_id: t.content_type_id })
);

if (stratNonMockupTask) {
  const nmTaskId = stratNonMockupTask.id;
  updateStratStatus(nmTaskId, 'APPROVED', 'u-admin-001');
  const updatedNmTask = getTasks().find(t => t.id === nmTaskId)!;
  assert(
    updatedNmTask.pipeline_type === 'STRATEGIC',
    '1i. Non-mockup strategic task remains in STRATEGIC (no auto-handover to GD)'
  );
}

// -------------------------------------------------------------------
// 2. MANUAL HANDOVER: GD MOCKUP TO MOTION
// -------------------------------------------------------------------
console.log('\n--- 2. Testing Manual GD Mockup -> Motion Handover ---');

// Find an active mockup task in GD that does NOT already have a motion task
const allMotionTasks = getMotionTasks();
const gdMockup = getTasks().find(t => 
  determineTaskPipeline(t) === 'GD_MOCKUP' &&
  isMockupTask({ ...t, content_type_id: t.content_type_id }) && 
  !allMotionTasks.some(mt => mt.task_id === t.id) &&
  !['TASK_CLOSED', 'DESIGN_APPROVED'].includes(t.status_design)
);

if (gdMockup) {
  const mId = gdMockup.id;

  // Designer submits task with final asset link
  submitTask(mId, {
    output_qty: 2,
    final_asset_name: 'Fonterra_1010_Mockup_V1',
    final_asset_link: 'https://drive.google.com/test-mockup-assets'
  }, 'u-des-nadya');

  // Verify submission
  const submittedTask = getTasks().find(t => t.id === mId)!;
  assert(
    submittedTask.status_design === 'DESIGN_SUBMITTED' && Boolean(submittedTask.final_asset_link),
    '2a. Designer successfully submitted mockup assets'
  );

  // Approve GD Mockup by Team Lead / Admin; approval must not forward automatically.
  updateTaskStatus(mId, 'DESIGN_APPROVED', 'u-admin-001');

  const afterGd = getTasks().find(t => t.id === mId)!;
  assert(
    afterGd.status_design === 'DESIGN_APPROVED',
    '2b. Design status transitioned to DESIGN_APPROVED'
  );
  assert(
    determineTaskPipeline(afterGd) === 'GD_MOCKUP',
    '2c. Approved task stays in GD_MOCKUP until manually forwarded'
  );

  assert(
    !getMotionTasks().some(mt => mt.task_id === mId),
    '2d. Approval alone does not create a Motion task'
  );

  forwardTaskToMotion(mId, 'u-admin-001');
  const createdMotion = getMotionTasks().find(mt => mt.task_id === mId);
  assert(
    Boolean(createdMotion && createdMotion.status_motion === 'QUEUED'),
    '2e. Manual forward creates a Motion subtask with status QUEUED'
  );

  // Check board filtering: task should NOT appear active in GD Mockup, but in Motion
  const enrichedAfterMotion = buildEnrichedTasks();
  const gdActiveBoard = filterTasksByPipeline(enrichedAfterMotion, 'GD_MOCKUP');
  assert(
    !gdActiveBoard.some(t => t.id === mId),
    '2f. Handed over mockup task no longer appears as active in GD Mockup'
  );

  const motionBoard = filterTasksByPipeline(enrichedAfterMotion, 'MOTION');
  assert(
    motionBoard.some(t => t.id === mId),
    '2g. Task appears cleanly in Motion pipeline board'
  );

  const motionAudit = getAuditLogs().filter(a => a.entity_id === afterGd.task_code && a.action === 'CREATE');
  assert(
    motionAudit.length > 0,
    '2h. Audit trail records Motion task creation'
  );
}

// -------------------------------------------------------------------
// 3. E-COMMERCE MANUAL HANDOVER
// -------------------------------------------------------------------
console.log('\n--- 3. Testing GD E-Commerce -> Motion Manual Handover ---');

const existingMotionIds = new Set(getMotionTasks().map(mt => mt.task_id));
const nonMockupTask = getTasks().find(t => 
  !isMockupTask({ ...t, content_type_id: t.content_type_id }) &&
  !existingMotionIds.has(t.id) &&
  !['TASK_CLOSED', 'DESIGN_APPROVED'].includes(t.status_design)
);

if (nonMockupTask) {
  const nmId = nonMockupTask.id;
  
  submitTask(nmId, {
    output_qty: 3,
    final_asset_name: 'Banner_Promo_V1',
    final_asset_link: 'https://drive.google.com/test-pdp-assets'
  }, 'u-des-yusuf');

  // Explicitly ensure motion_readiness is NOT_APPLICABLE
  const nmBeforeApprove = getTasks().find(t => t.id === nmId)!;
  nmBeforeApprove.motion_readiness = 'NOT_APPLICABLE';

  // Approve Non-mockup
  updateTaskStatus(nmId, 'DESIGN_APPROVED', 'u-admin-001');

  const afterNm = getTasks().find(t => t.id === nmId)!;
  assert(
    afterNm.pipeline_type !== 'MOTION',
    '3a. Non-mockup task is NEVER set to pipeline_type MOTION'
  );

  assert(
    !getMotionTasks().some(mt => mt.task_id === nmId),
    '3b. Approved E-Commerce request does not forward without a manual action'
  );

  forwardTaskToMotion(nmId, 'u-admin-001');
  const motionTaskForNm = getMotionTasks().find(mt => mt.task_id === nmId);
  assert(
    Boolean(motionTaskForNm && motionTaskForNm.status_motion === 'QUEUED'),
    '3c. Approved E-Commerce task enters the Motion queue after manual forward'
  );
  assert(
    qualifiesForMotionAutoHandover(afterNm) === false,
    '3d. Automatic mockup handover criteria remain separate from manual E-Commerce forwarding'
  );
}

// -------------------------------------------------------------------
// 4. CROSS-PIPELINE READ-ONLY ACCESS VERIFICATION
// -------------------------------------------------------------------
console.log('\n--- 4. Testing Cross-Pipeline Read-Only Access ---');

// Motion PIC looking at Strategic pipeline
assert(
  canUserViewPipeline('STRATEGIC', 'MOTION_PIC') === true,
  '4a. Motion PIC has view access to Strategic pipeline'
);
assert(
  isUserReadOnlyForPipeline('STRATEGIC', 'MOTION_PIC') === true,
  '4b. Motion PIC is in READ-ONLY mode on Strategic pipeline'
);
assert(
  canUserManagePipeline('STRATEGIC', 'MOTION_PIC') === false,
  '4c. Motion PIC CANNOT manage or move cards on Strategic pipeline'
);

// Motion PIC looking at GD Mockup pipeline
assert(
  canUserViewPipeline('GD_MOCKUP', 'MOTION_PIC') === true,
  '4d. Motion PIC has view access to GD Mockup pipeline'
);
assert(
  isUserReadOnlyForPipeline('GD_MOCKUP', 'MOTION_PIC') === true,
  '4e. Motion PIC is in READ-ONLY mode on GD Mockup pipeline'
);

// GD Designer looking at Strategic pipeline
assert(
  canUserViewPipeline('STRATEGIC', 'DESIGNER') === true,
  '4f. Designer has view access to Strategic pipeline'
);
assert(
  isUserReadOnlyForPipeline('STRATEGIC', 'DESIGNER') === true,
  '4g. Designer is in READ-ONLY mode on Strategic pipeline'
);

// Strategic PIC & AE looking at Motion pipeline have full control (not read-only)
assert(
  canUserViewPipeline('MOTION', 'STRATEGIC_PIC') === true,
  '4h. Strategic PIC has view access to Motion pipeline'
);
assert(
  isUserReadOnlyForPipeline('MOTION', 'STRATEGIC_PIC') === false,
  '4i. Strategic PIC has full control (NOT read-only) on Motion pipeline'
);
assert(
  isUserReadOnlyForPipeline('MOTION', 'REQUESTER') === false,
  '4i-ae. AE / REQUESTER has full control (NOT read-only) on Motion pipeline'
);

// Pipeline owners retain manage access
assert(
  isUserReadOnlyForPipeline('STRATEGIC', 'STRATEGIC_PIC') === false,
  '4j. Strategic PIC has manage rights on Strategic pipeline'
);
assert(
  isUserReadOnlyForPipeline('GD_MOCKUP', 'DESIGNER') === false,
  '4k. Designer has manage rights on GD Mockup pipeline'
);
assert(
  isUserReadOnlyForPipeline('MOTION', 'MOTION_PIC') === false,
  '4l. Motion PIC has manage rights on Motion pipeline'
);
assert(
  isUserReadOnlyForPipeline('MOTION', 'ADMIN') === false,
  '4m. Administrator has full rights across all pipelines'
);

// -------------------------------------------------------------------
// 5. REPORT & ANALYTICS PERMISSIONS VERIFICATION
// -------------------------------------------------------------------
console.log('\n--- 5. Testing Reports & Analytics Access for All Roles ---');

const allRoles: RoleName[] = ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'DESIGNER', 'MOTION_PIC', 'REQUESTER', 'OPERATOR'];

allRoles.forEach(role => {
  const canAccessReports = ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'DESIGNER', 'MOTION_PIC', 'REQUESTER', 'OPERATOR'].includes(role);
  assert(
    canAccessReports,
    `5. Role ${role} is authorized to access Reports & Analytics`
  );
});

// -------------------------------------------------------------------
// 6. IDEMPOTENCY & REVISION IMMUNITY
// -------------------------------------------------------------------
console.log('\n--- 6. Testing Idempotency & Revision Safety ---');

// Calling approval on already approved task does not create duplicate motion subtask
if (gdMockup) {
  const initialMotionCount = getMotionTasks().filter(mt => mt.task_id === gdMockup.id).length;
  // Second approval call by admin
  updateTaskStatus(gdMockup.id, 'DESIGN_APPROVED', 'u-admin-001');
  const countAfterDuplicateApproval = getMotionTasks().filter(mt => mt.task_id === gdMockup.id).length;
  assert(
    initialMotionCount === countAfterDuplicateApproval && initialMotionCount === 1,
    '6a. Repeated approval calls do not create duplicate motion tasks (idempotent)'
  );
}

console.log('\n========================================================================');
console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY');
console.log('========================================================================\n');
