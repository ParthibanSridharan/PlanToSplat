'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  Footprints,
  Maximize,
  Move,
  Orbit,
  Ruler,
  Sofa,
  Gauge,
  FlipVertical,
  Share2,
  Scissors,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CameraMode, ToolMode } from '@/types';
import type { QualityMode } from '@/components/3d/WebGPUCanvas';

interface HUDProps {
  title: string;
  subtitle?: string;
  cameraMode: CameraMode;
  onCameraMode: (m: CameraMode) => void;
  tool: ToolMode;
  onTool: (t: ToolMode) => void;
  quality: QualityMode;
  onQuality: (q: QualityMode) => void;
  flipY?: boolean;
  onFlipY?: () => void;
  cutaway?: boolean;
  onCutaway?: () => void;
  showStaging?: boolean;
  onShare?: () => void;
  right?: ReactNode;
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string; icon: ReactNode; hint: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-white/5 p-0.5 ring-1 ring-white/10">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          title={o.hint}
          aria-pressed={value === o.v}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition',
            value === o.v ? 'bg-gradient-to-r from-splat-500/80 to-aqua-500/70 text-white shadow' : 'text-slate-300 hover:bg-white/10 hover:text-white',
          )}
        >
          {o.icon}
          <span className="hidden lg:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Overlaid studio toolbar & status controls. */
export default function HUD(p: HUDProps) {
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start gap-2 p-3 pr-[calc(0.75rem+var(--hud-right,0px))] sm:p-4">
      <div className="glass pointer-events-auto flex items-center gap-2 rounded-2xl p-1.5 pr-3">
        <Link href="/studio" className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title="Back to studio">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 max-w-[40vw] sm:max-w-[16rem]">
          <div className="truncate text-sm font-semibold text-white">{p.title}</div>
          {p.subtitle && <div className="truncate text-[11px] text-slate-400">{p.subtitle}</div>}
        </div>
      </div>

      <div className="glass pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl p-1.5">
        <Seg<CameraMode>
          value={p.cameraMode}
          onChange={p.onCameraMode}
          options={[
            { v: 'fps', label: 'Walk', icon: <Footprints className="h-3.5 w-3.5" />, hint: 'First-person walkthrough' },
            { v: 'orbit', label: 'Aerial', icon: <Orbit className="h-3.5 w-3.5" />, hint: 'Aerial orbit view' },
          ]}
        />
        <Seg<ToolMode>
          value={p.tool}
          onChange={p.onTool}
          options={[
            { v: 'navigate', label: 'Navigate', icon: <Move className="h-3.5 w-3.5" />, hint: 'Navigate' },
            { v: 'measure', label: 'Measure', icon: <Ruler className="h-3.5 w-3.5" />, hint: 'Point-to-point measurement' },
            ...(p.showStaging !== false
              ? [{ v: 'stage' as ToolMode, label: 'Stage', icon: <Sofa className="h-3.5 w-3.5" />, hint: 'Virtual staging' }]
              : []),
          ]}
        />
        <div className="flex items-center gap-0.5">
          <label className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-slate-300 hover:bg-white/10" title="Render quality (auto = dynamic resolution scaling)">
            <Gauge className="h-3.5 w-3.5" />
            <select
              value={p.quality}
              onChange={(e) => p.onQuality(e.target.value as QualityMode)}
              className="cursor-pointer bg-transparent text-xs outline-none [&>option]:bg-slate-900"
            >
              <option value="auto">Auto</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </label>
          {p.onCutaway && (
            <button onClick={p.onCutaway} title="Dollhouse cutaway (hide ceiling)" className={cn('grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10', p.cutaway ? 'text-aqua-300' : 'text-slate-300')}>
              <Scissors className="h-3.5 w-3.5" />
            </button>
          )}
          {p.onFlipY && (
            <button onClick={p.onFlipY} title="Flip scene upside-down (COLMAP / INRIA exports are Y-down)" className={cn('grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10', p.flipY ? 'text-aqua-300' : 'text-slate-300')}>
              <FlipVertical className="h-3.5 w-3.5" />
            </button>
          )}
          {p.onShare && (
            <button onClick={p.onShare} title="Copy share link" className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10">
              <Share2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={fullscreen} title="Fullscreen" className="hidden h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10 sm:grid">
            <Maximize className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {p.right}
    </div>
  );
}
