'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useScene, useSceneVersion } from './SceneContext';
import { rayToFloor } from '@/lib/raycastMath';
import { buildProceduralFurniture } from '@/lib/proceduralFurniture';
import { proxiedModelUrl } from '@/lib/polyPizzaApi';
import { uid } from '@/lib/utils';
import type { FurnitureAsset, StagedItem } from '@/types';
import { Move3d, RotateCw, Scaling, Trash, X } from 'lucide-react';

const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D>>();

async function loadModel(url: string): Promise<THREE.Object3D> {
  if (url.startsWith('procedural:')) return buildProceduralFurniture(url.slice(11));
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      loader.loadAsync(proxiedModelUrl(url)).then((gltf) => {
        const root = gltf.scene;
        // Normalise unknown Poly Pizza scales: aim for a ~1.2 m largest dimension unless plausible already.
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        if (maxDim > 4 || maxDim < 0.15) root.scale.multiplyScalar(1.2 / maxDim);
        // Re-centre: origin at the footprint centre, sitting on y = 0.
        const b2 = new THREE.Box3().setFromObject(root);
        const c = b2.getCenter(new THREE.Vector3());
        root.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z));
        const wrap = new THREE.Group();
        wrap.add(root);
        return wrap;
      }),
    );
  }
  return (await modelCache.get(url)!).clone(true);
}

interface Props {
  active: boolean;
  /** Asset to drop on the next floor click. */
  armedAsset: FurnitureAsset | null;
  onPlaced?: () => void;
  items: StagedItem[];
  onItemsChange: (items: StagedItem[]) => void;
  onNotice?: (msg: string) => void;
}

type GizmoMode = 'translate' | 'rotate' | 'scale';

/**
 * Virtual staging: raycast to the estimated floor, drop low-poly furniture, then move / rotate /
 * scale with TransformControls (rotation constrained to Y, scale uniform, objects stay on the floor).
 */
export default function VirtualStager({ active, armedAsset, onPlaced, items, onItemsChange, onNotice }: Props) {
  const api = useScene();
  const version = useSceneVersion();
  const groupRef = useRef<THREE.Group | null>(null);
  const objectsRef = useRef(new Map<string, THREE.Object3D>());
  const tcRef = useRef<TransformControls | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<GizmoMode>('translate');
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const armedRef = useRef(armedAsset);
  armedRef.current = armedAsset;

  // Root group + transform gizmo
  useEffect(() => {
    if (!api) return;
    const g = new THREE.Group();
    g.name = 'staging';
    api.scene.add(g);
    groupRef.current = g;

    const tc = new TransformControls(api.camera, api.canvas);
    tc.setSize(0.8);
    const helper = tc.getHelper();
    api.scene.add(helper);
    tc.addEventListener('dragging-changed', (e) => {
      api.interactionLock.current = Boolean((e as unknown as { value: boolean }).value);
      if (!(e as unknown as { value: boolean }).value) commit();
    });
    tc.addEventListener('objectChange', () => {
      const o = tc.object;
      if (!o) return;
      o.position.y = api.floorY; // keep anchored to the floor
      o.rotation.x = 0;
      o.rotation.z = 0;
      const s = THREE.MathUtils.clamp(o.scale.x, 0.2, 5);
      o.scale.setScalar(s);
    });
    tcRef.current = tc;

    function commit() {
      const next = itemsRef.current.map((it) => {
        const o = objectsRef.current.get(it.uid);
        if (!o) return it;
        return {
          ...it,
          position: o.position.toArray() as [number, number, number],
          rotationY: o.rotation.y,
          scale: o.scale.x,
        };
      });
      onItemsChange(next);
    }

    return () => {
      tc.detach();
      tc.dispose();
      api.scene.remove(helper);
      api.scene.remove(g);
      objectsRef.current.clear();
      groupRef.current = null;
      tcRef.current = null;
      api.interactionLock.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // Sync scene objects with item list
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const objs = objectsRef.current;
    const wanted = new Set(items.map((i) => i.uid));
    for (const [id, o] of objs) {
      if (!wanted.has(id)) {
        if (tcRef.current?.object === o) tcRef.current.detach();
        g.remove(o);
        objs.delete(id);
      }
    }
    for (const it of items) {
      const existing = objs.get(it.uid);
      if (existing) {
        existing.position.fromArray(it.position);
        existing.rotation.set(0, it.rotationY, 0);
        existing.scale.setScalar(it.scale);
        continue;
      }
      const placeholder = new THREE.Group();
      placeholder.userData.uid = it.uid;
      placeholder.position.fromArray(it.position);
      placeholder.rotation.set(0, it.rotationY, 0);
      placeholder.scale.setScalar(it.scale);
      objs.set(it.uid, placeholder);
      g.add(placeholder);
      loadModel(it.url)
        .then((model) => {
          model.traverse((c) => (c.userData.uid = it.uid));
          placeholder.add(model);
        })
        .catch(() => onNotice?.(`Could not load model "${it.title}"`));
    }
  }, [items, onNotice, version]);

  // Gizmo attach / mode
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;
    const o = selected ? objectsRef.current.get(selected) : undefined;
    if (o && active) {
      tc.attach(o);
      tc.setMode(mode);
      tc.showX = mode !== 'rotate';
      tc.showZ = mode !== 'rotate';
      tc.showY = mode !== 'translate';
    } else {
      tc.detach();
    }
  }, [selected, mode, active, items]);

  // Clicks: select existing furniture, or place the armed asset on the floor
  useEffect(() => {
    if (!api || !active) return;
    const raycaster = new THREE.Raycaster();
    return api.onClick((ndc) => {
      const g = groupRef.current;
      if (!g) return;
      raycaster.setFromCamera(ndc, api.camera);
      const hit = raycaster.intersectObjects(g.children, true)[0];
      if (hit && !armedRef.current) {
        setSelected(hit.object.userData.uid ?? null);
        return;
      }
      const asset = armedRef.current;
      if (!asset) {
        setSelected(null);
        return;
      }
      const p = rayToFloor(api.rayFromNdc(ndc), api.floorY);
      if (!p || p.distanceTo(api.camera.position) > 60) {
        onNotice?.('Click on the floor to place furniture.');
        return;
      }
      // Face the camera
      const toCam = new THREE.Vector3().subVectors(api.camera.position, p);
      const rotationY = Math.atan2(toCam.x, toCam.z);
      const item: StagedItem = {
        uid: uid('f'),
        assetId: asset.id,
        url: asset.url,
        title: asset.title,
        position: [p.x, api.floorY, p.z],
        rotationY,
        scale: 1,
      };
      onItemsChange([...itemsRef.current, item]);
      setSelected(item.uid);
      onPlaced?.();
    });
  }, [api, active, onItemsChange, onPlaced, onNotice]);

  // Keyboard: Delete / Backspace removes selection; 1/2/3 switch gizmo
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        onItemsChange(itemsRef.current.filter((i) => i.uid !== selected));
        setSelected(null);
      }
      if (e.key === '1') setMode('translate');
      if (e.key === '2') setMode('rotate');
      if (e.key === '3') setMode('scale');
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, selected, onItemsChange]);

  if (!active || !selected) return null;
  const sel = items.find((i) => i.uid === selected);
  if (!sel) return null;

  const btn = (m: GizmoMode, Icon: typeof Move3d, label: string, key: string) => (
    <button
      onClick={() => setMode(m)}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition ${mode === m ? 'bg-splat-500/30 text-white ring-1 ring-splat-400/60' : 'text-slate-300 hover:bg-white/10'}`}
      title={`${label} (${key})`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  return (
    <div className="glass pointer-events-auto absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl p-1.5 sm:top-20">
      <span className="max-w-[8rem] truncate px-2 text-xs font-medium text-slate-200">{sel.title}</span>
      {btn('translate', Move3d, 'Move', '1')}
      {btn('rotate', RotateCw, 'Rotate', '2')}
      {btn('scale', Scaling, 'Scale', '3')}
      <button
        onClick={() => {
          onItemsChange(items.filter((i) => i.uid !== selected));
          setSelected(null);
        }}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
        title="Delete (Del)"
      >
        <Trash className="h-3.5 w-3.5" /> Delete
      </button>
      <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10" title="Deselect (Esc)">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
