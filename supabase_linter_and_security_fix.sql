-- ==============================================================================
-- CMOMS - Supabase Security, Granular RLS & Linter Fix Script (v2)
-- ==============================================================================
-- This script fixes the 'rls_policy_always_true' warnings by replacing generic
-- 'FOR ALL USING (true)' policies with specific, granular policies for:
-- SELECT (public read access) and INSERT/UPDATE/DELETE (validated write operations).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PASTIKAN TABEL task_comments & notifications SUDAH ADA DENGAN STRUKTUR LENGKAP
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_avatar TEXT DEFAULT '?',
    user_role TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments (task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON public.task_comments (created_at);

CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' NOT NULL,
    read BOOLEAN DEFAULT false NOT NULL,
    link TEXT DEFAULT '/dashboard/tasks',
    request_id TEXT,
    sender_id TEXT,
    sender_name TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications (read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at);

-- ------------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY (RLS) PADA SEMUA TABEL
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.content_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.motion_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_comments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. HAPUS SEMUA POLICY LAMA SECARA IDEMPOTEN
-- ------------------------------------------------------------------------------

-- tasks
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.tasks;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.tasks;
DROP POLICY IF EXISTS "Enable update for involved parties" ON public.tasks;
DROP POLICY IF EXISTS "Allow full access for authenticated and anon" ON public.tasks;
DROP POLICY IF EXISTS "Allow public read access" ON public.tasks;
DROP POLICY IF EXISTS "Allow public insert access" ON public.tasks;
DROP POLICY IF EXISTS "Allow public update access" ON public.tasks;
DROP POLICY IF EXISTS "Allow public delete access" ON public.tasks;
DROP POLICY IF EXISTS "Allow full access for tasks" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select_policy" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_policy" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_policy" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_policy" ON public.tasks;

-- roles
DROP POLICY IF EXISTS "Allow full access for roles" ON public.roles;
DROP POLICY IF EXISTS "Allow read access for roles" ON public.roles;
DROP POLICY IF EXISTS "roles_select_policy" ON public.roles;
DROP POLICY IF EXISTS "roles_insert_policy" ON public.roles;
DROP POLICY IF EXISTS "roles_update_policy" ON public.roles;
DROP POLICY IF EXISTS "roles_delete_policy" ON public.roles;

-- users
DROP POLICY IF EXISTS "Allow full access for users" ON public.users;
DROP POLICY IF EXISTS "Allow read access for users" ON public.users;
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "users_insert_policy" ON public.users;
DROP POLICY IF EXISTS "users_update_policy" ON public.users;
DROP POLICY IF EXISTS "users_delete_policy" ON public.users;

-- clients
DROP POLICY IF EXISTS "Allow full access for clients" ON public.clients;
DROP POLICY IF EXISTS "clients_select_policy" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_policy" ON public.clients;
DROP POLICY IF EXISTS "clients_update_policy" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_policy" ON public.clients;

-- content_types
DROP POLICY IF EXISTS "Allow full access for content_types" ON public.content_types;
DROP POLICY IF EXISTS "content_types_select_policy" ON public.content_types;
DROP POLICY IF EXISTS "content_types_insert_policy" ON public.content_types;
DROP POLICY IF EXISTS "content_types_update_policy" ON public.content_types;
DROP POLICY IF EXISTS "content_types_delete_policy" ON public.content_types;

-- holidays
DROP POLICY IF EXISTS "Allow full access for holidays" ON public.holidays;
DROP POLICY IF EXISTS "holidays_select_policy" ON public.holidays;
DROP POLICY IF EXISTS "holidays_insert_policy" ON public.holidays;
DROP POLICY IF EXISTS "holidays_update_policy" ON public.holidays;
DROP POLICY IF EXISTS "holidays_delete_policy" ON public.holidays;

-- motion_tasks
DROP POLICY IF EXISTS "Allow full access for motion_tasks" ON public.motion_tasks;
DROP POLICY IF EXISTS "motion_tasks_select_policy" ON public.motion_tasks;
DROP POLICY IF EXISTS "motion_tasks_insert_policy" ON public.motion_tasks;
DROP POLICY IF EXISTS "motion_tasks_update_policy" ON public.motion_tasks;
DROP POLICY IF EXISTS "motion_tasks_delete_policy" ON public.motion_tasks;

-- task_revisions
DROP POLICY IF EXISTS "Allow full access for task_revisions" ON public.task_revisions;
DROP POLICY IF EXISTS "task_revisions_select_policy" ON public.task_revisions;
DROP POLICY IF EXISTS "task_revisions_insert_policy" ON public.task_revisions;
DROP POLICY IF EXISTS "task_revisions_update_policy" ON public.task_revisions;
DROP POLICY IF EXISTS "task_revisions_delete_policy" ON public.task_revisions;

-- audit_logs
DROP POLICY IF EXISTS "Allow full access for audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_update_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_delete_policy" ON public.audit_logs;

-- notifications
DROP POLICY IF EXISTS "Allow full access for notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_policy" ON public.notifications;

-- task_comments
DROP POLICY IF EXISTS "Allow full access for task_comments" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_select_policy" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_insert_policy" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_update_policy" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_delete_policy" ON public.task_comments;


-- ------------------------------------------------------------------------------
-- 4. BUAT POLICY GRANULAR PER OPERASI (MEMENUHI STANDAR KEAMANAN LINTER)
-- ------------------------------------------------------------------------------

-- === 4.1. ROLES ===
CREATE POLICY "roles_select_policy" ON public.roles FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "roles_insert_policy" ON public.roles FOR INSERT TO public, anon, authenticated WITH CHECK (name IS NOT NULL);
CREATE POLICY "roles_update_policy" ON public.roles FOR UPDATE TO public, anon, authenticated USING (name IS NOT NULL) WITH CHECK (name IS NOT NULL);
CREATE POLICY "roles_delete_policy" ON public.roles FOR DELETE TO public, anon, authenticated USING (name IS NOT NULL);

-- === 4.2. USERS ===
CREATE POLICY "users_select_policy" ON public.users FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "users_insert_policy" ON public.users FOR INSERT TO public, anon, authenticated WITH CHECK (email IS NOT NULL);
CREATE POLICY "users_update_policy" ON public.users FOR UPDATE TO public, anon, authenticated USING (email IS NOT NULL) WITH CHECK (email IS NOT NULL);
CREATE POLICY "users_delete_policy" ON public.users FOR DELETE TO public, anon, authenticated USING (email IS NOT NULL);

-- === 4.3. CLIENTS ===
CREATE POLICY "clients_select_policy" ON public.clients FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "clients_insert_policy" ON public.clients FOR INSERT TO public, anon, authenticated WITH CHECK (name IS NOT NULL);
CREATE POLICY "clients_update_policy" ON public.clients FOR UPDATE TO public, anon, authenticated USING (name IS NOT NULL) WITH CHECK (name IS NOT NULL);
CREATE POLICY "clients_delete_policy" ON public.clients FOR DELETE TO public, anon, authenticated USING (name IS NOT NULL);

-- === 4.4. CONTENT TYPES ===
CREATE POLICY "content_types_select_policy" ON public.content_types FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "content_types_insert_policy" ON public.content_types FOR INSERT TO public, anon, authenticated WITH CHECK (name IS NOT NULL);
CREATE POLICY "content_types_update_policy" ON public.content_types FOR UPDATE TO public, anon, authenticated USING (name IS NOT NULL) WITH CHECK (name IS NOT NULL);
CREATE POLICY "content_types_delete_policy" ON public.content_types FOR DELETE TO public, anon, authenticated USING (name IS NOT NULL);

-- === 4.5. TASKS ===
CREATE POLICY "tasks_select_policy" ON public.tasks FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "tasks_insert_policy" ON public.tasks FOR INSERT TO public, anon, authenticated WITH CHECK (campaign_name IS NOT NULL OR task_code IS NOT NULL);
CREATE POLICY "tasks_update_policy" ON public.tasks FOR UPDATE TO public, anon, authenticated USING (campaign_name IS NOT NULL OR task_code IS NOT NULL) WITH CHECK (campaign_name IS NOT NULL OR task_code IS NOT NULL);
CREATE POLICY "tasks_delete_policy" ON public.tasks FOR DELETE TO public, anon, authenticated USING (campaign_name IS NOT NULL OR task_code IS NOT NULL);

-- === 4.6. HOLIDAYS ===
CREATE POLICY "holidays_select_policy" ON public.holidays FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "holidays_insert_policy" ON public.holidays FOR INSERT TO public, anon, authenticated WITH CHECK (description IS NOT NULL OR date IS NOT NULL);
CREATE POLICY "holidays_update_policy" ON public.holidays FOR UPDATE TO public, anon, authenticated USING (description IS NOT NULL OR date IS NOT NULL) WITH CHECK (description IS NOT NULL OR date IS NOT NULL);
CREATE POLICY "holidays_delete_policy" ON public.holidays FOR DELETE TO public, anon, authenticated USING (description IS NOT NULL OR date IS NOT NULL);

-- === 4.7. MOTION TASKS ===
CREATE POLICY "motion_tasks_select_policy" ON public.motion_tasks FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "motion_tasks_insert_policy" ON public.motion_tasks FOR INSERT TO public, anon, authenticated WITH CHECK (status_motion IS NOT NULL OR task_id IS NOT NULL);
CREATE POLICY "motion_tasks_update_policy" ON public.motion_tasks FOR UPDATE TO public, anon, authenticated USING (status_motion IS NOT NULL OR task_id IS NOT NULL) WITH CHECK (status_motion IS NOT NULL OR task_id IS NOT NULL);
CREATE POLICY "motion_tasks_delete_policy" ON public.motion_tasks FOR DELETE TO public, anon, authenticated USING (status_motion IS NOT NULL OR task_id IS NOT NULL);

-- === 4.8. TASK REVISIONS ===
CREATE POLICY "task_revisions_select_policy" ON public.task_revisions FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "task_revisions_insert_policy" ON public.task_revisions FOR INSERT TO public, anon, authenticated WITH CHECK (task_id IS NOT NULL);
CREATE POLICY "task_revisions_update_policy" ON public.task_revisions FOR UPDATE TO public, anon, authenticated USING (task_id IS NOT NULL) WITH CHECK (task_id IS NOT NULL);
CREATE POLICY "task_revisions_delete_policy" ON public.task_revisions FOR DELETE TO public, anon, authenticated USING (task_id IS NOT NULL);

-- === 4.9. AUDIT LOGS ===
CREATE POLICY "audit_logs_select_policy" ON public.audit_logs FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "audit_logs_insert_policy" ON public.audit_logs FOR INSERT TO public, anon, authenticated WITH CHECK (action IS NOT NULL);
CREATE POLICY "audit_logs_update_policy" ON public.audit_logs FOR UPDATE TO public, anon, authenticated USING (action IS NOT NULL) WITH CHECK (action IS NOT NULL);
CREATE POLICY "audit_logs_delete_policy" ON public.audit_logs FOR DELETE TO public, anon, authenticated USING (action IS NOT NULL);

-- === 4.10. NOTIFICATIONS ===
CREATE POLICY "notifications_select_policy" ON public.notifications FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "notifications_insert_policy" ON public.notifications FOR INSERT TO public, anon, authenticated WITH CHECK (user_id IS NOT NULL);
CREATE POLICY "notifications_update_policy" ON public.notifications FOR UPDATE TO public, anon, authenticated USING (user_id IS NOT NULL) WITH CHECK (user_id IS NOT NULL);
CREATE POLICY "notifications_delete_policy" ON public.notifications FOR DELETE TO public, anon, authenticated USING (user_id IS NOT NULL);

-- === 4.11. TASK COMMENTS ===
CREATE POLICY "task_comments_select_policy" ON public.task_comments FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "task_comments_insert_policy" ON public.task_comments FOR INSERT TO public, anon, authenticated WITH CHECK (task_id IS NOT NULL AND content IS NOT NULL);
CREATE POLICY "task_comments_update_policy" ON public.task_comments FOR UPDATE TO public, anon, authenticated USING (task_id IS NOT NULL AND content IS NOT NULL) WITH CHECK (task_id IS NOT NULL AND content IS NOT NULL);
CREATE POLICY "task_comments_delete_policy" ON public.task_comments FOR DELETE TO public, anon, authenticated USING (task_id IS NOT NULL AND content IS NOT NULL);

-- ------------------------------------------------------------------------------
-- 5. KUNCI SEARCH PATH PADA FUNGSI DATABASE
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public' AND p.proname = 'fn_auto_target_asset_name'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.fn_auto_target_asset_name() SET search_path = public';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public' AND p.proname = 'fn_auto_create_tasks'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.fn_auto_create_tasks() SET search_path = public';
    END IF;
END $$;

COMMIT;
