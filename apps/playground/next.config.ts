import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Static export: the playground is a client-side app with no server, database or API calls.
const config: NextConfig = {
  output: 'export',
  // Set PLAYGROUND_BASE_PATH=/mockclock when hosting under a sub-path (for example GitHub Pages).
  basePath: process.env.PLAYGROUND_BASE_PATH || undefined,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default config;
