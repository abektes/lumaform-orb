// How the studio wires itself to the catalog.
//
// Catalog integrity itself is checked in packages/orb/tests/engine-catalog.test.mjs,
// inside the package that ships it. What is left here is the part that needs
// the studio: that main.js registers from the catalog rather than a hand-kept
// list, that initial state is built from schema defaults, and that no preset
// points at an engine that no longer exists.

import { readFileSync } from 'node:fs';
import { ENGINE_CATALOG, getDefaultEngineParams } from '@lumaform/orb';
import { createInitialState } from '../src/core/state.js';
import { PRESET_LIBRARY } from '../src/presets/preset-library.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const root = new URL('../', import.meta.url);
const main = readFileSync(new URL('src/main.js', root), 'utf8');
const state = createInitialState();

// A hand-written factory list is how an engine ends up shipped but unreachable.
ok('main.js registers from the catalog, not a hand-written factory list',
  main.includes('registerAllEngines(studio)')
    && !main.includes('studio.registerEngine('));

for (const entry of ENGINE_CATALOG) {
  const { id } = entry;
  const bag = state.engines[id];
  const defs = entry.params;

  ok(`${id} initial bag is derived from schema defaults`,
    !!bag
      && Object.keys(defs).every((key) => bag[key] === defs[key].default)
      && Object.keys(bag).every((key) => key in defs)
      && JSON.stringify(getDefaultEngineParams(id)) === JSON.stringify(bag));
}

ok('every preset targets a catalogued engine',
  PRESET_LIBRARY.every((preset) => ENGINE_CATALOG.some((entry) => entry.id === preset.engine)));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
