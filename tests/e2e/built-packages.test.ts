/**
 * Tests the built output in packages/*\/dist exactly as a consumer would load
 * it. Requires `npm run build:packages`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bin = path.join(root, 'packages/cli/dist/bin.js');
const require = createRequire(import.meta.url);

beforeAll(() => {
  for (const f of ['packages/core/dist/index.js', 'packages/core/dist/index.cjs', 'packages/node/dist/index.js', bin]) {
    if (!existsSync(path.isAbsolute(f) ? f : path.join(root, f))) {
      throw new Error(`${f} is missing. Run "npm run build:packages" before the e2e tests.`);
    }
  }
});

describe('module formats', () => {
  it('core works through ESM import and CommonJS require', async () => {
    const esm = await import('@workfonic/mockclock');
    const cjs = require('@workfonic/mockclock') as typeof esm;
    for (const m of [esm, cjs]) {
      const c = new m.MockClock({ now: '2026-11-30T23:59:00Z', frozen: true });
      c.advance({ days: 2, hours: 3, minutes: 30 });
      expect(c.toISOString()).toBe('2026-12-03T03:29:00.000Z');
      expect(() => c.set('2026-11-30')).toThrow(m.AmbiguousDateInputError);
    }
    expect(Object.keys(esm).sort()).toEqual(Object.keys(cjs).sort());
  });

  it('node adapter works through ESM and CommonJS', async () => {
    const esm = await import('@workfonic/mockclock-node');
    const cjs = require('@workfonic/mockclock-node') as typeof esm;
    const { MockClock } = await import('@workfonic/mockclock');
    const clock = new MockClock({ now: '2030-01-01T00:00:00Z', frozen: true });
    expect(esm.withGlobalDate(clock, () => Date.now())).toBe(Date.parse('2030-01-01T00:00:00Z'));
    expect(cjs.isGlobalDateInstalled()).toBe(false);
  });

  it('ships type declarations for both formats', () => {
    for (const f of ['packages/core/dist/index.d.ts', 'packages/core/dist/index.d.cts', 'packages/node/dist/index.d.ts', 'packages/cli/dist/index.d.ts']) {
      expect(existsSync(path.join(root, f))).toBe(true);
    }
    const dts = readFileSync(path.join(root, 'packages/core/dist/index.d.ts'), 'utf8');
    expect(dts).toContain('declare class MockClock');
  });

  it('core bundle has no Node-only imports and no dynamic code evaluation', () => {
    const js = readFileSync(path.join(root, 'packages/core/dist/index.js'), 'utf8');
    expect(js).not.toMatch(/from ['"]node:/);
    expect(js).not.toMatch(/\beval\(|new Function\(/);
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|https?:\/\/(?!github\.com)/);
  });
});

describe('mockclock binary', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'mockclock-e2e-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = (...args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, MOCKCLOCK_SESSION: '' } });

  it('runs the documented commands', () => {
    expect(run('now').status).toBe(0);
    expect(run('freeze', '2026-11-30T23:59:00Z').status).toBe(0);
    expect(JSON.parse(run('advance', '--days', '2', '--hours', '4', '--from', '2026-11-30T23:59:00Z', '--json').stdout).now).toBe('2026-12-03T03:59:00.000Z');
    expect(run('rewind', '--days', '1').status).toBe(0);
    expect(run('travel', '2027-01-01T00:00:00Z').status).toBe(0);
    expect(run('reset').status).toBe(0);
    expect(run('scenarios').stdout).toContain('billing-retry');
    expect(run('scenario', 'month-end').stdout).toContain('2026-11-30T23:59:00+00:00');
    expect(run('timezone', 'Asia/Kolkata').stdout).toContain('+05:30');
  });

  it('persists only with a session file', () => {
    const s = path.join(dir, 'session.json');
    run('freeze', '2026-11-30T23:59:00Z', '--session', s);
    run('advance', '--days', '2', '--session', s);
    expect(JSON.parse(run('now', '--session', s, '--json').stdout).now).toBe('2026-12-02T23:59:00.000Z');
    expect(JSON.parse(run('now', '--json').stdout).mode).toBe('real');
  });

  it('uses exit code 2 for invalid input and writes errors to stderr', () => {
    const r = run('freeze', '2026-02-30T00:00:00Z');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/28 days/);
    expect(r.stdout).toBe('');
  });

  it('is executable with a shebang', () => {
    expect(readFileSync(bin, 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
    expect(execFileSync(process.execPath, [bin, '--version'], { encoding: 'utf8' }).trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('repository checks', () => {
  it('every example runs and passes its own assertions', () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts/run-examples.mjs')], { encoding: 'utf8' });
    expect(r.stdout).toMatch(/(\d+)\/\1 examples passed/);
    expect(r.status).toBe(0);
  }, 120_000);

  it('docs/scenarios.md matches the registry', () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts/generate-scenario-docs.mjs'), '--check'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('npm packaging is valid (dry run)', () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts/verify-pack.mjs')], { encoding: 'utf8' });
    expect(r.stderr).not.toMatch(/✗|packaging problem/);
    expect(r.stdout).toContain('All packages verified');
    expect(r.status).toBe(0);
  }, 120_000);

  it('runs on the minimum runtime API surface (smoke test)', () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts/smoke-test.mjs')], { encoding: 'utf8' });
    expect(r.stdout).toContain('Smoke test passed');
  });
});
