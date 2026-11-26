'use client';

/**
 * Extract evenly spaced JPEG frames from a walkthrough video entirely in the browser, so video
 * clips go through the same quality inspector as photos.
 */
export async function extractVideoFrames(file: File, opts: { maxFrames?: number; maxDim?: number; onProgress?: (p: number) => void } = {}): Promise<File[]> {
  const maxFrames = opts.maxFrames ?? 60;
  const maxDim = opts.maxDim ?? 1600;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Unsupported video format'));
    });
    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) throw new Error('Could not read video duration');
    // ~2 frames per second, capped
    const count = Math.max(2, Math.min(maxFrames, Math.round(duration * 2)));
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d')!;
    const base = file.name.replace(/\.[^.]+$/, '');
    const frames: File[] = [];
    for (let i = 0; i < count; i++) {
      const t = ((i + 0.5) / count) * duration;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      if (blob) frames.push(new File([blob], `${base}_f${String(i).padStart(3, '0')}.jpg`, { type: 'image/jpeg' }));
      opts.onProgress?.((i + 1) / count);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
