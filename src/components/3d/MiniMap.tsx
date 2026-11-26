'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useScene, useSceneVersion } from './SceneContext';
import type { StagedItem } from '@/types';

const SIZE = 168;

/**
 * Orthographic top-down floorplan radar. The splat cloud is projected once through an
 * OrthographicCamera into a density/colour image; each frame we overlay the viewer's position,
 * heading and FOV frustum cone. Click the map to teleport (FPS mode).
 */
export default function MiniMap({ staged = [] }: { staged?: StagedItem[] }) {
  const api = useScene();
  const version = useSceneVersion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const orthoRef = useRef<THREE.OrthographicCamera | null>(null);
  const stagedRef = useRef(staged);
  stagedRef.current = staged;

  // Build base floorplan image when the scene changes
  useEffect(() => {
    if (!api) return;
    const b = api.bounds.isEmpty() ? new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5)) : api.bounds;
    const c = b.getCenter(new THREE.Vector3());
    const s = b.getSize(new THREE.Vector3());
    const half = Math.max(s.x, s.z) / 2 + 1;
    const ortho = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 1000);
    ortho.position.set(c.x, b.max.y + 10, c.z);
    ortho.up.set(0, 0, -1); // north (-Z) at the top of the map
    ortho.lookAt(c.x, b.min.y, c.z);
    ortho.updateMatrixWorld();
    ortho.updateProjectionMatrix();
    orthoRef.current = ortho;

    const base = document.createElement('canvas');
    base.width = SIZE;
    base.height = SIZE;
    const ctx = base.getContext('2d')!;
    ctx.fillStyle = 'rgba(11,17,32,0.92)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const cloud = api.cloud;
    if (cloud) {
      // Accumulate colour + density per pixel, skipping the ceiling band so walls/furniture read clearly.
      const acc = new Float32Array(SIZE * SIZE * 4);
      const v = new THREE.Vector3();
      const ceiling = api.floorY + Math.min(2.2, s.y * 0.8);
      const step = Math.max(1, Math.floor(cloud.count / 400_000));
      for (let i = 0; i < cloud.count; i += step) {
        const y = cloud.centers[i * 3 + 1];
        if (y > ceiling) continue;
        v.set(cloud.centers[i * 3], y, cloud.centers[i * 3 + 2]).project(ortho);
        const px = Math.floor((v.x * 0.5 + 0.5) * SIZE);
        const py = Math.floor((-v.y * 0.5 + 0.5) * SIZE);
        if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
        const k = (py * SIZE + px) * 4;
        const col = api.colors;
        acc[k] += col ? col[i * 3] : 180;
        acc[k + 1] += col ? col[i * 3 + 1] : 200;
        acc[k + 2] += col ? col[i * 3 + 2] : 255;
        acc[k + 3] += 1;
      }
      let maxD = 1;
      for (let i = 3; i < acc.length; i += 4) maxD = Math.max(maxD, acc[i]);
      const img = ctx.getImageData(0, 0, SIZE, SIZE);
      for (let p = 0; p < SIZE * SIZE; p++) {
        const d = acc[p * 4 + 3];
        if (!d) continue;
        const a = Math.min(1, Math.log1p(d) / Math.log1p(maxD * 0.35));
        img.data[p * 4] = img.data[p * 4] * (1 - a) + (acc[p * 4] / d) * a;
        img.data[p * 4 + 1] = img.data[p * 4 + 1] * (1 - a) + (acc[p * 4 + 1] / d) * a;
        img.data[p * 4 + 2] = img.data[p * 4 + 2] * (1 - a) + (acc[p * 4 + 2] / d) * a;
      }
      ctx.putImageData(img, 0, 0);
    } else {
      ctx.strokeStyle = 'rgba(148,163,184,0.15)';
      for (let i = 0; i <= SIZE; i += 14) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, SIZE);
        ctx.moveTo(0, i);
        ctx.lineTo(SIZE, i);
        ctx.stroke();
      }
    }
    baseRef.current = base;
  }, [api, version]);

  // Per-frame overlay (throttled to ~20 Hz)
  useEffect(() => {
    if (!api) return;
    let acc = 0;
    const dir = new THREE.Vector3();
    const v = new THREE.Vector3();
    const toMap = (x: number, y: number, z: number) => {
      v.set(x, y, z).project(orthoRef.current!);
      return [(v.x * 0.5 + 0.5) * SIZE, (-v.y * 0.5 + 0.5) * SIZE] as const;
    };
    return api.onFrame((dt) => {
      acc += dt;
      if (acc < 0.05) return;
      acc = 0;
      const cv = canvasRef.current;
      const base = baseRef.current;
      if (!cv || !base || !orthoRef.current) return;
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(base, 0, 0);

      // Staged furniture
      ctx.fillStyle = 'rgba(244,114,182,0.9)';
      for (const it of stagedRef.current) {
        const [x, y] = toMap(it.position[0], it.position[1], it.position[2]);
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }

      const cam = api.camera;
      const [px, py] = toMap(cam.position.x, api.floorY, cam.position.z);
      cam.getWorldDirection(dir);
      const heading = Math.atan2(dir.x, -dir.z); // 0 = north (-Z), clockwise positive
      const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
      const r = 34;
      const a0 = heading - hfov / 2 - Math.PI / 2;
      const a1 = heading + hfov / 2 - Math.PI / 2;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, 'rgba(34,211,238,0.55)');
      grad.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, r, a0, a1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#22d3ee';
      ctx.strokeStyle = '#0b1120';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(226,232,240,0.7)';
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.fillText('N', SIZE / 2 - 3, 10);
    });
  }, [api]);

  const teleport = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!api || api.cameraMode !== 'fps' || !orthoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    const p = new THREE.Vector3(nx, ny, 0).unproject(orthoRef.current);
    api.camera.position.x = p.x;
    api.camera.position.z = p.z;
  };

  return (
    <div className="glass pointer-events-auto absolute bottom-3 left-3 z-10 overflow-hidden rounded-2xl p-1.5 sm:bottom-4 sm:left-4">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onClick={teleport}
        className="block h-[120px] w-[120px] cursor-crosshair rounded-xl sm:h-[168px] sm:w-[168px]"
        title="Floorplan radar: click to teleport (walk mode)"
      />
    </div>
  );
}
