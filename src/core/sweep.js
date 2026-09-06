// Parameter sweep — one parameter rendered at N evenly spaced values.
//
// Dragging a slider tells you where a value ends up; a ladder tells you what the
// parameter *does*. Pure maths, no DOM and no Three.js, so it can be tested in
// Node.

export const DEFAULT_STEPS = 5;

// Only numeric parameters ladder meaningfully. A ramp between two hex colours or
// across three enum options is not a comparison, it's a slideshow.
export function isSweepable(def) {
  if (!def || def.type !== 'number') return false;
  if (!Number.isFinite(def.min) || !Number.isFinite(def.max)) return false;
  return def.max > def.min;
}

export function sweepValues(def, steps = DEFAULT_STEPS) {
  if (!isSweepable(def) || steps < 2) return [];

  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    let value = def.min + (def.max - def.min) * t;
    if (def.step) value = Math.round(value / def.step) * def.step;
    // Snapping can push the endpoints just outside the declared range, and an
    // out-of-range value would be clamped inconsistently by each engine.
    value = Math.min(def.max, Math.max(def.min, value));
    out.push(+value.toFixed(4));
  }
  return out;
}

export function listSweepableParams(defs) {
  return Object.entries(defs || {})
    .filter(([, def]) => isSweepable(def))
    .map(([key, def]) => ({
      key,
      label: def.label,
      min: def.min,
      max: def.max,
      section: def.section,
    }));
}
