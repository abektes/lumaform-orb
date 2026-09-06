// Turning an audio buffer into a modulation value.
//
// Pure maths, no Web Audio and no DOM, so it can be tested in Node. The Web
// Audio wiring lives in audio-input.js.

const clamp01 = (value) => Math.min(1, Math.max(0, value));

// AnalyserNode.getByteTimeDomainData centres silence on 128.
export function rmsFromTimeDomain(bytes) {
  const length = bytes?.length ?? 0;
  if (!length) return 0;

  let sum = 0;
  for (let i = 0; i < length; i++) {
    const sample = (bytes[i] - 128) / 128;
    sum += sample * sample;
  }
  return clamp01(Math.sqrt(sum / length));
}

// A hard floor matters more than it looks: without it, room tone keeps the orb
// permanently twitching, which reads as noise rather than as listening.
export function normalizeLevel(rms, { floor = 0.02, ceiling = 0.35, gain = 1 } = {}) {
  if (!Number.isFinite(rms) || rms <= floor) return 0;
  const span = ceiling - floor;
  if (span <= 0) return clamp01(gain > 0 ? 1 : 0);
  return clamp01(((rms - floor) / span) * gain);
}

// Asymmetric on purpose. Speech amplitude that decays as fast as it rises reads
// as a flicker; a slower release reads as a voice.
export function smoothLevel(previous, target, { attack = 0.5, release = 0.12 } = {}) {
  const safePrevious = Number.isFinite(previous) ? clamp01(previous) : 0;
  const safeTarget = Number.isFinite(target) ? clamp01(target) : 0;
  const coefficient = safeTarget > safePrevious ? attack : release;
  const safeCoefficient = Number.isFinite(coefficient) ? clamp01(coefficient) : 0;
  return clamp01(safePrevious + (safeTarget - safePrevious) * safeCoefficient);
}

export function createLevelFollower(options = {}) {
  let value = 0;
  let settings = { ...options };

  return {
    get value() {
      return value;
    },
    push(rms) {
      value = smoothLevel(value, normalizeLevel(rms, settings), settings);
      return value;
    },
    setOptions(partial = {}) {
      settings = { ...settings, ...partial };
    },
    reset() {
      value = 0;
    },
  };
}
