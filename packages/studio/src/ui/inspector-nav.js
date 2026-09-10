// One catalog for the inspector. Modes are the three jobs; leaves are the
// destinations ?tab= still names. Bounce restores the last leaf per mode.

export const INSPECTOR_MODES = {
  library: {
    id: 'library',
    label: 'Library',
    sections: [
      { id: 'presets', label: 'Presets' },
      { id: 'findings', label: 'Findings' },
      { id: 'rehearsal', label: 'Rehearsal' },
    ],
  },
  tune: {
    id: 'tune',
    label: 'Tune',
    sections: [
      { id: 'colors', label: 'Colors' },
      { id: 'geometry', label: 'Geometry' },
      { id: 'motion', label: 'Motion' },
      { id: 'optics', label: 'Optics' },
      { id: 'space', label: 'Space' },
    ],
    secondary: { id: 'motionlab', label: 'Motion Lab', shortLabel: 'Lab' },
  },
  ship: {
    id: 'ship',
    label: 'Ship',
    sections: [
      { id: 'export', label: 'Export' },
      { id: 'perf', label: 'Perf' },
    ],
  },
};

export const INSPECTOR_MODE_ORDER = ['library', 'tune', 'ship'];

export function inspectorLeaves() {
  const leaves = [];
  for (const id of INSPECTOR_MODE_ORDER) {
    const mode = INSPECTOR_MODES[id];
    for (const section of mode.sections) leaves.push(section.id);
    if (mode.secondary) leaves.push(mode.secondary.id);
  }
  return leaves;
}

export function modeForLeaf(leaf) {
  for (const id of INSPECTOR_MODE_ORDER) {
    const mode = INSPECTOR_MODES[id];
    if (mode.sections.some((section) => section.id === leaf)) return id;
    if (mode.secondary?.id === leaf) return id;
  }
  return 'library';
}

export function defaultLeafForMode(mode) {
  return INSPECTOR_MODES[mode]?.sections[0]?.id ?? 'presets';
}

export function resolveLeaf(leaf) {
  return inspectorLeaves().includes(leaf) ? leaf : 'presets';
}

export function rememberSection(lastByMode, mode, leaf) {
  return { ...lastByMode, [mode]: leaf };
}

export function defaultLastByMode() {
  return {
    library: defaultLeafForMode('library'),
    tune: defaultLeafForMode('tune'),
    ship: defaultLeafForMode('ship'),
  };
}

export function leafForModeSwitch(lastByMode, mode) {
  const def = INSPECTOR_MODES[mode];
  if (!def) return 'presets';
  const valid = def.sections.map((section) => section.id);
  if (def.secondary) valid.push(def.secondary.id);
  const remembered = lastByMode[mode];
  return valid.includes(remembered) ? remembered : def.sections[0].id;
}
