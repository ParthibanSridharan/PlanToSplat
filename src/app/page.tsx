import Link from 'next/link';
import {
  ArrowRight,
  Camera,
  Cpu,
  Footprints,
  Mountain,
  Ruler,
  Sofa,
  Sparkles,
  Zap,
  Layers,
  ScanLine,
  Map as MapIcon,
} from 'lucide-react';

const features = [
  {
    icon: Footprints,
    title: 'Continuous walkthrough',
    body: 'Walk with WASD, touch joysticks or pointer-lock instead of teleporting between fixed 360° panorama nodes.',
  },
  {
    icon: Zap,
    title: 'Zero-cost client rendering',
    body: 'Splats are depth-sorted in a WASM worker and rasterised on your GPU, so viewing costs the platform no cloud GPU time.',
  },
  {
    icon: Ruler,
    title: 'Multi-ray metrology',
    body: 'Ray-cone surface picking on splat centres, or two-view forward triangulation for features that are hard to snap to.',
  },
  {
    icon: Sofa,
    title: 'Built-in virtual staging',
    body: 'Click the floor to drop furniture from Poly Pizza or the built-in library, then move, rotate and scale it with a gizmo.',
  },
  {
    icon: Mountain,
    title: 'Land-to-Home engine',
    body: 'Turn a plot photo into a terrain heightmap, place a parametric wireframe house, and get pad elevation plus cut and fill volumes.',
  },
  {
    icon: ScanLine,
    title: 'Capture quality inspector',
    body: 'Laplacian-variance blur detection, exposure checks, frame overlap and EXIF intrinsics all run in the browser before upload.',
  },
];

const research = [
  { tag: 'Kerbl et al. · SIGGRAPH 2023', title: '3D Gaussian Splatting', body: 'Explicit anisotropic Gaussians (position, covariance, opacity, SH colour) rendered by sorted alpha blending.' },
  { tag: 'Scaffold-GS · CityGaussian', title: 'Compact memory & pruning', body: 'Opacity-threshold pruning, half-precision covariances and dynamic resolution scaling keep VRAM low on mobile.' },
  { tag: 'Metrology', title: 'Ray-space intersection', body: 'Closed-form two-ray triangulation and least-squares N-ray intersection, so no dense mesh is needed.' },
  { tag: 'VR-GS · SIGGRAPH 2024', title: 'Interactive staging', body: 'glTF assets anchored by raycast to the estimated splat floor plane, composited in the same depth space.' },
];

const steps = [
  { icon: Camera, title: 'Capture', body: 'Shoot 40 to 200 overlapping photos or a slow walkthrough video of the interior, exterior or plot.' },
  { icon: ScanLine, title: 'Inspect', body: 'The in-browser inspector flags blur, exposure and overlap problems before anything is uploaded.' },
  { icon: Cpu, title: 'Reconstruct', body: 'The reconstruction queue runs SfM, then 3DGS training, then compression into .splat or .spz.' },
  { icon: Footprints, title: 'Explore', body: 'Walk, measure, stage and share the scene. It runs in any WebGL2 or WebGPU-capable browser.' },
];

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      {/* Backdrop */}
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-splat-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-40 h-[400px] w-[400px] rounded-full bg-aqua-500/10 blur-[100px]" />

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-36 sm:pt-44">
        <div className="mx-auto max-w-3xl text-center">
          <div className="glass mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-aqua-300" /> Gaussian Splatting · in the browser · open access
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">
            From property photos to a <span className="text-gradient">walkable 3D twin</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
            PlanToSplat turns multi-view photos and video of interiors, exteriors and land into interactive 3D Gaussian Splat scenes.
            You can walk through them, measure them, stage furniture in them and design homes on them, all client-side.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/studio"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-splat-500 to-aqua-500 px-6 font-medium text-white shadow-lg shadow-splat-500/30 transition hover:brightness-110"
            >
              Open the Studio <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/studio/demo" className="glass inline-flex h-12 items-center gap-2 rounded-xl px-6 font-medium text-white transition hover:bg-white/10">
              <Footprints className="h-4 w-4" /> Walk the demo loft
            </Link>
          </div>
        </div>

        {/* Hero visual: stylised splat field */}
        <div className="glass relative mx-auto mt-16 aspect-[16/8] max-w-5xl overflow-hidden rounded-3xl">
          <SplatField />
          <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-xl bg-ink-900/70 px-3 py-2 font-mono text-[11px] text-slate-300 backdrop-blur">
            <Layers className="h-3.5 w-3.5 text-splat-300" /> 412.6K splats · 60 fps · WebGL2
          </div>
          <div className="absolute bottom-4 right-4 hidden items-center gap-2 rounded-xl bg-ink-900/70 px-3 py-2 font-mono text-[11px] text-aqua-300 backdrop-blur sm:flex">
            <Ruler className="h-3.5 w-3.5" /> 4.27 m · 14&apos; 0&quot;
          </div>
          <div className="absolute left-4 top-4 hidden rounded-xl bg-ink-900/70 p-1.5 backdrop-blur sm:block">
            <MapIcon className="h-16 w-16 text-slate-600" strokeWidth={0.8} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold text-white sm:text-3xl">Built for how people actually tour property</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-400">
          Compared with panorama-node tours and generic capture apps, PlanToSplat is focused on real-estate workflows.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="glass group rounded-2xl p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.06]">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-splat-500/25 to-aqua-500/25 ring-1 ring-white/10">
                <f.icon className="h-5 w-5 text-aqua-300" />
              </div>
              <h3 className="mt-4 font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold text-white sm:text-3xl">How it works</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="font-mono text-xs text-slate-500">0{i + 1}</div>
              <s.icon className="mt-3 h-6 w-6 text-splat-300" />
              <h3 className="mt-3 font-semibold text-white">{s.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Research */}
      <section className="relative mx-auto max-w-6xl px-4 py-16">
        <div className="glass rounded-3xl p-6 sm:p-10">
          <h2 className="text-2xl font-semibold text-white">Research foundation</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">The renderer and tools implement ideas from recent spatial-computing literature.</p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {research.map((r) => (
              <div key={r.title} className="border-l-2 border-splat-500/50 pl-4">
                <div className="font-mono text-[11px] uppercase tracking-wider text-aqua-300/80">{r.tag}</div>
                <h3 className="mt-1 font-semibold text-white">{r.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-6xl px-4 pb-24 pt-8 text-center">
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Ready to splat your first property?</h2>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/studio" className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-splat-500 to-aqua-500 px-5 font-medium text-white">
            Start a project <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-10 text-xs text-slate-600">PlanToSplat AI · open access · built with Next.js, Three.js and Gaussian Splatting</p>
      </section>
    </main>
  );
}

/** Deterministic decorative "splat" field (pure SVG, no JS on the client). */
function SplatField() {
  const blobs: { x: number; y: number; rx: number; ry: number; rot: number; c: string; o: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const palette = ['#6366f1', '#22d3ee', '#a5b4fc', '#0ea5e9', '#c084fc', '#f472b6', '#e2e8f0'];
  // Room-like perspective: floor + two walls
  for (let i = 0; i < 520; i++) {
    const zone = rnd();
    let x: number, y: number;
    if (zone < 0.45) {
      x = rnd() * 1000;
      y = 300 + rnd() * 200; // floor
    } else if (zone < 0.75) {
      x = rnd() * 380;
      y = 40 + rnd() * 300 + (x / 380) * 20; // left wall
    } else {
      x = 620 + rnd() * 380;
      y = 40 + rnd() * 300; // right wall
    }
    blobs.push({ x, y, rx: 4 + rnd() * 26, ry: 2 + rnd() * 10, rot: rnd() * 180, c: palette[Math.floor(rnd() * palette.length)], o: 0.08 + rnd() * 0.35 });
  }
  return (
    <svg viewBox="0 0 1000 500" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <filter id="soft">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0b1120" stopOpacity="0.2" />
          <stop offset="1" stopColor="#0b1120" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect width="1000" height="500" fill="#0b1120" />
      <g filter="url(#soft)">
        {blobs.map((b, i) => (
          <ellipse key={i} cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} fill={b.c} opacity={b.o} transform={`rotate(${b.rot} ${b.x} ${b.y})`} />
        ))}
      </g>
      <rect x="400" y="80" width="200" height="190" rx="4" fill="#e0f2fe" opacity="0.18" />
      <g stroke="#22d3ee" strokeWidth="2" fill="none">
        <line x1="240" y1="420" x2="760" y2="380" strokeDasharray="6 5" />
        <circle cx="240" cy="420" r="6" fill="#22d3ee" />
        <circle cx="760" cy="380" r="6" fill="#22d3ee" />
      </g>
      <rect width="1000" height="500" fill="url(#fade)" />
    </svg>
  );
}
