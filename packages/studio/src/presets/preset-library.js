import { MOIRE_PRESETS } from './moire.js';
import { ANALYTIC_PRESETS } from './analytic.js';
import { SIMULATION_PRESETS } from './simulation.js';
import { BODIES_PRESETS } from './bodies.js';
import { REGARD_PRESETS } from './regard.js';

export const PRESET_LIBRARY = [
  ...MOIRE_PRESETS,
  ...ANALYTIC_PRESETS,
  ...SIMULATION_PRESETS,
  ...BODIES_PRESETS,
  ...REGARD_PRESETS,
];
