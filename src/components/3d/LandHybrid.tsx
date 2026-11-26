'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { useScene } from './SceneContext';

export interface HouseParams {
  width: number; // m (x)
  depth: number; // m (z)
  floors: number;
  roofPitch: number; // degrees
  offsetX: number;
  offsetZ: number;
  rotation: number; // degrees
}

export const DEFAULT_HOUSE: HouseParams = { width: 10, depth: 8, floors: 2, roofPitch: 30, offsetX: 0, offsetZ: 0, rotation: 0 };

export interface SiteStats {
  padElevation: number;
  cutM3: number;
  fillM3: number;
  slopePct: number;
  footprintM2: number;
  grossFloorM2: number;
}

export const TERRAIN_SIZE = 48;
const SEG = 127;
const FLOOR_H = 3;

/**
 * Land-to-Home hybrid: heightmap terrain + parametric wireframe house with a levelled
 * foundation pad and earthworks (cut / fill) estimate.
 */
export default function LandHybrid({
  heightmapUrl,
  relief = 4,
  house,
  onStats,
}: {
  heightmapUrl: string | null;
  relief?: number;
  house: HouseParams;
  onStats?: (s: SiteStats) => void;
}) {
  const api = useScene();
  const heightsRef = useRef<Float32Array | null>(null);
  const terrainRef = useRef<THREE.Mesh | null>(null);
  const houseRef = useRef<THREE.Group | null>(null);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  const heightAt = (x: number, z: number): number => {
    const h = heightsRef.current;
    if (!h) return 0;
    const n = SEG + 1;
    const u = THREE.MathUtils.clamp((x / TERRAIN_SIZE + 0.5) * SEG, 0, SEG - 0.001);
    const v = THREE.MathUtils.clamp((z / TERRAIN_SIZE + 0.5) * SEG, 0, SEG - 0.001);
    const i = Math.floor(u), j = Math.floor(v);
    const fu = u - i, fv = v - j;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
  };

  // Terrain
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    heightsRef.current = null;
    (async () => {
      const n = SEG + 1;
      const heights = new Float32Array(n * n);
      if (heightmapUrl) {
        const img = new Image();
        img.src = heightmapUrl;
        await img.decode().catch(() => {});
        const c = document.createElement('canvas');
        c.width = n;
        c.height = n;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, n, n);
        const d = ctx.getImageData(0, 0, n, n).data;
        for (let i = 0; i < n * n; i++) heights[i] = (d[i * 4] / 255) * relief;
      } else {
        // Procedural gentle slope with rolling noise
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const x = i / SEG, z = j / SEG;
            heights[j * n + i] = relief * (0.35 * x + 0.25 * Math.sin(z * 5.1) * Math.cos(x * 3.7) + 0.15 * Math.sin((x + z) * 9.3));
          }
      }
      // Normalise so the lowest point sits at y = 0
      let min = Infinity;
      for (const h of heights) min = Math.min(min, h);
      for (let i = 0; i < heights.length; i++) heights[i] -= min;
      if (cancelled) return;
      heightsRef.current = heights;

      const geom = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEG, SEG);
      geom.rotateX(-Math.PI / 2);
      const pos = geom.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      const low = new THREE.Color(0x3d6b35), mid = new THREE.Color(0x7a8f45), high = new THREE.Color(0x9c8160);
      const col = new THREE.Color();
      let maxH = 0.001;
      for (const h of heights) maxH = Math.max(maxH, h);
      for (let k = 0; k < pos.count; k++) {
        const h = heights[k];
        pos.setY(k, h);
        const t = h / maxH;
        col.copy(t < 0.5 ? low : mid).lerp(t < 0.5 ? mid : high, t < 0.5 ? t * 2 : (t - 0.5) * 2);
        colors.set([col.r, col.g, col.b], k * 3);
      }
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geom.computeVertexNormals();
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
      mesh.name = 'terrain';
      api.scene.add(mesh);
      terrainRef.current = mesh;
      api.bounds = new THREE.Box3(new THREE.Vector3(-TERRAIN_SIZE / 2, 0, -TERRAIN_SIZE / 2), new THREE.Vector3(TERRAIN_SIZE / 2, maxH + 8, TERRAIN_SIZE / 2));
    })();

    // Walk on terrain: drive the floor height from the heightfield under the camera.
    const off = api.onFrame(() => {
      if (heightsRef.current) api.floorY = heightAt(api.camera.position.x, api.camera.position.z);
    });
    return () => {
      cancelled = true;
      off();
      if (terrainRef.current) {
        api.scene.remove(terrainRef.current);
        terrainRef.current.geometry.dispose();
        (terrainRef.current.material as THREE.Material).dispose();
        terrainRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, heightmapUrl, relief]);

  // House + earthworks
  useEffect(() => {
    if (!api) return;
    let raf = 0;
    const build = () => {
      if (!heightsRef.current) {
        raf = requestAnimationFrame(build);
        return;
      }
      if (houseRef.current) {
        api.scene.remove(houseRef.current);
        disposeDeep(houseRef.current);
      }
      const { width: w, depth: d, floors, roofPitch, offsetX, offsetZ, rotation } = house;
      const rot = THREE.MathUtils.degToRad(rotation);
      const cos = Math.cos(rot), sin = Math.sin(rot);

      // Sample footprint for pad elevation + cut/fill
      const cell = 0.5;
      const samples: number[] = [];
      for (let lx = -w / 2 + cell / 2; lx < w / 2; lx += cell)
        for (let lz = -d / 2 + cell / 2; lz < d / 2; lz += cell) {
          const x = offsetX + lx * cos + lz * sin;
          const z = offsetZ - lx * sin + lz * cos;
          samples.push(heightAt(x, z));
        }
      const pad = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
      let cut = 0, fill = 0;
      for (const h of samples) {
        if (h > pad) cut += (h - pad) * cell * cell;
        else fill += (pad - h) * cell * cell;
      }
      const hMin = Math.min(...samples), hMax = Math.max(...samples);
      const slopePct = ((hMax - hMin) / Math.max(w, d)) * 100;

      const g = new THREE.Group();
      g.position.set(offsetX, pad, offsetZ);
      g.rotation.y = rot;

      const wallH = floors * FLOOR_H;
      const cyan = new THREE.LineBasicMaterial({ color: 0x22d3ee });
      const faint = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.35 });
      const glass = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });

      // Foundation pad
      const padMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.3, d + 1), new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 1 }));
      padMesh.position.y = -0.1;
      g.add(padMesh);

      // Walls
      const body = new THREE.BoxGeometry(w, wallH, d);
      body.translate(0, wallH / 2, 0);
      g.add(new THREE.Mesh(body, glass));
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(body), cyan));

      // Floor slabs
      for (let f = 1; f < floors; f++) {
        const slab = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.01, d));
        const ls = new THREE.LineSegments(slab, faint);
        ls.position.y = f * FLOOR_H;
        g.add(ls);
      }

      // Window grid on the long facades
      const winMat = new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.6 });
      const bays = Math.max(1, Math.floor(w / 2.6));
      for (let f = 0; f < floors; f++)
        for (let b = 0; b < bays; b++) {
          const x = -w / 2 + (b + 0.5) * (w / bays);
          for (const side of [1, -1]) {
            const win = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.2, 1.4));
            const ls = new THREE.LineSegments(win, winMat);
            ls.position.set(x, f * FLOOR_H + 1.6, (side * d) / 2 + side * 0.01);
            g.add(ls);
          }
        }

      // Gable roof (ridge along Z)
      const rise = Math.tan(THREE.MathUtils.degToRad(roofPitch)) * (w / 2);
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 - 0.4, 0);
      shape.lineTo(w / 2 + 0.4, 0);
      shape.lineTo(0, rise + 0.2);
      shape.closePath();
      const roof = new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false });
      roof.translate(0, wallH, -d / 2 - 0.4);
      g.add(new THREE.Mesh(roof, new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })));
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(roof), new THREE.LineBasicMaterial({ color: 0x818cf8 })));

      // Dimension label
      const el = document.createElement('div');
      el.className = 'measure-label';
      el.textContent = `${w.toFixed(1)} × ${d.toFixed(1)} m · ${floors} fl`;
      const label = new CSS2DObject(el);
      label.position.set(0, wallH + rise + 1, 0);
      g.add(label);

      api.scene.add(g);
      houseRef.current = g;
      onStatsRef.current?.({
        padElevation: pad,
        cutM3: cut,
        fillM3: fill,
        slopePct,
        footprintM2: w * d,
        grossFloorM2: w * d * floors,
      });
    };
    build();
    return () => {
      cancelAnimationFrame(raf);
      if (houseRef.current) {
        api.scene.remove(houseRef.current);
        disposeDeep(houseRef.current);
        houseRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, house, heightmapUrl, relief]);

  return null;
}

function disposeDeep(o: THREE.Object3D) {
  o.traverse((c) => {
    if (c instanceof CSS2DObject) c.element.remove();
    const m = c as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | undefined;
    mat?.dispose?.();
  });
}
