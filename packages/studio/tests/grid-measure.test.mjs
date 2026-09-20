import {
  isDrawableRect,
  readbackRegion,
  createMeasureQueue,
} from '../src/core/grid-measure.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// --- isDrawableRect ---
ok('positive extents pass', isDrawableRect({ x: 0, y: 0, w: 100, h: 100 }));
ok('zero width fails', !isDrawableRect({ x: 0, y: 0, w: 0, h: 100 }));
ok('zero height fails', !isDrawableRect({ x: 0, y: 0, w: 100, h: 0 }));
ok('negative width fails', !isDrawableRect({ x: 0, y: 0, w: -5, h: 100 }));
ok('negative height fails', !isDrawableRect({ x: 0, y: 0, w: 100, h: -10 }));
ok('NaN width fails', !isDrawableRect({ x: 0, y: 0, w: NaN, h: 100 }));
ok('NaN height fails', !isDrawableRect({ x: 0, y: 0, w: 100, h: NaN }));
ok('Infinity extent fails', !isDrawableRect({ x: 0, y: 0, w: Infinity, h: 100 }));
ok('missing rect fails', !isDrawableRect(null));

// --- readbackRegion ---
// At DPR 1 it is the identity
const r1 = readbackRegion({ x: 10, y: 20, w: 100, h: 50 }, 1);
ok('DPR 1 px matches', r1.px === 10);
ok('DPR 1 py matches', r1.py === 20);
ok('DPR 1 pw matches', r1.pw === 100);
ok('DPR 1 ph matches', r1.ph === 50);

// At DPR 1.2 a {x:0, y:0, w:20, h:20} yields 24x24
const r20 = readbackRegion({ x: 0, y: 0, w: 20, h: 20 }, 1.2);
ok('DPR 1.2 20x20 pw is 24', r20.pw === 24);
ok('DPR 1.2 20x20 ph is 24', r20.ph === 24);

// Fractional origin does not make region overrun: x + w in device pixels equals Math.round((rect.x + rect.w) * dpr)
const fracRect = { x: 33.3, y: 15.7, w: 120.4, h: 80.2 };
const dpr = 1.25;
const rFrac = readbackRegion(fracRect, dpr);
ok('far edge px + pw matches rounded extent', rFrac.px + rFrac.pw === Math.round((fracRect.x + fracRect.w) * dpr));
ok('far edge py + ph matches rounded extent', rFrac.py + rFrac.ph === Math.round((fracRect.y + fracRect.h) * dpr));

// Extents floor to 1 rather than 0
const tinyRect = { x: 0, y: 0, w: 0.001, h: 0.001 };
const rTiny = readbackRegion(tinyRect, 1);
ok('tiny rect width floors to 1', rTiny.pw === 1);
ok('tiny rect height floors to 1', rTiny.ph === 1);

// --- createMeasureQueue ---
// request then flush delivers collected buffers in collection order
const q1 = createMeasureQueue();
ok('queue initially not pending', !q1.isPending());
let delivered1 = null;
q1.request((bufs) => { delivered1 = bufs; });
ok('queue is pending after request', q1.isPending());
const b1 = new Uint8Array([1]);
const b2 = new Uint8Array([2]);
q1.collect(b1);
q1.collect(b2);
q1.flush();
ok('flush delivers collected buffers', delivered1 && delivered1.length === 2 && delivered1[0] === b1 && delivered1[1] === b2);
ok('queue no longer pending after flush', !q1.isPending());

// Second request before flush settles first callback with [] exactly once
const q2 = createMeasureQueue();
let delivered2A = null;
let calls2A = 0;
q2.request((bufs) => { delivered2A = bufs; calls2A++; });
let delivered2B = null;
let calls2B = 0;
q2.request((bufs) => { delivered2B = bufs; calls2B++; });
ok('first callback settled with []', Array.isArray(delivered2A) && delivered2A.length === 0);
ok('first callback called exactly once', calls2A === 1);
ok('second callback not yet called', calls2B === 0);
const b3 = new Uint8Array([3]);
q2.collect(b3);
q2.flush();
ok('second callback delivered by flush', delivered2B && delivered2B.length === 1 && delivered2B[0] === b3);
ok('first callback was not called again on flush', calls2A === 1);

// settle() delivers [] and subsequent flush() delivers nothing to already-settled callback
const q3 = createMeasureQueue();
let delivered3 = null;
let calls3 = 0;
q3.request((bufs) => { delivered3 = bufs; calls3++; });
q3.settle();
ok('settle delivers []', Array.isArray(delivered3) && delivered3.length === 0);
ok('settle called callback once', calls3 === 1);
ok('queue not pending after settle', !q3.isPending());
q3.collect(new Uint8Array([9]));
q3.flush();
ok('flush after settle does not invoke settled callback again', calls3 === 1);

// flush() with nothing pending is a no-op and must not throw
const q4 = createMeasureQueue();
let threw = false;
try {
  q4.flush();
} catch (e) {
  threw = true;
}
ok('flush with nothing pending does not throw', !threw);

// collect() while nothing is pending does not accumulate
const q5 = createMeasureQueue();
q5.collect(new Uint8Array([99]));
let delivered5 = null;
q5.request((bufs) => { delivered5 = bufs; });
q5.collect(new Uint8Array([100]));
q5.flush();
ok('collect before request does not leak into delivery', delivered5 && delivered5.length === 1 && delivered5[0][0] === 100);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
