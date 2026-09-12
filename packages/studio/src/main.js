import { OrbStudio } from './core/studio.js';
import { createInitialState } from './core/state.js';
import { createStudioStore } from './core/store.js';
import { registerAllEngines } from './core/register-engines.js';
import { StudioUI } from './ui/studio-ui.js';
import { createShortcutsOverlay } from './ui/shortcuts-overlay.js';
import { createClipSession } from './ui/clip-session.js';
import { createAbSession } from './ui/ab-session.js';
import { createGridSession } from './ui/grid-session.js';
import { PRESET_LIBRARY } from './presets/preset-library.js';
import { initAnalytics } from './analytics.js';

initAnalytics();

const container = document.getElementById('container');
const store = createStudioStore(createInitialState());
const state = store.state;

const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const reqPresetName = urlParams?.get('preset');
if (reqPresetName) {
  const matchedPreset = PRESET_LIBRARY.find(
    (preset) => preset.name.toLowerCase() === reqPresetName.toLowerCase()
      || preset.badge?.toLowerCase() === reqPresetName.toLowerCase()
  );
  if (matchedPreset) {
    store.setEngine(matchedPreset.engine);
    store.setActivePresetName(matchedPreset.name);
    store.patchGlobal(matchedPreset.global);
    store.patchEngine(matchedPreset.engine, matchedPreset.params);
  }
}

// The studio opts into what the embed defaults deliberately withhold: it is a
// camera-driving exploration tool, and its clip recorder reads pixels back with
// toDataURL, which needs the preserved buffer.
const studio = new OrbStudio(container, {
  controls: true,
  autoRotate: true,
  preserveDrawingBuffer: true,
});
registerAllEngines(studio);

const ui = new StudioUI(document.body, studio, store, (updatedState) => {
  studio.setEngine(updatedState.engine, updatedState);
});

studio.setEngine(state.engine, state);

setInterval(() => {
  ui.updateFps(studio.fpsTracker.fps);
}, 250);

window.__orb = { studio, state, store, ui };

// Full-screen dialog: a sibling of the UI root so it can cover the inspector.
// Overlay tokens on the root sit *below* the panel and could not cover it.
const shortcutsOverlay = createShortcutsOverlay();
ui.container.appendChild(shortcutsOverlay.element);
ui.onToggleShortcuts = () => shortcutsOverlay.toggle();
ui.onCloseShortcuts = () => {
  if (!shortcutsOverlay.isOpen) return false;
  shortcutsOverlay.hide();
  return true;
};

const clipSession = createClipSession({ studio, host: ui.clipIndicator });
const abSession = createAbSession({ studio, state, ui });
const gridSession = createGridSession({ studio, store, state, ui });

clipSession.mount();
abSession.mount();
gridSession.mount();

const clip = clipSession.bind();
const ab = abSession.bind();
const grid = gridSession.bind();

window.__orb.toggleClip = clip.toggle;
window.__orb.ab = ab.ab;
window.__orb.toggleSweep = grid.toggleSweep;

ui.onToggleGrid = grid.toggle;
ui.onCompareFindings = ab.compareFindings;
ui.onBreedFinding = grid.breedFinding;

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

  if (clip.onKey(e) || ab.onKey(e) || grid.onKey(e)) return;

  // Shift+/ arrives as code Slash. The modifier guard deliberately permits
  // Shift while excluding command chords, so this follows the key users press.
  if (e.code === 'Slash') {
    e.preventDefault();
    shortcutsOverlay.toggle();
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
  }
});
