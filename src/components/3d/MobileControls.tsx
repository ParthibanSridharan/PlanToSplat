'use client';

import { useEffect, useRef } from 'react';
import { useScene } from './SceneContext';

/**
 * Dual virtual joysticks (Nipple.js): left = walk / strafe, right = look.
 * Writes normalised vectors into the shared scene input consumed by useCameraControls.
 */
export default function MobileControls({ visible }: { visible: boolean }) {
  const api = useScene();
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api || !visible || !leftRef.current || !rightRef.current) return;
    let disposed = false;
    const managers: { destroy(): void }[] = [];
    (async () => {
      const nipplejs = (await import('nipplejs')).default;
      if (disposed) return;
      const mk = (zone: HTMLElement, color: string, target: { x: number; y: number }) => {
        const m = nipplejs.create({
          zone,
          mode: 'static',
          position: { left: '50%', top: '50%' },
          color,
          size: 110,
          restOpacity: 0.55,
        });
        m.on('move', (evt) => {
          const vec = evt.data?.vector;
          if (!vec) return;
          target.x = Math.max(-1, Math.min(1, vec.x));
          target.y = Math.max(-1, Math.min(1, vec.y));
        });
        m.on('end', () => {
          target.x = 0;
          target.y = 0;
        });
        managers.push(m);
      };
      mk(leftRef.current!, '#22d3ee', api.input.move);
      mk(rightRef.current!, '#818cf8', api.input.look);
    })();
    return () => {
      disposed = true;
      managers.forEach((m) => m.destroy());
      api.input.move.x = api.input.move.y = 0;
      api.input.look.x = api.input.look.y = 0;
    };
  }, [api, visible]);

  if (!visible) return null;
  return (
    <>
      <div ref={leftRef} className="pointer-events-auto absolute bottom-6 left-[150px] z-10 h-36 w-36 sm:left-[200px]" aria-label="Move joystick" />
      <div ref={rightRef} className="pointer-events-auto absolute bottom-6 right-6 z-10 h-36 w-36" aria-label="Look joystick" />
    </>
  );
}
