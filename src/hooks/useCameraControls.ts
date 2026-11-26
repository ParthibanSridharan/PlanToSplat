'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { SceneApi } from '@/components/3d/SceneContext';
import type { CameraMode } from '@/types';

export const EYE_HEIGHT = 1.6;
const WALK_SPEED = 2.2; // m/s
const SPRINT = 2.2;
const LOOK_SENS = 0.0025; // rad / px
const STICK_LOOK = 1.8; // rad / s at full deflection

/**
 * Controller state manager: continuous FPS walkthrough (PointerLockControls + drag-look +
 * WASD + virtual joysticks) or aerial OrbitControls. The two never run at the same time.
 */
export function useCameraControls(api: SceneApi | null, mode: CameraMode, sceneVersion: number) {
  const [locked, setLocked] = useState(false);
  const plcRef = useRef<PointerLockControls | null>(null);
  const eyeOffset = useRef(EYE_HEIGHT);

  useEffect(() => {
    if (!api) return;
    const { camera, canvas, bounds } = api;
    const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
    const disposers: (() => void)[] = [];

    if (mode === 'orbit') {
      const size = bounds.isEmpty() ? new THREE.Vector3(10, 4, 10) : bounds.getSize(new THREE.Vector3());
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.copy(center);
      controls.maxPolarAngle = Math.PI * 0.495;
      controls.minDistance = 0.5;
      controls.maxDistance = Math.max(size.x, size.z) * 4 + 10;
      // Rise to an aerial vantage point above the current position.
      const r = Math.max(size.x, size.z) * 0.9 + 2;
      camera.position.set(center.x + r * 0.6, center.y + r * 0.8, center.z + r * 0.6);
      camera.lookAt(center);
      const off = api.onFrame(() => {
        controls.enabled = !api.interactionLock.current;
        controls.update();
      });
      disposers.push(off, () => controls.dispose());
    } else {
      // ---- FPS walkthrough ----
      const plc = new PointerLockControls(camera, canvas);
      plc.pointerSpeed = 0.8;
      plcRef.current = plc;
      const onLock = () => setLocked(true);
      const onUnlock = () => setLocked(false);
      plc.addEventListener('lock', onLock);
      plc.addEventListener('unlock', onUnlock);

      // Start at eye height near the scene centre when coming from orbit.
      camera.position.set(center.x, api.floorY + eyeOffset.current, center.z);
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(camera.quaternion);
      euler.x = 0;
      euler.z = 0;
      camera.quaternion.setFromEuler(euler);

      const keys = new Set<string>();
      const onKeyDown = (e: KeyboardEvent) => {
        if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
        keys.add(e.code);
      };
      const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
      const onBlur = () => keys.clear();
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);

      // Drag-to-look when the pointer isn't locked (touch, trackpads, tool modes).
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const look = (dx: number, dy: number) => {
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= dx;
        euler.x = THREE.MathUtils.clamp(euler.x - dy, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
        camera.quaternion.setFromEuler(euler);
      };
      const onDown = (e: PointerEvent) => {
        if (plc.isLocked || api.interactionLock.current) return;
        if (e.pointerType === 'touch' && (e.target as HTMLElement) !== canvas) return;
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging || plc.isLocked || api.interactionLock.current) return;
        look((e.clientX - lastX) * LOOK_SENS, (e.clientY - lastY) * LOOK_SENS);
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onUp = () => {
        dragging = false;
      };
      canvas.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);

      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      const move = new THREE.Vector3();
      const off = api.onFrame((dt) => {
        const { input } = api;
        // Right stick look
        if (input.look.x || input.look.y) look(input.look.x * STICK_LOOK * dt, -input.look.y * STICK_LOOK * dt);

        let fwd = input.move.y;
        let strafe = input.move.x;
        if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;
        if (keys.has('KeyE')) eyeOffset.current = Math.min(8, eyeOffset.current + dt * 1.5);
        if (keys.has('KeyQ')) eyeOffset.current = Math.max(0.4, eyeOffset.current - dt * 1.5);

        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        right.crossVectors(forward, camera.up).normalize();
        move.set(0, 0, 0).addScaledVector(forward, fwd).addScaledVector(right, strafe);
        if (move.lengthSq() > 1) move.normalize();
        const speed = WALK_SPEED * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT : 1);
        camera.position.addScaledVector(move, speed * dt);

        // Smoothly settle on eye height above the estimated floor.
        const targetY = api.floorY + eyeOffset.current;
        camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 8);

        // Soft boundary: stay within the reconstructed volume (+ margin).
        if (!api.bounds.isEmpty()) {
          const m = 1.5;
          camera.position.x = THREE.MathUtils.clamp(camera.position.x, api.bounds.min.x - m, api.bounds.max.x + m);
          camera.position.z = THREE.MathUtils.clamp(camera.position.z, api.bounds.min.z - m, api.bounds.max.z + m);
        }
      });

      disposers.push(off, () => {
        plc.removeEventListener('lock', onLock);
        plc.removeEventListener('unlock', onUnlock);
        if (plc.isLocked) plc.unlock();
        plc.dispose();
        plcRef.current = null;
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      });
    }

    return () => disposers.forEach((d) => d());
    // Re-run when the scene (bounds/floor) changes or the mode flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, mode, sceneVersion]);

  return {
    locked,
    lock: () => plcRef.current?.lock(),
    unlock: () => plcRef.current?.unlock(),
  };
}
