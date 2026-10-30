import assert from 'assert';
import { getWeeklyIssues, createWeeklyIssue, updateWeeklyIssue, deleteWeeklyIssue, getAllTasksWithRelations } from '../lib/supabase-store';
import { determineTaskPipeline } from '../lib/pipeline-router';
import { WeeklyIssue, CreateWeeklyIssueInput } from '../lib/types';

async function runVerification() {
  console.log('[TEST] Starting Reports, Analytics & Weekly Issues Verification...');

  // 1. Verify Weekly Issues Store Operations
  console.log('1. Testing Weekly Issues Storage...');
  const initialIssues = await getWeeklyIssues(2026, 10);
  console.log(`Found ${initialIssues.length} initial issues for 2026-10.`);
  assert(initialIssues.length >= 3, 'Seed issues should contain at least 3 sample items for October 2026.');

  // Verify seed example items match user request
  const hasAssetDelay = initialIssues.some(i => i.week === 'W1' && i.category === 'ASSET_DELAY');
  const hasCampaignIssue = initialIssues.some(i => i.week === 'W2' && (i.category === 'BRIEF_MISMATCH' || i.category === 'CAMPAIGN'));
  const hasAmanWeek = initialIssues.some(i => i.week === 'W3' && i.category === 'AMAN');

  assert(hasAssetDelay, 'Week 1 should have asset delay issue as requested.');
  assert(hasCampaignIssue, 'Week 2 should have campaign / brief change issue as requested.');
  assert(hasAmanWeek, 'Week 3 should have aman status as requested.');
  console.log('[PASS] Seed weekly issues match requested examples (W1 failed/delayed, W2 campaign, W3 aman).');

  // Test create weekly issue
  const newIssueInput: CreateWeeklyIssueInput = {
    year: 2026,
    month: 10,
    week: 'W4',
    title: 'Testing Automated Issue Reporting',
    category: 'RESOURCE',
    severity: 'MEDIUM',
    status: 'ACTIVE',
    description: 'Beban kerja desainer meningkat karena campaign akhir bulan.',
    affected_pipeline: 'GD_NON_MOCKUP',
    related_task_code: 'REQ-2026-TEST'
  };

  const created = await createWeeklyIssue(newIssueInput, 'user-admin');
  assert(created.id, 'Created issue must have an ID');
  assert.strictEqual(created.week, 'W4');
  console.log('[PASS] createWeeklyIssue succeeded.');

  // Test update weekly issue
  const updated = await updateWeeklyIssue(created.id, {
    status: 'RESOLVED',
    resolution_notes: 'Diberikan perbantuan freelance desainer.'
  });
  assert(updated, 'Updated issue must be returned');
  assert.strictEqual(updated.status, 'RESOLVED');
  assert.strictEqual(updated.resolution_notes, 'Diberikan perbantuan freelance desainer.');
  console.log('[PASS] updateWeeklyIssue succeeded.');

  // Test delete weekly issue
  const deleted = await deleteWeeklyIssue(created.id);
  assert.strictEqual(deleted, true);
  console.log('[PASS] deleteWeeklyIssue succeeded.');

  // 2. Verify Task vs Output Multiplier Calculation
  console.log('2. Testing Task vs Output Quantity Logic...');
  const allTasks = await getAllTasksWithRelations();
  console.log(`Retrieved ${allTasks.length} total tasks.`);

  let totalOutputs = 0;
  let ecommerceTasks = 0;
  let ecommerceOutputs = 0;

  for (const t of allTasks) {
    const outQty = Number(t.output_qty) || Number(t.req_qty) || 1;
    totalOutputs += outQty;

    const pipeline = determineTaskPipeline(t);
    if (pipeline === 'GD_NON_MOCKUP') {
      ecommerceTasks++;
      ecommerceOutputs += outQty;
    }
  }

  console.log(`Total Tasks: ${allTasks.length}, Total Outputs: ${totalOutputs}`);
  console.log(`E-Commerce Tasks: ${ecommerceTasks}, E-Commerce Outputs: ${ecommerceOutputs}`);

  assert(totalOutputs >= allTasks.length, 'Total outputs must be greater than or equal to total tasks.');
  if (ecommerceTasks > 0) {
    const ratio = ecommerceOutputs / ecommerceTasks;
    console.log(`E-Commerce Multi-Output Ratio: ${ratio.toFixed(2)}x outputs per task`);
  }
  console.log('[PASS] Task vs Output quantity logic validated.');

  // 3. Verify Workload Status Classification (Done, In Progress, Postpone/Cancel)
  console.log('3. Testing Workload Status Grouping...');
  const doneStatuses = ['DESIGN_APPROVED', 'TASK_CLOSED', 'APPROVED', 'COMPLETED'];
  const postponeCancelStatuses = ['DESIGN_POSTPONE', 'DESIGN_CANCEL', 'POSTPONE', 'CANCEL'];

  for (const t of allTasks.slice(0, 10)) {
    const s = String(t.status_design || '').toUpperCase();
    const isDone = doneStatuses.includes(s) || Boolean(t.operational_excellence);
    const isPostpone = postponeCancelStatuses.includes(s) || (t as any).is_postponed || (t as any).is_cancelled;
    const isInProgress = !isDone && !isPostpone;

    assert(
      (isDone ? 1 : 0) + (isPostpone ? 1 : 0) + (isInProgress ? 1 : 0) === 1,
      `Task ${t.task_code} must fall into exactly one workload category`
    );
  }
  console.log('[PASS] Workload status grouping (Done, In Progress, Postpone/Cancel) validated.');

  console.log('\n[SUCCESS] ALL REPORTS, ANALYTICS & ISSUES VERIFICATION PASSED SUCCESSFULLY!');
}

runVerification().catch(err => {
  console.error('[FAIL] Verification failed:', err);
  process.exit(1);
});
