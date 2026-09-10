import assert from 'node:assert/strict';
import {
  RING_LAYOUTS,
  ringRest,
  sampleRingPoint,
} from '../../orb/src/engines/vocalis-layout.js';

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

console.log('vocalis layout tests passed');
