// OrbStudio is the clock: scene, engine swap, modulation, the frame.
// Clip / A/B / grid / sweep used to live in the same class and in main.js
// because the UI could not host long-lived chrome. That is no longer true.
// This file locks the new ownership: exploration sessions are modules with
// mount/bind/dispose, and the clock file does not construct them.

import { readFileSync } from 'node:fs';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const root = new URL('../', import.meta.url);
const studio = readFileSync(new URL('src/core/studio.js', root), 'utf8');
const main = readFileSync(new URL('src/main.js', root), 'utf8');

ok('the clock does not construct the variation grid', !/createVariationGrid\(/.test(studio));
ok('the clock does not construct the clip recorder', !/createClipRecorder\(/.test(studio));
ok('the clock imports the grid session methods', /from '\.\/studio-grid\.js'/.test(studio));
ok('the clock imports capture methods', /from '\.\/studio-capture\.js'/.test(studio));
ok('the clock imports sequence methods', /from '\.\/studio-sequence\.js'/.test(studio));

ok('main.js does not implement toggleGrid', !/\bfunction toggleGrid\b/.test(main));
ok('main.js does not implement toggleClip', !/\bfunction toggleClip\b/.test(main));
ok('main.js does not implement toggleSweep', !/\bfunction toggleSweep\b/.test(main));
ok('main.js constructs the clip session', /createClipSession\(/.test(main));
ok('main.js constructs the A/B session', /createAbSession\(/.test(main));
ok('main.js constructs the grid session', /createGridSession\(/.test(main));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
