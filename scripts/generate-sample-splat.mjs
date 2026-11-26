// Generates public/models/sample-loft.splat, a procedural Y-up loft interior made of flat Gaussians,
// plus public/textures/floor-grid.png. Run: npm run gen:splat
//
// .splat layout (antimatter15): 32 bytes per splat
//   float32 x,y,z | float32 sx,sy,sz | uint8 r,g,b,a | uint8 qw,qx,qy,qz  (q*128+128)

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jitter = (a) => (rnd() - 0.5) * a;
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

const splats = [];
function push(x, y, z, sx, sy, sz, [r, g, b], a = 255) {
  splats.push([x, y, z, sx, sy, sz, clamp(r), clamp(g), clamp(b), clamp(a)]);
}
const vary = ([r, g, b], amt = 10) => {
  const n = jitter(amt * 2);
  return [r + n + jitter(amt * 0.5), g + n + jitter(amt * 0.5), b + n + jitter(amt * 0.5)];
};

const STEP = 0.035;
const THIN = 0.004;

/** Axis-aligned rectangle. axis = normal axis ('x'|'y'|'z'). colorFn(u,v) -> rgb or null (hole). */
function plane(axis, at, u0, u1, v0, v1, colorFn, step = STEP) {
  const s = step * 0.55;
  for (let u = u0 + step / 2; u < u1; u += step) {
    for (let v = v0 + step / 2; v < v1; v += step) {
      const uu = u + jitter(step * 0.5);
      const vv = v + jitter(step * 0.5);
      const c = colorFn(uu, vv);
      if (!c) continue;
      if (axis === 'y') push(uu, at + jitter(0.003), vv, s, THIN, s, c);
      else if (axis === 'x') push(at + jitter(0.003), vv, uu, THIN, s, s, c);
      else push(uu, vv, at + jitter(0.003), s, s, THIN, c);
    }
  }
}

/** Box surfaces (no bottom). */
function box(x0, x1, y0, y1, z0, z1, colorFn, step = 0.025) {
  plane('y', y1, x0, x1, z0, z1, (u, v) => colorFn('top', u, y1, v), step);
  plane('x', x0, z0, z1, y0, y1, (u, v) => colorFn('side', x0, v, u), step);
  plane('x', x1, z0, z1, y0, y1, (u, v) => colorFn('side', x1, v, u), step);
  plane('z', z0, x0, x1, y0, y1, (u, v) => colorFn('side', u, v, z0), step);
  plane('z', z1, x0, x1, y0, y1, (u, v) => colorFn('side', u, v, z1), step);
}

function blob(cx, cy, cz, r, count, colorFn) {
  for (let i = 0; i < count; i++) {
    const t = rnd() * Math.PI * 2;
    const p = Math.acos(2 * rnd() - 1);
    const rr = r * (0.75 + rnd() * 0.25);
    const x = cx + rr * Math.sin(p) * Math.cos(t);
    const y = cy + rr * Math.cos(p);
    const z = cz + rr * Math.sin(p) * Math.sin(t);
    const s = 0.012 + rnd() * 0.012;
    push(x, y, z, s, s * 0.6, s, colorFn(y));
  }
}

// ---- Room: x -4..4, y 0..3.2, z -3..3 ----
const W = 4, H = 3.2, D = 3;

// Oak plank floor (planks run along x, 18 cm wide)
plane('y', 0, -W, W, -D, D, (x, z) => {
  const plank = Math.floor((z + D) / 0.18);
  const offset = (plank * 0.73) % 1.6;
  const seam = ((x + W + offset) % 1.6) < 0.012 || ((z + D) % 0.18) < 0.006;
  const tone = 0.85 + ((plank * 37) % 11) / 40;
  const base = [168 * tone, 118 * tone, 76 * tone];
  return seam ? [70, 48, 32] : vary(base, 8);
});

// Ceiling
plane('y', H, -W, W, -D, D, () => vary([228, 226, 220], 4), 0.05);

// Back wall (z = -D): big window
plane('z', -D, -W, W, 0, H, (x, y) => {
  const inWin = x > -2.2 && x < 2.2 && y > 0.7 && y < 2.7;
  if (inWin) {
    const mullion = Math.abs(x) < 0.03 || Math.abs(x - 1.1) < 0.025 || Math.abs(x + 1.1) < 0.025 || Math.abs(y - 1.7) < 0.025;
    if (mullion) return [40, 42, 46];
    const sky = 1 - (y - 0.7) / 2;
    return vary([190 + 40 * sky, 222 + 20 * sky, 250], 5);
  }
  const frame = x > -2.28 && x < 2.28 && y > 0.62 && y < 2.78;
  return frame ? [38, 40, 44] : vary([236, 233, 226], 5);
});

// Left wall (x = -W): sage green with a picture frame
plane('x', -W, -D, D, 0, H, (z, y) => {
  if (z > -0.8 && z < 0.8 && y > 1.3 && y < 2.2) {
    const border = z < -0.74 || z > 0.74 || y < 1.36 || y > 2.14;
    if (border) return [30, 30, 30];
    // abstract artwork
    const t = Math.sin(z * 6) + Math.cos(y * 7);
    return t > 0.4 ? [222, 120, 70] : t > -0.4 ? [60, 110, 160] : [240, 220, 180];
  }
  if (y < 0.1) return [245, 245, 240]; // skirting
  return vary([150, 168, 142], 5);
});

// Right wall (x = +W): exposed brick
plane('x', W, -D, D, 0, H, (z, y) => {
  const row = Math.floor(y / 0.075);
  const off = row % 2 ? 0.11 : 0;
  const mortar = (y % 0.075) < 0.01 || ((z + D + off) % 0.22) < 0.012;
  if (mortar) return vary([200, 192, 180], 6);
  const k = ((row * 13 + Math.floor((z + D + off) / 0.22) * 7) % 9) / 9;
  return vary([150 + 40 * k, 70 + 20 * k, 55 + 10 * k], 10);
});

// Front wall (z = +D): door
plane('z', D, -W, W, 0, H, (x, y) => {
  if (x > 2.2 && x < 3.2 && y < 2.15) {
    const panel = Math.abs(x - 2.7) < 0.4 && ((y > 0.25 && y < 1.0) || (y > 1.2 && y < 1.95));
    return panel ? [92, 62, 40] : [120, 82, 52];
  }
  if (y < 0.1) return [245, 245, 240];
  return vary([232, 226, 214], 5);
});

// Rug
plane('y', 0.012, -1.6, 1.6, -0.6, 1.4, (x, z) => {
  const border = x < -1.45 || x > 1.45 || z < -0.45 || z > 1.25;
  if (border) return vary([150, 45, 40], 6);
  const d = (Math.floor((x + 2) / 0.25) + Math.floor((z + 2) / 0.25)) % 2;
  return d ? vary([214, 196, 168], 6) : vary([186, 160, 130], 6);
}, 0.03);

// Sofa (facing -z, against the rug)
const sofa = [72, 86, 112];
box(-1.3, 1.3, 0.1, 0.45, 1.7, 2.6, (_f) => vary(sofa, 8));
box(-1.3, 1.3, 0.45, 0.95, 2.4, 2.6, () => vary(sofa, 8));
box(-1.4, -1.2, 0.1, 0.65, 1.7, 2.6, () => vary(sofa, 8));
box(1.2, 1.4, 0.1, 0.65, 1.7, 2.6, () => vary(sofa, 8));
// cushions
box(-0.6, -0.1, 0.45, 0.8, 2.2, 2.4, () => vary([214, 170, 80], 8));
box(0.1, 0.6, 0.45, 0.8, 2.2, 2.4, () => vary([200, 200, 196], 6));

// Coffee table
box(-0.6, 0.6, 0.36, 0.41, 0.1, 0.7, (f) => (f === 'top' ? vary([120, 84, 52], 6) : [80, 56, 36]));
for (const [x, z] of [[-0.55, 0.15], [0.55, 0.15], [-0.55, 0.65], [0.55, 0.65]]) box(x - 0.02, x + 0.02, 0, 0.36, z - 0.02, z + 0.02, () => [30, 30, 32], 0.015);

// Kitchen island (left side)
box(-3.6, -2.5, 0, 0.92, -1.2, 1.0, (f, _x, y) => (f === 'top' ? vary([236, 236, 232], 4) : y > 0.85 ? [220, 220, 216] : vary([60, 66, 74], 4)));
// Bar stools
for (const z of [-0.7, 0, 0.7]) {
  box(-2.35, -2.05, 0.62, 0.68, z - 0.15, z + 0.15, () => vary([140, 96, 60], 6), 0.02);
  box(-2.22, -2.18, 0, 0.62, z - 0.02, z + 0.02, () => [30, 30, 32], 0.015);
}

// Dining table + bench near the brick wall
box(2.6, 3.5, 0.72, 0.77, -1.6, 0.6, (f) => (f === 'top' ? vary([150, 104, 66], 8) : [90, 62, 40]));
for (const [x, z] of [[2.65, -1.55], [3.45, -1.55], [2.65, 0.55], [3.45, 0.55]]) box(x - 0.03, x + 0.03, 0, 0.72, z - 0.03, z + 0.03, () => [40, 36, 34], 0.015);
box(2.2, 2.45, 0.42, 0.47, -1.5, 0.5, () => vary([150, 104, 66], 8));

// Bookshelf against the front wall
box(-3.6, -2.4, 0, 2.0, 2.65, 2.98, (f, x, y) => {
  if (f === 'side' && y > 0.05 && Math.abs(((y + 0.02) % 0.4) - 0.2) < 0.17 && x > -3.55 && x < -2.45) {
    const k = Math.floor(x / 0.06);
    const hues = [[170, 60, 50], [50, 90, 140], [200, 170, 90], [60, 120, 80], [230, 220, 200]];
    return vary(hues[Math.abs(k) % hues.length], 10);
  }
  return vary([235, 232, 225], 5);
});

// Plants
box(3.4, 3.75, 0, 0.42, 2.3, 2.65, () => vary([196, 184, 166], 6));
blob(3.57, 0.95, 2.47, 0.45, 2600, (y) => vary(y > 1.1 ? [70, 140, 60] : [50, 110, 48], 18));
box(-3.75, -3.45, 0, 0.32, -2.75, -2.45, () => vary([60, 60, 64], 4));
blob(-3.6, 0.7, -2.6, 0.32, 1500, () => vary([60, 125, 55], 18));

// Pendant lights above the island
for (const z of [-0.6, 0.4]) {
  blob(-3.05, 2.2, z, 0.14, 600, () => [255, 236, 190]);
  box(-3.06, -3.04, 2.3, H, z - 0.01, z + 0.01, () => [30, 30, 30], 0.01);
}

// Sunlight patch on the floor through the window
for (let i = 0; i < 4000; i++) {
  const x = -1.8 + rnd() * 3.6;
  const z = -2.9 + rnd() * 1.6;
  push(x, 0.006, z, 0.025, THIN, 0.025, [255, 236, 200], 60);
}

// ---- Write .splat ----
const buf = Buffer.alloc(splats.length * 32);
splats.forEach((s, i) => {
  const o = i * 32;
  for (let k = 0; k < 6; k++) buf.writeFloatLE(s[k], o + k * 4);
  buf[o + 24] = s[6];
  buf[o + 25] = s[7];
  buf[o + 26] = s[8];
  buf[o + 27] = s[9];
  buf[o + 28] = 255; // qw (identity)
  buf[o + 29] = 128;
  buf[o + 30] = 128;
  buf[o + 31] = 128;
});
mkdirSync('public/models', { recursive: true });
writeFileSync('public/models/sample-loft.splat', buf);
console.log(`sample-loft.splat: ${splats.length} splats, ${(buf.length / 1e6).toFixed(1)} MB`);

// ---- floor-grid.png (256x256, 1 m grid with 10 cm subdivisions, RGBA) ----
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync('public/textures', { recursive: true });
writeFileSync(
  'public/textures/floor-grid.png',
  png(256, 256, (x, y) => {
    const major = x < 2 || y < 2;
    const minor = x % 25.6 < 1 || y % 25.6 < 1;
    return major ? [148, 163, 184, 140] : minor ? [148, 163, 184, 40] : [0, 0, 0, 0];
  }),
);
console.log('floor-grid.png written');
