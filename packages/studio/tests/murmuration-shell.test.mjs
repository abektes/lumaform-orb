import assert from 'node:assert/strict';
import {
  SHELL_SHAPES,
  shellBoundRadius,
  shellSdf,
  spawnOnShell,
} from '../../orb/src/engines/murmuration-shell.js';
import {
  createMurmurationSimulation,
  measureMurmuration,
  stepMurmuration,
} from '../../orb/src/engines/murmuration-simulation.js';

const R = 1.7;
const EPS = 0.04;

function meanAbsAxis(positions, axis) {
  let total = 0;
  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    total += Math.abs(positions[i * 3 + axis]);
  }
  return total / count;
}

function meanHypotXZ(positions) {
  let total = 0;
  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    total += Math.hypot(x, z);
  }
  return total / count;
}

function meanSdf(positions, radius, shape) {
  let total = 0;
  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    const p = i * 3;
    total += Math.abs(shellSdf(
      positions[p],
      positions[p + 1],
      positions[p + 2],
      radius,
      shape
    ));
  }
  return total / count;
}

{
  assert.deepEqual(
    SHELL_SHAPES,
    ['sphere', 'torus', 'cube', 'disk'],
    'shell catalog must stay a small fixed set'
  );
}

{
  assert.ok(Math.abs(shellSdf(R, 0, 0, R, 'sphere')) < EPS, 'sphere equator sits on the hull');
  const major = R * 0.72;
  const minor = R * 0.28;
  assert.ok(
    Math.abs(shellSdf(major + minor, 0, 0, R, 'torus')) < EPS,
    'torus outer equator sits on the hull'
  );
  assert.ok(Math.abs(shellSdf(R, 0, 0, R, 'cube')) < EPS, 'cube face centre sits on the hull');
  assert.ok(Math.abs(shellSdf(R, 0, 0, R, 'disk')) < EPS, 'disk rim sits on the hull');
}

{
  assert.equal(shellBoundRadius('sphere', R), R);
  assert.ok(shellBoundRadius('cube', R) > R, 'cube corners must outrun the face radius');
  assert.ok(shellBoundRadius('torus', R) <= R * 1.1, 'torus must fit the same framing sphere');
}

{
  const random = () => 0.37;
  const [x, y, z] = spawnOnShell(random, R, 'torus');
  assert.ok(Math.abs(shellSdf(x, y, z, R, 'torus')) < 0.08, 'torus spawn must land on the tube');
}

{
  const defaults = {
    shellRadius: R,
    cohesion: 0.2,
    separation: 0.4,
    alignment: 0.2,
    neighbourRadius: 0.55,
    attractorPull: 0.15,
    shellBinding: 1.6,
    agentSpeed: 1,
    damping: 0.96,
  };

  const sphere = createMurmurationSimulation({
    agentCount: 96,
    shellRadius: R,
    shellShape: 'sphere',
  });
  const torus = createMurmurationSimulation({
    agentCount: 96,
    shellRadius: R,
    shellShape: 'torus',
  });
  const cube = createMurmurationSimulation({
    agentCount: 96,
    shellRadius: R,
    shellShape: 'cube',
  });
  const disk = createMurmurationSimulation({
    agentCount: 96,
    shellRadius: R,
    shellShape: 'disk',
  });

  for (let frame = 0; frame < 180; frame++) {
    stepMurmuration(sphere, { ...defaults, shellShape: 'sphere' }, 1 / 60);
    stepMurmuration(torus, { ...defaults, shellShape: 'torus' }, 1 / 60);
    stepMurmuration(cube, { ...defaults, shellShape: 'cube' }, 1 / 60);
    stepMurmuration(disk, { ...defaults, shellShape: 'disk' }, 1 / 60);
  }

  const torusY = meanAbsAxis(torus.positions, 1);
  const sphereY = meanAbsAxis(sphere.positions, 1);
  const diskY = meanAbsAxis(disk.positions, 1);
  const torusRing = meanHypotXZ(torus.positions);

  assert.ok(
    torusY < sphereY * 0.55,
    `torus flock must stay flatter than a sphere (${torusY} vs ${sphereY})`
  );
  assert.ok(
    diskY < sphereY * 0.45,
    `disk flock must stay flatter than a sphere (${diskY} vs ${sphereY})`
  );
  assert.ok(
    Math.abs(torusRing - R * 0.72) < 0.35,
    `torus flock must sit on the ring, got xz ${torusRing}`
  );
  assert.ok(
    meanSdf(cube.positions, R, 'cube') < 0.28,
    `cube flock must hug the box, got mean |sdf| ${meanSdf(cube.positions, R, 'cube')}`
  );
  assert.ok(
    measureMurmuration(torus).maxRadius < shellBoundRadius('torus', R) * 2,
    'torus agents must remain bounded'
  );
  assert.notDeepEqual(
    Array.from(sphere.positions.slice(0, 12)),
    Array.from(cube.positions.slice(0, 12)),
    'distinct shells must produce distinct flocks'
  );
}

{
  const simulation = createMurmurationSimulation({
    agentCount: 96,
    shellRadius: R,
    shellShape: 'torus',
  });
  const params = {
    shellRadius: R,
    shellShape: 'torus',
    cohesion: 0.4,
    separation: 0.55,
    alignment: 0.35,
    neighbourRadius: 0.55,
    attractorPull: 0.5,
    shellBinding: 0.8,
    agentSpeed: 1,
    damping: 0.96,
  };
  for (let frame = 0; frame < 180; frame++) {
    stepMurmuration(simulation, params, 1 / 60);
  }
  const ring = meanHypotXZ(simulation.positions);
  const hole = meanAbsAxis(simulation.positions, 1);
  assert.ok(
    Math.abs(ring - R * 0.72) < 0.4,
    `default attractor must not swallow the torus hole, got xz ${ring}`
  );
  assert.ok(hole < 0.45, `torus tube must stay flat, got |y| ${hole}`);
}

console.log('murmuration shell tests passed');
