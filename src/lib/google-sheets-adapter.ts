// ============================================================
// CMOS - Google Sheets Read-Only Integration Adapter
// Strictly READ-ONLY. No write, update, append, or delete operations.
// ============================================================

import {
  CampaignDesignRecord,
  CampaignMotionRecord,
  CampaignUsageApiResponse,
} from './types';
import { sanitizeUrl } from './utils';

// --- CONFIGURATION & DEFAULTS ---
export const DEFAULT_SPREADSHEET_ID = '1aXZ2STMDwPa-zFeZj37aa_Ko4-IE5WYzIKKe3EMm8rs';
export const DEFAULT_TAB_2026_GID = '1476491661';
export const DEFAULT_TAB_MOTION_GID = '820345676';
export const DEFAULT_TAB_2026_NAME = '2026';
export const DEFAULT_TAB_MOTION_NAME = 'Motion Status';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
const MIN_REFRESH_INTERVAL_MS = 5 * 1000; // 5 seconds debounce on forced refresh

interface CachedPayload {
  data: CampaignUsageApiResponse;
  timestamp: number;
}

let memoryCache: CachedPayload | null = null;
let lastUpstreamFetchTime = 0;

// --- INDONESIAN DATE PARSING HELPERS ---
const INDO_MONTH_MAP: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  agu: 8,
  sep: 9,
  oct: 10,
  okt: 10,
  nov: 11,
  dec: 12,
  des: 12,
};

/**
 * Parses date string in multiple formats (DD/MM/YYYY, YYYY-MM-DD, or DD Month YYYY)
 */
export function parseDateString(raw?: string | null): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === 'N/A') return null;

  // 1. DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const year = parseInt(slashMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // 2. YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // 3. DD Month YYYY (Indonesian or English, e.g. "9 Oktober 2026")
  const indoMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-zë]+)\s+(\d{4})$/);
  if (indoMatch) {
    const day = parseInt(indoMatch[1], 10);
    const monthName = indoMatch[2].toLowerCase();
    const year = parseInt(indoMatch[3], 10);
    const monthNum = INDO_MONTH_MAP[monthName];
    if (monthNum) {
      const d = new Date(year, monthNum - 1, day);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // Standard fallback
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a Date or raw date string to readable Indonesian date (e.g. 26 Jul 2026)
 */
export function formatReadableDate(raw?: string | null): string {
  if (!raw) return '-';
  const parsed = parseDateString(raw);
  if (!parsed) return raw;
  return parsed.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Computes active status for Motion to OP records:
 * - 'upcoming' (Akan Datang) if now < start date
 * - 'ended' (Selesai) if now > end date
 * - 'active' (Aktif) if now >= start date and now <= end date
 * If end date is missing:
 * - DD/PayDay is considered active for 1 day
 * - BaU is considered active until before next DD/PayDay checkpoint
 */
export function computeMotionActiveStatus(
  periodeMulaiStr?: string,
  periodeSelesaiStr?: string,
  campaignTypeStr?: string,
  now: Date = new Date()
): 'active' | 'upcoming' | 'ended' | 'unknown' {
  const start = parseDateString(periodeMulaiStr);
  if (!start) return 'unknown';

  let end = parseDateString(periodeSelesaiStr);

  if (!end) {
    const cType = (campaignTypeStr || '').trim().toLowerCase();
    if (cType === 'dd' || cType === 'payday') {
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else {
      // BaU checkpoint fallback
      const day = start.getDate();
      const month = start.getMonth();
      const year = start.getFullYear();
      if (day < 7) {
        end = new Date(year, month, 6);
      } else if (day < 25) {
        end = new Date(year, month, 24);
      } else {
        const nextMonth = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        end = new Date(nextYear, nextMonth, 6);
      }
    }
  }

  // Set end to end of day (23:59:59.999)
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);

  if (now < startOfDay) return 'upcoming';
  if (now > endOfDay) return 'ended';
  return 'active';
}

// --- ROBUST CSV PARSER ---
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let insideQuote = false;

  // Strip BOM if present
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  for (let i = 0; i < cleanText.length; i++) {
    const c = cleanText[i];
    const next = cleanText[i + 1];

    if (c === '"') {
      if (insideQuote && next === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (c === ',' && !insideQuote) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((c === '\r' || c === '\n') && !insideQuote) {
      if (c === '\r' && next === '\n') i++;
      currentRow.push(currentVal.trim());
      currentVal = '';
      if (currentRow.some((col) => col !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentVal += c;
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((col) => col !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// --- COLUMN MATCHER HELPER ---
function findColumnIndex(headers: string[], matchers: string[]): number {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  for (const matcher of matchers) {
    const lowerMatcher = matcher.toLowerCase().trim();
    // 1. Exact match
    const exactIdx = lowerHeaders.indexOf(lowerMatcher);
    if (exactIdx !== -1) return exactIdx;

    // 2. Contains match
    const containsIdx = lowerHeaders.findIndex((h) => h.includes(lowerMatcher));
    if (containsIdx !== -1) return containsIdx;
  }
  return -1;
}

// --- TRANSFORM TAB 2026 (DESIGN & STRATEGIC) ---
export function mapRowsToDesignRecords(rows: string[][]): CampaignDesignRecord[] {
  if (rows.length < 2) return [];

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const rowJoined = rows[i].map((c) => c.toLowerCase()).join(' ');
    if (rowJoined.includes('brand') || rowJoined.includes('req. date') || rowJoined.includes('month request')) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rows[headerRowIdx];

  const colMap = {
    monthRequest: findColumnIndex(headers, ['month request', 'month']),
    reqDate: findColumnIndex(headers, ['req. date', 'req date', 'date request']),
    brand: findColumnIndex(headers, ['brand']),
    campaign: findColumnIndex(headers, ['campaign']),
    withStrategic: findColumnIndex(headers, ['with strategic concept', 'with concept']),
    stratPIC: findColumnIndex(headers, ['strat pic']),
    designPIC: findColumnIndex(headers, ['design pic', 'pic graphic designer']),
    typeOfContent: findColumnIndex(headers, ['type of content', 'content type']),
    taksSource: findColumnIndex(headers, ['taks source', 'task source', 'source']),
    reqQty: findColumnIndex(headers, ['req. qty', 'quantity']),
    outputQty: findColumnIndex(headers, ['output qty', 'total quantity']),
    dueDate: findColumnIndex(headers, ['due date']),
    submissionDate: findColumnIndex(headers, ['submission date', 'date submission']),
    workingDay: findColumnIndex(headers, ['working day', 'sla']),
    operationalExcellence: findColumnIndex(headers, ['operational exellence', 'operational excellence', 'excellence']),
    designDifficulty: findColumnIndex(headers, ['design difficulty', 'diffiqulty status']),
    stratRevision: findColumnIndex(headers, ['strat revision']),
    statusStrat: findColumnIndex(headers, ['status strat']),
    designRevision: findColumnIndex(headers, ['design revision']),
    statusDesign: findColumnIndex(headers, ['status design', 'status']),
    finalAssetName: findColumnIndex(headers, ['final asset name']),
    motionPIC: findColumnIndex(headers, ['motion pic']),
    typeOfCampaign: findColumnIndex(headers, ['type of campaign']),
    applyDate: findColumnIndex(headers, ['apply date']),
    motionDifficulty: findColumnIndex(headers, ['motion difficulty']),
    motionRevision: findColumnIndex(headers, ['motion revision']),
    statusMotion: findColumnIndex(headers, ['status motion']),
    linkMotion: findColumnIndex(headers, ['link motion', 'link']),
    remark: findColumnIndex(headers, ['remark', 'catatan']),
  };

  const records: CampaignDesignRecord[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    // Must have at least a brand or req date or type of content
    const brand = colMap.brand !== -1 ? row[colMap.brand] || '' : '';
    const reqDate = colMap.reqDate !== -1 ? row[colMap.reqDate] || '' : '';
    const typeOfContent = colMap.typeOfContent !== -1 ? row[colMap.typeOfContent] || '' : '';

    if (!brand && !reqDate && !typeOfContent) continue;

    // Normalize Operational Excellence
    const rawExcellence = colMap.operationalExcellence !== -1 ? (row[colMap.operationalExcellence] || '').trim() : '';
    let normalizedExcellence = '';
    const lowerExc = rawExcellence.toLowerCase();
    if (lowerExc.includes('excellence')) normalizedExcellence = 'Excellence';
    else if (lowerExc === 'good') normalizedExcellence = 'Good';
    else if (lowerExc === 'bad') normalizedExcellence = 'Bad';
    else if (rawExcellence && isNaN(Number(rawExcellence)) && !rawExcellence.includes('%')) {
      normalizedExcellence = rawExcellence;
    }

    records.push({
      id: `design-${i}`,
      monthRequest: colMap.monthRequest !== -1 ? row[colMap.monthRequest] || '' : '',
      reqDate,
      brand,
      campaign: colMap.campaign !== -1 ? row[colMap.campaign] || '' : '',
      withStrategic: colMap.withStrategic !== -1 ? row[colMap.withStrategic] || '' : '',
      stratPIC: colMap.stratPIC !== -1 ? row[colMap.stratPIC] || '' : '',
      designPIC: colMap.designPIC !== -1 ? row[colMap.designPIC] || '' : '',
      typeOfContent,
      taksSource: colMap.taksSource !== -1 ? row[colMap.taksSource] || '' : '',
      reqQty: colMap.reqQty !== -1 ? row[colMap.reqQty] || '' : '',
      outputQty: colMap.outputQty !== -1 ? row[colMap.outputQty] || '' : '',
      dueDate: colMap.dueDate !== -1 ? row[colMap.dueDate] || '' : '',
      submissionDate: colMap.submissionDate !== -1 ? row[colMap.submissionDate] || '' : '',
      workingDay: colMap.workingDay !== -1 ? row[colMap.workingDay] || '' : '',
      operationalExcellence: normalizedExcellence,
      designDifficulty: colMap.designDifficulty !== -1 ? row[colMap.designDifficulty] || '' : '',
      stratRevision: colMap.stratRevision !== -1 ? row[colMap.stratRevision] || '' : '',
      statusStrat: colMap.statusStrat !== -1 ? row[colMap.statusStrat] || '' : '',
      designRevision: colMap.designRevision !== -1 ? row[colMap.designRevision] || '' : '',
      statusDesign: colMap.statusDesign !== -1 ? row[colMap.statusDesign] || '' : '',
      finalAssetName: colMap.finalAssetName !== -1 ? row[colMap.finalAssetName] || '' : '',
      motionPIC: colMap.motionPIC !== -1 ? row[colMap.motionPIC] || '' : '',
      typeOfCampaign: colMap.typeOfCampaign !== -1 ? row[colMap.typeOfCampaign] || '' : '',
      applyDate: colMap.applyDate !== -1 ? row[colMap.applyDate] || '' : '',
      motionDifficulty: colMap.motionDifficulty !== -1 ? row[colMap.motionDifficulty] || '' : '',
      motionRevision: colMap.motionRevision !== -1 ? row[colMap.motionRevision] || '' : '',
      statusMotion: colMap.statusMotion !== -1 ? row[colMap.statusMotion] || '' : '',
      linkMotion: colMap.linkMotion !== -1 ? row[colMap.linkMotion] || '' : '',
      remark: colMap.remark !== -1 ? row[colMap.remark] || '' : '',
    });
  }

  return records;
}

// --- TRANSFORM TAB MOTION STATUS (BY MOTION TO OP) ---
export function mapRowsToMotionRecords(rows: string[][]): CampaignMotionRecord[] {
  if (rows.length < 2) return [];

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const rowJoined = rows[i].map((c) => c.toLowerCase()).join(' ');
    if (rowJoined.includes('nama aset') || rowJoined.includes('brand') || rowJoined.includes('platform')) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rows[headerRowIdx];

  const colMap = {
    namaAset: findColumnIndex(headers, ['nama aset', 'asset name']),
    brand: findColumnIndex(headers, ['brand']),
    platform: findColumnIndex(headers, ['platform']),
    tipe: findColumnIndex(headers, ['tipe', 'type']),
    complexity: findColumnIndex(headers, ['complexity', 'difficulty']),
    typeOfCampaign: findColumnIndex(headers, ['kampanye', 'campaign']),
    bulan: findColumnIndex(headers, ['bulan', 'month']),
    tanggalProduksi: findColumnIndex(headers, ['tanggal produksi', 'production date']),
    periodeMulai: findColumnIndex(headers, ['periode mulai', 'start date', 'mulai']),
    periodeSelesai: findColumnIndex(headers, ['periode selesai', 'end date', 'selesai']),
    jamTayang: findColumnIndex(headers, ['jam tayang', 'broadcast time', 'jam']),
    statusMotion: findColumnIndex(headers, ['status mockup', 'status motion', 'status']),
    motionPIC: findColumnIndex(headers, ['motion pic', 'pic']),
    revisiTipe: findColumnIndex(headers, ['revisi & tipe', 'revisi', 'revision']),
    tanggalRevisi: findColumnIndex(headers, ['tanggal revisi', 'revision date']),
    picRevisi: findColumnIndex(headers, ['pic revisi']),
    linkMotion: findColumnIndex(headers, ['link file', 'link motion', 'link']),
    qcPic: findColumnIndex(headers, ['qc (by pic)', 'qc']),
    catatan: findColumnIndex(headers, ['catatan', 'remark', 'notes']),
    studio: findColumnIndex(headers, ['studio', 'location']),
  };

  const records: CampaignMotionRecord[] = [];
  const now = new Date();

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const namaAset = colMap.namaAset !== -1 ? row[colMap.namaAset] || '' : '';
    const brand = colMap.brand !== -1 ? row[colMap.brand] || '' : '';

    if (!namaAset && !brand) continue;

    const periodeMulai = colMap.periodeMulai !== -1 ? row[colMap.periodeMulai] || '' : '';
    const periodeSelesai = colMap.periodeSelesai !== -1 ? row[colMap.periodeSelesai] || '' : '';
    const typeOfCampaign = colMap.typeOfCampaign !== -1 ? row[colMap.typeOfCampaign] || '' : '';

    const activeStatus = computeMotionActiveStatus(periodeMulai, periodeSelesai, typeOfCampaign, now);

    // Sanitize link
    const rawLink = colMap.linkMotion !== -1 ? row[colMap.linkMotion] || '' : '';
    const cleanLink = sanitizeUrl(rawLink, null) || '';

    records.push({
      id: `motion-${i}`,
      namaAset,
      brand,
      platform: colMap.platform !== -1 ? row[colMap.platform] || '' : '',
      tipe: colMap.tipe !== -1 ? row[colMap.tipe] || '' : '',
      complexity: colMap.complexity !== -1 ? row[colMap.complexity] || '' : '',
      typeOfCampaign,
      bulan: colMap.bulan !== -1 ? row[colMap.bulan] || '' : '',
      tanggalProduksi: colMap.tanggalProduksi !== -1 ? row[colMap.tanggalProduksi] || '' : '',
      periodeMulai,
      periodeSelesai,
      jamTayang: colMap.jamTayang !== -1 ? row[colMap.jamTayang] || '' : '',
      statusMotion: colMap.statusMotion !== -1 ? row[colMap.statusMotion] || '' : '',
      motionPIC: colMap.motionPIC !== -1 ? row[colMap.motionPIC] || '' : '',
      motionDifficulty: colMap.complexity !== -1 ? row[colMap.complexity] || '' : '',
      revisiTipe: colMap.revisiTipe !== -1 ? row[colMap.revisiTipe] || '' : '',
      tanggalRevisi: colMap.tanggalRevisi !== -1 ? row[colMap.tanggalRevisi] || '' : '',
      picRevisi: colMap.picRevisi !== -1 ? row[colMap.picRevisi] || '' : '',
      linkMotion: cleanLink,
      qcPic: colMap.qcPic !== -1 ? row[colMap.qcPic] || '' : '',
      catatan: colMap.catatan !== -1 ? row[colMap.catatan] || '' : '',
      studio: colMap.studio !== -1 ? row[colMap.studio] || '' : '',
      activeStatus,
    });
  }

  return records;
}

// --- COMPUTED SUMMARY CARDS ---
export function computeExcellenceSummary(designRecords: CampaignDesignRecord[]): {
  excellence: number;
  good: number;
  bad: number;
  unclassified: number;
} {
  let excellence = 0;
  let good = 0;
  let bad = 0;
  let unclassified = 0;

  for (const record of designRecords) {
    const exc = (record.operationalExcellence || '').trim().toLowerCase();
    if (exc === 'excellence') {
      excellence++;
    } else if (exc === 'good') {
      good++;
    } else if (exc === 'bad') {
      bad++;
    } else {
      unclassified++;
    }
  }

  return { excellence, good, bad, unclassified };
}

// --- SERVER-SIDE FETCH (STRICTLY READ-ONLY GET) ---
import https from 'https';

function fetchViaHttps(url: string, maxRedirects = 5, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Too many redirects'));

    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CMOS-ERP-ReadOnly/2.0)',
          Accept: 'text/csv, text/plain, */*',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchViaHttps(res.headers.location, maxRedirects - 1, timeoutMs));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', reject);
  });
}

async function fetchSheetCSV(spreadsheetId: string, gid: string, tabName: string): Promise<string> {
  // Primary URL: Export CSV by GID
  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  // Secondary fallback: GViz TQ CSV by sheet name
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;

  try {
    const csv = await fetchViaHttps(exportUrl, 5, 8000);
    if (csv && csv.length > 50 && !csv.includes('<!DOCTYPE html>')) {
      return csv;
    }
  } catch {
    // Continue to gviz fallback
  }

  // Fallback to gviz endpoint
  try {
    const csv = await fetchViaHttps(gvizUrl, 5, 8000);
    if (csv && csv.length > 50 && !csv.includes('<!DOCTYPE html>')) {
      return csv;
    }
  } catch (err) {
    throw new Error(`Google Sheets CSV fetch failed: ${(err as Error).message}`);
  }

  throw new Error(`Unable to fetch Google Sheets CSV for sheet "${tabName}" (GID ${gid})`);
}

// --- REPRODUCIBLE FALLBACK SEED DATA ---
export function getFallbackCampaignData(): CampaignUsageApiResponse {
  const fallbackDesign: CampaignDesignRecord[] = [
    {
      id: 'design-fallback-1',
      monthRequest: 'Agustus',
      reqDate: '21/08/2026',
      brand: 'Enesis',
      campaign: 'PAYDAY',
      withStrategic: 'Yes',
      stratPIC: 'Rama',
      designPIC: 'Ira',
      typeOfContent: 'Mockup',
      taksSource: 'Orca',
      reqQty: '1',
      outputQty: '1',
      dueDate: '21/08/2026',
      submissionDate: '21/08/2026',
      workingDay: '1',
      operationalExcellence: 'Excellence',
      designDifficulty: 'Low',
      stratRevision: '',
      statusStrat: 'Done',
      designRevision: '',
      statusDesign: 'Done',
      finalAssetName: 'ENESIS_PAYDAY_MOCKUP',
      motionPIC: 'Bima',
      typeOfCampaign: 'PayDay',
      applyDate: '25/08/2026',
      motionDifficulty: 'Low',
      motionRevision: '',
      statusMotion: 'Done',
      linkMotion: 'https://drive.google.com/drive/folders/15FhnUtEbB_CYaaNZQYosR77sIVxnR17Y',
      remark: 'Mockup baru',
    },
    {
      id: 'design-fallback-2',
      monthRequest: 'Agustus',
      reqDate: '24/08/2026',
      brand: 'Greenfields',
      campaign: 'PAYDAY',
      withStrategic: 'No',
      stratPIC: 'No Strat',
      designPIC: 'Mahes',
      typeOfContent: 'Mockup',
      taksSource: 'Orca',
      reqQty: '1',
      outputQty: '1',
      dueDate: '24/08/2026',
      submissionDate: '24/08/2026',
      workingDay: '1',
      operationalExcellence: 'Good',
      designDifficulty: 'Medium',
      stratRevision: '',
      statusStrat: '',
      designRevision: '',
      statusDesign: 'Done',
      finalAssetName: 'GF_PAYDAY_MOCKUP',
      motionPIC: 'Alif',
      typeOfCampaign: 'PayDay',
      applyDate: '25/08/2026',
      motionDifficulty: 'Medium',
      motionRevision: '',
      statusMotion: 'Done',
      linkMotion: '',
      remark: '-',
    },
    {
      id: 'design-fallback-3',
      monthRequest: 'Agustus',
      reqDate: '26/08/2026',
      brand: 'Signify',
      campaign: 'DD',
      withStrategic: 'Yes',
      stratPIC: 'Jaksa',
      designPIC: 'Alfie',
      typeOfContent: 'Banner Marketplace',
      taksSource: 'Ecommerce',
      reqQty: '1',
      outputQty: '2',
      dueDate: '26/08/2026',
      submissionDate: '26/08/2026',
      workingDay: '1',
      operationalExcellence: 'Bad',
      designDifficulty: 'High',
      stratRevision: '1',
      statusStrat: 'Done',
      designRevision: '1',
      statusDesign: 'Done',
      finalAssetName: 'SIGNIFY_DD_BANNER',
      motionPIC: '',
      typeOfCampaign: 'DD',
      applyDate: '09/09/2026',
      motionDifficulty: '',
      motionRevision: '',
      statusMotion: '',
      linkMotion: '',
      remark: 'Update promo',
    },
  ];

  const fallbackMotion: CampaignMotionRecord[] = [
    {
      id: 'motion-fallback-1',
      namaAset: 'ANLENE BAU',
      brand: 'FONTERRA',
      platform: 'TikTok',
      tipe: 'Sepeda Chaos',
      complexity: 'High',
      typeOfCampaign: 'BaU',
      bulan: 'Juli',
      tanggalProduksi: '25 Juli 2026',
      periodeMulai: '2026-07-26',
      periodeSelesai: '2026-07-28',
      jamTayang: 'Pas Running',
      statusMotion: 'Ready',
      motionPIC: 'Bima',
      motionDifficulty: 'High',
      linkMotion: 'https://drive.google.com/drive/folders/1Uwm_aDwjqkUQ2mjIZnXvv5plbhNinThl',
      catatan: 'Update Promo',
      studio: 'Jakarta',
      activeStatus: 'ended',
    },
    {
      id: 'motion-fallback-2',
      namaAset: 'BETADINE DD',
      brand: 'BETADINE',
      platform: 'TikTok',
      tipe: '-',
      complexity: 'Low',
      typeOfCampaign: 'DD',
      bulan: 'Juli',
      tanggalProduksi: '6 Juli 2026',
      periodeMulai: '2026-07-07',
      periodeSelesai: '2026-07-07',
      jamTayang: '00:00',
      statusMotion: 'Ready',
      motionPIC: 'Alif',
      motionDifficulty: 'Low',
      linkMotion: 'https://drive.google.com/drive/folders/1tkoB-b3mSFppCtknHIcN7YmdwjGHSOcG',
      catatan: '-',
      studio: 'Jakarta',
      activeStatus: 'ended',
    },
    {
      id: 'motion-fallback-3',
      namaAset: 'BETADINE PAYDAY',
      brand: 'BETADINE',
      platform: 'TikTok',
      tipe: '-',
      complexity: 'Medium',
      typeOfCampaign: 'PayDay',
      bulan: 'Juli',
      tanggalProduksi: '24 Juli 2026',
      periodeMulai: '2026-07-25',
      periodeSelesai: '2026-07-31',
      jamTayang: 'Pas Running',
      statusMotion: 'Ready',
      motionPIC: 'Jova',
      motionDifficulty: 'Medium',
      linkMotion: 'https://drive.google.com/drive/folders/1WHFdzs_fOPtYnUK3aN9nmSH-KAk6rPlU',
      catatan: '-',
      studio: 'Bandung',
      activeStatus: 'ended',
    },
  ];

  const summary = computeExcellenceSummary(fallbackDesign);

  return {
    success: true,
    message: 'Loaded fallback dataset (Google Sheets offline)',
    source: 'fallback',
    lastSyncedAt: new Date().toISOString(),
    totalRecordsDesign: fallbackDesign.length,
    totalRecordsMotion: fallbackMotion.length,
    summary,
    designRecords: fallbackDesign,
    motionRecords: fallbackMotion,
    metadata: {
      spreadsheetId: DEFAULT_SPREADSHEET_ID,
      tabName: DEFAULT_TAB_2026_NAME,
    },
  };
}

// --- MAIN FETCH FUNCTION (READ-ONLY) ---
export async function fetchGoogleSheetsCampaignData(options: {
  forceRefresh?: boolean;
} = {}): Promise<CampaignUsageApiResponse> {
  const now = Date.now();
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const tab2026Gid = process.env.GOOGLE_SHEETS_TAB_2026_GID || DEFAULT_TAB_2026_GID;
  const tabMotionGid = process.env.GOOGLE_SHEETS_TAB_MOTION_GID || DEFAULT_TAB_MOTION_GID;
  const tab2026Name = process.env.GOOGLE_SHEETS_TAB_NAME || DEFAULT_TAB_2026_NAME;
  const tabMotionName = process.env.GOOGLE_SHEETS_TAB_MOTION_NAME || DEFAULT_TAB_MOTION_NAME;

  // 1. Check in-memory cache if not forcing refresh
  if (!options.forceRefresh && memoryCache && now - memoryCache.timestamp < CACHE_TTL_MS) {
    return {
      ...memoryCache.data,
      source: 'cached',
    };
  }

  // 2. Enforce debounce on forced refresh
  if (options.forceRefresh && memoryCache && now - lastUpstreamFetchTime < MIN_REFRESH_INTERVAL_MS) {
    return {
      ...memoryCache.data,
      source: 'cached',
      message: 'Rate limit: refreshing too fast. Serving recent cached copy.',
    };
  }

  try {
    lastUpstreamFetchTime = now;

    // Fetch tab 2026 and tab Motion Status in parallel (READ-ONLY GET)
    const [csv2026, csvMotion] = await Promise.all([
      fetchSheetCSV(spreadsheetId, tab2026Gid, tab2026Name),
      fetchSheetCSV(spreadsheetId, tabMotionGid, tabMotionName).catch((err) => {
        console.warn(`Optional tab "${tabMotionName}" fetch warning:`, (err as Error).message);
        return '';
      }),
    ]);

    const parsed2026 = parseCSV(csv2026);
    const designRecords = mapRowsToDesignRecords(parsed2026);

    let motionRecords: CampaignMotionRecord[] = [];
    if (csvMotion && csvMotion.length > 50) {
      const parsedMotion = parseCSV(csvMotion);
      motionRecords = mapRowsToMotionRecords(parsedMotion);
    } else {
      // Derive Motion records from tab 2026 if tab Motion Status is empty
      motionRecords = designRecords
        .filter((d) => d.statusMotion || d.finalAssetName || d.motionPIC || d.linkMotion)
        .map((d, idx) => ({
          id: `motion-derived-${idx}`,
          namaAset: d.finalAssetName || `${d.brand} ${d.campaign}`.trim(),
          brand: d.brand,
          platform: 'Live Streaming',
          tipe: d.typeOfContent,
          typeOfCampaign: d.typeOfCampaign || d.campaign,
          bulan: d.monthRequest,
          periodeMulai: d.applyDate || d.dueDate || d.reqDate,
          periodeSelesai: '',
          jamTayang: 'Pas Running',
          statusMotion: d.statusMotion || 'Ready',
          motionPIC: d.motionPIC,
          motionDifficulty: d.motionDifficulty,
          motionRevision: d.motionRevision,
          linkMotion: sanitizeUrl(d.linkMotion, null) || '',
          catatan: d.remark,
          studio: 'Studio Utama',
          activeStatus: computeMotionActiveStatus(d.applyDate || d.dueDate || d.reqDate, '', d.typeOfCampaign || d.campaign),
        }));
    }

    const summary = computeExcellenceSummary(designRecords);
    const lastSyncedAt = new Date().toISOString();

    const responsePayload: CampaignUsageApiResponse = {
      success: true,
      message: 'Successfully retrieved live campaign usage records from Google Sheets (Read-Only).',
      source: 'live',
      lastSyncedAt,
      totalRecordsDesign: designRecords.length,
      totalRecordsMotion: motionRecords.length,
      summary,
      designRecords,
      motionRecords,
      metadata: {
        spreadsheetId,
        tabName: tab2026Name,
        cacheExpiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
      },
    };

    // Store in memory cache
    memoryCache = {
      data: responsePayload,
      timestamp: now,
    };

    return responsePayload;
  } catch (err) {
    const errorMsg = (err as Error).message || 'Unknown network error';
    console.error('Google Sheets read-only adapter error:', errorMsg);

    // If cache exists, serve stale cache with warning
    if (memoryCache) {
      return {
        ...memoryCache.data,
        source: 'cached',
        error: `Gagal memperbarui data dari Google Sheets (${errorMsg}). Menampilkan salinan cache terakhir.`,
      };
    }

    // Otherwise serve reproducible fallback seed and cache it
    const fallback = getFallbackCampaignData();
    fallback.error = `Koneksi Google Sheets gagal (${errorMsg}). Menampilkan data referensi.`;

    memoryCache = {
      data: fallback,
      timestamp: now,
    };

    return fallback;
  }
}

// --- CACHE MANAGEMENT ---
export function getCachedCampaignData(): CampaignUsageApiResponse | null {
  return memoryCache ? memoryCache.data : null;
}

export function clearCampaignCache(): void {
  memoryCache = null;
  lastUpstreamFetchTime = 0;
}
