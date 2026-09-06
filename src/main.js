import { OrbStudio } from './core/studio.js';
import { ENGINE_TYPES, createInitialState } from './core/state.js';
import { createTesseractEngine } from './engines/tesseract-engine.js';
import { createAurisEngine } from './engines/auris-engine.js';
import { createHopfEngine } from './engines/hopf-engine.js';
import { createPolytopeEngine } from './engines/polytope-engine.js';
import { createNebulaEngine } from './engines/nebula-engine.js';
import { createQuantumEngine } from './engines/quantum-engine.js';
import { createSingularityEngine } from './engines/singularity-engine.js';
import { StudioUI } from './ui/studio-ui.js';

import { PRESET_LIBRARY } from './presets/preset-library.js';

const container = document.getElementById('container');
const state = createInitialState();

// Check for preset query parameter in URL
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const reqPresetName = urlParams?.get('preset');
if (reqPresetName) {
  const matchedPreset = PRESET_LIBRARY.find(
    (p) => p.name.toLowerCase() === reqPresetName.toLowerCase() || p.badge?.toLowerCase() === reqPresetName.toLowerCase()
  );
  if (matchedPreset) {
    state.engine = matchedPreset.engine;
    state.activePresetName = matchedPreset.name;
    if (matchedPreset.global) Object.assign(state.global, matchedPreset.global);
    if (matchedPreset.params) Object.assign(state.engines[matchedPreset.engine], matchedPreset.params);
  }
}

// Initialize Three.js Studio Core
const studio = new OrbStudio(container);

// Register Generator Engines
studio.registerEngine(ENGINE_TYPES.TESSERACT, createTesseractEngine);
studio.registerEngine(ENGINE_TYPES.AURIS, createAurisEngine);
studio.registerEngine(ENGINE_TYPES.HOPF, createHopfEngine);
studio.registerEngine(ENGINE_TYPES.POLYTOPE, createPolytopeEngine);
studio.registerEngine(ENGINE_TYPES.NEBULA, createNebulaEngine);
studio.registerEngine(ENGINE_TYPES.QUANTUM, createQuantumEngine);
studio.registerEngine(ENGINE_TYPES.SINGULARITY, createSingularityEngine);

// Initialize Studio UI
const ui = new StudioUI(document.body, studio, state, (updatedState) => {
  studio.setEngine(updatedState.engine, updatedState);
});

// Activate Initial Engine
studio.setEngine(state.engine, state);

// Update live FPS in UI
setInterval(() => {
  ui.updateFps(studio.fpsTracker.fps);
}, 250);
