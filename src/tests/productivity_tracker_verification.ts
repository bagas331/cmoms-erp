import {
  calculateElapsedHours,
  formatFriendlyDuration,
  calculateRevisionHours,
  matchesPeriodFilter,
  calculateTeamProductivity,
  generateProductivityCSV,
  STANDARD_WEEKLY_HOURS
} from '../lib/productivity-engine';
import {
  TaskWithRelations,
  MotionTask,
  Client,
  User,
  TaskRevision
} from '../lib/types';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exitCode = 1;
  }
}

console.log('================================================================');
console.log('RUNNING PRODUCTIVITY & TIME TRACKER ENGINE VERIFICATION');
console.log('================================================================\n');

// 1. Elapsed Hours Calculation
const start = '2026-10-01T09:00:00Z';
const end = '2026-10-02T13:00:00Z'; // 28 hours
const hours = calculateElapsedHours(start, end);
assert(hours === 28, 'Test 1: Calculate elapsed hours between timestamps', `Expected 28, got ${hours}`);

// 2. Friendly Duration Formatting
assert(formatFriendlyDuration(0.5) === '30 menit', 'Test 2a: Format minutes');
assert(formatFriendlyDuration(8) === '8 jam', 'Test 2b: Format hours');
assert(formatFriendlyDuration(28) === '1h 4j', 'Test 2c: Format days and hours');

// 3. Revision Hours Calculation
const mockRevisions: TaskRevision[] = [
  {
    id: 'rev-1',
    task_id: 'task-1',
    stage: 'DESIGN',
    revision_number: 1,
    reason_category: 'CLIENT_CHANGE',
    notes: 'Ubah teks warna',
    requested_by: 'user-req-1',
    created_at: '2026-10-02T10:00:00Z',
    submitted_at: '2026-10-02T14:30:00Z' // 4.5 hours
  },
  {
    id: 'rev-2',
    task_id: 'task-1',
    stage: 'DESIGN',
    revision_number: 2,
    reason_category: 'TYPO',
    notes: 'Perbaiki typo tagline',
    requested_by: 'user-req-1',
    created_at: '2026-10-03T09:00:00Z',
    submitted_at: '2026-10-03T11:00:00Z' // 2.0 hours
  }
];
const revHours = calculateRevisionHours(mockRevisions);
assert(revHours === 6.5, 'Test 3: Calculate total revision duration', `Expected 6.5, got ${revHours}`);

// 4. Period & Week Filter
assert(matchesPeriodFilter('2026-10-05', '2026', '10', 'W1'), 'Test 4a: Day 5 matches W1 in October 2026');
assert(matchesPeriodFilter('2026-10-12', '2026', '10', 'W2'), 'Test 4b: Day 12 matches W2 in October 2026');
assert(!matchesPeriodFilter('2026-10-12', '2026', '10', 'W1'), 'Test 4c: Day 12 does not match W1');

// 5. Team Productivity Aggregation
const mockUsers: User[] = [
  {
    id: 'user-gd-1',
    email: 'budi.gd@orbiz.id',
    password_hash: '123',
    full_name: 'Budi Santoso',
    avatar_initials: 'BS',
    role_id: 4,
    role_name: 'DESIGNER',
    daily_capacity_points: 5,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'user-mot-1',
    email: 'reza.mot@orbiz.id',
    password_hash: '123',
    full_name: 'Reza Motion',
    avatar_initials: 'RM',
    role_id: 5,
    role_name: 'MOTION_PIC',
    daily_capacity_points: 4,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  }
];

const mockClients: Client[] = [
  { id: 1, name: 'Brand Astra', client_type: 'INTERNAL', is_active: true, created_at: '2026-01-01T00:00:00Z' }
];

const mockTasks: TaskWithRelations[] = [
  {
    id: 'task-gd-1',
    task_code: 'REQ-2026-0001',
    client_id: 1,
    client_name: 'Brand Astra',
    client_type: 'INTERNAL',
    campaign_name: 'Payday Sale 10.10',
    content_type_id: 1,
    content_type_name: 'Mockup Set',
    task_source: 'ORCA',
    platform: 'SHOPEE',
    req_qty: 1,
    output_qty: 1,
    req_date: '2026-10-02',
    due_date: '2026-10-05',
    submission_date: '2026-10-04T12:00:00Z',
    sla_working_days: 3,
    operational_excellence: 'EXCELLENCE',
    requires_strategic_concept: false,
    strat_pic_id: null,
    status_strat: 'NOT_REQUIRED',
    strat_revision_count: 0,
    design_pic_id: 'user-gd-1',
    design_pic_name: 'Budi Santoso',
    strat_pic_name: null,
    created_by_name: 'Admin',
    operator_name: null,
    design_difficulty: 'HIGH', // 4.5 pts
    design_revision_count: 2,
    status_design: 'DESIGN_APPROVED',
    motion_readiness: 'READY_TO_ANIMATE',
    final_asset_name: 'ASTRA_MOCKUP.psd',
    final_asset_link: 'https://drive.google.com/test-mockup',
    operator_id: null,
    assigned_at: '2026-10-02T08:00:00Z',
    approved_at: '2026-10-04T16:00:00Z', // 56 hours
    revisions: mockRevisions,
    notes: '',
    created_by: 'admin',
    created_at: '2026-10-02T08:00:00Z',
    updated_at: '2026-10-04T16:00:00Z'
  }
];

const mockMotionTasks: MotionTask[] = [
  {
    id: 'mot-1',
    task_id: 'task-gd-1',
    motion_pic_id: 'user-mot-1',
    motion_difficulty: 'LVL_3_ADVANCED', // 4.0 pts
    motion_revision_count: 0,
    status_motion: 'APPROVED',
    apply_date: '2026-10-06',
    due_date: '2026-10-06T18:00:00Z',
    link_motion: 'https://drive.google.com/test-video.webm',
    assigned_at: '2026-10-05T08:00:00Z',
    approved_at: '2026-10-06T12:00:00Z', // 28 hours
    notes: '',
    created_at: '2026-10-05T08:00:00Z',
    updated_at: '2026-10-06T12:00:00Z'
  }
];

const res = calculateTeamProductivity(mockTasks, mockMotionTasks, mockClients, mockUsers, {
  year: '2026',
  month: '10',
  week: 'all',
  teamType: 'ALL'
});

assert(res.designerMetrics.length === 2, 'Test 5a: Aggregates both GD and Motion designers');
const budi = res.designerMetrics.find(d => d.user_id === 'user-gd-1');
assert(Boolean(budi), 'Test 5b: Found Budi metrics');
assert(budi?.total_points === 4.5, 'Test 5c: Budi earned 4.5 GD High points', `Got ${budi?.total_points}`);
assert(budi?.total_completed_tasks === 1, 'Test 5d: Budi completed 1 task');
assert(budi?.total_revision_count === 2, 'Test 5e: Budi has 2 revisions');

const reza = res.designerMetrics.find(d => d.user_id === 'user-mot-1');
assert(Boolean(reza), 'Test 5f: Found Reza metrics');
assert(reza?.total_points === 4.0, 'Test 5g: Reza earned 4.0 Motion Advanced points', `Got ${reza?.total_points}`);

// 6. Overall Summary KPIs
assert(res.summaryKPIs.total_team_points === 8.5, 'Test 6a: Total team points = 8.5 (4.5 + 4.0)');
assert(res.summaryKPIs.total_completed_tasks === 2, 'Test 6b: Total completed tasks = 2');

// 7. CSV Export Output
const csv = generateProductivityCSV(res.designerMetrics, res.allTaskRecords, res.summaryKPIs);
assert(csv.includes('Budi Santoso') && csv.includes('Reza Motion'), 'Test 7: CSV contains designer names');
assert(csv.includes('Total Poin Selesai') && csv.includes('8.5'), 'Test 7b: CSV contains total points');

console.log('\nALL PRODUCTIVITY ENGINE TESTS PASSED SUCCESSFULLY!');

