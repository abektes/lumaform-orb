// Where to put the camera so an engine reads as an orb.
//
// Every engine used to be viewed from a hardcoded z = 7.5 at fov 45, which gave
// a 2.9x spread in how much of the frame they filled: Hopf overflowed and was
// cropped (1.34 of the visible half-height) while Singularity sat at 0.46 and
// looked like a distant marble. Nothing was framed on purpose.
//
// An engine now declares the world-space radius it wants to occupy and the
// camera is derived from it, so "how big is this thing" is a property of the
// engine rather than a constant nobody revisited.
//
// Pure — no DOM, no Three.js — so it can be tested in Node.

// Leaves a margin around the orb. 1.0 would put the bounding sphere exactly on
// the frame edge, which crops as soon as anything breathes or rotates.
export const DEFAULT_FRAME_FILL = 0.8;

// Used when an engine declares no radius. Close to the old behaviour at z = 7.5,
// so an engine that opts out is not visibly re-framed.
export const DEFAULT_FRAME_RADIUS = 2.5;

export function visibleHalfHeight(distance, fovDegrees) {
  return Math.tan((fovDegrees * Math.PI / 180) / 2) * distance;
}

// `aspect` is width / height. The field of view is vertical, so in a view
// narrower than it is tall the half-width is the smaller extent and has to be
// the one filled; fitting the height alone ran a portrait orb off both sides.
export function cameraDistanceForRadius(radius, fovDegrees, fill = DEFAULT_FRAME_FILL, aspect = 1) {
  const r = Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_FRAME_RADIUS;
  const f = Number.isFinite(fill) && fill > 0 ? Math.min(fill, 1) : DEFAULT_FRAME_FILL;
  const narrow = Number.isFinite(aspect) && aspect > 0 ? Math.min(aspect, 1) : 1;
  const halfFov = (fovDegrees * Math.PI / 180) / 2;
  return r / (f * Math.tan(halfFov) * narrow);
}

// The fraction of the visible half-height a radius occupies at a distance. This
// is the number the framing survey measures, so keeping it here means the check
// and the derivation cannot drift apart.
export function frameFill(radius, distance, fovDegrees) {
  const half = visibleHalfHeight(distance, fovDegrees);
  return half > 0 ? radius / half : Infinity;
}

// Reads the optional `frame` hint off an engine instance. Engines are plain
// factories and most predate this, so an absent or malformed hint must fall back
// rather than throw.
export function engineFrameRadius(engine) {
  const radius = engine?.frame?.radius;
  return Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_FRAME_RADIUS;
}
