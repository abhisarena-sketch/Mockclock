// Runs every example in examples/ against the built packages and fails if any
// example throws (each example asserts its own output). Run `npm run build` first.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'examples');
const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort();
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, [tsx, path.join(dir, file)], { cwd: root, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } });
  const ok = r.status === 0;
  if (!ok) failed++;
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} examples/${file}\n`);
  if (!ok) process.stdout.write(`${r.stdout}\n${r.stderr}\n`);
}
process.stdout.write(`\n${files.length - failed}/${files.length} examples passed\n`);
process.exit(failed ? 1 : 0);
