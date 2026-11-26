import 'server-only';
import type { Project } from '@/types';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabaseClient';

/** Project persistence: Supabase `projects` table when configured, otherwise process memory. */

type Row = {
  id: string;
  name: string;
  kind: Project['kind'];
  status: Project['status'];
  splat_url: string | null;
  splat_format: Project['splatFormat'];
  flip_y: boolean;
  image_count: number;
  job_id: string | null;
  heightmap_url: string | null;
  staged: Project['staged'];
  created_at: string;
  updated_at: string;
};

const toRow = (p: Project): Row => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  status: p.status,
  splat_url: p.splatUrl,
  splat_format: p.splatFormat,
  flip_y: p.flipY,
  image_count: p.imageCount,
  job_id: p.jobId,
  heightmap_url: p.heightmapUrl ?? null,
  staged: p.staged ?? [],
  created_at: p.createdAt,
  updated_at: p.updatedAt,
});

const fromRow = (r: Row): Project => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  status: r.status,
  splatUrl: r.splat_url,
  splatFormat: r.splat_format,
  flipY: r.flip_y,
  imageCount: r.image_count,
  jobId: r.job_id,
  heightmapUrl: r.heightmap_url,
  staged: r.staged ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const g = globalThis as unknown as { __pts_projects?: Map<string, Project> };
const memory = (g.__pts_projects ??= new Map<string, Project>());

export const storageBackend = isSupabaseConfigured ? 'supabase' : 'memory';

export async function listProjects(): Promise<Project[]> {
  const sb = getSupabaseAdmin();
  if (isSupabaseConfigured && sb) {
    const { data, error } = await sb.from('projects').select('*').order('updated_at', { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  }
  return [...memory.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | null> {
  const sb = getSupabaseAdmin();
  if (isSupabaseConfigured && sb) {
    const { data, error } = await sb.from('projects').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data as Row) : null;
  }
  return memory.get(id) ?? null;
}

export async function upsertProject(p: Project): Promise<Project> {
  const sb = getSupabaseAdmin();
  if (isSupabaseConfigured && sb) {
    const { data, error } = await sb.from('projects').upsert(toRow(p)).select('*').single();
    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  }
  memory.set(p.id, p);
  return p;
}

export async function patchProject(id: string, patch: Partial<Project>): Promise<Project | null> {
  const current = await getProject(id);
  if (!current) return null;
  return upsertProject({ ...current, ...patch, id, updatedAt: new Date().toISOString() });
}

export async function deleteProject(id: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  if (isSupabaseConfigured && sb) {
    const { error } = await sb.from('projects').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  }
  return memory.delete(id);
}
