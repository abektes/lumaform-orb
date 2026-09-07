import assert from 'node:assert/strict';
import {
  advectShellPoint,
  createTrailHistory,
  pushTrailPoint,
  pushTrailTowards,
  resetTrailHistory,
  sampleCurlField,
  sampleShellFlow,
  writeOrderedTrail,
} from '../src/engines/curl-drift-field.js';

const a = sampleCurlField(0.37, -1.2, 2.4, 0.6);
const b = sampleCurlField(0.37, -1.2, 2.4, 0.6);
assert.deepEqual([...a], [...b], 'curl samples are deterministic');
assert.ok(a.every(Number.isFinite), 'curl samples stay finite');
assert.ok(Math.hypot(...a) > 0.01, 'curl sample carries useful motion');

// Use the field's finite-difference interval: the matching discrete derivative
// operators commute, so divergence(curl(A)) cancels to floating-point noise.
const divergenceStep = 0.075;
function component(x, y, z, component) {
  return sampleCurlField(x, y, z, 0.4)[component];
}
const divergence = (
  component(0.2 + divergenceStep, -0.4, 0.7, 0)
  - component(0.2 - divergenceStep, -0.4, 0.7, 0)
  + component(0.2, -0.4 + divergenceStep, 0.7, 1)
  - component(0.2, -0.4 - divergenceStep, 0.7, 1)
  + component(0.2, -0.4, 0.7 + divergenceStep, 2)
  - component(0.2, -0.4, 0.7 - divergenceStep, 2)
) / (2 * divergenceStep);
assert.ok(Math.abs(divergence) < 0.01, `curl divergence should be near zero, got ${divergence}`);

const shellFlow = sampleShellFlow(0.6, -0.8, 1.2, 0.4, 1.05, 0.55);
const shellNormal = Math.hypot(0.6, -0.8, 1.2);
const radialFlow = (
  shellFlow[0] * 0.6
  + shellFlow[1] * -0.8
  + shellFlow[2] * 1.2
) / shellNormal;
assert.ok(Math.abs(radialFlow) < 1e-12, 'shell flow is exactly tangential');

const streamCount = 64;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
const points = Array.from({ length: streamCount }, (_, index) => {
  const y = 1 - 2 * ((index + 0.5) / streamCount);
  const ring = Math.sqrt(1 - y * y);
  return new Float64Array([
    Math.cos(index * goldenAngle) * ring * 1.6,
    y * 1.6,
    Math.sin(index * goldenAngle) * ring * 1.6,
  ]);
});
const next = new Float64Array(3);
for (let frame = 0; frame < 600; frame++) {
  const evolve = frame / 60 * 0.08;
  for (const point of points) {
    advectShellPoint(
      point[0],
      point[1],
      point[2],
      1.6,
      1.05 / 60,
      evolve,
      1.05,
      0.55,
      next
    );
    point.set(next);
  }
}
for (const point of points) {
  assert.ok(
    Math.abs(Math.hypot(...point) - 1.6) < 1e-10,
    'advection remains exactly on its assigned shell'
  );
}
const centroidY = points.reduce((sum, point) => sum + point[1], 0) / streamCount;
const lowerPoleCount = points.filter((point) => point[1] < -1.1).length;
assert.ok(Math.abs(centroidY) < 0.25, `streams should remain balanced, centroid y was ${centroidY}`);
assert.ok(lowerPoleCount < 16, `streams should not clump at the bottom, found ${lowerPoleCount}`);

const history = createTrailHistory(4, 1, 2, 3);
const ordered = new Float32Array(12);
pushTrailPoint(history, 4, 5, 6);
writeOrderedTrail(history, ordered);
assert.deepEqual(
  [...ordered],
  [1, 2, 3, 1, 2, 3, 1, 2, 3, 4, 5, 6],
  'new points advance at the readable head end'
);

const spacedHistory = createTrailHistory(4, 0, 0, 0);
assert.equal(
  pushTrailTowards(spacedHistory, 0.26, 0, 0, 0.1),
  2,
  'spatial sampling does not depend on the render frame rate'
);
writeOrderedTrail(spacedHistory, ordered);
assert.ok(
  ordered.every((value, index) => (
    Math.abs(value - [0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0.2, 0, 0][index]) < 1e-6
  )),
  'spatial sampling fills a coherent trail without stretching the latest segment'
);

resetTrailHistory(history, -1, -2, -3);
writeOrderedTrail(history, ordered);
assert.deepEqual(
  [...ordered],
  [-1, -2, -3, -1, -2, -3, -1, -2, -3, -1, -2, -3],
  'respawn clears every trail point so no cross-orb segment survives'
);

console.log('curl drift field tests passed');
