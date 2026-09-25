// The wavefunctions Superposition draws, in plain JS: tested in Node, used to
// normalise the cloud, and used to pick where a measurement lands.
// SUPERPOSITION_VERTEX_SHADER evaluates the same four states; keep the two in
// step.
//
// Each state is two eigenstates, ψ1 and ψ2, held in superposition; ψ2 carries
// the advancing phase. Directions are unit vectors with y up, as in the scene.

export const ORBITAL_MODES = ['hybrid_sp', 'd_orbital', 'f_orbital', 'chiral_vortex'];

export function modeIndex(mode) {
  const i = ORBITAL_MODES.indexOf(mode);
  return i < 0 ? 1 : i;
}

// [ψ1.re, ψ1.im, ψ2.re, ψ2.im] for a direction and phase.
export function eigenstates(mode, x, y, z, phase) {
  const c = Math.max(-0.999, Math.min(0.999, y));
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  const phi = Math.atan2(z, x);
  const cp = Math.cos(phase);
  const sp = Math.sin(phase);
  if (mode === 0) {
    // The two sp hybrids, s + p and s − p. Their interference beats between
    // pure s (a sphere) and pure p (a dumbbell) as the phase turns.
    const pz = c * 1.2;
    const minus = 0.6 - pz;
    return [0.6 + pz, 0, minus * cp, minus * sp];
  }
  if (mode === 1) {
    // d_z² (collar and polar lobes) against d_x²−y² (four-leaf clover).
    const dz2 = (3 * c * c - 1) * 0.7;
    const dx2y2 = s * s * Math.cos(2 * phi) * 1.1;
    return [dz2, 0, dx2y2 * cp, dx2y2 * sp];
  }
  if (mode === 2) {
    // Two f states: an axial octupole against a four-lobed ring pair.
    const f1 = c * (5 * c * c - 3) * 0.6;
    const f2 = s * s * c * Math.sin(2 * phi) * 1.5;
    return [f1, 0, f2 * cp, f2 * sp];
  }
  // Angular momentum 2 against 3 around the equator: their interference is a
  // single crescent that winds round as the phase advances.
  const ring = s * 0.9;
  return [ring * Math.cos(2 * phi), ring * Math.sin(2 * phi), ring * Math.cos(3 * phi + phase), ring * Math.sin(3 * phi + phase)];
}

// |ψ1 + ψ2|² / 4, with the interference term scaled by coherence. Coherence 1
// is a pure superposition that beats; 0 is a classical mixture, the two
// densities simply added, which no longer depends on the phase at all.
export function orbitalDensity(mode, x, y, z, phase, coherence = 1) {
  const [a, b, c, d] = eigenstates(mode, x, y, z, phase);
  return (a * a + b * b + c * c + d * d + 2 * coherence * (a * c + b * d)) / 4;
}

const peaks = new Map();

// The largest density a state reaches over every direction and a full phase
// cycle, at full coherence. Dividing by it puts every state's lobes on the same
// 0..1 scale, so switching state does not change the orb's size.
export function densityPeak(mode) {
  if (peaks.has(mode)) return peaks.get(mode);
  let peak = 0;
  // Coarse on purpose: this runs when the state changes, and a 16 ms search
  // is a dropped frame. The peak it misses is a few percent, which the
  // shader's clamp absorbs.
  const rings = 32;
  const sectors = 64;
  const phases = 12;
  for (let i = 0; i <= rings; i++) {
    const y = Math.cos((i / rings) * Math.PI);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * Math.PI * 2;
      for (let k = 0; k < phases; k++) {
        peak = Math.max(peak, orbitalDensity(mode, r * Math.cos(a), y, r * Math.sin(a), (k / phases) * Math.PI * 2));
      }
    }
  }
  peaks.set(mode, peak);
  return peak;
}

// Where a measurement lands: a direction drawn with probability proportional
// to the density there (the Born rule), by rejection against the peak. A
// uniform pick would often land in a node, where the cloud has nothing.
export function sampleMeasurement(mode, phase, coherence = 1, random = Math.random) {
  const peak = densityPeak(mode);
  let best = null;
  let bestDensity = -1;
  for (let attempt = 0; attempt < 256; attempt++) {
    const y = random() * 2 - 1;
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const dir = [r * Math.cos(a), y, r * Math.sin(a)];
    const density = orbitalDensity(mode, dir[0], dir[1], dir[2], phase, coherence);
    if (random() * peak < density) return dir;
    if (density > bestDensity) {
      bestDensity = density;
      best = dir;
    }
  }
  return best;
}
