import assert from 'node:assert/strict';
import {
  createMurmurationSimulation,
  measureMurmuration,
  scatterMurmuration,
  stepMurmuration,
} from '../src/engines/murmuration-simulation.js';

const defaults = {
  shellRadius: 1.7,
  cohesion: 0.4,
  separation: 0.55,
  alignment: 0.35,
  neighbourRadius: 0.55,
  attractorPull: 0.5,
  shellBinding: 0.8,
  agentSpeed: 1,
  damping: 0.96,
};

{
  const a = createMurmurationSimulation({ agentCount: 64, shellRadius: 1.7 });
  const b = createMurmurationSimulation({ agentCount: 64, shellRadius: 1.7 });
  for (let frame = 0; frame < 180; frame++) {
    if (frame === 40) {
      scatterMurmuration(a);
      scatterMurmuration(b);
    }
    stepMurmuration(a, defaults, 1 / 60);
    stepMurmuration(b, defaults, 1 / 60);
  }
  assert.deepEqual(a.positions, b.positions, 'equal bags must produce equal simulations');
  assert.deepEqual(a.velocities, b.velocities, 'velocity integration must be deterministic');
}

{
  const clamped = createMurmurationSimulation({ agentCount: 64, shellRadius: 1.7 });
  const reference = createMurmurationSimulation({ agentCount: 64, shellRadius: 1.7 });
  stepMurmuration(clamped, defaults, 1);
  stepMurmuration(reference, defaults, 1 / 30);
  assert.deepEqual(
    clamped.positions,
    reference.positions,
    'large frame deltas must clamp to 1/30 and use the same substeps'
  );
}

{
  const simulation = createMurmurationSimulation({ agentCount: 64, shellRadius: 1.7 });
  for (let frame = 0; frame < 60 * 60; frame++) {
    if (frame % 600 === 0) scatterMurmuration(simulation);
    stepMurmuration(simulation, defaults, 1 / 60);
  }
  const measured = measureMurmuration(simulation);
  assert.ok(Number.isFinite(measured.averageRadius), 'positions must remain finite');
  assert.ok(
    measured.maxRadius < defaults.shellRadius * 2,
    `agents must remain bounded, got radius ${measured.maxRadius}`
  );
}

{
  const low = createMurmurationSimulation({ agentCount: 64, shellRadius: 1.7 });
  const high = createMurmurationSimulation({ agentCount: 64, shellRadius: 1.7 });
  for (let frame = 0; frame < 8 * 60; frame++) {
    stepMurmuration(low, { ...defaults, attractorPull: 0 }, 1 / 60);
    stepMurmuration(high, { ...defaults, attractorPull: 2 }, 1 / 60);
  }
  const lowRadius = measureMurmuration(low).averageRadius;
  const highRadius = measureMurmuration(high).averageRadius;
  assert.ok(
    lowRadius - highRadius > 0.55,
    `attractor extremes must differ visibly (${lowRadius} versus ${highRadius})`
  );
}

{
  const simulation = createMurmurationSimulation({ agentCount: 64, shellRadius: 1.7 });
  for (let frame = 0; frame < 180; frame++) {
    stepMurmuration(simulation, defaults, 1 / 60);
  }
  const settled = measureMurmuration(simulation).averageRadius;
  scatterMurmuration(simulation);
  for (let frame = 0; frame < 24; frame++) {
    stepMurmuration(simulation, defaults, 1 / 60);
  }
  const scattered = measureMurmuration(simulation).averageRadius;
  for (let frame = 0; frame < 120; frame++) {
    stepMurmuration(simulation, defaults, 1 / 60);
  }
  const regrouped = measureMurmuration(simulation).averageRadius;
  assert.ok(scattered > settled + 0.12, 'pulse must visibly scatter the flock');
  assert.ok(regrouped < scattered - 0.08, 'flock must visibly regroup within two seconds');
}

console.log('murmuration simulation tests passed');
