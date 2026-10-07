-- ==============================================================================
-- CMOMS - Supabase Chat Feature Upgrade & Schema Migration
-- ==============================================================================
-- Menambahkan kolom pendukung fitur Chat:
-- 1. Attachment (URL, Type, Name)
-- 2. Edit metadata (is_edited, edited_at)
-- 3. Soft Delete metadata (is_deleted, deleted_at, deleted_by)
-- 4. Group Read receipts (read_by)
-- 5. User role tracking (user_role)
-- 6. Indexes untuk performa dan latency rendah
-- ==============================================================================

BEGIN;

-- 1. Tambah kolom pada tabel task_comments
ALTER TABLE IF EXISTS public.task_comments
    ADD COLUMN IF NOT EXISTS user_role TEXT,
    ADD COLUMN IF NOT EXISTS attachment_url TEXT,
    ADD COLUMN IF NOT EXISTS attachment_type TEXT,
    ADD COLUMN IF NOT EXISTS attachment_name TEXT,
    ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT,
    ADD COLUMN IF NOT EXISTS read_by TEXT[] DEFAULT '{}';

-- 2. Buat index untuk pencarian cepat berdasarkan task_id dan created_at
CREATE INDEX IF NOT EXISTS idx_task_comments_task_created ON public.task_comments (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON public.task_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_is_deleted ON public.task_comments (is_deleted);

-- 3. Pastikan RLS diaktifkan
ALTER TABLE IF EXISTS public.task_comments ENABLE ROW LEVEL SECURITY;

-- 4. Perbarui RLS policies
DROP POLICY IF EXISTS "task_comments_select_policy" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_insert_policy" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_update_policy" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_delete_policy" ON public.task_comments;

CREATE POLICY "task_comments_select_policy" 
    ON public.task_comments FOR SELECT 
    TO public, anon, authenticated 
    USING (true);

CREATE POLICY "task_comments_insert_policy" 
    ON public.task_comments FOR INSERT 
    TO public, anon, authenticated 
    WITH CHECK (task_id IS NOT NULL AND content IS NOT NULL);

CREATE POLICY "task_comments_update_policy" 
    ON public.task_comments FOR UPDATE 
    TO public, anon, authenticated 
    USING (task_id IS NOT NULL AND content IS NOT NULL) 
    WITH CHECK (task_id IS NOT NULL AND content IS NOT NULL);

CREATE POLICY "task_comments_delete_policy" 
    ON public.task_comments FOR DELETE 
    TO public, anon, authenticated 
    USING (task_id IS NOT NULL AND content IS NOT NULL);

COMMIT;
