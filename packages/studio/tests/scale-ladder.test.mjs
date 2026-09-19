import {
  DEFAULT_SCALE_SIZES,
  scaleRects,
  frameMetrics,
  formatMetric,
} from '../src/core/scale-ladder.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// --- the ladder itself ---
ok('the ladder descends', DEFAULT_SCALE_SIZES.every((s, i, a) => i === 0 || s < a[i - 1]));
ok('the ladder reaches inline scale', DEFAULT_SCALE_SIZES.includes(20));
ok('the ladder includes avatar scale', DEFAULT_SCALE_SIZES.includes(64));

// --- layout: 5 slots across 2000x600 ---
// 2000 wide so a 400px slot holds the 256px rung uncropped; at 1000 the first
// rung clamps to its slot and this fixture would be testing the clamp instead.
const rects = scaleRects([256, 128, 64, 32, 20], 2000, 600);
ok('one rect per size', rects.length === 5);
ok('every cell is square', rects.every((r) => r.w === r.h));
ok('each cell renders at its requested edge', rects.map((r) => r.w).join(',') === '256,128,64,32,20');
ok('slot centres are evenly spaced',
  rects.map((r) => Math.round(r.x + r.w / 2)).join(',') === '200,600,1000,1400,1800');
ok('cells are vertically centred', rects.every((r) => r.y === Math.round((600 - r.w) / 2)));
ok('no cell overlaps its neighbour',
  rects.every((r, i) => i === 0 || r.x >= rects[i - 1].x + rects[i - 1].w));

// A cell must never spill into the next slot on a narrow window, or the ladder
// silently lies about which orb you are looking at.
const tight = scaleRects([256, 128, 64, 32, 20], 400, 300);
ok('a large cell is clamped to its slot', tight[0].w <= Math.floor(400 / 5));
ok('clamping keeps cells square', tight.every((r) => r.w === r.h));
// The clamp exists to stop this, so assert it on the fixture that exercises the
// clamp — not only on the wide one, where nothing is clamped in the first place.
ok('a clamped ladder still does not overlap',
  tight.every((r, i) => i === 0 || r.x >= tight[i - 1].x + tight[i - 1].w));
ok('a short window clamps by height', scaleRects([256], 1000, 90)[0].w <= 90);
ok('degenerate sizes still produce a drawable rect', scaleRects([0], 100, 100)[0].w >= 1);
ok('an empty ladder produces no rects', scaleRects([], 100, 100).length === 0);

// --- metrics ---
const black = new Uint8Array(4 * 100).fill(0);
for (let i = 3; i < black.length; i += 4) black[i] = 255;
const white = new Uint8Array(4 * 100).fill(255);

const blackM = frameMetrics(black);
ok('an empty frame has no coverage', blackM.coverage === 0);
ok('an empty frame has no contrast', blackM.rms === 0);

const whiteM = frameMetrics(white);
ok('a full frame is fully covered', whiteM.coverage === 1);
ok('a flat frame has no contrast', Math.abs(whiteM.rms) < 1e-9, String(whiteM.rms));
ok('a flat white frame reads as mean 1', Math.abs(whiteM.mean - 1) < 1e-9);

// Half lit, half dark: the structure case. Coverage 0.5, and RMS at its maximum
// for a two-level image.
const half = new Uint8Array(4 * 100);
for (let i = 0; i < 100; i++) {
  const v = i < 50 ? 255 : 0;
  half[i * 4] = v; half[i * 4 + 1] = v; half[i * 4 + 2] = v; half[i * 4 + 3] = 255;
}
const halfM = frameMetrics(half);
ok('half-lit reads as half covered', Math.abs(halfM.coverage - 0.5) < 1e-9);
ok('half-lit has maximum contrast', Math.abs(halfM.rms - 0.5) < 1e-9, String(halfM.rms));

// The threshold is what separates "dim but present" from "gone".
const dim = new Uint8Array(4 * 100);
for (let i = 0; i < 100; i++) {
  dim[i * 4] = 8; dim[i * 4 + 1] = 8; dim[i * 4 + 2] = 8; dim[i * 4 + 3] = 255;
}
ok('below-threshold ink does not count as coverage', frameMetrics(dim).coverage === 0);
ok('a lower threshold does count it', frameMetrics(dim, { threshold: 0.01 }).coverage === 1);

// Luma is weighted, not averaged: a pure-green frame is far brighter than pure blue.
const green = new Uint8Array(4 * 4);
const blue = new Uint8Array(4 * 4);
for (let i = 0; i < 4; i++) {
  green[i * 4 + 1] = 255; green[i * 4 + 3] = 255;
  blue[i * 4 + 2] = 255; blue[i * 4 + 3] = 255;
}
ok('luma is perceptually weighted', frameMetrics(green).mean > frameMetrics(blue).mean * 5);

ok('an empty buffer is safe', frameMetrics(new Uint8Array(0)).coverage === 0);

// --- display formatting ---
ok('metrics format to two decimals', formatMetric(0.12345) === '0.12');
ok('zero formats without an exponent', formatMetric(0) === '0.00');
ok('a non-finite metric degrades to a dash', formatMetric(NaN) === '–');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
