// A UI module that mentions PRESET_LIBRARY must import it. The preset click
// handler lived in studio-export.js after the UI split and kept using the
// binding with no import — clicks threw ReferenceError and looked like a no-op.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, acc);
      continue;
    }
    if (!name.endsWith('.js')) continue;
    acc.push({ path: join('src', relative(srcRoot, path)), text: readFileSync(path, 'utf8') });
  }
  return acc;
}

const files = walk(srcRoot).filter((file) =>
  file.path !== 'src/presets/preset-library.js' && /\bPRESET_LIBRARY\b/.test(file.text)
);

ok('at least the UI and boot file mention PRESET_LIBRARY', files.length >= 2, `${files.length} files`);

for (const file of files) {
  ok(`${file.path} imports PRESET_LIBRARY`,
    /import\s*\{[^}]*\bPRESET_LIBRARY\b/.test(file.text));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
