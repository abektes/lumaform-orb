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

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Findings carry shelf metadata in addition to the four config keys. Keeping
// that metadata out of slots prevents it leaking into later config exports.
export function normalizeSnapshot(source) {
  try {
    if (!isPlainObject(source) || typeof source.engine !== 'string' || !source.engine.trim()) {
      return null;
    }
    if (!isPlainObject(source.global) || !isPlainObject(source.params)) return null;
    if (source.modulation != null && !isPlainObject(source.modulation)) return null;

    return {
      engine: source.engine,
      global: structuredClone(source.global),
      modulation: source.modulation == null ? null : structuredClone(source.modulation),
      params: structuredClone(source.params),
    };
  } catch {
    // A corrupted localStorage entry can contain a shape structuredClone cannot
    // copy. Refusing it is safer than partially replacing a slot.
    return null;
  }
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
  // Findings created before modulation existed carry null here. Match config
  // import semantics and keep the current rack rather than leaving state null
  // while the live rack continues to run its previous routes.
  if (restored.modulation) state.modulation = restored.modulation;

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
      if (slot !== 'a' && slot !== 'b') return false;
      slots[slot] = snapshotState(state);
      activeSlot = slot;
      return true;
    },
    // Stashing does not make the slot active because nothing has been applied.
    stash(slot, source) {
      if (slot !== 'a' && slot !== 'b') return false;
      const snapshot = normalizeSnapshot(source);
      if (!snapshot || !state.engines[snapshot.engine]) return false;
      slots[slot] = snapshot;
      return true;
    },
    slotSummary() {
      const describe = (slot) => (
        slots[slot] ? { filled: true, engine: slots[slot].engine } : null
      );
      return { a: describe('a'), b: describe('b'), active: activeSlot };
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
