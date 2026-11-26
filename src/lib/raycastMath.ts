import * as THREE from 'three';

/**
 * Multi-ray spatial intersection metrology for Gaussian splat scenes.
 *
 * Splat scenes have no mesh, so a "hit" is resolved against splat centers:
 *  1. `pickSplatSurface` – a single ray hits the first dense cluster of splat centers inside a
 *     narrow cone (first-surface depth, median-filtered to reject floaters).
 *  2. `triangulateRays` – two rays toward the same feature from different viewpoints are
 *     intersected in closed form (midpoint of the common perpendicular). This refines a pick
 *     when splat centers alone are noisy.
 */

const INCH_PER_M = 39.37007874015748;

export interface DistanceResult {
  meters: number;
  metric: string; // "X.XX m"
  imperial: string; // X' X"
}

/** Exact Euclidean distance between two world points, formatted metric + imperial. */
export function raycastDistance(p1: THREE.Vector3, p2: THREE.Vector3): DistanceResult {
  const meters = p1.distanceTo(p2);
  return { meters, metric: formatMeters(meters), imperial: formatFeetInches(meters) };
}

export function formatMeters(m: number): string {
  return `${m.toFixed(2)} m`;
}

export function formatFeetInches(m: number): string {
  const totalInches = m * INCH_PER_M;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return `${feet}' ${inches}"`;
}

export interface SplatCloud {
  /** xyz triplets in world space */
  centers: Float32Array;
  count: number;
  bounds: THREE.Box3;
}

export interface SurfaceHit {
  point: THREE.Vector3;
  distance: number;
  /** Number of splat centers that supported the hit (confidence). */
  support: number;
}

/**
 * Cast a ray against a splat cloud. Splat centers whose perpendicular distance to the ray is
 * below `radius(t) = max(minRadius, t * coneTan)` are candidates; we take the nearest depth
 * band (first surface) and return the median of that band.
 */
export function pickSplatSurface(
  ray: THREE.Ray,
  cloud: SplatCloud,
  opts: { coneTan?: number; minRadius?: number; band?: number; maxDistance?: number } = {},
): SurfaceHit | null {
  const coneTan = opts.coneTan ?? 0.012;
  const minRadius = opts.minRadius ?? 0.015;
  const band = opts.band ?? 0.08;
  const maxDistance = opts.maxDistance ?? 500;
  const { centers, count } = cloud;
  const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
  const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;

  // Collect candidate depths (t) — typed arrays keep this allocation-light for 1M+ splats.
  const ts: number[] = [];
  for (let i = 0; i < count; i++) {
    const px = centers[i * 3] - ox;
    const py = centers[i * 3 + 1] - oy;
    const pz = centers[i * 3 + 2] - oz;
    const t = px * dx + py * dy + pz * dz;
    if (t <= 0.05 || t > maxDistance) continue;
    const r = Math.max(minRadius, t * coneTan);
    const qx = px - t * dx, qy = py - t * dy, qz = pz - t * dz;
    if (qx * qx + qy * qy + qz * qz < r * r) ts.push(t);
  }
  if (ts.length === 0) return null;
  ts.sort((a, b) => a - b);

  // Reject isolated floaters: first window of width `band` that contains >= k samples.
  const k = Math.min(4, ts.length);
  let start = 0;
  for (let i = 0; i + k - 1 < ts.length; i++) {
    if (ts[i + k - 1] - ts[i] <= band) {
      start = i;
      break;
    }
  }
  const window: number[] = [];
  for (let i = start; i < ts.length && ts[i] - ts[start] <= band; i++) window.push(ts[i]);
  const t = window[Math.floor(window.length / 2)];
  return { point: ray.at(t, new THREE.Vector3()), distance: t, support: window.length };
}

/**
 * Closest-approach triangulation of two rays (forward triangulation).
 * Returns the midpoint of the shortest segment between the rays plus the residual gap;
 * null when rays are near-parallel (baseline too small to triangulate).
 */
export function triangulateRays(r1: THREE.Ray, r2: THREE.Ray): { point: THREE.Vector3; residual: number } | null {
  const w0 = new THREE.Vector3().subVectors(r1.origin, r2.origin);
  const a = r1.direction.dot(r1.direction);
  const b = r1.direction.dot(r2.direction);
  const c = r2.direction.dot(r2.direction);
  const d = r1.direction.dot(w0);
  const e = r2.direction.dot(w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-6) return null;
  const s = (b * e - c * d) / denom;
  const t = (a * e - b * d) / denom;
  if (s < 0 || t < 0) return null;
  const p1 = r1.at(s, new THREE.Vector3());
  const p2 = r2.at(t, new THREE.Vector3());
  return { point: p1.clone().add(p2).multiplyScalar(0.5), residual: p1.distanceTo(p2) };
}

/**
 * Multi-ray least-squares intersection for N >= 2 rays: minimises the sum of squared
 * perpendicular distances (solves Σ(I - ddᵀ) p = Σ(I - ddᵀ) o).
 */
export function triangulateMany(rays: THREE.Ray[]): THREE.Vector3 | null {
  if (rays.length < 2) return null;
  const A = new THREE.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
  const bx = new THREE.Vector3();
  const m = new THREE.Matrix3();
  for (const r of rays) {
    const d = r.direction;
    m.set(
      1 - d.x * d.x, -d.x * d.y, -d.x * d.z,
      -d.y * d.x, 1 - d.y * d.y, -d.y * d.z,
      -d.z * d.x, -d.z * d.y, 1 - d.z * d.z,
    );
    for (let i = 0; i < 9; i++) A.elements[i] += m.elements[i];
    bx.add(r.origin.clone().applyMatrix3(m));
  }
  if (Math.abs(A.determinant()) < 1e-9) return null;
  return bx.applyMatrix3(A.clone().invert());
}

/** Intersect a ray with the horizontal plane y = h. */
export function rayToFloor(ray: THREE.Ray, h: number): THREE.Vector3 | null {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h);
  return ray.intersectPlane(plane, new THREE.Vector3());
}

/** Robust floor height: low percentile of splat Y (ignores sub-floor floaters). */
export function estimateFloorY(cloud: SplatCloud, percentile = 0.03): number {
  const n = Math.min(cloud.count, 200_000);
  const step = Math.max(1, Math.floor(cloud.count / n));
  const ys: number[] = [];
  for (let i = 0; i < cloud.count; i += step) ys.push(cloud.centers[i * 3 + 1]);
  ys.sort((a, b) => a - b);
  return ys[Math.floor(ys.length * percentile)] ?? 0;
}
