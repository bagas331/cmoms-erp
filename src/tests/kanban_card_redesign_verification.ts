/**
 * Automated Test Suite for Request Kanban Card Redesign & Scannability
 * Verifies information hierarchy, semantic status calculations, priority resolution,
 * quantity discrepancy logic, due date & SLA helpers, and edge case resilience.
 */

import {
  getDueDateSemanticStatus,
  getPriorityDetails,
  getSLAFormatted,
  getQuantityStatus,
  formatDisplayDate,
  getInitials
} from '../lib/utils';

function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING KANBAN CARD REDESIGN VERIFICATION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // --- Test Group 1: Priority Resolution & Badges ---
  console.log('--- Test Group 1: Priority Resolution & Hierarchy ---');
  {
    const highExplicit = getPriorityDetails('HIGH', 'LIGHT', false);
    assert(highExplicit.level === 'HIGH' && highExplicit.label === 'HIGH' && highExplicit.badgeClass.includes('rose-500'), 'Explicit HIGH priority returns prominent rose badge');

    const lowExplicit = getPriorityDetails('LOW', 'HARD', false);
    assert(lowExplicit.level === 'LOW' && lowExplicit.label === 'LOW' && lowExplicit.badgeClass.includes('slate-500'), 'Explicit LOW priority returns subtle slate badge');

    const hardInferred = getPriorityDetails(null, 'HARD', false);
    assert(hardInferred.level === 'HIGH' && hardInferred.label === 'HIGH', 'HARD difficulty defaults to HIGH priority');

    const veryHardInferred = getPriorityDetails(null, 'VERY_HARD', false);
    assert(veryHardInferred.level === 'HIGH' && veryHardInferred.label === 'HIGH', 'VERY_HARD difficulty defaults to HIGH priority');

    const lightInferred = getPriorityDetails(null, 'LIGHT', false);
    assert(lightInferred.level === 'LOW' && lightInferred.label === 'LOW', 'LIGHT difficulty defaults to LOW priority');

    const overdueInferred = getPriorityDetails(null, 'LIGHT', true);
    assert(overdueInferred.level === 'HIGH', 'Overdue task escalates to HIGH priority');

    const mediumDefault = getPriorityDetails(null, 'MEDIUM', false);
    assert(mediumDefault.level === 'MEDIUM' && mediumDefault.badgeClass.includes('amber-500'), 'MEDIUM difficulty defaults to MEDIUM priority');
  }

  // --- Test Group 2: Due Date Semantics & Overdue Logic ---
  console.log('\n--- Test Group 2: Due Date Semantics & Overdue Warnings ---');
  {
    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

    const dueToday = getDueDateSemanticStatus(todayStr, false);
    assert(dueToday.status === 'today' && dueToday.badge === 'TODAY' && dueToday.isOverdue === false, 'Due today returns TODAY badge');

    const tomorrowObj = new Date(todayObj);
    tomorrowObj.setDate(todayObj.getDate() + 1);
    const tomorrowStr = `${tomorrowObj.getFullYear()}-${String(tomorrowObj.getMonth() + 1).padStart(2, '0')}-${String(tomorrowObj.getDate()).padStart(2, '0')}`;

    const dueTomorrow = getDueDateSemanticStatus(tomorrowStr, false);
    assert(dueTomorrow.status === 'tomorrow' && dueTomorrow.badge === 'TOMORROW' && dueTomorrow.isOverdue === false, 'Due tomorrow returns TOMORROW badge');

    const pastObj = new Date(todayObj);
    pastObj.setDate(todayObj.getDate() - 3);
    const pastStr = `${pastObj.getFullYear()}-${String(pastObj.getMonth() + 1).padStart(2, '0')}-${String(pastObj.getDate()).padStart(2, '0')}`;

    const overdueTask = getDueDateSemanticStatus(pastStr, false);
    assert(overdueTask.status === 'overdue' && overdueTask.badge === 'OVERDUE' && overdueTask.isOverdue === true && overdueTask.overdueDays === 3, 'Past due date returns OVERDUE badge and calculates overdue days');

    // Finished task should not show alarming overdue badge
    const finishedTask = getDueDateSemanticStatus(pastStr, true);
    assert(finishedTask.isOverdue === false && finishedTask.badge === null, 'Completed/Finished task suppresses overdue alarm');

    // Missing due date
    const missingDate = getDueDateSemanticStatus(null, false);
    assert(missingDate.formattedDate === '-' && missingDate.badge === null && missingDate.isOverdue === false, 'Missing due date returns safe fallback');
  }

  // --- Test Group 3: SLA Working Days vs Overdue Formatting ---
  console.log('\n--- Test Group 3: SLA Formatting ---');
  {
    const normalSLA = getSLAFormatted(3, false, 0);
    assert(normalSLA.text === '3 working days' && normalSLA.isWarning === false && normalSLA.isCalculated === true, 'Valid SLA returns working days count');

    const overdueSLA = getSLAFormatted(3, true, 2);
    assert(overdueSLA.text === '+2d overdue' && overdueSLA.isWarning === true, 'Overdue SLA returns +Xd overdue with warning flag');

    const uncalculatedSLA = getSLAFormatted(null, false, 0);
    assert(uncalculatedSLA.text === 'Not calculated' && uncalculatedSLA.isWarning === false && uncalculatedSLA.isCalculated === false, 'Null SLA returns clean "Not calculated"');
  }

  // --- Test Group 4: Quantity Discrepancy & Formatting ---
  console.log('\n--- Test Group 4: Quantity Discrepancy & Formatting ---');
  {
    const matchQty = getQuantityStatus(5, 5);
    assert(matchQty.display === '5 / 5' && matchQty.hasDiscrepancy === false && matchQty.remaining === 0, 'Matching quantity shows 5 / 5 without discrepancy');

    const discrepancyQty = getQuantityStatus(5, 3);
    assert(discrepancyQty.display === '3 / 5' && discrepancyQty.hasDiscrepancy === true && discrepancyQty.remaining === 2, 'Quantity discrepancy (Req 5, Out 3) detects 2 remaining');

    const nullOutputQty = getQuantityStatus(5, null);
    assert(nullOutputQty.display === '5 / 5' && nullOutputQty.hasDiscrepancy === false, 'Null output quantity defaults gracefully to requested quantity');
  }

  // --- Test Group 5: People & Initials Resolution ---
  console.log('\n--- Test Group 5: People & Initials ---');
  {
    assert(getInitials('Reza Firmansyah') === 'RF', 'Initials for Reza Firmansyah -> RF');
    assert(getInitials('Badriyah Sari Dewi') === 'BS', 'Initials for Badriyah Sari Dewi -> BS');
    assert(getInitials('Bagas') === 'B', 'Single name Bagas -> B');
    assert(getInitials('') === '', 'Empty name returns empty string');
  }

  // --- Test Group 6: Motion Pipeline Card Hierarchy ---
  console.log('\n--- Test Group 6: Motion Pipeline Card Hierarchy & Difficulty ---');
  {
    const motionAdv = getPriorityDetails(null, 'HARD', false);
    assert(motionAdv.level === 'HIGH', 'Motion LVL 3 Advanced difficulty maps to HIGH priority');

    const motionSimple = getPriorityDetails(null, 'LIGHT', false);
    assert(motionSimple.level === 'LOW', 'Motion LVL 1 Simple difficulty maps to LOW priority');

    const motionOverdue = getPriorityDetails(null, 'LIGHT', true);
    assert(motionOverdue.level === 'HIGH', 'Overdue motion task escalates to HIGH priority');

    const motionFinishedDue = getDueDateSemanticStatus('2026-09-01', true);
    assert(motionFinishedDue.isOverdue === false && motionFinishedDue.badge === null, 'Approved/Completed motion task suppresses overdue alarms');
  }

  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
