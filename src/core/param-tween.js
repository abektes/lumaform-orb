// Interpolating between two parameter sets over time.
//
// This is an instrument for looking at transitions, not a state machine: a tween
// has a duration and a curve, and nothing else. Naming transitions is
// specification, which docs/VISION.md §3 defers until exploration has produced a
// vocabulary worth naming.
//
// Pure — no DOM, no Three.js — so it can be tested in Node.

import { applyEasing } from './easing.js';

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export function lerpHexColor(from, to, t) {
  const a = HEX.exec(from || '');
  const b = HEX.exec(to || '');
  if (!a || !b) return to;
  const mix = (i) => {
    const x = parseInt(a[i], 16);
    const y = parseInt(b[i], 16);
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  };
  return `#${mix(1)}${mix(2)}${mix(3)}`;
}

export function interpolateParams(from, to, defs, t) {
  const out = {};
  for (const [key, target] of Object.entries(to || {})) {
    const def = defs?.[key];
    const source = from?.[key];

    if (def?.type === 'number' && typeof source === 'number' && typeof target === 'number') {
      const raw = source + (target - source) * t;
      // A spring overshoots past 1, which would push a parameter outside its
      // declared range; each engine would then clamp it differently.
      const min = Number.isFinite(def.min) ? def.min : -Infinity;
      const max = Number.isFinite(def.max) ? def.max : Infinity;
      out[key] = Math.min(max, Math.max(min, raw));
    } else if (def?.type === 'color') {
      out[key] = lerpHexColor(source, target, Math.min(1, Math.max(0, t)));
    } else {
      // Selects and anything unrecognised cannot be halfway between two values.
      out[key] = t >= 0.5 ? target : (source ?? target);
    }
  }
  return out;
}

export function createParamTween() {
  let from = null;
  let to = null;
  let defs = null;
  let elapsed = 0;
  let duration = 0;
  let easing = 'easeOut';
  let running = false;

  return {
    get isRunning() {
      return running;
    },
    get progress() {
      return duration > 0 ? Math.min(1, elapsed / duration) : 1;
    },
    start(nextFrom, nextTo, paramDefs, { durationMs = 400, easing: curve = 'easeOut' } = {}) {
      from = { ...nextFrom };
      to = { ...nextTo };
      defs = paramDefs || {};
      duration = Math.max(0, durationMs);
      easing = curve;
      elapsed = 0;
      running = true;
    },
    advance(deltaMs) {
      if (!running) return null;
      elapsed += Math.max(0, deltaMs);
      const raw = duration > 0 ? Math.min(1, elapsed / duration) : 1;
      if (raw >= 1) {
        running = false;
        // Land exactly on the target rather than on whatever the curve returned
        // at t = 1, so a tween can never leave a parameter fractionally off.
        return { ...to };
      }
      return interpolateParams(from, to, defs, applyEasing(easing, raw));
    },
    cancel() {
      running = false;
    },
  };
}
