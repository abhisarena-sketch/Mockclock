import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Unit tests run against TypeScript sources, so `npm test` needs no build.
// Built-package tests live in tests/e2e and run with `npm run test:e2e`.
export default defineConfig({
  resolve: {
    alias: {
      '@workfonic/mockclock-node': src('./packages/node/src/index.ts'),
      '@workfonic/mockclock': src('./packages/core/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
    // Global Date patching is process-wide; keep files isolated.
    isolate: true,
    env: { TZ: 'UTC' },
  },
});
