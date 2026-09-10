// Geometry for a moiré orb: two nested spherical line grids.
//
// The engine used to draw one square rim ruled to a recessed aperture, which
// collapsed to a flat panel head-on and was not an orb at all. It also was not
// really a moiré — the pattern was ruled string art, not interference.
//
// A moiré is what you get when two grids of slightly different pitch overlap.
// Two spheres of meridians, one with a few more lines than the other, produce
// real interference fringes; counter-rotating them makes the fringes travel.
// Because that is a rotation, the vertex data never changes after it is built —
// the old engine rebuilt its whole buffer every frame on the CPU.
//
// Pure — no DOM, no Three.js — so it can be tested in Node.

// Samples along each meridian from pole to pole. Enough that a great circle
// reads as a curve rather than a polygon at the default frame size.
export const ARC_STEPS = 40;
// Samples around each latitude ring.
export const RING_STEPS = 64;

// Meridians stop short of the poles. Running them all the way in makes every
// line converge on one pixel, which renders as a hard bright knot at each pole
// and swamps the fringes near it. Leaving a small aperture also drops the most
// densely overlapping segments, so it is cheaper as well as cleaner.
export const POLE_INSET = 0.06;

export function beatFrequency(outerMeridians, innerMeridians) {
  return Math.abs(Math.round(outerMeridians) - Math.round(innerMeridians));
}

// Number of line segments a shell will produce, so a caller can size buffers or
// assert on cost without building the geometry.
export function shellSegmentCount(meridians, latitudes) {
  const m = Math.max(0, Math.round(meridians));
  const l = Math.max(0, Math.round(latitudes));
  return m * ARC_STEPS + l * RING_STEPS;
}

// One spherical grid. `twist` shears each meridian by an angle proportional to
// its polar position, turning straight meridians into helices — this is the
// "chiral" in Chiral Moiré, and it makes the interference asymmetric.
//
// Returns a flat Float32Array of segment endpoints: x1,y1,z1,x2,y2,z2 per
// segment, which is the layout LineSegmentsGeometry.setPositions expects.
export function buildShell({
  meridians = 28,
  latitudes = 8,
  radius = 1,
  twist = 0,
  phase = 0,
} = {}) {
  const m = Math.max(0, Math.round(meridians));
  const l = Math.max(0, Math.round(latitudes));
  const out = new Float32Array(shellSegmentCount(m, l) * 6);
  let o = 0;

  const point = (theta, phi) => {
    // The twist grows with polar angle, so the two poles stay fixed and the
    // shear is greatest at the equator where the lines are furthest apart.
    const a = phi + phase + twist * Math.cos(theta);
    const sinT = Math.sin(theta);
    return [radius * sinT * Math.cos(a), radius * Math.cos(theta), radius * sinT * Math.sin(a)];
  };

  for (let i = 0; i < m; i++) {
    const phi = (i / m) * Math.PI * 2;
    const tMin = POLE_INSET * Math.PI;
    const tSpan = Math.PI - 2 * tMin;
    for (let stepIdx = 0; stepIdx < ARC_STEPS; stepIdx++) {
      const t0 = tMin + (stepIdx / ARC_STEPS) * tSpan;
      const t1 = tMin + ((stepIdx + 1) / ARC_STEPS) * tSpan;
      const p0 = point(t0, phi);
      const p1 = point(t1, phi);
      out[o++] = p0[0]; out[o++] = p0[1]; out[o++] = p0[2];
      out[o++] = p1[0]; out[o++] = p1[1]; out[o++] = p1[2];
    }
  }

  for (let j = 0; j < l; j++) {
    // Skipping the poles: a ring at theta 0 or PI is a degenerate point.
    const theta = ((j + 1) / (l + 1)) * Math.PI;
    for (let stepIdx = 0; stepIdx < RING_STEPS; stepIdx++) {
      const a0 = (stepIdx / RING_STEPS) * Math.PI * 2;
      const a1 = ((stepIdx + 1) / RING_STEPS) * Math.PI * 2;
      const p0 = point(theta, a0);
      const p1 = point(theta, a1);
      out[o++] = p0[0]; out[o++] = p0[1]; out[o++] = p0[2];
      out[o++] = p1[0]; out[o++] = p1[1]; out[o++] = p1[2];
    }
  }

  return out;
}

// Resolves the two shells from user-facing parameters. Kept separate from
// buildShell so the "what does the inner shell look like" decision is testable
// without generating vertices.
export function resolveShells({ meridians = 28, beatOffset = 2, latitudes = 8, archetype = 'meridian_beat' } = {}) {
  const outerMeridians = Math.max(3, Math.round(meridians));
  const innerMeridians = Math.max(3, outerMeridians + Math.round(beatOffset));
  // Meridians alone give the cleanest fringes; latitude rings add a second
  // interference axis, which reads as a woven lattice rather than banding.
  const lat = archetype === 'lattice_beat' ? Math.max(0, Math.round(latitudes)) : 0;
  return {
    outer: { meridians: outerMeridians, latitudes: lat },
    inner: { meridians: innerMeridians, latitudes: lat },
    beat: beatFrequency(outerMeridians, innerMeridians),
  };
}
