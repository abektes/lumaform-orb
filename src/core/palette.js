// Colour harmony chips — the quick "recolour this orb" control on the Colors tab.
//
// This used to be a map keyed by parameter name (color1, color2, color3, colorShell,
// wireColor, cellColor) living inside studio-ui.js, applied with a
// `if (params[k] !== undefined)` guard. That guard silently did nothing for any engine
// that had not happened to use those exact names, so clicking a chip was a no-op on 9
// of 17 engines — every engine added after the map was written, plus Moiré. There was
// no error and no visible feedback, which is why it survived.
//
// Palettes are now ordered roles applied to whatever colour parameters an engine
// actually declares, in schema order. The schema stays the single source of truth, the
// same way it already drives every control in the panel.
//
// Pure — no DOM, no Three.js — so it can be exercised directly in node.

// Three roles, in application order. An engine with more colour slots than roles cycles
// through them, which keeps related slots visually related instead of arbitrary.
export const PALETTES = {
  cosmic: { label: 'Cosmic', title: 'Cosmic Aurora', colors: ['#057eff', '#a855f7', '#00f2fe'] },
  solar: { label: 'Solar', title: 'Solar Flare', colors: ['#ff5500', '#ff0055', '#ffc400'] },
  cyber: { label: 'Cyber', title: 'Cyber Emerald', colors: ['#059669', '#06b6d4', '#10b981'] },
  rose: { label: 'Rose', title: 'Rose Gold', colors: ['#f43f5e', '#fb923c', '#fda4af'] },
  cryo: { label: 'Cryo', title: 'Sub-Zero Cryo', colors: ['#00f0ff', '#38bdf8', '#e0f2fe'] },
  molten: { label: 'Molten', title: 'Obsidian Molten', colors: ['#ffed00', '#ef4444', '#38bdf8'] },
};

export const PALETTE_KEYS = Object.keys(PALETTES);

// Some colour parameters are structural rather than expressive: Auris' shadow tone and
// facet base, Filament's undisturbed-edge colour, the white core sparks several engines
// use as a highlight. Tinting those does not recolour the orb, it destroys the contrast
// the look depends on — a shadow in palette cyan stops reading as a shadow. They opt out
// with `paletteRole: 'fixed'` in the schema.
export function isPaletteTarget(def) {
  return !!def && def.type === 'color' && def.paletteRole !== 'fixed';
}

// Colour parameters a palette may write, in schema declaration order. Engines declare
// their most characteristic colour first, so order carries real meaning here.
export function paletteTargets(defs) {
  return Object.entries(defs || {})
    .filter(([, def]) => isPaletteTarget(def))
    .map(([key]) => key);
}

// Returns only the keys that change, so callers can Object.assign into the live
// parameter bag without reassigning it (see VISION.md §5 on shared state containers).
export function applyPalette(defs, params, paletteKey) {
  const palette = PALETTES[paletteKey];
  if (!palette) return {};

  const targets = paletteTargets(defs);
  const patch = {};
  targets.forEach((key, i) => {
    const next = palette.colors[i % palette.colors.length];
    if (params?.[key] !== next) patch[key] = next;
  });
  return patch;
}
