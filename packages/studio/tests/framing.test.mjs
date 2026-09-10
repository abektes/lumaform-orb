import {
  DEFAULT_FRAME_FILL,
  DEFAULT_FRAME_RADIUS,
  visibleHalfHeight,
  cameraDistanceForRadius,
  frameFill,
  engineFrameRadius,
} from '../../orb/src/core/framing.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const FOV = 45;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- the geometry the survey measured ---
ok('reproduces the old visible half-height', near(+visibleHalfHeight(7.5, FOV).toFixed(2), 3.11),
  String(visibleHalfHeight(7.5, FOV)));

// --- the round trip is the whole point ---
ok('a derived distance yields the requested fill', (() => {
  for (const radius of [0.5, 1.41, 2.5, 3.32, 4.15, 9]) {
    const d = cameraDistanceForRadius(radius, FOV);
    if (!near(frameFill(radius, d, FOV), DEFAULT_FRAME_FILL, 1e-9)) return false;
  }
  return true;
})());
ok('holds for other fovs', (() => {
  for (const fov of [30, 45, 60, 75]) {
    const d = cameraDistanceForRadius(3, fov);
    if (!near(frameFill(3, d, fov), DEFAULT_FRAME_FILL, 1e-9)) return false;
  }
  return true;
})());
ok('an explicit fill is honoured', (() => {
  const d = cameraDistanceForRadius(3, FOV, 0.5);
  return near(frameFill(3, d, FOV), 0.5, 1e-9);
})());

// --- monotonic: a bigger orb must move the camera back ---
ok('bigger radius means greater distance', (() => {
  let prev = -Infinity;
  for (const r of [0.5, 1, 2, 3, 4, 8]) {
    const d = cameraDistanceForRadius(r, FOV);
    if (d <= prev) return false;
    prev = d;
  }
  return true;
})());

// --- the eight measured radii must all land in the target band ---
// These are the bounding-sphere radii measured in the running app before the
// change. Every engine should frame identically once derived.
const MEASURED = {
  tesseract: 3.32, moire: 3.17, auris: 3.56, hopf: 4.15,
  polytope: 1.66, nebula: 3.87, quantum: 1.77, singularity: 1.41,
};
ok('every measured engine lands in 0.75-0.85', Object.entries(MEASURED).every(([, r]) => {
  const fill = frameFill(r, cameraDistanceForRadius(r, FOV), FOV);
  return fill >= 0.75 && fill <= 0.85;
}));
ok('the spread collapses to zero', (() => {
  const fills = Object.values(MEASURED).map((r) => frameFill(r, cameraDistanceForRadius(r, FOV), FOV));
  return Math.max(...fills) - Math.min(...fills) < 1e-9;
})(), 'was 1.34 vs 0.46 before');

// --- degenerate input must not produce a broken camera ---
ok('zero radius falls back', Number.isFinite(cameraDistanceForRadius(0, FOV)) && cameraDistanceForRadius(0, FOV) > 0);
ok('negative radius falls back', cameraDistanceForRadius(-3, FOV) === cameraDistanceForRadius(DEFAULT_FRAME_RADIUS, FOV));
ok('NaN radius falls back', cameraDistanceForRadius(NaN, FOV) === cameraDistanceForRadius(DEFAULT_FRAME_RADIUS, FOV));
ok('undefined radius falls back', cameraDistanceForRadius(undefined, FOV) === cameraDistanceForRadius(DEFAULT_FRAME_RADIUS, FOV));
ok('a fill above 1 is clamped', cameraDistanceForRadius(3, FOV, 4) === cameraDistanceForRadius(3, FOV, 1));
ok('a zero fill falls back', cameraDistanceForRadius(3, FOV, 0) === cameraDistanceForRadius(3, FOV, DEFAULT_FRAME_FILL));
ok('distance is always finite and positive', (() => {
  for (const r of [0, -1, NaN, undefined, 1e-9, 1e6]) {
    const d = cameraDistanceForRadius(r, FOV);
    if (!Number.isFinite(d) || d <= 0) return false;
  }
  return true;
})());

// --- reading the hint off an engine ---
ok('reads a declared radius', engineFrameRadius({ frame: { radius: 3.4 } }) === 3.4);
ok('an engine without a hint falls back', engineFrameRadius({}) === DEFAULT_FRAME_RADIUS);
ok('a null engine falls back', engineFrameRadius(null) === DEFAULT_FRAME_RADIUS);
ok('a malformed hint falls back', engineFrameRadius({ frame: { radius: 'big' } }) === DEFAULT_FRAME_RADIUS);
ok('a zero hint falls back', engineFrameRadius({ frame: { radius: 0 } }) === DEFAULT_FRAME_RADIUS);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
