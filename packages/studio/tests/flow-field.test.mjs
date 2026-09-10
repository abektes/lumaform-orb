import {
  POLE_INSET,
  buildLattice,
  mapRibbon,
  mapOrb,
  mapPoint,
  pickSparkles,
  colorRamp,
} from '../../orb/src/core/flow-field.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --- lattice counts ---
const L = buildLattice({ strands: 6, segments: 10 });
ok('points are strands x (segments + 1)', L.pointCount === 6 * 11);
ok('segments are strands x segments', L.segmentCount === 6 * 10);
ok('two indices per segment', L.indices.length === 6 * 10 * 2);
ok('attribute arrays match the point count', L.u.length === L.pointCount && L.s.length === L.pointCount && L.seed.length === L.pointCount);
ok('rounds non-integer inputs', buildLattice({ strands: 5.6, segments: 9.7 }).strandCount === 6);
ok('never degenerates below one strand', buildLattice({ strands: 0, segments: 0 }).segmentCount === 1);

// --- ranges ---
ok('u spans 0..1 inclusive', (() => {
  let min = Infinity, max = -Infinity;
  for (const v of L.u) { min = Math.min(min, v); max = Math.max(max, v); }
  return min === 0 && max === 1;
})());
ok('s stays within 0..1', (() => {
  for (const v of L.s) if (v < 0 || v > 1) return false;
  return true;
})());
ok('a single strand sits mid-band', buildLattice({ strands: 1, segments: 4 }).s.every((v) => v === 0.5));

// --- indices connect within a strand, never across ---
ok('segments never join two different strands', (() => {
  for (let i = 0; i < L.indices.length; i += 2) {
    const a = L.indices[i], b = L.indices[i + 1];
    if (L.s[a] !== L.s[b]) return false;   // same strand => same s
    if (b - a !== 1) return false;         // consecutive samples
  }
  return true;
})());
ok('every index is in range', (() => {
  for (const i of L.indices) if (i < 0 || i >= L.pointCount) return false;
  return true;
})());

// --- mappings ---
ok('ribbon positions are finite', (() => {
  for (let i = 0; i < L.pointCount; i++) {
    const p = mapRibbon(L.u[i], L.s[i]);
    if (!p.every(Number.isFinite)) return false;
  }
  return true;
})());
ok('ribbon spans the requested width', (() => {
  const a = mapRibbon(0, 0.5, { width: 14 });
  const b = mapRibbon(1, 0.5, { width: 14 });
  return Math.abs((b[0] - a[0]) - 14) < 1e-6;
})());
ok('ribbon separates strands in depth', (() => {
  const a = mapRibbon(0.5, 0, { depth: 2.2 });
  const b = mapRibbon(0.5, 1, { depth: 2.2 });
  return Math.abs((b[2] - a[2]) - 2.2) < 1e-6;
})());

ok('orb positions are finite', (() => {
  for (let i = 0; i < L.pointCount; i++) {
    if (!mapOrb(L.u[i], L.s[i]).every(Number.isFinite)) return false;
  }
  return true;
})());
ok('every orb point lies on the sphere', (() => {
  for (let i = 0; i < L.pointCount; i++) {
    const p = mapOrb(L.u[i], L.s[i], { radius: 2.3 });
    if (Math.abs(Math.hypot(p[0], p[1], p[2]) - 2.3) > 1e-4) return false;
  }
  return true;
})());
ok('orb strands stay clear of both poles', (() => {
  const limit = Math.cos(POLE_INSET * Math.PI) * 2.3;
  for (let i = 0; i < L.pointCount; i++) {
    if (Math.abs(mapOrb(L.u[i], L.s[i], { radius: 2.3 })[1]) > limit + 1e-6) return false;
  }
  return true;
})());
ok('distinct orb strands stay distinct', (() => {
  const a = mapOrb(0.5, 0.0, { twist: 0 });
  const b = mapOrb(0.5, 1 / 6, { twist: 0 });
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-3;
})());
ok('twist shears the orb strands', (() => {
  const a = mapOrb(0.8, 0.3, { twist: 0 });
  const b = mapOrb(0.8, 0.3, { twist: 1.2 });
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-3;
})());
ok('twist keeps points on the sphere', (() => {
  const p = mapOrb(0.4, 0.7, { radius: 2.3, twist: 1.4 });
  return Math.abs(Math.hypot(p[0], p[1], p[2]) - 2.3) < 1e-4;
})());

ok('mapPoint dispatches on layout', (() => {
  const o = mapPoint('orb', 0.3, 0.4);
  const r = mapPoint('ribbon', 0.3, 0.4);
  return JSON.stringify(o) === JSON.stringify(mapOrb(0.3, 0.4))
    && JSON.stringify(r) === JSON.stringify(mapRibbon(0.3, 0.4));
})());
ok('an unknown layout falls back to ribbon',
  JSON.stringify(mapPoint('nope', 0.2, 0.6)) === JSON.stringify(mapRibbon(0.2, 0.6)));

// --- sparkles ---
ok('sparkle count follows density', pickSparkles(1000, 0.03, seeded(1)).length === 30);
ok('zero density picks none', pickSparkles(1000, 0, seeded(1)).length === 0);
ok('full density picks all', pickSparkles(100, 1, seeded(1)).length === 100);
ok('density is clamped above 1', pickSparkles(100, 4, seeded(1)).length === 100);
ok('negative density picks none', pickSparkles(100, -1, seeded(1)).length === 0);
ok('sparkles never repeat', (() => {
  for (let i = 0; i < 50; i++) {
    const picked = pickSparkles(500, 0.1, seeded(i));
    if (new Set(picked).size !== picked.length) return false;
  }
  return true;
})());
ok('sparkle indices are in range', (() => {
  const picked = pickSparkles(500, 0.2, seeded(3));
  for (const i of picked) if (i < 0 || i >= 500) return false;
  return true;
})());
ok('the same seed picks the same sparkles',
  pickSparkles(500, 0.1, seeded(9)).join(',') === pickSparkles(500, 0.1, seeded(9)).join(','));
ok('different seeds eventually differ', (() => {
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(pickSparkles(500, 0.02, seeded(i)).join(','));
  return seen.size > 5;
})());

// --- colour ramp ---
const MAGENTA = [1, 0.25, 0.85];
const VIOLET = [0.65, 0.45, 1];
const BLUE = [0.3, 0.75, 1];
const STOPS = [MAGENTA, VIOLET, BLUE];
ok('t=0 is the first stop', colorRamp(0, STOPS).every((v, i) => Math.abs(v - MAGENTA[i]) < 1e-9));
ok('t=1 is the last stop', colorRamp(1, STOPS).every((v, i) => Math.abs(v - BLUE[i]) < 1e-9));
ok('t=0.5 hits the middle stop exactly', colorRamp(0.5, STOPS).every((v, i) => Math.abs(v - VIOLET[i]) < 1e-9));
ok('interpolates between stops', (() => {
  const c = colorRamp(0.25, STOPS);
  return c.every((v, i) => Math.abs(v - (MAGENTA[i] + (VIOLET[i] - MAGENTA[i]) * 0.5)) < 1e-9);
})());
ok('stays in gamut across the range', (() => {
  for (let t = 0; t <= 1.0001; t += 0.01) {
    if (colorRamp(t, STOPS).some((v) => v < 0 || v > 1)) return false;
  }
  return true;
})());
ok('clamps t below 0', colorRamp(-2, STOPS).join() === MAGENTA.join());
ok('clamps t above 1', colorRamp(3, STOPS).join() === BLUE.join());
ok('a single stop is constant', colorRamp(0.7, [VIOLET]).join() === VIOLET.join());
ok('no stops does not throw', Array.isArray(colorRamp(0.5, [])));
ok('NaN t is treated as 0', colorRamp(NaN, STOPS).join() === MAGENTA.join());

// --- cost guard ---
const cost = buildLattice({ strands: 28, segments: 160 });
ok('default lattice stays under 6000 segments', cost.segmentCount < 6000, String(cost.segmentCount));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
