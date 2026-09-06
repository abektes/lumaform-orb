import { OrbStudio } from './core/studio.js';
import { ENGINE_TYPES, ENGINE_PARAM_DEFINITIONS, createInitialState } from './core/state.js';
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
import { listSweepableParams } from './core/sweep.js';
import { createAbCompare } from './core/ab-compare.js';

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

// --- A/B compare ------------------------------------------------------------
// 1 / 2 store the current config into a slot, backquote flips between them.
const ab = createAbCompare(studio, state);

const abReadout = document.createElement('div');
abReadout.className = 'ab-readout hidden';
document.body.appendChild(abReadout);

function refreshAbReadout(justSwapped = false) {
  const filled = ['a', 'b'].filter((s) => ab.has(s));
  if (!filled.length) {
    abReadout.classList.add('hidden');
    return;
  }
  abReadout.classList.remove('hidden');
  abReadout.innerHTML = ['a', 'b']
    .map((slot) => {
      const stored = ab.has(slot);
      const active = ab.activeSlot === slot && stored;
      return `<span class="ab-slot ${active ? 'active' : ''} ${stored ? '' : 'empty'}">${slot.toUpperCase()}</span>`;
    })
    .join('') + `<span class="ab-hint">${ab.has('a') && ab.has('b') ? '` to swap' : 'press 2 to fill B'}</span>`;

  if (justSwapped) {
    abReadout.classList.remove('flash');
    // Force a reflow so the animation restarts on every swap.
    void abReadout.offsetWidth;
    abReadout.classList.add('flash');
  }
}

window.__orb.ab = ab;

// --- parameter sweep --------------------------------------------------------
// K sweeps one parameter across a row of cells. Which parameter: the last one
// the user actually touched, falling back to the first sweepable one, so the
// key does something useful without a picker.
let lastTouchedParam = null;
document.addEventListener('input', (e) => {
  const key = e.target?.getAttribute?.('data-param');
  if (key) lastTouchedParam = key;
}, true);

const sweepCaption = document.createElement('div');
sweepCaption.className = 'sweep-caption hidden';
document.body.appendChild(sweepCaption);

function showSweepCaption(info) {
  if (!info) {
    sweepCaption.classList.add('hidden');
    sweepCaption.innerHTML = '';
    return;
  }
  sweepCaption.classList.remove('hidden');
  sweepCaption.innerHTML =
    `<div class="sweep-title">${info.label}</div>` +
    `<div class="sweep-values" style="grid-template-columns: repeat(${info.values.length}, 1fr)">` +
    info.values.map((v) => `<span>${v}</span>`).join('') +
    `</div>`;
}

function toggleSweep() {
  if (studio.isGridMode) {
    exitGridView();
    return;
  }

  const defs = ENGINE_PARAM_DEFINITIONS[state.engine] || {};
  const candidates = listSweepableParams(defs);
  if (!candidates.length) {
    console.warn(`No sweepable parameters on engine "${state.engine}".`);
    return;
  }
  const key = candidates.some((c) => c.key === lastTouchedParam)
    ? lastTouchedParam
    : candidates[0].key;

  // A sweep reuses the grid's pointer handling, so a click promotes a cell.
  // Without this handler the click would only update the grid's internal parent
  // and the chosen ladder value would never reach state.
  studio.onGridPromote = onGridPromote;

  const info = studio.enterSweepMode(state, { paramKey: key, steps: 5 });
  if (!info) return;
  ui.root.classList.add('grid-mode');
  ui.render();
  showSweepCaption(info);
}

window.__orb.toggleSweep = toggleSweep;

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

// Promoting a cell adopts both its look and its motion patch. Shared by the
// grid and the sweep, which reuse the same pointer handling.
function onGridPromote({ params, modulation }) {
  Object.assign(state.engines[state.engine], params);
  if (modulation) state.modulation = modulation;
}

let gridHud = null;

// The HUD shows how many cells are marked, but marking happens on a pointerdown
// handled inside OrbStudio, so poll rather than threading a callback through.
let markedPollId = null;

function syncMarkedCount() {
  if (!gridHud || !studio.grid) return;
  gridHud.setMarked(studio.grid.cells.filter((c) => c.selected).length);
}

// Shared teardown for both cell-based views (the 3×3 grid and the sweep strip).
// K can leave the grid and G can leave a sweep, so neither toggle may tear down
// only its own chrome — the HUD and the caption both have to go whenever the
// cells do, or one of them is left floating over the single-orb view.
function exitGridView() {
  studio.exitGridMode();
  studio.setEngine(state.engine, state);
  ui.root.classList.remove('grid-mode');
  ui.render();

  clearInterval(markedPollId);
  markedPollId = null;
  gridHud?.destroy();
  gridHud = null;

  showSweepCaption(null);
}

function toggleGrid() {
  if (studio.isGridMode) {
    exitGridView();
  } else {
    studio.onGridPromote = onGridPromote;
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

  // A/B slots. Skipped in grid mode, where digits and backquote are free for
  // future cell selection and the single-orb view isn't on screen anyway.
  if (!studio.isGridMode) {
    if (e.code === 'Digit1' || e.code === 'Digit2') {
      e.preventDefault();
      ab.store(e.code === 'Digit1' ? 'a' : 'b');
      refreshAbReadout();
      return;
    }
    if (e.code === 'Backquote') {
      e.preventDefault();
      const now = ab.swap();
      if (now) {
        ui.render();
        refreshAbReadout(true);
      }
      return;
    }
  }

  if (e.code === 'KeyK') {
    e.preventDefault();
    toggleSweep();
    return;
  }

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
