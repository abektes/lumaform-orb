// Modulation rack — shapes motion over time.
//
// Every engine in this project drives motion as `rate * linearTime`, so the only
// thing you can explore is faster/slower. This layer adds the missing axis: shape.
// Sources (LFO / noise / envelope / audio) are patched to destinations (parameters), and
// the studio applies the result per frame before handing params to the engine.
//
// Pure — no THREE, no DOM — so it can be exercised directly in node.

export const LFO_SHAPES = ['sine', 'triangle', 'saw', 'square', 'sampleHold'];

// Params that must never be modulated per frame.
//
// 1. Structural: changing them makes an engine dispose and rebuild geometry
//    (auris buildGeometry, polytope buildMeshes, tesseract LineGeometry). Doing
//    that at 60fps would thrash the GPU. Every one of them lives in the
//    'geometry' section, so excluding that section covers the whole class.
// 2. Rates: engines compute angle as `time * rate`, so changing a rate mid-flight
//    retroactively rewrites the whole accumulated angle and the object jumps.
//    Rates are shaped through the integrated `_timeScale` destination instead.
const RATE_PATTERN = /speed|rate|spin|flow|rot[A-Z]|^rot/i;
const RATE_EXCEPTIONS = new Set(['twistHarmonics', 'hatchDensity']);

// Special destination: integrated into virtualTime, so it shapes tempo
// (hesitation, acceleration, settle) without ever causing a phase jump.
export const TIME_SCALE_DEST = '_timeScale';

export function isModulatable(key, def) {
  if (!def || def.type !== 'number') return false;
  if (def.section === 'geometry') return false;
  if (RATE_PATTERN.test(key)) return false;
  if (RATE_EXCEPTIONS.has(key)) return false;
  return true;
}

export function listModulationTargets(defs) {
  return Object.entries(defs || {})
    .filter(([key, def]) => isModulatable(key, def))
    .map(([key, def]) => ({ key, label: def.label, min: def.min, max: def.max }));
}

// --- deterministic noise ---------------------------------------------------

function hash1(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Value noise in [-1, 1].
function valueNoise(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i + seed * 57.0);
  const b = hash1(i + 1 + seed * 57.0);
  return (a + (b - a) * smoothstep(f)) * 2 - 1;
}

// Fractal noise — 1/f falloff. This is the one that reads as "alive" rather than
// "machine", because the eye can't lock onto a period.
export function fbm(x, octaves = 3, seed = 0) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, seed + i) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return norm > 0 ? value / norm : 0;
}

// --- sources ---------------------------------------------------------------

// All LFO shapes return [-1, 1], and all are aligned to sine: they start at 0,
// peak at phase 0.25 and trough at 0.75. That alignment matters — you swap the
// shape on a route to change its character, and the timing should stay put.
export function lfoValue(shape, phase) {
  const p = phase - Math.floor(phase); // wrap to [0, 1)
  switch (shape) {
    case 'triangle':
      if (p < 0.25) return p * 4;
      if (p < 0.75) return 2 - p * 4;
      return p * 4 - 4;
    case 'saw':
      return p < 0.5 ? p * 2 : p * 2 - 2;
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'sampleHold':
      return hash1(Math.floor(phase) + 1) * 2 - 1;
    case 'sine':
    default:
      return Math.sin(p * Math.PI * 2);
  }
}

// Attack / hold / decay, all in seconds. Returns [0, 1].
// This is what makes a state read as an *event* rather than a condition.
export function envelopeValue(elapsed, { attack = 0.1, hold = 0.05, decay = 0.6 }) {
  if (elapsed < 0) return 0;
  if (elapsed < attack) return attack > 0 ? elapsed / attack : 1;
  if (elapsed < attack + hold) return 1;
  const d = elapsed - attack - hold;
  if (decay <= 0 || d >= decay) return 0;
  const t = d / decay;
  return 1 - t * t; // ease-out, settles rather than stopping dead
}

export function createDefaultModulation() {
  return {
    enabled: false,
    loopLength: 4.0,
    sources: {
      lfo1: { type: 'lfo', shape: 'sine', rate: 0.5, phase: 0 },
      noise1: { type: 'noise', rate: 0.35, octaves: 3, seed: 1 },
      env1: { type: 'env', attack: 0.08, hold: 0.06, decay: 0.9 },
      // Inert until an audio input is attached and pushes a level in.
      audio1: { type: 'audio', gain: 1, attack: 0.5, release: 0.12 },
    },
    routes: [],
  };
}

// --- rack ------------------------------------------------------------------

export function createModulationRack(initialConfig) {
  let config = initialConfig || createDefaultModulation();
  let triggerTime = -Infinity;
  // Pushed in from outside once per frame by the studio. Stays 0 when no audio
  // input is attached, which makes audio routes inert rather than broken.
  let audioLevel = 0;

  function evaluateSources(time) {
    const out = {};
    for (const [id, src] of Object.entries(config.sources || {})) {
      if (src.type === 'lfo') {
        out[id] = lfoValue(src.shape, time * (src.rate ?? 0.5) + (src.phase ?? 0));
      } else if (src.type === 'noise') {
        out[id] = fbm(time * (src.rate ?? 0.35), src.octaves ?? 3, src.seed ?? 0);
      } else if (src.type === 'env') {
        out[id] = envelopeValue(time - triggerTime, src);
      } else if (src.type === 'audio') {
        // [0, 1] like an envelope — an amplitude has no meaningful negative half.
        out[id] = Math.min(1, Math.max(0, audioLevel * (src.gain ?? 1)));
      } else {
        out[id] = 0;
      }
    }
    return out;
  }

  return {
    get config() {
      return config;
    },
    setConfig(next) {
      config = next || createDefaultModulation();
    },
    trigger(time) {
      triggerTime = time;
    },
    setAudioLevel(level) {
      audioLevel = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
    },
    get audioLevel() {
      return audioLevel;
    },
    evaluateSources,

    // Returns { params, timeScale }.
    //   params    — only the keys this rack actually changed
    //   timeScale — multiplier for virtualTime integration (1 = unmodulated)
    apply(baseParams, defs, time) {
      const params = {};
      let timeScale = 1;
      if (!config.enabled || !config.routes?.length) return { params, timeScale };

      const sources = evaluateSources(time);
      const accumulated = {};

      for (const route of config.routes) {
        if (route.enabled === false) continue;
        const value = sources[route.source];
        if (value === undefined) continue;
        const amount = route.amount ?? 0;

        if (route.dest === TIME_SCALE_DEST) {
          timeScale += amount * value;
          continue;
        }

        const def = defs?.[route.dest];
        if (!isModulatable(route.dest, def)) continue;
        const base = baseParams[route.dest];
        if (typeof base !== 'number') continue;

        // `amount` is normalized against the param's own range, so a single
        // slider means the same thing on a 0..0.03 param and a 0..360 one.
        const span = (def.max - def.min) * 0.5;
        accumulated[route.dest] = (accumulated[route.dest] ?? base) + amount * value * span;
      }

      for (const [key, raw] of Object.entries(accumulated)) {
        const def = defs[key];
        params[key] = Math.min(def.max, Math.max(def.min, raw));
      }

      // Never let tempo run backwards or stall completely.
      timeScale = Math.min(3, Math.max(0.02, timeScale));
      return { params, timeScale };
    },
  };
}
