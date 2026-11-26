/**
 * Type declarations for WebGPU detection and the Three.js-native Gaussian splat renderer.
 * `@mkkellogg/gaussian-splats-3d` ships untyped ESM; we declare the subset we use.
 */
declare module '@mkkellogg/gaussian-splats-3d' {
  import type * as THREE from 'three';

  export const SceneFormat: { Splat: 0; KSplat: 1; Ply: 2; Spz: 3 };
  export const SceneRevealMode: { Default: 0; Gradual: 1; Instant: 2 };
  export const LogLevel: { None: 0; Error: 1; Warning: 2; Info: 3; Debug: 4 };

  export interface SplatSceneOptions {
    format?: number;
    splatAlphaRemovalThreshold?: number;
    showLoadingUI?: boolean;
    progressiveLoad?: boolean;
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    onProgress?: (percent: number, label: string, stage: number) => void;
  }

  export interface SplatMesh extends THREE.Mesh {
    getSplatCount(includeSinceLastBuild?: boolean): number;
    getSplatCenter(globalIndex: number, out: THREE.Vector3, applySceneTransform?: boolean): void;
    getSplatColor(globalIndex: number, out: THREE.Vector4): void;
  }

  export interface DropInViewerOptions {
    gpuAcceleratedSort?: boolean;
    sharedMemoryForWorkers?: boolean;
    integerBasedSort?: boolean;
    halfPrecisionCovariancesOnGPU?: boolean;
    dynamicScene?: boolean;
    sceneRevealMode?: number;
    antialiased?: boolean;
    sphericalHarmonicsDegree?: number;
    splatSortDistanceMapPrecision?: number;
    logLevel?: number;
    freeIntermediateSplatData?: boolean;
    enableSIMDInSort?: boolean;
  }

  export class DropInViewer extends THREE.Group {
    constructor(options?: DropInViewerOptions);
    splatMesh: SplatMesh | null;
    viewer: { splatMesh: SplatMesh; [k: string]: unknown };
    addSplatScene(path: string, options?: SplatSceneOptions): Promise<void>;
    getSceneCount(): number;
    removeSplatScene(index: number, showLoadingUI?: boolean): Promise<void>;
    dispose(): Promise<void>;
  }
}

/** Minimal WebGPU navigator typings (avoids pulling @webgpu/types into the build). */
interface GPUAdapterInfoLite {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}
interface GPUAdapterLite {
  readonly features: ReadonlySet<string>;
  readonly limits: Record<string, number>;
  readonly info?: GPUAdapterInfoLite;
  readonly isFallbackAdapter?: boolean;
}
interface GPULite {
  requestAdapter(options?: { powerPreference?: 'low-power' | 'high-performance' }): Promise<GPUAdapterLite | null>;
}
interface Navigator {
  readonly gpu?: GPULite;
}
