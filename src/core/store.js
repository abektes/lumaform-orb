import { createInitialState } from './state.js';

// Single owner of the app state object. main.js and StudioUI read `store.state`
// and write through these methods. The containers (state, state.global,
// state.engines[id]) are never replaced, so there is nothing to orphan.

export function createStudioStore(initial = createInitialState()) {
  const state = initial;

  function patchGlobal(patch) {
    if (patch) Object.assign(state.global, patch);
  }

  function patchEngine(id, patch) {
    if (!patch) return;
    if (!state.engines[id]) state.engines[id] = {};
    Object.assign(state.engines[id], patch);
  }

  return {
    get state() {
      return state;
    },

    setEngine(id) {
      state.engine = id;
    },

    setActivePresetName(name) {
      state.activePresetName = name;
    },

    setModulation(modulation) {
      state.modulation = modulation;
    },

    patchGlobal,
    patchEngine,

    patchActiveEngine(patch) {
      patchEngine(state.engine, patch);
    },

    applyRandomize(next) {
      patchGlobal(next.global);
      patchEngine(state.engine, next.engines?.[state.engine]);
      if (next.activePresetName !== undefined) {
        state.activePresetName = next.activePresetName;
      }
    },
  };
}
