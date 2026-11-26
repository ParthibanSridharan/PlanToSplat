'use client';

import { createContext, useContext } from 'react';
import type * as THREE from 'three';
import type { SplatCloud } from '@/lib/raycastMath';
import type { CameraMode, ToolMode } from '@/types';

export interface JoystickInput {
  move: { x: number; y: number };
  look: { x: number; y: number };
}

export interface SceneApi {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** Overlay element for CSS2D labels. */
  labelRoot: HTMLElement;
  /** World-space splat centers (null until a splat scene has loaded). */
  cloud: SplatCloud | null;
  /** Optional per-splat RGB (0..255) for the minimap. */
  colors: Uint8Array | null;
  floorY: number;
  bounds: THREE.Box3;
  tool: ToolMode;
  cameraMode: CameraMode;
  input: JoystickInput;
  /** True while a gizmo is being dragged: camera controls must ignore the pointer. */
  interactionLock: { current: boolean };
  /** Subscribe to the render loop. Returns an unsubscribe fn. */
  onFrame(cb: (dt: number) => void): () => void;
  /** Subscribe to clean clicks on the canvas (pointer moved < 5px). */
  onClick(cb: (ndc: THREE.Vector2, ev: PointerEvent) => void): () => void;
  /** World ray through normalised device coordinates. */
  rayFromNdc(ndc: THREE.Vector2): THREE.Ray;
}

export const SceneContext = createContext<SceneApi | null>(null);

export function useScene(): SceneApi | null {
  return useContext(SceneContext);
}

/** Increments whenever a splat scene finishes loading (cloud / floor / bounds changed). */
export const SceneVersionContext = createContext(0);

export function useSceneVersion(): number {
  return useContext(SceneVersionContext);
}
