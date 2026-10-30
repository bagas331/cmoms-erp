-- ========================================================================
-- CMOMS / ERP MIGRATION: Historical Revision Asset Links Preservation
-- Description: Adds snapshot columns to task_revisions to explicitly track
--              asset link, asset name, submitter, and submission timestamp
--              across all revision cycles for GD Mockup, Non-Mockup, Strategic, and Motion.
-- Safe: Uses IF NOT EXISTS. Non-destructive.
-- Note: DO NOT run on production without staging review.
-- ========================================================================

-- 1. Add asset snapshot columns to task_revisions table
ALTER TABLE public.task_revisions
  ADD COLUMN IF NOT EXISTS asset_link TEXT,
  ADD COLUMN IF NOT EXISTS asset_name TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- 2. Create index for query optimization on task revisions
CREATE INDEX IF NOT EXISTS idx_task_revisions_task_id_created 
  ON public.task_revisions(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_revisions_stage 
  ON public.task_revisions(stage);

-- 3. Document columns
COMMENT ON COLUMN public.task_revisions.asset_link IS 'Snapshot of final_asset_link, strat_concept_link, or link_motion at the time revision was requested';
COMMENT ON COLUMN public.task_revisions.asset_name IS 'Snapshot of the asset name at the time revision was requested';
COMMENT ON COLUMN public.task_revisions.submitted_by IS 'ID of the PIC who submitted the asset that is being revised';
COMMENT ON COLUMN public.task_revisions.submitted_at IS 'Timestamp of when the asset being revised was originally submitted';
