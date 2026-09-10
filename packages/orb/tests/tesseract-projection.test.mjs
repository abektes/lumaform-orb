// The 4D viewing axis is what actually changes a tesseract's silhouette. The
// `edgeMode` options never did — every one of them was the same cell-first form
// with some of the 32 edges deleted. These guard the frame construction, because a
// basis that is not orthonormal shears the solid in a way that still looks
// plausible in motion and is very hard to spot by eye.
import assert from 'node:assert/strict';
import {
  PROJECTION_AXES,
  PROJECTION_MODES,
  orientationBasis,
  projectVertex,
  tesseractVertices,
} from '../src/engines/tesseract-projection.js';

const CUBE = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];

const verts = tesseractVertices(CUBE);
assert.equal(verts.length, 16, 'a tesseract has sixteen vertices');
assert.ok(verts.every((v) => v.every((c) => Math.abs(c) === 1)), 'all vertices are (±1)^4');
// The engine's strut edges join i to i+8, so that pairing must differ only in w.
for (let i = 0; i < 8; i++) {
  assert.deepEqual(verts[i].slice(0, 3), verts[i + 8].slice(0, 3), `vertex ${i} pairs on xyz`);
  assert.equal(verts[i][3], -verts[i + 8][3], `vertex ${i} pairs opposite in w`);
}

const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);

for (const mode of PROJECTION_MODES) {
  const B = orientationBasis(PROJECTION_AXES[mode]);
  assert.equal(B.length, 4, `${mode} yields four axes`);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const expected = i === j ? 1 : 0;
      assert.ok(Math.abs(dot(B[i], B[j]) - expected) < 1e-9,
        `${mode} basis is orthonormal (${i},${j})`);
    }
  }
  // The last axis must be the requested viewing direction.
  const dir = PROJECTION_AXES[mode];
  const len = Math.hypot(...dir);
  assert.ok(Math.abs(Math.abs(dot(B[3], dir.map((c) => c / len))) - 1) < 1e-9,
    `${mode} views down the axis it names`);
}

// Each axis must give a genuinely different silhouette, or the control is decorative.
const extents = {};
for (const mode of PROJECTION_MODES) {
  const B = orientationBasis(PROJECTION_AXES[mode]);
  const pts = verts.map((v) => projectVertex(v, B, 3, 1, [0, 0, 0]));
  extents[mode] = [0, 1, 2].map((a) =>
    Math.max(...pts.map((p) => p[a])) - Math.min(...pts.map((p) => p[a])));
  assert.ok(pts.every((p) => p.every(Number.isFinite)), `${mode} projects to finite points`);
}
// Cell-first is the only axis-aligned one: a cube, equal in all three extents.
const cell = extents.cell_first;
assert.ok(Math.abs(cell[0] - cell[1]) < 1e-9 && Math.abs(cell[1] - cell[2]) < 1e-9,
  'cell-first is isotropic');
for (const mode of PROJECTION_MODES.filter((m) => m !== 'cell_first')) {
  const spread = Math.max(...extents[mode]) - Math.min(...extents[mode]);
  const vsCell = Math.max(...extents[mode].map((v, i) => Math.abs(v - cell[i])));
  assert.ok(spread > 0.05 || vsCell > 0.05,
    `${mode} differs from cell-first (spread ${spread.toFixed(3)}, delta ${vsCell.toFixed(3)})`);
}

// A viewpoint inside the solid would turn it inside out; clamped, not inverted.
for (const mode of PROJECTION_MODES) {
  const B = orientationBasis(PROJECTION_AXES[mode]);
  const pts = verts.map((v) => projectVertex(v, B, 0, 1, [0, 0, 0]));
  assert.ok(pts.every((p) => p.every(Number.isFinite)), `${mode} survives a degenerate distance`);
}

// A garbage axis falls back rather than producing NaNs.
{
  const B = orientationBasis([0, 0, 0, 0]);
  assert.ok(B.every((a) => a.every(Number.isFinite)), 'a zero axis still yields a usable frame');
}

console.log('PASS  tesseract projection');
