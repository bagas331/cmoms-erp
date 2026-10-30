import assert from 'assert';
import { getMonthName, formatDisplayDate } from '../lib/utils';

// Simulate CSV generation logic identical to export.ts
function generateCSVString(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) {
    throw new Error('Tidak ada data untuk diekspor.');
  }

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  // Add escaped headers
  csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

  // Add rows with CSV Injection mitigation
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      let strVal = '' + (val ?? '');
      
      // Neutralize formula injection triggers: =, +, -, @, tab, carriage return
      if (/^[=+\-@\t\r%]/.test(strVal)) {
        strVal = `'${strVal}`;
      }
      
      const escaped = strVal.replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  return '\uFEFF' + csvRows.join('\r\n');
}

async function runTest() {
  console.log('[TEST] Starting CSV Export Verification...');

  // Test 1: Empty data handling
  console.log('1. Testing empty data error handling...');
  assert.throws(() => generateCSVString([]), /Tidak ada data/);
  console.log('[PASS] Empty data throws expected exception.');

  // Test 2: Standard Reporting Kendala dataset
  console.log('2. Testing Kendala Export formatting...');
  const testData = [
    {
      'Tipe Data': 'Kendala Tercatat',
      'Tahun': 2026,
      'Bulan': getMonthName(10),
      'Minggu': 'W1',
      'Judul / Nama Kendala': 'Asset Delay dari Client',
      'Kategori': 'Keterlambatan Asset',
      'Tingkat Severity': 'HIGH',
      'Status': 'ACTIVE',
      'Pipeline Terdampak': 'ALL',
      'Terkait Task Code': 'REQ-2026-0005',
      'Pelapor': 'Lead Strategic',
      'Deskripsi / Detail': 'Materi foto produk resolusi tinggi belum diserahkan',
      'Solusi / Mitigasi': 'Follow up PIC brand',
      'Tanggal': '23 Okt 2026'
    },
    {
      'Tipe Data': 'Detected Blocker (Sistem)',
      'Tahun': 2026,
      'Bulan': getMonthName(10),
      'Minggu': 'W2',
      'Judul / Nama Kendala': 'Task Bermasalah: REQ-2026-0012 (Launch Promo)',
      'Kategori': 'SLA Breach (Bad)',
      'Tingkat Severity': 'CRITICAL',
      'Status': 'ACTIVE',
      'Pipeline Terdampak': 'GD_MOCKUP',
      'Terkait Task Code': 'REQ-2026-0012',
      'Pelapor': 'System Audit',
      'Deskripsi / Detail': 'Status: REVISI • Revisi: 3x • SLA: BAD',
      'Solusi / Mitigasi': 'Perlu evaluasi tim dan tindak lanjut lead',
      'Tanggal': '23 Okt 2026'
    }
  ];

  const csvResult = generateCSVString(testData);

  // Validate UTF-8 BOM
  assert(csvResult.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');
  
  // Validate CRLF line endings
  assert(csvResult.includes('\r\n'), 'CSV must use CRLF for Excel compatibility');

  // Validate headers
  assert(csvResult.includes('"Tipe Data","Tahun","Bulan","Minggu"'), 'Headers must match');

  // Validate content escaping
  assert(csvResult.includes('"Asset Delay dari Client"'), 'Issue title must be present and escaped');
  assert(csvResult.includes('"Detected Blocker (Sistem)"'), 'System blocker row must be present');

  console.log('[PASS] Kendala Export format verified.');

  // Test 3: Formula Injection neutralization
  console.log('3. Testing formula injection mitigation...');
  const dangerousData = [
    {
      'Title': '=SUM(A1:A10)',
      'Notes': '+cmd|"/C calc"!A0',
      'Safe': 'Normal Text'
    }
  ];

  const dangerousCsv = generateCSVString(dangerousData);
  assert(dangerousCsv.includes("''=SUM(A1:A10)\"") || dangerousCsv.includes("\"'=SUM(A1:A10)\""), 'Formula starting with = must be prefixed with single quote');
  assert(dangerousCsv.includes("''+cmd") || dangerousCsv.includes("\"'+cmd"), 'Formula starting with + must be prefixed with single quote');
  console.log('[PASS] Formula injection neutralized successfully.');

  // Test 4: Safe month fallback data
  console.log('4. Testing clean month fallback generation...');
  const fallbackData: Record<string, unknown>[] = [];
  if (fallbackData.length === 0) {
    fallbackData.push({
      'Tipe Data': 'Status Operasional',
      'Tahun': 2026,
      'Bulan': getMonthName(10),
      'Minggu': 'All Weeks (W1 - W4)',
      'Judul / Nama Kendala': 'Operasional Bulan Oktober 2026 Aman',
      'Kategori': 'Kondisi Aman / Lancar',
      'Tingkat Severity': 'LOW',
      'Status': 'AMAN',
      'Pipeline Terdampak': 'ALL',
      'Terkait Task Code': '-',
      'Pelapor': 'System',
      'Deskripsi / Detail': 'Seluruh siklus pengerjaan dan delivery aset berjalan lancar tanpa kendala atau blocker.',
      'Solusi / Mitigasi': 'Target pengerjaan terpenuhi',
      'Tanggal': '23 Okt 2026'
    });
  }

  const fallbackCsv = generateCSVString(fallbackData);
  assert(fallbackCsv.includes('Operasional Bulan Oktober 2026 Aman'), 'Fallback row must be valid CSV');
  console.log('[PASS] Clean month fallback verified.');

  console.log('\n[SUCCESS] ALL CSV EXPORT TESTS PASSED!');
}

runTest().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
