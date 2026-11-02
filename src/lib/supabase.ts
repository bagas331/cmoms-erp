import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Supabase client instance (Anon Key - Client & Server safe).
 */
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Supabase Admin client instance (Service Role Key - Server-side only).
 * Bypasses RLS for system operations like file uploads to storage buckets.
 */
export const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : supabase;

/**
 * Check if Supabase is configured and available.
 */
export function isSupabaseConfigured(): boolean {
  return !!supabase;
}
