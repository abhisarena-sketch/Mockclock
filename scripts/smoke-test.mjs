// Plain-JavaScript smoke test of the built packages, with no dev dependencies,
// so it can run on the oldest supported runtime (Node.js 20).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const esm = await import('@workfonic/mockclock');
const cjs = require('@workfonic/mockclock');
for (const m of [esm, cjs]) {
  const clock = new m.MockClock({ now: '2026-01-31T09:00:00Z', frozen: true, timeZone: 'America/New_York' });
  clock.advance({ months: 1 });
  assert.equal(clock.toISOString(), '2026-02-28T09:00:00.000Z');
  assert.equal(m.toZonedDateTime('2026-11-30T23:59:00Z', 'Asia/Kolkata').iso, '2026-12-01T05:29:00+05:30');
  assert.equal(m.transitionsInYear('America/New_York', 2026).length, 2);
  assert.equal(m.listScenarios().length, 15);
}

const node = await import('@workfonic/mockclock-node');
const nodeCjs = require('@workfonic/mockclock-node');
const clock = new esm.MockClock({ now: '2030-01-01T00:00:00Z', frozen: true });
assert.equal(node.withGlobalDate(clock, () => new Date().toISOString()), '2030-01-01T00:00:00.000Z');
assert.ok(new Date().getUTCFullYear() < 2030);
assert.equal(typeof nodeCjs.runWithClock, 'function');

const out = execFileSync(process.execPath, [path.join(root, 'packages/cli/dist/bin.js'), 'timezone', 'Asia/Kolkata', '--at', '2026-01-01T00:00:00Z', '--json'], { encoding: 'utf8' });
assert.equal(JSON.parse(out).local, '2026-01-01T05:30:00+05:30');

console.log(`Smoke test passed on Node.js ${process.version}`);
