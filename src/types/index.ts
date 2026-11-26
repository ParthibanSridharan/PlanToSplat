/** Global application types for PlanToSplat AI. */

export type ProjectKind = 'interior' | 'exterior' | 'land';

export type ProjectStatus = 'draft' | 'queued' | 'processing' | 'ready' | 'failed';

export type SplatFormat = 'splat' | 'ply' | 'spz' | 'ksplat';

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  /** Public / object URL of the reconstructed splat asset. `local:` prefix = stored in browser IndexedDB. */
  splatUrl: string | null;
  splatFormat: SplatFormat | null;
  /** Rotate the scene 180° around X (COLMAP / INRIA exports are Y-down). */
  flipY: boolean;
  imageCount: number;
  jobId: string | null;
  /** Land-plot projects: grayscale heightmap data URL derived from the plot photo. */
  heightmapUrl?: string | null;
  staged?: StagedItem[];
}

export type JobStage = 'queued' | 'feature-extraction' | 'sfm' | 'densify' | 'training' | 'compressing' | 'done' | 'failed';

export interface ReconstructionJob {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  stage: JobStage;
  progress: number; // 0..1
  mode: 'worker' | 'demo';
  message?: string;
  splatUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImageQualityReport {
  fileName: string;
  width: number;
  height: number;
  /** Variance of the Laplacian — higher is sharper. < 100 = blurry. */
  blurScore: number;
  isBlurry: boolean;
  /** Mean luminance 0..255 */
  brightness: number;
  exposure: 'under' | 'ok' | 'over';
  exif: CameraIntrinsics | null;
  /** 64-bit perceptual hash (hex) used to estimate overlap between consecutive photos. */
  dHash: string;
  engine: 'opencv' | 'js';
  thumbnailUrl: string;
}

export interface CameraIntrinsics {
  make?: string;
  model?: string;
  focalLengthMm?: number;
  focalLength35mm?: number;
  imageWidth?: number;
  imageHeight?: number;
  /** Estimated focal length in pixels (fx = fy), derived from 35mm-equivalent focal length. */
  fxPixels?: number;
  /** Horizontal field of view in degrees. */
  hfovDeg?: number;
}

export interface OverlapReport {
  pairs: { a: string; b: string; similarity: number }[];
  /** Fraction of consecutive pairs inside the recommended 60–90% similarity band. */
  healthyRatio: number;
}

export type ToolMode = 'navigate' | 'measure' | 'stage';
export type CameraMode = 'fps' | 'orbit';

export interface Measurement {
  id: string;
  a: [number, number, number];
  b: [number, number, number];
  meters: number;
  label: string;
}

export interface FurnitureAsset {
  id: string;
  title: string;
  thumbnail: string | null;
  /** GLB/GLTF URL, or `procedural:<key>` for the built-in library. */
  url: string;
  source: 'polypizza' | 'builtin';
  creator?: string;
  licence?: string;
}

export interface StagedItem {
  uid: string;
  assetId: string;
  url: string;
  title: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
}
