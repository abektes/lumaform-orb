// A rehearsal sequence is an ordered scratch arrangement of findings. It has
// timing, but deliberately no state vocabulary: naming belongs after repeated
// sequences reveal which movements actually communicate.

export const DEFAULT_HOLD_MS = 1200;
export const DEFAULT_TRANSITION_MS = 400;

let counter = 0;

function duration(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function makeStep(finding, overrides = {}) {
  counter += 1;
  return {
    // The same finding can appear more than once in one rehearsal.
    id: `s${Date.now().toString(36)}-${counter.toString(36)}`,
    findingId: finding.id,
    note: finding.note ?? '',
    engine: finding.engine,
    global: finding.global ? structuredClone(finding.global) : null,
    params: structuredClone(finding.params ?? {}),
    modulation: finding.modulation ? structuredClone(finding.modulation) : null,
    thumb: finding.thumb ?? '',
    holdMs: DEFAULT_HOLD_MS,
    transitionMs: DEFAULT_TRANSITION_MS,
    easing: 'easeOut',
    ...overrides,
  };
}

export function stepDuration(step) {
  return duration(step?.transitionMs) + duration(step?.holdMs);
}

export function totalDuration(sequence) {
  return (sequence || []).reduce((sum, step) => sum + stepDuration(step), 0);
}

export function stepAtTime(sequence, elapsedMs, { loop = true } = {}) {
  if (!sequence?.length) return null;

  const total = totalDuration(sequence);
  let time = duration(elapsedMs);

  if (total <= 0) {
    // An instantaneous arrangement has no meaningful loop position. Showing
    // its final target once is deterministic and matches finite completion.
    const index = sequence.length - 1;
    return { index, phase: 'hold', t: 1, stepElapsedMs: 0 };
  }

  if (time >= total) {
    if (!loop) {
      const index = sequence.length - 1;
      return {
        index,
        phase: 'hold',
        t: 1,
        stepElapsedMs: stepDuration(sequence[index]),
      };
    }
    time %= total;
  }

  for (let index = 0; index < sequence.length; index++) {
    const step = sequence[index];
    const stepMs = stepDuration(step);
    if (time >= stepMs) {
      time -= stepMs;
      continue;
    }

    const transitionMs = duration(step.transitionMs);
    if (time < transitionMs) {
      return {
        index,
        phase: 'transition',
        t: transitionMs > 0 ? time / transitionMs : 1,
        stepElapsedMs: time,
      };
    }

    const holdMs = duration(step.holdMs);
    return {
      index,
      phase: 'hold',
      t: holdMs > 0 ? (time - transitionMs) / holdMs : 1,
      stepElapsedMs: time,
    };
  }

  // Floating-point drift can land infinitesimally beyond the final boundary.
  const index = sequence.length - 1;
  return {
    index,
    phase: 'hold',
    t: 1,
    stepElapsedMs: stepDuration(sequence[index]),
  };
}

export function createSequencePlayer() {
  let sequence = [];
  let options = { loop: true };
  let elapsed = 0;
  let playing = false;
  let lastPosition = null;
  let forceEntry = false;

  function sample() {
    const at = stepAtTime(sequence, elapsed, options);
    if (!at) return null;

    const total = totalDuration(sequence);
    const completed = total <= 0 || (!options.loop && elapsed >= total);
    const cycle = options.loop && total > 0 ? Math.floor(elapsed / total) : 0;
    const position = `${cycle}:${at.index}`;
    const entered = forceEntry || position !== lastPosition;
    lastPosition = position;
    forceEntry = false;

    if (completed) {
      elapsed = total;
      playing = false;
    }

    return { ...at, entered, completed };
  }

  return {
    get isPlaying() {
      return playing;
    },
    get elapsedMs() {
      return elapsed;
    },
    get length() {
      return sequence.length;
    },
    load(next, opts = {}) {
      sequence = Array.isArray(next) ? next : [];
      options = { loop: true, ...opts };
      elapsed = 0;
      playing = false;
      lastPosition = null;
      forceEntry = false;
    },
    play() {
      if (!sequence.length) return;
      // A completed finite sequence restarts; pause/resume keeps elapsed.
      const total = totalDuration(sequence);
      if ((!options.loop && elapsed >= total) || total <= 0) {
        elapsed = 0;
        lastPosition = null;
      }
      playing = true;
    },
    pause() {
      playing = false;
    },
    stop() {
      playing = false;
      elapsed = 0;
      lastPosition = null;
      forceEntry = false;
    },
    seek(ms) {
      elapsed = duration(ms);
      forceEntry = true;
    },
    advance(deltaMs) {
      if (!playing || !sequence.length) return null;
      elapsed += duration(deltaMs);
      return sample();
    },
  };
}
