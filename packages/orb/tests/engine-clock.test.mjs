// An engine sees two clocks, `time` and `delta`, and they must be one clock.
//
// `delta` used to be `raw * timeScale` while `time` also carried the modulation
// rack's tempo multiplier. Fifteen engines integrate `delta`, so a tempo route
// moved nothing in the main view — while grid cells, which fold the multiplier
// into their own delta, obeyed it. A hesitation found in the grid vanished on
// promotion, and the mic's default `audio1 → Tempo` route did nothing at all.
//
// Separately, nine engines faded their click pulse per *frame* (`*= 0.92`), so
// the acknowledgement lasted half as long on a 120 Hz display and kept fading
// while paused.

import { readdirSync, readFileSync } from 'node:fs';
import { decay } from '../src/core/phase.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const src = new URL('../src/', import.meta.url);
const runtime = readFileSync(new URL('core/runtime.js', src), 'utf8');

ok('advance() folds the rack tempo into the frame step',
  /this\.frameStep\s*=[^;]*mod\.timeScale/.test(runtime));
ok('virtualTime advances by exactly the frame step',
  /this\.virtualTime\s*\+=\s*this\.frameStep/.test(runtime));
ok('render() hands engines the frame step as delta',
  /delta:\s*this\.frameStep/.test(runtime));
ok('render() takes no delta of its own to disagree with',
  /^\s*render\(\)\s*\{/m.test(runtime));

// A constant multiplier applied once per update is a per-frame decay. GLSL
// octave loops (`amp *= 0.5`) are the legitimate exception, and live in
// template strings, so only lines inside update() are checked.
const engineFiles = readdirSync(new URL('engines', src)).filter((f) => f.endsWith('-engine.js'));
for (const file of engineFiles) {
  const text = readFileSync(new URL(`engines/${file}`, src), 'utf8');
  const start = text.search(/^\s*update\s*\(/m);
  if (start < 0) continue;
  const body = text.slice(start, start + 1600);
  const perFrame = body.match(/^\s*\w*(pulse|Pulse|boost|Boost|energy|Energy)\w*\s*\*=\s*0?\.\d+\s*;/m);
  ok(`${file} fades over time, not per frame`, !perFrame, perFrame ? perFrame[0].trim() : '');
}

// decay() itself: same fade per second of virtualTime regardless of frame rate.
const run = (hz) => {
  let v = 1;
  for (let i = 0; i < hz; i++) v = decay(v, 5, 1 / hz);
  return v;
};
ok('one second fades equally at 60 Hz and 120 Hz', Math.abs(run(60) - run(120)) < 1e-9,
  `${run(60).toFixed(6)} vs ${run(120).toFixed(6)}`);
ok('a paused frame (step 0) holds the value', decay(0.7, 5, 0) === 0.7);
ok('reverse playback (negative step) still fades', decay(1, 5, -0.1) < 1);
ok('a non-finite step leaves the value alone', decay(0.5, 5, NaN) === 0.5);
ok('the 60 Hz conversion matches the old *= 0.92', Math.abs(decay(1, 5.0, 1 / 60) - 0.92) < 0.001);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nengine clock: all checks passed');
