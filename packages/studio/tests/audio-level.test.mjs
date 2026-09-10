import { readFileSync } from 'node:fs';
import {
  rmsFromTimeDomain,
  normalizeLevel,
  smoothLevel,
  createLevelFollower,
} from '../src/core/audio-level.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// --- rmsFromTimeDomain ---
const silence = new Uint8Array(256).fill(128);
ok('silence is zero', rmsFromTimeDomain(silence) === 0);
ok('empty buffer is zero', rmsFromTimeDomain(new Uint8Array(0)) === 0);

// A zero-filled buffer is NOT silence in this encoding — it is full negative
// deflection, and rms 1.0 is the mathematically correct answer. The bug was in
// audio-input.js, which handed the analyser a `new Uint8Array(fftSize)` and read
// it before the analyser had written to it, so enabling audio reported maximum
// level for the first frames. This asserts the arithmetic that makes an
// unwritten buffer dangerous, so the allocation stays a deliberate decision.
ok('a zero-filled buffer reads as full deflection, not silence',
  rmsFromTimeDomain(new Uint8Array(256)) === 1);
ok('the input buffer is allocated at the silence midpoint', (() => {
  const source = readFileSync(new URL('../src/core/audio-input.js', import.meta.url), 'utf8');
  return /new Uint8Array\(analyser\.fftSize\)\.fill\(128\)/.test(source);
})());

const fullScale = new Uint8Array(256);
for (let i = 0; i < 256; i++) fullScale[i] = i % 2 ? 255 : 0;
const loud = rmsFromTimeDomain(fullScale);
ok('full-scale square is near 1', loud > 0.98 && loud <= 1, String(loud));

const half = new Uint8Array(256);
for (let i = 0; i < 256; i++) half[i] = i % 2 ? 192 : 64;
const mid = rmsFromTimeDomain(half);
ok('half-scale is near 0.5', mid > 0.45 && mid < 0.55, String(mid));
ok('rms always within [0,1]', [silence, fullScale, half].every((buffer) => {
  const value = rmsFromTimeDomain(buffer);
  return value >= 0 && value <= 1 && Number.isFinite(value);
}));

// --- normalizeLevel ---
ok('at floor is exactly 0', normalizeLevel(0.02, { floor: 0.02, ceiling: 0.35 }) === 0);
ok('below floor is exactly 0', normalizeLevel(0.001, { floor: 0.02, ceiling: 0.35 }) === 0);
ok('at ceiling is 1', normalizeLevel(0.35, { floor: 0.02, ceiling: 0.35 }) === 1);
ok('above ceiling clamps to 1', normalizeLevel(0.9, { floor: 0.02, ceiling: 0.35 }) === 1);
const midNorm = normalizeLevel(0.185, { floor: 0.02, ceiling: 0.35 });
ok('midpoint is near 0.5', midNorm > 0.45 && midNorm < 0.55, String(midNorm));
ok('gain scales but still clamps', normalizeLevel(0.2, { floor: 0.02, ceiling: 0.35, gain: 10 }) === 1);
ok('gain of 0 yields 0', normalizeLevel(0.3, { floor: 0.02, ceiling: 0.35, gain: 0 }) === 0);
ok('always within [0,1]', [0, 0.01, 0.1, 0.5, 5].every((rms) => {
  const value = normalizeLevel(rms, { floor: 0.02, ceiling: 0.35, gain: 3 });
  return value >= 0 && value <= 1 && Number.isFinite(value);
}));

// --- smoothLevel ---
ok('rises faster than it falls', (() => {
  const up = smoothLevel(0, 1, { attack: 0.5, release: 0.12 });
  const down = 1 - smoothLevel(1, 0, { attack: 0.5, release: 0.12 });
  return up > down;
})());
ok('converges upward', (() => {
  let value = 0;
  for (let i = 0; i < 100; i++) value = smoothLevel(value, 1, { attack: 0.5, release: 0.12 });
  return value > 0.99;
})());
ok('converges downward', (() => {
  let value = 1;
  for (let i = 0; i < 400; i++) value = smoothLevel(value, 0, { attack: 0.5, release: 0.12 });
  return value < 0.01;
})());
ok('stays within [0,1]', (() => {
  let value = 0;
  for (let i = 0; i < 200; i++) {
    value = smoothLevel(value, i % 2, { attack: 0.5, release: 0.12 });
    if (value < 0 || value > 1 || !Number.isFinite(value)) return false;
  }
  return true;
})());

// --- createLevelFollower ---
const follower = createLevelFollower({
  floor: 0.02,
  ceiling: 0.35,
  gain: 1,
  attack: 0.5,
  release: 0.12,
});
ok('starts at zero', follower.value === 0);
ok('push returns the new value', typeof follower.push(0.3) === 'number');
let value = 0;
for (let i = 0; i < 50; i++) value = follower.push(0.35);
ok('follows a loud signal up', value > 0.9, String(value));
for (let i = 0; i < 400; i++) value = follower.push(0);
ok('returns to silence', value < 0.01, String(value));
follower.reset();
ok('reset clears state', follower.value === 0);
follower.setOptions({ gain: 0 });
ok('live options affect following', follower.push(0.35) === 0);

// --- the audio source inside the rack ---
const { createModulationRack, createDefaultModulation } = await import('../../orb/src/core/modulation.js');

const defs = { edgeGlow: { type: 'number', section: 'colors', min: 0, max: 3, step: 0.05 } };
const config = createDefaultModulation();
ok('default config ships an audio source', config.sources.audio1?.type === 'audio');

config.enabled = true;
config.routes = [{ source: 'audio1', dest: 'edgeGlow', amount: 1 }];
const rack = createModulationRack(config);

ok('audio source is inert before any level is pushed',
  rack.apply({ edgeGlow: 1.2 }, defs, 0).params.edgeGlow === 1.2);

rack.setAudioLevel(1);
const loudParams = rack.apply({ edgeGlow: 1.2 }, defs, 0).params;
ok('a loud level moves the destination', loudParams.edgeGlow > 1.2, String(loudParams.edgeGlow));
ok('destination is still clamped to its range', loudParams.edgeGlow <= 3);

rack.setAudioLevel(0);
ok('silence returns to base',
  Math.abs(rack.apply({ edgeGlow: 1.2 }, defs, 0).params.edgeGlow - 1.2) < 1e-9);

rack.setAudioLevel(5);
ok('out-of-range levels are clamped', rack.audioLevel === 1);
rack.setAudioLevel(NaN);
ok('NaN levels fall back to 0', rack.audioLevel === 0);
rack.setAudioLevel(-2);
ok('negative levels clamp to 0', rack.audioLevel === 0);

const legacy = createModulationRack({
  enabled: true,
  sources: { weird1: { type: 'from-the-future' } },
  routes: [{ source: 'weird1', dest: 'edgeGlow', amount: 1 }],
});
ok('unknown source types stay inert',
  legacy.apply({ edgeGlow: 1.2 }, defs, 0).params.edgeGlow === 1.2);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
