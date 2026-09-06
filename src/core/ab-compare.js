// A/B compare — two configuration slots with an optional transition between
// them.
//
// Motion can't be judged from a still frame or from memory. Flipping between two
// versions while the animation keeps running surfaces differences that
// sequential viewing hides.

// Only the ACTIVE engine's parameter bag is captured. Snapshotting all eight
// would make a swap silently rewrite engines the user never touched.
export function snapshotState(state) {
  return structuredClone({
    engine: state.engine,
    global: state.global,
    modulation: state.modulation,
    params: state.engines[state.engine],
  });
}

// Writes in place. `state`, `state.global` and each `state.engines[...]` bag are
// held by reference in main.js, StudioUI and OrbStudio, so reassigning any of
// them would orphan those holders — the same class of bug that made randomize
// break grid entry.
//
// Returns true when the engine type changed, which the caller must handle with
// setEngine() rather than updateParameters().
export function applySnapshot(state, snapshot) {
  const engineChanged = state.engine !== snapshot.engine;
  const restored = structuredClone(snapshot);

  state.engine = restored.engine;
  Object.assign(state.global, restored.global);
  state.modulation = restored.modulation;

  if (!state.engines[restored.engine]) state.engines[restored.engine] = {};
  Object.assign(state.engines[restored.engine], restored.params);

  return engineChanged;
}

export function createAbCompare(studio, state, { getTransition = null } = {}) {
  const slots = { a: null, b: null };
  let activeSlot = null;

  function apply(slot) {
    const snapshot = slots[slot];
    if (!snapshot) return null;
    const engineChanged = applySnapshot(state, snapshot);
    if (engineChanged) {
      // Unavoidable rebuild: the two slots hold different engines. Nothing can
      // be tweened across a dispose, so this is always a cut.
      studio.setEngine(state.engine, state);
    } else {
      const transition = getTransition?.();
      if (transition && transition.durationMs > 0) {
        // Global settings and modulation land immediately, while engine
        // parameters travel from the live base to the stored target.
        const target = { ...state.engines[state.engine] };
        studio.syncModulation(state);
        studio.updateGlobalSettings(state.global);
        studio.tweenTo(target, transition);
      } else {
        // Same engine — push params into the live engine so rotation phase and
        // virtualTime survive the flip. That continuity is the whole point.
        studio.updateParameters(state);
      }
    }
    activeSlot = slot;
    return slot;
  }

  return {
    store(slot) {
      slots[slot] = snapshotState(state);
      activeSlot = slot;
    },
    has(slot) {
      return !!slots[slot];
    },
    get activeSlot() {
      return activeSlot;
    },
    activate(slot) {
      return apply(slot);
    },
    swap() {
      if (!slots.a || !slots.b) return null;
      return apply(activeSlot === 'a' ? 'b' : 'a');
    },
  };
}
