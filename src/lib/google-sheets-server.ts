// ============================================================
// CMOS - Creative & Motion Operations System
// Server-Only Google Sheets Synchronizer (Node.js & API Route Only)
// ============================================================

import { JWT } from 'google-auth-library';
import {
  GoogleSheetsSyncOutboxItem,
  SyncOutboxStatus,
  SyncTargetTab,
} from './types';
import {
  getTabHeaders,
  formatRowValuesForTab,
  getTargetSpreadsheetId,
  updateOutboxItemStatus,
  localOutboxStore,
} from './google-sheets-outbox';
import { supabase } from './supabase';

// ============================================================
// GOOGLE AUTHENTICATION CLIENT (SERVER-SIDE ONLY)
// ============================================================

export interface GoogleServiceAccountConfig {
  clientEmail: string;
  privateKey: string;
}

export function getGoogleServiceAccountConfig(): GoogleServiceAccountConfig | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    return null;
  }

  // Handle escaped newlines in env variables
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }

  return { clientEmail: email.trim(), privateKey: key.trim() };
}

let cachedAuthClient: JWT | null = null;

export function getGoogleAuthClient(): JWT | null {
  const config = getGoogleServiceAccountConfig();
  if (!config) return null;

  if (cachedAuthClient) return cachedAuthClient;

  cachedAuthClient = new JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return cachedAuthClient;
}

// ============================================================
// GOOGLE SHEETS API CALLERS (REST)
// ============================================================

async function fetchWithGoogleAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const client = getGoogleAuthClient();
  if (!client) {
    throw new Error('Google Service Account credentials (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY) are not configured.');
  }

  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse?.token;
  if (!token) {
    throw new Error('Failed to obtain Google OAuth access token from Service Account credentials.');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  return res;
}

/**
 * Ensures that the header row exists in the specified tab.
 * If empty, initializes row 1 with standard column names.
 */
export async function ensureTabHeaders(spreadsheetId: string, tab: SyncTargetTab): Promise<void> {
  const encodedTab = encodeURIComponent(tab);
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTab}!A1:Z1`;

  const getRes = await fetchWithGoogleAuth(getUrl, { method: 'GET' });
  if (!getRes.ok) {
    const errorText = await getRes.text();
    throw new Error(`Failed to check tab headers for '${tab}' (HTTP ${getRes.status}): ${errorText}`);
  }

  const data = await getRes.json();
  const hasHeaders = data.values && data.values.length > 0 && data.values[0].length > 0;

  if (!hasHeaders) {
    const headers = getTabHeaders(tab);
    const putUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTab}!A1?valueInputOption=USER_ENTERED`;
    const putRes = await fetchWithGoogleAuth(putUrl, {
      method: 'PUT',
      body: JSON.stringify({
        range: `${tab}!A1`,
        majorDimension: 'ROWS',
        values: [headers],
      }),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      throw new Error(`Failed to initialize headers on tab '${tab}' (HTTP ${putRes.status}): ${errText}`);
    }
  }
}

/**
 * Appends or updates a row in the destination tab.
 * Deduplicates by searching Column B ('Request Code').
 */
export async function syncRecordToGoogleSheets(
  spreadsheetId: string,
  tab: SyncTargetTab,
  requestCode: string,
  rowValues: (string | number | null | undefined)[]
): Promise<{ action: 'APPEND' | 'UPDATE'; rowNumber: number }> {
  // Ensure headers exist
  await ensureTabHeaders(spreadsheetId, tab);

  const encodedTab = encodeURIComponent(tab);

  // Search existing Column B for requestCode
  const colBUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTab}!B:B`;
  const colBRes = await fetchWithGoogleAuth(colBUrl, { method: 'GET' });
  if (!colBRes.ok) {
    const errText = await colBRes.text();
    throw new Error(`Failed to read Column B for '${tab}' (HTTP ${colBRes.status}): ${errText}`);
  }

  const colBData = await colBRes.json();
  const rows: string[][] = colBData.values || [];

  let existingRowIndex = -1; // 1-based index
  const normalizedTargetCode = requestCode.trim().toLowerCase();

  for (let i = 0; i < rows.length; i++) {
    const cellValue = (rows[i][0] || '').trim().toLowerCase();
    if (cellValue === normalizedTargetCode) {
      existingRowIndex = i + 1;
      break;
    }
  }

  // Clean values for spreadsheet JSON
  const sanitizedValues = rowValues.map((v) => (v === null || v === undefined ? '' : String(v)));

  if (existingRowIndex > 0) {
    // UPDATE existing row
    const updateRange = `${tab}!A${existingRowIndex}`;
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`;
    const updateRes = await fetchWithGoogleAuth(updateUrl, {
      method: 'PUT',
      body: JSON.stringify({
        range: updateRange,
        majorDimension: 'ROWS',
        values: [sanitizedValues],
      }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Failed to update existing row ${existingRowIndex} in '${tab}' (HTTP ${updateRes.status}): ${errText}`);
    }

    return { action: 'UPDATE', rowNumber: existingRowIndex };
  } else {
    // APPEND new row
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTab}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const appendRes = await fetchWithGoogleAuth(appendUrl, {
      method: 'POST',
      body: JSON.stringify({
        range: `${tab}!A1`,
        majorDimension: 'ROWS',
        values: [sanitizedValues],
      }),
    });

    if (!appendRes.ok) {
      const errText = await appendRes.text();
      throw new Error(`Failed to append new row to '${tab}' (HTTP ${appendRes.status}): ${errText}`);
    }

    const appendData = await appendRes.json();
    let rowNumber = rows.length + 1;
    const updatedRange: string = appendData.updates?.updatedRange || '';
    const match = updatedRange.match(/!A(\d+)/);
    if (match) {
      rowNumber = parseInt(match[1], 10);
    }

    return { action: 'APPEND', rowNumber };
  }
}

// ============================================================
// BACKGROUND SYNC WORKER (NON-BLOCKING & RESILIENT)
// ============================================================

let isWorkerRunning = false;

export async function processSyncOutbox(): Promise<{ processed: number; succeeded: number; failed: number }> {
  if (isWorkerRunning) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  isWorkerRunning = true;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const spreadsheetId = getTargetSpreadsheetId();
    const config = getGoogleServiceAccountConfig();

    let pendingItems: GoogleSheetsSyncOutboxItem[] = [];

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('google_sheets_sync_outbox')
          .select('*')
          .in('status', ['PENDING', 'PROCESSING'])
          .order('created_at', { ascending: true })
          .limit(10);

        if (!error && data) {
          pendingItems = data as GoogleSheetsSyncOutboxItem[];
        }
      } catch {
        // Ignore
      }
    }

    if (pendingItems.length === 0) {
      pendingItems = localOutboxStore
        .filter((i) => i.status === 'PENDING' || i.status === 'PROCESSING')
        .slice(0, 10);
    }

    for (const item of pendingItems) {
      processed++;
      const now = new Date().toISOString();

      // If Google Service Account is unconfigured, record as PENDING with descriptive message
      if (!config) {
        const unconfiguredMsg =
          'Google Service Account credentials (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY) are not set in environment. Waiting for configuration.';
        await updateOutboxItemStatus(item.id, 'PENDING', {
          attempts: item.attempts + 1,
          last_attempt_at: now,
          error_message: unconfiguredMsg,
        });
        continue;
      }

      try {
        const rowValues = formatRowValuesForTab(item.target_tab, item.payload);
        await syncRecordToGoogleSheets(spreadsheetId, item.target_tab, item.task_code, rowValues);

        await updateOutboxItemStatus(item.id, 'SYNCED', {
          synced_at: now,
          last_attempt_at: now,
          error_message: null,
        });
        succeeded++;
      } catch (err) {
        failed++;
        const errorMessage = (err as Error).message || String(err);
        const newAttempts = item.attempts + 1;
        const newStatus: SyncOutboxStatus = newAttempts >= item.max_attempts ? 'FAILED' : 'PENDING';

        await updateOutboxItemStatus(item.id, newStatus, {
          attempts: newAttempts,
          last_attempt_at: now,
          error_message: errorMessage,
        });
      }
    }
  } finally {
    isWorkerRunning = false;
  }

  return { processed, succeeded, failed };
}
