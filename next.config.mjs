/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict-mode double-mounting disposes and immediately re-creates the splat viewer, which the
  // splat library does not survive (blank canvas in dev). Production is unaffected either way.
  reactStrictMode: false,
  // The splat library ships pre-bundled ESM with inline Web Workers + WASM sorting.
  transpilePackages: ['@mkkellogg/gaussian-splats-3d'],
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, topLevelAwait: true };
    return config;
  },
  async headers() {
    return [
      {
        // Large static splat assets: let browsers cache them aggressively.
        source: '/models/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }],
      },
    ];
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'static.poly.pizza' }],
  },
};

export default nextConfig;
