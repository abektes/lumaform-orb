// Pure selection logic for the grid HUD. Kept free of DOM and Three.js so it can
// be unit-tested in Node.

// These are the `section` values used throughout ENGINE_PARAM_DEFINITIONS in
// src/core/state.js. mutateParams() filters on them.
export const ALL_SECTIONS = ['colors', 'geometry', 'motion'];

// Matches the radius values already bound to the M key in src/main.js.
export const RADIUS_STEPS = [0.12, 0.25, 0.45];

export function toggleSection(active, name) {
  if (!ALL_SECTIONS.includes(name)) return [...active];
  if (!active.includes(name)) return [...active, name];
  // Locking out every section would breed nine identical cells, so the last
  // active section cannot be switched off.
  if (active.length === 1) return [...active];
  return active.filter((s) => s !== name);
}

// mutateParams() treats null as "mutate everything", so collapse a full
// selection to null rather than passing a list that filters nothing.
export function sectionsForMutation(active) {
  if (ALL_SECTIONS.every((s) => active.includes(s))) return null;
  return [...active];
}

export function nextRadius(current) {
  const index = RADIUS_STEPS.indexOf(current);
  if (index === -1) return RADIUS_STEPS[0];
  return RADIUS_STEPS[(index + 1) % RADIUS_STEPS.length];
}
