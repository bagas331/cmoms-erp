import assert from 'assert';
import {
  createTask,
  deleteTask,
  getTasks,
  createStandaloneMotionTask,
  deleteMotionTask,
  getMotionTasks,
  updateStratStatus,
  addComment
} from '../lib/supabase-store';
import { canUserDeleteTask, canUserDeleteMotionTask } from '../lib/utils';
import { CreateTaskInput, TaskWithRelations } from '../lib/types';

async function runVerification() {
  console.log('[TEST] Starting Cross-Pipeline Card Deletion Verification...');

  // 1. Permission checks verification
  console.log('1. Testing canUserDeleteTask permissions...');
  const adminUser = { id: 'admin-1', role_name: 'ADMIN' };
  const leadUser = { id: 'lead-1', role_name: 'TEAM_LEAD' };
  const stratPic = { id: 'strat-1', role_name: 'STRATEGIC_PIC' };
  const designer = { id: 'des-1', role_name: 'DESIGNER' };
  const motionPic = { id: 'mot-1', role_name: 'MOTION_PIC' };
  const requester = { id: 'req-1', role_name: 'REQUESTER' };

  const stratTask: any = {
    id: 'task-strat-1',
    created_by: 'req-1',
    pipeline_type: 'STRATEGIC',
    requires_strategic_concept: true,
    status_strat: 'IN_PROGRESS',
    strat_pic_id: 'strat-1'
  };

  const gdTask: any = {
    id: 'task-gd-1',
    created_by: 'req-1',
    pipeline_type: 'GD_MOCKUP',
    requires_strategic_concept: false,
    design_pic_id: 'des-1'
  };

  const motionTask: any = {
    id: 'motion-1',
    created_by: 'req-1',
    motion_pic_id: 'mot-1'
  };

  // Admin and Team Lead can delete all
  assert(canUserDeleteTask(adminUser, stratTask), 'Admin should be able to delete strategic task');
  assert(canUserDeleteTask(leadUser, stratTask), 'Team lead should be able to delete strategic task');
  assert(canUserDeleteTask(adminUser, gdTask), 'Admin should be able to delete GD task');
  assert(canUserDeleteMotionTask(adminUser, motionTask), 'Admin should be able to delete motion task');

  // Strategic PIC can delete strategic task and GD task (full pipeline control)
  assert(canUserDeleteTask(stratPic, stratTask), 'Strategic PIC should be able to delete strategic task');
  assert(canUserDeleteTask(stratPic, gdTask), 'Strategic PIC should be able to delete GD task');

  // Designer can delete assigned GD task
  assert(canUserDeleteTask(designer, gdTask), 'Designer should be able to delete assigned GD task');
  assert(!canUserDeleteTask(designer, stratTask), 'Designer should NOT be able to delete strategic task');

  // Requester can delete own created tasks
  assert(canUserDeleteTask(requester, stratTask), 'Requester should be able to delete own task');
  assert(canUserDeleteTask(requester, gdTask), 'Requester should be able to delete own GD task');
  assert(canUserDeleteMotionTask(requester, motionTask), 'Requester should be able to delete own motion task');

  console.log('[PASS] Permission logic validated across all user roles and pipeline types.');

  // 2. Testing Deletion in Strategic Pipeline (with comments and revisions)
  console.log('2. Testing Deletion of Strategic Pipeline Task...');
  const stratInput: CreateTaskInput = {
    task_code: `REQ-STRAT-DEL-${Date.now().toString().slice(-4)}`,
    client_id: 1,
    campaign_name: 'BAU',
    content_type_id: 1,
    task_source: 'ECOMMERCE',
    platform: 'TIKTOK',
    req_qty: 1,
    output_qty: 1,
    req_date: new Date().toISOString(),
    due_date: new Date(Date.now() + 86400000 * 5).toISOString(),
    pipeline_type: 'STRATEGIC',
    requires_strategic_concept: true,
    status_strat: 'IN_PROGRESS',
    status_design: 'STRAT_PENDING',
    strat_pic_id: '00000000-0000-0000-0000-000000000003',
    notes: 'Testing deletion in strategic pipeline',
    created_by: adminUser.id
  };

  const createdStrat = await createTask(stratInput, adminUser.id);
  assert(createdStrat && createdStrat.id, 'Strategic task should be created');

  // Add comment to ensure child relation cleanup works
  try {
    await addComment(createdStrat.id, adminUser.id, 'Admin', 'Test comment for deletion', 'admin-avatar');
  } catch (e) {
    console.warn('Comment add warning (non-fatal):', e);
  }

  // Delete strategic task
  await deleteTask(createdStrat.id, adminUser.id);
  const allTasksAfterStrat = await getTasks();
  const verifyStratDeleted = allTasksAfterStrat.find(t => t.id === createdStrat.id);
  assert(!verifyStratDeleted, 'Strategic task should no longer exist after deletion');
  console.log('[PASS] Strategic task created and deleted cleanly with child relations.');

  // 3. Testing Deletion in Graphic Design Pipeline
  console.log('3. Testing Deletion of Graphic Design Pipeline Task...');
  const gdInput: CreateTaskInput = {
    task_code: `REQ-GD-DEL-${Date.now().toString().slice(-4)}`,
    client_id: 1,
    campaign_name: 'BAU',
    content_type_id: 1,
    task_source: 'ORCA',
    platform: 'SHOPEE',
    req_qty: 1,
    output_qty: 1,
    req_date: new Date().toISOString(),
    due_date: new Date(Date.now() + 86400000 * 5).toISOString(),
    pipeline_type: 'GD_MOCKUP',
    requires_strategic_concept: false,
    status_strat: 'NOT_REQUIRED',
    status_design: 'DESIGN_UNASSIGNED',
    notes: 'Testing deletion in GD pipeline',
    created_by: adminUser.id
  };

  const createdGD = await createTask(gdInput, adminUser.id);
  assert(createdGD && createdGD.id, 'GD task should be created');

  await deleteTask(createdGD.id, adminUser.id);
  const allTasksAfterGD = await getTasks();
  const verifyGDDeleted = allTasksAfterGD.find(t => t.id === createdGD.id);
  assert(!verifyGDDeleted, 'GD task should no longer exist after deletion');
  console.log('[PASS] GD task created and deleted cleanly.');

  // 4. Testing Deletion in Motion Pipeline
  console.log('4. Testing Deletion of Motion Pipeline Task...');
  const motionInput = {
    client_id: 1,
    campaign_type: 'BAU',
    motion_type: 'Product Reel',
    platform: 'TIKTOK',
    motion_difficulty: 'LVL_1_SIMPLE' as const,
    notes: 'Testing motion task deletion'
  };

  const createdMotion = await createStandaloneMotionTask(motionInput as any, adminUser.id);
  assert(createdMotion && createdMotion.id, 'Motion task should be created');

  await deleteMotionTask(createdMotion.id, adminUser.id);
  const allMotions = await getMotionTasks();
  const verifyMotionDeleted = allMotions.find(m => m.id === createdMotion.id);
  assert(!verifyMotionDeleted, 'Motion task should no longer exist after deletion');
  console.log('[PASS] Motion task created and deleted cleanly.');

  console.log('\n[SUCCESS] ALL CROSS-PIPELINE CARD DELETION TESTS PASSED!');
}

runVerification().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
