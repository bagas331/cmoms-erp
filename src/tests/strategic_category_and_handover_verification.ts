import { 
  createTask, 
  editTask,
  updateStratStatus, 
  getTaskWithRelations,
  getUsers,
  getContentTypes,
  resetStore
} from '../lib/store';
import { handoverStrategicTaskToGD } from '../lib/supabase-store';

async function testStrategicCategoryAndHandover() {
  console.log('[TEST] Starting Strategic Category & Handover Workflow Verification...');
  resetStore();
  const users = getUsers();
  const contentTypes = getContentTypes();
  const requester = users.find(u => u.role_name === 'REQUESTER')!;
  const stratPic = users.find(u => u.role_name === 'STRATEGIC_PIC')!;
  const designer = users.find(u => u.role_name === 'DESIGNER')!;
  const teamLead = users.find(u => u.role_name === 'TEAM_LEAD')!;

  const mockupType = contentTypes.find(ct => ct.id === 1 || ct.name.toLowerCase().includes('mockup'))!;
  const pdpType = contentTypes.find(ct => ct.name.includes('PDP') || ct.id === 3)!;

  // Test Case 1: Strategic task created with Mockup (Orca)
  console.log('\n--- Test 1: Strategic Task with Mockup (Orca) ---');
  const mockupStratTask = createTask({
    client_id: 1,
    campaign_name: 'BAU',
    content_type_id: mockupType.id,
    task_source: 'ORCA',
    is_mockup: true,
    requires_strategic_concept: true,
    pipeline_type: 'STRATEGIC',
    strat_pic_ids: [stratPic.id],
    platform: 'TIKTOK',
    req_qty: 1,
    req_date: '2026-10-23',
    due_date: '2026-10-30',
    notes: 'Brief for mockup task'
  }, requester.id);

  if (mockupStratTask.pipeline_type !== 'STRATEGIC') {
    throw new Error(`Expected STRATEGIC, got ${mockupStratTask.pipeline_type}`);
  }
  if (mockupStratTask.is_mockup !== true) {
    throw new Error(`Expected is_mockup true, got ${mockupStratTask.is_mockup}`);
  }
  if (mockupStratTask.task_source !== 'ORCA') {
    throw new Error(`Expected task_source ORCA, got ${mockupStratTask.task_source}`);
  }
  console.log('[PASS] Strategic Mockup task created with ORCA & is_mockup=true');

  // Approve & Handover Test 1
  updateStratStatus(mockupStratTask.id, 'APPROVED', teamLead.id);
  const targetPipeline1 = mockupStratTask.task_source === 'ECOMMERCE' || mockupStratTask.is_mockup === false ? 'GD_NON_MOCKUP' : 'GD_MOCKUP';
  if (targetPipeline1 !== 'GD_MOCKUP') {
    throw new Error(`Expected auto-detected targetPipeline GD_MOCKUP, got ${targetPipeline1}`);
  }

  const handoverRes1 = await handoverStrategicTaskToGD(mockupStratTask.id, {
    design_pic_id: designer.id,
    design_difficulty: 'HIGH',
    target_pipeline: targetPipeline1,
    due_date: '2026-10-30',
    handover_notes: 'Render high quality mockups'
  }, teamLead.id);

  if (!handoverRes1.success || !handoverRes1.spawnedTask) {
    throw new Error('Handover 1 failed: ' + JSON.stringify(handoverRes1));
  }
  if (handoverRes1.spawnedTask.pipeline_type !== 'GD_MOCKUP') {
    throw new Error(`Expected spawned task in GD_MOCKUP, got ${handoverRes1.spawnedTask.pipeline_type}`);
  }
  if (handoverRes1.spawnedTask.content_type_id !== mockupType.id) {
    throw new Error(`Expected spawned content_type_id ${mockupType.id}, got ${handoverRes1.spawnedTask.content_type_id}`);
  }
  console.log('[PASS] Spawned task correctly routed to GD_MOCKUP with Mockup content type');

  // Test Case 2: Strategic task created with Non Mockup (E-Commerce)
  console.log('\n--- Test 2: Strategic Task with Non Mockup (E-Commerce) ---');
  const ecomStratTask = createTask({
    client_id: 1,
    campaign_name: 'PAYDAY',
    content_type_id: pdpType.id,
    task_source: 'ECOMMERCE',
    is_mockup: false,
    requires_strategic_concept: true,
    pipeline_type: 'STRATEGIC',
    strat_pic_ids: [stratPic.id],
    platform: 'SHOPEE',
    req_qty: 2,
    req_date: '2026-10-23',
    due_date: '2026-10-31',
    notes: 'Brief for non-mockup PDP design'
  }, requester.id);

  if (ecomStratTask.pipeline_type !== 'STRATEGIC') {
    throw new Error(`Expected STRATEGIC, got ${ecomStratTask.pipeline_type}`);
  }
  if (ecomStratTask.is_mockup !== false) {
    throw new Error(`Expected is_mockup false, got ${ecomStratTask.is_mockup}`);
  }
  if (ecomStratTask.task_source !== 'ECOMMERCE') {
    throw new Error(`Expected task_source ECOMMERCE, got ${ecomStratTask.task_source}`);
  }
  if (ecomStratTask.content_type_id !== pdpType.id) {
    throw new Error(`Expected content_type_id ${pdpType.id}, got ${ecomStratTask.content_type_id}`);
  }
  console.log('[PASS] Strategic Non-Mockup task created with ECOMMERCE & is_mockup=false and PDP type');

  // Approve & Handover Test 2
  updateStratStatus(ecomStratTask.id, 'APPROVED', teamLead.id);
  const targetPipeline2 = ecomStratTask.task_source === 'ECOMMERCE' || ecomStratTask.is_mockup === false ? 'GD_NON_MOCKUP' : 'GD_MOCKUP';
  if (targetPipeline2 !== 'GD_NON_MOCKUP') {
    throw new Error(`Expected auto-detected targetPipeline GD_NON_MOCKUP, got ${targetPipeline2}`);
  }

  const handoverRes2 = await handoverStrategicTaskToGD(ecomStratTask.id, {
    design_pic_id: designer.id,
    design_difficulty: 'MEDIUM',
    target_pipeline: targetPipeline2,
    due_date: '2026-10-31',
    handover_notes: 'Create ecommerce banners & PDP'
  }, teamLead.id);

  if (!handoverRes2.success || !handoverRes2.spawnedTask) {
    throw new Error('Handover 2 failed: ' + JSON.stringify(handoverRes2));
  }
  if (handoverRes2.spawnedTask.pipeline_type !== 'GD_NON_MOCKUP') {
    throw new Error(`Expected spawned task in GD_NON_MOCKUP, got ${handoverRes2.spawnedTask.pipeline_type}`);
  }
  if (handoverRes2.spawnedTask.content_type_id !== pdpType.id) {
    throw new Error(`Expected spawned content_type_id ${pdpType.id}, got ${handoverRes2.spawnedTask.content_type_id}`);
  }
  console.log('[PASS] Spawned task correctly routed to GD_NON_MOCKUP preserving PDP content type');

  // Test Case 3: Editing a strategic task from Mockup to Non-Mockup
  console.log('\n--- Test 3: Edit Strategic Task Category ---');
  const stratTaskToEdit = createTask({
    client_id: 1,
    campaign_name: 'BAU',
    content_type_id: mockupType.id,
    task_source: 'ORCA',
    is_mockup: true,
    requires_strategic_concept: true,
    pipeline_type: 'STRATEGIC',
    strat_pic_ids: [stratPic.id],
    platform: 'TIKTOK',
    req_qty: 1,
    req_date: '2026-10-23',
    due_date: '2026-10-30'
  }, requester.id);

  editTask(stratTaskToEdit.id, {
    client_id: 1,
    campaign_name: 'BAU',
    content_type_id: pdpType.id,
    task_source: 'ECOMMERCE',
    is_mockup: false,
    platform: 'TOKOPEDIA',
    req_qty: 1
  }, teamLead.id, 'TEAM_LEAD');

  const reloadedTask = getTaskWithRelations(stratTaskToEdit.id);
  if (!reloadedTask) throw new Error('Task not found after edit');
  if (reloadedTask.task_source !== 'ECOMMERCE' || reloadedTask.is_mockup !== false || reloadedTask.content_type_id !== pdpType.id) {
    throw new Error(`Edit failed: task_source=${reloadedTask.task_source}, is_mockup=${reloadedTask.is_mockup}, content_type=${reloadedTask.content_type_id}`);
  }
  console.log('[PASS] Successfully edited Strategic task from Mockup (Orca) to Non-Mockup (E-Commerce)');

  console.log('\n[SUCCESS] ALL STRATEGIC CATEGORY & HANDOVER VERIFICATIONS PASSED 100%!');
}

testStrategicCategoryAndHandover().catch(err => {
  console.error('[FAIL] Verification failed:', err);
  process.exit(1);
});
