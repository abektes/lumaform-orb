import assert from 'node:assert/strict';
import {
  createMurmurationSimulation,
  measureMurmuration,
  roostPositions,
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

// Gathering. Local flocking only reaches a small patch of the shell, so the
// agents spread evenly and nothing gathered, separated or regrouped. Roosts
// wandering over the shell pull the flock into clouds; how unevenly it covers
// the shell is measured by binning agents by direction into 32 equal cells.
{
  const BINS = 32;
  const centres = Array.from({ length: BINS }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / BINS;
    const r = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    return [r * Math.cos(a), y, r * Math.sin(a)];
  });
  const unevenness = (positions) => {
    const counts = new Array(BINS).fill(0);
    for (let i = 0; i < positions.length; i += 3) {
      const l = Math.hypot(positions[i], positions[i + 1], positions[i + 2]) || 1;
      let best = 0;
      let bestDot = -2;
      centres.forEach((c, k) => {
        const d = (c[0] * positions[i] + c[1] * positions[i + 1] + c[2] * positions[i + 2]) / l;
        if (d > bestDot) { bestDot = d; best = k; }
      });
      counts[best]++;
    }
    const mean = counts.reduce((a, b) => a + b) / BINS;
    return Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / BINS) / mean;
  };
  const fly = (gathering) => {
    const simulation = createMurmurationSimulation({ agentCount: 128, shellRadius: 1.7 });
    let total = 0;
    let spread = 0;
    let samples = 0;
    for (let frame = 0; frame < 14 * 60; frame++) {
      stepMurmuration(simulation, { ...defaults, gathering }, 1 / 60);
      if (frame >= 6 * 60 && frame % 30 === 0) {
        total += unevenness(simulation.positions);
        const roosts = roostPositions(simulation.elapsed, 1.7, 'sphere', 1);
        let distance = 0;
        for (let i = 0; i < simulation.positions.length; i += 3) {
          distance += Math.min(...roosts.map((r) => Math.hypot(r[0] - simulation.positions[i], r[1] - simulation.positions[i + 1], r[2] - simulation.positions[i + 2])));
        }
        spread += distance / (simulation.positions.length / 3) / 1.7;
        samples++;
      }
    }
    return { unevenness: total / samples, spread: spread / samples };
  };
  const loose = fly(0);
  const gathered = fly(0.6);
  const tight = fly(1);
  console.log(`unevenness: gathering 0 ${loose.unevenness.toFixed(2)}, 0.6 ${gathered.unevenness.toFixed(2)}; cloud spread at 1: ${tight.spread.toFixed(2)} R`);
  assert.ok(loose.unevenness < 1.1, `without gathering the flock should stay spread (${loose.unevenness})`);
  assert.ok(gathered.unevenness > loose.unevenness * 1.8, `gathering must pull the flock into clouds (${gathered.unevenness} vs ${loose.unevenness})`);
  assert.ok(tight.spread > 0.4, `even full gathering must leave wide clouds, not knots (${tight.spread} R)`);
}

{
  // Roosts sit on the shell whatever its shape, and follow a fixed path.
  for (const shape of ['sphere', 'torus', 'cube', 'disk']) {
    const a = roostPositions(12.5, 1.7, shape, 1);
    const b = roostPositions(12.5, 1.7, shape, 1);
    assert.deepEqual(a, b, `${shape}: roost paths must be deterministic`);
    for (const r of a) assert.ok(r.every(Number.isFinite), `${shape}: roosts must be finite`);
  }
}

console.log('murmuration simulation tests passed');
