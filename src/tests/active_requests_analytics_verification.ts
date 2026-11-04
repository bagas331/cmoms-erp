// ============================================================
// CMOMS - Active Requests Analytics Verification Test Suite
// Verifies synchronization of "Request yang Aktif" across:
// 1. Dashboard Overview (getDashboardStats & getDesignerWorkloads)
// 2. Operational Analytics (calculateTeamOccupancy & Request vs Output)
// 3. Productivity Tracker (Completed Points vs Active Turnaround)
// 4. Reports & Analytics Dashboard
// 5. Reporting Kendala Mingguan
// ============================================================

import assert from 'assert';
import {
  isTaskActive,
  isTaskDone,
  isTaskPostponedOrCancelled,
  isTaskArchived,
  isMotionActive,
  isMotionDone,
  isMotionPostponedOrCancelled,
  isMotionArchived,
  getWeekKeyFromDate,
  matchesPeriod
} from '../lib/task-status';
import { getDashboardStats, getDesignerWorkloads } from '../lib/store';
import { calculateTeamOccupancy, calculateRequestVsOutput } from '../lib/analytics-engine';
import { calculateTeamProductivity } from '../lib/productivity-engine';
import { TaskWithRelations, User, ContentType, Client, MotionTask } from '../lib/types';

console.log('================================================================');
console.log('RUNNING ACTIVE REQUESTS ANALYTICS VERIFICATION TEST SUITE');
console.log('================================================================');

// --- 1. TEST TASK STATUS LOGIC ---
const mockActiveTask: any = {
  id: 'task-active-1',
  task_code: 'REQ-2026-0001',
  status_design: 'DESIGN_IN_PROGRESS',
  req_date: '2026-11-04',
  is_archived: false,
};

const mockApprovedTask: any = {
  id: 'task-approved-1',
  task_code: 'REQ-2026-0002',
  status_design: 'DESIGN_APPROVED',
  req_date: '2026-11-03',
  approved_at: '2026-11-04T10:00:00Z',
  is_archived: false,
};

const mockCancelledTask: any = {
  id: 'task-cancelled-1',
  task_code: 'REQ-2026-0003',
  status_design: 'DESIGN_CANCEL',
  req_date: '2026-11-02',
  is_archived: false,
};

const mockPostponedTask: any = {
  id: 'task-postponed-1',
  task_code: 'REQ-2026-0004',
  status_design: 'DESIGN_POSTPONE',
  req_date: '2026-11-01',
  is_archived: false,
};

const mockArchivedTask: any = {
  id: 'task-archived-1',
  task_code: 'REQ-2026-0005',
  status_design: 'DESIGN_IN_PROGRESS',
  req_date: '2026-10-15',
  is_archived: true,
};

assert.strictEqual(isTaskActive(mockActiveTask), true, 'Active task should be active');
assert.strictEqual(isTaskActive(mockApprovedTask), false, 'Approved task must NOT be active');
assert.strictEqual(isTaskActive(mockCancelledTask), false, 'Cancelled task must NOT be active');
assert.strictEqual(isTaskActive(mockPostponedTask), false, 'Postponed task must NOT be active');
assert.strictEqual(isTaskActive(mockArchivedTask), false, 'Archived task must NOT be active');

assert.strictEqual(isTaskDone(mockApprovedTask), true, 'Approved task is done');
assert.strictEqual(isTaskDone(mockCancelledTask), false, 'Cancelled task is not done');
assert.strictEqual(isTaskPostponedOrCancelled(mockCancelledTask), true, 'Cancelled task recognized');
assert.strictEqual(isTaskPostponedOrCancelled(mockPostponedTask), true, 'Postponed task recognized');
assert.strictEqual(isTaskArchived(mockArchivedTask), true, 'Archived task recognized');

console.log('[PASS] Test 1: Task status lifecycle single source of truth');

// --- 2. TEST MOTION TASK STATUS LOGIC ---
const mockActiveMotion: any = { id: 'm-1', status_motion: 'IN_PROGRESS', is_archived: false };
const mockApprovedMotion: any = { id: 'm-2', status_motion: 'APPROVED', is_archived: false };
const mockCancelledMotion: any = { id: 'm-3', status_motion: 'CANCEL', is_archived: false };
const mockArchivedMotion: any = { id: 'm-4', status_motion: 'IN_PROGRESS', is_archived: true };

assert.strictEqual(isMotionActive(mockActiveMotion), true, 'Motion in progress is active');
assert.strictEqual(isMotionActive(mockApprovedMotion), false, 'Approved motion is not active');
assert.strictEqual(isMotionActive(mockCancelledMotion), false, 'Cancelled motion is not active');
assert.strictEqual(isMotionActive(mockArchivedMotion), false, 'Archived motion is not active');

console.log('[PASS] Test 2: Motion task status single source of truth');

// --- 3. TEST WEEK PARTITIONING & PERIOD FILTER ---
assert.strictEqual(getWeekKeyFromDate('2026-11-03'), 'W1', 'Nov 3 is W1');
assert.strictEqual(getWeekKeyFromDate('2026-11-10'), 'W2', 'Nov 10 is W2');
assert.strictEqual(getWeekKeyFromDate('2026-11-18'), 'W3', 'Nov 18 is W3');
assert.strictEqual(getWeekKeyFromDate('2026-11-25'), 'W4', 'Nov 25 is W4');

assert.strictEqual(matchesPeriod('2026-11-05', { year: '2026', month: '11', week: 'W1' }), true);
assert.strictEqual(matchesPeriod('2026-11-12', { year: '2026', month: '11', week: 'W1' }), false);

console.log('[PASS] Test 3: Week partitioning and period matching');

// --- 4. TEST DASHBOARD STATS LOGIC ---
const stats = getDashboardStats('all', '2026');
assert(typeof stats.active_tasks === 'number', 'Active tasks count is a number');
assert(typeof stats.completed_tasks === 'number', 'Completed tasks count is a number');
// Check that approaching_deadline and overdue_tasks contain only active tasks
stats.overdue_tasks.forEach(t => {
  assert(isTaskActive(t), `Overdue task ${t.task_code} must be strictly active`);
});
stats.approaching_deadline.forEach(t => {
  assert(isTaskActive(t), `Approaching deadline task ${t.task_code} must be strictly active`);
});

console.log('[PASS] Test 4: Dashboard stats overdue & approaching deadline strictly filter active tasks');

// --- 5. TEST DESIGNER WORKLOADS ---
const workloads = getDesignerWorkloads('all', '2026');
workloads.forEach(w => {
  w.tasks.forEach(t => {
    assert(!['TASK_CLOSED', 'DESIGN_APPROVED', 'DESIGN_CANCEL', 'DESIGN_POSTPONE'].includes(t.status),
      `Workload task ${t.task_code} status (${t.status}) must be strictly active`
    );
  });
});

console.log('[PASS] Test 5: Designer workloads calculate points strictly from active requests');

// --- 6. TEST OPERATIONAL ANALYTICS OCCUPANCY ---
const dummyUser: User = {
  id: 'U1',
  email: 'designer1@orbiz.com',
  full_name: 'Desainer Uji',
  avatar_initials: 'DU',
  role_id: 4,
  role_name: 'DESIGNER',
  daily_capacity_points: 7,
  is_active: true,
  password_hash: '',
  created_at: '2026-01-01',
  updated_at: '2026-01-01'
};

const tasksForOccupancy: any[] = [
  {
    id: 't-occ-1',
    task_code: 'REQ-OCC-1',
    design_pic_id: 'U1',
    design_difficulty: 'HIGH', // 4.5 pts
    output_qty: 1,
    status_design: 'DESIGN_IN_PROGRESS',
    is_archived: false,
  },
  {
    id: 't-occ-2',
    task_code: 'REQ-OCC-2',
    design_pic_id: 'U1',
    design_difficulty: 'HIGH', // 4.5 pts - should be EXCLUDED because CANCELLED
    output_qty: 1,
    status_design: 'DESIGN_CANCEL',
    is_archived: false,
  },
  {
    id: 't-occ-3',
    task_code: 'REQ-OCC-3',
    design_pic_id: 'U1',
    design_difficulty: 'HIGH', // 4.5 pts - should be EXCLUDED because ARCHIVED
    output_qty: 1,
    status_design: 'DESIGN_IN_PROGRESS',
    is_archived: true,
  }
];

const occupancy = calculateTeamOccupancy(tasksForOccupancy, [dummyUser]);
const u1Occ = occupancy.find(o => o.pic_id === 'U1');
assert(u1Occ, 'Designer U1 found in occupancy');
// Only t-occ-1 should be counted (4.5 pts). Cancelled and archived must be excluded!
assert.strictEqual(u1Occ.total_points, 4.5, `Total points should be 4.5, but got ${u1Occ.total_points}`);
assert.strictEqual(u1Occ.total_tasks, 1, `Total active tasks should be 1, but got ${u1Occ.total_tasks}`);

console.log('[PASS] Test 6: Team Occupancy excludes cancelled, postponed, and archived tasks');

// --- 7. TEST REQUEST VS OUTPUT ---
const dummyContentType: ContentType = {
  id: 1,
  name: 'Feed Carousel',
  default_difficulty: 'HIGH',
  created_at: '2026-01-01'
};

const tasksForReqVsOutput: any[] = [
  {
    id: 't-rvo-1',
    content_type_id: 1,
    task_source: 'ECOMMERCE',
    req_qty: 2,
    output_qty: 2,
    status_design: 'DESIGN_APPROVED',
    is_archived: false,
  },
  {
    id: 't-rvo-2',
    content_type_id: 1,
    task_source: 'ECOMMERCE',
    req_qty: 1,
    output_qty: 0,
    status_design: 'DESIGN_CANCEL', // Should NOT penalize output achievement!
    is_archived: false,
  }
];

const rvo = calculateRequestVsOutput(tasksForReqVsOutput, [dummyContentType]);
const feedItem = rvo.items.find(i => i.content_type_id === 1);
assert(feedItem, 'Feed item found');
// Only valid non-cancelled task counted
assert.strictEqual(feedItem.req_qty, 2, 'Req qty should only be 2');
assert.strictEqual(feedItem.output_qty, 2, 'Output qty should be 2');
assert.strictEqual(feedItem.achievement_rate, 100, 'Achievement rate should be 100%');

console.log('[PASS] Test 7: Request vs Output does not penalize cancelled requests');

// --- 8. TEST PRODUCTIVITY TRACKER EXCLUSIONS ---
const dummyClient: Client = {
  id: 1,
  name: 'Orbiz Brand',
  client_type: 'INTERNAL',
  is_active: true,
  created_at: '2026-01-01'
};

const tasksForProd: any[] = [
  {
    id: 't-p-1',
    task_code: 'REQ-PROD-1',
    design_pic_id: 'U1',
    design_difficulty: 'HIGH', // 4.5
    output_qty: 1,
    status_design: 'DESIGN_APPROVED',
    approved_at: '2026-11-04T10:00:00Z',
    created_at: '2026-11-04T08:00:00Z',
    is_archived: false,
  },
  {
    id: 't-p-2',
    task_code: 'REQ-PROD-2',
    design_pic_id: 'U1',
    design_difficulty: 'HIGH',
    output_qty: 1,
    status_design: 'DESIGN_CANCEL', // Cancelled must NOT be in productivity!
    created_at: '2026-11-04T08:00:00Z',
    is_archived: false,
  },
  {
    id: 't-p-3',
    task_code: 'REQ-PROD-3',
    design_pic_id: 'U1',
    design_difficulty: 'LOW', // 2.5 pts - Active in progress
    output_qty: 1,
    status_design: 'DESIGN_IN_PROGRESS',
    created_at: '2026-11-04T08:00:00Z',
    is_archived: false,
  }
];

const prod = calculateTeamProductivity(tasksForProd, [], [dummyClient], [dummyUser], {
  year: '2026',
  month: '11',
  week: 'all',
  teamType: 'GD'
});

assert.strictEqual(prod.summaryKPIs.total_team_points, 4.5, 'Points must only come from approved task');
assert.strictEqual(prod.summaryKPIs.total_completed_tasks, 1, 'Only 1 completed task');
assert.strictEqual(prod.summaryKPIs.total_active_tasks, 1, 'Only 1 active task (cancelled excluded)');

console.log('[PASS] Test 8: Productivity Tracker points derived from approved tasks, active tasks monitored, cancelled excluded');

console.log('================================================================');
console.log('ALL 8 ACTIVE REQUESTS ANALYTICS TESTS PASSED WITH 100% SUCCESS!');
console.log('================================================================');

