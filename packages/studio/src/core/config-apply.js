// Installs a playback record into the studio's store.
//
// The library half of this is readConfig() in @lumaform/orb, which decides what
// a config file means. This half decides where it goes, and that is a question
// only something owning a store can answer — which is why it moved out of the
// package: `state.engines[type]` is the studio's shape, not every consumer's.
//
// Identity is load-bearing throughout. The UI holds references to `state.global`
// and to individual engine param bags, so this merges into the objects that are
// already there rather than replacing them. Replacing `state.engines.quantum`
// with a fresh object leaves every holder of the old one writing into a bag
// nothing reads.

export function applyConfigToState(state, record) {
  state.engine = record.engine;

  // Merge, don't replace — see the note above about identity.
  if (record.global) Object.assign(state.global, record.global);

  if (!state.engines[record.engine]) state.engines[record.engine] = {};
  // A partial config must not blank the keys it omits.
  Object.assign(state.engines[record.engine], record.params);

  // null, not empty: a config written before modulation existed has no rack at
  // all, and wiping the current one would silently discard the user's routes.
  //
  // Cloned rather than assigned. readConfig already detached the record from the
  // parsed file, but the record itself belongs to the caller — installing it
  // directly would leave the store aliasing an object somebody else still holds
  // and may edit. The rack the studio runs is the studio's.
  if (record.modulation) state.modulation = structuredClone(record.modulation);

  return { engine: record.engine, dropped: record.dropped };
}
