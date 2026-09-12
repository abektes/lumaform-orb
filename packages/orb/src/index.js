// Public surface of the runtime package.
//
// This is the set a consumer is meant to use, and the set semver will hold us
// to. It was previously the studio's import list — every helper the studio
// happened to reach for, on the reasoning that one caller's needs would surface
// anything awkward. What it actually did was freeze the studio's internals as
// the public API: `notifyParams`, a pointer tracker, an fps meter and a
// modulation rack are how this package is built, not what it is for.
//
// Three things stay off this barrel on purpose.
//
// Engine factories live behind ./engines, one named export each, so naming one
// engine ships one engine. Microphone capture lives behind ./audio, because a
// runtime flag cannot be tree-shaken and nobody should pay for getUserMedia
// they did not ask for. And the building blocks live behind ./internal, which
// is not covered by semver — the studio uses them because the studio is built
// from the same parts, not because they are an API.

export { createOrb } from './create-orb.js';

// The escape hatch. A host that wants to own its frame loop constructs this
// directly and calls advance()/render() itself; the studio does exactly that.
export { OrbRuntime } from './core/runtime.js';

// Catalog metadata: ids, names, param schemas. No factories — an entry carries
// `factoryName` as a string, so reading a schema does not drag in an engine.
export {
  ENGINE_CATALOG,
  ENGINE_TYPES,
  ENGINE_INFO,
  ENGINE_PARAM_DEFINITIONS,
  getEngineEntry,
  getDefaultEngineParams,
  getDefaultPresetName,
  defaultEngineBags,
} from './engine-catalog.js';

// Reading, validating and migrating a config file.
export {
  CONFIG_VERSION,
  stampVersion,
  migrateConfig,
  parseConfigFile,
  sanitizeParams,
  readConfig,
} from './core/config-io.js';
