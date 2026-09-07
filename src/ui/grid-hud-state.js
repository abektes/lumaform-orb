// Pure selection logic for the grid HUD. Kept free of DOM and Three.js so it can
// be unit-tested in Node.

// These are the `section` values used throughout ENGINE_PARAM_DEFINITIONS in
// src/core/state.js. mutateParams() filters on them.
export const ALL_SECTIONS = ['colors', 'geometry', 'motion'];

// Matches the radius values already bound to the M key in src/main.js.
export const RADIUS_STEPS = [0.12, 0.25, 0.45];

export const BREADTH_OPTIONS = [1, 3, 6, null];
export const BREADTH_LABELS = ['1 param', '3 params', '6 params', 'Everything'];
export const DEFAULT_BREADTH = 3;

// eligibleKeys() treats [] as the historical "no lock" value. This sentinel
// distinguishes intentionally disabling every parameter section so patch-only
// breeding remains expressible.
export const NO_PARAM_SECTION = '__none__';

export function toggleSection(active, name) {
  if (!ALL_SECTIONS.includes(name)) return [...active];
  if (!active.includes(name)) return [...active, name];
  return active.filter((s) => s !== name);
}

// mutateParams() treats null as "mutate everything", so collapse a full
// selection to null rather than passing a list that filters nothing.
export function sectionsForMutation(active) {
  if (ALL_SECTIONS.every((s) => active.includes(s))) return null;
  if (!active.length) return [NO_PARAM_SECTION];
  return [...active];
}

export function nextRadius(current) {
  const index = RADIUS_STEPS.indexOf(current);
  if (index === -1) return RADIUS_STEPS[0];
  return RADIUS_STEPS[(index + 1) % RADIUS_STEPS.length];
}

export function cycleBreadth(current) {
  const index = BREADTH_OPTIONS.indexOf(current);
  if (index === -1) return BREADTH_OPTIONS[0];
  return BREADTH_OPTIONS[(index + 1) % BREADTH_OPTIONS.length];
}

export function breadthLabel(value) {
  const index = BREADTH_OPTIONS.indexOf(value);
  return index === -1 ? BREADTH_LABELS[BREADTH_OPTIONS.indexOf(DEFAULT_BREADTH)] : BREADTH_LABELS[index];
}
