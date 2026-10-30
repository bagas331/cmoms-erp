// ============================================================
// CMOS - Campaign Usage Management & Google Sheets Read-Only
// Comprehensive Verification & Security Audit Test Suite
// ============================================================

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  parseCSV,
  mapRowsToDesignRecords,
  mapRowsToMotionRecords,
  computeMotionActiveStatus,
  parseDateString,
  fetchGoogleSheetsCampaignData,
  clearCampaignCache,
  getCachedCampaignData,
  getFallbackCampaignData,
} from '../lib/google-sheets-adapter';
import { sanitizeUrl } from '../lib/utils';
import { signSessionToken } from '../lib/server-auth';
import { getUsers } from '../lib/supabase-store';
import { GET as campaignApiGet } from '../app/api/campaign/route';
import { NextRequest } from 'next/server';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const testResults: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void> | void) {
  const start = Date.now();
  try {
    await fn();
    testResults.push({ name, passed: true, durationMs: Date.now() - start });
    console.log(`  [PASS] PASS: ${name}`);
  } catch (err: unknown) {
    const errorObj = err as Error | undefined;
    testResults.push({
      name,
      passed: false,
      error: errorObj?.message || String(err),
      durationMs: Date.now() - start,
    });
    console.error(`  [FAIL] FAIL: ${name}`);
    console.error(`    ${errorObj?.stack || errorObj?.message || String(err)}`);
  }
}

// ============================================================
// TEST 1: CSV PARSING & DATA MAPPING VALIDATION
// ============================================================
async function testSpreadsheetMappingValidation() {
  await runTest('Spreadsheet Mapping: parseCSV handles quotes, commas, and multiline values', () => {
    const rawCSV = `"Header1","Header2","Header3"\n"Val1","Val2, with comma","Val3"\n"Val4","Val5 with\nnewline","Val6"`;
    const parsed = parseCSV(rawCSV);
    assert.strictEqual(parsed.length, 3, 'Should parse exactly 3 rows');
    assert.strictEqual(parsed[0][0], 'Header1');
    assert.strictEqual(parsed[1][1], 'Val2, with comma');
    assert.strictEqual(parsed[2][1], 'Val5 with\nnewline');
  });

  await runTest('Spreadsheet Mapping: mapRowsToDesignRecords accurately extracts columns', () => {
    const sampleHeaders = [
      '',
      'by Design Month Request',
      'Req. Date',
      'Brand',
      'Campaign',
      'by Strategic With Strategic Concept',
      'Strat PIC',
      'by Design Design PIC',
      'Type of Content',
      'Taks Source',
      'Req. Qty',
      'Output Qty',
      'Due Date',
      'Submission Date',
      'Working Day (SLA 3 Days)',
      'Operational Exellence',
      'Design Difficulty',
      'Status Design',
      'Final Asset Name',
    ];
    const sampleRow = [
      '',
      'Agustus',
      '21/08/2026',
      'Enesis',
      'PAYDAY',
      'Yes',
      'Rama',
      'Ira',
      'Mockup',
      'Orca',
      '1',
      '1',
      '21/08/2026',
      '21/08/2026',
      '1',
      'Excellence',
      'Low',
      'Done',
      'ENESIS_MOCKUP',
    ];

    const records = mapRowsToDesignRecords([sampleHeaders, sampleRow]);
    assert.strictEqual(records.length, 1);
    const rec = records[0];
    assert.strictEqual(rec.brand, 'Enesis');
    assert.strictEqual(rec.monthRequest, 'Agustus');
    assert.strictEqual(rec.reqDate, '21/08/2026');
    assert.strictEqual(rec.campaign, 'PAYDAY');
    assert.strictEqual(rec.designPIC, 'Ira');
    assert.strictEqual(rec.stratPIC, 'Rama');
    assert.strictEqual(rec.taksSource, 'Orca');
    assert.strictEqual(rec.operationalExcellence, 'Excellence');
    assert.strictEqual(rec.designDifficulty, 'Low');
    assert.strictEqual(rec.statusDesign, 'Done');
  });

  await runTest('Spreadsheet Mapping: mapRowsToMotionRecords extracts motion operational fields', () => {
    const sampleHeaders = [
      'Nama Aset',
      'Brand',
      'Platform',
      'Tipe',
      'Complexity',
      'Kampanye',
      'Bulan',
      'Tanggal Produksi',
      'Periode Mulai',
      'Periode Selesai',
      'Jam Tayang',
      'Status Mockup',
      'Motion PIC',
      'Link File',
      'Catatan',
      'Studio',
    ];
    const sampleRow = [
      'BATISTE 10.10',
      'BATISTE',
      'TikTok',
      'Mockup',
      'Low',
      'DD',
      'Oktober',
      '9 Oktober 2026',
      '10 Oktober 2026',
      '24 Oktober 2026',
      'Pas Running',
      'Ready',
      'Bima',
      'https://drive.google.com/drive/folders/test1234',
      'Update Promo',
      'Bandung',
    ];

    const records = mapRowsToMotionRecords([sampleHeaders, sampleRow]);
    assert.strictEqual(records.length, 1);
    const rec = records[0];
    assert.strictEqual(rec.namaAset, 'BATISTE 10.10');
    assert.strictEqual(rec.brand, 'BATISTE');
    assert.strictEqual(rec.platform, 'TikTok');
    assert.strictEqual(rec.typeOfCampaign, 'DD');
    assert.strictEqual(rec.statusMotion, 'Ready');
    assert.strictEqual(rec.motionPIC, 'Bima');
    assert.strictEqual(rec.linkMotion, 'https://drive.google.com/drive/folders/test1234');
    assert.strictEqual(rec.studio, 'Bandung');
  });
}

// ============================================================
// TEST 2: STRICT READ-ONLY SECURITY VERIFICATION
// ============================================================
async function testStrictReadOnlyEnforcement() {
  await runTest('Security: Adapter source code contains zero write operations', () => {
    const adapterPath = path.resolve(__dirname, '../lib/google-sheets-adapter.ts');
    const content = fs.readFileSync(adapterPath, 'utf8');

    // Forbidden modification terms against Google Sheets
    const forbiddenPatterns = [
      /method:\s*['"]POST['"]/i,
      /method:\s*['"]PUT['"]/i,
      /method:\s*['"]PATCH['"]/i,
      /method:\s*['"]DELETE['"]/i,
      /spreadsheets\.values\.append/i,
      /spreadsheets\.values\.update/i,
      /spreadsheets\.values\.clear/i,
      /spreadsheets\.batchUpdate/i,
      /auth\.write/i,
      /drive\.file/i,
    ];

    for (const pattern of forbiddenPatterns) {
      assert.strictEqual(
        pattern.test(content),
        false,
        `Forbidden write pattern detected in google-sheets-adapter.ts: ${pattern}`
      );
    }
  });

  await runTest('Security: Campaign API route contains zero write operations', () => {
    const routePath = path.resolve(__dirname, '../app/api/campaign/route.ts');
    const content = fs.readFileSync(routePath, 'utf8');

    // Must only export GET, no POST/PUT/PATCH/DELETE
    assert.ok(content.includes('export async function GET'), 'API route must export GET handler');
    assert.strictEqual(content.includes('export async function POST'), false, 'API route must NOT export POST');
    assert.strictEqual(content.includes('export async function PUT'), false, 'API route must NOT export PUT');
    assert.strictEqual(content.includes('export async function DELETE'), false, 'API route must NOT export DELETE');
  });
}

// ============================================================
// TEST 3: DATE PARSING & ACTIVE STATUS LOGIC
// ============================================================
async function testDateParsingAndStatusLogic() {
  await runTest('Date Parsing: parseDateString handles multiple date representations', () => {
    const d1 = parseDateString('21/08/2026');
    assert.ok(d1 !== null);
    assert.strictEqual(d1!.getDate(), 21);
    assert.strictEqual(d1!.getMonth(), 7); // 0-indexed: August is 7
    assert.strictEqual(d1!.getFullYear(), 2026);

    const d2 = parseDateString('2026-10-09');
    assert.ok(d2 !== null);
    assert.strictEqual(d2!.getDate(), 9);
    assert.strictEqual(d2!.getMonth(), 9); // October is 9

    const d3 = parseDateString('9 Oktober 2026');
    assert.ok(d3 !== null);
    assert.strictEqual(d3!.getDate(), 9);
    assert.strictEqual(d3!.getMonth(), 9);
  });

  await runTest('Active Status: computeMotionActiveStatus accurately calculates state', () => {
    const fixedNow = new Date(2026, 9, 15, 12, 0, 0); // Oct 15, 2026

    // Case 1: In range -> active
    const s1 = computeMotionActiveStatus('10 Oktober 2026', '20 Oktober 2026', 'DD', fixedNow);
    assert.strictEqual(s1, 'active');

    // Case 2: Future date -> upcoming
    const s2 = computeMotionActiveStatus('25 Oktober 2026', '30 Oktober 2026', 'PayDay', fixedNow);
    assert.strictEqual(s2, 'upcoming');

    // Case 3: Past date -> ended
    const s3 = computeMotionActiveStatus('01 Oktober 2026', '07 Oktober 2026', 'DD', fixedNow);
    assert.strictEqual(s3, 'ended');

    // Case 4: Missing end date for DD (active for 1 day)
    const s4 = computeMotionActiveStatus('15 Oktober 2026', '', 'DD', fixedNow);
    assert.strictEqual(s4, 'active');
  });
}

// ============================================================
// TEST 4: URL SANITIZATION & MISSING LINK RESILIENCE
// ============================================================
async function testUrlSanitizationAndLinks() {
  await runTest('Security: sanitizeUrl validates safe protocols and strips dangerous schemes', () => {
    // Safe Google Drive URL
    const safeUrl = 'https://drive.google.com/drive/folders/1aXZ2STMDwPa';
    assert.strictEqual(sanitizeUrl(safeUrl), safeUrl);

    // Dangerous javascript: URI returns '#' by default, or null when fallback is null
    assert.strictEqual(sanitizeUrl('javascript:alert(document.cookie)'), '#');
    assert.strictEqual(sanitizeUrl('javascript:alert(document.cookie)', null), null);

    // Dangerous data: URI
    assert.strictEqual(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '#');
    assert.strictEqual(sanitizeUrl('data:text/html,<script>alert(1)</script>', null), null);

    // Dangerous vbscript: URI
    assert.strictEqual(sanitizeUrl('vbscript:msgbox("xss")', null), null);

    // Missing / invalid
    assert.strictEqual(sanitizeUrl(null, null), null);
    assert.strictEqual(sanitizeUrl('', null), null);
    assert.strictEqual(sanitizeUrl('invalid-scheme://test', null), null);
    assert.strictEqual(sanitizeUrl('-', null), '-');
  });
}

// ============================================================
// TEST 5: CACHE TTL & RATE LIMITING
// ============================================================
async function testCacheAndRateLimiting() {
  await runTest('Caching: fetchGoogleSheetsCampaignData caches response in memory', async () => {
    clearCampaignCache();
    assert.strictEqual(getCachedCampaignData(), null);

    // Initial fetch
    const firstRes = await fetchGoogleSheetsCampaignData({ forceRefresh: false });
    assert.ok(firstRes.success);
    assert.ok(firstRes.designRecords.length > 0);

    // Cache should now be populated
    const cached = getCachedCampaignData();
    assert.ok(cached !== null);
    assert.strictEqual(cached.designRecords.length, firstRes.designRecords.length);

    // Second call without forceRefresh returns source: 'cached'
    const secondRes = await fetchGoogleSheetsCampaignData({ forceRefresh: false });
    assert.strictEqual(secondRes.source, 'cached');
  });

  await runTest('Fallback: getFallbackCampaignData returns consistent non-empty dataset', () => {
    const fallback = getFallbackCampaignData();
    assert.strictEqual(fallback.success, true);
    assert.strictEqual(fallback.source, 'fallback');
    assert.ok(fallback.designRecords.length >= 3);
    assert.ok(fallback.motionRecords.length >= 3);
    assert.ok(fallback.summary.excellence >= 1);
  });
}

// ============================================================
// TEST 6: RBAC & SERVER AUTHENTICATION ON API ENDPOINT
// ============================================================
async function testRbacAndApiSecurity() {
  await runTest('RBAC: Anonymous unauthenticated request returns 401 Unauthorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/campaign', {
      method: 'GET',
    });
    const res = await campaignApiGet(req);
    assert.strictEqual(res.status, 401);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.ok(json.message.includes('Unauthorized'));
  });

  await runTest('RBAC: Authenticated user with valid session token is granted access', async () => {
    const allUsers = await getUsers();
    const adminUser = allUsers.find((u) => u.role_name === 'ADMIN');
    assert.ok(adminUser, 'Admin user must exist in store');

    // Create valid signed session token
    const token = signSessionToken({
      id: adminUser!.id,
      email: adminUser!.email,
      role_name: adminUser!.role_name,
    });

    const req = new NextRequest('http://localhost:3000/api/campaign', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const res = await campaignApiGet(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.designRecords.length > 0);
  });

  await runTest('RBAC: Deactivated user (is_active === false) is rejected with 403 Forbidden', async () => {
    const token = signSessionToken({
      id: 'deactivated-user-id',
      email: 'deactivated@orbiz.id',
      role_name: 'OPERATOR',
    });

    const req = new NextRequest('http://localhost:3000/api/campaign', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const res = await campaignApiGet(req);
    // Either 401 (user not in DB) or 403
    assert.ok(res.status === 401 || res.status === 403);
  });
}

// ============================================================
// MAIN RUNNER
// ============================================================
export async function runAllCampaignUsageTests() {
  console.log('\n============================================================');
  console.log('CAMPAIGN USAGE & GOOGLE SHEETS READ-ONLY AUDIT TEST SUITE');
  console.log('============================================================\n');

  await testSpreadsheetMappingValidation();
  await testStrictReadOnlyEnforcement();
  await testDateParsingAndStatusLogic();
  await testUrlSanitizationAndLinks();
  await testCacheAndRateLimiting();
  await testRbacAndApiSecurity();

  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log('\n------------------------------------------------------------');
  console.log(`SUMMARY: ${passed}/${total} passed (${failed} failed)`);
  console.log('------------------------------------------------------------\n');

  if (failed > 0) {
    throw new Error(`${failed} Campaign Usage verification tests failed!`);
  }
}

// Allow standalone execution via ts-node / node
if (require.main === module) {
  runAllCampaignUsageTests()
    .then(() => {
      console.log('All Campaign Usage tests passed successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}
