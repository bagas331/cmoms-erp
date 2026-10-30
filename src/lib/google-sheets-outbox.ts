// ============================================================
// CMOS - Creative & Motion Operations System
// Google Sheets Outbox & Payload Formatter (Browser & Server Safe)
// ============================================================

import {
  GoogleSheetsSyncOutboxItem,
  SyncOutboxStatus,
  SyncOutboxSummary,
  SyncTargetTab,
  CreativeTask,
  MotionTask,
} from './types';
import { supabase } from './supabase';

export const DEFAULT_SYNC_SPREADSHEET_ID = '1zdjgN5v9QOtgkspkNgMbIkejK6N4py1IOtSmnlvG2G4';

export function getTargetSpreadsheetId(): string {
  if (typeof process !== 'undefined' && process.env) {
    return (
      process.env.GOOGLE_SHEETS_SYNC_SPREADSHEET_ID ||
      process.env.GOOGLE_SPREADSHEET_ID ||
      DEFAULT_SYNC_SPREADSHEET_ID
    );
  }
  return DEFAULT_SYNC_SPREADSHEET_ID;
}

// ============================================================
// STANDARD COLUMN HEADERS
// ============================================================

export const MOCKUP_TAB_HEADERS = [
  'Timestamp',
  'Request Code',
  'Brand / Client',
  'Campaign',
  'Content Type',
  'Pipeline',
  'Source',
  'Platform',
  'Req Date',
  'Due Date',
  'Req Qty',
  'Output Qty',
  'Status Design',
  'GD PIC',
  'Difficulty',
  'Revision Count',
  'Asset Name',
  'Asset Link',
  'Notes',
];

export const STRATEGIC_TAB_HEADERS = [
  'Timestamp',
  'Request Code',
  'Brand / Client',
  'Campaign',
  'Content Type',
  'Source',
  'Platform',
  'Req Date',
  'Due Date',
  'Strategic PIC',
  'Status Strategic',
  'Concept Link',
  'GD PIC',
  'Status Design',
  'Revision Strat',
  'Revision Design',
  'Asset Name',
  'Asset Link',
  'Notes',
];

export const MOTION_TAB_HEADERS = [
  'Timestamp',
  'Request Code',
  'Brand / Client',
  'Campaign',
  'Platform',
  'Motion Type',
  'Production Date',
  'Period Start',
  'Period End',
  'Motion PIC',
  'Operator',
  'Studio',
  'Difficulty',
  'Revision Count',
  'Status Motion',
  'Asset Link',
  'Notes',
];

export function getTabHeaders(tab: SyncTargetTab): string[] {
  switch (tab) {
    case 'Mockup':
      return MOCKUP_TAB_HEADERS;
    case 'By Strategic':
      return STRATEGIC_TAB_HEADERS;
    case 'Motion':
      return MOTION_TAB_HEADERS;
  }
}

// ============================================================
// PAYLOAD FORMATTERS
// ============================================================

export function formatMockupRowValues(payload: Record<string, unknown>): (string | number | null)[] {
  return [
    String(payload.timestamp || new Date().toISOString()),
    String(payload.task_code || ''),
    String(payload.client_name || payload.brand || ''),
    String(payload.campaign_name || ''),
    String(payload.content_type_name || ''),
    String(payload.pipeline_type || 'GD_MOCKUP'),
    String(payload.task_source || ''),
    String(payload.platform || ''),
    String(payload.req_date || ''),
    String(payload.due_date || ''),
    Number(payload.req_qty || 1),
    Number(payload.output_qty || payload.req_qty || 1),
    String(payload.status_design || 'DESIGN_UNASSIGNED'),
    String(payload.design_pic_name || payload.design_pic_id || '-'),
    String(payload.design_difficulty || '-'),
    Number(payload.design_revision_count || 0),
    String(payload.final_asset_name || '-'),
    String(payload.final_asset_link || ''),
    String(payload.notes || ''),
  ];
}

export function formatStrategicRowValues(payload: Record<string, unknown>): (string | number | null)[] {
  return [
    String(payload.timestamp || new Date().toISOString()),
    String(payload.task_code || ''),
    String(payload.client_name || payload.brand || ''),
    String(payload.campaign_name || ''),
    String(payload.content_type_name || ''),
    String(payload.task_source || ''),
    String(payload.platform || ''),
    String(payload.req_date || ''),
    String(payload.due_date || ''),
    String(payload.strat_pic_names || payload.strat_pic_id || '-'),
    String(payload.status_strat || 'PENDING'),
    String(payload.strat_concept_link || ''),
    String(payload.design_pic_name || payload.design_pic_id || '-'),
    String(payload.status_design || 'STRAT_PENDING'),
    Number(payload.strat_revision_count || 0),
    Number(payload.design_revision_count || 0),
    String(payload.final_asset_name || '-'),
    String(payload.final_asset_link || ''),
    String(payload.notes || ''),
  ];
}

export function formatMotionRowValues(payload: Record<string, unknown>): (string | number | null)[] {
  return [
    String(payload.timestamp || new Date().toISOString()),
    String(payload.task_code || payload.motion_code || ''),
    String(payload.client_name || payload.brand || ''),
    String(payload.campaign_name || payload.campaign_type || ''),
    String(payload.platform || ''),
    String(payload.motion_type || '-'),
    String(payload.production_date || payload.req_date || ''),
    String(payload.period_start || ''),
    String(payload.period_end || ''),
    String(payload.motion_pic_name || payload.motion_pic_id || '-'),
    String(payload.operator_name || payload.operator_id || '-'),
    String(payload.studio || '-'),
    String(payload.motion_difficulty || payload.complexity || '-'),
    Number(payload.motion_revision_count || 0),
    String(payload.status_motion || 'QUEUED'),
    String(payload.link_motion || payload.final_asset_link || ''),
    String(payload.notes || ''),
  ];
}

export function formatRowValuesForTab(
  tab: SyncTargetTab,
  payload: Record<string, unknown>
): (string | number | null)[] {
  switch (tab) {
    case 'Mockup':
      return formatMockupRowValues(payload);
    case 'By Strategic':
      return formatStrategicRowValues(payload);
    case 'Motion':
      return formatMotionRowValues(payload);
  }
}

// ============================================================
// HELPER: BUILD SYNC PAYLOAD FROM ERP OBJECTS
// ============================================================

export function buildTaskSyncPayload(
  task: CreativeTask,
  clientName?: string,
  contentTypeName?: string,
  designerName?: string,
  stratPicNames?: string
): { targetTab: SyncTargetTab; payload: Record<string, unknown> } {
  const isStrategic =
    task.pipeline_type === 'STRATEGIC' || task.requires_strategic_concept;

  const targetTab: SyncTargetTab = isStrategic ? 'By Strategic' : 'Mockup';

  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    task_code: task.task_code,
    client_name: clientName || `Client #${task.client_id}`,
    brand: clientName || `Client #${task.client_id}`,
    campaign_name: task.campaign_name,
    content_type_name: contentTypeName || `Type #${task.content_type_id}`,
    pipeline_type: task.pipeline_type || (isStrategic ? 'STRATEGIC' : 'GD_MOCKUP'),
    task_source: task.task_source,
    platform: task.platform,
    req_date: task.req_date,
    due_date: task.due_date,
    req_qty: task.req_qty,
    output_qty: task.output_qty || task.req_qty,
    status_design: task.status_design,
    design_pic_name: designerName || task.design_pic_id || '-',
    design_pic_id: task.design_pic_id,
    design_difficulty: task.design_difficulty || '-',
    design_revision_count: task.design_revision_count || 0,
    strat_pic_names: stratPicNames || task.strat_pic_id || '-',
    status_strat: task.status_strat || 'NOT_REQUIRED',
    strat_concept_link: task.strat_concept_link || '',
    strat_revision_count: task.strat_revision_count || 0,
    final_asset_name: task.final_asset_name || '-',
    final_asset_link: task.final_asset_link || '',
    notes: task.notes || '',
  };

  return { targetTab, payload };
}

export function buildMotionTaskSyncPayload(
  motion: MotionTask,
  clientName?: string,
  motionPicName?: string,
  operatorName?: string
): { targetTab: SyncTargetTab; payload: Record<string, unknown> } {
  const targetTab: SyncTargetTab = 'Motion';

  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    task_code: motion.task_id ? `MOT-${motion.id.substring(0, 8)}` : `MOT-STANDALONE-${motion.id.substring(0, 8)}`,
    motion_code: `MOT-${motion.id.substring(0, 8)}`,
    client_name: clientName || (motion.client_id ? `Client #${motion.client_id}` : 'Internal'),
    brand: clientName || (motion.client_id ? `Client #${motion.client_id}` : 'Internal'),
    campaign_name: motion.campaign_type || 'BAU',
    campaign_type: motion.campaign_type || 'BAU',
    platform: motion.platform || 'TIKTOK',
    motion_type: motion.motion_type || 'Motion Graphic',
    production_date: motion.production_date || motion.apply_date || '',
    req_date: motion.production_date || motion.apply_date || '',
    period_start: motion.period_start || '',
    period_end: motion.period_end || '',
    motion_pic_name: motionPicName || motion.motion_pic_id || '-',
    motion_pic_id: motion.motion_pic_id,
    operator_name: operatorName || motion.operator_id || '-',
    operator_id: motion.operator_id,
    studio: motion.studio || 'Jakarta',
    motion_difficulty: motion.motion_difficulty,
    complexity: motion.motion_difficulty,
    motion_revision_count: motion.motion_revision_count || 0,
    status_motion: motion.status_motion,
    link_motion: motion.link_motion || '',
    final_asset_link: motion.link_motion || '',
    notes: motion.notes || '',
  };

  return { targetTab, payload };
}

// ============================================================
// IN-MEMORY FALLBACK OUTBOX (RESILIENT OFFLINE/DEV STORAGE)
// ============================================================

export const localOutboxStore: GoogleSheetsSyncOutboxItem[] = [];

// ============================================================
// OUTBOX QUEUING
// ============================================================

export interface EnqueueSyncParams {
  idempotencyKey: string;
  eventType: 'CREATE_TASK' | 'UPDATE_TASK' | 'CREATE_MOTION' | 'UPDATE_MOTION';
  entityId: string;
  taskCode: string;
  targetTab: SyncTargetTab;
  payload: Record<string, unknown>;
}

export async function enqueueGoogleSheetsSync(
  params: EnqueueSyncParams
): Promise<GoogleSheetsSyncOutboxItem> {
  const now = new Date().toISOString();
  const id = `sync-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  const item: GoogleSheetsSyncOutboxItem = {
    id,
    idempotency_key: params.idempotencyKey,
    event_type: params.eventType,
    entity_id: params.entityId,
    task_code: params.taskCode,
    target_tab: params.targetTab,
    payload: params.payload,
    status: 'PENDING',
    attempts: 0,
    max_attempts: 5,
    last_attempt_at: null,
    synced_at: null,
    error_message: null,
    created_at: now,
    updated_at: now,
  };

  // Try Supabase first
  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from('google_sheets_sync_outbox')
        .select('*')
        .eq('idempotency_key', params.idempotencyKey)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'SYNCED' || existing.status === 'PENDING') {
          return existing as GoogleSheetsSyncOutboxItem;
        }
      }

      const { data: inserted, error } = await supabase
        .from('google_sheets_sync_outbox')
        .insert([item])
        .select()
        .single();

      if (!error && inserted) {
        triggerWorkerBackground();
        return inserted as GoogleSheetsSyncOutboxItem;
      }
    } catch {
      // Fall through to local memory store
    }
  }

  // Fallback to local memory store
  const existingLocal = localOutboxStore.find((i) => i.idempotency_key === params.idempotencyKey);
  if (existingLocal) {
    if (existingLocal.status === 'SYNCED' || existingLocal.status === 'PENDING') {
      return existingLocal;
    }
  }

  localOutboxStore.push(item);
  triggerWorkerBackground();
  return item;
}

function triggerWorkerBackground(): void {
  // If in browser, trigger server worker via API call (non-blocking)
  if (typeof window !== 'undefined') {
    void fetch('/api/campaign/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'PROCESS_QUEUE' }),
    }).catch(() => {
      // Ignore background trigger failure
    });
  }
}

export async function updateOutboxItemStatus(
  id: string,
  status: SyncOutboxStatus,
  updates: Partial<GoogleSheetsSyncOutboxItem>
): Promise<void> {
  const now = new Date().toISOString();

  if (supabase) {
    try {
      await supabase
        .from('google_sheets_sync_outbox')
        .update({
          status,
          updated_at: now,
          ...updates,
        })
        .eq('id', id);
    } catch {
      // Ignore
    }
  }

  const localItem = localOutboxStore.find((i) => i.id === id);
  if (localItem) {
    localItem.status = status;
    localItem.updated_at = now;
    Object.assign(localItem, updates);
  }
}

export async function getSyncOutboxItems(limit = 50): Promise<GoogleSheetsSyncOutboxItem[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('google_sheets_sync_outbox')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && data) {
        return data as GoogleSheetsSyncOutboxItem[];
      }
    } catch {
      // Fallback
    }
  }

  return [...localOutboxStore]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

export async function getSyncOutboxSummary(): Promise<SyncOutboxSummary> {
  const items = await getSyncOutboxItems(500);

  let synced = 0;
  let pending = 0;
  let failed = 0;
  let lastSyncedAt: string | null = null;

  for (const item of items) {
    if (item.status === 'SYNCED') {
      synced++;
      if (!lastSyncedAt || (item.synced_at && new Date(item.synced_at) > new Date(lastSyncedAt))) {
        lastSyncedAt = item.synced_at;
      }
    } else if (item.status === 'PENDING' || item.status === 'PROCESSING') {
      pending++;
    } else if (item.status === 'FAILED') {
      failed++;
    }
  }

  return {
    total: items.length,
    synced,
    pending,
    failed,
    lastSyncedAt,
  };
}

export async function retryFailedOutboxItem(id: string): Promise<boolean> {
  await updateOutboxItemStatus(id, 'PENDING', {
    attempts: 0,
    error_message: null,
  });
  triggerWorkerBackground();
  return true;
}
