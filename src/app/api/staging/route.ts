import { NextResponse, type NextRequest } from 'next/server';
import { POLY_PIZZA_ASSET_HOSTS, searchPolyPizzaServer } from '@/lib/polyPizzaApi';
import { BUILTIN_FURNITURE } from '@/lib/furnitureCatalog';

export const dynamic = 'force-dynamic';

const MAX_MODEL_BYTES = 25 * 1024 * 1024;

/**
 * Poly Pizza proxy.
 *  GET /api/staging?q=sofa             -> { assets, source }
 *  GET /api/staging?download=<glb url> -> streams the model (host allow-listed, size-capped)
 */
export async function GET(req: NextRequest) {
  const download = req.nextUrl.searchParams.get('download');
  if (download) return proxyModel(download);

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 64);
  const key = process.env.POLY_PIZZA_API_KEY;
  const builtin = () => {
    const ql = q.toLowerCase();
    const hits = BUILTIN_FURNITURE.filter((a) => !ql || ql === 'furniture' || a.title.toLowerCase().includes(ql) || a.url.includes(ql));
    return hits.length ? hits : BUILTIN_FURNITURE;
  };

  if (!key) return NextResponse.json({ assets: builtin(), source: 'builtin', note: 'POLY_PIZZA_API_KEY not set' });
  try {
    const assets = await searchPolyPizzaServer(q || 'furniture', key);
    if (!assets.length) return NextResponse.json({ assets: builtin(), source: 'builtin', note: 'no results' });
    return NextResponse.json({ assets, source: 'polypizza' });
  } catch (e) {
    return NextResponse.json({ assets: builtin(), source: 'builtin', note: (e as Error).message });
  }
}

async function proxyModel(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'bad url' }, { status: 400 });
  }
  if (url.protocol !== 'https:' || !POLY_PIZZA_ASSET_HOSTS.includes(url.hostname)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 403 });
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 });
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_MODEL_BYTES) return NextResponse.json({ error: 'model too large' }, { status: 413 });
  return new NextResponse(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'model/gltf-binary',
      'cache-control': 'public, max-age=86400',
    },
  });
}
