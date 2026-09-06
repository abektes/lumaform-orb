import { snapshotState, applySnapshot } from '../src/core/ab-compare.js';

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
ok('leaves the other engine bag alone', s3.engines.quantum.edgeGlow === 1.2);

// mutating the state afterwards must not corrupt the snapshot
s3.engines.tesseract.edgeGlow = 7;
ok('applied snapshot stays detached', tesseractSnap.params.edgeGlow === 0.3);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
