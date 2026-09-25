// The parts this package is built from. NOT covered by semver.
//
// These moved off the root barrel when it was narrowed to a real API. They are
// exported at all because the studio is assembled from the same pieces and
// lives in this repo — not because they are a contract. A minor release may
// change or remove any of them.
//
// If you are outside this repo and reaching for something here, the thing you
// want is probably missing from the root export. Say so rather than depending
// on this path.

// Which global settings a config file carries. The studio's export writes
// through this so it cannot disagree with what readConfig keeps.
export { lookGlobal, SESSION_GLOBAL_KEYS } from '../core/config-io.js';

// Dispatches the optional lifecycle methods an engine factory may return.
export { notifyParams, notifyPulse, notifyResize } from '../core/engine-notify.js';

// The modulation rack: LFOs, noise, envelopes and the routing that drives
// parameters from them. A consumer shapes modulation through a config file,
// which readConfig already understands; this is the machinery underneath.
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
} from '../core/modulation.js';

// Camera framing maths. The runtime frames an engine on mount; this is only
// useful to a host doing its own camera work.
export {
  DEFAULT_FRAME_FILL,
  DEFAULT_FRAME_RADIUS,
  visibleHalfHeight,
  cameraDistanceForRadius,
  frameFill,
  engineFrameRadius,
} from '../core/framing.js';

export { createPointerTracker, createClickPulse } from '../shared/pointer.js';
export { createFpsTracker } from '../shared/fps.js';

// The exact-colour backdrop, composited after tone mapping. The studio's grid
// renders cells through its own composer and needs the same last step, or
// cells sit on a different colour from the main view.
export { createBackgroundPass, preserveBloomAlpha, lightCarriesNoCoverage } from '../core/background-pass.js';
