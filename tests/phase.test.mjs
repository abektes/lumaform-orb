// Guards the fix for float32 decay in shader time uniforms.
//
// `studio.virtualTime` accumulates without bound. JS numbers are float64 so the
// accumulator itself stays exact, but every `uniforms.uTime.value = time` hands
// the number to a float32 uniform, and float32 resolution is *relative*: the
// larger the value, the coarser the smallest representable step. Past roughly
// ten hours a 16.67 ms frame advance can no longer be represented evenly, and
// past a week most frames advance by nothing at all — motion stops flowing and
// starts lurching, at unchanged FPS.
//
// A naive wrap of virtualTime itself is not available: several engines multiply
// time by a per-fragment rate (singularity's Keplerian shear) or feed it into an
// aperiodic noise domain (aqueous fbm drift, nebula's particle hash lattice),
// and those jump at any wrap period. What *is* exactly seamless is wrapping an
// accumulated phase for terms that are already TAU-periodic, which is what
// `advancePhase` does.
import { TAU, advancePhase, createPhaseTracker } from '../src/core/phase.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const FRAME = 1 / 60;
const DAY = 86400;

// --- the wrap keeps the value permanently small ---

{
  let phase = 0;
  let inRange = true;
  for (let i = 0; i < 500000; i++) {
    phase = advancePhase(phase, FRAME, 0.85);
    if (!(phase >= 0 && phase < TAU)) { inRange = false; break; }
  }
  ok('phase stays in [0, TAU) across 500k frames', inRange, `final=${phase.toFixed(6)}`);
}

{
  // Negative rates are real: bodies.js declares driftSpeed with min -0.4.
  let phase = 0;
  let inRange = true;
  for (let i = 0; i < 100000; i++) {
    phase = advancePhase(phase, FRAME, -0.4);
    if (!(phase >= 0 && phase < TAU)) { inRange = false; break; }
  }
  ok('negative rates wrap into [0, TAU), never negative', inRange, `final=${phase.toFixed(6)}`);
}

// --- the headline regression: float32 resolution over a long session ---

{
  // Raw absolute time, the current behaviour. Eight days in, most frames land on
  // the same float32 value as the frame before them.
  let t = 8 * DAY;
  const rawSeen = new Set();
  for (let i = 0; i < 60; i++) { t += FRAME; rawSeen.add(Math.fround(t)); }

  // Accumulated phase, the fix. The value handed to the GPU never leaves
  // [0, TAU), where a float32 step is ~5e-7 — four orders of magnitude finer
  // than the per-frame advance.
  let phase = 0;
  const phaseSeen = new Set();
  for (let i = 0; i < 500000; i++) phase = advancePhase(phase, FRAME, 0.85);
  for (let i = 0; i < 60; i++) {
    phase = advancePhase(phase, FRAME, 0.85);
    phaseSeen.add(Math.fround(phase));
  }

  ok('raw float32 time stalls after 8 days', rawSeen.size < 60, `${rawSeen.size}/60 distinct`);
  ok('wrapped phase advances every frame', phaseSeen.size === 60, `${phaseSeen.size}/60 distinct`);
}

// --- the wrap is invisible to the thing that consumes it ---

{
  // Every converted term is of the form sin/cos/rot(phase + spatial). Those are
  // exactly TAU-periodic, so wrapping must not change the rendered value. If
  // this drifts, the wrap has become a visible jump.
  const rate = 0.0262; // nebula fractalWarpSpeed default, deliberately off its own step grid
  let phase = 0;
  const STEPS = 200000;
  for (let i = 0; i < STEPS; i++) phase = advancePhase(phase, FRAME, rate);
  // Reference computed in one multiply rather than 200k additions, so this
  // measures advancePhase's drift and not the reference's own.
  const exact = STEPS * (FRAME * rate);
  const dSin = Math.abs(Math.sin(phase) - Math.sin(exact));
  const dCos = Math.abs(Math.cos(phase) - Math.cos(exact));
  ok('wrap is invisible to sin()', dSin < 1e-9, `delta=${dSin.toExponential(2)}`);
  ok('wrap is invisible to cos()', dCos < 1e-9, `delta=${dCos.toExponential(2)}`);
}

// --- a non-TAU period, for fract()/floor() lattice terms ---

{
  // quantum's scanline is `fract(p.y * 18.0 + uTime * 0.5)`, which repeats every
  // 1.0, not every TAU. Wrapping such a term at TAU would land it mid-cell and
  // pop, so the period has to travel with the term.
  const fractOf = x => x - Math.floor(x);
  // Distance on the unit circle, not on the line: two values astride a lattice
  // boundary (0.9999 and 0.0001) are adjacent, not a whole cell apart.
  const cyclicGap = (a, b) => { const d = Math.abs(fractOf(a) - fractOf(b)); return Math.min(d, 1 - d); };
  let phase = 0;
  let worst = 0;
  for (let i = 1; i <= 200000; i++) {
    phase = advancePhase(phase, FRAME, 0.5, 1.0);
    worst = Math.max(worst, cyclicGap(phase, i * (FRAME * 0.5)));
  }
  ok('unit-period wrap is invisible to fract()', worst < 1e-9, `worst=${worst.toExponential(2)}`);

  // The same term wrapped at TAU drifts away from the lattice, which is the bug
  // this parameter exists to prevent.
  let bad = 0;
  let badWorst = 0;
  for (let i = 1; i <= 200000; i++) {
    bad = advancePhase(bad, FRAME, 0.5);
    badWorst = Math.max(badWorst, cyclicGap(bad, i * (FRAME * 0.5)));
  }
  ok('wrapping a fract() term at TAU would pop', badWorst > 0.1, `worst=${badWorst.toFixed(3)}`);

  ok('tracker carries the period through', (() => {
    const tr = createPhaseTracker();
    tr.advance(0);
    tr.advance(10);
    return tr.phase('scan', 0.5, 1.0) === 0; // 10 * 0.5 = 5.0, exactly 5 lattice cells
  })());
}

// --- changing a rate must not rewrite accumulated history ---

{
  // The CLAUDE.md invariant: engines that compute `angle = time * rate` jump when
  // a rate changes mid-flight, because the new rate retroactively reprices every
  // second already elapsed. Integrating the rate into a phase is what makes a
  // rate change safe, so assert the property directly.
  let phase = 0;
  for (let i = 0; i < 1000; i++) phase = advancePhase(phase, FRAME, 0.5);
  const before = phase;
  const after = advancePhase(phase, FRAME, 4.0); // large rate change on one frame

  let step = after - before;
  if (step < 0) step += TAU; // the change may legitimately straddle the wrap
  ok('a rate change moves phase by one frame only', Math.abs(step - FRAME * 4.0) < 1e-12,
    `step=${step.toFixed(9)}`);

  // Contrast: the `time * rate` form the invariant warns about.
  const t = 1000 * FRAME;
  const jump = Math.abs(t * 4.0 - t * 0.5);
  ok('time*rate would have jumped instead', jump > 1.0, `jump=${jump.toFixed(3)} rad`);
}

// --- tracker: derives its step from virtualTime, not delta ---

{
  // `delta` carries timeScale and pause, but the modulation rack's tempo route
  // (_timeScale) is folded into virtualTime only. Integrating delta would ignore
  // it, so the tracker must difference successive virtualTime values instead.
  const tr = createPhaseTracker();
  tr.advance(100);            // first sight of the clock seeds it, contributing nothing
  ok('first frame contributes no phase', tr.phase('spin', 1.0) === 0);

  tr.advance(100 + FRAME);
  const p1 = tr.phase('spin', 1.0);
  ok('second frame advances by one virtual frame', Math.abs(p1 - FRAME) < 1e-12, `p=${p1.toFixed(9)}`);

  // A backwards clock (scrub, A/B cut, preset load) must not drive phase negative
  // or fling it forward by the whole jump.
  tr.advance(50);
  const p2 = tr.phase('spin', 1.0);
  ok('a backwards clock jump does not move phase', Math.abs(p2 - p1) < 1e-12, `p=${p2.toFixed(9)}`);

  // Independent keys accumulate independently.
  const tr2 = createPhaseTracker();
  tr2.advance(0);
  tr2.advance(1);
  ok('separate keys track separate rates',
    Math.abs(tr2.phase('a', 1.0) - 1.0) < 1e-12 && Math.abs(tr2.phase('b', 2.0) - 2.0) < 1e-12);

  // Paused clock: virtualTime stops, so phase must stop with it.
  const tr3 = createPhaseTracker();
  tr3.advance(10);
  tr3.advance(10 + FRAME);
  const held = tr3.phase('spin', 1.0);
  tr3.advance(10 + FRAME);
  ok('a paused clock holds phase', tr3.phase('spin', 1.0) === held);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
