// Wrapped phase accumulation for shader time uniforms.
//
// `studio.virtualTime` grows without bound. That is fine in JS — a float64
// accumulator is still exact after years — but every `uniforms.uTime.value = t`
// hands the number to a *float32* uniform, whose resolution is relative to
// magnitude. Measured against a 16.67 ms frame: at 10 h of virtualTime the
// per-frame step alternates 15.6/19.5 ms, at 24 h it swings 15.6/23.4 ms, and at
// 7 d only 17 of every 60 frames advance at all. FPS never moves; the motion
// just stops flowing and starts lurching.
//
// Wrapping virtualTime itself is not an option. Engines multiply time by rates
// that are sometimes per-fragment (singularity's Keplerian `2.4/sqrt(diskR)`)
// and sometimes feed aperiodic noise domains (aqueous fbm drift, nebula's
// particle hash lattice); no wrap period exists that leaves those unchanged, and
// the modulation rack reads virtualTime for LFO phase too. What *is* exactly
// seamless is wrapping the accumulated phase of a term that is already
// TAU-periodic — sin, cos, rot — because sin(x) === sin(x + TAU) identically.
//
// Integrating a rate into a phase also removes the hazard CLAUDE.md warns about:
// `angle = time * rate` reprices every second already elapsed when the rate
// changes, so the object jumps. `phase += dt * rate` cannot, because history is
// already banked.
export const TAU = Math.PI * 2;

// Advance `phase` by one step at `rate` and fold the result into [0, period).
// `vdt` is a change in virtualTime, never a wall-clock delta.
//
// `period` must match the period of whatever consumes the phase, or the wrap
// stops being invisible. sin/cos/rot take TAU (the default); `fract()` and
// `floor()` lattices take 1.0. Wrapping a fract() term at TAU would jump, since
// TAU is not a whole number of lattice cells.
export function advancePhase(phase, vdt, rate, period = TAU) {
  const next = (phase + vdt * rate) % period;
  return next < 0 ? next + period : next;
}

// Tracks several independent phases against one clock.
//
// Call `advance(time)` once per frame with the engine's `time` argument, then
// `phase(key, rate)` per term. The tracker differences successive virtualTime
// values. `delta` is now that same step (the runtime hands engines the frame's
// virtualTime advance), but differencing `time` keeps the tracker correct for
// any host that still passes a delta without the rack's tempo folded in.
export function createPhaseTracker() {
  const phases = new Map();
  let last = null;
  let vdt = 0;

  return {
    // Returns the virtual step this frame, in case a caller wants it directly.
    advance(time) {
      const t = typeof time === 'number' && Number.isFinite(time) ? time : last ?? 0;
      // The first sight of the clock only seeds it: virtualTime may already be
      // hours old when an engine is constructed, and that history is not this
      // engine's to replay. A backwards jump (scrub, A/B cut, preset load) is
      // clamped for the same reason — phase holds rather than unwinding.
      vdt = last === null ? 0 : Math.max(0, t - last);
      last = t;
      return vdt;
    },

    phase(key, rate, period = TAU) {
      const next = advancePhase(phases.get(key) ?? 0, vdt, rate, period);
      phases.set(key, next);
      return next;
    },
  };
}

// Exponential fade of `value` over one step. `ratePerSecond` is how many
// e-folds a second of virtualTime takes, so the fade lasts the same time at
// 60 Hz, 120 Hz and under a tempo route — `value *= 0.92` per frame did not.
// The step's magnitude is used because reverse playback hands engines a
// negative delta, and a decay that grows without bound is not a decay.
export function decay(value, ratePerSecond, step) {
  return Number.isFinite(step) ? value * Math.exp(-ratePerSecond * Math.abs(step)) : value;
}
