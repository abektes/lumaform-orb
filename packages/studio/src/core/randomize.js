import { applyGeneratedPalette } from './palette.js';

export function isRandomizableNumber(def) {
  if (!def || def.type !== 'number') return false;
  if (def.randomize === false) return false;
  if (def.randomize === true) return true;
  // Geometry may rebuild meshes. Motion uniforms are cheap and safe.
  return def.section === 'motion';
}

export function snapToStep(value, def) {
  const stepped = def.step ? Math.round(value / def.step) * def.step : value;
  const clamped = Math.min(def.max, Math.max(def.min, stepped));
  const decimals = String(def.step ?? 1).includes('.')
    ? String(def.step).split('.')[1].length
    : 0;
  return +clamped.toFixed(decimals);
}

export function randomizeNumber(def, rng = Math.random) {
  return snapToStep(def.min + rng() * (def.max - def.min), def);
}

// Only writes keys that exist in `defs`. Colors follow paletteTargets;
// numbers follow isRandomizableNumber. Unknown keys are never invented.
export function randomizeParams(defs, current = {}, { rng = Math.random, palette } = {}) {
  const patch = { ...current };
  if (palette) Object.assign(patch, applyGeneratedPalette(defs, palette));

  for (const [key, def] of Object.entries(defs || {})) {
    if (isRandomizableNumber(def)) {
      patch[key] = randomizeNumber(def, rng);
    }
  }
  return patch;
}
