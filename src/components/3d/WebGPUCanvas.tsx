'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { DropInViewer, SceneFormat, SceneRevealMode, LogLevel } from '@mkkellogg/gaussian-splats-3d';
import { SceneContext, SceneVersionContext, type SceneApi } from './SceneContext';
import { useCameraControls } from '@/hooks/useCameraControls';
import { estimateFloorY, type SplatCloud } from '@/lib/raycastMath';
import { formatCount } from '@/lib/utils';
import type { CameraMode, SplatFormat, ToolMode } from '@/types';
import { Activity, Cpu, Layers, LoaderCircle, MousePointer2 } from 'lucide-react';

export type QualityMode = 'auto' | 'high' | 'low';

export interface SceneInfo {
  splatCount: number;
  floorY: number;
  bounds: THREE.Box3;
}

interface Props {
  splatUrl: string | null;
  format: SplatFormat | null;
  flipY?: boolean;
  cameraMode: CameraMode;
  tool: ToolMode;
  quality?: QualityMode;
  isMobile?: boolean;
  backendLabel?: string;
  /** Used when there is no splat (e.g. land designer) to frame the camera. */
  defaultBounds?: THREE.Box3;
  /** Hide splats above this height above the floor (dollhouse cutaway). null = off. */
  cutawayHeight?: number | null;
  onSceneReady?: (info: SceneInfo) => void;
  onLockChange?: (locked: boolean) => void;
  children?: ReactNode;
}

const FORMAT_MAP: Record<SplatFormat, number> = {
  splat: SceneFormat.Splat,
  ply: SceneFormat.Ply,
  spz: SceneFormat.Spz,
  ksplat: SceneFormat.KSplat,
};

/** Max splats copied to the CPU for picking / minimap (memory cap for mobile). */
const CPU_CLOUD_CAP = 1_500_000;

/**
 * Core renderer. Hosts a Three.js scene with a Gaussian-splat DropInViewer (GPU tile-free splat
 * rasterisation with depth sorting in a WASM web worker), a CSS2D label layer, dynamic resolution
 * scaling and density pruning. Children receive the scene through `SceneContext`.
 */
export default function WebGPUCanvas({
  splatUrl,
  format,
  flipY = false,
  cameraMode,
  tool,
  quality = 'auto',
  isMobile = false,
  backendLabel,
  defaultBounds,
  cutawayHeight = null,
  onSceneReady,
  onLockChange,
  children,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const clipUniform = useRef<{ value: number } | null>(null);
  const [api, setApi] = useState<SceneApi | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState<{ active: boolean; percent: number; label: string }>({ active: false, percent: 0, label: '' });
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ fps: 0, splats: 0, pixelRatio: 1 });
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;

  // ---------- renderer bootstrap (once) ----------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
    const maxPr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    renderer.setPixelRatio(maxPr);
    renderer.setClearColor(0x0b1120, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const labels = new CSS2DRenderer();
    labels.domElement.style.position = 'absolute';
    labels.domElement.style.inset = '0';
    labels.domElement.style.pointerEvents = 'none';
    host.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.add(new THREE.HemisphereLight(0xdbe7ff, 0x3a2f28, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 4);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1000);
    camera.position.set(0, 1.6, 4);

    const frameSubs = new Set<(dt: number) => void>();
    const clickSubs = new Set<(ndc: THREE.Vector2, ev: PointerEvent) => void>();
    const raycaster = new THREE.Raycaster();

    const apiObj: SceneApi = {
      scene,
      camera,
      renderer,
      canvas: renderer.domElement,
      labelRoot: labels.domElement,
      cloud: null,
      colors: null,
      floorY: 0,
      bounds: new THREE.Box3(),
      tool,
      cameraMode,
      input: { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } },
      interactionLock: { current: false },
      onFrame(cb) {
        frameSubs.add(cb);
        return () => frameSubs.delete(cb);
      },
      onClick(cb) {
        clickSubs.add(cb);
        return () => clickSubs.delete(cb);
      },
      rayFromNdc(ndc) {
        raycaster.setFromCamera(ndc, camera);
        return raycaster.ray.clone();
      },
    };

    // Clean-click detection (ignore drags used for looking / orbiting).
    let downX = 0;
    let downY = 0;
    let downT = 0;
    const canvas = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5 || performance.now() - downT > 600) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = document.pointerLockElement === canvas
        ? new THREE.Vector2(0, 0) // crosshair
        : new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      clickSubs.forEach((cb) => cb(ndc, e));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);

    // Resize
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      labels.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // Render loop + FPS meter + dynamic resolution scaling
    const clock = new THREE.Clock();
    let frames = 0;
    let acc = 0;
    let pr = maxPr;
    renderer.setAnimationLoop(() => {
      const dt = Math.min(0.1, clock.getDelta());
      frameSubs.forEach((cb) => cb(dt));
      renderer.render(scene, camera);
      labels.render(scene, camera);
      frames++;
      acc += dt;
      if (acc >= 0.5) {
        const fps = frames / acc;
        frames = 0;
        acc = 0;
        const q = qualityRef.current;
        const target = q === 'low' ? Math.min(maxPr, 0.75) : q === 'high' ? maxPr : pr;
        let next = target;
        if (q === 'auto') {
          if (fps < 28 && pr > 0.5) next = Math.max(0.5, pr - 0.15);
          else if (fps > 55 && pr < maxPr) next = Math.min(maxPr, pr + 0.1);
        }
        if (Math.abs(next - pr) > 0.01) {
          pr = next;
          renderer.setPixelRatio(pr);
          resize();
        }
        setStats((s) => ({ ...s, fps: Math.round(fps), pixelRatio: +pr.toFixed(2) }));
      }
    });

    if (process.env.NODE_ENV !== 'production') (window as unknown as { __pts?: SceneApi }).__pts = apiObj;
    setApi(apiObj);
    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      frameSubs.clear();
      clickSubs.clear();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      host.removeChild(labels.domElement);
      setApi(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep mode flags current on the shared api object.
  useEffect(() => {
    if (!api) return;
    api.tool = tool;
    api.cameraMode = cameraMode;
  }, [api, tool, cameraMode]);

  // ---------- splat scene loading ----------
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    let viewer: DropInViewer | null = null;

    const finish = (cloud: SplatCloud | null, colors: Uint8Array | null, count: number) => {
      api.cloud = cloud;
      api.colors = colors;
      if (cloud) {
        api.bounds = cloud.bounds.clone();
        api.floorY = estimateFloorY(cloud);
      } else {
        api.bounds = defaultBounds ? defaultBounds.clone() : new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
        api.floorY = api.bounds.min.y;
      }
      setStats((s) => ({ ...s, splats: count }));
      setVersion((v) => v + 1);
      onSceneReadyRef.current?.({ splatCount: count, floorY: api.floorY, bounds: api.bounds.clone() });
    };

    if (!splatUrl) {
      finish(null, null, 0);
      return;
    }

    setError(null);
    setLoading({ active: true, percent: 0, label: 'Fetching splat' });
    viewer = new DropInViewer({
      gpuAcceleratedSort: false,
      sharedMemoryForWorkers: false, // no COOP/COEP requirement
      integerBasedSort: true,
      halfPrecisionCovariancesOnGPU: true,
      dynamicScene: false,
      sceneRevealMode: SceneRevealMode.Instant,
      sphericalHarmonicsDegree: 0,
      antialiased: false,
      logLevel: LogLevel.None,
    });
    api.scene.add(viewer);

    const fmt = format ? FORMAT_MAP[format] : undefined;
    viewer
      .addSplatScene(splatUrl, {
        format: fmt,
        showLoadingUI: false,
        progressiveLoad: false,
        // Density pruning: drop near-transparent splats (more aggressively on mobile).
        splatAlphaRemovalThreshold: isMobile ? 20 : 5,
        rotation: flipY ? [1, 0, 0, 0] : [0, 0, 0, 1],
        onProgress: (percent, label) => {
          if (!cancelled) setLoading({ active: true, percent: Math.round(percent), label: label || 'Loading' });
        },
      })
      .then(() => {
        if (cancelled) return;
        setLoading({ active: true, percent: 100, label: 'Indexing splats' });
        const mesh = viewer!.viewer.splatMesh;
        clipUniform.current = injectHeightClip(mesh.material as THREE.ShaderMaterial);
        const total = mesh.getSplatCount();
        const n = Math.min(total, CPU_CLOUD_CAP);
        const step = total / n;
        const centers = new Float32Array(n * 3);
        const colors = new Uint8Array(n * 3);
        const v = new THREE.Vector3();
        const c = new THREE.Vector4();
        const bounds = new THREE.Box3();
        for (let i = 0; i < n; i++) {
          const idx = Math.floor(i * step);
          mesh.getSplatCenter(idx, v, true);
          centers[i * 3] = v.x;
          centers[i * 3 + 1] = v.y;
          centers[i * 3 + 2] = v.z;
          bounds.expandByPoint(v);
          mesh.getSplatColor(idx, c);
          colors[i * 3] = c.x;
          colors[i * 3 + 1] = c.y;
          colors[i * 3 + 2] = c.z;
        }
        // Robust bounds: trim the outer 1% so floaters don't blow up the volume.
        const trimmed = robustBounds(centers, n) ?? bounds;
        finish({ centers, count: n, bounds: trimmed }, colors, total);
        setLoading({ active: false, percent: 100, label: '' });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error(e);
        setError(e instanceof Error ? e.message : 'Failed to load splat');
        setLoading({ active: false, percent: 0, label: '' });
        finish(null, null, 0);
      });

    return () => {
      cancelled = true;
      clipUniform.current = null;
      if (viewer) {
        api.scene.remove(viewer);
        viewer.dispose().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, splatUrl, format, flipY]);

  // Dollhouse cutaway: drive the injected shader uniform.
  useEffect(() => {
    if (!api || !clipUniform.current) return;
    clipUniform.current.value = cutawayHeight == null ? 1e9 : api.floorY + cutawayHeight;
  }, [api, cutawayHeight, version]);

  const controls = useCameraControls(api, cameraMode, version);
  useEffect(() => onLockChange?.(controls.locked), [controls.locked, onLockChange]);

  const lockPointer = useCallback(() => {
    if (cameraMode === 'fps' && tool === 'navigate' && !isMobile) controls.lock();
  }, [cameraMode, tool, isMobile, controls]);

  const ctx = useMemo(() => api, [api]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" onDoubleClick={lockPointer} />
      <SceneContext.Provider value={ctx}>
        <SceneVersionContext.Provider value={version}>{api && children}</SceneVersionContext.Provider>
      </SceneContext.Provider>

      {/* Crosshair while pointer-locked */}
      {controls.locked && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute left-1/2 top-0 h-full w-px bg-white/80" />
          <div className="absolute left-0 top-1/2 h-px w-full bg-white/80" />
        </div>
      )}

      {/* Performance HUD */}
      <div className="pointer-events-none absolute right-3 top-[7.5rem] z-10 flex flex-col items-end gap-1 font-mono text-[11px] text-slate-200 sm:right-4 sm:top-[4.75rem] xl:top-4">
        <div className="glass flex items-center gap-3 rounded-lg px-3 py-1.5">
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3 text-aqua-400" />
            <span className={stats.fps < 30 ? 'text-amber-300' : 'text-emerald-300'}>{stats.fps}</span> fps
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3 text-splat-300" />
            {formatCount(stats.splats)} splats
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <Cpu className="h-3 w-3 text-slate-400" />
            {backendLabel ?? 'WebGL2'} · {stats.pixelRatio}x
          </span>
        </div>
      </div>

      {cameraMode === 'fps' && tool === 'navigate' && !controls.locked && !isMobile && version > 0 && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 hidden -translate-x-1/2 md:block">
          <div className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-slate-300">
            <MousePointer2 className="h-3.5 w-3.5" /> Drag to look · WASD to walk · Shift to sprint · Q/E height · double-click for mouse-lock
          </div>
        </div>
      )}

      {loading.active && (
        <div className="absolute inset-0 grid place-items-center bg-ink-900/60 backdrop-blur-sm">
          <div className="glass w-72 rounded-2xl p-5 text-center">
            <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-aqua-400" />
            <p className="mt-3 text-sm text-slate-200">{loading.label}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-splat-500 to-aqua-400 transition-all" style={{ width: `${loading.percent}%` }} />
            </div>
            <p className="mt-2 font-mono text-xs text-slate-400">{loading.percent}%</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute left-1/2 top-20 -translate-x-1/2 rounded-xl border border-red-400/30 bg-red-950/70 px-4 py-2 text-sm text-red-200 backdrop-blur">
          Could not load the splat: {error}
        </div>
      )}
    </div>
  );
}

/**
 * Patch the splat vertex shader so splats whose world-space centre is above `clipHeightY` are
 * culled before rasterisation. Returns the uniform handle (null if the shader layout is unknown).
 */
function injectHeightClip(material: THREE.ShaderMaterial | undefined): { value: number } | null {
  if (!material?.vertexShader) return null;
  const anchor = 'vec4 viewCenter = transformModelViewMatrix * vec4(splatCenter, 1.0);';
  if (!material.vertexShader.includes(anchor)) return null;
  const uniform = { value: 1e9 };
  material.uniforms.clipHeightY = uniform;
  material.vertexShader =
    'uniform float clipHeightY;\n' +
    material.vertexShader.replace(
      anchor,
      `if ((modelMatrix * vec4(splatCenter, 1.0)).y > clipHeightY) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }\n            ${anchor}`,
    );
  material.needsUpdate = true;
  return uniform;
}

function robustBounds(centers: Float32Array, n: number): THREE.Box3 | null {
  if (n < 100) return null;
  const sample = Math.min(n, 50_000);
  const step = n / sample;
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < sample; i++) {
    const k = Math.floor(i * step) * 3;
    xs.push(centers[k]);
    ys.push(centers[k + 1]);
    zs.push(centers[k + 2]);
  }
  const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * p)))];
  [xs, ys, zs].forEach((a) => a.sort((x, y) => x - y));
  return new THREE.Box3(new THREE.Vector3(q(xs, 0.01), q(ys, 0.01), q(zs, 0.01)), new THREE.Vector3(q(xs, 0.99), q(ys, 0.99), q(zs, 0.99)));
}
