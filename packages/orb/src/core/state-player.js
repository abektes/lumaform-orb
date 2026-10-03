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

  function targetFor(name) {
    const patch = states[name]?.params || {};
    const target = {};
    // Every key any state touches, so leaving a state reverts what it changed.
    for (const key of touched) target[key] = key in patch ? patch[key] : base[key];
    return target;
  }

  return {
    configure(next) {
      base = { ...(next.base || {}) };
      states = next.states || {};
      defs = next.defs || {};
      transition = { ...DEFAULTS, ...(next.transition || {}) };
      touched = [...new Set(Object.values(states).flatMap((s) => Object.keys(s.params || {})))];
      current = next.initialState && states[next.initialState] ? next.initialState : null;
      tween.cancel();
      tempo = current ? states[current].tempo ?? 1 : 1;
      tempoFrom = tempoTo = tempo;
      elapsed = duration = 0;
    },

    setBase(params) {
      base = { ...params };
      tween.cancel();
      tempoFrom = tempoTo = tempo;
      elapsed = duration = 0;
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

    start(name, currentParams, options = {}) {
      if (!states[name]) return false;
      const durationMs = options.durationMs ?? transition.durationMs;
      const easing = options.easing ?? transition.easing;
      current = name;
      // From what is on screen, so an interruption never jumps back.
      tween.start(currentParams, targetFor(name), defs, { durationMs, easing });
      tempoFrom = tempo;
      tempoTo = states[name].tempo ?? 1;
      tempoEasing = easing;
      elapsed = 0;
      duration = Math.max(0, durationMs);
      return true;
    },

    advance(deltaMs) {
      if (elapsed < duration || (duration === 0 && tempo !== tempoTo)) {
        elapsed = Math.min(duration, elapsed + Math.max(0, deltaMs));
        const t = duration > 0 ? elapsed / duration : 1;
        tempo = t >= 1 ? tempoTo : tempoFrom + (tempoTo - tempoFrom) * applyEasing(tempoEasing, t);
      }
      if (!tween.isRunning) return null;
      return tween.advance(deltaMs);
    },

    cancel() {
      tween.cancel();
      tempoFrom = tempoTo = tempo;
      elapsed = duration = 0;
    },
  };
}
