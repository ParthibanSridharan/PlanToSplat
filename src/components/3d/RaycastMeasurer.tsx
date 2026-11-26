'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { useScene, useSceneVersion } from './SceneContext';
import { pickSplatSurface, rayToFloor, triangulateRays, formatMeters, formatFeetInches } from '@/lib/raycastMath';
import type { MeasurementState } from '@/hooks/useMeasurement';

/**
 * Point-to-point metrology on Gaussian splats.
 *  surface     – one click per point: ray vs splat-center cone, first dense surface (floor plane fallback)
 *  triangulate – two clicks per point from different viewpoints; the rays are intersected in closed form
 */
export default function RaycastMeasurer({ state, active, onNotice }: { state: MeasurementState; active: boolean; onNotice?: (msg: string) => void }) {
  const api = useScene();
  const version = useSceneVersion();
  const groupRef = useRef<THREE.Group | null>(null);
  const firstRay = useRef<THREE.Ray | null>(null);
  const [, force] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Scene group for markers / lines / labels
  useEffect(() => {
    if (!api) return;
    const g = new THREE.Group();
    g.name = 'measurements';
    g.renderOrder = 999;
    api.scene.add(g);
    groupRef.current = g;
    return () => {
      api.scene.remove(g);
      disposeGroup(g);
      groupRef.current = null;
    };
  }, [api]);

  // Click handling
  useEffect(() => {
    if (!api || !active) return;
    return api.onClick((ndc) => {
      const ray = api.rayFromNdc(ndc);
      const s = stateRef.current;
      let point: THREE.Vector3 | null = null;

      if (s.method === 'triangulate') {
        if (!firstRay.current) {
          firstRay.current = ray;
          force((n) => n + 1);
          onNotice?.('Ray 1 locked. Move to a different viewpoint and click the same feature.');
          return;
        }
        const tri = triangulateRays(firstRay.current, ray);
        firstRay.current = null;
        force((n) => n + 1);
        if (!tri) {
          onNotice?.('Rays are almost parallel. Move further sideways for a wider baseline.');
          return;
        }
        point = tri.point;
        onNotice?.(`Triangulated (ray gap ${(tri.residual * 100).toFixed(1)} cm)`);
      } else {
        const hit = api.cloud ? pickSplatSurface(ray, api.cloud) : null;
        point = hit?.point ?? rayToFloor(ray, api.floorY);
        if (!hit && point) onNotice?.('No splat surface under cursor, so the point snapped to the floor plane.');
      }
      if (point) s.addPoint(point);
    });
  }, [api, active, onNotice]);

  // Reset triangulation when leaving the tool
  useEffect(() => {
    if (!active) firstRay.current = null;
  }, [active]);

  // Rebuild visuals
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    disposeGroup(g);
    const unitsImperial = state.units === 'imperial';
    const dot = (p: THREE.Vector3, color: number) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 16, 12),
        new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }),
      );
      m.position.copy(p);
      m.renderOrder = 1000;
      g.add(m);
    };
    for (const ms of state.measurements) {
      const a = new THREE.Vector3(...ms.a);
      const b = new THREE.Vector3(...ms.b);
      dot(a, 0x22d3ee);
      dot(b, 0x22d3ee);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a, b]),
        new THREE.LineBasicMaterial({ color: 0x22d3ee, depthTest: false, transparent: true }),
      );
      line.renderOrder = 1000;
      g.add(line);
      const el = document.createElement('div');
      el.className = 'measure-label';
      el.textContent = unitsImperial ? formatFeetInches(ms.meters) : formatMeters(ms.meters);
      const label = new CSS2DObject(el);
      label.position.copy(a).add(b).multiplyScalar(0.5);
      g.add(label);
    }
    if (state.pending) dot(state.pending, 0xf472b6);
    if (firstRay.current) {
      const r = firstRay.current;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([r.origin, r.at(30, new THREE.Vector3())]),
        new THREE.LineDashedMaterial({ color: 0xf472b6, dashSize: 0.1, gapSize: 0.08, depthTest: false, transparent: true }),
      );
      line.computeLineDistances();
      g.add(line);
    }
  });

  // Live rubber-band from pending point to cursor hit is cheap enough on the floor plane only.
  useEffect(() => {
    if (!api || !active || !state.pending) return;
    const g = new THREE.Group();
    api.scene.add(g);
    const geom = new THREE.BufferGeometry().setFromPoints([state.pending, state.pending]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xf472b6, depthTest: false, transparent: true, opacity: 0.7 }));
    g.add(line);
    const el = document.createElement('div');
    el.className = 'measure-label measure-label--live';
    const label = new CSS2DObject(el);
    g.add(label);
    const start = state.pending.clone();
    const onMove = (e: PointerEvent) => {
      const rect = api.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const p = rayToFloor(api.rayFromNdc(ndc), start.y);
      if (!p) return;
      geom.setFromPoints([start, p]);
      label.position.copy(start).add(p).multiplyScalar(0.5);
      const d = start.distanceTo(p);
      el.textContent = state.units === 'imperial' ? formatFeetInches(d) : formatMeters(d);
    };
    api.canvas.addEventListener('pointermove', onMove);
    return () => {
      api.canvas.removeEventListener('pointermove', onMove);
      api.scene.remove(g);
      disposeGroup(g);
    };
  }, [api, active, state.pending, state.units, version]);

  return null;
}

function disposeGroup(g: THREE.Object3D) {
  for (const child of [...g.children]) {
    disposeGroup(child);
    g.remove(child);
    if (child instanceof CSS2DObject) child.element.remove();
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose?.();
  }
}
