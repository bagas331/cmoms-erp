// ============================================================
// CMOS - Indonesian Official Holiday Engine & Auto-Sync
// Sesuai Kalender Resmi Indonesia (Libur Nasional & Cuti Bersama SKB 3 Menteri)
// ============================================================

import { Holiday } from './types';
import { SEED_HOLIDAYS } from './seed-data';

// Official Live Sources
const GOOGLE_CALENDAR_ID_ICS = 'https://calendar.google.com/calendar/ical/id.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics';
const API_HARI_LIBUR_RAW_BASE = 'https://raw.githubusercontent.com/andifahruddinakas/api-hari-libur/main/data';
const GUANGREI_MIRROR_RAW = 'https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/calendar.min.json';

const STORAGE_KEY_LAST_SYNC = 'cmoms_holidays_last_sync';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface HolidaySyncResult {
  success: boolean;
  message: string;
  source: string;
  addedCount: number;
  updatedCount: number;
  totalCount: number;
  years: number[];
  syncedAt: string;
  holidays: Holiday[];
}

export interface HolidaySyncMeta {
  lastSync: string | null;
  totalHolidays: number;
  years: number[];
}

/**
 * Helper to fetch with timeout
 */
async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse Google Calendar Indonesian Holiday iCal text into Holiday array
 */
export function parseGoogleCalendarIcs(icsText: string): Holiday[] {
  const results: Holiday[] = [];
  const eventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match: RegExpExecArray | null;

  while ((match = eventRegex.exec(icsText)) !== null) {
    const block = match[1];
    const dtMatch = /DTSTART(?:;VALUE=DATE)?:(\d{8})/.exec(block);
    const summaryMatch = /SUMMARY:(.*)/.exec(block);

    if (dtMatch && summaryMatch) {
      const rawDate = dtMatch[1];
      const y = parseInt(rawDate.substring(0, 4), 10);
      const m = rawDate.substring(4, 6);
      const d = rawDate.substring(6, 8);
      const dateStr = `${y}-${m}-${d}`;
      const description = summaryMatch[1].replace(/\\,/g, ',').replace(/\\;/g, ';').trim();

      const isCutiBersama = /cuti bersama/i.test(description);

      results.push({
        holiday_date: dateStr,
        description,
        is_cuti_bersama: isCutiBersama,
        is_official: true,
        year: y
      });
    }
  }

  return results;
}

/**
 * Fetch official Indonesian holidays dynamically from live feeds with fallback
 */
export async function fetchOfficialIndonesianHolidays(targetYears?: number[]): Promise<{ holidays: Holiday[]; source: string }> {
  const currentYear = new Date().getFullYear();
  const years = (targetYears && targetYears.length > 0)
    ? Array.from(new Set(targetYears))
    : [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const holidayMap = new Map<string, Holiday>();
  let successfulSource = 'Baseline / Seed';

  // 1. PRIMARY SOURCE: Google Calendar official live Indonesian Holiday feed
  try {
    const gCalRes = await fetchWithTimeout(GOOGLE_CALENDAR_ID_ICS, 6000);
    if (gCalRes.ok) {
      const icsText = await gCalRes.text();
      const gCalEvents = parseGoogleCalendarIcs(icsText);

      for (const ev of gCalEvents) {
        if (!ev.year || years.includes(ev.year)) {
          holidayMap.set(ev.holiday_date, ev);
        }
      }
      if (gCalEvents.length > 0) {
        successfulSource = 'Google Calendar (Resmi Indonesia)';
      }
    }
  } catch (err) {
    console.warn('Google Calendar iCal fetch warning:', err);
  }

  // 2. SECONDARY ENRICHMENT: SKB 3 Menteri Data from api-hari-libur
  try {
    await Promise.all(
      years.map(async (y) => {
        try {
          const res = await fetchWithTimeout(`${API_HARI_LIBUR_RAW_BASE}/${y}.json`, 4000);
          if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list)) {
              for (const item of list) {
                if (item.date && item.description) {
                  const existing = holidayMap.get(item.date);
                  const isCuti = /cuti bersama/i.test(item.description);
                  // If not exists or this description is more specific
                  if (!existing || item.description.length > existing.description.length) {
                    holidayMap.set(item.date, {
                      holiday_date: item.date,
                      description: item.description,
                      is_cuti_bersama: isCuti,
                      is_official: true,
                      year: y
                    });
                  }
                }
              }
              successfulSource = successfulSource.includes('Google')
                ? 'Google Calendar & SKB 3 Menteri RI'
                : 'SKB 3 Menteri RI Live Feed';
            }
          }
        } catch {
          // Ignore individual year fetch errors
        }
      })
    );
  } catch (err) {
    console.warn('Secondary holiday API fetch warning:', err);
  }

  // 3. TERTIARY BACKUP: Guangrei APIHariLibur mirror if map is still empty
  if (holidayMap.size === 0) {
    try {
      const mirrorRes = await fetchWithTimeout(GUANGREI_MIRROR_RAW, 5000);
      if (mirrorRes.ok) {
        const mirrorData = await mirrorRes.json();
        for (const [dateStr, info] of Object.entries(mirrorData as Record<string, any>)) {
          const y = parseInt(dateStr.substring(0, 4), 10);
          if (years.includes(y)) {
            const summary = Array.isArray(info.summary) ? info.summary[0] : (info.summary || 'Hari Libur Nasional');
            holidayMap.set(dateStr, {
              holiday_date: dateStr,
              description: summary,
              is_cuti_bersama: /cuti bersama/i.test(summary),
              is_official: true,
              year: y
            });
          }
        }
        if (holidayMap.size > 0) {
          successfulSource = 'Kalender Nasional RI Mirror';
        }
      }
    } catch (err) {
      console.warn('Guangrei mirror fetch warning:', err);
    }
  }

  // 4. OFFLINE FALLBACK: Seed holidays if network completely failed
  if (holidayMap.size === 0) {
    for (const h of SEED_HOLIDAYS) {
      const y = parseInt(h.holiday_date.substring(0, 4), 10);
      holidayMap.set(h.holiday_date, {
        ...h,
        is_cuti_bersama: /cuti bersama/i.test(h.description),
        is_official: true,
        year: y
      });
    }
    successfulSource = 'Offline Seed Baseline (2026)';
  }

  // Sort chronologically
  const holidays = Array.from(holidayMap.values()).sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));

  return { holidays, source: successfulSource };
}

/**
 * Get metadata about last holiday sync
 */
export function getHolidaySyncMeta(): HolidaySyncMeta {
  if (typeof window === 'undefined') {
    return { lastSync: null, totalHolidays: 0, years: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_SYNC);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        lastSync: parsed.syncedAt || null,
        totalHolidays: parsed.totalCount || 0,
        years: parsed.years || []
      };
    }
  } catch (e) {
    console.warn('Error reading holiday sync meta:', e);
  }
  return { lastSync: null, totalHolidays: 0, years: [] };
}

/**
 * Save sync metadata
 */
export function setHolidaySyncMeta(meta: { syncedAt: string; totalCount: number; years: number[] }): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_LAST_SYNC, JSON.stringify(meta));
  } catch (e) {
    console.warn('Error saving holiday sync meta:', e);
  }
}

/**
 * Check if auto-sync is needed
 */
export function shouldAutoSyncHolidays(existingHolidays: Holiday[]): boolean {
  if (typeof window === 'undefined') return false;

  const currentYear = new Date().getFullYear();
  const hasCurrentYear = existingHolidays.some(h => h.holiday_date.startsWith(`${currentYear}-`));
  if (!hasCurrentYear) return true;

  const meta = getHolidaySyncMeta();
  if (!meta.lastSync) return true;

  const lastSyncDate = new Date(meta.lastSync).getTime();
  const now = Date.now();
  if (now - lastSyncDate > SYNC_INTERVAL_MS) {
    return true;
  }

  return false;
}
