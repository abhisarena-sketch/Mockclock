// prepack hook: copy the repository LICENSE and CHANGELOG into the package
// being packed, so every published tarball carries them.
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['LICENSE', 'CHANGELOG.md']) {
  copyFileSync(path.join(root, file), path.join(process.cwd(), file));
}
