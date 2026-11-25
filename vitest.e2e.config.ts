import { defineConfig } from 'vitest/config';

// End-to-end tests run against the built packages (dist/), the real CLI binary
// and the examples. Run `npm run build` first.
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
