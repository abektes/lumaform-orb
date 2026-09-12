// Installing a playback record into the studio's store.
//
// These assertions used to live in packages/orb, against applyConfig(state,...),
// which wrote directly into state.engine / state.global / state.engines[type].
// That made the studio's store shape part of the library's API. The library now
// returns a record and this half installs it, so the tests follow the code.
//
// Most of what is checked here is object *identity*. The UI holds references to
// state.global and to individual engine param bags; replacing one with a fresh
// object leaves every holder of the old one writing into a bag nothing reads —
// a class of bug that produces no error and no visible failure until someone
// wonders why a slider stopped doing anything.
import { readConfig } from '@lumaform/orb';
import { applyConfigToState } from '../src/core/config-apply.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const DEFS = {
  edgeGlow: { type: 'number', min: 0, max: 3.5, default: 1.2 },
  cubeSize: { type: 'number', min: 0.5, max: 2, default: 1.25 },
  color1: { type: 'color', default: '#ffed00' },
};

function makeState() {
  return {
    engine: 'tesseract',
    activePresetName: 'x',
    global: { bloomStrength: 0.5, exposure: 1 },
    modulation: { enabled: false, sources: {}, routes: [] },
    engines: {
      tesseract: { edgeGlow: 0.9 },
      quantum: { edgeGlow: 1.2, cubeSize: 1.25, color1: '#ffed00' },
    },
  };
}

// --- a full config ---

{
  const st = makeState();
  const globalRef = st.global;
  const enginesRef = st.engines;
  const quantumRef = st.engines.quantum;

  const res = applyConfigToState(st, readConfig({
    engine: 'quantum',
    global: { bloomStrength: 0.9 },
    params: { edgeGlow: 2.5, bogus: 1 },
    modulation: { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.5 }] },
  }, DEFS));

  ok('switches engine', st.engine === 'quantum');
  ok('merges params over the existing bag', st.engines.quantum.edgeGlow === 2.5);
  ok('does NOT blank omitted keys', st.engines.quantum.cubeSize === 1.25);
  ok('restores modulation', st.modulation.routes.length === 1);
  ok('applies global', st.global.bloomStrength === 0.9);
  ok('reports dropped keys', res.dropped.includes('bogus'));
  ok('keeps global object identity', st.global === globalRef);
  ok('keeps engines map identity', st.engines === enginesRef);
  ok('keeps the target param bag identity', st.engines.quantum === quantumRef);
}

// --- a config from before modulation existed ---

{
  const st = makeState();
  st.modulation = { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 1 }] };
  applyConfigToState(st, readConfig({ engine: 'quantum', global: {}, params: { edgeGlow: 1 } }, DEFS));
  ok('a legacy config leaves the current rack untouched', st.modulation.routes.length === 1);
}

// --- an engine the store has never seen ---

{
  const st = makeState();
  applyConfigToState(st, readConfig({ engine: 'nebula', params: { edgeGlow: 2 } }, DEFS));
  ok('creates a bag for an engine not yet in the store',
    st.engine === 'nebula' && st.engines.nebula?.edgeGlow === 2);
}

// --- the installed rack must not alias the record ---

{
  const st = makeState();
  const record = readConfig({
    engine: 'quantum', params: {},
    modulation: { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.5 }] },
  }, DEFS);
  applyConfigToState(st, record);
  record.modulation.routes.push({ source: 'lfo1', dest: '_timeScale', amount: 1 });
  ok('the store keeps its own rack, not a live view of the record',
    st.modulation.routes.length === 1, `${st.modulation.routes.length} routes`);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
