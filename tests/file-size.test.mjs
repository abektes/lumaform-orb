// The 1k-line cliff is a hard stop, not a preference. Files that grow past it
// hide seams that already exist (catalog groups, CSS surfaces, UI tabs).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 1000;
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
      if (name === 'archive') continue;
      walk(path, acc);
      continue;
    }
    if (!/\.(js|css)$/.test(name)) continue;
    acc.push({
      path: join('src', relative(srcRoot, path)),
      text: readFileSync(path, 'utf8'),
    });
  }
  return acc;
}

const files = walk(srcRoot);
ok('scanned the src tree', files.length > 10, `${files.length} files`);

const oversized = files
  .map((file) => ({ ...file, lines: file.text.split('\n').length }))
  .filter((file) => file.lines > LIMIT)
  .sort((a, b) => b.lines - a.lines);

for (const file of oversized) {
  ok(`${file.path} stays under ${LIMIT} lines`, false, `${file.lines} lines`);
}
if (!oversized.length) {
  ok(`no src file exceeds ${LIMIT} lines`, true);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
