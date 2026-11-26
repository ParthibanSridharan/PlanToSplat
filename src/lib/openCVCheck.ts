'use client';

import type { CameraIntrinsics, ImageQualityReport, OverlapReport } from '@/types';

/**
 * Client-side capture inspection, run before anything is uploaded:
 *  - Blur: variance of the Laplacian (OpenCV.js WASM when available, identical pure-JS kernel otherwise)
 *  - Exposure: mean luminance
 *  - Intrinsics: EXIF focal length -> fx in pixels + horizontal FOV (initial guess for SfM)
 *  - Overlap: 64-bit difference hash between consecutive frames
 */

export const BLUR_THRESHOLD = 100;
const ANALYSIS_MAX_DIM = 1024; // normalise resolution so the blur threshold is comparable across cameras
const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

type CvMat = { delete(): void; doubleAt(i: number, j: number): number };
interface OpenCV {
  Mat: new () => CvMat;
  matFromImageData(d: ImageData): CvMat;
  cvtColor(src: CvMat, dst: CvMat, code: number): void;
  Laplacian(src: CvMat, dst: CvMat, ddepth: number, ksize?: number): void;
  meanStdDev(src: CvMat, mean: CvMat, std: CvMat): void;
  COLOR_RGBA2GRAY: number;
  CV_64F: number;
}

declare global {
  interface Window {
    cv?: OpenCV & { onRuntimeInitialized?: () => void };
  }
}

/**
 * The Emscripten `cv` Module is a thenable (it has a `.then`), so it must never be passed to
 * `resolve()` or returned from an async function directly: the promise would adopt it and spin
 * forever on the main thread. It is always carried inside this wrapper object instead.
 */
export interface OpenCVHandle {
  cv: OpenCV;
}

let cvPromise: Promise<OpenCVHandle | null> | null = null;

/** Lazily load OpenCV.js (~9 MB WASM). Resolves null if the CDN is unreachable or slow. */
export function loadOpenCV(timeoutMs = 20000): Promise<OpenCVHandle | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve) => {
    let settled = false;
    const done = (cv: OpenCV | null) => {
      if (settled) return;
      settled = true;
      resolve(cv ? { cv } : null);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    const ready = () => {
      const cv = window.cv;
      if (cv && typeof cv.Mat === 'function') {
        clearTimeout(timer);
        done(cv);
        return true;
      }
      return false;
    };
    if (ready()) return;
    const s = document.createElement('script');
    s.src = OPENCV_URL;
    s.async = true;
    s.onload = () => {
      if (ready()) return;
      const cv = window.cv;
      if (cv) cv.onRuntimeInitialized = () => void ready();
      const poll = setInterval(() => {
        if (ready() || settled) clearInterval(poll);
      }, 200);
    };
    s.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    document.head.appendChild(s);
  });
  return cvPromise;
}

async function fileToImageData(file: File): Promise<{ data: ImageData; width: number; height: number; thumb: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, ANALYSIS_MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);

  const t = document.createElement('canvas');
  const ts = 160 / Math.max(w, h);
  t.width = Math.max(1, Math.round(w * ts));
  t.height = Math.max(1, Math.round(h * ts));
  t.getContext('2d')!.drawImage(canvas, 0, 0, t.width, t.height);
  const thumb = t.toDataURL('image/jpeg', 0.7);
  const out = { data, width: bitmap.width, height: bitmap.height, thumb };
  bitmap.close();
  return out;
}

function toGray(img: ImageData): Float32Array {
  const { data } = img;
  const g = new Float32Array(img.width * img.height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return g;
}

/** Pure-JS variance of the 3x3 Laplacian [0 1 0; 1 -4 1; 0 1 0] (the kernel OpenCV uses for ksize=1). */
export function laplacianVarianceJS(gray: Float32Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function laplacianVarianceCV(cv: OpenCV, img: ImageData): number {
  const src = cv.matFromImageData(img);
  const gray = new cv.Mat();
  const lap = new cv.Mat();
  const mean = new cv.Mat();
  const std = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(gray, lap, cv.CV_64F, 1);
    cv.meanStdDev(lap, mean, std);
    const s = std.doubleAt(0, 0);
    return s * s;
  } finally {
    src.delete();
    gray.delete();
    lap.delete();
    mean.delete();
    std.delete();
  }
}

/** 64-bit difference hash on a 9x8 grayscale thumbnail. */
function dHash(gray: Float32Array, width: number, height: number): string {
  const W = 9;
  const H = 8;
  const small = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor((x / W) * width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) / W) * width));
      const y0 = Math.floor((y / H) * height);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) / H) * height));
      let s = 0;
      let c = 0;
      for (let yy = y0; yy < y1; yy += 2) {
        for (let xx = x0; xx < x1; xx += 2) {
          s += gray[yy * width + xx];
          c++;
        }
      }
      small[y * W + x] = s / Math.max(1, c);
    }
  }
  let bits = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) bits += small[y * W + x] < small[y * W + x + 1] ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hashSimilarity(a: string, b: string): number {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      diff += x & 1;
      x >>= 1;
    }
  }
  return 1 - diff / 64;
}

/** Parse EXIF FocalLength / ImageWidth and estimate pinhole intrinsics. */
export async function extractIntrinsics(file: File, fallbackWidth: number, fallbackHeight: number): Promise<CameraIntrinsics | null> {
  try {
    const exifr = (await import('exifr')).default;
    const tags = await exifr.parse(file, [
      'Make',
      'Model',
      'FocalLength',
      'FocalLengthIn35mmFormat',
      'ExifImageWidth',
      'ExifImageHeight',
      'ImageWidth',
      'ImageHeight',
    ]);
    if (!tags) return null;
    const imageWidth: number = tags.ExifImageWidth ?? tags.ImageWidth ?? fallbackWidth;
    const imageHeight: number = tags.ExifImageHeight ?? tags.ImageHeight ?? fallbackHeight;
    const f35: number | undefined = tags.FocalLengthIn35mmFormat;
    const intr: CameraIntrinsics = {
      make: tags.Make,
      model: tags.Model,
      focalLengthMm: tags.FocalLength,
      focalLength35mm: f35,
      imageWidth,
      imageHeight,
    };
    if (f35 && imageWidth) {
      // 35mm full-frame sensor is 36mm wide: fx = f35 / 36 * W(long side)
      const longSide = Math.max(imageWidth, imageHeight);
      intr.fxPixels = Math.round((f35 / 36) * longSide);
      intr.hfovDeg = +(2 * Math.atan(36 / (2 * f35)) * (180 / Math.PI)).toFixed(1);
    }
    return intr;
  } catch {
    return null;
  }
}

export async function inspectImage(file: File, handle: OpenCVHandle | null): Promise<ImageQualityReport> {
  const { data, width, height, thumb } = await fileToImageData(file);
  const gray = toGray(data);
  let blurScore: number;
  let engine: 'opencv' | 'js' = 'js';
  if (handle) {
    try {
      blurScore = laplacianVarianceCV(handle.cv, data);
      engine = 'opencv';
    } catch {
      blurScore = laplacianVarianceJS(gray, data.width, data.height);
    }
  } else {
    blurScore = laplacianVarianceJS(gray, data.width, data.height);
  }
  let lum = 0;
  for (let i = 0; i < gray.length; i++) lum += gray[i];
  const brightness = lum / gray.length;
  const exif = await extractIntrinsics(file, width, height);
  return {
    fileName: file.name,
    width,
    height,
    blurScore: Math.round(blurScore * 10) / 10,
    isBlurry: blurScore < BLUR_THRESHOLD,
    brightness: Math.round(brightness),
    exposure: brightness < 45 ? 'under' : brightness > 215 ? 'over' : 'ok',
    exif,
    dHash: dHash(gray, data.width, data.height),
    engine,
    thumbnailUrl: thumb,
  };
}

/**
 * Consecutive-frame overlap estimate. Photogrammetry wants ~60-90% overlap: near-identical frames
 * add no parallax, and very different frames can't be feature-matched by SfM.
 */
export function analyzeOverlap(reports: ImageQualityReport[]): OverlapReport {
  const pairs: OverlapReport['pairs'] = [];
  for (let i = 1; i < reports.length; i++) {
    pairs.push({ a: reports[i - 1].fileName, b: reports[i].fileName, similarity: hashSimilarity(reports[i - 1].dHash, reports[i].dHash) });
  }
  const healthy = pairs.filter((p) => p.similarity >= 0.6 && p.similarity <= 0.95).length;
  return { pairs, healthyRatio: pairs.length ? healthy / pairs.length : 1 };
}

/**
 * Derive a grayscale heightmap from a land-plot photo (luminance + box blur). This is a
 * stylised proxy for terrain relief, used by the Land-to-Home designer until a DEM/survey is attached.
 */
export async function photoToHeightmap(file: File, size = 128): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.filter = 'blur(4px) grayscale(1)';
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  return c.toDataURL('image/png');
}
