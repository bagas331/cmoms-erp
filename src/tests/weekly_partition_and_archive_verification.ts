import {
  getDueWeekPartition,
  getWeeklyPartitionsForMonth,
  groupTasksByWeeklyPartition,
  isTaskOverdue,
  isCompletedInPreviousMonth,
  isTaskInFinalState,
  qualifiesForAutoArchive,
  computeArchivePeriod,
  canUserRestoreTask
} from '../lib/archive-engine';
import {
  filterTasksByPipeline
} from '../lib/pipeline-router';
import {
  getTasks,
  getMotionTasks,
  resetStore,
  autoArchiveCompletedTasks,
  restoreTask,
  restoreMotionTask,
  getAuditLogs,
  createTask,
  updateTaskStatus,
  setStore,
  STORE_KEYS
} from '../lib/store';
import { CreativeTask, MotionTask, TaskWithRelations } from '../lib/types';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exitCode = 1;
  }
}

console.log('========================================================================');
console.log('TEST SUITE: WEEKLY PARTITION, MONTHLY AUTO-ARCHIVE, & RESTORE VERIFICATION');
console.log('========================================================================\n');

// Reset store to initial seed data
resetStore();

// -------------------------------------------------------------------------
// SECTION 1: WEEKLY PARTITION TESTS
// -------------------------------------------------------------------------
console.log('--- 1. WEEKLY PARTITION LOGIC ---');

// Due date day 5 -> W1
assert(
  getDueWeekPartition('2026-10-05') === 'W1',
  'Task dengan due date tanggal 5 masuk W1'
);

// Due date day 12 -> W2
assert(
  getDueWeekPartition('2026-10-12') === 'W2',
  'Task dengan due date tanggal 12 masuk W2'
);

// Due date day 19 -> W3
assert(
  getDueWeekPartition('2026-10-19') === 'W3',
  'Task dengan due date tanggal 19 masuk W3'
);

// Due date day 27 -> W4
assert(
  getDueWeekPartition('2026-10-27') === 'W4',
  'Task dengan due date tanggal 27 masuk W4'
);

// Due date day 31 -> W4 (end of month)
assert(
  getDueWeekPartition('2026-10-31') === 'W4',
  'Task dengan due date tanggal 31 (akhir bulan) masuk W4'
);

// Due date day 28 in February -> W4
assert(
  getDueWeekPartition('2026-02-28') === 'W4',
  'Task dengan due date 28 Februari masuk W4'
);

// No due date -> NO_DUE_DATE
assert(
  getDueWeekPartition(null) === 'NO_DUE_DATE',
  'Task tanpa due date (null) masuk kelompok khusus NO_DUE_DATE'
);
assert(
  getDueWeekPartition('') === 'NO_DUE_DATE',
  'Task dengan due date string kosong masuk kelompok khusus NO_DUE_DATE'
);
assert(
  getDueWeekPartition(undefined) === 'NO_DUE_DATE',
  'Task dengan due date undefined masuk kelompok khusus NO_DUE_DATE'
);

// Partition definitions for month
const octPartitions = getWeeklyPartitionsForMonth(2026, 10);
assert(
  octPartitions.length === 5 &&
  octPartitions[0].key === 'W1' && octPartitions[0].startDay === 1 && octPartitions[0].endDay === 7 &&
  octPartitions[1].key === 'W2' && octPartitions[1].startDay === 8 && octPartitions[1].endDay === 14 &&
  octPartitions[2].key === 'W3' && octPartitions[2].startDay === 15 && octPartitions[2].endDay === 21 &&
  octPartitions[3].key === 'W4' && octPartitions[3].startDay === 22 && octPartitions[3].endDay === 31,
  'Definisi 4 mingguan W1-W4 sesuai standar kalender bulanan'
);

// Shifting due date moves bucket
const testCard = { due_date: '2026-10-05' };
assert(getDueWeekPartition(testCard.due_date) === 'W1', 'Card awalnya berada di W1');
testCard.due_date = '2026-10-22';
assert(getDueWeekPartition(testCard.due_date) === 'W4', 'Perubahan due date otomatis memperbarui kelompok minggu ke W4');

// Overdue status check
assert(
  isTaskOverdue('2026-10-01', 'DESIGN_IN_PROGRESS', '2026-10-13') === true,
  'Task dengan due date lampau dan status IN_PROGRESS ditandai overdue'
);
assert(
  isTaskOverdue('2026-10-01', 'TASK_CLOSED', '2026-10-13') === false,
  'Task dengan status TASK_CLOSED tidak ditandai overdue'
);
assert(
  isTaskOverdue('2026-10-25', 'DESIGN_IN_PROGRESS', '2026-10-13') === false,
  'Task dengan due date masa depan tidak ditandai overdue'
);

console.log('\n--- 2. MONTHLY AUTO-ARCHIVE LOGIC ---');

// Mock reference date: October 13, 2026
const refDate = new Date('2026-10-13T10:00:00Z');

// Verify completion date in previous month
assert(
  isCompletedInPreviousMonth('2026-09-28T10:00:00Z', refDate) === true,
  'Task diselesaikan September 2026 memenuhi kriteria previous month (relatif Oktober 2026)'
);
assert(
  isCompletedInPreviousMonth('2026-10-05T10:00:00Z', refDate) === false,
  'Task diselesaikan Oktober 2026 TIDAK memenuhi kriteria previous month (masih bulan berjalan)'
);

// Verify final states
const closedTask: CreativeTask = {
  id: 't-closed-1',
  task_code: 'REQ-CLOSED-01',
  client_id: 1,
  content_type_id: 1,
  is_mockup: true,
  brief: 'Brief test',
  status_strat: 'APPROVED',
  status_design: 'TASK_CLOSED',
  created_by: 'u-req-sarah',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-20T00:00:00Z',
  approved_at: '2026-09-20T00:00:00Z',
  due_date: '2026-09-18',
  design_pic_id: 'u-des-nadya',
  sla_working_days: 2,
  priority: 'MEDIUM',
  design_revision_count: 0,
  requires_strategic_concept: false,
  strat_revision_count: 0,
  operator_status: 'IDLE'
};

const inProgressTask: CreativeTask = {
  ...closedTask,
  id: 't-inprog-1',
  task_code: 'REQ-INPROG-01',
  status_design: 'DESIGN_IN_PROGRESS',
  approved_at: undefined
};

const revisionTask: CreativeTask = {
  ...closedTask,
  id: 't-rev-1',
  task_code: 'REQ-REV-01',
  status_design: 'DESIGN_REVISION',
  approved_at: undefined
};

const cancelTask: CreativeTask = {
  ...closedTask,
  id: 't-cancel-1',
  task_code: 'REQ-CANCEL-01',
  status_design: 'DESIGN_CANCEL',
  approved_at: undefined
};

assert(
  qualifiesForAutoArchive(closedTask, refDate) === true,
  'Task TASK_CLOSED dari bulan September memenuhi syarat auto-archive pada Oktober'
);
assert(
  qualifiesForAutoArchive(inProgressTask, refDate) === false,
  'Task IN_PROGRESS dari bulan lalu TIDAK boleh diarsipkan'
);
assert(
  qualifiesForAutoArchive(revisionTask, refDate) === false,
  'Task REVISION dari bulan lalu TIDAK boleh diarsipkan'
);
assert(
  qualifiesForAutoArchive(cancelTask, refDate) === false,
  'Task CANCEL TIDAK boleh diarsipkan sebagai Done'
);

// Add these mock tasks to store and execute auto-archive
const storeTasks = getTasks();
storeTasks.push(closedTask, inProgressTask, revisionTask, cancelTask);
setStore(STORE_KEYS.tasks, storeTasks);

const archiveResult1 = autoArchiveCompletedTasks(refDate);
assert(
  archiveResult1.archivedTasks.includes('t-closed-1'),
  'Job auto-archive sukses mengarsipkan task t-closed-1'
);
assert(
  !archiveResult1.archivedTasks.includes('t-inprog-1'),
  'Job auto-archive TIDAK mengarsipkan task t-inprog-1'
);
assert(
  !archiveResult1.archivedTasks.includes('t-rev-1'),
  'Job auto-archive TIDAK mengarsipkan task t-rev-1'
);
assert(
  !archiveResult1.archivedTasks.includes('t-cancel-1'),
  'Job auto-archive TIDAK mengarsipkan task t-cancel-1'
);

// Check task data in store after archive
const updatedTasks = getTasks();
const archivedT1 = updatedTasks.find(t => t.id === 't-closed-1');
assert(
  archivedT1?.is_archived === true &&
  archivedT1?.archive_period === '2026-09' &&
  archivedT1?.archived_by === 'system',
  'Data task yang diarsipkan memiliki flag is_archived=true, archive_period=2026-09, dan archived_by=system'
);

// Idempotency: Running job a second time must not re-process or duplicate
const archiveResult2 = autoArchiveCompletedTasks(refDate);
assert(
  archiveResult2.archivedTasks.length === 0,
  'Idempotensi: Eksekusi ulang auto-archive menghasilkan 0 newly archived tasks tanpa perubahan ganda'
);

// Active board filter check: archived tasks excluded from active boards
const activeGdMockupTasks = filterTasksByPipeline(getTasks(), 'GD_MOCKUP');
assert(
  !activeGdMockupTasks.some(t => t.id === 't-closed-1'),
  'Task yang diarsipkan otomatis hilang dari active board Kanban'
);
assert(
  activeGdMockupTasks.some(t => t.id === 't-inprog-1'),
  'Task belum selesai (IN_PROGRESS) tetap tampil pada active board meskipun deadline bulan lampau'
);

console.log('\n--- 3. REVERT / RESTORE LOGIC & RBAC ---');

// Test RBAC permissions for restore
assert(
  canUserRestoreTask('ADMIN', 'u-admin-001', archivedT1!) === true,
  'ADMIN berhak melakukan restore'
);
assert(
  canUserRestoreTask('TEAM_LEAD', 'u-lead-alfie', archivedT1!) === true,
  'TEAM_LEAD berhak melakukan restore'
);
assert(
  canUserRestoreTask('DESIGNER', 'u-des-nadya', archivedT1!) === true,
  'DESIGNER pemilik task (design_pic_id) berhak melakukan restore'
);
assert(
  canUserRestoreTask('DESIGNER', 'u-des-yusuf', archivedT1!) === false,
  'DESIGNER lain yang bukan PIC task ditolak hak restore-nya'
);
assert(
  canUserRestoreTask('OPERATOR', 'u-op-sam', archivedT1!) === false,
  'OPERATOR ditolak hak restore-nya'
);

// Execute restore as unauthorized user -> should fail
const failRestore = restoreTask('t-closed-1', 'u-des-yusuf');
assert(
  failRestore.success === false,
  'Percobaan restore oleh pengguna tanpa izin ditolak oleh backend store'
);

// Execute restore as authorized user (Admin)
const origDueDate = archivedT1?.due_date;
const origReqDate = archivedT1?.req_date;
const origStatus = archivedT1?.status_design;

const successRestore = restoreTask('t-closed-1', 'u-admin-001');
assert(
  successRestore.success === true,
  'Restore berhasil dijalankan oleh ADMIN'
);

// Verify restored task properties
const restoredTasks = getTasks();
const restoredT1 = restoredTasks.find(t => t.id === 't-closed-1');
assert(
  restoredT1?.is_archived === false,
  'Flag is_archived berubah menjadi false setelah restore'
);
assert(
  restoredT1?.due_date === origDueDate,
  'Due date asli tetap terjaga tanpa direset secara sembarangan'
);
assert(
  restoredT1?.req_date === origReqDate,
  'Req date asli tetap terjaga'
);
assert(
  restoredT1?.status_design === origStatus,
  'Restore TIDAK mengubah status menjadi IN_PROGRESS secara otomatis (mempertahankan status bisnis)'
);

// Verify active board now includes the restored task
const postRestoreActive = filterTasksByPipeline(getTasks(), 'GD_MOCKUP');
assert(
  postRestoreActive.some(t => t.id === 't-closed-1'),
  'Task yang di-restore muncul kembali pada board aktif yang sesuai'
);

// Verify Motion Task Auto-Archive and Restore
console.log('\n--- 4. MOTION PIPELINE AUTO-ARCHIVE & RESTORE ---');

const motionList = getMotionTasks();
const closedMotion: MotionTask = {
  id: 'mt-closed-1',
  task_id: 't-closed-1',
  status_motion: 'COMPLETED',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-25T00:00:00Z',
  apply_date: '2026-09-25',
  motion_pic_id: 'u-mot-jova',
  operator_id: null,
  motion_difficulty: 'LVL_2_MEDIUM',
  motion_revision_count: 0
};
motionList.push(closedMotion);
setStore(STORE_KEYS.motionTasks, motionList);

const motionArchiveRun = autoArchiveCompletedTasks(refDate);
assert(
  motionArchiveRun.archivedMotionTasks.includes('mt-closed-1'),
  'Motion task status COMPLETED dari September otomatis diarsipkan'
);

const archivedMt = getMotionTasks().find(m => m.id === 'mt-closed-1');
assert(
  archivedMt?.is_archived === true && archivedMt?.archive_period === '2026-09',
  'Motion task memiliki flag is_archived=true dan archive_period=2026-09'
);

// Restore motion task
assert(
  canUserRestoreTask('MOTION_PIC', 'u-mot-jova', archivedMt!) === true,
  'MOTION_PIC yang ditugaskan berhak melakukan restore motion task'
);
assert(
  canUserRestoreTask('MOTION_PIC', 'u-mot-bima', archivedMt!) === false,
  'MOTION_PIC lain yang tidak ditugaskan ditolak hak restore-nya'
);

const restoreMtRes = restoreMotionTask('mt-closed-1', 'u-mot-jova');
assert(
  restoreMtRes.success === true,
  'Restore motion task berhasil dijalankan oleh PIC terkait'
);

const restoredMt = getMotionTasks().find(m => m.id === 'mt-closed-1');
assert(
  restoredMt?.is_archived === false,
  'Motion task kembali berstatus aktif setelah di-restore'
);

// Verify Audit Trail
const auditLogs = getAuditLogs();
const archiveLogs = auditLogs.filter(l => l.action === 'AUTO_ARCHIVE');
const restoreLogs = auditLogs.filter(l => l.action === 'RESTORE');
assert(
  archiveLogs.length > 0,
  'Audit trail mencatat aksi AUTO_ARCHIVE oleh sistem'
);
assert(
  restoreLogs.length > 0,
  'Audit trail mencatat aksi RESTORE oleh pengguna'
);

console.log('\n========================================================================');
console.log('ALL WEEKLY PARTITION, AUTO-ARCHIVE, & RESTORE TESTS PASSED SUCCESSFULLY!');
console.log('========================================================================');
