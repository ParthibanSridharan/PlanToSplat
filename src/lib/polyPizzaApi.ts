import type { FurnitureAsset } from '@/types';
import { BUILTIN_FURNITURE } from './furnitureCatalog';

/**
 * Furniture streaming utility.
 *
 * Browser code talks to our own `/api/staging` proxy (keeps the Poly Pizza API key server-side and
 * sidesteps CORS on model downloads). When no key is configured the proxy answers with the
 * built-in procedural library so staging always works.
 */

export const POLY_PIZZA_BASE = 'https://api.poly.pizza/v1.1';
export const POLY_PIZZA_ASSET_HOSTS = ['static.poly.pizza', 'poly.pizza'];

interface PolyPizzaResult {
  ID?: string;
  Title?: string;
  Thumbnail?: string;
  Download?: string;
  Creator?: { Username?: string };
  Licence?: string;
  Attribution?: string;
}

/** Server-side: query Poly Pizza and normalise to FurnitureAsset. */
export async function searchPolyPizzaServer(query: string, apiKey: string, limit = 24): Promise<FurnitureAsset[]> {
  const url = `${POLY_PIZZA_BASE}/search/${encodeURIComponent(query)}?Limit=${limit}`;
  const res = await fetch(url, { headers: { 'x-auth-token': apiKey }, next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Poly Pizza ${res.status}`);
  const json = (await res.json()) as { results?: PolyPizzaResult[] };
  return (json.results ?? [])
    .filter((r) => r.Download && r.ID)
    .map((r) => ({
      id: `pp_${r.ID}`,
      title: r.Title ?? 'Untitled',
      thumbnail: r.Thumbnail ?? null,
      url: r.Download!,
      source: 'polypizza' as const,
      creator: r.Creator?.Username,
      licence: r.Licence,
    }));
}

/** Client-side search through the proxy. */
export async function searchFurniture(query: string): Promise<{ assets: FurnitureAsset[]; source: 'polypizza' | 'builtin'; note?: string }> {
  try {
    const res = await fetch(`/api/staging?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    const q = query.toLowerCase();
    return { assets: BUILTIN_FURNITURE.filter((a) => !q || a.title.toLowerCase().includes(q)), source: 'builtin', note: 'offline' };
  }
}

/** URL the GLTFLoader should fetch for a remote model (proxied to avoid CORS). */
export function proxiedModelUrl(url: string): string {
  if (url.startsWith('procedural:') || url.startsWith('/') || url.startsWith('blob:')) return url;
  return `/api/staging?download=${encodeURIComponent(url)}`;
}
