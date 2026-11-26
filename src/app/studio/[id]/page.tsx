'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, CircleDashed, LoaderCircle, TriangleAlert } from 'lucide-react';
import { fetchProject, pollJob } from '@/lib/projectsClient';
import type { JobStage, Project, ReconstructionJob } from '@/types';
import { cn } from '@/lib/utils';

// Three.js + splat workers are browser-only.
const StudioViewer = dynamic(() => import('@/components/3d/StudioViewer'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 grid place-items-center bg-ink-900">
      <LoaderCircle className="h-6 w-6 animate-spin text-aqua-400" />
    </div>
  ),
});

const now = new Date().toISOString();
const DEMOS: Record<string, Project> = {
  demo: {
    id: 'demo',
    name: 'Demo: Sunlit Loft',
    kind: 'interior',
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    splatUrl: '/models/sample-loft.splat',
    splatFormat: 'splat',
    flipY: false,
    imageCount: 0,
    jobId: null,
    staged: [],
  },
  'demo-land': {
    id: 'demo-land',
    name: 'Demo: Hillside Plot',
    kind: 'land',
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    splatUrl: null,
    splatFormat: null,
    flipY: false,
    imageCount: 0,
    jobId: null,
    heightmapUrl: null,
    staged: [],
  },
};

const STAGE_LABELS: { stage: JobStage; label: string; detail: string }[] = [
  { stage: 'queued', label: 'Queued', detail: 'Waiting for a GPU worker' },
  { stage: 'feature-extraction', label: 'Feature extraction', detail: 'SIFT keypoints + matching across views' },
  { stage: 'sfm', label: 'Structure-from-Motion', detail: 'Camera poses + sparse point cloud (COLMAP)' },
  { stage: 'densify', label: 'Gaussian initialisation', detail: 'Seeding anisotropic Gaussians from SfM points' },
  { stage: 'training', label: '3DGS optimisation', detail: 'Adaptive density control + SH colour fitting' },
  { stage: 'compressing', label: 'Compression', detail: 'Opacity pruning, quantising to .splat / .spz' },
];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(DEMOS[id] ?? null);
  const [missing, setMissing] = useState(false);
  const [job, setJob] = useState<ReconstructionJob | null>(null);

  useEffect(() => {
    if (DEMOS[id]) return;
    let cancelled = false;
    fetchProject(id).then((p) => {
      if (cancelled) return;
      if (!p) setMissing(true);
      else setProject(p);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Poll reconstruction job
  const waiting = project && (project.status === 'queued' || project.status === 'processing') && project.jobId;
  useEffect(() => {
    if (!waiting || !project?.jobId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const j = await pollJob(project.jobId!);
        if (cancelled) return;
        setJob(j);
        if (j.status === 'done') {
          const p = await fetchProject(project.id);
          if (p && !cancelled) setProject({ ...p, status: 'ready', splatUrl: p.splatUrl ?? j.splatUrl ?? null, splatFormat: p.splatFormat ?? 'splat' });
          return;
        }
        if (j.status === 'failed') {
          setProject((p) => (p ? { ...p, status: 'failed' } : p));
          return;
        }
      } catch {
        /* transient */
      }
      if (!cancelled) setTimeout(tick, 1000);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [waiting, project?.jobId, project?.id]);

  if (missing) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="glass max-w-sm rounded-2xl p-6 text-center">
          <TriangleAlert className="mx-auto h-6 w-6 text-amber-300" />
          <h1 className="mt-3 font-semibold text-white">Project not found</h1>
          <p className="mt-1 text-sm text-slate-400">It may have been created in another browser, or the local server was restarted.</p>
          <Link href="/studio" className="mt-4 inline-flex items-center gap-1 text-sm text-aqua-300 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to studio
          </Link>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <div className="fixed inset-0 grid place-items-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-aqua-400" />
      </div>
    );
  }

  if (project.status === 'queued' || project.status === 'processing' || project.status === 'failed') {
    const activeIdx = job ? STAGE_LABELS.findIndex((s) => s.stage === job.stage) : 0;
    const failed = project.status === 'failed' || job?.status === 'failed';
    return (
      <main className="relative grid min-h-screen place-items-center px-4 py-24">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="glass relative w-full max-w-lg rounded-3xl p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-white">{project.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            Reconstructing {project.imageCount} views
            {job?.mode === 'demo' && <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] uppercase text-amber-200">demo pipeline</span>}
          </p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className={cn('h-full transition-all duration-700', failed ? 'bg-red-400' : 'bg-gradient-to-r from-splat-500 to-aqua-400')} style={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }} />
          </div>
          <ol className="mt-6 space-y-3">
            {STAGE_LABELS.map((s, i) => {
              const done = i < activeIdx || job?.status === 'done';
              const active = i === activeIdx && !done && !failed;
              return (
                <li key={s.stage} className="flex items-start gap-3">
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                  ) : active ? (
                    <LoaderCircle className="mt-0.5 h-4 w-4 animate-spin text-aqua-300" />
                  ) : (
                    <CircleDashed className="mt-0.5 h-4 w-4 text-slate-600" />
                  )}
                  <div>
                    <div className={cn('text-sm', done || active ? 'text-white' : 'text-slate-500')}>{s.label}</div>
                    <div className="text-xs text-slate-500">{s.detail}</div>
                  </div>
                </li>
              );
            })}
          </ol>
          {failed && <p className="mt-5 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{job?.message ?? 'Reconstruction failed.'}</p>}
          {job?.mode === 'demo' && !failed && (
            <p className="mt-5 text-xs text-slate-500">No reconstruction worker is configured (RECON_WORKER_URL), so this run finishes with the bundled sample scene.</p>
          )}
        </div>
      </main>
    );
  }

  return <StudioViewer project={project} persist={!DEMOS[id]} />;
}
