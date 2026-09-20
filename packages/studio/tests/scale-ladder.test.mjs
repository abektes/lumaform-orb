import {
  DEFAULT_SCALE_SIZES,
  scaleRects,
  frameMetrics,
  formatMetric,
  downscaleLuma,
  inkRetention,
  structuralDivergence,
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

// --- downscaleLuma ---
// 2x2 downscaled to 1x1 returns mean of four pixels
const p2x2 = new Uint8Array([
  255, 255, 255, 255,   0,   0,   0, 255,
    0,   0,   0, 255,   0,   0,   0, 255,
]);
const down2to1 = downscaleLuma(p2x2, 2, 1);
ok('2x2 down to 1x1 has length 1', down2to1.length === 1);
ok('2x2 down to 1x1 averages four pixels', Math.abs(down2to1[0] - 0.25) < 1e-9);

// 4x4 downscaled to 2x2 box-averages each quadrant
// Quadrant 0 (top-left, x in 0..1, y in 0..1): all white (luma 1.0)
// Quadrant 1 (top-right, x in 2..3, y in 0..1): all black (luma 0.0)
// Quadrant 2 (bottom-left, x in 0..1, y in 2..3): 2 white, 2 black (luma 0.5)
// Quadrant 3 (bottom-right, x in 2..3, y in 2..3): all grey (128, 128, 128)
const p4x4 = new Uint8Array(4 * 4 * 4).fill(0);
for (let y = 0; y < 4; y++) {
  for (let x = 0; x < 4; x++) {
    const idx = (y * 4 + x) * 4;
    p4x4[idx + 3] = 255;
    if (x < 2 && y < 2) {
      // Quad 0: all white
      p4x4[idx] = 255; p4x4[idx + 1] = 255; p4x4[idx + 2] = 255;
    } else if (x >= 2 && y < 2) {
      // Quad 1: all black
      p4x4[idx] = 0; p4x4[idx + 1] = 0; p4x4[idx + 2] = 0;
    } else if (x < 2 && y >= 2) {
      // Quad 2: x=0 white, x=1 black
      const v = x === 0 ? 255 : 0;
      p4x4[idx] = v; p4x4[idx + 1] = v; p4x4[idx + 2] = v;
    } else {
      // Quad 3: all grey 128
      p4x4[idx] = 128; p4x4[idx + 1] = 128; p4x4[idx + 2] = 128;
    }
  }
}
const down4to2 = downscaleLuma(p4x4, 4, 2);
ok('4x4 down to 2x2 has length 4', down4to2.length === 4);
ok('quadrant 0 is 1.0', Math.abs(down4to2[0] - 1.0) < 1e-9);
ok('quadrant 1 is 0.0', Math.abs(down4to2[1] - 0.0) < 1e-9);
ok('quadrant 2 is 0.5', Math.abs(down4to2[2] - 0.5) < 1e-9);
ok('quadrant 3 is 128/255', Math.abs(down4to2[3] - 128 / 255) < 1e-9);

// Non-integer ratio: 3x3 downscaled to 2x2
// Case A: only pixel (0,0) is white.
// Target (0,0) footprint is [0, 1.5] x [0, 1.5], area 2.25.
// Overlap with pixel (0,0) is 1.0 x 1.0 = 1.0. Expected target (0,0) = 1.0 / 2.25 = 4/9.
const p3x3A = new Uint8Array(3 * 3 * 4).fill(0);
for (let i = 3; i < p3x3A.length; i += 4) p3x3A[i] = 255;
p3x3A[0] = 255; p3x3A[1] = 255; p3x3A[2] = 255;
const down3to2A = downscaleLuma(p3x3A, 3, 2);
ok('3x3 to 2x2 non-integer overlap (0,0) matches 4/9 exactly', Math.abs(down3to2A[0] - 4 / 9) < 1e-9);
ok('3x3 to 2x2 non-integer other pixels are 0', down3to2A[1] === 0 && down3to2A[2] === 0 && down3to2A[3] === 0);

// Case B: only center pixel (1,1) is white.
// Target pixels all overlap (1,1) by 0.5 x 0.5 = 0.25. Expected = 0.25 / 2.25 = 1/9 for all 4.
const p3x3B = new Uint8Array(3 * 3 * 4).fill(0);
for (let i = 3; i < p3x3B.length; i += 4) p3x3B[i] = 255;
const centerIdx = (1 * 3 + 1) * 4;
p3x3B[centerIdx] = 255; p3x3B[centerIdx + 1] = 255; p3x3B[centerIdx + 2] = 255;
const down3to2B = downscaleLuma(p3x3B, 3, 2);
ok('3x3 to 2x2 center pixel distributes 1/9 to all 4 target cells',
  Array.from(down3to2B).every((v) => Math.abs(v - 1 / 9) < 1e-9));

// Identity downscaling (targetSize === size)
const id3 = downscaleLuma(p3x3B, 3, 3);
ok('identity downscale preserves size', id3.length === 9);
ok('identity downscale preserves exact pixel values',
  Math.abs(id3[4] - 1.0) < 1e-9 && id3[0] === 0 && id3[8] === 0);

// Unsupported: targetSize > size returns empty array
ok('upscaling (targetSize > size) is unsupported and returns empty', downscaleLuma(p2x2, 2, 4).length === 0);

// Empty or degenerate buffers return empty without throwing
ok('empty buffer returns empty', downscaleLuma(new Uint8Array(0), 0, 0).length === 0);
ok('zero targetSize returns empty', downscaleLuma(p2x2, 2, 0).length === 0);
ok('null pixels returns empty', downscaleLuma(null, 2, 1).length === 0);
ok('negative targetSize returns empty', downscaleLuma(p2x2, 2, -1).length === 0);

// --- inkRetention ---
const fullLit = new Uint8Array(4 * 16).fill(255);
const halfLit = new Uint8Array(4 * 16);
for (let i = 0; i < 16; i++) {
  const v = i < 8 ? 255 : 0;
  halfLit[i * 4] = v; halfLit[i * 4 + 1] = v; halfLit[i * 4 + 2] = v; halfLit[i * 4 + 3] = 255;
}
const allDark = new Uint8Array(4 * 16);
for (let i = 3; i < allDark.length; i += 4) allDark[i] = 255;

ok('identical buffers give retention 1.0', Math.abs(inkRetention(fullLit, fullLit) - 1.0) < 1e-9);
ok('half mean luma gives retention 0.5', Math.abs(inkRetention(halfLit, fullLit) - 0.5) < 1e-9);
ok('blank reference gives NaN', Number.isNaN(inkRetention(fullLit, allDark)));
ok('blank rung against lit reference gives 0', inkRetention(allDark, fullLit) === 0);
ok('empty rung buffer gives NaN', Number.isNaN(inkRetention(new Uint8Array(0), fullLit)));
ok('empty ref buffer gives NaN', Number.isNaN(inkRetention(fullLit, new Uint8Array(0))));

// --- structuralDivergence ---
// 1. Equal-size identical buffers give 0
ok('identical equal-size buffers have 0 divergence',
  Math.abs(structuralDivergence(fullLit, 4, fullLit, 4)) < 1e-9);

// 2. A rung that is exactly the box-downscale of the reference gives 0
// Reference: 4x4 image with varying pixel intensities
const ref4x4 = new Uint8Array(4 * 4 * 4);
for (let y = 0; y < 4; y++) {
  for (let x = 0; x < 4; x++) {
    const idx = (y * 4 + x) * 4;
    const v = (x + y * 4) * 16;
    ref4x4[idx] = v; ref4x4[idx + 1] = v; ref4x4[idx + 2] = v; ref4x4[idx + 3] = 255;
  }
}
const ideal2x2Luma = downscaleLuma(ref4x4, 4, 2);
const idealRung2x2 = new Uint8Array(2 * 2 * 4);
for (let i = 0; i < 4; i++) {
  const byte = Math.round(ideal2x2Luma[i] * 255);
  idealRung2x2[i * 4] = byte;
  idealRung2x2[i * 4 + 1] = byte;
  idealRung2x2[i * 4 + 2] = byte;
  idealRung2x2[i * 4 + 3] = 255;
}
// Note: rounding to uint8 introduces small quantization (< 1/255 ≈ 0.004)
ok('ideal downscale rung has ~0 divergence',
  structuralDivergence(ref4x4, 4, idealRung2x2, 2) < 0.005);

// 3. A uniformly grey rung against a structured reference gives clearly non-zero divergence
const greyRung2x2 = new Uint8Array(2 * 2 * 4);
for (let i = 0; i < 4; i++) {
  greyRung2x2[i * 4] = 128;
  greyRung2x2[i * 4 + 1] = 128;
  greyRung2x2[i * 4 + 2] = 128;
  greyRung2x2[i * 4 + 3] = 255;
}
const greyDiv = structuralDivergence(ref4x4, 4, greyRung2x2, 2);
ok('flat grey rung against structured ref has clearly non-zero divergence', greyDiv > 0.1);

// 4. A rung larger than the reference gives NaN
ok('rung larger than reference gives NaN',
  Number.isNaN(structuralDivergence(idealRung2x2, 2, ref4x4, 4)));

// 5. Empty buffers give NaN
ok('empty reference gives NaN',
  Number.isNaN(structuralDivergence(new Uint8Array(0), 0, idealRung2x2, 2)));
ok('empty rung gives NaN',
  Number.isNaN(structuralDivergence(ref4x4, 4, new Uint8Array(0), 0)));

// 6. Normalised bounds: stays within 0..1 for opposite extremes
const whiteRef = new Uint8Array(4 * 4 * 4).fill(255);
const blackRung = new Uint8Array(2 * 2 * 4);
for (let i = 3; i < blackRung.length; i += 4) blackRung[i] = 255;
const extremeDiv = structuralDivergence(whiteRef, 4, blackRung, 2);
ok('extreme opposite gives divergence in 0..1',
  extremeDiv >= 0 && extremeDiv <= 1 && Math.abs(extremeDiv - 1.0) < 1e-9);

// 7. Non-square buffer handling: 24x25 reference downscaled to 12x13
const ref24x25 = new Uint8Array(24 * 25 * 4);
for (let y = 0; y < 25; y++) {
  for (let x = 0; x < 24; x++) {
    const idx = (y * 24 + x) * 4;
    const v = (x * 10 + y * 8) % 256;
    ref24x25[idx] = v; ref24x25[idx + 1] = v; ref24x25[idx + 2] = v; ref24x25[idx + 3] = 255;
  }
}
ok('non-square identical buffers have 0 divergence',
  Math.abs(structuralDivergence(ref24x25, { w: 24, h: 25 }, ref24x25, { w: 24, h: 25 })) < 1e-9);

const ideal12x13Luma = downscaleLuma(ref24x25, { w: 24, h: 25 }, { w: 12, h: 13 });
const idealRung12x13 = new Uint8Array(12 * 13 * 4);
for (let i = 0; i < 12 * 13; i++) {
  const byte = Math.round(ideal12x13Luma[i] * 255);
  idealRung12x13[i * 4] = byte;
  idealRung12x13[i * 4 + 1] = byte;
  idealRung12x13[i * 4 + 2] = byte;
  idealRung12x13[i * 4 + 3] = 255;
}
ok('non-square ideal downscale has ~0 divergence',
  structuralDivergence(ref24x25, { w: 24, h: 25 }, idealRung12x13, { w: 12, h: 13 }) < 0.005);
ok('non-square rung larger than ref returns NaN',
  Number.isNaN(structuralDivergence(idealRung12x13, { w: 12, h: 13 }, ref24x25, { w: 24, h: 25 })));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
