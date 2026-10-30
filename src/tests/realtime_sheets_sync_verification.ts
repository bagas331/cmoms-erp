// ============================================================
// CMOS - Real-Time ERP Request to Google Sheets Integration
// Comprehensive Verification & Security Audit Test Suite
// ============================================================

import assert from 'assert';
import {
  MOCKUP_TAB_HEADERS,
  STRATEGIC_TAB_HEADERS,
  MOTION_TAB_HEADERS,
  getTabHeaders,
  formatMockupRowValues,
  formatStrategicRowValues,
  formatMotionRowValues,
  formatRowValuesForTab,
  buildTaskSyncPayload,
  buildMotionTaskSyncPayload,
  enqueueGoogleSheetsSync,
  getSyncOutboxItems,
  getSyncOutboxSummary,
  retryFailedOutboxItem,
  getTargetSpreadsheetId,
  DEFAULT_SYNC_SPREADSHEET_ID,
} from '../lib/google-sheets-outbox';
import {
  processSyncOutbox,
  getGoogleServiceAccountConfig,
} from '../lib/google-sheets-server';
import { createTask, createStandaloneMotionTask } from '../lib/supabase-store';
import { getUsers, getClients, getContentTypes } from '../lib/store';
import { GET as syncApiGet, POST as syncApiPost } from '../app/api/campaign/sync/route';
import { signSessionToken } from '../lib/server-auth';
import { NextRequest } from 'next/server';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const testResults: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void> | void) {
  const start = Date.now();
  try {
    await fn();
    testResults.push({ name, passed: true, durationMs: Date.now() - start });
    console.log(`  [PASS] PASS: ${name}`);
  } catch (err: unknown) {
    const errorObj = err as Error | undefined;
    testResults.push({
      name,
      passed: false,
      error: errorObj?.message || String(err),
      durationMs: Date.now() - start,
    });
    console.error(`  [FAIL] FAIL: ${name}`);
    console.error(`    ${errorObj?.stack || errorObj?.message || String(err)}`);
  }
}

async function main() {
  console.log('\n============================================================');
  console.log('REAL-TIME ERP TO GOOGLE SHEETS SYNC AUDIT TEST SUITE');
  console.log('============================================================\n');

  const users = getUsers();
  const requester = users.find((u) => u.role_name === 'REQUESTER') || users[0];
  const admin = users.find((u) => u.role_name === 'ADMIN') || users[0];
  const stratPic = users.find((u) => u.role_name === 'STRATEGIC_PIC') || users[0];
  const clients = getClients();
  const contentTypes = getContentTypes();
  const mockupContentType = contentTypes.find((c) => c.name.toLowerCase().includes('mockup')) || contentTypes[0];
  const nonMockupContentType = contentTypes.find((c) => !c.name.toLowerCase().includes('mockup')) || contentTypes[1];

  // ------------------------------------------------------------
  // TEST 1: Standard Tab Headers & Column Order
  // ------------------------------------------------------------
  await runTest('Header Schema: Tab headers are defined and non-empty for all 3 tabs', () => {
    assert.strictEqual(MOCKUP_TAB_HEADERS[0], 'Timestamp');
    assert.strictEqual(MOCKUP_TAB_HEADERS[1], 'Request Code');
    assert.ok(MOCKUP_TAB_HEADERS.includes('Brand / Client'));
    assert.ok(MOCKUP_TAB_HEADERS.includes('Campaign'));
    assert.ok(MOCKUP_TAB_HEADERS.includes('Status Design'));

    assert.strictEqual(STRATEGIC_TAB_HEADERS[0], 'Timestamp');
    assert.strictEqual(STRATEGIC_TAB_HEADERS[1], 'Request Code');
    assert.ok(STRATEGIC_TAB_HEADERS.includes('Strategic PIC'));
    assert.ok(STRATEGIC_TAB_HEADERS.includes('Status Strategic'));

    assert.strictEqual(MOTION_TAB_HEADERS[0], 'Timestamp');
    assert.strictEqual(MOTION_TAB_HEADERS[1], 'Request Code');
    assert.ok(MOTION_TAB_HEADERS.includes('Motion PIC'));
    assert.ok(MOTION_TAB_HEADERS.includes('Status Motion'));

    assert.strictEqual(getTabHeaders('Mockup'), MOCKUP_TAB_HEADERS);
    assert.strictEqual(getTabHeaders('By Strategic'), STRATEGIC_TAB_HEADERS);
    assert.strictEqual(getTabHeaders('Motion'), MOTION_TAB_HEADERS);
  });

  // ------------------------------------------------------------
  // TEST 2: Row Value Formatting Matches Header Length
  // ------------------------------------------------------------
  await runTest('Row Formatting: Formatted values match header column count exactly', () => {
    const mockupPayload = {
      timestamp: '2026-10-16T10:00:00Z',
      task_code: 'REQ-2026-0001',
      client_name: 'Brand X',
      campaign_name: 'BAU',
      content_type_name: 'Mockup Feed',
      pipeline_type: 'GD_MOCKUP',
      task_source: 'ECOMMERCE',
      platform: 'TIKTOK',
      req_date: '2026-10-16',
      due_date: '2026-10-20',
      req_qty: 2,
      output_qty: 2,
      status_design: 'DESIGN_UNASSIGNED',
      design_pic_name: 'Designer A',
      design_difficulty: 'LOW',
      design_revision_count: 0,
      final_asset_name: 'Banner.png',
      final_asset_link: 'https://drive.google.com/file/d/test1',
      notes: 'Test notes',
    };

    const mockupValues = formatMockupRowValues(mockupPayload);
    assert.strictEqual(mockupValues.length, MOCKUP_TAB_HEADERS.length);
    assert.strictEqual(mockupValues[1], 'REQ-2026-0001');

    const strategicPayload = {
      ...mockupPayload,
      strat_pic_names: 'Strategist B',
      status_strat: 'PENDING',
      strat_concept_link: 'https://docs.google.com/test',
    };
    const stratValues = formatStrategicRowValues(strategicPayload);
    assert.strictEqual(stratValues.length, STRATEGIC_TAB_HEADERS.length);

    const motionPayload = {
      timestamp: '2026-10-16T10:00:00Z',
      task_code: 'MOT-2026-0001',
      client_name: 'Brand Y',
      campaign_type: 'PAYDAY',
      platform: 'SHOPEE',
      motion_type: 'Live Mockup',
      production_date: '2026-10-16',
      period_start: '2026-10-20',
      period_end: '2026-10-25',
      motion_pic_name: 'Motion PIC C',
      operator_name: 'Operator D',
      studio: 'Jakarta',
      complexity: 'LVL_2_MEDIUM',
      motion_revision_count: 0,
      status_motion: 'QUEUED',
      link_motion: 'https://drive.google.com/file/d/test2',
      notes: 'Motion notes',
    };
    const motionValues = formatMotionRowValues(motionPayload);
    assert.strictEqual(motionValues.length, MOTION_TAB_HEADERS.length);
  });

  // ------------------------------------------------------------
  // TEST 3: Pipeline Payload Builder & Target Tab Router
  // ------------------------------------------------------------
  await runTest('Pipeline Routing: Correct target tab routing for Strategic, GD, and Motion', () => {
    // 1. Strategic task
    const stratTask: any = {
      id: 'task-strat-1',
      task_code: 'REQ-2026-1001',
      client_id: 1,
      campaign_name: 'BAU',
      content_type_id: 1,
      task_source: 'ORCA',
      platform: 'TIKTOK',
      req_qty: 1,
      output_qty: 1,
      req_date: '2026-10-16',
      due_date: '2026-10-20',
      requires_strategic_concept: true,
      pipeline_type: 'STRATEGIC',
      status_strat: 'PENDING',
      status_design: 'STRAT_PENDING',
      notes: 'Strategic task test',
    };
    const stratResult = buildTaskSyncPayload(stratTask, 'Brand Alpha', 'Concept Feed');
    assert.strictEqual(stratResult.targetTab, 'By Strategic');
    assert.strictEqual(stratResult.payload.task_code, 'REQ-2026-1001');

    // 2. Mockup GD task
    const mockupTask: any = {
      ...stratTask,
      id: 'task-mockup-1',
      task_code: 'REQ-2026-1002',
      requires_strategic_concept: false,
      pipeline_type: 'GD_MOCKUP',
      status_strat: 'NOT_REQUIRED',
      status_design: 'DESIGN_UNASSIGNED',
    };
    const mockupResult = buildTaskSyncPayload(mockupTask, 'Brand Beta', 'Mockup Feed');
    assert.strictEqual(mockupResult.targetTab, 'Mockup');
    assert.strictEqual(mockupResult.payload.task_code, 'REQ-2026-1002');

    // 3. Motion task
    const motionTask: any = {
      id: 'motion-1',
      task_id: null,
      client_id: 2,
      platform: 'SHOPEE',
      motion_type: 'Live Stream Asset',
      campaign_type: 'DD',
      production_date: '2026-10-16',
      period_start: '2026-10-18',
      period_end: '2026-10-22',
      studio: 'Jakarta',
      motion_difficulty: 'LVL_1_SIMPLE',
      motion_revision_count: 0,
      status_motion: 'QUEUED',
      notes: 'Motion sync test',
    };
    const motionResult = buildMotionTaskSyncPayload(motionTask, 'Brand Gamma');
    assert.strictEqual(motionResult.targetTab, 'Motion');
    assert.strictEqual(motionResult.payload.brand, 'Brand Gamma');
  });

  // ------------------------------------------------------------
  // TEST 4: Outbox Deduplication & Idempotency Key
  // ------------------------------------------------------------
  await runTest('Outbox Deduplication: Repeated enqueue with same idempotency key does not duplicate', async () => {
    const testCode = `TEST-IDEMP-${Date.now()}`;
    const payload = { task_code: testCode, client_name: 'Test Client' };

    const firstEnqueue = await enqueueGoogleSheetsSync({
      idempotencyKey: `CREATE_${testCode}`,
      eventType: 'CREATE_TASK',
      entityId: `id-${testCode}`,
      taskCode: testCode,
      targetTab: 'Mockup',
      payload,
    });

    assert.strictEqual(firstEnqueue.task_code, testCode);
    assert.strictEqual(firstEnqueue.status, 'PENDING');

    // Second enqueue with identical idempotencyKey
    const secondEnqueue = await enqueueGoogleSheetsSync({
      idempotencyKey: `CREATE_${testCode}`,
      eventType: 'CREATE_TASK',
      entityId: `id-${testCode}`,
      taskCode: testCode,
      targetTab: 'Mockup',
      payload,
    });

    assert.strictEqual(secondEnqueue.id, firstEnqueue.id);

    const items = await getSyncOutboxItems(50);
    const duplicates = items.filter((i) => i.idempotency_key === `CREATE_${testCode}`);
    assert.strictEqual(duplicates.length, 1);
  });

  // ------------------------------------------------------------
  // TEST 5: Outbox Worker Error Handling & Unconfigured Graceful State
  // ------------------------------------------------------------
  await runTest('Outbox Worker: Graceful pending state when credentials are not configured', async () => {
    const testCode = `TEST-UNCONF-${Date.now()}`;
    await enqueueGoogleSheetsSync({
      idempotencyKey: `UNCONF_${testCode}`,
      eventType: 'CREATE_TASK',
      entityId: `id-${testCode}`,
      taskCode: testCode,
      targetTab: 'Mockup',
      payload: { task_code: testCode },
    });

    // Run outbox processing
    const workerResult = await processSyncOutbox();
    assert.ok(typeof workerResult.processed === 'number');

    const items = await getSyncOutboxItems(50);
    const item = items.find((i) => i.task_code === testCode);
    assert.ok(item, 'Item must exist in outbox');
    assert.strictEqual(item?.status, 'PENDING');
    assert.ok(item?.attempts && item.attempts >= 1);
  });

  // ------------------------------------------------------------
  // TEST 6: Real ERP Request Creation Triggers Outbox Enqueue (GD Mockup)
  // ------------------------------------------------------------
  await runTest('Integration: Creating GD Mockup task automatically enqueues to Mockup tab', async () => {
    const task = await createTask(
      {
        client_id: clients[0].id,
        campaign_name: 'BAU',
        content_type_id: mockupContentType.id,
        task_source: 'ECOMMERCE',
        platform: 'TIKTOK',
        req_qty: 1,
        req_date: '2026-10-16',
        due_date: '2026-10-25',
        requires_strategic_concept: false,
        pipeline_type: 'GD_MOCKUP',
        is_mockup: true,
        notes: 'Real-time sync test GD Mockup',
      },
      requester.id
    );

    assert.ok(task, 'Task must be created successfully');
    assert.ok(task.task_code, 'Task must have a task code');

    // Verify it appeared in the outbox
    const items = await getSyncOutboxItems(50);
    const outboxItem = items.find((i) => i.task_code === task.task_code);
    assert.ok(outboxItem, `Outbox item for ${task.task_code} must exist`);
    assert.strictEqual(outboxItem.target_tab, 'Mockup');
    assert.strictEqual(outboxItem.event_type, 'CREATE_TASK');
  });

  // ------------------------------------------------------------
  // TEST 7: Real ERP Request Creation Triggers Outbox Enqueue (Strategic)
  // ------------------------------------------------------------
  await runTest('Integration: Creating Strategic task automatically enqueues to By Strategic tab', async () => {
    const task = await createTask(
      {
        client_id: clients[0].id,
        campaign_name: 'DD',
        content_type_id: nonMockupContentType.id,
        task_source: 'ORCA',
        platform: 'SHOPEE',
        req_qty: 1,
        req_date: '2026-10-16',
        due_date: '2026-10-28',
        requires_strategic_concept: true,
        strat_pic_ids: [stratPic.id],
        pipeline_type: 'STRATEGIC',
        notes: 'Real-time sync test Strategic',
      },
      requester.id
    );

    assert.ok(task, 'Strategic task must be created successfully');

    // Verify it appeared in the outbox for By Strategic tab
    const items = await getSyncOutboxItems(50);
    const outboxItem = items.find((i) => i.task_code === task.task_code);
    assert.ok(outboxItem, `Outbox item for ${task.task_code} must exist`);
    assert.strictEqual(outboxItem.target_tab, 'By Strategic');
    assert.strictEqual(outboxItem.event_type, 'CREATE_TASK');
  });

  // ------------------------------------------------------------
  // TEST 8: Real ERP Standalone Motion Creation Triggers Outbox Enqueue
  // ------------------------------------------------------------
  await runTest('Integration: Creating Standalone Motion task automatically enqueues to Motion tab', async () => {
    const motion = await createStandaloneMotionTask(
      {
        client_id: clients[0].id,
        platform: 'TIKTOK',
        motion_type: 'Short Video Banner',
        campaign_type: 'SPECIAL CAMPAIGN',
        motion_pic_id: null,
        production_date: '2026-10-16',
        period_start: '2026-10-20',
        period_end: '2026-10-25',
        studio: 'Bandung',
      },
      requester.id
    );

    assert.ok(motion, 'Motion task must be created');

    const items = await getSyncOutboxItems(50);
    const outboxItem = items.find((i) => i.entity_id === motion.id);
    assert.ok(outboxItem, 'Outbox item for Motion task must exist');
    assert.strictEqual(outboxItem.target_tab, 'Motion');
    assert.strictEqual(outboxItem.event_type, 'CREATE_MOTION');
  });

  // ------------------------------------------------------------
  // TEST 9: Outbox Retry Mechanism
  // ------------------------------------------------------------
  await runTest('Outbox Retry: retryFailedOutboxItem resets attempts and schedules worker', async () => {
    const testCode = `TEST-FAIL-${Date.now()}`;
    const item = await enqueueGoogleSheetsSync({
      idempotencyKey: `FAIL_${testCode}`,
      eventType: 'CREATE_TASK',
      entityId: `id-${testCode}`,
      taskCode: testCode,
      targetTab: 'Mockup',
      payload: { task_code: testCode },
    });

    const success = await retryFailedOutboxItem(item.id);
    assert.strictEqual(success, true);

    const items = await getSyncOutboxItems(50);
    const updated = items.find((i) => i.id === item.id);
    assert.strictEqual(updated?.attempts, 0);
  });

  // ------------------------------------------------------------
  // TEST 10: Security: Unauthenticated Request to Sync API is Rejected (401)
  // ------------------------------------------------------------
  await runTest('Security: Anonymous request to GET /api/campaign/sync returns 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/campaign/sync', {
      method: 'GET',
    });
    const res = await syncApiGet(req);
    assert.strictEqual(res.status, 401);
  });

  // ------------------------------------------------------------
  // TEST 11: Security: Authenticated Request to GET /api/campaign/sync succeeds without exposing Private Key
  // ------------------------------------------------------------
  await runTest('Security: GET /api/campaign/sync returns config status without leaking private key', async () => {
    const sessionToken = signSessionToken({
      id: admin.id,
      email: admin.email,
      role_name: admin.role_name,
    });

    const req = new NextRequest('http://localhost:3000/api/campaign/sync', {
      method: 'GET',
      headers: {
        Cookie: `cmoms_session=${sessionToken}`,
      },
    });

    const res = await syncApiGet(req);
    assert.strictEqual(res.status, 200);

    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.summary, 'Must contain summary');
    assert.ok(Array.isArray(json.items), 'Must contain items array');
    assert.ok(json.config, 'Must contain config metadata');

    // Private key must NEVER be in response
    const jsonStr = JSON.stringify(json);
    assert.strictEqual(jsonStr.includes('private_key'), false);
    assert.strictEqual(jsonStr.includes('BEGIN PRIVATE KEY'), false);
  });

  // ------------------------------------------------------------
  // TEST 12: Security: Non-Admin/Non-Lead cannot POST to /api/campaign/sync (403)
  // ------------------------------------------------------------
  await runTest('Security: Requester role cannot trigger POST /api/campaign/sync (403)', async () => {
    const requesterToken = signSessionToken({
      id: requester.id,
      email: requester.email,
      role_name: 'REQUESTER',
    });

    const req = new NextRequest('http://localhost:3000/api/campaign/sync', {
      method: 'POST',
      headers: {
        Cookie: `cmoms_session=${requesterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'PROCESS_QUEUE' }),
    });

    const res = await syncApiPost(req);
    assert.strictEqual(res.status, 403);
  });

  // ------------------------------------------------------------
  // TEST 13: Summary Stats Calculation
  // ------------------------------------------------------------
  await runTest('Summary Stats: getSyncOutboxSummary accurately tallies totals', async () => {
    const summary = await getSyncOutboxSummary();
    assert.ok(typeof summary.total === 'number');
    assert.ok(typeof summary.synced === 'number');
    assert.ok(typeof summary.pending === 'number');
    assert.ok(typeof summary.failed === 'number');
    assert.strictEqual(summary.total, summary.synced + summary.pending + summary.failed);
  });

  // ------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------
  console.log('\n------------------------------------------------------------');
  const passedCount = testResults.filter((r) => r.passed).length;
  const failedCount = testResults.filter((r) => !r.passed).length;
  console.log(`SUMMARY: ${passedCount}/${testResults.length} passed (${failedCount} failed)`);
  console.log('------------------------------------------------------------\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log('All Real-Time Sheets Sync tests passed successfully!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
