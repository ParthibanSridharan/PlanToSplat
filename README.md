<div align="center">

# 🏡 PlanToSplat AI

**Walkable 3D property tours from ordinary photos, running entirely in the browser.**

PlanToSplat turns multi-view photos and video of interiors, exteriors and land plots into interactive
3D Gaussian Splat scenes. Buyers, agents and designers can walk through these scenes, measure them,
stage furniture in them, and sketch a house on an empty plot. No app install or cloud GPU is needed to view a scene.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r171-black?style=flat-square&logo=three.js)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![3D Gaussian Splatting](https://img.shields.io/badge/3D-Gaussian%20Splatting-6366f1?style=flat-square)](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)

</div>

---

## Table of contents

- [The idea](#the-idea)
- [Key features](#key-features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Project status and roadmap](#project-status-and-roadmap)
- [Research foundation](#research-foundation)

---

## The idea

Property listings today are usually either flat photo galleries or panorama-node tours, where you
jump between fixed 360° bubbles. Neither lets you move freely through a space, check whether a sofa
fits, or picture a house on a bare plot.

**3D Gaussian Splatting (3DGS)** reconstructs a scene from overlapping photos as millions of small,
coloured, semi-transparent ellipsoids. These render photorealistically and fast enough for a
browser. PlanToSplat is built around that format with real-estate workflows in mind:

| Today's tours | PlanToSplat |
| :--- | :--- |
| Teleport between fixed panorama points | Continuous first-person walking (keyboard, mouse or touch joysticks) |
| Viewing streams from hosted GPU servers | Splats are sorted and drawn on the viewer's own GPU, with no per-view cloud cost |
| Measurement needs a dense mesh or special hardware | Point-to-point measurement directly on the splats |
| Staging is a separate, offline service | Click-to-place 3D furniture inside the tour |
| Empty land is just photos | A terrain model with a parametric house and earthworks estimate |

---

## Key features

### 🚶 Continuous walkthrough
- First-person **Walk** mode: WASD / arrow keys, Shift to sprint, Q/E for eye height, drag-to-look,
  and double-click for mouse lock.
- **Dual virtual joysticks** on phones and tablets (Nipple.js).
- **Aerial** orbit mode with a **dollhouse cutaway**: the ceiling is clipped on the GPU so you can see into rooms from above.
- **Floorplan mini-map** generated from the splat cloud, showing your position, view cone and staged furniture. Click it to teleport.

### 📐 Measurement on splats
- **Surface snap**: one click per point. A narrow ray cone finds the first dense layer of splats and
  filters out stray "floater" splats.
- **Triangulate**: click the same feature from two viewpoints. The two rays are intersected in closed form, which helps on thin or sparse surfaces.
- Results are shown in metres and in feet and inches, with labels in the 3D view.

### 🛋️ Virtual staging
- Click the detected floor to place furniture, then move, rotate and scale it with an on-screen gizmo (keys `1` `2` `3`, `Delete` to remove).
- Models come from the free [Poly Pizza](https://poly.pizza/) library through a server-side proxy. A built-in set of
  procedural furniture is used when no API key is configured.
- Staged layouts are saved with the project.

### 🏞️ Land-to-Home designer
- Builds a terrain heightmap from a photo of the plot.
- Places a **parametric wireframe house** (width, depth, floors, roof pitch, position, rotation) on a levelled foundation pad.
- Reports footprint, gross floor area, pad elevation, site slope, and **cut and fill volumes**, computed on a 0.5 m grid.

### 📸 Capture quality inspector (runs before upload)
- **Blur detection** using the variance of the Laplacian. It uses OpenCV.js (WebAssembly) when available, with an identical pure-JavaScript fallback.
- Exposure check, frame-to-frame **overlap** estimate (perceptual hashing), and **camera focal length / field of view** from EXIF data.
- Blurry frames can be excluded with one click. Video files are split into frames in the browser.

### ⚡ Performance on ordinary devices
- Dynamic resolution scaling (Auto / High / Low) to hold a smooth frame rate.
- Near-transparent splats are pruned on load, more aggressively on mobile.
- Half-precision GPU data, and depth sorting in WebAssembly on a background worker thread.

---

## How it works

```
 Photos / walkthrough video ─┐
 Existing .splat/.ply/.spz ──┼──►  Capture inspector (in the browser)
                             │       blur · exposure · overlap · EXIF intrinsics · video → frames
                             │                         │
                             │                         ▼
                             │        /api/process  ── reconstruction job queue
                             │          ├─ Worker mode: external GPU trainer
                             │          │    (SfM → 3DGS optimisation → compression)
                             │          └─ Demo mode: staged pipeline → bundled sample scene
                             │                         │
                             └──────────────►  .splat / .ply / .spz / .ksplat
                                                       │
                                                       ▼
                         3D Studio (WebGL2, Three.js + Gaussian splat renderer)
                ├── Walk / Aerial camera, joysticks, mini-map, dollhouse cutaway
                ├── Measurement (surface snap, two-ray triangulation)
                ├── Virtual staging (glTF furniture + transform gizmo)
                └── Land-to-Home terrain + house designer
```

Projects are stored in **Supabase** (PostgreSQL + Storage) when it is configured. Otherwise the app runs fully
locally: project records are kept in server memory and browser storage, and splat files in IndexedDB.

---

## Tech stack

| Layer | Technology |
| :--- | :--- |
| Framework | [Next.js 15](https://nextjs.org/) (App Router), [React 19](https://react.dev/), TypeScript (strict) |
| UI | [Tailwind CSS](https://tailwindcss.com/), [Lucide](https://lucide.dev/) icons, glassmorphic dark theme |
| 3D rendering | [Three.js](https://threejs.org/) r171 + [`@mkkellogg/gaussian-splats-3d`](https://github.com/mkkellogg/GaussianSplats3D) (WebGL2) |
| Controls | PointerLockControls, OrbitControls, TransformControls, [Nipple.js](https://github.com/yoannmoinet/nipplejs) |
| Image analysis | [OpenCV.js](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html) (WASM), [exifr](https://github.com/MikeKovarik/exifr) |
| Backend | Next.js API routes, [Supabase](https://supabase.com/) (optional) |
| 3D assets | [Poly Pizza API](https://poly.pizza/) (optional), built-in procedural furniture |

> **About WebGPU:** the app detects WebGPU and reports the GPU adapter, but splats are currently drawn
> with WebGL2. This keeps splats, furniture, gizmos and labels in one Three.js scene and works in
> every modern browser. The renderer is isolated in `WebGPUCanvas.tsx` so a WebGPU splat backend can
> replace it later.

---

## Getting started

**Requirements:** Node.js 18.18+ (20+ recommended) and a WebGL2-capable browser (current Chrome, Edge, Firefox or Safari).

```bash
git clone https://github.com/ParthibanSridharan/PlanToSplat.git
cd PlanToSplat
npm install
npm run dev
```

Open http://localhost:3000. No environment variables are needed to try it:

| Route | What you get |
| :--- | :--- |
| `/` | Landing page |
| `/studio` | Upload photos, video or a splat file, and see the quality report |
| `/studio/demo` | Walkable sample loft (measure, stage, aerial cutaway) |
| `/studio/demo-land` | Land-to-Home designer on a sample hillside plot |

Other scripts:

```bash
npm run build       # production build
npm run start       # serve the production build
npm run typecheck   # TypeScript check
npm run gen:splat   # regenerate the procedural demo scene in public/models/
```

---

## Configuration

Copy `.env.example` to `.env.local` and fill in only what you need. Each integration is optional and
the app falls back gracefully without it.

| Variable | Purpose | Without it |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project | Local storage only |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database writes (never sent to the browser) | Uses the anon key |
| `SUPABASE_BUCKET`, `NEXT_PUBLIC_SUPABASE_BUCKET` | Storage bucket for splats and images (default `splats`) | n/a |
| `POLY_PIZZA_API_KEY` | Search thousands of low-poly models ([get a key](https://poly.pizza/settings/api)) | Built-in furniture set |
| `RECON_WORKER_URL`, `RECON_WORKER_TOKEN` | External GPU reconstruction service | Demo pipeline returns the sample scene |

The Supabase table schema is documented in [`src/lib/supabaseClient.ts`](src/lib/supabaseClient.ts).

**Reconstruction worker contract:** the worker receives `POST {url}/jobs` with
`{ jobId, projectId, images: string[] }`. It must answer `GET {url}/jobs/:jobId` with
`{ status, stage, progress, splatUrl }`. Any 3DGS trainer, such as nerfstudio `splatfacto` or `gsplat`, can sit
behind this interface.

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                 # Landing page
│   ├── studio/page.tsx          # Upload + capture quality inspector
│   ├── studio/[id]/page.tsx     # Reconstruction progress → 3D Studio
│   └── api/
│       ├── process/route.ts     # Reconstruction job queue
│       ├── projects/route.ts    # Project CRUD (Supabase or memory)
│       └── staging/route.ts     # Poly Pizza search + model download proxy
├── components/
│   ├── 3d/                      # WebGPUCanvas, StudioViewer, RaycastMeasurer, VirtualStager,
│   │                            # MiniMap, MobileControls, LandHybrid, SceneContext
│   ├── ui/                      # HUD, Modal, Button, Card, Navbar
│   └── upload/                  # Dropzone, QualityReportCard
├── hooks/                       # useWebGPU, useCameraControls, useMeasurement
├── lib/                         # raycastMath, openCVCheck, videoFrames, polyPizzaApi,
│                                # supabaseClient, localAssets, projectsClient, server/*
└── types/                       # Shared types + splat renderer declarations
scripts/generate-sample-splat.mjs  # Builds the procedural demo loft (.splat)
docs/SETUP.md                      # Developer notes
```

---

## API reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/projects` | List projects |
| `GET` | `/api/projects?id=` | Get one project |
| `POST` | `/api/projects` | Create a project |
| `PATCH` | `/api/projects?id=` | Update name, staging, orientation or splat URL |
| `DELETE` | `/api/projects?id=` | Delete a project |
| `POST` | `/api/process` | Queue reconstruction `{ projectId, imageUrls[] }` |
| `GET` | `/api/process?jobId=` | Job status, stage and progress |
| `GET` | `/api/staging?q=` | Search furniture |
| `GET` | `/api/staging?download=` | Proxy a Poly Pizza model (allow-listed hosts, 25 MB cap) |

---

## Project status and roadmap

**Working today**
- Viewing, walking through, measuring and staging any `.splat`, `.ply`, `.spz` or `.ksplat` scene
- Capture quality inspector with OpenCV.js
- Land-to-Home designer
- Full upload → job → viewer flow (in demo mode)

**Not yet implemented**
- [ ] A hosted GPU reconstruction worker. Without one, photo uploads finish with the bundled sample scene.
- [ ] A WebGPU splat rendering backend
- [ ] User accounts and per-user project permissions (Supabase Auth + row-level security)
- [ ] Survey/DEM import for land plots. Photo-derived terrain is an approximation, not engineering data.
- [ ] Shareable public tours when using local-only storage

---

## Research foundation

- **3D Gaussian Splatting** (Kerbl et al., SIGGRAPH 2023): scenes stored as anisotropic Gaussians with
  opacity and colour, drawn back to front after depth sorting.
- **Compact representations** (Scaffold-GS, CityGaussian): the ideas behind opacity pruning, reduced precision
  and adaptive resolution for low-memory devices.
- **Ray-based metrology**: closed-form two-ray triangulation and least-squares N-ray intersection,
  so measurements need no dense mesh.
- **Interactive splat scenes** (VR-GS, SIGGRAPH 2024): mesh assets composited with splats and anchored by raycasting.

---

<div align="center">

Built with Next.js, Three.js and 3D Gaussian Splatting.

</div>
