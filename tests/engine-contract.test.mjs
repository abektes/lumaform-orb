// The engine contract is { update, setParams, dispose, onPulse?, onResize? }.
// Synonyms (onParamsChange, onPointerClick, resize) used to make dispatch
// order engine-dependent and made a click fire twice.

import { readdirSync, readFileSync } from 'node:fs';
import {
  notifyEngine,
  notifyParams,
  notifyPulse,
  notifyResize,
} from '../src/core/engine-notify.js';
import { createStudioStore } from '../src/core/store.js';
import { createInitialState, ENGINE_TYPES } from '../src/core/state.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const root = new URL('../', import.meta.url);
const liveEngineFiles = readdirSync(new URL('src/engines', root))
  .filter((name) => name.endsWith('-engine.js'));

for (const file of liveEngineFiles) {
  const src = readFileSync(new URL(`src/engines/${file}`, root), 'utf8');
  ok(`${file} has no onParamsChange`, !/\bonParamsChange\b/.test(src));
  ok(`${file} has no onPointerClick`, !/\bonPointerClick\b/.test(src));
  ok(`${file} has no resize alias`, !/^\s*resize\s*\(/m.test(src));
  ok(`${file} implements setParams`, /\bsetParams\s*[\(:]/.test(src));
}

const studio = readFileSync(new URL('src/core/studio.js', root), 'utf8');
const grid = readFileSync(new URL('src/core/variation-grid.js', root), 'utf8');
ok('studio dispatches params through notifyParams', /notifyParams\(/.test(studio));
ok('studio dispatches pulse through notifyPulse', /notifyPulse\(/.test(studio));
ok('studio dispatches resize through notifyResize', /notifyResize\(/.test(studio));
ok('studio no longer mentions onParamsChange', !/\bonParamsChange\b/.test(studio));
ok('studio no longer mentions onPointerClick', !/\bonPointerClick\b/.test(studio));
ok('grid dispatches through notifyParams', /notifyParams\(/.test(grid));
ok('grid no longer mentions onParamsChange', !/\bonParamsChange\b/.test(grid));

const calls = [];
const engine = {
  setParams(patch) { calls.push(['setParams', patch]); },
  onPulse() { calls.push(['onPulse']); },
  onResize(w, h) { calls.push(['onResize', w, h]); },
};
notifyParams(engine, { glow: 1 });
notifyPulse(engine);
notifyResize(engine, 800, 600);
notifyEngine(null, 'setParams', {});
ok('notifyParams / notifyPulse / notifyResize reach the engine',
  calls[0][0] === 'setParams' && calls[0][1].glow === 1
    && calls[1][0] === 'onPulse'
    && calls[2][0] === 'onResize' && calls[2][1] === 800 && calls[2][2] === 600);

const store = createStudioStore(createInitialState());
const { state } = store;
const globalRef = state.global;
const tesseractRef = state.engines[ENGINE_TYPES.TESSERACT];
const fluxRef = state.engines[ENGINE_TYPES.FLUX];

store.setEngine(ENGINE_TYPES.FLUX);
store.patchActiveEngine({ amplitude: 1.5 });
store.patchGlobal({ bloomStrength: 0.8 });
store.setActivePresetName('Procedural Creation');
ok('store writes the active engine without replacing bags',
  state.engine === ENGINE_TYPES.FLUX
    && state.engines[ENGINE_TYPES.FLUX] === fluxRef
    && fluxRef.amplitude === 1.5
    && tesseractRef === state.engines[ENGINE_TYPES.TESSERACT]);
ok('store patches global in place',
  state.global === globalRef && globalRef.bloomStrength === 0.8);
ok('store names the preset without replacing state',
  state.activePresetName === 'Procedural Creation' && store.state === state);

store.applyRandomize({
  activePresetName: 'From Randomize',
  global: { bloomRadius: 0.4 },
  engines: { [ENGINE_TYPES.FLUX]: { wavelength: 0.9 } },
});
ok('applyRandomize keeps container identity',
  store.state === state
    && state.global === globalRef
    && state.engines[ENGINE_TYPES.FLUX] === fluxRef
    && globalRef.bloomRadius === 0.4
    && fluxRef.wavelength === 0.9
    && state.activePresetName === 'From Randomize');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
