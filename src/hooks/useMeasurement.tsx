'use client';

import { useCallback, useState } from 'react';
import * as THREE from 'three';
import { raycastDistance } from '@/lib/raycastMath';
import type { Measurement } from '@/types';
import { uid } from '@/lib/utils';

export type MeasureMethod = 'surface' | 'triangulate';

/** 3D spatial points state: pending anchor + completed measurements. */
export function useMeasurement() {
  const [pending, setPending] = useState<THREE.Vector3 | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [method, setMethod] = useState<MeasureMethod>('surface');
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');

  const addPoint = useCallback(
    (p: THREE.Vector3) => {
      if (!pending) {
        setPending(p.clone());
        return null;
      }
      const d = raycastDistance(pending, p);
      const m: Measurement = {
        id: uid('m'),
        a: pending.toArray() as [number, number, number],
        b: p.toArray() as [number, number, number],
        meters: d.meters,
        label: `${d.metric} · ${d.imperial}`,
      };
      setMeasurements((ms) => [...ms, m]);
      setPending(null);
      return m;
    },
    [pending],
  );

  const remove = useCallback((id: string) => setMeasurements((ms) => ms.filter((m) => m.id !== id)), []);
  const clear = useCallback(() => {
    setMeasurements([]);
    setPending(null);
  }, []);
  const cancelPending = useCallback(() => setPending(null), []);

  return { pending, measurements, method, setMethod, units, setUnits, addPoint, remove, clear, cancelPending };
}

export type MeasurementState = ReturnType<typeof useMeasurement>;
