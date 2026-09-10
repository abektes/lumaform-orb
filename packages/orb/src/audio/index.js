// Microphone capture, deliberately behind its own subpath.
//
// The obvious design is a runtime flag — `createOrb(el, config, { audio: true })`
// — and it is worse in three ways.
//
// A runtime boolean cannot be tree-shaken. A bundler cannot prove its value, so
// getUserMedia ships to every consumer whether they enable audio or not, and
// dependency scanners flag the presence of the call rather than its use.
//
// Consent belongs to the consumer. A library that fires a permission prompt
// because of a config field has taken a decision that was not its to take.
//
// And it solves the wrong half. For an assistant orb the interesting signal is
// usually the assistant's own speech — an <audio> element or a WebAudio node —
// which a microphone flag cannot reach at all. `runtime.setAudioSource()` takes
// anything with `.read() → 0..1` and `.isActive`, so that case needs no new API.
//
// Not importing this module is therefore the off switch: zero bytes, zero
// permission surface, nothing for a security review to flag.

export { createAudioInput } from './audio-input.js';
export {
  createLevelFollower,
  normalizeLevel,
  rmsFromTimeDomain,
  smoothLevel,
} from './audio-level.js';
