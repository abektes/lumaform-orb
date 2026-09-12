// Public surface of the runtime package.
//
// Phase 4 adds createOrb on top of this. For now it is exactly the set the
// studio consumes, deliberately: the studio's imports are then the same shape
// an external consumer will use, so anything awkward here shows up while there
// is still only one caller to fix.
//
// Microphone capture is NOT exported here — it lives behind ./audio, because a
// runtime flag cannot be tree-shaken and nobody should pay for getUserMedia
// they never asked for.

export { OrbRuntime } from './core/runtime.js';

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

export {
  LFO_SHAPES,
  TIME_SCALE_DEST,
  isModulatable,
  listModulationTargets,
  fbm,
  lfoValue,
  envelopeValue,
  createDefaultModulation,
  createModulationRack,
} from './core/modulation.js';

export {
  DEFAULT_FRAME_FILL,
  DEFAULT_FRAME_RADIUS,
  visibleHalfHeight,
  cameraDistanceForRadius,
  frameFill,
  engineFrameRadius,
} from './core/framing.js';
export { notifyParams, notifyPulse, notifyResize } from './core/engine-notify.js';

export {
  CONFIG_VERSION,
  stampVersion,
  migrateConfig,
  parseConfigFile,
  sanitizeParams,
  readConfig,
} from './core/config-io.js';

export { createPointerTracker, createClickPulse } from './shared/pointer.js';
export { createFpsTracker } from './shared/fps.js';
