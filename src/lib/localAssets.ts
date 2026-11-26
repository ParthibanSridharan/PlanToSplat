'use client';

/**
 * Tiny IndexedDB blob store so splat files uploaded without Supabase survive a page reload.
 * URLs of the form `local:<key>` resolve through here.
 */

const DB_NAME = 'plantosplat';
const STORE = 'assets';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putLocalAsset(key: string, blob: Blob): Promise<string> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return `local:${key}`;
}

export async function getLocalAsset(key: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

/** Resolve a project splat URL to something the loader can fetch. */
export async function resolveAssetUrl(url: string): Promise<string | null> {
  if (!url.startsWith('local:')) return url;
  const blob = await getLocalAsset(url.slice(6));
  return blob ? URL.createObjectURL(blob) : null;
}
