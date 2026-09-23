export const RING_LAYOUTS = ['circle', 'iris', 'ellipse', 'globe'];

const ELLIPSE_ASPECT = 0.58;
const IRIS_BLADES = 6;
const IRIS_SCALLOP = 0.18;
const GLOBE_POLE_MARGIN = 0.3;

export function resolveRingLayout(layout) {
  return RING_LAYOUTS.includes(layout) ? layout : 'circle';
}

export function ringRest(layout, ringNorm, baseRadius, depth) {
  const R = Math.max(1e-5, baseRadius);
  const n = Math.min(1, Math.max(0, ringNorm));
  const resolved = resolveRingLayout(layout);

  switch (resolved) {
    case 'globe':
      // Symmetric about the equator. This used to be 0.28 + n·1.05, which
      // stopped at 76° from the pole and drew a dome in the top half of the
      // frame instead of a globe.
      return {
        radius: R,
        zOffset: 0,
        phi: GLOBE_POLE_MARGIN + n * (Math.PI - 2 * GLOBE_POLE_MARGIN),
      };
    case 'circle':
    case 'iris':
    case 'ellipse':
      return {
        radius: R * (0.35 + n * 0.75),
        zOffset: (Math.pow(n, 1.5) - 0.5) * depth,
        phi: 0,
      };
    default:
      return {
        radius: R * (0.35 + n * 0.75),
        zOffset: (Math.pow(n, 1.5) - 0.5) * depth,
        phi: 0,
      };
  }
}

export function sampleRingPoint(layout, theta, rest, radiusScale = 1) {
  const scale = Number.isFinite(radiusScale) ? radiusScale : 1;
  const r = rest.radius * scale;
  const z = rest.zOffset;
  const resolved = resolveRingLayout(layout);

  switch (resolved) {
    case 'ellipse':
      return [r * Math.cos(theta), r * ELLIPSE_ASPECT * Math.sin(theta), z];
    case 'iris': {
      const scallop = 1 + IRIS_SCALLOP * Math.cos(theta * IRIS_BLADES);
      return [r * scallop * Math.cos(theta), r * scallop * Math.sin(theta), z];
    }
    case 'globe': {
      const phi = rest.phi;
      const sinPhi = Math.sin(phi);
      return [
        r * sinPhi * Math.cos(theta),
        r * Math.cos(phi),
        r * sinPhi * Math.sin(theta),
      ];
    }
    case 'circle':
    default:
      return [r * Math.cos(theta), r * Math.sin(theta), z];
  }
}

// Integer hash → [0, 1). Deterministic, so a given clock always produces the
// same syllable and two cells with the same parameters speak identically.
function hash01(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// How far the glottal slit is open, 0..1, at a syllable clock (one unit per
// syllable). Speech is not a sine: each syllable opens quickly, holds, and
// closes more slowly, peaks vary, and roughly one in five is a closure — the
// stop consonants that make an opening read as articulation rather than
// breathing. Continuous across syllable boundaries because every syllable
// starts and ends shut.
export function syllableOpening(clock) {
  const index = Math.floor(clock);
  const f = clock - index;
  const roll = hash01(index);
  const peak = roll < 0.2 ? 0.04 : 0.35 + 0.65 * hash01(index + 7919);
  const envelope = smoothstep(0, 0.22, f) * (1 - smoothstep(0.55, 1, f));
  return peak * envelope;
}
