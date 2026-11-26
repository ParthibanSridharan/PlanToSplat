'use client';

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
export const SPLAT_EXT = /\.(splat|ply|spz|ksplat)$/i;
export const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

/** Multi-file drag-and-drop drawer for photos, video clips and existing splat files. */
export default function Dropzone({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const files = Array.from(list).filter((f) => f.type.startsWith('image/') || SPLAT_EXT.test(f.name) || VIDEO_EXT.test(f.name) || f.type.startsWith('video/'));
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) accept(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      className={cn(
        'group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed px-6 py-12 text-center transition',
        over ? 'border-aqua-400 bg-aqua-400/10' : 'border-white/15 bg-white/[0.02] hover:border-splat-400/60 hover:bg-white/[0.04]',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-splat-500/30 to-aqua-500/30 ring-1 ring-white/10 transition group-hover:scale-105">
        {over ? <ImagePlus className="h-6 w-6 text-aqua-300" /> : <UploadCloud className="h-6 w-6 text-splat-300" />}
      </div>
      <p className="relative mt-4 text-base font-medium text-white">Drop property photos, a walkthrough video, or a splat file</p>
      <p className="relative mt-1 text-sm text-slate-400">
        JPG / PNG / WebP · MP4 / MOV (frames auto-extracted) · <span className="font-mono">.splat .ply .spz .ksplat</span>
      </p>
      <p className="relative mt-3 text-xs text-slate-500">Best results: 40–200 photos, about 70% overlap between neighbours, steady exposure</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,.splat,.ply,.spz,.ksplat"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
