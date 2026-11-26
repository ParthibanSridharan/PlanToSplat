import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase is optional. When env vars are missing the app runs fully local:
 * projects in server memory + splat binaries in browser IndexedDB.
 *
 * Expected schema (run once in the Supabase SQL editor):
 *
 *   create table public.projects (
 *     id text primary key,
 *     name text not null,
 *     kind text not null default 'interior',
 *     status text not null default 'draft',
 *     splat_url text,
 *     splat_format text,
 *     flip_y boolean not null default false,
 *     image_count int not null default 0,
 *     job_id text,
 *     heightmap_url text,
 *     staged jsonb not null default '[]',
 *     created_at timestamptz not null default now(),
 *     updated_at timestamptz not null default now()
 *   );
 *   -- Storage bucket (public read): `splats` for .splat / .spz / .ply / .glb / source images
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'splats';

let browserClient: SupabaseClient | null = null;

/** Browser client (anon key, RLS-governed). */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) browserClient = createClient(url!, anonKey!);
  return browserClient;
}

/** Server client for API routes (service role key if present). Never import into client components. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!url) return null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;
  if (!key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
