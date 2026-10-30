import assert from 'assert';
import { 
  createTask, 
  updateStratStatus, 
  requestRevision,
  getTaskWithRelations,
  getRevisions,
  getUsers,
  resetStore
} from '../lib/store';

async function testStrategicRevisionWorkflow() {
  console.log('[TEST] Testing Strategic Revision Modal & Workflow...');
  resetStore();
  const users = getUsers();
  const requester = users.find(u => u.role_name === 'REQUESTER')!;
  const stratPic = users.find(u => u.role_name === 'STRATEGIC_PIC')!;
  const teamLead = users.find(u => u.role_name === 'TEAM_LEAD')!;

  // 1. Create a strategic task
  const task = createTask({
    client_id: 1,
    campaign_name: 'BAU',
    content_type_id: 1,
    task_source: 'ORCA',
    is_mockup: true,
    requires_strategic_concept: true,
    pipeline_type: 'STRATEGIC',
    strat_pic_ids: [stratPic.id],
    platform: 'TIKTOK',
    req_qty: 1,
    req_date: '2026-10-23',
    due_date: '2026-10-30',
    notes: 'Initial concept brief'
  }, requester.id);

  console.log('[PASS] Created strategic task:', task.task_code);

  // 2. Strategic PIC starts & submits deck
  updateStratStatus(task.id, 'IN_PROGRESS', stratPic.id);
  updateStratStatus(task.id, 'REVIEW', stratPic.id);

  const inReviewTask = getTaskWithRelations(task.id)!;
  assert.strictEqual(inReviewTask.status_strat, 'REVIEW');
  console.log('[PASS] Task is in REVIEW stage');

  // 3. User requests revision via RevisionModal payload
  const revisionPayload = {
    stage: 'STRATEGIC' as const,
    reason_category: 'BRIEF_MISALIGNMENT' as const,
    notes: 'Mohon sesuaikan tone visual dengan guideline brand terbaru, kurangi elemen kontras tinggi.'
  };

  requestRevision(task.id, revisionPayload, requester.id);

  const revisedTask = getTaskWithRelations(task.id)!;
  assert.strictEqual(revisedTask.status_strat, 'REVISION', 'Status should be REVISION');
  assert.strictEqual(revisedTask.strat_revision_count, 1, 'strat_revision_count should be 1');

  // 4. Check revisions history table
  const allRevisions = getRevisions().filter(r => r.task_id === task.id);
  assert.strictEqual(allRevisions.length, 1, 'Should have 1 revision history record');
  assert.strictEqual(allRevisions[0].stage, 'STRATEGIC');
  assert.strictEqual(allRevisions[0].reason_category, 'BRIEF_MISALIGNMENT');
  assert.strictEqual(allRevisions[0].notes, revisionPayload.notes);
  assert.strictEqual(allRevisions[0].requested_by, requester.id);

  console.log('[PASS] Revision recorded in task_revisions with category & detailed notes:');
  console.log('   - Reason:', allRevisions[0].reason_category);
  console.log('   - Notes:', allRevisions[0].notes);

  console.log('\n[SUCCESS] Strategic Revision Verification Passed 100%!');
}

testStrategicRevisionWorkflow().catch(err => {
  console.error('[FAIL] Verification failed:', err);
  process.exit(1);
});
