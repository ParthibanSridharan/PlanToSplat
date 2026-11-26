'use client';

import { AlertTriangle, Aperture, CheckCircle2, Focus, Sun } from 'lucide-react';
import { Card, CardHeader, Stat } from '@/components/ui/Card';
import { BLUR_THRESHOLD } from '@/lib/openCVCheck';
import type { ImageQualityReport, OverlapReport } from '@/types';
import { cn } from '@/lib/utils';

/** OpenCV blur, exposure, intrinsics and overlap feedback for a capture set. */
export default function QualityReportCard({
  reports,
  overlap,
  analyzing,
  total,
  onToggleExclude,
  excluded,
}: {
  reports: ImageQualityReport[];
  overlap: OverlapReport | null;
  analyzing: boolean;
  total: number;
  excluded: Set<string>;
  onToggleExclude: (name: string) => void;
}) {
  const blurry = reports.filter((r) => r.isBlurry).length;
  const badExposure = reports.filter((r) => r.exposure !== 'ok').length;
  const withExif = reports.filter((r) => r.exif?.fxPixels).length;
  const engine = reports[0]?.engine === 'opencv' ? 'OpenCV.js (WASM)' : 'JS Laplacian kernel';
  const fovs = reports.map((r) => r.exif?.hfovDeg).filter((x): x is number => !!x);
  const avgFov = fovs.length ? fovs.reduce((a, b) => a + b, 0) / fovs.length : null;
  const overlapPct = overlap ? Math.round(overlap.healthyRatio * 100) : null;
  const usable = reports.length - blurry;

  return (
    <Card>
      <CardHeader
        icon={<Aperture className="h-4 w-4" />}
        title="Capture quality inspector"
        subtitle={analyzing ? `Analyzing ${reports.length}/${total} images…` : `${reports.length} images · ${engine}`}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Sharp" value={`${usable}/${reports.length}`} tone={blurry === 0 ? 'good' : blurry / Math.max(1, reports.length) > 0.2 ? 'bad' : 'warn'} hint={`Laplacian variance ≥ ${BLUR_THRESHOLD}`} />
        <Stat label="Exposure" value={badExposure ? `${badExposure} off` : 'Good'} tone={badExposure ? 'warn' : 'good'} />
        <Stat label="Overlap" value={overlapPct === null ? 'N/A' : `${overlapPct}%`} tone={overlapPct === null ? 'default' : overlapPct >= 70 ? 'good' : overlapPct >= 40 ? 'warn' : 'bad'} hint="Share of consecutive frame pairs in the 60–95% similarity band" />
        <Stat label="Intrinsics" value={avgFov ? `${avgFov.toFixed(0)}° FOV` : `${withExif} EXIF`} tone={withExif ? 'good' : 'warn'} hint="Initial focal length from EXIF, which speeds up SfM" />
      </div>

      {reports.length > 0 && (
        <div className="mt-4 grid max-h-[340px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-5">
          {reports.map((r) => {
            const ex = excluded.has(r.fileName);
            return (
              <button
                key={r.fileName}
                onClick={() => onToggleExclude(r.fileName)}
                className={cn('group relative overflow-hidden rounded-xl text-left ring-1 transition', ex ? 'opacity-40 ring-white/10' : r.isBlurry ? 'ring-amber-400/60' : 'ring-white/10 hover:ring-aqua-400/60')}
                title={`${r.fileName}\nBlur score ${r.blurScore} · brightness ${r.brightness}${r.exif?.fxPixels ? `\nfx ≈ ${r.exif.fxPixels}px` : ''}\nClick to ${ex ? 'include' : 'exclude'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumbnailUrl} alt={r.fileName} className="aspect-[4/3] w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 font-mono text-[10px]">
                  <span className={cn('flex items-center gap-0.5', r.isBlurry ? 'text-amber-300' : 'text-emerald-300')}>
                    <Focus className="h-3 w-3" />
                    {Math.round(r.blurScore)}
                  </span>
                  {r.exposure !== 'ok' && (
                    <span className="flex items-center gap-0.5 text-amber-300">
                      <Sun className="h-3 w-3" />
                      {r.exposure}
                    </span>
                  )}
                </div>
                {ex && <div className="absolute inset-0 grid place-items-center text-[10px] font-semibold uppercase tracking-wider text-white">Excluded</div>}
              </button>
            );
          })}
        </div>
      )}

      {!analyzing && reports.length > 0 && (
        <div className={cn('mt-4 flex items-start gap-2 rounded-xl p-3 text-xs', blurry || (overlapPct !== null && overlapPct < 40) ? 'bg-amber-400/10 text-amber-200' : 'bg-emerald-400/10 text-emerald-200')}>
          {blurry || (overlapPct !== null && overlapPct < 40) ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <div>
            {blurry > 0 && <p>{blurry} blurry image(s) flagged. Click them to exclude, or re-shoot with a faster shutter.</p>}
            {overlapPct !== null && overlapPct < 40 && <p>Low frame-to-frame overlap. Take smaller steps between shots so SfM can match features.</p>}
            {!blurry && (overlapPct === null || overlapPct >= 40) && <p>Capture set looks reconstructable.</p>}
            {reports.length < 20 && <p className="mt-1 opacity-80">Tip: 3DGS quality improves a lot above about 40 views.</p>}
          </div>
        </div>
      )}
    </Card>
  );
}
