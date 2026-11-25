// Verifies that each publishable package packs correctly: builds are present,
// every `exports` target exists in the tarball, versions agree, and nothing
// unexpected (sources, tests, secrets) is included. Does not publish anything.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packages = ['packages/core', 'packages/node', 'packages/cli'];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let problems = 0;
const fail = (msg) => {
  problems++;
  console.error(`  ✗ ${msg}`);
};

const versions = new Map();
for (const rel of packages) {
  const dir = path.join(root, rel);
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  versions.set(pkg.name, pkg.version);
  console.log(`${pkg.name}@${pkg.version}`);
  const out = execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts=false'], { cwd: dir, encoding: 'utf8' });
  const [info] = JSON.parse(out);
  const files = new Set(info.files.map((f) => f.path));
  for (const required of ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
    if (!files.has(required)) fail(`${required} missing from tarball`);
  }
  const targets = [];
  const walk = (v) => {
    if (typeof v === 'string') targets.push(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(pkg.exports);
  walk(pkg.bin);
  for (const key of ['main', 'module', 'types']) if (pkg[key]) targets.push(pkg[key]);
  for (const t of targets) {
    const p = t.replace(/^\.\//, '');
    if (!files.has(p)) fail(`${t} is referenced by package.json but not in the tarball (did you run npm run build?)`);
  }
  for (const f of files) {
    if (/^(src|test)\//.test(f) || /\.env|\.tgz$|tsconfig|tsup\.config/.test(f)) fail(`unexpected file in tarball: ${f}`);
  }
  if (!files.has('dist/index.js.map') && !files.has('dist/bin.js.map')) fail('source maps missing');
  for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
    if (dep.startsWith('@workfonic/') && versions.has(dep) && versions.get(dep) !== range) {
      fail(`${dep} dependency is ${range} but the workspace version is ${versions.get(dep)}`);
    }
  }
  console.log(`  ${info.entryCount} files, ${(info.size / 1024).toFixed(1)} kB packed, ${(info.unpackedSize / 1024).toFixed(1)} kB unpacked`);
}

const cliVersion = readFileSync(path.join(root, 'packages/cli/src/version.ts'), 'utf8').match(/VERSION = '([^']+)'/)?.[1];
if (cliVersion !== versions.get('@workfonic/mockclock-cli')) fail(`packages/cli/src/version.ts (${cliVersion}) does not match package.json`);

if (problems) {
  console.error(`\n${problems} packaging problem(s)`);
  process.exit(1);
}
console.log('\nAll packages verified (dry run, nothing published).');
