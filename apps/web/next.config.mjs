import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
};

export default nextConfig;
