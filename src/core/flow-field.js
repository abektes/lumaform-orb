// Geometry for Flux — a bundle of glowing strands streaming in a travelling wave.
//
// Strands are generated once in an abstract (u, s) lattice: `u` runs along the
// flow, `s` runs across the bundle. The lattice is then mapped either to a flat
// ribbon or wrapped onto a sphere, so the wave, colour ramp and sparkle nodes are
// shared between the two layouts and only the final mapping differs.
//
// The travelling wave itself lives in the vertex shader, because displacing
// ~4,500 points on the CPU every frame costs nine times over in grid mode, where
// each cell runs its own engine instance. What is here is everything that can be
// computed once and tested without a GPU.
//
// Pure — no DOM, no Three.js — so it can be tested in Node.

// Meridians stop short of the poles in the orb layout. Running them all the way
// in converges every strand on one pixel and burns a hard knot there, the same
// problem the moiré shells have.
export const POLE_INSET = 0.07;

// The lattice: `strands` polylines of `segments` segments each.
export function buildLattice({ strands = 28, segments = 160 } = {}) {
  const strandCount = Math.max(1, Math.round(strands));
  const segCount = Math.max(1, Math.round(segments));
  const perStrand = segCount + 1;
  const pointCount = strandCount * perStrand;

  const u = new Float32Array(pointCount);
  const s = new Float32Array(pointCount);
  // A stable per-strand seed, so shader-side jitter differs per strand without
  // needing a random attribute that would change on every rebuild.
  const seed = new Float32Array(pointCount);
  // Two indices per segment, connecting consecutive points within a strand only.
  const indices = new Uint32Array(strandCount * segCount * 2);

  let ptr = 0;
  for (let i = 0; i < strandCount; i++) {
    // A single strand still sits in the middle of the band rather than at its edge.
    const sv = strandCount === 1 ? 0.5 : i / (strandCount - 1);
    const base = i * perStrand;
    for (let j = 0; j < perStrand; j++) {
      const idx = base + j;
      u[idx] = j / segCount;
      s[idx] = sv;
      seed[idx] = i * 0.6180339887 % 1;
    }
    for (let j = 0; j < segCount; j++) {
      indices[ptr++] = base + j;
      indices[ptr++] = base + j + 1;
    }
  }

  return { u, s, seed, indices, pointCount, segmentCount: strandCount * segCount, strandCount, perStrand };
}

// Flat band. `u` spans the width, `s` offsets across the band and into depth, so
// strands overlap at different z and their crossings stack additively.
export function mapRibbon(u, s, { width = 14, bandSpread = 1.1, depth = 2.2 } = {}) {
  return [
    (u - 0.5) * width,
    (s - 0.5) * bandSpread,
    (s - 0.5) * depth,
  ];
}

// Sphere. Each strand is a meridian running pole to pole, so the same travelling
// wave that ripples a ribbon lengthwise ripples the orb from pole to pole.
export function mapOrb(u, s, { radius = 2.3, twist = 0.6 } = {}) {
  const theta = (POLE_INSET + u * (1 - 2 * POLE_INSET)) * Math.PI;
  const phi = s * Math.PI * 2 + twist * u;
  const sinT = Math.sin(theta);
  return [
    radius * sinT * Math.cos(phi),
    radius * Math.cos(theta),
    radius * sinT * Math.sin(phi),
  ];
}

export function mapPoint(layout, u, s, opts) {
  return layout === 'orb' ? mapOrb(u, s, opts) : mapRibbon(u, s, opts);
}

// Which lattice points become sparkle nodes. `rng` is injectable so the choice is
// deterministic under test; a flaky geometry test is worse than none.
export function pickSparkles(pointCount, density = 0.03, rng = Math.random) {
  const total = Math.max(0, Math.floor(pointCount));
  const d = Number.isFinite(density) ? Math.min(1, Math.max(0, density)) : 0;
  const take = Math.min(total, Math.round(total * d));
  if (take <= 0) return new Uint32Array(0);

  const pool = new Uint32Array(total);
  for (let i = 0; i < total; i++) pool[i] = i;
  // Partial Fisher-Yates: unbiased, and it stops after `take` swaps.
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (total - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, take);
}

// Piecewise-linear ramp across an ordered list of [r, g, b] stops.
export function colorRamp(t, stops) {
  if (!stops || stops.length === 0) return [1, 1, 1];
  if (stops.length === 1) return [...stops[0]];

  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}
