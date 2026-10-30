-- ========================================================================
-- CMOMS / ERP MIGRATION: Google Sheets Real-Time Sync Outbox
-- Description: Transactional outbox table for reliable, idempotent
--              synchronization of ERP requests to Google Spreadsheet.
-- Safe: Uses IF NOT EXISTS. Non-destructive.
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.google_sheets_sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL, -- 'CREATE_TASK', 'UPDATE_TASK', 'CREATE_MOTION', 'UPDATE_MOTION'
  entity_id TEXT NOT NULL,
  task_code TEXT NOT NULL,
  target_tab TEXT NOT NULL, -- 'Mockup', 'By Strategic', 'Motion'
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'SYNCED', 'FAILED'
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_attempt_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance & queue polling
CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created 
  ON public.google_sheets_sync_outbox(status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_task_code 
  ON public.google_sheets_sync_outbox(task_code);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_idempotency 
  ON public.google_sheets_sync_outbox(idempotency_key);

COMMENT ON TABLE public.google_sheets_sync_outbox IS 'Transactional outbox for reliable Google Sheets synchronization';
