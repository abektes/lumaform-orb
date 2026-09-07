// Choosing how to look at a tesseract.
//
// The engine already holds all sixteen (±1, ±1, ±1, ±1) vertices, but it only ever
// viewed them down the w axis — the cell-first Schlegel diagram, i.e. the nested
// cubes everyone has seen. The `edgeMode` options did not change that: every one of
// them was the same form with some of the 32 edges deleted, so "Edge Architecture"
// offered five subtractions and no actual alternative.
//
// The real geometric decision for a 4D solid is which direction you look down,
// because that changes the silhouette rather than the line count:
//
//   cell-first    nested cubes            (the classic)
//   face-first    hexagonal outline
//   edge-first    elongated, chiral
//   vertex-first  a rhombic dodecahedron  (the shadow a tesseract actually casts)
//
// Pure — no DOM, no Three.js — so it can be exercised directly in node.

// The direction in 4-space aligned with the viewing axis. Not normalized here;
// orientationBasis does that.
export const PROJECTION_AXES = {
  cell_first: [0, 0, 0, 1],
  face_first: [0, 0, 1, 1],
  edge_first: [0, 1, 1, 1],
  vertex_first: [1, 1, 1, 1],
};

export const PROJECTION_MODES = Object.keys(PROJECTION_AXES);

function dot4(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function normalize4(v) {
  const length = Math.hypot(v[0], v[1], v[2], v[3]);
  if (!(length > 1e-9)) return [0, 0, 0, 1];
  return [v[0] / length, v[1] / length, v[2] / length, v[3] / length];
}

// An orthonormal 4D frame whose *last* axis is `dir`. Projecting a vertex onto the
// first three axes is then exactly "view this solid down dir".
//
// Gram-Schmidt against the standard basis. Four candidates for three slots means one
// is always discarded as degenerate — which one depends on dir, so they are tried in
// order and the first three that survive are kept.
export function orientationBasis(dir) {
  const w = normalize4(dir);
  const axes = [];

  for (const candidate of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {
    if (axes.length === 3) break;
    const v = [...candidate];
    for (const basis of [w, ...axes]) {
      const projection = dot4(v, basis);
      v[0] -= projection * basis[0];
      v[1] -= projection * basis[1];
      v[2] -= projection * basis[2];
      v[3] -= projection * basis[3];
    }
    // Anything shorter than this is the candidate that lay in the span already.
    if (Math.hypot(v[0], v[1], v[2], v[3]) > 1e-6) axes.push(normalize4(v));
  }

  return [...axes, w];
}

// The sixteen vertices, ordered so index i and i+8 are the pair that differ only in
// w. The engine's strut edges rely on that pairing.
export function tesseractVertices(cube) {
  const out = [];
  for (const w of [1, -1]) {
    for (const corner of cube) out.push([corner[0], corner[1], corner[2], w]);
  }
  return out;
}

// Perspective projection along the basis' last axis. `distance` is how far the 4D
// viewpoint sits beyond the solid: large is nearly orthographic, small exaggerates
// the near cell. Below the solid's own extent it would turn inside out, so it is
// clamped rather than allowed to invert.
export function projectVertex(v4, basis, distance, scale, out = [0, 0, 0]) {
  const w = dot4(v4, basis[3]);
  const safeDistance = Math.max(distance, 1.05);
  const factor = scale / Math.max(safeDistance - w, 0.25);
  out[0] = dot4(v4, basis[0]) * factor;
  out[1] = dot4(v4, basis[1]) * factor;
  out[2] = dot4(v4, basis[2]) * factor;
  return out;
}
