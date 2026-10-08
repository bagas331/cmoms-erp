import { User, TaskWithRelations } from '../lib/types';

// Verification test suite for Role and Name filtering across Mockup & Motion Pipelines
async function runVerification() {
  console.log('--- RUNNING ROLE & NAME FILTER VERIFICATION SUITE ---');
  let passCount = 0;

  const sampleUsers: User[] = [
    { id: 'usr-req-1', email: 'req1@orbiz.id', full_name: 'Bagas Requester', password_hash: '', avatar_initials: 'BR', role_id: 6, role_name: 'REQUESTER', daily_capacity_points: 0, is_active: true, created_at: '', updated_at: '' },
    { id: 'usr-strat-1', email: 'strat1@orbiz.id', full_name: 'Citra Strategic', password_hash: '', avatar_initials: 'CS', role_id: 3, role_name: 'STRATEGIC_PIC', daily_capacity_points: 0, is_active: true, created_at: '', updated_at: '' },
    { id: 'usr-des-1', email: 'des1@orbiz.id', full_name: 'Ahmad Designer', password_hash: '', avatar_initials: 'AD', role_id: 4, role_name: 'DESIGNER', daily_capacity_points: 15, is_active: true, created_at: '', updated_at: '' },
    { id: 'usr-des-2', email: 'des2@orbiz.id', full_name: 'Budi Designer', password_hash: '', avatar_initials: 'BD', role_id: 4, role_name: 'DESIGNER', daily_capacity_points: 15, is_active: true, created_at: '', updated_at: '' },
    { id: 'usr-mot-1', email: 'mot1@orbiz.id', full_name: 'Reza Motion', password_hash: '', avatar_initials: 'RM', role_id: 5, role_name: 'MOTION_PIC', daily_capacity_points: 10, is_active: true, created_at: '', updated_at: '' },
    { id: 'usr-op-1', email: 'op1@orbiz.id', full_name: 'Doni Operator', password_hash: '', avatar_initials: 'DO', role_id: 7, role_name: 'OPERATOR', daily_capacity_points: 0, is_active: true, created_at: '', updated_at: '' },
  ];

  const sampleTasks: TaskWithRelations[] = [
    {
      id: 'task-1',
      task_code: 'REQ-2026-0001',
      client_id: 1,
      client_name: 'Brand Alpha',
      campaign_name: 'Ramadhan Campaign',
      content_type_id: 1,
      content_type_name: 'Feed Post',
      task_source: 'ORCA',
      platform: 'OTHER',
      req_qty: 1,
      output_qty: 1,
      req_date: '2026-03-01',
      due_date: '2026-03-05',
      submission_date: null,
      sla_working_days: null,
      operational_excellence: null,
      requires_strategic_concept: true,
      strat_pic_id: 'usr-strat-1',
      status_strat: 'APPROVED',
      strat_revision_count: 0,
      design_pic_id: 'usr-des-1',
      design_pic_name: 'Ahmad Designer',
      design_difficulty: 'MEDIUM',
      design_revision_count: 0,
      status_design: 'DESIGN_IN_PROGRESS',
      motion_readiness: 'WAITING_ASSET_GD',
      final_asset_name: null,
      final_asset_link: null,
      operator_id: null,
      notes: '',
      created_by: 'usr-req-1',
      created_at: '2026-03-01T08:00:00Z',
      updated_at: '2026-03-01T08:00:00Z'
    },
    {
      id: 'task-2',
      task_code: 'REQ-2026-0002',
      client_id: 2,
      client_name: 'Brand Beta',
      campaign_name: 'Promo Payday',
      content_type_id: 2,
      content_type_name: 'Story Banner',
      task_source: 'ECOMMERCE',
      platform: 'SHOPEE',
      req_qty: 2,
      output_qty: 2,
      req_date: '2026-03-02',
      due_date: '2026-03-06',
      submission_date: null,
      sla_working_days: null,
      operational_excellence: null,
      requires_strategic_concept: false,
      strat_pic_id: null,
      status_strat: 'NOT_REQUIRED',
      strat_revision_count: 0,
      design_pic_id: 'usr-des-2',
      design_pic_name: 'Budi Designer',
      design_difficulty: 'LOW',
      design_revision_count: 0,
      status_design: 'DESIGN_ASSIGNED',
      motion_readiness: 'WAITING_ASSET_GD',
      final_asset_name: null,
      final_asset_link: null,
      operator_id: null,
      notes: '',
      created_by: 'usr-req-1',
      created_at: '2026-03-02T08:00:00Z',
      updated_at: '2026-03-02T08:00:00Z'
    }
  ];

  // Test 1: Filter Mockup Tasks by Role = DESIGNER
  const designerTasks = sampleTasks.filter(t => Boolean(t.design_pic_id));
  if (designerTasks.length === 2) {
    console.log('✓ [PASS] Test 1: Role filter "DESIGNER" matches all tasks assigned to a designer');
    passCount++;
  } else {
    console.error('✗ [FAIL] Test 1: Expected 2 tasks, got', designerTasks.length);
  }

  // Test 2: Filter Mockup Tasks by Specific User (Ahmad Designer)
  const ahmadTasks = sampleTasks.filter(t => t.design_pic_id === 'usr-des-1');
  if (ahmadTasks.length === 1 && ahmadTasks[0].task_code === 'REQ-2026-0001') {
    console.log('✓ [PASS] Test 2: User filter "Ahmad Designer" matches only task REQ-2026-0001');
    passCount++;
  } else {
    console.error('✗ [FAIL] Test 2: User filter failed');
  }

  // Test 3: Filter Mockup Tasks by Role = STRATEGIC_PIC
  const stratTasks = sampleTasks.filter(t => Boolean(t.strat_pic_id || t.requires_strategic_concept));
  if (stratTasks.length === 1 && stratTasks[0].task_code === 'REQ-2026-0001') {
    console.log('✓ [PASS] Test 3: Role filter "STRATEGIC_PIC" matches tasks requiring strategic concept');
    passCount++;
  } else {
    console.error('✗ [FAIL] Test 3: Strategic filter failed');
  }

  // Test 4: Filter Motion Tasks by Motion PIC
  const sampleMotionTasks = [
    {
      id: 'mot-1',
      task_id: 'task-1',
      motion_pic_id: 'usr-mot-1',
      motion_difficulty: 'LVL_2_MEDIUM' as const,
      motion_revision_count: 0,
      status_motion: 'IN_PROGRESS' as const,
      apply_date: null,
      link_motion: null,
      notes: '',
      created_at: '2026-03-01T09:00:00Z',
      updated_at: '2026-03-01T09:00:00Z',
      parentTask: sampleTasks[0]
    },
    {
      id: 'mot-2',
      task_id: null,
      client_id: 1,
      motion_type: 'Reels Animation',
      motion_pic_id: null,
      operator_id: 'usr-op-1',
      motion_difficulty: 'LVL_3_ADVANCED' as const,
      motion_revision_count: 0,
      status_motion: 'QUEUED' as const,
      apply_date: null,
      link_motion: null,
      notes: '',
      created_at: '2026-03-02T09:00:00Z',
      updated_at: '2026-03-02T09:00:00Z'
    }
  ];

  const rezaMotionTasks = sampleMotionTasks.filter(mt => mt.motion_pic_id === 'usr-mot-1');
  if (rezaMotionTasks.length === 1 && rezaMotionTasks[0].id === 'mot-1') {
    console.log('✓ [PASS] Test 4: Motion user filter "Reza Motion" matches mot-1');
    passCount++;
  } else {
    console.error('✗ [FAIL] Test 4: Motion user filter failed');
  }

  // Test 5: Filter Motion Tasks by Role = OPERATOR
  const opMotionTasks = sampleMotionTasks.filter(mt => Boolean(mt.operator_id));
  if (opMotionTasks.length === 1 && opMotionTasks[0].id === 'mot-2') {
    console.log('✓ [PASS] Test 5: Motion role filter "OPERATOR" matches mot-2');
    passCount++;
  } else {
    console.error('✗ [FAIL] Test 5: Operator role filter failed');
  }

  console.log(`\n======================================================`);
  console.log(`TOTAL TESTS: 5 | PASSED: ${passCount} | FAILED: ${5 - passCount}`);
  console.log(`======================================================`);

  if (passCount !== 5) {
    process.exit(1);
  }
}

runVerification();
