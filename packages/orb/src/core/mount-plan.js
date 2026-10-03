// What createOrb registers and mounts, decided without a renderer so it can
// be tested in Node. createOrb itself only constructs and calls.
import { ENGINE_PARAM_DEFINITIONS, getDefaultEngineParams } from '../engine-catalog.js';
import { readConfig } from './config-io.js';

export function planMount({ engines = {}, template = null, config = null, engine = null, params = null, global = null, state = null } = {}) {
  const allEngines = { ...engines };
  let source = config;
  if (template) {
    // The template brings its own engine, so importing one template ships one
    // engine. That is the property `engines` exists to keep.
    allEngines[template.config.engine] = template.engine;
    source = template.config;
  }

  // A config names its own engine, so it decides what mounts. Without one, fall
  // back to an explicit `engine`, then to the only engine that was handed over —
  // a consumer who passed exactly one clearly meant that one.
  const registered = Object.keys(allEngines);
  const startingEngine = source?.engine ?? engine ?? (registered.length === 1 ? registered[0] : null);
  if (!startingEngine) return { engines: allEngines, engine: null, mount: null, dropped: [] };

  const defs = ENGINE_PARAM_DEFINITIONS[startingEngine] || {};
  // Schema defaults first, so a partial config does not leave an engine
  // holding undefined for every key it omitted.
  let startParams = { ...getDefaultEngineParams(startingEngine), ...(params || {}) };
  let startGlobal = global || {};
  let modulation;
  let states = null;
  let initialState = null;
  let transition = null;
  let dropped = [];

  if (source) {
    const record = readConfig(source, defs);
    dropped = record.dropped;
    startParams = { ...startParams, ...record.params };
    if (record.global) startGlobal = { ...startGlobal, ...record.global };
    if (record.modulation) modulation = record.modulation;
    states = record.states;
    transition = record.transition;
    // An explicit `state` wins, but only if it names one; a typo should still
    // give a working orb in its default state rather than none. hasOwn, because
    // a name like "constructor" would otherwise find Object.prototype's.
    initialState = state && states && Object.hasOwn(states, state) ? state : record.initialState;
  }

  return {
    engines: allEngines,
    engine: startingEngine,
    mount: { params: startParams, global: startGlobal, modulation, states, initialState, transition },
    dropped,
  };
}
