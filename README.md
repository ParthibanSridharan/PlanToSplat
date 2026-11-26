# PlanToSplat AI

Turn multi-view property photos and video into walkable 3D Gaussian Splat scenes in the browser. You can measure them, stage furniture in them, and design houses on land plots.

## Quick start

```bash
npm install
npm run gen:splat   # (re)generates public/models/sample-loft.splat + floor-grid.png
npm run dev         # http://localhost:3000
```

- `/` is the landing page
- `/studio` is upload, capture-quality inspection and recent projects
- `/studio/demo` is the walkable sample loft
- `/studio/demo-land` is the Land-to-Home designer sample

Everything works with **no environment variables**. Optional integrations are in `.env.example`:

| Variable | Without it | With it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Projects are kept in server memory plus browser localStorage, and splat files in IndexedDB | Projects go in the `projects` table and files in the `splats` bucket (schema is in `src/lib/supabaseClient.ts`) |
| `POLY_PIZZA_API_KEY` | A built-in procedural furniture set (10 items) | Searchable low-poly models from Poly Pizza, proxied through `/api/staging` |
| `RECON_WORKER_URL` / `_TOKEN` | `/api/process` runs a **demo pipeline** that finishes with the sample scene | Jobs go to your GPU trainer (`POST /jobs`, `GET /jobs/:id` → `{status, stage, progress, splatUrl}`) |

## Features

- **Continuous walkthrough**: WASD/arrow keys, Shift to sprint, Q/E for eye height, drag-to-look, double-click for PointerLock, and dual Nipple.js joysticks on touch devices. There is also an Aerial orbit mode with a dollhouse ceiling cutaway, done by injecting a height clip into the splat shader.
- **Metrology** (`src/lib/raycastMath.ts`):
  - Surface snap casts a ray-cone against splat centres and median-filters the first dense depth band.
  - Triangulate intersects two rays from two viewpoints in closed form. A least-squares N-ray solver is also included.
  - Results are shown in metres and in feet and inches.
- **Virtual staging**: click on the estimated floor (a robust percentile of splat Y) to place a model, then use TransformControls (keys 1/2/3, Delete). Staging is saved per project.
- **Mini-map**: the splat cloud is projected once through an `OrthographicCamera` into a top-down floorplan. Each frame adds your position, the FOV cone and staged items. Click the map to teleport.
- **Capture inspector**: runs before anything is uploaded.
  - Laplacian-variance blur detection, using OpenCV.js WASM when it loads and an identical JS kernel otherwise.
  - Exposure check, dHash overlap between consecutive frames, and EXIF focal length → fx and HFOV.
  - Video files are split into frames in the browser.
- **Land-to-Home**: turns a photo into a heightmap terrain and places a parametric wireframe house on a levelled pad. It reports pad elevation, slope, and cut/fill volumes on a 0.5 m grid.
- **Performance**: dynamic resolution scaling (auto/high/low), opacity-threshold pruning (stronger on mobile), half-precision covariances, integer-based WASM sorting, and a capped CPU copy of splat centres.

## Rendering backend: a deliberate deviation

The original brief asked for gsplat.js with Three.js WebGPURenderer. This build uses **`@mkkellogg/gaussian-splats-3d`** (Three.js-native) on a **WebGL2** renderer, for two reasons:

1. gsplat.js runs its own scene and camera, so furniture, gizmos, labels and raycasting would need a second canvas that is kept in sync by hand.
2. No production splat renderer runs on Three's WebGPURenderer yet.

`useWebGPU` still probes `navigator.gpu` and reports the adapter. The renderer is isolated in `WebGPUCanvas.tsx`, so it can be swapped for a WebGPU splat backend later.

## Notes

- `reactStrictMode` is off. Dev-mode double-mounting disposes and immediately re-creates the splat viewer, and the library doesn't survive that.
- Without Supabase, a splat you upload lives only in that browser's IndexedDB, so share links won't work on other devices.
- Land terrain from a single photo is a stylised proxy (luminance → height), not survey data.
