import 'server-only';
import type { JobStage, ReconstructionJob } from '@/types';
import { patchProject } from './projectStore';

/**
 * Reconstruction job queue.
 *
 * - worker mode (RECON_WORKER_URL set): jobs are forwarded to an external GPU trainer
 *   (COLMAP SfM -> 3DGS optimisation, e.g. nerfstudio `splatfacto` or gsplat) and status is polled
 *   from `${RECON_WORKER_URL}/jobs/:id`.
 * - demo mode: a deterministic time-based pipeline that walks through the real stage sequence and
 *   resolves to the bundled sample splat, so the full UX can be exercised without a GPU.
 */

export const DEMO_SPLAT_URL = '/models/sample-loft.splat';

const STAGES: { stage: JobStage; until: number }[] = [
  { stage: 'queued', until: 0.05 },
  { stage: 'feature-extraction', until: 0.2 },
  { stage: 'sfm', until: 0.4 },
  { stage: 'densify', until: 0.55 },
  { stage: 'training', until: 0.9 },
  { stage: 'compressing', until: 1 },
];
const DEMO_DURATION_MS = 9000;

const g = globalThis as unknown as { __pts_jobs?: Map<string, ReconstructionJob> };
const jobs = (g.__pts_jobs ??= new Map<string, ReconstructionJob>());

export const workerUrl = process.env.RECON_WORKER_URL || '';

function workerHeaders(): HeadersInit {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.RECON_WORKER_TOKEN) h.authorization = `Bearer ${process.env.RECON_WORKER_TOKEN}`;
  return h;
}

export async function createJob(projectId: string, imageUrls: string[]): Promise<ReconstructionJob> {
  const id = `job_${Math.random().toString(36).slice(2, 12)}`;
  const now = Date.now();
  const job: ReconstructionJob = {
    id,
    projectId,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    mode: workerUrl ? 'worker' : 'demo',
    createdAt: now,
    updatedAt: now,
  };
  if (workerUrl) {
    const res = await fetch(`${workerUrl.replace(/\/$/, '')}/jobs`, {
      method: 'POST',
      headers: workerHeaders(),
      body: JSON.stringify({ jobId: id, projectId, images: imageUrls }),
    });
    if (!res.ok) {
      job.status = 'failed';
      job.stage = 'failed';
      job.message = `Worker rejected job (${res.status})`;
    }
  }
  jobs.set(id, job);
  await patchProject(projectId, { status: job.status === 'failed' ? 'failed' : 'queued', jobId: id });
  return job;
}

export async function getJob(id: string): Promise<ReconstructionJob | null> {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === 'done' || job.status === 'failed') return job;

  if (job.mode === 'worker') {
    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, '')}/jobs/${id}`, { headers: workerHeaders(), cache: 'no-store' });
      if (res.ok) {
        const w = (await res.json()) as Partial<ReconstructionJob> & { splatUrl?: string };
        Object.assign(job, {
          status: w.status ?? job.status,
          stage: w.stage ?? job.stage,
          progress: w.progress ?? job.progress,
          message: w.message,
          splatUrl: w.splatUrl,
          updatedAt: Date.now(),
        });
      }
    } catch (e) {
      job.message = `Worker unreachable: ${(e as Error).message}`;
    }
  } else {
    const p = Math.min(1, (Date.now() - job.createdAt) / DEMO_DURATION_MS);
    job.progress = p;
    job.stage = p >= 1 ? 'done' : STAGES.find((s) => p < s.until)?.stage ?? 'compressing';
    job.status = p >= 1 ? 'done' : 'running';
    job.updatedAt = Date.now();
    if (p >= 1) {
      job.splatUrl = DEMO_SPLAT_URL;
      job.message = 'Demo mode: no RECON_WORKER_URL configured, returning the bundled sample reconstruction.';
    }
  }

  if (job.status === 'done' && job.splatUrl) {
    await patchProject(job.projectId, { status: 'ready', splatUrl: job.splatUrl, splatFormat: 'splat' });
  } else if ((job.status as ReconstructionJob["status"]) === "failed") {
    await patchProject(job.projectId, { status: 'failed' });
  } else {
    await patchProject(job.projectId, { status: 'processing' });
  }
  return job;
}
