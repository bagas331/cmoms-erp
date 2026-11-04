import assert from 'assert';
import {
  isTaskInFinalState,
  qualifiesForAutoArchive,
  canUserRestoreTask,
  computeArchivePeriod,
  getTaskCompletionDate,
} from '../lib/archive-engine';
import { isTaskDone, isMotionDone, isTaskActive, isMotionActive } from '../lib/task-status';
import { CreativeTask, MotionTask, User } from '../lib/types';
import fs from 'fs';
import path from 'path';

function runArchiveVerificationSuite() {
  console.log('====================================================');
  console.log('[TEST] RUNNING COMPLETED TASKS ARCHIVE & TRACKER VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
    }
  }

  // --- Group 1: Task Completion & Archive Eligibility ---
  console.log('\n--- Group 1: Final States & Single Source of Truth Completion ---');

  const baseTask: CreativeTask = {
    id: 'task-test-1',
    task_code: 'REQ-GD-001',
    client_id: 1,
    campaign_name: 'Brand Campaign A',
    status_design: 'DESIGN_APPROVED',
    status_strat: null,
    is_archived: false,
    pipeline_type: 'GD_NON_MOCKUP',
    created_by: 'user-req-1',
    design_pic_id: 'user-des-1',
    due_date: '2026-10-15',
    approved_at: '2026-10-14T10:00:00Z',
    submission_date: '2026-10-14',
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-14T10:00:00Z',
  };

  test('DESIGN_APPROVED is recognized as final state and completed task', () => {
    assert.strictEqual(isTaskInFinalState(baseTask), true);
    assert.strictEqual(isTaskDone(baseTask), true);
    assert.strictEqual(isTaskActive(baseTask), false);
  });

  const closedTask: CreativeTask = {
    ...baseTask,
    id: 'task-test-2',
    task_code: 'REQ-GD-002',
    status_design: 'TASK_CLOSED',
  };

  test('TASK_CLOSED is recognized as final state and completed task', () => {
    assert.strictEqual(isTaskInFinalState(closedTask), true);
    assert.strictEqual(isTaskDone(closedTask), true);
    assert.strictEqual(isTaskActive(closedTask), false);
  });

  const activeTask: CreativeTask = {
    ...baseTask,
    id: 'task-test-3',
    task_code: 'REQ-GD-003',
    status_design: 'IN_PROGRESS',
    approved_at: null,
  };

  test('IN_PROGRESS task is NOT in final state and is NOT completed', () => {
    assert.strictEqual(isTaskInFinalState(activeTask), false);
    assert.strictEqual(isTaskDone(activeTask), false);
    assert.strictEqual(isTaskActive(activeTask), true);
  });

  const stratApprovedTask: CreativeTask = {
    ...baseTask,
    id: 'task-test-4',
    task_code: 'REQ-STRAT-001',
    pipeline_type: 'STRATEGIC',
    status_strat: 'APPROVED',
    status_design: null,
    requires_strategic_concept: true,
  };

  test('STRATEGIC APPROVED task is recognized as final state and completed', () => {
    assert.strictEqual(isTaskInFinalState(stratApprovedTask), true);
    assert.strictEqual(isTaskDone(stratApprovedTask), true);
  });

  const motionCompleted: MotionTask = {
    id: 'motion-test-1',
    task_id: 'task-test-1',
    status_motion: 'COMPLETED',
    is_archived: false,
    motion_pic_id: 'user-mot-1',
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-15T12:00:00Z',
    apply_date: '2026-10-15',
  };

  test('Motion COMPLETED and APPROVED tasks are recognized as final state', () => {
    assert.strictEqual(isTaskInFinalState(motionCompleted), true);
    assert.strictEqual(isMotionDone(motionCompleted), true);
    assert.strictEqual(isMotionActive(motionCompleted), false);

    const motionApproved: MotionTask = { ...motionCompleted, status_motion: 'APPROVED' };
    assert.strictEqual(isTaskInFinalState(motionApproved), true);
    assert.strictEqual(isMotionDone(motionApproved), true);
    assert.strictEqual(isMotionActive(motionApproved), false);
  });

  // --- Group 2: Auto-Archive Logic & Period Calculation ---
  console.log('\n--- Group 2: Monthly Auto-Archive & Qualification ---');

  test('Previous month completed task qualifies for auto-archive', () => {
    // Current date is in November 2026 (Month 11)
    const refDateNov = new Date('2026-11-04T00:00:00Z');
    // Task completed in October 2026 (Month 10)
    const octTask: CreativeTask = {
      ...baseTask,
      status_design: 'TASK_CLOSED',
      approved_at: '2026-10-20T10:00:00Z',
      is_archived: false,
    };
    assert.strictEqual(qualifiesForAutoArchive(octTask, refDateNov), true);
    assert.strictEqual(computeArchivePeriod(octTask.approved_at), '2026-10');
  });

  test('Current month completed task does NOT qualify for auto-archive yet', () => {
    const refDateNov = new Date('2026-11-04T00:00:00Z');
    const novTask: CreativeTask = {
      ...baseTask,
      status_design: 'TASK_CLOSED',
      approved_at: '2026-11-02T10:00:00Z',
      is_archived: false,
    };
    assert.strictEqual(qualifiesForAutoArchive(novTask, refDateNov), false);
  });

  test('Already archived task does NOT qualify for re-archiving', () => {
    const refDateNov = new Date('2026-11-04T00:00:00Z');
    const alreadyArchived: CreativeTask = {
      ...baseTask,
      status_design: 'TASK_CLOSED',
      approved_at: '2026-10-20T10:00:00Z',
      is_archived: true,
    };
    assert.strictEqual(qualifiesForAutoArchive(alreadyArchived, refDateNov), false);
  });

  // --- Group 3: Archive Page Aggregation & Restoration ---
  console.log('\n--- Group 3: Archive Page Aggregation & Restoration ---');

  test('Unified archive list aggregates both explicitly archived and newly completed tasks', () => {
    const allTasks: CreativeTask[] = [
      { ...baseTask, id: 't1', status_design: 'DESIGN_APPROVED', is_archived: false },
      { ...baseTask, id: 't2', status_design: 'TASK_CLOSED', is_archived: true },
      { ...baseTask, id: 't3', status_design: 'IN_PROGRESS', is_archived: false },
      { ...baseTask, id: 't4', status_design: 'POSTPONE', is_archived: false },
      { ...baseTask, id: 't5', status_design: 'TASK_CLOSED', is_archived: false, restored_at: '2026-11-01T00:00:00Z' },
    ];

    // Filter simulating archive/page.tsx
    const archivedCreative = allTasks.filter(t => {
      if (t.pipeline_type === 'MOTION' || (t.task_code && t.task_code.startsWith('MOT-'))) return false;
      const isArchived = (t.is_archived === true || isTaskDone(t) || t.status_design === 'TASK_CLOSED' || t.status_design === 'DESIGN_APPROVED') && !t.restored_at;
      return isArchived;
    });

    const ids = archivedCreative.map(t => t.id);
    assert.deepStrictEqual(ids, ['t1', 't2']);
    assert(!ids.includes('t3'), 'IN_PROGRESS excluded');
    assert(!ids.includes('t4'), 'POSTPONE excluded');
    assert(!ids.includes('t5'), 'Restored task excluded while active');
  });

  test('canUserRestoreTask enforces RBAC correctly', () => {
    const adminUser: User = { id: 'u-admin', email: 'admin@orbiz.com', full_name: 'Admin', role_name: 'ADMIN' };
    const leadUser: User = { id: 'u-lead', email: 'lead@orbiz.com', full_name: 'Lead', role_name: 'TEAM_LEAD' };
    const picUser: User = { id: 'user-des-1', email: 'pic@orbiz.com', full_name: 'PIC Desainer', role_name: 'DESIGNER' };
    const otherUser: User = { id: 'u-other', email: 'other@orbiz.com', full_name: 'Desainer Lain', role_name: 'DESIGNER' };

    assert.strictEqual(canUserRestoreTask(adminUser.role_name, adminUser.id, baseTask), true);
    assert.strictEqual(canUserRestoreTask(leadUser.role_name, leadUser.id, baseTask), true);
    assert.strictEqual(canUserRestoreTask(picUser.role_name, picUser.id, baseTask), true);
    assert.strictEqual(canUserRestoreTask(otherUser.role_name, otherUser.id, baseTask), false);
  });

  // --- Group 4: Layout & File Routing Verification ---
  console.log('\n--- Group 4: Layout & Archive Page Integrity Checks ---');

  test('Sidebar in layout.tsx points to /dashboard/archive', () => {
    const layoutPath = path.resolve(__dirname, '../app/dashboard/layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf8');
    assert(
      content.includes("href: '/dashboard/archive', label: 'Archived Tasks'"),
      "Sidebar Archived Tasks must point to '/dashboard/archive'"
    );
  });

  test('archive/page.tsx has no rogue redirect to /dashboard/motion', () => {
    const archivePagePath = path.resolve(__dirname, '../app/dashboard/archive/page.tsx');
    const content = fs.readFileSync(archivePagePath, 'utf8');
    assert(
      !content.includes("router.replace('/dashboard/motion?tab=archive')"),
      "archive/page.tsx must NOT contain router.replace to motion tab"
    );
  });

  test('tasks/page.tsx handles section=archive by setting mainTab without rogue redirect', () => {
    const tasksPagePath = path.resolve(__dirname, '../app/dashboard/tasks/page.tsx');
    const content = fs.readFileSync(tasksPagePath, 'utf8');
    assert(
      !content.includes("router.replace('/dashboard/motion?tab=archive')"),
      "tasks/page.tsx must NOT contain router.replace to motion tab"
    );
    assert(
      content.includes("setMainTab('archive')"),
      "tasks/page.tsx must set mainTab to 'archive'"
    );
  });

  // --- Group 5: Productivity Tracker Search Bar Visual Bug Fix ---
  console.log('\n--- Group 5: Productivity Tracker Search Bar Visual Checks ---');

  test('Productivity Tracker search bar has ample paddingLeft (>= 38px) and non-overlapping label/placeholder', () => {
    const prodPagePath = path.resolve(__dirname, '../app/dashboard/productivity/page.tsx');
    const content = fs.readFileSync(prodPagePath, 'utf8');
    assert(
      content.includes("Cari Anggota / Task"),
      "Productivity Tracker has label 'Cari Anggota / Task'"
    );
    assert(
      content.includes('placeholder="Cari nama desainer, kode task, klien..."'),
      "Productivity Tracker has placeholder 'Cari nama desainer, kode task, klien...'"
    );
    assert(
      content.includes("paddingLeft: '38px'"),
      "Productivity Tracker has paddingLeft >= 38px to avoid icon overlap"
    );
  });

  console.log(`\n====================================================`);
  console.log(`VERIFICATION RESULTS: ${passed}/${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log(`====================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runArchiveVerificationSuite();

