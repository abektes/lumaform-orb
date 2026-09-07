import {
  snapshotState,
  normalizeSnapshot,
  applySnapshot,
  createAbCompare,
} from '../src/core/ab-compare.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

function makeState() {
  return {
    engine: 'quantum',
    activePresetName: 'Cyber Matrix',
    global: { bloomStrength: 0.65, timeScale: 1, exposure: 1.05 },
    modulation: { enabled: true, sources: { lfo1: { type: 'lfo', rate: 0.5 } }, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.4 }] },
    engines: {
      quantum: { edgeGlow: 1.2, cubeSize: 1.25 },
      tesseract: { edgeGlow: 0.8 },
    },
  };
}

// --- snapshotState ---
const s1 = makeState();
const snap = snapshotState(s1);
ok('captures the engine id', snap.engine === 'quantum');
ok('captures only the active engine params', JSON.stringify(snap.params) === JSON.stringify({ edgeGlow: 1.2, cubeSize: 1.25 }));
ok('captures global', snap.global.bloomStrength === 0.65);
ok('captures modulation', snap.modulation.routes.length === 1);

s1.engines.quantum.edgeGlow = 99;
s1.global.bloomStrength = 99;
s1.modulation.routes.push({ source: 'lfo1', dest: '_timeScale', amount: 1 });
ok('snapshot is detached from params', snap.params.edgeGlow === 1.2);
ok('snapshot is detached from global', snap.global.bloomStrength === 0.65);
ok('snapshot is detached from modulation', snap.modulation.routes.length === 1);

// --- applySnapshot ---
const s2 = makeState();
const globalRef = s2.global;
const enginesRef = s2.engines;
const paramsRef = s2.engines.quantum;
s2.engines.quantum.edgeGlow = 42;

const changed = applySnapshot(s2, snap);
ok('restores param values', s2.engines.quantum.edgeGlow === 1.2);
ok('reports no engine change for same engine', changed === false);
ok('keeps the global object identity', s2.global === globalRef);
ok('keeps the engines map identity', s2.engines === enginesRef);
ok('keeps the active params object identity', s2.engines.quantum === paramsRef);

// applying a snapshot from a different engine
const s3 = makeState();
s3.engine = 'quantum';
const tesseractSnap = { engine: 'tesseract', global: { bloomStrength: 0.2 }, modulation: { enabled: false, sources: {}, routes: [] }, params: { edgeGlow: 0.3 } };
const changed2 = applySnapshot(s3, tesseractSnap);
ok('reports an engine change', changed2 === true);
ok('switches the active engine', s3.engine === 'tesseract');
ok('writes into the target engine bag', s3.engines.tesseract.edgeGlow === 0.3);

const legacyModulation = s3.modulation;
applySnapshot(s3, {
  engine: 'tesseract',
  global: {},
  modulation: null,
  params: { edgeGlow: 0.4 },
});
ok('a legacy snapshot keeps the current modulation',
  s3.modulation === legacyModulation);
ok('leaves the other engine bag alone', s3.engines.quantum.edgeGlow === 1.2);

// mutating the state afterwards must not corrupt the snapshot
s3.engines.tesseract.edgeGlow = 7;
ok('applied snapshot stays detached', tesseractSnap.params.edgeGlow === 0.3);

// --- stash: fill a slot from a finding without disturbing the live orb ---
{
  const finding = {
    id: 'f1',
    note: 'kept',
    createdAt: 1,
    thumb: 'data:image/jpeg;base64,AA',
    engine: 'quantum',
    global: { timeScale: 0.5 },
    params: { edgeGlow: 2 },
    modulation: { enabled: true, sources: {}, routes: [] },
  };
  const state = {
    engine: 'nebula',
    global: { timeScale: 1 },
    modulation: { enabled: false, sources: {}, routes: [] },
    engines: { nebula: { edgeGlow: 0.1 }, quantum: { edgeGlow: 0.1 } },
  };
  const calls = [];
  const studio = {
    setEngine: (type) => calls.push(['setEngine', type]),
    updateParameters: () => calls.push(['updateParameters']),
    syncModulation: () => calls.push(['syncModulation']),
    updateGlobalSettings: () => calls.push(['updateGlobalSettings']),
    tweenTo: (target, options) => calls.push(['tweenTo', target, options]),
  };
  const ab = createAbCompare(studio, state, {});

  ok('stash fills the slot', ab.stash('a', finding) === true && ab.has('a'));
  ok('stash does not touch live state',
    state.engine === 'nebula' && state.engines.nebula.edgeGlow === 0.1);
  ok('stash does not call the studio', calls.length === 0, JSON.stringify(calls));
  ok('stash does not make the slot active', ab.activeSlot === null);

  ab.activate('a');
  ok('activating a stashed slot switches engine', state.engine === 'quantum');
  ok('activating writes params in place', state.engines.quantum.edgeGlow === 2);
  ok('an engine change is a cut', calls.some((call) => call[0] === 'setEngine'));
  ok('activating marks it active', ab.activeSlot === 'a');

  finding.params.edgeGlow = 99;
  state.engines.quantum.edgeGlow = 0.1;
  ab.activate('a');
  ok('the slot holds its own copy', state.engines.quantum.edgeGlow === 2);

  const cleaned = normalizeSnapshot(finding);
  ok('normalizeSnapshot drops finding metadata',
    !('id' in cleaned) && !('note' in cleaned) && !('thumb' in cleaned) && !('createdAt' in cleaned),
    Object.keys(cleaned).join(','));
  ok('normalizeSnapshot keeps the config',
    cleaned.engine === 'quantum' && cleaned.params.edgeGlow === 99 && cleaned.global.timeScale === 0.5);
  ok('normalizeSnapshot tolerates a missing modulation',
    normalizeSnapshot({ engine: 'x', global: {}, params: {} }).modulation === null);

  const summary = ab.slotSummary();
  ok('summary reports the filled slot', summary.a.filled && summary.a.engine === 'quantum');
  ok('summary reports the empty slot', summary.b === null);
  ok('summary reports the active slot', summary.active === 'a');

  const beforeSummary = JSON.stringify(summary);
  ok('stash rejects an invalid slot', ab.stash('c', finding) === false);
  ok('store rejects an invalid slot', ab.store('__proto__') === false);
  ok('invalid slots do not alter the summary', JSON.stringify(ab.slotSummary()) === beforeSummary);
  ok('stash rejects an unknown engine',
    ab.stash('b', { ...finding, engine: 'missing' }) === false && !ab.has('b'));
  ok('normalizeSnapshot rejects invalid source shapes',
    normalizeSnapshot(null) === null
      && normalizeSnapshot({ engine: 'quantum', global: [], params: {} }) === null
      && normalizeSnapshot({ engine: 'quantum', global: {}, params: [], modulation: {} }) === null
      && normalizeSnapshot({ engine: 'quantum', global: {}, params: {}, modulation: [] }) === null
      && normalizeSnapshot({ engine: 'quantum', global: new Map(), params: {} }) === null);
  const throwingSource = {};
  Object.defineProperty(throwingSource, 'engine', { get() { throw new Error('corrupt'); } });
  ok('stash contains property access failures',
    ab.stash('b', throwingSource) === false && !ab.has('b'));
}

// A stashed same-engine snapshot follows the configured tween path.
{
  const state = makeState();
  const calls = [];
  const studio = {
    syncModulation: () => calls.push(['syncModulation']),
    updateGlobalSettings: () => calls.push(['updateGlobalSettings']),
    tweenTo: (target, options) => calls.push(['tweenTo', target, options]),
  };
  const ab = createAbCompare(studio, state, {
    getTransition: () => ({ durationMs: 400, easing: 'easeOut' }),
  });
  ab.stash('a', {
    engine: 'quantum',
    global: { timeScale: 0.5 },
    params: { edgeGlow: 2.5 },
    modulation: null,
  });
  ab.activate('a');
  const tween = calls.find((call) => call[0] === 'tweenTo');
  ok('stashed same-engine snapshots use the configured tween', !!tween);
  ok('the tween receives the stashed target and transition',
    tween?.[1].edgeGlow === 2.5 && tween?.[2].durationMs === 400);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
