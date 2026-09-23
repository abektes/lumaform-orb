import assert from 'node:assert/strict';
import {
  RING_LAYOUTS,
  ringRest,
  sampleRingPoint,
  syllableOpening,
} from '../src/engines/vocalis-layout.js';

const R = 1.45;
const DEPTH = 0.6;

{
  assert.deepEqual(
    RING_LAYOUTS,
    ['circle', 'iris', 'ellipse', 'globe'],
    'Vocalis layouts must stay a small fixed set'
  );
}

{
  const rest = ringRest('circle', 1, R, DEPTH);
  const [x, y, z] = sampleRingPoint('circle', 0, rest, 1);
  assert.ok(Math.abs(y) < 1e-9, 'circle theta=0 sits on +X');
  assert.ok(Math.abs(x - rest.radius) < 1e-9, 'circle theta=0 uses the rest radius');
  assert.equal(z, rest.zOffset);
}

{
  const rest = ringRest('ellipse', 1, R, DEPTH);
  const [x0] = sampleRingPoint('ellipse', 0, rest, 1);
  const [, y1] = sampleRingPoint('ellipse', Math.PI / 2, rest, 1);
  assert.ok(
    Math.abs(y1) < Math.abs(x0) * 0.75,
    `ellipse must be flatter than a circle (${Math.abs(y1)} vs ${Math.abs(x0)})`
  );
}

{
  const rest = ringRest('iris', 1, R, DEPTH);
  const peak = Math.hypot(...sampleRingPoint('iris', 0, rest, 1).slice(0, 2));
  const trough = Math.hypot(...sampleRingPoint('iris', Math.PI / 6, rest, 1).slice(0, 2));
  assert.ok(
    peak - trough > 0.08 * rest.radius,
    `iris blades must scallop the ring (${peak} vs ${trough})`
  );
}

{
  const rest = ringRest('globe', 0.5, R, DEPTH);
  const [x, y, z] = sampleRingPoint('globe', 0.4, rest, 1);
  const rho = Math.hypot(x, y, z);
  assert.ok(
    Math.abs(rho - R) < 0.04,
    `globe rings must sit on a sphere of radius ${R}, got ${rho}`
  );
}

{
  const rest = ringRest('circle', 1, R, DEPTH);
  const circle = sampleRingPoint('circle', 0.7, rest, 1);
  const iris = sampleRingPoint('iris', 0.7, rest, 1);
  const ellipse = sampleRingPoint('ellipse', 0.7, rest, 1);
  assert.notDeepEqual(circle, iris, 'iris must differ from circle');
  assert.notDeepEqual(circle, ellipse, 'ellipse must differ from circle');
}

{
  const inner = ringRest('globe', 0, R, DEPTH);
  const outer = ringRest('globe', 1, R, DEPTH);
  assert.notEqual(inner.phi, outer.phi, 'globe rings must occupy different latitudes');
}

// The globe used to span 16°–76° from the pole — a dome sitting in the top
// half of the frame. Its latitudes must be symmetric about the equator.
{
  for (const count of [4, 6, 12]) {
    const phis = Array.from({ length: count }, (_, i) => ringRest('globe', i / (count - 1), R, DEPTH).phi);
    for (let i = 0; i < count; i++) {
      assert.ok(
        Math.abs(phis[i] + phis[count - 1 - i] - Math.PI) < 1e-9,
        `globe ring ${i} of ${count} must mirror ring ${count - 1 - i} across the equator`
      );
    }
    const meanY = phis.reduce((sum, phi) => sum + R * Math.cos(phi), 0) / count;
    assert.ok(Math.abs(meanY) < 1e-9, `globe must be centred, mean ring height ${meanY}`);
  }
}

// Syllable envelope: bounded, continuous, and actually closes sometimes —
// a sine would never produce the closures that make it read as speech.
{
  const samples = [];
  for (let t = 0; t < 40; t += 0.002) samples.push(syllableOpening(t));
  assert.ok(samples.every((v) => v >= 0 && v <= 1), 'opening stays within 0..1');
  const maxJump = samples.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - samples[i])), 0);
  assert.ok(maxJump < 0.05, `opening must not jump between close samples (max step ${maxJump})`);
  const peaks = [];
  for (let s = 0; s < 40; s++) peaks.push(syllableOpening(s + 0.42));
  assert.ok(new Set(peaks.map((p) => p.toFixed(2))).size > 5, 'syllables must vary in height');
  assert.ok(peaks.some((p) => p < 0.1), 'some syllables must be closures');
  assert.equal(syllableOpening(7.3), syllableOpening(7.3), 'seeded: same clock, same opening');
}

console.log('vocalis layout tests passed');
