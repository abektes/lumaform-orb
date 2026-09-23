import assert from 'node:assert/strict';
import {
  coronaLoopFrames,
  LOOP_SPAN_RANGE,
  LOOP_HEIGHT_RANGE,
  LOOP_DEPTH_RANGE,
  LOOP_LEAN_RANGE,
} from '../src/engines/corona-veil-loops.js';

const TAU = Math.PI * 2;

// The catalog offers 5–12 veils; every count must give a full crown.
for (const count of [5, 6, 8, 10, 12]) {
  const frames = coronaLoopFrames(count);
  assert.equal(frames.length, count, `one frame per loop (${count})`);

  for (const [i, f] of frames.entries()) {
    assert.ok(f.angle >= 0 && f.angle < TAU, `loop ${i}/${count}: angle ${f.angle} within one turn`);
    assert.ok(f.depth >= LOOP_DEPTH_RANGE[0] && f.depth <= LOOP_DEPTH_RANGE[1], `loop ${i}/${count}: depth ${f.depth} in range`);
    assert.ok(f.lean >= LOOP_LEAN_RANGE[0] && f.lean <= LOOP_LEAN_RANGE[1], `loop ${i}/${count}: lean ${f.lean} in range`);
    assert.ok(f.span >= LOOP_SPAN_RANGE[0] && f.span <= LOOP_SPAN_RANGE[1], `loop ${i}/${count}: span ${f.span} in range`);
    assert.ok(f.height >= LOOP_HEIGHT_RANGE[0] && f.height <= LOOP_HEIGHT_RANGE[1], `loop ${i}/${count}: height ${f.height} in range`);
  }

  // Around the limb, in order, with no two loops crowding one spot and no
  // gap wide enough to read as a missing loop.
  const angles = frames.map((f) => f.angle);
  for (let i = 1; i < count; i++) assert.ok(angles[i] > angles[i - 1], `${count} loops: angles increase around the crown`);
  const gaps = angles.map((a, i) => ((angles[(i + 1) % count] - a) + TAU) % TAU);
  const even = TAU / count;
  assert.ok(Math.min(...gaps) > even * 0.45, `${count} loops: tightest gap ${Math.min(...gaps).toFixed(3)} vs even ${even.toFixed(3)}`);
  assert.ok(Math.max(...gaps) < even * 1.55, `${count} loops: widest gap ${Math.max(...gaps).toFixed(3)} vs even ${even.toFixed(3)}`);
}

assert.deepEqual(coronaLoopFrames(8), coronaLoopFrames(8), 'deterministic: same count, same crown');

console.log('corona veil loop tests passed');
