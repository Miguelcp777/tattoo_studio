import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { securityHeaders } from './security-headers.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Pin the workspace root. Next otherwise infers it by searching upward for lockfiles and
  // can settle on an unrelated one outside the repository, which silently breaks the file
  // tracing used for deployment output.
  outputFileTracingRoot: resolve(here, '../..'),

  // Lint and typecheck run as their own checks (`pnpm lint`, `pnpm typecheck`) and in CI as
  // separate jobs. Re-running them inside the build would duplicate work and report one
  // failure as two, which is exactly what PLAT-INV-004 asks us not to do.
  eslint: { ignoreDuringBuilds: true },

  // TASK-0074 (audit SEG-01): browser defences on every page, API answer and error.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') }];
  },
};

export default nextConfig;
