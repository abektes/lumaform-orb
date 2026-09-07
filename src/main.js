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
import { createFluxEngine } from './engines/flux-engine.js';
import { createAqueousEngine } from './engines/aqueous-engine.js';
import { createCurlDriftEngine } from './engines/curl-drift-engine.js';
import { createMurmurationEngine } from './engines/murmuration-engine.js';
import { createFilamentEngine } from './engines/filament-engine.js';
import { createPrismBloomEngine } from './engines/prism-bloom-engine.js';
import { createCoronaVeilEngine } from './engines/corona-veil-engine.js';
import { createEchoRingsEngine } from './engines/echo-rings-engine.js';
import { createChromasphereEngine } from './engines/chromasphere-engine.js';
import { createVocalisEngine } from './engines/vocalis-engine.js';
import { createAetheriaEngine } from './engines/aetheria-engine.js';
import { createSuperpositionEngine } from './engines/superposition-engine.js';
import { createSynthesisEngine } from './engines/synthesis-engine.js';
import { StudioUI } from './ui/studio-ui.js';
import { createGridHud } from './ui/grid-hud.js';
import { createShortcutsOverlay } from './ui/shortcuts-overlay.js';
import { listSweepableParams } from './core/sweep.js';
import { createAbCompare, normalizeSnapshot } from './core/ab-compare.js';
import { EASING_NAMES } from './core/easing.js';
import {
  ALL_SECTIONS,
  BREADTH_OPTIONS,
  DEFAULT_BREADTH,
  NO_PARAM_SECTION,
} from './ui/grid-hud-state.js';

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
studio.registerEngine(ENGINE_TYPES.FLUX, createFluxEngine);
studio.registerEngine(ENGINE_TYPES.AQUEOUS, createAqueousEngine);
studio.registerEngine(ENGINE_TYPES.CURL_DRIFT, createCurlDriftEngine);
studio.registerEngine(ENGINE_TYPES.MURMURATION, createMurmurationEngine);
studio.registerEngine(ENGINE_TYPES.FILAMENT, createFilamentEngine);
studio.registerEngine(ENGINE_TYPES.PRISM_BLOOM, createPrismBloomEngine);
studio.registerEngine(ENGINE_TYPES.CORONA_VEIL, createCoronaVeilEngine);
studio.registerEngine(ENGINE_TYPES.ECHO_RINGS, createEchoRingsEngine);
studio.registerEngine(ENGINE_TYPES.CHROMASPHERE, createChromasphereEngine);
studio.registerEngine(ENGINE_TYPES.VOCALIS, createVocalisEngine);
studio.registerEngine(ENGINE_TYPES.AETHERIA, createAetheriaEngine);
studio.registerEngine(ENGINE_TYPES.SUPERPOSITION, createSuperpositionEngine);
studio.registerEngine(ENGINE_TYPES.SYNTHESIS, createSynthesisEngine);

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

// --- clip recording ---------------------------------------------------------
// Mounted in the UI's overlay layer: render() only rewrites the panel layer, so
// these survive, and they stay inside the panel's stacking context so the engine
// dropdown can still open over them.
const clipIndicator = document.createElement('div');
clipIndicator.className = 'clip-indicator hidden';
ui.overlayLayer.appendChild(clipIndicator);

// This is a full-screen dialog and therefore sits beside the UI root. Putting it
// in overlayLayer would trap it below the inspector inside the root's stacking
// context, leaving the controls it explains on top of it.
const shortcutsOverlay = createShortcutsOverlay();
ui.container.appendChild(shortcutsOverlay.element);
ui.onToggleShortcuts = () => shortcutsOverlay.toggle();
ui.onCloseShortcuts = () => {
  if (!shortcutsOverlay.isOpen) return false;
  shortcutsOverlay.hide();
  return true;
};

let clipTimerId = null;
let clipTogglePending = false;

function refreshClipIndicator() {
  if (!studio.isRecordingClip) {
    clipIndicator.classList.add('hidden');
    clearInterval(clipTimerId);
    clipTimerId = null;
    return;
  }
  clipIndicator.classList.remove('hidden');
  const seconds = (studio.clipRecorder.elapsedMs / 1000).toFixed(1);
  clipIndicator.innerHTML =
    `<span class="clip-dot"></span>REC ${seconds}s <span class="clip-hint">V to stop</span>`;
}

function downloadClip(result) {
  if (!result?.blob || result.blob.size === 0) {
    console.warn('Recording produced no data — was the page visible while recording?');
    return;
  }
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers begin consuming the object URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function toggleClip() {
  if (clipTogglePending) return;
  clipTogglePending = true;
  try {
    if (studio.isRecordingClip) {
      const result = await studio.stopClip();
      refreshClipIndicator();
      downloadClip(result);
      return;
    }
    if (!studio.startClip()) return;
    studio.clipRecorder.onAutoStop = (result) => {
      refreshClipIndicator();
      downloadClip(result);
    };
    refreshClipIndicator();
    clipTimerId = setInterval(refreshClipIndicator, 100);
  } finally {
    clipTogglePending = false;
  }
}

window.__orb.toggleClip = toggleClip;

// --- A/B compare ------------------------------------------------------------
// 1 / 2 store the current config into a slot, backquote flips between them.
// Transition settings for the A/B swap. Duration 0 is a hard cut, which is how
// A/B behaved before transitions existed.
const TRANSITION_DURATIONS = [0, 200, 400, 900];
let transitionIndex = 2;
let transitionEasing = 'easeOut';

const ab = createAbCompare(studio, state, {
  getTransition: () => ({ durationMs: TRANSITION_DURATIONS[transitionIndex], easing: transitionEasing }),
});

const abReadout = document.createElement('div');
abReadout.className = 'ab-readout hidden';
ui.overlayLayer.appendChild(abReadout);

// Name the slot that is still empty, rather than assuming A is always filled
// first — pressing 2 before 1 used to produce "press 2 to fill B".
function abHint() {
  const empty = ['a', 'b'].find((slot) => !ab.has(slot));
  if (!empty) {
    const ms = TRANSITION_DURATIONS[transitionIndex];
    return `\` to swap · ${ms === 0 ? 'cut' : `${ms}ms ${transitionEasing}`} · D/F to change`;
  }
  return `press ${empty === 'a' ? '1' : '2'} to fill ${empty.toUpperCase()}`;
}

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
    .join('') + `<span class="ab-hint">${abHint()}</span>`;

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
ui.overlayLayer.appendChild(sweepCaption);

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
// M cycles the mutation radius, B cycles mutation breadth, T fires every cell's
// envelope, and E downloads the marked configs.
const GRID_RADII = [0.12, 0.25, 0.45];
let gridRadiusIndex = 1;
const GRID_BREADTHS = BREADTH_OPTIONS;
let gridBreadth = DEFAULT_BREADTH;
let gridSections = null;
let gridBreedPatch = null;   // null = follow the section lock; see OrbStudio.gridBreedPatch

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
    studio.enterGridMode(state, {
      radius: GRID_RADII[gridRadiusIndex],
      sections: gridSections,
      breadth: gridBreadth,
      breedPatch: gridBreedPatch,
    });
    // Hide the inspector and dock — the sidebar covers the right-hand column and
    // a grid you can only see two thirds of is useless for comparison. The top
    // bar stays so the Grid button remains reachable to exit.
    ui.root.classList.add('grid-mode');
    ui.render();

    gridHud = createGridHud({
      initialRadius: GRID_RADII[gridRadiusIndex],
      initialSections: gridSections === null
        ? [...ALL_SECTIONS]
        : gridSections.includes(NO_PARAM_SECTION) ? [] : [...gridSections],
      initialBreadth: gridBreadth,
      initialBreedPatch: gridBreedPatch,
      onChange: ({ sections, radius, breadth, breedPatch }) => {
        gridRadiusIndex = Math.max(0, GRID_RADII.indexOf(radius));
        gridSections = sections;
        gridBreadth = breadth;
        gridBreedPatch = breedPatch;
        studio.reseedGrid({ radius, sections, breadth, breedPatch });
      },
      onReseed: () => studio.reseedGrid({}),
      onExport: () => downloadGridSelection(),
      onExit: () => toggleGrid(),
    });
    // Mounted on document.body, not ui.root: StudioUI.render() assigns
    // root.innerHTML, so anything parented there is destroyed by the next
    // re-render — and Randomize, Export and the engine dropdown all stay
    // clickable in the top bar during grid mode. The A/B readout and sweep
    // caption are mounted the same way for the same reason.
    ui.overlayLayer.appendChild(gridHud.element);
    markedPollId = setInterval(syncMarkedCount, 200);
  }
}

// The top-bar Grid button and the G key run the same path.
ui.onToggleGrid = toggleGrid;

// Resolve both inputs before touching either slot, so one corrupt shelf entry
// cannot leave a half-updated comparison behind.
ui.onCompareFindings = (first, second) => {
  const a = normalizeSnapshot(first);
  const b = normalizeSnapshot(second);
  if (!a || !b || !state.engines[a.engine] || !state.engines[b.engine]) return false;
  if (!ab.stash('a', a) || !ab.stash('b', b)) return false;
  if (!ab.activate('a')) return false;
  ui.render();
  refreshAbReadout(true);
  return true;
};

// Grid entry always seeds from live state, so first load the finding through
// the same validating import path used by the shelf's Load action.
ui.onBreedFinding = (entry) => {
  const snapshot = normalizeSnapshot(entry);
  if (!snapshot || !state.engines[snapshot.engine]) return false;
  if (studio.isGridMode) exitGridView();
  if (!ui.importConfigText(JSON.stringify(snapshot))) return false;
  toggleGrid();
  return studio.isGridMode;
};

window.addEventListener('keydown', (e) => {
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
    e.target.isContentEditable
  ) return;

  // Never claim a modified chord. These are all bare-key shortcuts, and matching
  // on e.code alone would swallow Cmd+1 (switch browser tab), Cmd+` (cycle
  // windows), Cmd+K (focus search) and Cmd+G (find next) along with them.
  // StudioUI's own KeyS binding already guards this way.
  if (e.metaKey || e.ctrlKey || e.altKey) return;

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
    // D cycles transition duration, F cycles the curve. Both are bare keys —
    // the handler returns early on any modifier.
    if (e.code === 'KeyD') {
      e.preventDefault();
      transitionIndex = (transitionIndex + 1) % TRANSITION_DURATIONS.length;
      refreshAbReadout();
      return;
    }
    if (e.code === 'KeyF') {
      e.preventDefault();
      const i = EASING_NAMES.indexOf(transitionEasing);
      transitionEasing = EASING_NAMES[(i + 1) % EASING_NAMES.length];
      refreshAbReadout();
      return;
    }
  }

  // Shift+/ arrives as code Slash. The modifier guard deliberately permits
  // Shift while excluding command chords, so this follows the key users press.
  if (e.code === 'Slash') {
    e.preventDefault();
    shortcutsOverlay.toggle();
    return;
  }

  if (e.code === 'KeyV') {
    e.preventDefault();
    toggleClip();
    return;
  }

  // Capture stays prompt-free so it is usable in the middle of exploration.
  if (e.code === 'KeyC' && !studio.isGridMode) {
    e.preventDefault();
    try {
      const entry = ui.saveFinding();
      if (ui.findings.lastError) {
        alert('The finding was captured, but browser storage could not save it.');
        return;
      }
      console.info(`Kept finding ${entry.id}`);
    } catch (err) {
      console.error('Could not keep finding', err);
      alert(err instanceof Error ? err.message : 'Could not keep this finding.');
    }
    return;
  }

  // Rehearsal playback remains reachable when the inspector is closed. P
  // pauses rather than resets; the Rehearsal tab has an explicit Stop control.
  if (e.code === 'KeyP' && !studio.isGridMode) {
    e.preventDefault();
    ui.toggleSequencePlayback();
    return;
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
  } else if (studio.isGridMode && e.code === 'KeyB') {
    e.preventDefault();
    const index = GRID_BREADTHS.indexOf(gridBreadth);
    gridBreadth = GRID_BREADTHS[(index + 1) % GRID_BREADTHS.length];
    studio.reseedGrid({ breadth: gridBreadth });
    gridHud?.setBreadth(gridBreadth);
  } else if (studio.isGridMode && e.code === 'KeyT') {
    e.preventDefault();
    studio.grid.triggerEnvelopes();
  } else if (studio.isGridMode && e.code === 'KeyE') {
    e.preventDefault();
    downloadGridSelection();
  }
});
