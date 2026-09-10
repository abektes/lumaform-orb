import {
  ARC_STEPS,
  RING_STEPS,
  beatFrequency,
  shellSegmentCount,
  buildShell,
  resolveShells,
} from '../../orb/src/core/moire-sphere.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// --- counts ---
ok('segment count is meridians*arc + latitudes*ring',
  shellSegmentCount(28, 8) === 28 * ARC_STEPS + 8 * RING_STEPS);
ok('no latitudes means meridians only', shellSegmentCount(28, 0) === 28 * ARC_STEPS);
ok('zero meridians is legal', shellSegmentCount(0, 0) === 0);
ok('counts round rather than throw', shellSegmentCount(27.6, 8.2) === 28 * ARC_STEPS + 8 * RING_STEPS);

// --- buffer shape ---
const shell = buildShell({ meridians: 12, latitudes: 4, radius: 2 });
ok('buffer is 6 floats per segment', shell.length === shellSegmentCount(12, 4) * 6);
ok('buffer is a Float32Array', shell instanceof Float32Array);
ok('every value is finite', shell.every ? shell.every(Number.isFinite) : Array.from(shell).every(Number.isFinite));

// --- everything sits on the sphere ---
ok('all points lie on the requested radius', (() => {
  const r = 2;
  for (let i = 0; i < shell.length; i += 3) {
    const d = Math.hypot(shell[i], shell[i + 1], shell[i + 2]);
    if (Math.abs(d - r) > 1e-4) return false;
  }
  return true;
})());
ok('radius scales the shell', (() => {
  const a = buildShell({ meridians: 6, latitudes: 0, radius: 1 });
  const b = buildShell({ meridians: 6, latitudes: 0, radius: 3 });
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] * 3 - b[i]) > 1e-4) return false;
  }
  return true;
})());

// --- twist is chiral: it must actually change the geometry, and asymmetrically ---
ok('twist changes the shell', (() => {
  const a = buildShell({ meridians: 8, latitudes: 0, radius: 1, twist: 0 });
  const b = buildShell({ meridians: 8, latitudes: 0, radius: 1, twist: 0.7 });
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return true;
  return false;
})());
ok('opposite twists are not identical (chirality)', (() => {
  const l = buildShell({ meridians: 8, latitudes: 0, radius: 1, twist: 0.7 });
  const r = buildShell({ meridians: 8, latitudes: 0, radius: 1, twist: -0.7 });
  for (let i = 0; i < l.length; i++) if (Math.abs(l[i] - r[i]) > 1e-6) return true;
  return false;
})());
ok('twist still leaves every point on the sphere', (() => {
  const s = buildShell({ meridians: 8, latitudes: 3, radius: 1.5, twist: 1.2 });
  for (let i = 0; i < s.length; i += 3) {
    if (Math.abs(Math.hypot(s[i], s[i + 1], s[i + 2]) - 1.5) > 1e-4) return false;
  }
  return true;
})());
ok('phase rotates without deforming', (() => {
  const a = buildShell({ meridians: 8, latitudes: 0, radius: 1, phase: 0 });
  const b = buildShell({ meridians: 8, latitudes: 0, radius: 1, phase: 0.3 });
  // Same radii, same y values — a phase shift is a spin about Y.
  for (let i = 0; i < a.length; i += 3) {
    if (Math.abs(a[i + 1] - b[i + 1]) > 1e-6) return false;
  }
  return true;
})());

// --- latitude rings avoid the degenerate poles ---
ok('no latitude ring collapses to a point', (() => {
  const s = buildShell({ meridians: 0, latitudes: 5, radius: 1 });
  for (let i = 0; i < s.length; i += 6) {
    const d = Math.hypot(s[i] - s[i + 3], s[i + 1] - s[i + 4], s[i + 2] - s[i + 5]);
    if (d < 1e-6) return false;
  }
  return true;
})());

// --- meridians must not converge on the poles ---
ok('meridian endpoints stay clear of both poles', (() => {
  const s = buildShell({ meridians: 16, latitudes: 0, radius: 1 });
  let maxAbsY = 0;
  for (let i = 0; i < s.length; i += 3) maxAbsY = Math.max(maxAbsY, Math.abs(s[i + 1]));
  // cos(0.06*PI) ~ 0.982; anything at 1.0 means lines reach the pole itself.
  return maxAbsY < 0.99;
})());
ok('distinct meridians stay distinct at their closest point', (() => {
  const s = buildShell({ meridians: 8, latitudes: 0, radius: 1, twist: 0 });
  // First vertex of meridian 0 and of meridian 1 must not coincide.
  const perMeridian = ARC_STEPS * 6;
  const d = Math.hypot(s[0] - s[perMeridian], s[1] - s[perMeridian + 1], s[2] - s[perMeridian + 2]);
  return d > 1e-3;
})());

// --- the beat is the whole point ---
ok('beat is the meridian difference', beatFrequency(32, 34) === 2);
ok('beat is unsigned', beatFrequency(34, 32) === 2);
ok('equal grids have no beat', beatFrequency(32, 32) === 0);

const shells = resolveShells({ meridians: 32, beatOffset: 2 });
ok('inner shell carries the offset', shells.inner.meridians === 34 && shells.outer.meridians === 32);
ok('resolved beat matches', shells.beat === 2);
ok('meridian_beat has no latitude rings', shells.outer.latitudes === 0);
ok('lattice_beat adds latitude rings',
  resolveShells({ archetype: 'lattice_beat', latitudes: 8 }).outer.latitudes === 8);
ok('a negative offset still yields a valid shell',
  resolveShells({ meridians: 10, beatOffset: -4 }).inner.meridians === 6);
ok('offsets cannot drive meridians below 3',
  resolveShells({ meridians: 4, beatOffset: -20 }).inner.meridians === 3);
ok('meridians cannot fall below 3', resolveShells({ meridians: 0 }).outer.meridians === 3);

// --- cost guard: the default must stay affordable ---
const defaultCost = shellSegmentCount(28, 0) + shellSegmentCount(30, 0);
ok('default two-shell cost is under 2500 segments', defaultCost < 2500, String(defaultCost));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
