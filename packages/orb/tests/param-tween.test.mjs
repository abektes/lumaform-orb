import { EASINGS, EASING_NAMES, applyEasing } from '../src/core/easing.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

ok('exposes the five named curves',
  JSON.stringify(EASING_NAMES) === JSON.stringify(['linear', 'easeOut', 'easeInOut', 'spring', 'snap']));

for (const name of EASING_NAMES) {
  const fn = EASINGS[name];
  ok(`${name} starts at 0`, Math.abs(fn(0)) < 1e-9, String(fn(0)));
  ok(`${name} ends at 1`, Math.abs(fn(1) - 1) < 1e-9, String(fn(1)));
  ok(`${name} is finite throughout`, (() => {
    for (let t = 0; t <= 1; t += 0.01) if (!Number.isFinite(fn(t))) return false;
    return true;
  })());
}

ok('spring overshoots above 1', (() => {
  for (let t = 0; t <= 1; t += 0.005) if (EASINGS.spring(t) > 1.02) return true;
  return false;
})());
ok('easeOut never overshoots', (() => {
  for (let t = 0; t <= 1; t += 0.005) if (EASINGS.easeOut(t) > 1.0001) return false;
  return true;
})());
ok('snap is front-loaded', EASINGS.snap(0.33) > 0.6, String(EASINGS.snap(0.33)));
ok('linear is the identity', Math.abs(EASINGS.linear(0.42) - 0.42) < 1e-9);
ok('easeInOut is symmetric about the midpoint',
  Math.abs(EASINGS.easeInOut(0.25) - (1 - EASINGS.easeInOut(0.75))) < 1e-6);

ok('applyEasing dispatches by name', Math.abs(applyEasing('linear', 0.3) - 0.3) < 1e-9);
ok('applyEasing falls back to linear', Math.abs(applyEasing('nope', 0.3) - 0.3) < 1e-9);

// --- param tween ---
const { lerpHexColor, interpolateParams, createParamTween } = await import('../src/core/param-tween.js');

const DEFS = {
  edgeGlow: { type: 'number', min: 0, max: 3, step: 0.05, section: 'colors' },
  color1:   { type: 'color', section: 'colors' },
  shape:    { type: 'select', options: ['sphere', 'cube'], section: 'geometry' },
  segments: { type: 'number', min: 4, max: 64, step: 1, section: 'geometry' },
  rotSpeed: { type: 'number', min: 0, max: 2, step: 0.01, section: 'motion' },
};

// lerpHexColor
ok('colour lerp endpoints', lerpHexColor('#000000', '#ffffff', 0) === '#000000' && lerpHexColor('#000000', '#ffffff', 1) === '#ffffff');
ok('colour lerp midpoint', lerpHexColor('#000000', '#ffffff', 0.5) === '#808080', lerpHexColor('#000000', '#ffffff', 0.5));
ok('colour lerp always valid hex', (() => {
  for (let t = 0; t <= 1; t += 0.05) if (!/^#[0-9a-f]{6}$/i.test(lerpHexColor('#ffed00', '#057eff', t))) return false;
  return true;
})());
ok('colour lerp tolerates junk input', lerpHexColor('nope', '#ffffff', 0.5) === '#ffffff');

// interpolateParams
const A = { edgeGlow: 0, color1: '#000000', shape: 'sphere', segments: 8, rotSpeed: 0.2 };
const B = { edgeGlow: 3, color1: '#ffffff', shape: 'cube', segments: 48, rotSpeed: 1.5 };
ok('t=0 yields the source', JSON.stringify(interpolateParams(A, B, DEFS, 0)) === JSON.stringify(A));
ok('t=1 yields the target', JSON.stringify(interpolateParams(A, B, DEFS, 1)) === JSON.stringify(B));
const midway = interpolateParams(A, B, DEFS, 0.5);
ok('numbers lerp', Math.abs(midway.edgeGlow - 1.5) < 1e-9, String(midway.edgeGlow));
ok('colours lerp', midway.color1 === '#808080', midway.color1);
ok('selects snap at the midpoint', midway.shape === 'cube');
ok('selects hold before the midpoint', interpolateParams(A, B, DEFS, 0.49).shape === 'sphere');
ok('geometry numbers hold before the midpoint',
  interpolateParams(A, B, DEFS, 0.49).segments === 8);
ok('geometry numbers snap once at the midpoint',
  interpolateParams(A, B, DEFS, 0.5).segments === 48);
ok('rate numbers hold before the midpoint',
  interpolateParams(A, B, DEFS, 0.49).rotSpeed === 0.2);
ok('rate numbers snap once at the midpoint',
  interpolateParams(A, B, DEFS, 0.5).rotSpeed === 1.5);
ok('numbers stay clamped even when eased past 1',
  interpolateParams(A, B, DEFS, 1.3).edgeGlow === 3, String(interpolateParams(A, B, DEFS, 1.3).edgeGlow));
ok('never emits NaN', (() => {
  for (let t = -0.2; t <= 1.4; t += 0.05) {
    const p = interpolateParams(A, B, DEFS, t);
    if (!Number.isFinite(p.edgeGlow)) return false;
  }
  return true;
})());

// createParamTween
const tw = createParamTween();
ok('idle tween returns null', tw.advance(16) === null && tw.isRunning === false);

tw.start(A, B, DEFS, { durationMs: 400, easing: 'linear' });
ok('starts running', tw.isRunning === true);
const first = tw.advance(200);
ok('midway value is between the endpoints', first.edgeGlow > 0 && first.edgeGlow < 3, String(first.edgeGlow));
ok('progress is tracked', Math.abs(tw.progress - 0.5) < 1e-6, String(tw.progress));
const last = tw.advance(200);
ok('lands exactly on the target', last.edgeGlow === 3 && last.color1 === '#ffffff' && last.shape === 'cube');
ok('stops running when complete', tw.isRunning === false);
ok('returns null after completing', tw.advance(16) === null);

// monotonic under a non-overshooting curve
const tw2 = createParamTween();
tw2.start(A, B, DEFS, { durationMs: 300, easing: 'easeOut' });
let prev = -Infinity, monotonic = true;
for (let i = 0; i < 40; i++) {
  const p = tw2.advance(10);
  if (!p) break;
  if (p.edgeGlow < prev - 1e-9) monotonic = false;
  prev = p.edgeGlow;
}
ok('easeOut progresses monotonically', monotonic);

// spring may overshoot mid-flight but must land exactly
const tw3 = createParamTween();
tw3.start({ edgeGlow: 0 }, { edgeGlow: 2 }, DEFS, { durationMs: 300, easing: 'spring' });
let sawOvershoot = false, lastVal = 0;
for (let i = 0; i < 40; i++) {
  const p = tw3.advance(10);
  if (!p) break;
  if (p.edgeGlow > 2.0001) sawOvershoot = true;
  lastVal = p.edgeGlow;
}
ok('spring lands exactly on target', lastVal === 2, String(lastVal));
ok('spring overshoot stays clamped to the param range', lastVal <= 3);

// zero duration completes immediately
const tw4 = createParamTween();
tw4.start(A, B, DEFS, { durationMs: 0 });
const instant = tw4.advance(16);
ok('zero duration lands immediately', instant.edgeGlow === 3 && tw4.isRunning === false);

// cancel
const tw5 = createParamTween();
tw5.start(A, B, DEFS, { durationMs: 400 });
tw5.cancel();
ok('cancel stops the tween', tw5.isRunning === false && tw5.advance(16) === null);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
