import {
  createTask,
  submitTask,
  requestRevision,
  getAllTasksWithRelations,
  unpackRevisionData
} from '../lib/supabase-store';
import * as localStore from '../lib/store';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (detail) console.error(`     Detail: ${detail}`);
    failed++;
  }
}

async function runRevisionAssetHistoryVerification() {
  console.log('====================================================');
  console.log('[REVISION] RUNNING REVISION ASSET LINKS PRESERVATION VERIFICATION');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // Suite 1: unpackRevisionData Backward & Forward Compatibility
  // --------------------------------------------------------------------------
  console.log('Suite 1: unpackRevisionData Parsing & Tag Extraction');
  {
    // 1. Raw legacy row without tags
    const legacyRow = {
      id: 'rev-legacy-1',
      task_id: 't-1',
      stage: 'DESIGN',
      revision_number: 1,
      reason_category: 'BRIEF_MISALIGNMENT',
      revision_notes: '[BRIEF_MISALIGNMENT] Tolong ganti warna font ke hitam',
      requested_by: 'u-req-1',
      created_at: '2026-10-01T10:00:00Z'
    };
    const unpackedLegacy = unpackRevisionData(legacyRow);
    assert(unpackedLegacy.notes === 'Tolong ganti warna font ke hitam', 'Legacy note reason prefix stripped');
    assert(unpackedLegacy.reason_category === 'BRIEF_MISALIGNMENT', 'Reason category correctly parsed');
    assert(unpackedLegacy.asset_link === null, 'Legacy row has null asset_link without crashing');

    // 2. Row with metadata tag
    const taggedRow = {
      id: 'rev-tagged-2',
      task_id: 't-2',
      stage: 'DESIGN',
      revision_number: 2,
      revision_notes: '[COLOR_PALETTE] Logo kurang kontras\n<!--CMOMS_REVISION_ASSET:{"asset_name":"Banner_V1.png","asset_link":"https://drive.google.com/banner-v1","submitted_by":"u-des-1","submitted_at":"2026-10-02T12:00:00Z"}-->',
      requested_by: 'u-req-1',
      created_at: '2026-10-02T14:00:00Z'
    };
    const unpackedTagged = unpackRevisionData(taggedRow);
    assert(unpackedTagged.notes === 'Logo kurang kontras', 'Clean note extracted without metadata comment tag');
    assert(unpackedTagged.asset_name === 'Banner_V1.png', 'Historical asset_name unpacked from tag');
    assert(unpackedTagged.asset_link === 'https://drive.google.com/banner-v1', 'Historical asset_link preserved from tag');
    assert(unpackedTagged.submitted_by === 'u-des-1', 'Historical submitted_by preserved');

    // 3. XSS / JavaScript pseudoprotocol sanitization
    const maliciousRow = {
      id: 'rev-malicious-3',
      task_id: 't-3',
      stage: 'DESIGN',
      revision_notes: 'Revisi\n<!--CMOMS_REVISION_ASSET:{"asset_link":"javascript:alert(1)"}-->',
      created_at: '2026-10-03T10:00:00Z'
    };
    const unpackedMalicious = unpackRevisionData(maliciousRow);
    assert(unpackedMalicious.asset_link === null, 'Malicious javascript: URL blocked and sanitized to null');
  }

  // --------------------------------------------------------------------------
  // Suite 2: GD Mockup / Non-Mockup Revision Cycle with Asset Link Preservation
  // --------------------------------------------------------------------------
  console.log('\nSuite 2: GD Design Revision Cycle & Asset Link Snapshots');
  {
    // Create new task
    const testTask = await createTask({
      client_id: 1,
      campaign_name: 'SPECIAL CAMPAIGN',
      content_type_id: 1,
      task_source: 'ORCA',
      platform: 'SHOPEE',
      req_qty: 1,
      output_qty: 1,
      req_date: '2026-10-10',
      due_date: '2026-10-15',
      requires_strategic_concept: false,
      notes: 'Task D Preservation Test',
      created_by: 'u-req-001'
    });

    assert(Boolean(testTask && testTask.id), 'Test task created successfully');
    assert(testTask.final_asset_link === null, 'Initial task has null final_asset_link');

    // Step 1: Submit Initial Output (V1)
    await submitTask(
      testTask.id,
      {
        output_qty: 1,
        final_asset_name: 'Delfi_Banner_V1.png',
        final_asset_link: 'https://drive.google.com/delfi-v1-render'
      },
      'u-des-001'
    );

    let allTasks = await getAllTasksWithRelations();
    let currentTask = allTasks.find(t => t.id === testTask.id)!;
    assert(currentTask.final_asset_name === 'Delfi_Banner_V1.png', 'Active asset name is V1');
    assert(currentTask.final_asset_link === 'https://drive.google.com/delfi-v1-render', 'Active asset link is V1');
    assert(currentTask.status_design === 'DESIGN_SUBMITTED', 'Status is DESIGN_SUBMITTED');

    // Step 2: Request Revision
    await requestRevision(
      testTask.id,
      {
        stage: 'DESIGN',
        reason_category: 'COLOR_PALETTE',
        notes: 'Mohon sesuaikan kontras background kuning.'
      },
      'u-req-001'
    );

    allTasks = await getAllTasksWithRelations();
    currentTask = allTasks.find(t => t.id === testTask.id)!;
    assert(currentTask.status_design === 'DESIGN_REVISION', 'Status changed to DESIGN_REVISION');
    assert(currentTask.design_revision_count === 1, 'Revision count is 1');
    assert(currentTask.revisions.length === 1, 'One revision record exists');

    const rev1 = currentTask.revisions[0];
    assert(rev1.asset_name === 'Delfi_Banner_V1.png', 'Revision record preserved snapshot of V1 asset name');
    assert(rev1.asset_link === 'https://drive.google.com/delfi-v1-render', 'Revision record preserved snapshot of V1 asset link');
    assert(rev1.stage === 'DESIGN', 'Revision stage is DESIGN');

    // Step 3: Resubmit with Revision Output (V2)
    await submitTask(
      testTask.id,
      {
        output_qty: 1,
        final_asset_name: 'Delfi_Banner_V2_Fixed.png',
        final_asset_link: 'https://drive.google.com/delfi-v2-fixed-render'
      },
      'u-des-001'
    );

    allTasks = await getAllTasksWithRelations();
    currentTask = allTasks.find(t => t.id === testTask.id)!;
    // Active link is now V2
    assert(currentTask.final_asset_name === 'Delfi_Banner_V2_Fixed.png', 'Active asset name updated to V2');
    assert(currentTask.final_asset_link === 'https://drive.google.com/delfi-v2-fixed-render', 'Active asset link updated to V2');
    assert(currentTask.status_design === 'DESIGN_SUBMITTED', 'Status is back to DESIGN_SUBMITTED');

    // CRITICAL: Revision 1 snapshot STILL retains V1!
    assert(currentTask.revisions.length === 1, 'Revision history intact');
    assert(currentTask.revisions[0].asset_link === 'https://drive.google.com/delfi-v1-render', 'V1 snapshot link was NOT overwritten by V2 submission');
    assert(currentTask.revisions[0].asset_name === 'Delfi_Banner_V1.png', 'V1 snapshot name was NOT overwritten by V2 submission');
  }

  // --------------------------------------------------------------------------
  // Suite 3: Motion Revision Cycle & Stage Isolation
  // --------------------------------------------------------------------------
  console.log('\nSuite 3: Motion Task Revision Cycle & Isolation');
  {
    // Create standalone motion task
    const motionTask = localStore.createStandaloneMotionTask({
      client_id: 1,
      campaign_type: 'SPECIAL CAMPAIGN',
      motion_type: '2D Animation',
      notes: 'Motion Link History Test'
    }, 'u-admin-001');

    assert(Boolean(motionTask && motionTask.id), 'Motion task created');

    // Submit Motion V1
    localStore.submitMotionTask(motionTask.id, 'https://drive.google.com/motion-v1.mp4', 'Draft initial animation', 'u-mot-001');
    let mt = localStore.getMotionTasks().find(m => m.id === motionTask.id)!;
    assert(mt.link_motion === 'https://drive.google.com/motion-v1.mp4', 'Active motion link is V1');
    assert(mt.status_motion === 'SUBMITTED', 'Motion status is SUBMITTED');

    // Request Motion Revision
    localStore.requestMotionRevision(
      motionTask.id,
      {
        reason_category: 'ANIMATION_TIMING',
        notes: 'Durasi transisi terlalu cepat.'
      },
      'u-admin-001'
    );

    mt = localStore.getMotionTasks().find(m => m.id === motionTask.id)!;
    assert(mt.status_motion === 'REVISION', 'Motion status is REVISION');
    assert(mt.motion_revision_count === 1, 'Motion revision count is 1');

    const allRevs = localStore.getRevisions().filter(r => r.task_id === motionTask.id);
    assert(allRevs.length === 1, 'Motion revision record created');
    assert(allRevs[0].stage === 'MOTION', 'Revision stage is strictly MOTION (isolated from GD)');
    assert(allRevs[0].asset_link === 'https://drive.google.com/motion-v1.mp4', 'Motion V1 video link preserved in snapshot');

    // Resubmit Motion V2
    localStore.submitMotionTask(motionTask.id, 'https://drive.google.com/motion-v2-final.mp4', 'Updated timing', 'u-mot-001');
    mt = localStore.getMotionTasks().find(m => m.id === motionTask.id)!;
    assert(mt.link_motion === 'https://drive.google.com/motion-v2-final.mp4', 'Active motion link updated to V2');

    // Verify snapshot was not mutated
    const revAfter = localStore.getRevisions().find(r => r.task_id === motionTask.id)!;
    assert(revAfter.asset_link === 'https://drive.google.com/motion-v1.mp4', 'Historical motion snapshot still preserves V1 link');
  }

  // --------------------------------------------------------------------------
  // Suite 4: Tasks Without Prior Revisions
  // --------------------------------------------------------------------------
  console.log('\nSuite 4: Tasks Without Prior History');
  {
    const cleanTask = await createTask({
      client_id: 2,
      campaign_name: 'BAU',
      content_type_id: 2,
      task_source: 'ECOMMERCE',
      platform: 'TIKTOK',
      req_qty: 1,
      output_qty: 1,
      req_date: '2026-10-12',
      due_date: '2026-10-16',
      requires_strategic_concept: false,
      notes: 'Clean Task',
      created_by: 'u-req-001'
    });

    const allTasks = await getAllTasksWithRelations();
    const found = allTasks.find(t => t.id === cleanTask.id)!;
    assert(found.revisions.length === 0, 'Clean task has empty revisions array without errors');
    assert(found.final_asset_link === null, 'Clean task has null asset link without errors');
  }

  console.log(`\n====================================================`);
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log(`====================================================`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Revision Asset Links verification`);
  }
}

runRevisionAssetHistoryVerification()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
