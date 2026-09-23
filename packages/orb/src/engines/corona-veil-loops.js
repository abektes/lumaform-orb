// Where Corona Veil's coronal loops stand. Pure maths, no Three.js, so the
// arrangement can be tested in Node.
//
// Loops form a crown around the silhouette, arranged in the viewer's frame by
// the vertex shader. They were first spread over the whole sphere, and most
// then sat behind the core or face-on against it, reading as small hooks and
// scratches. A loop is only striking at the limb, where it arches against
// black — the prominences of an eclipse photograph.
//
// Per loop:
//   angle  — where around the limb it stands, 0..2π
//   depth  — how far it tips toward (+) or away from (−) the viewer, so the
//            crown has depth instead of lying flat in one plane
//   lean   — rotation of its footpoint line away from the limb direction, so
//            arches are not all perfectly in profile
//   span   — half the angle between its footpoints
//   height — rise relative to the engine maximum

export const LOOP_SPAN_RANGE = [0.22, 0.42];
export const LOOP_HEIGHT_RANGE = [0.6, 1];
export const LOOP_DEPTH_RANGE = [-0.35, 0.35];
export const LOOP_LEAN_RANGE = [-0.35, 0.35];

// Deterministic [0, 1): the same count always gives the same crown.
function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function within([lo, hi], t) {
  return lo + (hi - lo) * t;
}

export function coronaLoopFrames(count) {
  const n = Math.max(1, Math.round(count));
  const slot = (Math.PI * 2) / n;
  const frames = [];
  for (let i = 0; i < n; i++) {
    // Evenly spaced slots, each jittered by up to a quarter slot either way,
    // so the crown is irregular without ever bunching or leaving a hole.
    const jitter = (hash01(i + 3) - 0.5) * 0.5;
    frames.push({
      angle: (i + 0.5 + jitter) * slot,
      depth: within(LOOP_DEPTH_RANGE, hash01(i + 29)),
      lean: within(LOOP_LEAN_RANGE, hash01(i + 53)),
      span: within(LOOP_SPAN_RANGE, hash01(i + 17)),
      height: within(LOOP_HEIGHT_RANGE, hash01(i + 41)),
    });
  }
  return frames;
}
