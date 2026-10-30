/**
 * AUTOMATED VERIFICATION SUITE: IMAGE UPLOAD AND MODALS ACROSS ALL PIPELINES
 * Verifies:
 * 1. Image buffer magic byte verification (JPEG, PNG, WebP vs malicious SVG/EXE)
 * 2. File size limit enforcement (<= 5MB)
 * 3. Task attachment persistence in store across STRATEGIC, GD_MOCKUP, GD_NON_MOCKUP, MOTION
 * 4. Section separation (brief vs detail)
 * 5. Direct addition and deletion of attachments
 */

import assert from 'assert';
import { 
  verifyImageBufferServerSide, 
  validateImageClientSide, 
  MAX_IMAGE_SIZE_BYTES,
  MAX_SECTION_IMAGES 
} from '../lib/image-upload-utils';
import { 
  createTask, 
  editTask, 
  createStandaloneMotionTask, 
  editStandaloneMotionTask,
  addTaskAttachment,
  removeTaskAttachment,
  getTaskAttachments,
  getTasks,
  getMotionTasks,
  getTaskWithRelations,
  updateStratStatus,
  updateTaskStatus,
  forwardTaskToMotion
} from '../lib/store';
import { extractAttachmentsFromNotes, packAttachmentsIntoNotes } from '../lib/supabase-store';
import { TaskAttachment } from '../lib/types';

console.log('[TEST] Starting Automated Image Upload & Pipeline Modal Verification Suite...\n');

// 1. Test Magic Byte Signature Verification
console.log('1. Testing authoritative server-side magic byte binary verification:');

// Valid JPEG Buffer
const validJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
const jpegResult = verifyImageBufferServerSide(validJpeg, 'sample.jpg');
assert.strictEqual(jpegResult.valid, true, 'Valid JPEG buffer must pass');
assert.strictEqual(jpegResult.mimeType, 'image/jpeg');
console.log('  [PASS] JPEG binary magic bytes correctly identified');

// Valid PNG Buffer
const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
const pngResult = verifyImageBufferServerSide(validPng, 'screenshot.png');
assert.strictEqual(pngResult.valid, true, 'Valid PNG buffer must pass');
assert.strictEqual(pngResult.mimeType, 'image/png');
console.log('  [PASS] PNG binary magic bytes correctly identified');

// Valid WebP Buffer
const validWebp = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x24, 0x00, 0x00, 0x00, // Size
  0x57, 0x45, 0x42, 0x50, // WEBP
  0x56, 0x50, 0x38, 0x20  // VP8
]);
const webpResult = verifyImageBufferServerSide(validWebp, 'banner.webp');
assert.strictEqual(webpResult.valid, true, 'Valid WebP buffer must pass');
assert.strictEqual(webpResult.mimeType, 'image/webp');
console.log('  [PASS] WebP binary magic bytes correctly identified');

// Malicious SVG with disguised extension
const fakeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const fakeSvgResult = verifyImageBufferServerSide(fakeSvg, 'innocent.png');
assert.strictEqual(fakeSvgResult.valid, false, 'Fake SVG disguised as PNG must be rejected');
console.log('  [PASS] Malicious SVG / script disguised as PNG rejected');

// Executable binary disguised as JPG
const fakeExe = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ executable header
const fakeExeResult = verifyImageBufferServerSide(fakeExe, 'photo.jpg');
assert.strictEqual(fakeExeResult.valid, false, 'Executable binary disguised as JPG must be rejected');
console.log('  [PASS] Executable binary disguised as JPG rejected');

// 2. Test File Size Limit Enforcement
console.log('\n2. Testing file size constraints:');
assert.strictEqual(MAX_IMAGE_SIZE_BYTES, 5 * 1024 * 1024, 'Limit must be 5MB');
const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 10);
// Copy valid jpeg header
validJpeg.copy(oversizedBuffer, 0);
const oversizedResult = verifyImageBufferServerSide(oversizedBuffer, 'huge.jpg');
assert.strictEqual(oversizedResult.valid, false, 'Oversized file (>5MB) must be rejected');
assert.ok(oversizedResult.error?.includes('5 MB'), 'Error must specify 5MB limit');
console.log('  [PASS] 5MB max file size strictly enforced on binary verification');

// 3. Test CreativeTask with Attachments in STRATEGIC Pipeline
console.log('\n3. Testing STRATEGIC pipeline task creation & attachment persistence:');
const stratBriefAttachment: TaskAttachment = {
  id: 'att_strat_brief_1',
  url: '/uploads/tasks/strat_brief_1.png',
  name: 'brief_moodboard.png',
  size: 102400,
  type: 'image/png',
  section: 'brief',
  uploaded_at: new Date().toISOString(),
  uploaded_by: 'user-requester'
};

const stratDetailAttachment: TaskAttachment = {
  id: 'att_strat_detail_1',
  url: '/uploads/tasks/strat_detail_1.jpg',
  name: 'specs_reference.jpg',
  size: 204800,
  type: 'image/jpeg',
  section: 'detail',
  uploaded_at: new Date().toISOString(),
  uploaded_by: 'user-requester'
};

const stratTask = createTask({
  client_id: 1,
  campaign_name: 'BAU',
  content_type_id: 1,
  task_source: 'ORCA',
  platform: 'TIKTOK',
  req_qty: 1,
  req_date: '2026-10-20',
  due_date: '2026-10-25',
  pipeline_type: 'STRATEGIC',
  requires_strategic_concept: true,
  strat_pic_id: 'user-strat-1',
  notes: 'Strategic Concept with attachments',
  attachments: [stratBriefAttachment, stratDetailAttachment]
}, 'user-requester');

assert.ok(stratTask.id, 'Task ID should be generated');
assert.strictEqual(stratTask.pipeline_type, 'STRATEGIC');
assert.strictEqual(stratTask.attachments?.length, 2, 'Should persist 2 attachments');

// Verify section separation
const briefPhotos = stratTask.attachments?.filter(a => a.section === 'brief') || [];
const detailPhotos = stratTask.attachments?.filter(a => a.section === 'detail') || [];
assert.strictEqual(briefPhotos.length, 1);
assert.strictEqual(briefPhotos[0].name, 'brief_moodboard.png');
assert.strictEqual(detailPhotos.length, 1);
assert.strictEqual(detailPhotos[0].name, 'specs_reference.jpg');
console.log('  [PASS] STRATEGIC task created with separate brief & detail attachments');

// 4. Test GD_MOCKUP Pipeline with Attachments
console.log('\n4. Testing GD_MOCKUP pipeline attachment persistence:');
const gdMockupTask = createTask({
  client_id: 1,
  campaign_name: 'BAU',
  content_type_id: 1,
  task_source: 'ORCA',
  platform: 'TIKTOK',
  req_qty: 2,
  req_date: '2026-10-20',
  due_date: '2026-10-26',
  pipeline_type: 'GD_MOCKUP',
  is_mockup: true,
  notes: 'GD Mockup Request',
  attachments: [stratDetailAttachment]
}, 'user-requester');

assert.strictEqual(gdMockupTask.is_mockup, true);
assert.strictEqual(gdMockupTask.attachments?.length, 1);
console.log('  [PASS] GD_MOCKUP task created with attachments');

// 5. Test GD_NON_MOCKUP Pipeline with Attachments
console.log('\n5. Testing GD_NON_MOCKUP pipeline attachment persistence:');
const gdNonMockupTask = createTask({
  client_id: 1,
  campaign_name: 'BAU',
  content_type_id: 2,
  task_source: 'ECOMMERCE',
  platform: 'SHOPEE',
  req_qty: 3,
  req_date: '2026-10-20',
  due_date: '2026-10-27',
  pipeline_type: 'GD_NON_MOCKUP',
  is_mockup: false,
  notes: 'Non-mockup banner design',
  attachments: [stratBriefAttachment]
}, 'user-requester');

assert.strictEqual(gdNonMockupTask.is_mockup, false);
assert.strictEqual(gdNonMockupTask.attachments?.length, 1);
console.log('  [PASS] GD_NON_MOCKUP task created with attachments');

// 6. Test MOTION Pipeline with Notes & Attachments
console.log('\n6. Testing MOTION pipeline standalone task with notes & attachments:');
const motionTask = createStandaloneMotionTask({
  client_id: 1,
  platform: 'TIKTOK',
  motion_type: '2D Animation Promo',
  campaign_type: 'BAU',
  motion_difficulty: 'LVL_2_MEDIUM',
  production_date: '2026-10-20',
  period_start: '2026-10-20',
  period_end: '2026-10-27',
  studio: 'Jakarta',
  notes: 'Motion brief guidelines and storyboard notes',
  attachments: [stratBriefAttachment, stratDetailAttachment]
}, 'user-requester');

assert.ok(motionTask.id, 'Motion task ID generated');
assert.strictEqual(motionTask.notes, 'Motion brief guidelines and storyboard notes');
assert.strictEqual(motionTask.attachments?.length, 2);
console.log('  [PASS] MOTION task created with notes and attachments');

// 7. Test Direct Addition & Deletion of Attachments (View Modal / Edit Modal)
console.log('\n7. Testing addTaskAttachment and removeTaskAttachment:');
const newDetailAttachment: TaskAttachment = {
  id: 'att_new_detail_2',
  url: '/uploads/tasks/new_detail_2.webp',
  name: 'additional_spec.webp',
  size: 51200,
  type: 'image/webp',
  section: 'detail',
  uploaded_at: new Date().toISOString(),
  uploaded_by: 'user-admin'
};

// Add attachment to stratTask
addTaskAttachment(stratTask.id, newDetailAttachment);
const updatedStrat = getTasks().find(t => t.id === stratTask.id);
assert.strictEqual(updatedStrat?.attachments?.length, 3, 'Should have 3 attachments after direct add');
assert.ok(updatedStrat?.attachments?.some(a => a.id === 'att_new_detail_2'));
console.log('  [PASS] Successfully added attachment directly to CreativeTask');

// Add attachment to motionTask
addTaskAttachment(motionTask.id, newDetailAttachment);
const updatedMotion = getMotionTasks().find(m => m.id === motionTask.id);
assert.strictEqual(updatedMotion?.attachments?.length, 3, 'Should have 3 attachments in motion task');
console.log('  [PASS] Successfully added attachment directly to MotionTask');

// Remove attachment from stratTask
removeTaskAttachment(stratTask.id, 'att_strat_brief_1');
const afterRemoveStrat = getTasks().find(t => t.id === stratTask.id);
assert.strictEqual(afterRemoveStrat?.attachments?.length, 2, 'Should have 2 attachments after removal');
assert.strictEqual(afterRemoveStrat?.attachments?.some(a => a.id === 'att_strat_brief_1'), false);
console.log('  [PASS] Successfully removed attachment from CreativeTask');

// Remove attachment from motionTask
removeTaskAttachment(motionTask.id, 'att_new_detail_2');
const afterRemoveMotion = getMotionTasks().find(m => m.id === motionTask.id);
assert.strictEqual(afterRemoveMotion?.attachments?.length, 2, 'Should have 2 attachments after removal');
console.log('  [PASS] Successfully removed attachment from MotionTask');

// 8. Test Enriched Task With Relations & Clean Notes Parsing
console.log('\n8. Testing TaskWithRelations & [ATTACHMENTS:...] unpacking:');

const enriched = getTaskWithRelations(stratTask.id);
assert.ok(enriched, 'Enriched task must exist');
assert.strictEqual(enriched?.attachments?.length, 2, 'Enriched task must have 2 attachments');
assert.strictEqual(enriched?.notes?.includes('[ATTACHMENTS:'), false, 'displayNotes must not contain raw [ATTACHMENTS:...] tag');
console.log('  [PASS] getTaskWithRelations correctly extracts attachments and produces clean notes');

// Test packing and extracting
const sampleAtts: TaskAttachment[] = [stratBriefAttachment];
const packed = packAttachmentsIntoNotes('Clean instruction text', sampleAtts);
assert.ok(packed.startsWith('[ATTACHMENTS:'), 'Packed notes must start with [ATTACHMENTS: tag');
assert.ok(packed.includes('Clean instruction text'), 'Packed notes must preserve base text');

const unpacked = extractAttachmentsFromNotes(packed);
assert.strictEqual(unpacked.attachments.length, 1);
assert.strictEqual(unpacked.attachments[0].id, 'att_strat_brief_1');
assert.strictEqual(unpacked.cleanNotes, 'Clean instruction text');
console.log('  [PASS] packAttachmentsIntoNotes and extractAttachmentsFromNotes roundtrip successful');

// 9. Test Cross-Pipeline Stage Handover & Inheritance
console.log('\n9. Testing Cross-Pipeline Stage Handover & Inheritance:');

// Test 9a: Spawned GD Task from Strategic inherits attachments
const parentStrat = createTask({
  client_id: 1,
  campaign_name: 'BAU',
  task_source: 'ORCA',
  platform: 'SHOPEE',
  content_type_id: 1,
  req_qty: 1,
  req_date: '2026-10-20',
  due_date: '2026-11-01',
  pipeline_type: 'STRATEGIC',
  requires_strategic_concept: true,
  strat_pic_id: 'u-strat-ira',
  notes: 'Strategic concept notes',
  attachments: [stratBriefAttachment]
}, 'u-req-sarah');

// Simulate strategic approval spawning a design task
updateStratStatus(parentStrat.id, 'APPROVED', 'u-admin-001');

const allTasks = getTasks();
const spawnedDesignTask = allTasks.find(t => t.source_strategic_task_id === parentStrat.id);
assert.ok(spawnedDesignTask, 'Spawned design task must exist in GD pipeline');
assert.ok(spawnedDesignTask.attachments && spawnedDesignTask.attachments.length > 0, 'Spawned design task must inherit attachments from strategic concept');
assert.strictEqual(spawnedDesignTask.attachments[0].id, 'att_strat_brief_1', 'Inherited attachment must match brief photo');
console.log('  [PASS] Spawned GD Task automatically inherited attachments from Strategic Concept');

// Test 9b: Manual handover to Motion inherits attachments
const gdHandoverTask = createTask({
  client_id: 1,
  campaign_name: 'PAYDAY',
  task_source: 'ORCA',
  platform: 'SHOPEE',
  content_type_id: 1,
  req_qty: 1,
  req_date: '2026-10-20',
  due_date: '2026-11-01',
  pipeline_type: 'GD_MOCKUP',
  is_mockup: true,
  notes: 'GD Mockup notes',
  attachments: [stratBriefAttachment]
}, 'u-req-sarah');

// Approval leaves the request in the source pipeline until explicit forwarding.
updateTaskStatus(gdHandoverTask.id, 'DESIGN_APPROVED', 'u-admin-001');
assert.strictEqual(
  getMotionTasks().some(m => m.task_id === gdHandoverTask.id),
  false,
  'Approval alone must not create a Motion task'
);
forwardTaskToMotion(gdHandoverTask.id, 'u-admin-001');
const motionSubtask = getMotionTasks().find(m => m.task_id === gdHandoverTask.id);
assert.ok(motionSubtask, 'Motion subtask must be created on manual forward');
assert.ok(motionSubtask.attachments && motionSubtask.attachments.length > 0, 'Motion subtask must inherit attachments from GD Mockup task');
assert.strictEqual(motionSubtask.attachments[0].id, 'att_strat_brief_1');
console.log('  [PASS] Manually forwarded Motion Subtask inherited attachments from GD Mockup Task');

console.log('\n[FEATURE] ALL IMAGE UPLOAD AND MODAL TESTS PASSED SUCCESSFULLY! [FEATURE] \n');
process.exit(0);
