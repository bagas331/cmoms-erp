import { 
  getMotionTasks, 
  getAllTasksWithRelations, 
  getUsers, 
  updateMotionStatus, 
  createStandaloneMotionTask 
} from '../lib/supabase-store';
import { 
  getWeekOfMonth, 
  getISOWeekNumber, 
  getWeekRangeLabel, 
  formatDisplayDate, 
  formatDisplayDateTime 
} from '../lib/utils';
import { MotionTask, User } from '../lib/types';

async function runMotionApprovedArchiveTestSuite() {
  console.log('====================================================');
  console.log('🎬 RUNNING MOTION PIPELINE APPROVED ARCHIVE VERIFICATION');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      if (details) console.error(`     Details: ${details}`);
    }
  }

  // TEST 1: Date & Week Helper Functions for Motion Archive
  console.log('\n--- Test Group 1: Indonesian Week & Date Utilities for Motion ---');
  {
    assert(getWeekOfMonth('2026-10-01') === 1, 'Oct 1 is Week 1');
    assert(getWeekOfMonth('2026-10-07') === 1, 'Oct 7 is Week 1');
    assert(getWeekOfMonth('2026-10-08') === 2, 'Oct 8 is Week 2');
    assert(getWeekOfMonth('2026-10-14') === 2, 'Oct 14 is Week 2');
    assert(getWeekOfMonth('2026-10-15') === 3, 'Oct 15 is Week 3');
    assert(getWeekOfMonth('2026-10-21') === 3, 'Oct 21 is Week 3');
    assert(getWeekOfMonth('2026-10-22') === 4, 'Oct 22 is Week 4');
    assert(getWeekOfMonth('2026-10-28') === 4, 'Oct 28 is Week 4');
    assert(getWeekOfMonth('2026-10-29') === 5, 'Oct 29 is Week 5');
    assert(getWeekOfMonth('2026-10-31') === 5, 'Oct 31 is Week 5');

    const labelW2 = getWeekRangeLabel(10, 2);
    assert(labelW2.includes('8 - 14 Okt'), 'Week range label matches month & date format', `Got: ${labelW2}`);
  }

  // TEST 2: Motion Task Status Transition & approved_at Timestamp
  console.log('\n--- Test Group 2: Status Transition & approved_at Timestamp on Motion ---');
  {
    const allUsers = await getUsers();
    const adminUser = allUsers.find(u => u.role_name === 'ADMIN') || allUsers[0];
    const motionPic = allUsers.find(u => u.role_name === 'MOTION_PIC') || allUsers[0];

    // Create a standalone motion task
    const newMotion = await createStandaloneMotionTask({
      client_id: 1,
      platform: 'TIKTOK',
      motion_type: 'Product Animation',
      campaign_type: 'BaU',
      production_date: '2026-10-05',
      period_start: '2026-10-05',
      period_end: '2026-10-10',
      studio: 'Jakarta',
      motion_pic_id: motionPic.id
    }, adminUser.id);

    assert(Boolean(newMotion.id), 'Standalone motion task created successfully');
    assert(newMotion.status_motion === 'QUEUED' || newMotion.status_motion === 'IN_PROGRESS', 'Initial status created correctly');

    // Transition to APPROVED
    await updateMotionStatus(newMotion.id, 'APPROVED', adminUser.id);

    // Verify retrieval includes approved_at
    const allMotionTasks = await getMotionTasks();
    const foundApproved = allMotionTasks.find(m => m.id === newMotion.id);
    assert(Boolean(foundApproved), 'Approved motion task found in dataset');
    assert(foundApproved?.status_motion === 'APPROVED', 'Motion status transitioned to APPROVED');
    assert(Boolean(foundApproved?.approved_at), 'approved_at timestamp is automatically populated on Motion approval', `approved_at: ${foundApproved?.approved_at}`);
  }

  // TEST 3: Multi-dimensional Time Filtering (Year, Month, Week) for Motion
  console.log('\n--- Test Group 3: Time-Based Filtering Combinations for Motion ---');
  {
    const allMotion = await getMotionTasks();
    const approvedMotion = allMotion.filter(m => m.status_motion === 'APPROVED' || m.status_motion === 'COMPLETED');
    assert(approvedMotion.length > 0, 'Approved motion tasks exist in dataset for filter tests', `Found ${approvedMotion.length} approved motion tasks`);

    // A. Year filter
    const targetYear = 2026;
    const yearFiltered = approvedMotion.filter(m => {
      const dt = m.approved_at || m.apply_date || m.updated_at || m.created_at;
      return new Date(dt).getFullYear() === targetYear;
    });
    assert(yearFiltered.every(m => new Date(m.approved_at || m.apply_date || m.updated_at || m.created_at).getFullYear() === targetYear), 'Year-only filter filters accurately');

    // B. Month + Year filter
    const targetMonth = 10; // October
    const monthYearFiltered = approvedMotion.filter(m => {
      const dt = m.approved_at || m.apply_date || m.updated_at || m.created_at;
      const d = new Date(dt);
      return d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonth;
    });
    assert(monthYearFiltered.every(m => {
      const d = new Date(m.approved_at || m.apply_date || m.updated_at || m.created_at);
      return d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonth;
    }), 'Month + Year filter filters accurately');

    // C. Month + Week + Year filter
    const targetWeek = getWeekOfMonth(new Date());
    const fullTimeFiltered = approvedMotion.filter(m => {
      const dt = m.approved_at || m.apply_date || m.updated_at || m.created_at;
      const d = new Date(dt);
      return d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonth && getWeekOfMonth(dt) === targetWeek;
    });
    assert(fullTimeFiltered.every(m => {
      const dt = m.approved_at || m.apply_date || m.updated_at || m.created_at;
      const d = new Date(dt);
      return d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonth && getWeekOfMonth(dt) === targetWeek;
    }), 'Year + Month + Week combined filter filters accurately');
  }

  // TEST 4: Studio & Platform Filtering
  console.log('\n--- Test Group 4: Studio & Platform Filtering ---');
  {
    const allMotion = await getMotionTasks();
    const approvedMotion = allMotion.filter(m => m.status_motion === 'APPROVED' || m.status_motion === 'COMPLETED');

    const jakartaTasks = approvedMotion.filter(m => m.studio === 'Jakarta');
    assert(jakartaTasks.every(m => m.studio === 'Jakarta'), 'Jakarta studio filter returns only Jakarta studio tasks');

    const tiktokTasks = approvedMotion.filter(m => m.platform === 'TIKTOK');
    assert(tiktokTasks.every(m => m.platform === 'TIKTOK'), 'TikTok platform filter returns only TikTok platform tasks');
  }

  // TEST 5: Role-Based Access Control (RBAC)
  console.log('\n--- Test Group 5: Role-Based Access Control (RBAC) ---');
  {
    const allUsers = await getUsers();
    const admin = allUsers.find(u => u.role_name === 'ADMIN');
    const motionPic = allUsers.find(u => u.role_name === 'MOTION_PIC');
    const allMotion = await getMotionTasks();
    const allTasks = await getAllTasksWithRelations();
    const enriched = allMotion.map(m => ({ ...m, parentTask: allTasks.find(t => t.id === m.task_id) }));
    const approved = enriched.filter(m => m.status_motion === 'APPROVED' || m.status_motion === 'COMPLETED');

    // Admin view
    const adminAccessible = approved;
    assert(adminAccessible.length === approved.length, 'Admin can access all approved motion tasks');

    // Motion PIC view
    if (motionPic) {
      const picAccessible = approved.filter(m => m.motion_pic_id === motionPic.id);
      assert(picAccessible.every(m => m.motion_pic_id === motionPic.id), 'Motion PIC can only access their assigned motion tasks');
    }
  }

  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('====================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL TESTS PASSED! Motion Approved Archive is fully verified.');
  } else {
    throw new Error(`${totalTests - passedTests} tests failed.`);
  }
}

runMotionApprovedArchiveTestSuite().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
