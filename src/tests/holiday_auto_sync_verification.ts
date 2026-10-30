// ============================================================
// CMOS - Indonesian Official Holiday & Auto-Sync Verification Test
// ============================================================

import { 
  fetchOfficialIndonesianHolidays, 
  parseGoogleCalendarIcs,
  shouldAutoSyncHolidays
} from '../lib/indonesian-holidays';
import { 
  getHolidays, 
  syncOfficialHolidays, 
  addHoliday, 
  deleteHoliday 
} from '../lib/supabase-store';
import { calculateBusinessDays, isHoliday } from '../lib/sla-engine';
import { Holiday } from '../lib/types';

async function runTests() {
  console.log('================================================================');
  console.log('[TEST] VERIFYING INDONESIAN OFFICIAL HOLIDAY AUTO-SYNC ENGINE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] FAIL: ${msg}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST 1: iCal Parser Unit Test
  // -------------------------------------------------------------
  console.log('[Test 1] Testing Google Calendar iCal Parser...');
  const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260320
DTEND;VALUE=DATE:20260321
SUMMARY:Cuti Bersama Hari Raya Idul Fitri
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260321
DTEND;VALUE=DATE:20260322
SUMMARY:Hari Raya Idul Fitri 1447 Hijriyah
END:VEVENT
END:VCALENDAR`;

  const parsedEvents = parseGoogleCalendarIcs(sampleIcs);
  assert(parsedEvents.length === 2, 'Parsed exactly 2 VEVENT records');
  assert(parsedEvents[0].holiday_date === '2026-03-20', 'First event date matches 2026-03-20');
  assert(parsedEvents[0].is_cuti_bersama === true, 'First event identified as cuti bersama');
  assert(parsedEvents[1].holiday_date === '2026-03-21', 'Second event date matches 2026-03-21');
  assert(parsedEvents[1].is_cuti_bersama === false, 'Second event identified as national holiday');

  // -------------------------------------------------------------
  // TEST 2: Live Fetch Official Indonesian Holidays (Multi-Year)
  // -------------------------------------------------------------
  console.log('\n[Test 2] Testing Live Official Indonesian Holiday Fetch (2025, 2026, 2027)...');
  const fetchResult = await fetchOfficialIndonesianHolidays([2025, 2026, 2027]);
  assert(fetchResult.holidays.length > 20, `Fetched ${fetchResult.holidays.length} holidays (expected > 20)`);
  assert(fetchResult.source.length > 0, `Active source: ${fetchResult.source}`);

  const has2025 = fetchResult.holidays.some(h => h.holiday_date.startsWith('2025-'));
  const has2026 = fetchResult.holidays.some(h => h.holiday_date.startsWith('2026-'));
  const has2027 = fetchResult.holidays.some(h => h.holiday_date.startsWith('2027-'));
  assert(has2025 && has2026 && has2027, 'Holidays span multiple official years (2025, 2026, 2027)');

  // Verify key Indonesian holidays exist
  const hasIdulFitri = fetchResult.holidays.some(h => /idul fitri/i.test(h.description));
  const hasKemerdekaan = fetchResult.holidays.some(h => /kemerdekaan/i.test(h.description));
  const hasNyepi = fetchResult.holidays.some(h => /nyepi/i.test(h.description));
  assert(hasIdulFitri, 'Official Idul Fitri holiday present in calendar');
  assert(hasKemerdekaan, 'Official Hari Kemerdekaan RI present in calendar');
  assert(hasNyepi, 'Official Hari Raya Nyepi present in calendar');

  // -------------------------------------------------------------
  // TEST 3: Sync Official Holidays & Store Integration
  // -------------------------------------------------------------
  console.log('\n[Test 3] Testing Sync Official Holidays & Merging...');
  // Add a custom dummy holiday to verify it is NOT overwritten
  const customDate = '2026-11-15';
  await addHoliday(customDate, 'Hari Ulang Tahun Perusahaan');

  const syncResult = await syncOfficialHolidays([2026]);
  assert(syncResult.success === true, 'syncOfficialHolidays executed successfully');
  assert(syncResult.totalCount >= 20, `Total synced holidays: ${syncResult.totalCount}`);

  // Check stored holidays
  const allHolidays = await getHolidays();
  const customStillExists = allHolidays.some(h => h.holiday_date === customDate && h.description === 'Hari Ulang Tahun Perusahaan');
  assert(customStillExists, 'Custom office holiday was preserved during official calendar sync');

  // Clean up dummy
  await deleteHoliday(customDate);

  // -------------------------------------------------------------
  // TEST 4: SLA Business Day Calculation with Official Holidays
  // -------------------------------------------------------------
  console.log('\n[Test 4] Testing SLA Engine Exclusion of Official Holidays...');
  // 2026-08-17 is Indonesian Independence Day (Monday)
  // Between 2026-08-14 (Friday) and 2026-08-18 (Tuesday):
  // Without holiday: Friday (start), Sat/Sun (weekend), Mon (work), Tue (work) -> 2 working days
  // With holiday (Mon 17 excluded): only 1 working day spent!
  const bDaysWithoutHoliday = calculateBusinessDays('2026-08-14', '2026-08-18', []);
  const bDaysWithHoliday = calculateBusinessDays('2026-08-14', '2026-08-18', allHolidays);
  assert(bDaysWithoutHoliday === 2, `Without holiday, business days = ${bDaysWithoutHoliday} (expected 2)`);
  assert(bDaysWithHoliday === 1, `With official Independence Day excluded, business days = ${bDaysWithHoliday} (expected 1)`);

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
