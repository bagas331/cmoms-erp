import { 
  createTask, 
  updateStratStatus, 
  getTaskWithRelations,
  getUsers,
  resetStore
} from '../lib/store';
import { handoverStrategicTaskToGD } from '../lib/supabase-store';

async function runStrategicHandoverVerification() {
  console.log('[TEST] Starting Strategic Handover to GD Verification...');
  resetStore();
  const users = getUsers();
  const requester = users.find(u => u.role_name === 'REQUESTER')!;
  const stratPic = users.find(u => u.role_name === 'STRATEGIC_PIC')!;
  const designer = users.find(u => u.role_name === 'DESIGNER')!;
  const designer2 = users.filter(u => u.role_name === 'DESIGNER')[1] || designer;
  const teamLead = users.find(u => u.role_name === 'TEAM_LEAD')!;

  // 1. Create a dummy strategic task with Strategic PIC
  const stratTask = await createTask({
    title: 'Test Strategic Handover to GD',
    brand_id: 'brand-1',
    pipeline_type: 'STRATEGIC',
    status_strat: 'IN_REVIEW',
    task_source: 'REGULAR',
    strat_pic_ids: [stratPic.id],
    notes: 'Strategic concept ready for handover verification'
  }, requester.id);

  console.log('[PASS] Created strategic task:', stratTask.task_code, 'ID:', stratTask.id);

  // 2. Approve concept
  await updateStratStatus(stratTask.id, 'APPROVED', teamLead.id);
  const approvedTask = await getTaskWithRelations(stratTask.id);
  if (!approvedTask || approvedTask.status_strat !== 'APPROVED') {
    throw new Error('Expected task to be APPROVED');
  }
  console.log('[PASS] Strategic task status is APPROVED');

  // 3. Test handoverStrategicTaskToGD
  const handoverResult = await handoverStrategicTaskToGD(stratTask.id, {
    design_pic_id: designer.id,
    design_difficulty: 'HIGH',
    target_pipeline: 'GD_MOCKUP',
    due_date: '2026-10-30',
    handover_notes: 'Please focus on vibrant rendering and smooth mockup.'
  }, teamLead.id);

  if (!handoverResult.success || !handoverResult.spawnedTask) {
    throw new Error('Handover failed: ' + JSON.stringify(handoverResult));
  }

  const spawned = handoverResult.spawnedTask;
  console.log('[PASS] Spawned design task:', spawned.task_code, 'ID:', spawned.id);

  if (spawned.pipeline_type !== 'GD_MOCKUP') {
    throw new Error(`Expected pipeline_type GD_MOCKUP, got ${spawned.pipeline_type}`);
  }
  if (spawned.design_pic_id !== designer.id) {
    throw new Error(`Expected design_pic_id ${designer.id}, got ${spawned.design_pic_id}`);
  }
  if (spawned.status_design !== 'DESIGN_ASSIGNED') {
    throw new Error(`Expected status_design DESIGN_ASSIGNED, got ${spawned.status_design}`);
  }
  if (spawned.design_difficulty !== 'HIGH') {
    throw new Error(`Expected design_difficulty HIGH, got ${spawned.design_difficulty}`);
  }
  if (spawned.source_strategic_task_id !== stratTask.id) {
    throw new Error(`Expected source_strategic_task_id to match strategic task ID`);
  }

  // 4. Verify original strategic task is linked
  const updatedStrat = await getTaskWithRelations(stratTask.id);
  if (!updatedStrat || updatedStrat.spawned_design_task_id !== spawned.id) {
    throw new Error(`Expected updatedStrat.spawned_design_task_id to be ${spawned.id}`);
  }
  if (updatedStrat.design_pic_id !== designer.id) {
    throw new Error(`Expected updatedStrat.design_pic_id to be ${designer.id}`);
  }

  console.log('[PASS] Linkage verified in both directions!');

  // 5. Test updating GD PIC via second handover call (re-assignment)
  const reassignResult = await handoverStrategicTaskToGD(stratTask.id, {
    design_pic_id: designer2.id,
    design_difficulty: 'MEDIUM',
    target_pipeline: 'GD_MOCKUP'
  }, teamLead.id);

  const reloadedSpawned = await getTaskWithRelations(spawned.id);
  if (reloadedSpawned?.design_pic_id !== designer2.id) {
    throw new Error(`Expected re-assigned design_pic_id to be ${designer2.id}, got ${reloadedSpawned?.design_pic_id}`);
  }
  console.log('[PASS] Re-assigning GD PIC verified successfully!');

  console.log('[SUCCESS] Strategic Handover to GD Verification Passed 100%!');
}

runStrategicHandoverVerification().catch(err => {
  console.error('[FAIL] Verification failed:', err);
  process.exit(1);
});
