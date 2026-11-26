'use client';

import type { Project, ReconstructionJob } from '@/types';

/**
 * Browser-side project API. Mirrors records in localStorage so locally-stored projects
 * (no Supabase) survive a dev-server restart, which wipes the in-memory server store.
 */

const CACHE_KEY = 'pts:projects';

function readCache(): Record<string, Project> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(p: Project) {
  try {
    const all = readCache();
    all[p.id] = p;
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: server copy is still authoritative */
  }
}

export function cachedProjects(): Project[] {
  return Object.values(readCache()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createProject(input: Partial<Project> & Pick<Project, 'name' | 'kind'>): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Create failed (${res.status})`);
  const p = (await res.json()) as Project;
  writeCache(p);
  return p;
}

export async function fetchProject(id: string): Promise<Project | null> {
  try {
    const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (res.ok) {
      const p = (await res.json()) as Project;
      writeCache(p);
      return p;
    }
  } catch {
    /* fall through to cache */
  }
  const cached = readCache()[id];
  if (cached) {
    // Re-seed the server store (memory backend lost it on restart).
    fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cached) }).catch(() => {});
  }
  return cached ?? null;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<Project | null> {
  const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (res.ok) {
    const p = (await res.json()) as Project;
    writeCache(p);
    return p;
  }
  const cached = readCache()[id];
  if (cached) {
    const merged = { ...cached, ...patch, updatedAt: new Date().toISOString() };
    writeCache(merged);
    return merged;
  }
  return null;
}

export async function startReconstruction(projectId: string, imageUrls: string[]): Promise<ReconstructionJob> {
  const res = await fetch('/api/process', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, imageUrls }),
  });
  if (!res.ok) throw new Error(`Reconstruction request failed (${res.status})`);
  return res.json();
}

export async function pollJob(jobId: string): Promise<ReconstructionJob> {
  const res = await fetch(`/api/process?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Job lookup failed (${res.status})`);
  return res.json();
}
