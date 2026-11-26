'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Clock, Cpu, FileBox, Home as HomeIcon, LoaderCircle, Mountain, Play, Trash, Wand2, Film } from 'lucide-react';
import Dropzone, { SPLAT_EXT, VIDEO_EXT } from '@/components/upload/Dropzone';
import QualityReportCard from '@/components/upload/QualityReportCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { analyzeOverlap, inspectImage, loadOpenCV, photoToHeightmap, type OpenCVHandle } from '@/lib/openCVCheck';
import { extractVideoFrames } from '@/lib/videoFrames';
import { putLocalAsset } from '@/lib/localAssets';
import { cachedProjects, createProject, startReconstruction } from '@/lib/projectsClient';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { cn, formatBytes, splatFormatFromName, uid } from '@/lib/utils';
import type { ImageQualityReport, Project, ProjectKind } from '@/types';
import { useWebGPU } from '@/hooks/useWebGPU';

const KINDS: { v: ProjectKind; label: string; icon: typeof HomeIcon; hint: string }[] = [
  { v: 'interior', label: 'Interior', icon: HomeIcon, hint: 'Rooms, lofts, apartments' },
  { v: 'exterior', label: 'Exterior', icon: Building2, hint: 'Facades, gardens, drone orbits' },
  { v: 'land', label: 'Land plot', icon: Mountain, hint: 'Terrain + house designer' },
];

export default function StudioPage() {
  const router = useRouter();
  const gpu = useWebGPU();
  const [name, setName] = useState('Untitled property');
  const [kind, setKind] = useState<ProjectKind>('interior');
  const [images, setImages] = useState<File[]>([]);
  const [splatFile, setSplatFile] = useState<File | null>(null);
  const [reports, setReports] = useState<ImageQualityReport[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [useOpenCV, setUseOpenCV] = useState(true);
  const [cvState, setCvState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Project[]>([]);
  const runId = useRef(0);

  useEffect(() => setRecent(cachedProjects()), []);

  const overlap = useMemo(() => (reports.length > 1 ? analyzeOverlap(reports) : null), [reports]);

  const analyze = useCallback(
    async (files: File[]) => {
      const id = ++runId.current;
      setAnalyzing(true);
      setReports([]);
      let cv: OpenCVHandle | null = null;
      if (useOpenCV) {
        setCvState('loading');
        cv = await loadOpenCV();
        setCvState(cv ? 'ready' : 'unavailable');
      }
      const out: ImageQualityReport[] = [];
      for (const f of files) {
        if (id !== runId.current) return;
        try {
          out.push(await inspectImage(f, cv));
          setReports([...out]);
        } catch {
          /* undecodable image (e.g. HEIC on non-Safari): skip */
        }
      }
      if (id === runId.current) setAnalyzing(false);
    },
    [useOpenCV],
  );

  const onFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      const splat = files.find((f) => SPLAT_EXT.test(f.name));
      if (splat) {
        setSplatFile(splat);
        if (name === 'Untitled property') setName(splat.name.replace(SPLAT_EXT, ''));
      }
      const videos = files.filter((f) => VIDEO_EXT.test(f.name) || f.type.startsWith('video/'));
      let imgs = files.filter((f) => f.type.startsWith('image/'));
      for (const v of videos) {
        setBusy(`Extracting frames from ${v.name}…`);
        try {
          imgs = imgs.concat(await extractVideoFrames(v, { onProgress: (p) => setBusy(`Extracting frames from ${v.name}… ${Math.round(p * 100)}%`) }));
        } catch (e) {
          setError(`${v.name}: ${(e as Error).message}`);
        }
      }
      setBusy(null);
      if (imgs.length) {
        const merged = [...images, ...imgs].filter((f, i, arr) => arr.findIndex((g) => g.name === f.name && g.size === f.size) === i);
        setImages(merged);
        analyze(merged);
      }
    },
    [images, analyze, name],
  );

  const usableImages = images.filter((f) => !excluded.has(f.name));

  async function uploadToSupabase(path: string, file: Blob): Promise<string | null> {
    const sb = getSupabase();
    if (!sb) return null;
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'splats';
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async function openSplat() {
    if (!splatFile) return;
    setBusy('Saving splat…');
    setError(null);
    try {
      const id = uid('p');
      const format = splatFormatFromName(splatFile.name);
      let splatUrl = await uploadToSupabase(`${id}/${splatFile.name}`, splatFile).catch(() => null);
      if (!splatUrl) splatUrl = await putLocalAsset(id, splatFile);
      const p = await createProject({ id, name, kind, status: 'ready', splatUrl, splatFormat: format, flipY: format === 'ply', imageCount: 0 });
      router.push(`/studio/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function reconstruct() {
    setBusy('Creating project…');
    setError(null);
    try {
      const id = uid('p');
      const imageUrls: string[] = [];
      if (isSupabaseConfigured) {
        let n = 0;
        for (const f of usableImages) {
          setBusy(`Uploading images ${++n}/${usableImages.length}…`);
          const u = await uploadToSupabase(`${id}/images/${f.name}`, f);
          if (u) imageUrls.push(u);
        }
      }
      await createProject({ id, name, kind, status: 'queued', imageCount: usableImages.length });
      setBusy('Queueing reconstruction…');
      await startReconstruction(id, imageUrls);
      router.push(`/studio/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function designLand() {
    setBusy('Building terrain heightmap…');
    setError(null);
    try {
      const id = uid('p');
      const src = usableImages[0];
      const heightmapUrl = src ? await photoToHeightmap(src) : null;
      let splatUrl: string | null = null;
      let splatFormat = null;
      if (splatFile) {
        splatUrl = await putLocalAsset(id, splatFile);
        splatFormat = splatFormatFromName(splatFile.name);
      }
      await createProject({ id, name, kind: 'land', status: 'ready', heightmapUrl, splatUrl, splatFormat, imageCount: usableImages.length });
      router.push(`/studio/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const reset = () => {
    runId.current++;
    setImages([]);
    setReports([]);
    setSplatFile(null);
    setExcluded(new Set());
    setAnalyzing(false);
  };

  return (
    <main className="relative min-h-screen bg-slate-950 pb-20 pt-24">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />
      <div className="relative mx-auto grid max-w-6xl gap-5 px-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold text-white">New capture</h1>
            <p className="mt-1 text-sm text-slate-400">Upload photos or video for reconstruction, or open an existing Gaussian splat.</p>
          </div>

          <Card className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Project name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-aqua-400/60"
                />
              </label>
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Scene type</span>
                <div className="mt-1.5 flex gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
                  {KINDS.map((k) => (
                    <button
                      key={k.v}
                      onClick={() => setKind(k.v)}
                      title={k.hint}
                      className={cn('flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition', kind === k.v ? 'bg-gradient-to-r from-splat-500/80 to-aqua-500/70 text-white' : 'text-slate-300 hover:bg-white/10')}
                    >
                      <k.icon className="h-3.5 w-3.5" /> {k.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Dropzone onFiles={onFiles} disabled={!!busy} />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={useOpenCV} onChange={(e) => setUseOpenCV(e.target.checked)} className="accent-aqua-400" />
                Use OpenCV.js WASM (about 9 MB download)
                {cvState === 'loading' && <LoaderCircle className="h-3 w-3 animate-spin" />}
                {cvState === 'unavailable' && <span className="text-amber-300">unavailable, so the JS kernel is used</span>}
                {cvState === 'ready' && <span className="text-emerald-300">ready</span>}
              </label>
              {(images.length > 0 || splatFile) && (
                <button onClick={reset} className="flex items-center gap-1 text-slate-400 hover:text-white">
                  <Trash className="h-3.5 w-3.5" /> Clear
                </button>
              )}
            </div>
          </Card>

          {splatFile && (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-splat-500/20 text-splat-300">
                  <FileBox className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{splatFile.name}</div>
                  <div className="text-xs text-slate-400">
                    {formatBytes(splatFile.size)} · ready to view, no reconstruction needed
                  </div>
                </div>
              </div>
              <Button variant="primary" onClick={kind === 'land' ? designLand : openSplat} disabled={!!busy}>
                <Play className="h-4 w-4" /> Open in 3D Studio
              </Button>
            </Card>
          )}

          {(reports.length > 0 || analyzing) && (
            <QualityReportCard
              reports={reports}
              overlap={overlap}
              analyzing={analyzing}
              total={images.length}
              excluded={excluded}
              onToggleExclude={(n) =>
                setExcluded((s) => {
                  const next = new Set(s);
                  if (next.has(n)) next.delete(n);
                  else next.add(n);
                  return next;
                })
              }
            />
          )}

          {images.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {kind === 'land' ? (
                <Button variant="primary" size="lg" onClick={designLand} disabled={!!busy || analyzing}>
                  <Mountain className="h-4 w-4" /> Build terrain & design house
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={reconstruct} disabled={!!busy || analyzing || usableImages.length < 2}>
                  <Wand2 className="h-4 w-4" /> Reconstruct {usableImages.length} views
                </Button>
              )}
            </div>
          )}

          {busy && (
            <div className="glass flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-slate-200">
              <LoaderCircle className="h-4 w-4 animate-spin text-aqua-400" /> {busy}
            </div>
          )}
          {error && <div className="rounded-xl border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm text-red-200">{error}</div>}
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <Card>
            <CardHeader icon={<Cpu className="h-4 w-4" />} title="This device" />
            <ul className="space-y-2 text-xs">
              <li className="flex justify-between">
                <span className="text-slate-400">WebGPU</span>
                <span className={gpu.isSupported ? 'text-emerald-300' : 'text-amber-300'}>
                  {gpu.isSupported === null ? 'probing…' : gpu.isSupported ? 'available' : 'not available'}
                </span>
              </li>
              {gpu.adapterName && (
                <li className="flex justify-between gap-2">
                  <span className="text-slate-400">Adapter</span>
                  <span className="truncate text-slate-200">{gpu.adapterName}</span>
                </li>
              )}
              <li className="flex justify-between">
                <span className="text-slate-400">WebGL2 splat pipeline</span>
                <span className={gpu.webgl2 ? 'text-emerald-300' : 'text-red-300'}>{gpu.webgl2 ? 'ready' : 'missing'}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-400">Storage</span>
                <span className="text-slate-200">{isSupabaseConfigured ? 'Supabase' : 'Local (IndexedDB)'}</span>
              </li>
            </ul>
            {gpu.warning && <p className="mt-3 rounded-lg bg-amber-400/10 p-2 text-[11px] text-amber-200">{gpu.warning}</p>}
          </Card>

          <Card>
            <CardHeader icon={<Clock className="h-4 w-4" />} title="Recent projects" />
            <div className="space-y-1.5">
              <Link href="/studio/demo" className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
                <span className="flex items-center gap-2">
                  <HomeIcon className="h-3.5 w-3.5 text-aqua-300" /> Demo: Sunlit Loft
                </span>
                <span className="text-[10px] uppercase text-slate-500">sample</span>
              </Link>
              <Link href="/studio/demo-land" className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
                <span className="flex items-center gap-2">
                  <Mountain className="h-3.5 w-3.5 text-emerald-300" /> Demo: Hillside Plot
                </span>
                <span className="text-[10px] uppercase text-slate-500">sample</span>
              </Link>
              {recent.map((p) => (
                <Link key={p.id} href={`/studio/${p.id}`} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
                  <span className="flex min-w-0 items-center gap-2">
                    {p.kind === 'land' ? <Mountain className="h-3.5 w-3.5 shrink-0 text-emerald-300" /> : p.kind === 'exterior' ? <Building2 className="h-3.5 w-3.5 shrink-0 text-splat-300" /> : <HomeIcon className="h-3.5 w-3.5 shrink-0 text-aqua-300" />}
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="text-[10px] uppercase text-slate-500">{p.status}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader icon={<Film className="h-4 w-4" />} title="Capture tips" />
            <ul className="list-disc space-y-1.5 pl-4 text-xs text-slate-400">
              <li>Move the camera between shots; don&apos;t rotate it in place.</li>
              <li>Lock exposure and white balance if your camera allows it.</li>
              <li>Capture each wall from two heights (chest and knee).</li>
              <li>For video, walk slowly, about one step per second.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </main>
  );
}
