import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  splitting: false,
  treeshake: true,
  tsconfig: 'tsconfig.build.json',
  external: ['@workfonic/mockclock', '@sinonjs/fake-timers'],
});
