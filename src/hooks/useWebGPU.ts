'use client';

import { useEffect, useState } from 'react';

export interface WebGPUState {
  /** null while probing */
  isSupported: boolean | null;
  adapter: GPUAdapterLite | null;
  adapterName: string | null;
  /** WebGL2 is the fallback splat backend. */
  webgl2: boolean;
  warning: string | null;
  isMobile: boolean;
}

/**
 * Probe `navigator.gpu` for a usable adapter. Browsers without WebGPU (Firefox stable, older Safari)
 * are routed through the WebGL2 splat pipeline with a visible notice.
 */
export function useWebGPU(): WebGPUState {
  const [state, setState] = useState<WebGPUState>({
    isSupported: null,
    adapter: null,
    adapterName: null,
    webgl2: true,
    warning: null,
    isMobile: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
      let webgl2 = false;
      try {
        webgl2 = !!document.createElement('canvas').getContext('webgl2');
      } catch {
        webgl2 = false;
      }
      let adapter: GPUAdapterLite | null = null;
      if (navigator.gpu) {
        try {
          adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        } catch {
          adapter = null;
        }
      }
      if (cancelled) return;
      const info = adapter?.info;
      setState({
        isSupported: !!adapter,
        adapter,
        adapterName: info ? [info.vendor, info.architecture || info.device].filter(Boolean).join(' · ') || 'WebGPU adapter' : null,
        webgl2,
        isMobile,
        warning: adapter
          ? null
          : webgl2
            ? 'WebGPU is not available in this browser, so rendering falls back to WebGL2.'
            : 'Neither WebGPU nor WebGL2 is available, so 3D rendering is not possible on this device.',
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
