const UINT_MAX = 4294967295;

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash3(x, y, z, seed) {
  let h = Math.imul(x, 0x1f123bb5)
    ^ Math.imul(y, 0x5f356495)
    ^ Math.imul(z, 0x6c8e9cf5)
    ^ Math.imul(seed, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / UINT_MAX * 2 - 1;
}

function valueNoise3(x, y, z, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);

  const x00 = lerp(hash3(ix, iy, iz, seed), hash3(ix + 1, iy, iz, seed), fx);
  const x10 = lerp(hash3(ix, iy + 1, iz, seed), hash3(ix + 1, iy + 1, iz, seed), fx);
  const x01 = lerp(hash3(ix, iy, iz + 1, seed), hash3(ix + 1, iy, iz + 1, seed), fx);
  const x11 = lerp(hash3(ix, iy + 1, iz + 1, seed), hash3(ix + 1, iy + 1, iz + 1, seed), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

function vectorPotential(x, y, z, target, offset) {
  target[offset] = valueNoise3(x, y, z, 17);
  target[offset + 1] = valueNoise3(x, y, z, 53);
  target[offset + 2] = valueNoise3(x, y, z, 101);
}

// Six samples of a deterministic vector potential give a finite-difference
// curl. A curl is divergence-free, which keeps neighbouring paths circulating
// instead of collapsing into attractors.
export function sampleCurlField(x, y, z, evolve = 0, target = new Float64Array(3), scratch = new Float64Array(18)) {
  const px = x + evolve * 0.31;
  const py = y - evolve * 0.23;
  const pz = z + evolve * 0.19;
  const h = 0.075;

  vectorPotential(px + h, py, pz, scratch, 0);
  vectorPotential(px - h, py, pz, scratch, 3);
  vectorPotential(px, py + h, pz, scratch, 6);
  vectorPotential(px, py - h, pz, scratch, 9);
  vectorPotential(px, py, pz + h, scratch, 12);
  vectorPotential(px, py, pz - h, scratch, 15);

  const inv = 1 / (2 * h);
  const dAzDy = (scratch[8] - scratch[11]) * inv;
  const dAyDz = (scratch[13] - scratch[16]) * inv;
  const dAxDz = (scratch[12] - scratch[15]) * inv;
  const dAzDx = (scratch[2] - scratch[5]) * inv;
  const dAyDx = (scratch[1] - scratch[4]) * inv;
  const dAxDy = (scratch[6] - scratch[9]) * inv;

  target[0] = dAzDy - dAyDz;
  target[1] = dAxDz - dAzDx;
  target[2] = dAyDx - dAxDy;
  return target;
}

// A stream function turns the shell flow into a surface curl. Unlike a
// projected 3D noise field, this cannot steadily compress paths into one pole.
export function sampleShellFlow(
  x,
  y,
  z,
  evolve = 0,
  fieldScale = 1,
  swirl = 0.3,
  target = new Float64Array(3)
) {
  const radius = Math.hypot(x, y, z) || 1;
  const nx = x / radius;
  const ny = y / radius;
  const nz = z / radius;
  const frequency = 1.15 + Math.max(0, fieldScale) * 1.15;
  const c1 = Math.cos(evolve * 0.43);
  const s1 = Math.sin(evolve * 0.43);
  const c2 = Math.cos(evolve * -0.31 + 1.1);
  const s2 = Math.sin(evolve * -0.31 + 1.1);
  const q = nx * c1 + nz * s1;
  const r = nz * c2 - nx * s2;
  const v = frequency * 0.72 * ny - evolve * 0.8;
  const w = frequency * (0.85 * r + 0.55 * ny) + evolve * 0.55;

  const first = 0.32 * frequency * Math.cos(frequency * q) * Math.cos(v);
  const firstY = -0.32 * frequency * 0.72
    * Math.sin(frequency * q) * Math.sin(v);
  const second = 0.18 * frequency * Math.cos(w);
  const gx = first * c1 - second * 0.85 * s2;
  const gy = 0.34 + swirl * 0.95 + firstY + second * 0.55;
  const gz = first * s1 + second * 0.85 * c2;

  target[0] = ny * gz - nz * gy;
  target[1] = nz * gx - nx * gz;
  target[2] = nx * gy - ny * gx;
  return target;
}

export function advectShellPoint(
  x,
  y,
  z,
  radius,
  distance,
  evolve,
  fieldScale,
  swirl,
  target = new Float64Array(3),
  scratch = new Float64Array(6)
) {
  sampleShellFlow(x, y, z, evolve, fieldScale, swirl, scratch);

  let mx = x + scratch[0] * distance * 0.5;
  let my = y + scratch[1] * distance * 0.5;
  let mz = z + scratch[2] * distance * 0.5;
  const midpointRadius = Math.hypot(mx, my, mz) || 1;
  mx *= radius / midpointRadius;
  my *= radius / midpointRadius;
  mz *= radius / midpointRadius;

  sampleShellFlow(mx, my, mz, evolve, fieldScale, swirl, scratch.subarray(3));
  target[0] = x + scratch[3] * distance;
  target[1] = y + scratch[4] * distance;
  target[2] = z + scratch[5] * distance;
  const nextRadius = Math.hypot(target[0], target[1], target[2]) || 1;
  target[0] *= radius / nextRadius;
  target[1] *= radius / nextRadius;
  target[2] *= radius / nextRadius;
  return target;
}

export function createTrailHistory(length, x = 0, y = 0, z = 0) {
  const history = {
    length,
    head: length - 1,
    values: new Float32Array(length * 3),
  };
  return resetTrailHistory(history, x, y, z);
}

export function resetTrailHistory(history, x, y, z) {
  for (let i = 0; i < history.length; i++) {
    const j = i * 3;
    history.values[j] = x;
    history.values[j + 1] = y;
    history.values[j + 2] = z;
  }
  history.head = history.length - 1;
  return history;
}

export function pushTrailPoint(history, x, y, z) {
  history.head = (history.head + 1) % history.length;
  const j = history.head * 3;
  history.values[j] = x;
  history.values[j + 1] = y;
  history.values[j + 2] = z;
}

export function pushTrailTowards(history, x, y, z, spacing) {
  const source = history.head * 3;
  let sx = history.values[source];
  let sy = history.values[source + 1];
  let sz = history.values[source + 2];
  let dx = x - sx;
  let dy = y - sy;
  let dz = z - sz;
  let remaining = Math.hypot(dx, dy, dz);
  let pushed = 0;

  while (remaining >= spacing && spacing > 0) {
    const t = spacing / remaining;
    sx += dx * t;
    sy += dy * t;
    sz += dz * t;
    pushTrailPoint(history, sx, sy, sz);
    pushed++;
    dx = x - sx;
    dy = y - sy;
    dz = z - sz;
    remaining = Math.hypot(dx, dy, dz);
  }
  return pushed;
}

export function writeOrderedTrail(history, target) {
  for (let i = 0; i < history.length; i++) {
    const source = ((history.head + 1 + i) % history.length) * 3;
    const destination = i * 3;
    target[destination] = history.values[source];
    target[destination + 1] = history.values[source + 1];
    target[destination + 2] = history.values[source + 2];
  }
  return target;
}

// --- latitude coverage ------------------------------------------------------
//
// The flow used to occupy the whole sphere and there was no way to say otherwise,
// so every configuration was a full shell. Constraining latitude turns the same
// field into a belt, a cap, or anything between — the difference between an orb
// that is uniformly busy and one with a clear axis.
//
// Expressed in normalized height (y / radius, i.e. sin of latitude) rather than
// in an angle, because equal steps in that measure are equal steps in surface
// area: a band of a given width covers the same amount of shell wherever it sits.

// `coverage` is the half-width of the band, so 1 spans the whole sphere and 0.15
// is a narrow belt. `center` places it: 0 is the equator, ±1 the poles.
export function bandLimits(coverage = 1, center = 0) {
  const half = Math.min(1, Math.max(0.02, Number.isFinite(coverage) ? coverage : 1));
  const mid = Math.min(1, Math.max(-1, Number.isFinite(center) ? center : 0));
  return { lo: Math.max(-1, mid - half), hi: Math.min(1, mid + half) };
}

// Pulls a point back toward the band rather than clamping it there. A hard clamp
// makes streams pile up on the boundary in a visible line; easing them back lets
// the curl field keep carrying them along it. `strength` is the fraction of the
// remaining error to remove this step — pass dt * stiffness, already clamped.
export function constrainToBand(x, y, z, radius, lo, hi, strength, target = new Float64Array(3)) {
  const r = Number.isFinite(radius) && radius > 0 ? radius : (Math.hypot(x, y, z) || 1);
  const ny = Math.min(1, Math.max(-1, y / r));
  const bounded = Math.min(hi, Math.max(lo, ny));

  const k = Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 0));
  const nextNy = ny + (bounded - ny) * k;

  // Rescale the horizontal component so the point stays on the shell instead of
  // cutting a chord through it as its height changes.
  const ringNow = Math.sqrt(Math.max(0, 1 - ny * ny));
  const ringNext = Math.sqrt(Math.max(0, 1 - nextNy * nextNy));
  // At the pole the horizontal component is zero and its direction is undefined;
  // nudging off-axis gives the rescale something to preserve.
  const scale = ringNow > 1e-6 ? ringNext / ringNow : 0;

  target[0] = ringNow > 1e-6 ? x * scale : ringNext * r;
  target[1] = nextNy * r;
  target[2] = ringNow > 1e-6 ? z * scale : 0;
  return target;
}
