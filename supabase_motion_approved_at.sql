-- ============================================================
-- ADD approved_at COLUMN TO motion_tasks (IF NOT EXISTS)
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'motion_tasks' 
          AND column_name = 'approved_at'
    ) THEN
        ALTER TABLE public.motion_tasks 
        ADD COLUMN approved_at TIMESTAMPTZ DEFAULT NULL;

        COMMENT ON COLUMN public.motion_tasks.approved_at IS 'Timestamp when the motion task was approved or completed';
    END IF;
END $$;
