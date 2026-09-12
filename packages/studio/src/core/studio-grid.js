import { ENGINE_PARAM_DEFINITIONS } from './state.js';
import { createVariationGrid } from './variation-grid.js';
import { engineFrameRadius } from '@lumaform/orb';
import { isSweepable, sweepValues, listSweepableParams } from './sweep.js';

export function bindGridPointer(studio) {
  studio.handleGridPointer = (event) => {
    if (!studio.grid) return;
    const rect = studio.renderer.domElement.getBoundingClientRect();
    const index = studio.grid.hitTest(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height
    );
    if (index < 0) return;

    if (event.shiftKey) {
      studio.grid.toggleSelect(index);
      return;
    }
    const promoted = studio.grid.promote(index);
    studio.grid.populate(studio.gridRadius, studio.gridSections, {
      breadth: studio.gridBreadth,
      breedPatch: studio.gridBreedPatch,
    });
    if (promoted) studio.onGridPromote?.(promoted);
  };
  studio.renderer.domElement.addEventListener('pointerdown', studio.handleGridPointer);
}

export const gridMethods = {
  // --- runtime hook overrides ----------------------------------------------

  // The grid owns engine instances built from the factory that was active when
  // it was created, and renderFrame returns early whenever a grid exists.
  // Teardown the runtime knows nothing about. The studio's dispose() calls this
  // before releasing the renderer, so the grid still has a live context to
  // dispose cells from.
  disposeStudio() {
    this.stopSequence();
    this.clipRecorder?.dispose();
    this.audioInput?.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.handleGridPointer);
    this.exitGridMode();
  },

  // Re-creates the grid or sweep for whatever engine is now active. Split out of
  // setEngine so the recursion is obvious: neither enterGridMode nor
  // enterSweepMode calls setEngine, so this cannot loop.
  rebuildGridForEngine(state, previousSweep) {
    const cols = this.gridCols ?? 3;
    const rows = this.gridRows ?? 3;

    if (previousSweep) {
      const defs = ENGINE_PARAM_DEFINITIONS[state.engine] || {};
      // The parameter being swept usually does not exist on the new engine, so
      // fall back to its first sweepable one rather than dropping out of sweep.
      const key = isSweepable(defs[previousSweep.key])
        ? previousSweep.key
        : listSweepableParams(defs)[0]?.key;
      if (key && this.enterSweepMode(state, { paramKey: key, steps: previousSweep.values.length })) {
        return;
      }
    }

    this.enterGridMode(state, { cols, rows });
  },

  enterGridMode(state, options = {}) {
    if (this.currentSequence) this.stopSequence();
    const {
      cols = 3,
      rows = 3,
      radius = this.gridRadius,
      sections = this.gridSections,
      breadth = this.gridBreadth,
      breedPatch = this.gridBreedPatch,
    } = options;
    const type = state.engine;
    const factory = this.engineConstructors.get(type);
    if (!factory) {
      console.error(`Engine type "${type}" not registered.`);
      return null;
    }

    this.exitGridMode();
    if (this.controls) this.controls.enabled = false;
    // Remembered so a later engine switch can rebuild the grid at the same shape.
    this.gridCols = cols;
    this.gridRows = rows;

    this.grid = createVariationGrid({
      renderer: this.renderer,
      engineFactory: factory,
      engineType: type,
      baseParams: state.engines[type],
      globalSettings: state.global,
      modulation: state.modulation,
      defs: ENGINE_PARAM_DEFINITIONS[type] || {},
      cols,
      rows,
      frameRadius: engineFrameRadius(this.activeEngine),
    });
    this.gridRadius = radius;
    this.gridSections = sections;
    this.gridBreadth = breadth;
    this.gridBreedPatch = breedPatch;
    this.grid.populate(radius, sections, { breadth, breedPatch });
    return this.grid;
  },

  // A sweep is the variation grid with a deterministic ramp instead of mutation:
  // one row, N cells, one parameter walked from min to max. It reuses this.grid
  // so grid mode's render branch, exit path and pointer handling all apply.
  enterSweepMode(state, { paramKey, steps = 5 } = {}) {
    if (this.currentSequence) this.stopSequence();
    const type = state.engine;
    const factory = this.engineConstructors.get(type);
    if (!factory) {
      console.error(`Engine type "${type}" not registered.`);
      return null;
    }

    const defs = ENGINE_PARAM_DEFINITIONS[type] || {};
    const def = defs[paramKey];
    if (!isSweepable(def)) {
      console.warn(`Parameter "${paramKey}" is not sweepable on engine "${type}".`);
      return null;
    }

    const values = sweepValues(def, steps);
    const base = state.engines[type];

    this.exitGridMode();
    if (this.controls) this.controls.enabled = false;

    this.grid = createVariationGrid({
      renderer: this.renderer,
      engineFactory: factory,
      engineType: type,
      baseParams: base,
      globalSettings: state.global,
      modulation: state.modulation,
      defs,
      cols: values.length,
      rows: 1,
      frameRadius: engineFrameRadius(this.activeEngine),
      cellFactory: (index) => ({ params: { ...base, [paramKey]: values[index] } }),
    });
    this.grid.populate();

    this.sweepInfo = { key: paramKey, label: def.label, values };
    return this.sweepInfo;
  },

  reseedGrid({ radius, sections, breadth, breedPatch } = {}) {
    if (!this.grid) return;
    if (radius !== undefined) this.gridRadius = radius;
    if (sections !== undefined) this.gridSections = sections;
    if (breadth !== undefined) this.gridBreadth = breadth;
    if (breedPatch !== undefined) this.gridBreedPatch = breedPatch;
    this.grid.populate(this.gridRadius, this.gridSections, {
      breadth: this.gridBreadth,
      breedPatch: this.gridBreedPatch,
    });
  },

  exitGridMode() {
    if (!this.grid) return;
    this.grid.dispose();
    this.grid = null;
    this.sweepInfo = null;
    if (this.controls) this.controls.enabled = true;
    this.renderer.setScissorTest(false);
    this.onWindowResize();
  },

  get isGridMode() {
    return !!this.grid;
  },
};
