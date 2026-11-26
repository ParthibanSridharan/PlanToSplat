'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Crosshair, LoaderCircle, Ruler, Search, Sofa, Trash, X, Mountain, Info } from 'lucide-react';
import WebGPUCanvas, { type QualityMode, type SceneInfo } from './WebGPUCanvas';
import RaycastMeasurer from './RaycastMeasurer';
import VirtualStager from './VirtualStager';
import MiniMap from './MiniMap';
import MobileControls from './MobileControls';
import LandHybrid, { DEFAULT_HOUSE, TERRAIN_SIZE, type HouseParams, type SiteStats } from './LandHybrid';
import HUD from '@/components/ui/HUD';
import Modal from '@/components/ui/Modal';
import { useWebGPU } from '@/hooks/useWebGPU';
import { useMeasurement } from '@/hooks/useMeasurement';
import { resolveAssetUrl } from '@/lib/localAssets';
import { searchFurniture } from '@/lib/polyPizzaApi';
import { updateProject } from '@/lib/projectsClient';
import { formatFeetInches, formatMeters } from '@/lib/raycastMath';
import { cn, formatCount } from '@/lib/utils';
import type { CameraMode, FurnitureAsset, Project, StagedItem, ToolMode } from '@/types';

const FURNITURE_ICONS: Record<string, string> = {
  sofa: '🛋️', armchair: '💺', table: '🍽️', chair: '🪑', bed: '🛏️', coffee: '☕', lamp: '💡', plant: '🪴', shelf: '📚', rug: '🟫',
};

export default function StudioViewer({ project, persist = true }: { project: Project; persist?: boolean }) {
  const gpu = useWebGPU();
  const isLand = project.kind === 'land';
  const [cameraMode, setCameraMode] = useState<CameraMode>(isLand ? 'orbit' : 'fps');
  const [tool, setTool] = useState<ToolMode>('navigate');
  const [quality, setQuality] = useState<QualityMode>('auto');
  const [flipY, setFlipY] = useState(project.flipY);
  const [splatUrl, setSplatUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(!!project.splatUrl);
  const [info, setInfo] = useState<SceneInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedItem[]>(project.staged ?? []);
  const [armed, setArmed] = useState<FurnitureAsset | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [house, setHouse] = useState<HouseParams>(DEFAULT_HOUSE);
  const [relief, setRelief] = useState(4);
  const [site, setSite] = useState<SiteStats | null>(null);
  const [cutaway, setCutaway] = useState(true);
  const measure = useMeasurement();
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Resolve local: URLs (IndexedDB) to object URLs
  useEffect(() => {
    let revoked: string | null = null;
    if (!project.splatUrl) {
      setResolving(false);
      return;
    }
    setResolving(true);
    resolveAssetUrl(project.splatUrl).then((u) => {
      if (u?.startsWith('blob:')) revoked = u;
      setSplatUrl(u);
      setResolving(false);
      if (!u) flash('The splat file is no longer in this browser’s storage. Re-upload it from the Studio.');
    });
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.splatUrl]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3800);
  }, []);

  // Persist staging (debounced)
  useEffect(() => {
    if (!persist) return;
    const t = setTimeout(() => updateProject(project.id, { staged }).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [staged, persist, project.id]);

  const onFlip = () => {
    setFlipY((f) => {
      if (persist) updateProject(project.id, { flipY: !f }).catch(() => {});
      return !f;
    });
  };

  const onTool = (t: ToolMode) => {
    setTool(t);
    if (t === 'stage') setDrawer(true);
    if (t !== 'measure') measure.cancelPending();
    if (t !== 'stage') setArmed(null);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      flash(project.splatUrl?.startsWith('local:') ? 'Link copied. Note: this splat is stored only in this browser.' : 'Share link copied');
    } catch {
      flash(url);
    }
  };

  const landBounds = useMemo(
    () => (isLand ? new THREE.Box3(new THREE.Vector3(-TERRAIN_SIZE / 2, 0, -TERRAIN_SIZE / 2), new THREE.Vector3(TERRAIN_SIZE / 2, 8, TERRAIN_SIZE / 2)) : undefined),
    [isLand],
  );

  const backendLabel = gpu.isSupported ? 'WebGPU-class GPU · WebGL2 splats' : 'WebGL2';
  const touch = gpu.isMobile;
  const subtitle = [
    project.kind === 'land' ? 'Land-to-Home designer' : project.kind === 'exterior' ? 'Exterior' : 'Interior',
    info?.splatCount ? `${formatCount(info.splatCount)} splats` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="fixed inset-0 bg-ink-900">
      {!resolving && (
        <WebGPUCanvas
          splatUrl={splatUrl}
          format={project.splatFormat}
          flipY={flipY}
          cameraMode={cameraMode}
          tool={tool}
          quality={quality}
          isMobile={touch}
          backendLabel={backendLabel}
          defaultBounds={landBounds}
          cutawayHeight={cameraMode === 'orbit' && project.kind === 'interior' && cutaway ? 2.2 : null}
          onSceneReady={setInfo}
        >
          <RaycastMeasurer state={measure} active={tool === 'measure'} onNotice={flash} />
          <VirtualStager
            active={tool === 'stage'}
            armedAsset={armed}
            onPlaced={() => flash('Placed. Use the gizmo to adjust, or click the floor again to add another.')}
            items={staged}
            onItemsChange={setStaged}
            onNotice={flash}
          />
          {isLand && <LandHybrid heightmapUrl={project.heightmapUrl ?? null} relief={relief} house={house} onStats={setSite} />}
          <MiniMap staged={staged} />
          <MobileControls visible={touch && cameraMode === 'fps'} />
        </WebGPUCanvas>
      )}
      {resolving && (
        <div className="absolute inset-0 grid place-items-center">
          <LoaderCircle className="h-6 w-6 animate-spin text-aqua-400" />
        </div>
      )}

      <HUD
        title={project.name}
        subtitle={subtitle}
        cameraMode={cameraMode}
        onCameraMode={setCameraMode}
        tool={tool}
        onTool={onTool}
        quality={quality}
        onQuality={setQuality}
        flipY={flipY}
        onFlipY={project.splatUrl ? onFlip : undefined}
        cutaway={cutaway}
        onCutaway={cameraMode === 'orbit' && project.kind === 'interior' ? () => setCutaway((c) => !c) : undefined}
        onShare={share}
      />

      {gpu.warning && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg bg-amber-500/15 px-3 py-1 text-[11px] text-amber-200 backdrop-blur md:block">{gpu.warning}</div>
      )}

      {/* Toasts */}
      {notice && (
        <div className="pointer-events-none absolute bottom-40 left-1/2 z-30 max-w-[90vw] -translate-x-1/2 sm:bottom-24">
          <div className="glass-strong flex items-center gap-2 rounded-xl px-4 py-2 text-xs text-slate-100">
            <Info className="h-3.5 w-3.5 shrink-0 text-aqua-300" /> {notice}
          </div>
        </div>
      )}

      {/* Measurement panel */}
      {tool === 'measure' && (
        <div className="glass-strong absolute bottom-3 right-3 z-20 w-[min(320px,calc(100vw-1.5rem))] rounded-2xl p-3 sm:bottom-4 sm:right-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Ruler className="h-4 w-4 text-aqua-300" /> Measure
            </div>
            <div className="flex gap-1 text-[11px]">
              {(['metric', 'imperial'] as const).map((u) => (
                <button key={u} onClick={() => measure.setUnits(u)} className={cn('rounded-md px-2 py-0.5', measure.units === u ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white')}>
                  {u === 'metric' ? 'm' : 'ft'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex gap-1 rounded-lg bg-white/5 p-0.5 text-[11px]">
            {(
              [
                ['surface', 'Surface snap', 'One click per point. Snaps to the nearest dense splat surface along the ray.'],
                ['triangulate', 'Triangulate', 'Two clicks per point from different viewpoints. The rays are intersected.'],
              ] as const
            ).map(([v, l, h]) => (
              <button key={v} title={h} onClick={() => measure.setMethod(v)} className={cn('flex-1 rounded-md py-1', measure.method === v ? 'bg-splat-500/40 text-white' : 'text-slate-400 hover:text-white')}>
                {l}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            {measure.pending ? 'Click the second point.' : measure.method === 'surface' ? 'Click two points on any surface.' : 'Click a feature, move sideways, then click the same feature again.'}
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {measure.measurements.map((m, i) => (
              <li key={m.id} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2 py-1.5 font-mono text-xs">
                <span className="text-slate-500">#{i + 1}</span>
                <span className="text-aqua-300">{formatMeters(m.meters)}</span>
                <span className="text-slate-300">{formatFeetInches(m.meters)}</span>
                <button onClick={() => measure.remove(m.id)} className="text-slate-500 hover:text-red-300" aria-label="Delete measurement">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {measure.measurements.length > 0 && (
            <button onClick={measure.clear} className="mt-2 flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-300">
              <Trash className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>
      )}

      {/* Staging status pill */}
      {tool === 'stage' && !drawer && (
        <div className="absolute bottom-3 right-3 z-20 sm:bottom-4 sm:right-4">
          <button onClick={() => setDrawer(true)} className="glass-strong flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm text-white hover:bg-white/10">
            <Sofa className="h-4 w-4 text-aqua-300" />
            {armed ? (
              <>
                Placing <b>{armed.title}</b>, click the floor
              </>
            ) : (
              'Furniture library'
            )}
          </button>
        </div>
      )}

      <FurnitureDrawer
        open={drawer && tool === 'stage'}
        onClose={() => setDrawer(false)}
        armed={armed}
        onPick={(a) => {
          setArmed(a);
          if (window.innerWidth < 640) setDrawer(false);
          flash(`Click the floor to place "${a.title}"`);
        }}
        stagedCount={staged.length}
        onClearAll={() => setStaged([])}
      />

      {/* Land designer panel */}
      {isLand && tool === 'navigate' && (
        <LandPanel house={house} setHouse={setHouse} relief={relief} setRelief={setRelief} site={site} />
      )}

      {cameraMode === 'fps' && touch && tool === 'navigate' && (
        <div className="pointer-events-none absolute bottom-44 left-1/2 -translate-x-1/2 text-[11px] text-slate-400">
          <Crosshair className="mx-auto mb-1 h-3 w-3" /> Left stick walks · right stick looks · drag to look
        </div>
      )}
    </div>
  );
}

function FurnitureDrawer({
  open,
  onClose,
  armed,
  onPick,
  stagedCount,
  onClearAll,
}: {
  open: boolean;
  onClose: () => void;
  armed: FurnitureAsset | null;
  onPick: (a: FurnitureAsset) => void;
  stagedCount: number;
  onClearAll: () => void;
}) {
  const [q, setQ] = useState('');
  const [assets, setAssets] = useState<FurnitureAsset[]>([]);
  const [source, setSource] = useState<'polypizza' | 'builtin'>('builtin');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchFurniture(q || 'furniture');
      if (cancelled) return;
      setAssets(r.assets);
      setSource(r.source);
      setLoading(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Furniture library"
      subtitle={source === 'polypizza' ? 'Streaming low-poly models from Poly Pizza' : 'Built-in procedural set (add POLY_PIZZA_API_KEY for thousands more)'}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sofa, bed, lamp…"
          className="h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-white outline-none focus:border-aqua-400/60"
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {loading && assets.length === 0 && Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/5" />)}
        {assets.map((a) => (
          <button
            key={a.id}
            onClick={() => onPick(a)}
            className={cn('group overflow-hidden rounded-xl bg-white/[0.04] text-left ring-1 transition hover:bg-white/[0.08]', armed?.id === a.id ? 'ring-aqua-400' : 'ring-white/10')}
          >
            <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-white/[0.03] to-transparent">
              {a.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.thumbnail} alt={a.title} className="h-full w-full object-contain p-2" loading="lazy" />
              ) : (
                <span className="text-4xl transition group-hover:scale-110">{FURNITURE_ICONS[a.url.replace('procedural:', '')] ?? '📦'}</span>
              )}
            </div>
            <div className="px-2.5 py-2">
              <div className="truncate text-xs font-medium text-white">{a.title}</div>
              <div className="truncate text-[10px] text-slate-500">{a.creator ? `by ${a.creator}` : a.licence ?? ''}</div>
            </div>
          </button>
        ))}
        {!loading && assets.length === 0 && <p className="col-span-2 py-6 text-center text-xs text-slate-500">No models found.</p>}
      </div>
      {stagedCount > 0 && (
        <button onClick={onClearAll} className="mt-4 flex items-center gap-1 text-xs text-slate-400 hover:text-red-300">
          <Trash className="h-3.5 w-3.5" /> Remove all {stagedCount} staged items
        </button>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Click a model, then click the floor. Select a placed item to move (1), rotate (2) or scale (3) it, or press Delete to remove it.
      </p>
    </Modal>
  );
}

function LandPanel({
  house,
  setHouse,
  relief,
  setRelief,
  site,
}: {
  house: HouseParams;
  setHouse: (h: HouseParams) => void;
  relief: number;
  setRelief: (n: number) => void;
  site: SiteStats | null;
}) {
  const [open, setOpen] = useState(true);
  const slider = (label: string, key: keyof HouseParams, min: number, max: number, step: number, unit: string) => (
    <label className="block">
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">
          {house[key]}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={house[key]} onChange={(e) => setHouse({ ...house, [key]: +e.target.value })} className="slider mt-1" />
    </label>
  );
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="glass-strong absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm text-white">
        <Mountain className="h-4 w-4 text-emerald-300" /> House designer
      </button>
    );
  return (
    <div className="glass-strong absolute bottom-3 right-3 z-20 max-h-[60vh] w-[min(300px,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-4 sm:bottom-4 sm:right-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Mountain className="h-4 w-4 text-emerald-300" /> AI house designer
        </div>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Collapse">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2.5">
        {slider('Width', 'width', 5, 24, 0.5, ' m')}
        {slider('Depth', 'depth', 5, 20, 0.5, ' m')}
        {slider('Floors', 'floors', 1, 4, 1, '')}
        {slider('Roof pitch', 'roofPitch', 5, 50, 1, '°')}
        {slider('Position X', 'offsetX', -14, 14, 0.5, ' m')}
        {slider('Position Z', 'offsetZ', -14, 14, 0.5, ' m')}
        {slider('Rotation', 'rotation', -90, 90, 1, '°')}
        <label className="block">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Terrain relief</span>
            <span className="font-mono text-slate-200">{relief} m</span>
          </div>
          <input type="range" min={0} max={12} step={0.5} value={relief} onChange={(e) => setRelief(+e.target.value)} className="slider mt-1" />
        </label>
      </div>
      {site && (
        <div className="mt-4 grid grid-cols-2 gap-1.5 font-mono text-[11px]">
          <Metric k="Footprint" v={`${site.footprintM2.toFixed(0)} m²`} />
          <Metric k="Gross floor" v={`${site.grossFloorM2.toFixed(0)} m²`} />
          <Metric k="Pad elev." v={`${site.padElevation.toFixed(2)} m`} />
          <Metric k="Site slope" v={`${site.slopePct.toFixed(1)} %`} warn={site.slopePct > 15} />
          <Metric k="Cut" v={`${site.cutM3.toFixed(1)} m³`} />
          <Metric k="Fill" v={`${site.fillM3.toFixed(1)} m³`} />
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Earthworks are estimated on a 0.5 m grid against a levelled pad at mean footprint elevation. The terrain is a photo-derived proxy, so attach a survey or DEM for engineering use.
      </p>
    </div>
  );
}

function Metric({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{k}</div>
      <div className={warn ? 'text-amber-300' : 'text-slate-100'}>{v}</div>
    </div>
  );
}
