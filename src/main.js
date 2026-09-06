import { OrbStudio } from './core/studio.js';
import { ENGINE_TYPES, createInitialState } from './core/state.js';
import { createTesseractEngine } from './engines/tesseract-engine.js';
import { createMoireEngine } from './engines/moire-engine.js';
import { createAurisEngine } from './engines/auris-engine.js';
import { createHopfEngine } from './engines/hopf-engine.js';
import { createPolytopeEngine } from './engines/polytope-engine.js';
import { createNebulaEngine } from './engines/nebula-engine.js';
import { createQuantumEngine } from './engines/quantum-engine.js';
import { createSingularityEngine } from './engines/singularity-engine.js';
import { StudioUI } from './ui/studio-ui.js';
import { createGridHud } from './ui/grid-hud.js';

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
studio.registerEngine(ENGINE_TYPES.MOIRE, createMoireEngine);
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

// Exploration handle — patch modulation routes from the console without a reload.
window.__orb = { studio, state, ui };

// Variation grid: G toggles, click promotes a cell, shift-click marks for export,
// M cycles the mutation radius, T fires every cell's envelope, E downloads the
// marked configs.
const GRID_RADII = [0.12, 0.25, 0.45];
let gridRadiusIndex = 1;

function downloadGridSelection() {
  const configs = studio.grid?.exportSelected();
  if (!configs?.length) return;
  const blob = new Blob([JSON.stringify(configs, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `orb-variations-${state.engine}-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

let gridHud = null;

// The HUD shows how many cells are marked, but marking happens on a pointerdown
// handled inside OrbStudio, so poll rather than threading a callback through.
let markedPollId = null;

function syncMarkedCount() {
  if (!gridHud || !studio.grid) return;
  gridHud.setMarked(studio.grid.cells.filter((c) => c.selected).length);
}

function toggleGrid() {
  if (studio.isGridMode) {
    studio.exitGridMode();
    studio.setEngine(state.engine, state);
    ui.root.classList.remove('grid-mode');
    ui.render();

    clearInterval(markedPollId);
    markedPollId = null;
    gridHud?.destroy();
    gridHud = null;
  } else {
    // Promoting a cell adopts both its look and its motion patch.
    studio.onGridPromote = ({ params, modulation }) => {
      Object.assign(state.engines[state.engine], params);
      if (modulation) state.modulation = modulation;
    };
    studio.enterGridMode(state, { radius: GRID_RADII[gridRadiusIndex] });
    // Hide the inspector and dock — the sidebar covers the right-hand column and
    // a grid you can only see two thirds of is useless for comparison. The top
    // bar stays so the Grid button remains reachable to exit.
    ui.root.classList.add('grid-mode');
    ui.render();

    gridHud = createGridHud({
      initialRadius: GRID_RADII[gridRadiusIndex],
      onChange: ({ sections, radius }) => {
        gridRadiusIndex = Math.max(0, GRID_RADII.indexOf(radius));
        studio.reseedGrid({ radius, sections });
      },
      onReseed: () => studio.reseedGrid({}),
      onExport: () => downloadGridSelection(),
      onExit: () => toggleGrid(),
    });
    // ui.root is pointer-events:none; the HUD sets pointer-events:auto itself.
    ui.root.appendChild(gridHud.element);
    markedPollId = setInterval(syncMarkedCount, 200);
  }
}

// The top-bar Grid button and the G key run the same path.
ui.onToggleGrid = toggleGrid;

window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

  if (e.code === 'KeyG') {
    e.preventDefault();
    toggleGrid();
  } else if (studio.isGridMode && e.code === 'KeyM') {
    e.preventDefault();
    gridRadiusIndex = (gridRadiusIndex + 1) % GRID_RADII.length;
    studio.reseedGrid({ radius: GRID_RADII[gridRadiusIndex] });
    gridHud?.setRadius(GRID_RADII[gridRadiusIndex]);
  } else if (studio.isGridMode && e.code === 'KeyT') {
    e.preventDefault();
    studio.grid.triggerEnvelopes();
  } else if (studio.isGridMode && e.code === 'KeyE') {
    e.preventDefault();
    downloadGridSelection();
  }
});
