import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  canForwardToMotion,
  filterTasksByPipeline,
  determineTaskPipeline,
} from '../lib/pipeline-router';
import { CreativeTask, TaskWithRelations } from '../lib/types';

function runGDEcommerceSeparationSuite() {
  console.log('====================================================');
  console.log('[TEST] RUNNING GD E-COMMERCE ARCHIVE & MOTION SEPARATION VERIFICATION');
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

  // --- Group 1: Forward to Motion Eligibility ---
  console.log('\n--- Group 1: canForwardToMotion Constraints ---');

  const gdEcommerceApproved: CreativeTask = {
    id: 'ecom-task-1',
    task_code: 'REQ-ECOM-001',
    pipeline_type: 'GD_NON_MOCKUP',
    task_source: 'ECOMMERCE',
    campaign_name: 'Shopee Mega Sale',
    status_design: 'DESIGN_APPROVED',
    is_archived: false,
    client_id: 1,
    created_by: 'user-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
  };

  test('GD E-Commerce approved task CANNOT be forwarded to Motion', () => {
    assert.strictEqual(
      canForwardToMotion(gdEcommerceApproved),
      false,
      'GD E-Commerce task must return false for canForwardToMotion'
    );
  });

  const gdMockupApproved: CreativeTask = {
    id: 'mockup-task-1',
    task_code: 'REQ-MOCKUP-001',
    pipeline_type: 'GD_MOCKUP',
    task_source: 'ORCA',
    campaign_name: 'ORCA Social Mockup',
    status_design: 'DESIGN_APPROVED',
    is_archived: false,
    is_mockup: true,
    client_id: 1,
    created_by: 'user-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
  };

  test('GD Mockup approved task CAN be forwarded to Motion', () => {
    assert.strictEqual(
      canForwardToMotion(gdMockupApproved),
      true,
      'GD Mockup task must return true for canForwardToMotion'
    );
  });

  const strategicApproved: CreativeTask = {
    id: 'strat-task-1',
    task_code: 'REQ-STRAT-001',
    pipeline_type: 'STRATEGIC',
    requires_strategic_concept: true,
    status_design: 'DESIGN_APPROVED',
    status_strat: 'APPROVED',
    is_archived: false,
    client_id: 1,
    created_by: 'user-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
  };

  test('Strategic task CANNOT be forwarded to Motion', () => {
    assert.strictEqual(canForwardToMotion(strategicApproved), false);
  });

  // --- Group 2: GD E-Commerce Active Pipeline vs Archive Behavior (Opsi B) ---
  console.log('\n--- Group 2: GD E-Commerce Opsi B Lifecycle Behavior ---');

  const gdEcomActive: TaskWithRelations = {
    ...gdEcommerceApproved,
    id: 'ecom-active-1',
    status_design: 'DESIGN_IN_PROGRESS',
    client_name: 'Client A',
    content_type_name: 'Banner',
  };

  const gdEcomApprovedCard: TaskWithRelations = {
    ...gdEcommerceApproved,
    id: 'ecom-app-1',
    status_design: 'DESIGN_APPROVED',
    client_name: 'Client A',
    content_type_name: 'Banner',
  };

  const gdEcomRestored: TaskWithRelations = {
    ...gdEcommerceApproved,
    id: 'ecom-res-1',
    status_design: 'DESIGN_APPROVED',
    restored_at: '2026-11-04T10:00:00Z',
    client_name: 'Client A',
    content_type_name: 'Banner',
  };

  test('Active GD E-Commerce task appears on the active board', () => {
    const activeTasks = filterTasksByPipeline([gdEcomActive], 'GD_NON_MOCKUP');
    assert.strictEqual(activeTasks.length, 1);
  });

  test('Newly approved GD E-Commerce task is EXCLUDED from active board (Opsi B)', () => {
    const activeTasks = filterTasksByPipeline([gdEcomApprovedCard], 'GD_NON_MOCKUP');
    assert.strictEqual(activeTasks.length, 0, 'Approved task must leave active board immediately');
  });

  test('Restored approved GD E-Commerce task RE-APPEARS on active board', () => {
    const activeTasks = filterTasksByPipeline([gdEcomRestored], 'GD_NON_MOCKUP');
    assert.strictEqual(activeTasks.length, 1, 'Restored task must appear on active board');
  });

  test('Archived tasks filter includes approved GD E-Commerce tasks for archive view', () => {
    const archiveTasks = filterTasksByPipeline([gdEcomApprovedCard], 'GD_NON_MOCKUP', { includeArchived: true });
    assert.strictEqual(archiveTasks.length, 1, 'Archived filter must include approved tasks');
  });

  // --- Group 3: Exclusion of GD E-Commerce from Motion Pipeline (Opsi B) ---
  console.log('\n--- Group 3: Exclusion from Motion Pipeline ---');

  const ecomWithMotionSubtask: TaskWithRelations = {
    ...gdEcommerceApproved,
    id: 'ecom-mot-1',
    motion_task: {
      id: 'mt-1',
      task_id: 'ecom-mot-1',
      status_motion: 'IN_PROGRESS',
      is_archived: false,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-02T00:00:00Z',
    },
    client_name: 'Client A',
    content_type_name: 'Banner',
  };

  test('filterTasksByPipeline for MOTION excludes GD E-Commerce tasks with motion subtasks', () => {
    const motionBoardTasks = filterTasksByPipeline([ecomWithMotionSubtask], 'MOTION');
    assert.strictEqual(motionBoardTasks.length, 0, 'E-Commerce tasks must be excluded from Motion board');
  });

  const mockupWithMotionSubtask: TaskWithRelations = {
    ...gdMockupApproved,
    id: 'mockup-mot-1',
    motion_task: {
      id: 'mt-2',
      task_id: 'mockup-mot-1',
      status_motion: 'IN_PROGRESS',
      is_archived: false,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-02T00:00:00Z',
    },
    client_name: 'Client B',
    content_type_name: 'Mockup',
  };

  test('filterTasksByPipeline for MOTION includes GD Mockup tasks with motion subtasks', () => {
    const motionBoardTasks = filterTasksByPipeline([mockupWithMotionSubtask], 'MOTION');
    assert.strictEqual(motionBoardTasks.length, 1, 'Mockup motion tasks must be included in Motion board');
  });

  // --- Group 4: UI Code Integrity Checks ---
  console.log('\n--- Group 4: tasks/page.tsx & motion/page.tsx UI Verifications ---');

  test('tasks/page.tsx has Section Switcher Active Pipeline vs Archived Tasks for GD_NON_MOCKUP', () => {
    const tasksPagePath = path.resolve(__dirname, '../app/dashboard/tasks/page.tsx');
    const content = fs.readFileSync(tasksPagePath, 'utf8');
    assert(
      content.includes("activePipeline === 'GD_NON_MOCKUP' && ("),
      "Must contain section switcher condition for GD_NON_MOCKUP"
    );
    assert(
      content.includes("<span>Active Pipeline</span>"),
      "Must contain 'Active Pipeline' tab"
    );
    assert(
      content.includes("<span>Archived Tasks</span>"),
      "Must contain 'Archived Tasks' tab"
    );
  });

  test('motion/page.tsx excludes GD E-Commerce tasks during data enrichment', () => {
    const motionPagePath = path.resolve(__dirname, '../app/dashboard/motion/page.tsx');
    const content = fs.readFileSync(motionPagePath, 'utf8');
    assert(
      content.includes("parent?.pipeline_type === 'GD_NON_MOCKUP' || parent?.task_source === 'ECOMMERCE'"),
      "motion/page.tsx must filter out GD E-Commerce parent tasks"
    );
  });

  test('request-kanban-card.tsx showMotionAction is restricted to GD_MOCKUP', () => {
    const cardPath = path.resolve(__dirname, '../components/request-kanban-card.tsx');
    const content = fs.readFileSync(cardPath, 'utf8');
    assert(
      content.includes("currentPipeline === 'GD_MOCKUP'"),
      "showMotionAction must strictly require currentPipeline === 'GD_MOCKUP'"
    );
    assert(
      content.includes("task.pipeline_type !== 'GD_NON_MOCKUP'"),
      "showMotionAction must exclude GD_NON_MOCKUP"
    );
  });

  console.log(`\n====================================================`);
  console.log(`VERIFICATION RESULTS: ${passed}/${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log(`====================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runGDEcommerceSeparationSuite();

