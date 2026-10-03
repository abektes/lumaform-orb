// Named states and the transition between them.
//
// Pure — no Three.js, no DOM — so OrbRuntime only glues this in and every rule
// lives where Node can test it. The runtime hands it the base look and the
// sanitized states from readConfig; it hands back params to apply and the
// tempo to fold into the frame step.
//
// Names mean nothing here. `thinking` is not special; VISION §7 keeps the
// vocabulary open and makes it a UI concern.

import { createParamTween } from './param-tween.js';
import { applyEasing } from './easing.js';
import { TEMPO_RANGE } from './config-io.js';

const DEFAULTS = { durationMs: 600, easing: 'easeInOut' };

export function createStatePlayer() {
  let base = {};
  let states = {};
  let defs = {};
  let transition = { ...DEFAULTS };
  let touched = [];
  let current = null;
  const tween = createParamTween();

  // Tempo is eased beside the params, not through the tween: the tween
  // rejects rate-like keys by design, and tempo is safe precisely because the
  // runtime integrates it into the frame step rather than multiplying time.
  let tempo = 1;
  let tempoFrom = 1;
  let tempoTo = 1;
  let tempoEasing = DEFAULTS.easing;
  let elapsed = 0;
  let duration = 0;

  // Own-property lookups throughout: a name like `constructor` must not
  // resolve to Object.prototype and read as a state.
  const hasState = (name) => typeof name === 'string' && Object.hasOwn(states, name);
  const tempoOf = (name) => (hasState(name) ? states[name].tempo ?? 1 : 1);
  const clampTempo = (value) => Math.min(TEMPO_RANGE[1], Math.max(TEMPO_RANGE[0], value));

  function targetFor(name) {
    const patch = hasState(name) ? states[name].params || {} : {};
    const target = {};
    // Every key any state touches, so leaving a state reverts what it changed.
    // A key neither the patch nor the base holds is left out: a base set by a
    // partial host edit lacks it, and an `undefined` target would reach the
    // engine as that value.
    for (const key of touched) {
      if (Object.hasOwn(patch, key)) target[key] = patch[key];
      else if (Object.hasOwn(base, key)) target[key] = base[key];
    }
    return target;
  }

  // Cancelling mid-ease must not strand tempo between two states' values while
  // `current` names one of them, so it snaps to the current state's tempo.
  function settleTempo() {
    tempo = tempoFrom = tempoTo = tempoOf(current);
    elapsed = duration = 0;
  }

  return {
    configure(next) {
      base = { ...(next.base || {}) };
      states = next.states || {};
      defs = next.defs || {};
      transition = { ...DEFAULTS, ...(next.transition || {}) };
      touched = [...new Set(Object.values(states).flatMap((s) => Object.keys(s.params || {})))];
      current = hasState(next.initialState) ? next.initialState : null;
      tween.cancel();
      settleTempo();
    },

    setBase(params) {
      base = { ...params };
      tween.cancel();
      settleTempo();
    },

    targetFor,

    get names() {
      return Object.keys(states);
    },
    get current() {
      return current;
    },
    get tempo() {
      return tempo;
    },
    get isRunning() {
      return tween.isRunning || elapsed < duration;
    },

    start(name, currentParams, options) {
      if (!hasState(name)) return false;
      options ??= {};
      // A non-finite duration would never land, so it falls back to the default.
      const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : transition.durationMs;
      const easing = options.easing ?? transition.easing;
      current = name;
      // From what is on screen, so an interruption never jumps back.
      tween.start(currentParams, targetFor(name), defs, { durationMs, easing });
      tempoFrom = tempo;
      tempoTo = tempoOf(name);
      tempoEasing = easing;
      elapsed = 0;
      duration = Math.max(0, durationMs);
      return true;
    },

    advance(deltaMs) {
      const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
      if (elapsed < duration || (duration === 0 && tempo !== tempoTo)) {
        elapsed = Math.min(duration, elapsed + delta);
        const t = duration > 0 ? elapsed / duration : 1;
        // `spring` overshoots; tempo has a hard range, so the eased value is clamped.
        tempo = t >= 1 ? tempoTo : clampTempo(tempoFrom + (tempoTo - tempoFrom) * applyEasing(tempoEasing, t));
      }
      if (!tween.isRunning) return null;
      return tween.advance(delta);
    },

    cancel() {
      tween.cancel();
      settleTempo();
    },
  };
}
