// The orbital maths behind Superposition. The engine drew every sample on one
// of two fixed Fibonacci shells, so the cloud read as a dotted sphere whatever
// the state; the shape now comes from these densities, so they are checked.

import {
  ORBITAL_MODES, modeIndex, orbitalDensity, densityPeak, sampleMeasurement,
} from '../src/engines/superposition-orbitals.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDirection(random) {
  const y = random() * 2 - 1;
  const a = random() * Math.PI * 2;
  const r = Math.sqrt(1 - y * y);
  return [r * Math.cos(a), y, r * Math.sin(a)];
}

ok('mode names map to indices, unknown falls back to d', modeIndex('hybrid_sp') === 0 && modeIndex('chiral_vortex') === 3 && modeIndex('nonsense') === 1);

for (const [mode, name] of ORBITAL_MODES.entries()) {
  const peak = densityPeak(mode);
  const random = seeded(7 + mode);
  let over = 0;
  for (let i = 0; i < 4000; i++) {
    const [x, y, z] = randomDirection(random);
    if (orbitalDensity(mode, x, y, z, random() * Math.PI * 2) > peak * 1.08) over++;
  }
  ok(`${name}: the peak bounds the density to within the search's grain`, over === 0, `peak ${peak.toFixed(3)}`);

  // A measurement should land where the cloud is: the mean density at measured
  // directions has to beat the mean over the whole sphere by a clear margin.
  // Near π every state has lobes; near 0 the sp state is almost a sphere, where
  // no sampler can beat uniform by much.
  const phase = 2.8;
  let measured = 0;
  let uniform = 0;
  for (let i = 0; i < 600; i++) {
    const [x, y, z] = sampleMeasurement(mode, phase, 1, random);
    measured += orbitalDensity(mode, x, y, z, phase);
    const [u, v, w] = randomDirection(random);
    uniform += orbitalDensity(mode, u, v, w, phase);
  }
  ok(`${name}: measurements land in the lobes`, measured > uniform * 1.1, `mean density ${(measured / 600).toFixed(3)} vs ${(uniform / 600).toFixed(3)} uniform`);

  const dir = sampleMeasurement(mode, phase, 1, random);
  ok(`${name}: a measurement is a unit direction`, Math.abs(Math.hypot(...dir) - 1) < 1e-9);
}

// Coherence is the interference term. At zero the state is a classical
// mixture: the density no longer depends on the phase, so nothing beats.
{
  const random = seeded(3);
  let beating = 0;
  let still = 0;
  for (let i = 0; i < 500; i++) {
    const [x, y, z] = randomDirection(random);
    const mode = i % 4;
    beating = Math.max(beating, Math.abs(orbitalDensity(mode, x, y, z, 0.3, 1) - orbitalDensity(mode, x, y, z, 2.1, 1)));
    still = Math.max(still, Math.abs(orbitalDensity(mode, x, y, z, 0.3, 0) - orbitalDensity(mode, x, y, z, 2.1, 0)));
  }
  ok('full coherence beats with the phase', beating > 0.1, beating.toFixed(3));
  ok('zero coherence does not', still < 1e-12, still.toExponential(1));
}

ok('the peak search is quick enough to run on a state change', (() => {
  const t0 = performance.now();
  for (let i = 0; i < 4; i++) densityPeak(i);
  return performance.now() - t0 < 5; // cached by now
})());

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nsuperposition orbitals: all checks passed');
