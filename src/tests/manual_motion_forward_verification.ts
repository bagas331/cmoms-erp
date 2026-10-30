import assert from 'assert';
import {
  createTask,
  forwardTaskToMotion,
  getMotionTasks,
  getTaskWithRelations,
  getTasks,
  getUsers,
  resetStore,
  updateTaskStatus
} from '../lib/store';
import { extractAttachmentsFromNotes, packAttachmentsIntoNotes } from '../lib/supabase-store';
import { filterTasksByPipeline } from '../lib/pipeline-router';
import { TaskAttachment } from '../lib/types';

resetStore();

const users = getUsers();
const admin = users.find(user => user.role_name === 'ADMIN');
const designer = users.find(user => user.role_name === 'DESIGNER');
assert.ok(admin && designer, 'Seed data must contain an admin and designer');

const attachments: TaskAttachment[] = [
  {
    id: 'brief-image-1',
    url: '/uploads/tasks/brief-image-1.png',
    name: 'brief-image-1.png',
    size: 1200,
    type: 'image/png',
    section: 'brief',
    uploaded_at: '2026-10-21T10:00:00.000Z'
  },
  {
    id: 'brief-image-2',
    url: '/uploads/tasks/brief-image-2.webp',
    name: 'brief-image-2.webp',
    size: 1400,
    type: 'image/webp',
    section: 'brief',
    uploaded_at: '2026-10-21T10:01:00.000Z'
  },
  {
    id: 'detail-file-1',
    url: '/uploads/tasks/detail-file-1.png',
    name: 'detail-file-1.png',
    size: 1800,
    type: 'image/png',
    section: 'detail',
    uploaded_at: '2026-10-21T10:02:00.000Z'
  }
];
const briefNotes = 'Notes Brief: <p>Use the approved layout and keep image order intact.</p>';

const unapprovedTask = createTask({
  client_id: 1,
  campaign_name: 'PAYDAY',
  content_type_id: 1,
  task_source: 'ORCA',
  platform: 'SHOPEE',
  req_qty: 1,
  req_date: '2026-10-20',
  due_date: '2026-10-30',
  requires_strategic_concept: false,
  pipeline_type: 'GD_MOCKUP',
  is_mockup: true,
  notes: briefNotes,
  attachments
}, admin.id);
assert.throws(
  () => forwardTaskToMotion(unapprovedTask.id, designer.id),
  /Approved/,
  'A request that has not been approved must not be forwarded'
);
assert.strictEqual(getMotionTasks().some(motion => motion.task_id === unapprovedTask.id), false);
assert.notStrictEqual(getTasks().find(task => task.id === unapprovedTask.id)?.status_design, 'DESIGN_APPROVED');

function createAndApprove(
  pipeline: 'GD_MOCKUP' | 'GD_NON_MOCKUP',
  contentTypeId: number,
  source: 'ORCA' | 'ECOMMERCE',
  isMockup: boolean,
  storeAttachmentsSeparately = true
) {
  const task = createTask({
    client_id: 1,
    campaign_name: 'PAYDAY',
    content_type_id: contentTypeId,
    task_source: source,
    platform: 'SHOPEE',
    req_qty: 1,
    req_date: '2026-10-20',
    due_date: '2026-10-30',
    requires_strategic_concept: false,
    pipeline_type: pipeline,
    is_mockup: isMockup,
    notes: storeAttachmentsSeparately ? briefNotes : packAttachmentsIntoNotes(briefNotes, attachments),
    ...(storeAttachmentsSeparately ? { attachments } : {})
  }, admin!.id);
  updateTaskStatus(task.id, 'DESIGN_APPROVED', admin!.id);
  return task;
}

const mockupTask = createAndApprove('GD_MOCKUP', 1, 'ORCA', true);
assert.strictEqual(getMotionTasks().some(motion => motion.task_id === mockupTask.id), false);
const approvedMockup = getTaskWithRelations(mockupTask.id);
assert.ok(approvedMockup, 'Approved Mockup request must remain available in the source pipeline');
assert.strictEqual(filterTasksByPipeline([approvedMockup], 'GD_MOCKUP').length, 1);

forwardTaskToMotion(mockupTask.id, designer!.id);
forwardTaskToMotion(mockupTask.id, designer!.id);

let motionTask = getMotionTasks().find(motion => motion.task_id === mockupTask.id);
assert.ok(motionTask, 'Mockup request must appear in Motion after manual forward');
assert.strictEqual(motionTask.status_motion, 'QUEUED');
assert.strictEqual(getMotionTasks().filter(motion => motion.task_id === mockupTask.id).length, 1);
assert.strictEqual(motionTask.attachments?.length, attachments.length);
assert.deepStrictEqual(motionTask.attachments?.map(attachment => attachment.id), attachments.map(attachment => attachment.id));
const transferredBrief = extractAttachmentsFromNotes(motionTask.notes);
assert.strictEqual(transferredBrief.cleanNotes, briefNotes);
assert.deepStrictEqual(transferredBrief.attachments, attachments);

const forwardedMockup = getTaskWithRelations(mockupTask.id);
assert.ok(forwardedMockup);
assert.strictEqual(filterTasksByPipeline([forwardedMockup], 'GD_MOCKUP').length, 0);
assert.strictEqual(filterTasksByPipeline([forwardedMockup], 'MOTION').length, 1);
assert.strictEqual(getTasks().find(task => task.id === mockupTask.id)?.motion_readiness, 'READY_TO_ANIMATE');

const ecommerceTask = createAndApprove('GD_NON_MOCKUP', 2, 'ECOMMERCE', false, false);
const approvedEcommerce = getTaskWithRelations(ecommerceTask.id);
assert.ok(approvedEcommerce);
assert.strictEqual(filterTasksByPipeline([approvedEcommerce], 'GD_NON_MOCKUP').length, 1);
assert.strictEqual(getMotionTasks().some(motion => motion.task_id === ecommerceTask.id), false);

forwardTaskToMotion(ecommerceTask.id, designer!.id);
motionTask = getMotionTasks().find(motion => motion.task_id === ecommerceTask.id);
assert.ok(motionTask, 'E-Commerce request must appear in Motion after manual forward');
assert.strictEqual(motionTask.status_motion, 'QUEUED');
assert.strictEqual(motionTask.attachments?.length, attachments.length);
assert.strictEqual(extractAttachmentsFromNotes(motionTask.notes).cleanNotes, briefNotes);
assert.strictEqual(getMotionTasks().filter(motion => motion.task_id === ecommerceTask.id).length, 1);

const forwardedEcommerce = getTaskWithRelations(ecommerceTask.id);
assert.ok(forwardedEcommerce);
assert.strictEqual(filterTasksByPipeline([forwardedEcommerce], 'GD_NON_MOCKUP').length, 0);
assert.strictEqual(filterTasksByPipeline([forwardedEcommerce], 'MOTION').length, 1);

console.log('PASS: Mockup and E-Commerce approvals remain in Approve until manually forwarded.');
console.log('PASS: Notes Brief, ordered images, attachment sections, Motion queue status, and deduplication persist.');
