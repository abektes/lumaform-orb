// App state, randomize, and custom-preset storage.
// Engine ids, schemas, and factories live in engine-catalog.js.

import { createDefaultModulation } from '@lumaform/orb/internal';
import { ENGINE_TYPES, ENGINE_PARAM_DEFINITIONS, defaultEngineBags, getDefaultPresetName } from '@lumaform/orb';
import { generateHarmoniousPalette } from './palette.js';
import { randomizeParams } from './randomize.js';

export {
  ENGINE_TYPES,
  ENGINE_INFO,
  ENGINE_PARAM_DEFINITIONS,
  getDefaultEngineParams,
} from '@lumaform/orb';
export { generateHarmoniousPalette } from './palette.js';

export const DEFAULT_GLOBAL_SETTINGS = {
  dpr: 1.2,
  exposure: 1.00,
  // A low threshold with high strength put a bloom halo over most of the frame —
  // measured 81% of pixels lit for Hopf and 61% for Tesseract, so the orb had no
  // dark surround and its silhouette dissolved. Nothing was clipping; the halo
  // was simply covering everything. These values are close to what every preset
  // in preset-library.js already used, which the defaults had drifted away from.
  bloomStrength: 0.25,
  bloomRadius: 0.25,
  bloomThreshold: 0.35,
  autoRotate: true,
  autoRotateSpeed: 0.8,
  timeScale: 1.0,
  paused: false,
  background: '#000000',
  transparentBg: false,
  bgMode: 'void',
};

export function createInitialState() {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const reqEngine = urlParams?.get('engine');
  const engine = Object.values(ENGINE_TYPES).includes(reqEngine) ? reqEngine : ENGINE_TYPES.TESSERACT;

  return {
    engine,
    activePresetName: getDefaultPresetName(engine),
    global: { ...DEFAULT_GLOBAL_SETTINGS },
    modulation: createDefaultModulation(),
    engines: defaultEngineBags(),
  };
}

export function randomizeState(currentState) {
  const engine = currentState.engine;
  const defs = ENGINE_PARAM_DEFINITIONS[engine] || {};
  const current = currentState.engines[engine] || {};

  return {
    ...currentState,
    activePresetName: 'Procedural Creation',
    global: {
      ...currentState.global,
      bloomStrength: +(0.5 + Math.random() * 0.4).toFixed(2),
      bloomRadius: +(0.3 + Math.random() * 0.25).toFixed(2),
    },
    engines: {
      ...currentState.engines,
      [engine]: randomizeParams(defs, current, {
        palette: generateHarmoniousPalette(),
      }),
    },
  };
}

// Local Storage for Custom Saved Presets
const STORAGE_KEY = 'lumaform_orb_custom_presets_v1';

export function loadSavedPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Failed to read presets from localStorage', err);
    return [];
  }
}

export function saveCustomPreset(preset) {
  try {
    const list = loadSavedPresets();
    const filtered = list.filter((p) => p.name !== preset.name);
    filtered.unshift(preset);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, 30)));
    return true;
  } catch (err) {
    console.warn('Failed to save preset to localStorage', err);
    return false;
  }
}

export function deleteCustomPreset(name) {
  try {
    const list = loadSavedPresets();
    const updated = list.filter((p) => p.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.warn('Failed to delete preset from localStorage', err);
    return false;
  }
}
