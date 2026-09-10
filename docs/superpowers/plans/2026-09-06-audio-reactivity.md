# Audio Reactivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the orb breathe with live audio, so a `speaking` state can be designed at all.

**Architecture:** An orb that doesn't move with mic input or speech amplitude reads as a screensaver — `speaking` is the one state that cannot be designed from parameters alone. Rather than bolting audio onto the engines, this adds **one new modulation source type**, `audio`, alongside the existing `lfo` / `noise` / `env`. It then routes through the rack that already exists, so every destination, every engine and the whole Motion Lab UI work unchanged. A Web Audio `AnalyserNode` produces a level each frame; the studio pushes it into the rack; the rack serves it to any route whose source is an audio source.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160, Web Audio API. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework. UI is HTML strings and DOM nodes.
- **ES modules**, `"type": "module"`.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No test framework; do not add one. Exit `0` on pass, `1` on fail. Anything you want tested must live in a module free of DOM and Web Audio.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Backwards compatibility:** configs saved before this change have no audio source. `evaluateSources()` already returns `0` for unrecognised source types, so nothing breaks — keep it that way.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: the repository root. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` first — especially §3 (exploration before specification) and §5 (architectural invariants).

**The modulation rack** (`src/core/modulation.js`) is the heart of this. Its config:

```js
{
  enabled: false,
  loopLength: 4.0,
  sources: {
    lfo1:   { type: 'lfo',   shape: 'sine', rate: 0.5, phase: 0 },
    noise1: { type: 'noise', rate: 0.35, octaves: 3, seed: 1 },
    env1:   { type: 'env',   attack: 0.08, hold: 0.06, decay: 0.9 },
  },
  routes: [ { source: 'lfo1', dest: 'edgeGlow', amount: 0.4 } ],
}
```

`createModulationRack(config)` returns `{ config, setConfig, trigger, evaluateSources, apply }`. Internally:

```js
function evaluateSources(time) {
  const out = {};
  for (const [id, src] of Object.entries(config.sources || {})) {
    if (src.type === 'lfo') { ... }
    else if (src.type === 'noise') { ... }
    else if (src.type === 'env') { ... }
    else { out[id] = 0; }        // <- unknown types are inert
  }
  return out;
}
```

**Source value ranges matter.** `lfo` and `noise` return `[-1, 1]`; `env` returns `[0, 1]`. The new `audio` source returns `[0, 1]`, like `env` — an amplitude has no meaningful negative half.

`apply(baseParams, defs, time)` returns `{ params, timeScale }`. `amount` is normalised against each destination parameter's own range. The special destination `TIME_SCALE_DEST` (`'_timeScale'`) is integrated into `virtualTime` so tempo can be shaped without phase jumps. **Never route audio at a rate parameter** — `listModulationTargets()` already excludes those; use it.

**Where the studio drives the rack:** `OrbStudio.renderFrame()` in `src/core/studio.js` calls `this.modulation.apply(this.baseParams, this.paramDefs, this.virtualTime)` once per frame. That is where the audio level must be pushed in.

**Where modulation lives in app state:** `state.modulation`, created by `createDefaultModulation()` in `src/core/modulation.js` and synced via `studio.syncModulation(state)`.

**The Motion Lab tab** (`renderMotionLabTab()` / `attachMotionLabListeners()` in `src/ui/studio-ui.js`) renders the source rack and the routing rows. Destinations come from `listModulationTargets(defs)`.

**One thing to be aware of:** `mutatePatch()` in `src/core/variation-grid.js` mutates `lfo` / `noise` / `env` source parameters when breeding grid cells. It has no branch for `audio`, so audio sources pass through untouched — which is correct (there is nothing meaningful to randomise about a microphone) and needs no change.

**Browser verification handle:** `window.__orb = { studio, state, ui }`.

**CRITICAL browser gotchas:**
- If the Browser pane is not displayed, `requestAnimationFrame` never fires and the render loop is frozen. `studio.fpsTracker.fps` still reports its default `60`, so it is not a liveness signal. Step frames manually with `studio.renderFrame()`.
- CSS transitions are frozen too — a hidden page produces no frames, so `getComputedStyle()` on a transitioning property returns the *starting* value forever. Set `element.style.transition = 'none'` before measuring.
- **`getUserMedia` requires a user gesture and a secure context.** `http://localhost` counts as secure. An automated click cannot always satisfy the gesture requirement, so Task 4's verification uses an oscillator instead of the microphone. Microphone capture must be confirmed by a human.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/audio-level.js` | **Create.** Pure level maths: RMS → normalised, smoothed `[0,1]`. No Web Audio, no DOM. Unit-tested. |
| `src/core/audio-input.js` | **Create.** Web Audio wiring: AnalyserNode, mic capture, test oscillator, teardown. |
| `src/core/modulation.js` | **Modify.** Add the `audio` source type and `setAudioLevel()`. |
| `src/core/studio.js` | **Modify.** Push the level into the rack each frame; own the audio input lifecycle. |
| `src/ui/studio-ui.js` | **Modify.** Motion Lab: enable/disable button, gain and smoothing controls, a live level meter. |
| `src/style.css` | **Modify.** Append meter styles. |
| `tests/audio-level.test.mjs` | **Create.** Node tests for the pure maths. |

---

### Task 1: Pure level maths

**Files:**
- Create: `src/core/audio-level.js`
- Test: `tests/audio-level.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `rmsFromTimeDomain(bytes: Uint8Array|number[]) => number` — RMS of an 8-bit time-domain buffer where 128 is silence, returned in `[0, 1]`. Empty input returns `0`.
  - `normalizeLevel(rms, { floor = 0.02, ceiling = 0.35, gain = 1 }) => number` — maps `rms` through a noise floor and ceiling to `[0, 1]`, then applies `gain`, clamped. Anything at or below `floor` returns exactly `0` so room tone does not make the orb twitch.
  - `smoothLevel(previous, target, { attack = 0.5, release = 0.12 }) => number` — asymmetric smoothing: rises fast (`attack`), falls slowly (`release`), because amplitude that decays instantly reads as a flicker rather than as speech. Both coefficients are per-frame lerp factors in `[0, 1]`.
  - `createLevelFollower(options)` → `{ push(rms) => number, get value() => number, reset() }` — stateful wrapper combining normalise + smooth.

- [ ] **Step 1: Write the failing test**

Create `tests/audio-level.test.mjs`:

```js
import {
  rmsFromTimeDomain,
  normalizeLevel,
  smoothLevel,
  createLevelFollower,
} from '../src/core/audio-level.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// --- rmsFromTimeDomain ---
const silence = new Uint8Array(256).fill(128);
ok('silence is zero', rmsFromTimeDomain(silence) === 0);
ok('empty buffer is zero', rmsFromTimeDomain(new Uint8Array(0)) === 0);

const fullScale = new Uint8Array(256);
for (let i = 0; i < 256; i++) fullScale[i] = i % 2 ? 255 : 0;
const loud = rmsFromTimeDomain(fullScale);
ok('full-scale square is near 1', loud > 0.98 && loud <= 1, String(loud));

const half = new Uint8Array(256);
for (let i = 0; i < 256; i++) half[i] = i % 2 ? 192 : 64;
const mid = rmsFromTimeDomain(half);
ok('half-scale is near 0.5', mid > 0.45 && mid < 0.55, String(mid));
ok('rms always within [0,1]', [silence, fullScale, half].every((b) => {
  const v = rmsFromTimeDomain(b);
  return v >= 0 && v <= 1 && Number.isFinite(v);
}));

// --- normalizeLevel ---
ok('at floor is exactly 0', normalizeLevel(0.02, { floor: 0.02, ceiling: 0.35 }) === 0);
ok('below floor is exactly 0', normalizeLevel(0.001, { floor: 0.02, ceiling: 0.35 }) === 0);
ok('at ceiling is 1', normalizeLevel(0.35, { floor: 0.02, ceiling: 0.35 }) === 1);
ok('above ceiling clamps to 1', normalizeLevel(0.9, { floor: 0.02, ceiling: 0.35 }) === 1);
const midNorm = normalizeLevel(0.185, { floor: 0.02, ceiling: 0.35 });
ok('midpoint is near 0.5', midNorm > 0.45 && midNorm < 0.55, String(midNorm));
ok('gain scales but still clamps', normalizeLevel(0.2, { floor: 0.02, ceiling: 0.35, gain: 10 }) === 1);
ok('gain of 0 yields 0', normalizeLevel(0.3, { floor: 0.02, ceiling: 0.35, gain: 0 }) === 0);
ok('always within [0,1]', [0, 0.01, 0.1, 0.5, 5].every((r) => {
  const v = normalizeLevel(r, { floor: 0.02, ceiling: 0.35, gain: 3 });
  return v >= 0 && v <= 1 && Number.isFinite(v);
}));

// --- smoothLevel ---
ok('rises faster than it falls', (() => {
  const up = smoothLevel(0, 1, { attack: 0.5, release: 0.12 });
  const down = 1 - smoothLevel(1, 0, { attack: 0.5, release: 0.12 });
  return up > down;
})());
ok('converges upward', (() => {
  let v = 0;
  for (let i = 0; i < 100; i++) v = smoothLevel(v, 1, { attack: 0.5, release: 0.12 });
  return v > 0.99;
})());
ok('converges downward', (() => {
  let v = 1;
  for (let i = 0; i < 400; i++) v = smoothLevel(v, 0, { attack: 0.5, release: 0.12 });
  return v < 0.01;
})());
ok('stays within [0,1]', (() => {
  let v = 0, okSoFar = true;
  for (let i = 0; i < 200; i++) {
    v = smoothLevel(v, i % 2, { attack: 0.5, release: 0.12 });
    if (v < 0 || v > 1 || !Number.isFinite(v)) okSoFar = false;
  }
  return okSoFar;
})());

// --- createLevelFollower ---
const f = createLevelFollower({ floor: 0.02, ceiling: 0.35, gain: 1, attack: 0.5, release: 0.12 });
ok('starts at zero', f.value === 0);
ok('push returns the new value', typeof f.push(0.3) === 'number');
let v = 0;
for (let i = 0; i < 50; i++) v = f.push(0.35);
ok('follows a loud signal up', v > 0.9, String(v));
for (let i = 0; i < 400; i++) v = f.push(0);
ok('returns to silence', v < 0.01, String(v));
f.reset();
ok('reset clears state', f.value === 0);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/audio-level.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/core/audio-level.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/audio-level.js`:

```js
// Turning an audio buffer into a modulation value.
//
// Pure maths, no Web Audio and no DOM, so it can be tested in Node. The Web
// Audio wiring lives in audio-input.js.

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// AnalyserNode.getByteTimeDomainData centres silence on 128.
export function rmsFromTimeDomain(bytes) {
  const n = bytes?.length ?? 0;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = (bytes[i] - 128) / 128;
    sum += s * s;
  }
  return clamp01(Math.sqrt(sum / n));
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
  const coefficient = target > previous ? attack : release;
  return clamp01(previous + (target - previous) * clamp01(coefficient));
}

export function createLevelFollower(options = {}) {
  let value = 0;
  return {
    get value() {
      return value;
    },
    push(rms) {
      value = smoothLevel(value, normalizeLevel(rms, options), options);
      return value;
    },
    reset() {
      value = 0;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/audio-level.test.mjs`
Expected: every line `PASS`, final line `ALL PASS`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/audio-level.js tests/audio-level.test.mjs
git commit -m "Add pure audio level maths for the audio modulation source"
```

---

### Task 2: The `audio` modulation source

**Files:**
- Modify: `src/core/modulation.js`
- Test: `tests/audio-level.test.mjs` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `createDefaultModulation()` gains a fourth source: `audio1: { type: 'audio', gain: 1 }`.
  - The rack gains `setAudioLevel(level: number) => void`, storing a clamped `[0, 1]` value.
  - `evaluateSources()` serves `audio` sources as `storedLevel * (src.gain ?? 1)`, clamped to `[0, 1]`.

- [ ] **Step 1: Add the source type**

In `src/core/modulation.js`, find:

```js
export function createDefaultModulation() {
  return {
    enabled: false,
    loopLength: 4.0,
    sources: {
      lfo1: { type: 'lfo', shape: 'sine', rate: 0.5, phase: 0 },
      noise1: { type: 'noise', rate: 0.35, octaves: 3, seed: 1 },
      env1: { type: 'env', attack: 0.08, hold: 0.06, decay: 0.9 },
    },
    routes: [],
  };
}
```

Replace with:

```js
export function createDefaultModulation() {
  return {
    enabled: false,
    loopLength: 4.0,
    sources: {
      lfo1: { type: 'lfo', shape: 'sine', rate: 0.5, phase: 0 },
      noise1: { type: 'noise', rate: 0.35, octaves: 3, seed: 1 },
      env1: { type: 'env', attack: 0.08, hold: 0.06, decay: 0.9 },
      // Inert until an audio input is attached and pushes a level in.
      audio1: { type: 'audio', gain: 1 },
    },
    routes: [],
  };
}
```

- [ ] **Step 2: Store and serve the level**

In `src/core/modulation.js`, find:

```js
export function createModulationRack(initialConfig) {
  let config = initialConfig || createDefaultModulation();
  let triggerTime = -Infinity;
```

Replace with:

```js
export function createModulationRack(initialConfig) {
  let config = initialConfig || createDefaultModulation();
  let triggerTime = -Infinity;
  // Pushed in from outside once per frame by the studio. Stays 0 when no audio
  // input is attached, which makes audio routes inert rather than broken.
  let audioLevel = 0;
```

Then find:

```js
      } else if (src.type === 'env') {
        out[id] = envelopeValue(time - triggerTime, src);
      } else {
        out[id] = 0;
      }
```

Replace with:

```js
      } else if (src.type === 'env') {
        out[id] = envelopeValue(time - triggerTime, src);
      } else if (src.type === 'audio') {
        // [0, 1] like an envelope — an amplitude has no meaningful negative half.
        out[id] = Math.min(1, Math.max(0, audioLevel * (src.gain ?? 1)));
      } else {
        out[id] = 0;
      }
```

Then find:

```js
    trigger(time) {
      triggerTime = time;
    },
```

Add directly below it:

```js
    setAudioLevel(level) {
      audioLevel = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
    },
    get audioLevel() {
      return audioLevel;
    },
```

- [ ] **Step 3: Extend the test**

Append to `tests/audio-level.test.mjs`, immediately **before** the final `console.log(failures === 0 ...)` line:

```js
// --- the audio source inside the rack ---
const { createModulationRack, createDefaultModulation } = await import('../src/core/modulation.js');

const defs = { edgeGlow: { type: 'number', section: 'colors', min: 0, max: 3, step: 0.05 } };
const cfg = createDefaultModulation();
ok('default config ships an audio source', cfg.sources.audio1?.type === 'audio');

cfg.enabled = true;
cfg.routes = [{ source: 'audio1', dest: 'edgeGlow', amount: 1 }];
const rack = createModulationRack(cfg);

ok('audio source is inert before any level is pushed',
  Object.keys(rack.apply({ edgeGlow: 1.2 }, defs, 0).params).length === 0 ||
  rack.apply({ edgeGlow: 1.2 }, defs, 0).params.edgeGlow === 1.2);

rack.setAudioLevel(1);
const loudParams = rack.apply({ edgeGlow: 1.2 }, defs, 0).params;
ok('a loud level moves the destination', loudParams.edgeGlow > 1.2, String(loudParams.edgeGlow));
ok('destination is still clamped to its range', loudParams.edgeGlow <= 3);

rack.setAudioLevel(0);
ok('silence returns to base', Math.abs(rack.apply({ edgeGlow: 1.2 }, defs, 0).params.edgeGlow - 1.2) < 1e-9);

rack.setAudioLevel(5);
ok('out-of-range levels are clamped', rack.audioLevel === 1);
rack.setAudioLevel(NaN);
ok('NaN levels fall back to 0', rack.audioLevel === 0);
rack.setAudioLevel(-2);
ok('negative levels clamp to 0', rack.audioLevel === 0);

// an unknown source type must stay inert (backwards compatibility)
const legacy = createModulationRack({
  enabled: true, sources: { weird1: { type: 'from-the-future' } },
  routes: [{ source: 'weird1', dest: 'edgeGlow', amount: 1 }],
});
ok('unknown source types stay inert',
  Object.keys(legacy.apply({ edgeGlow: 1.2 }, defs, 0).params).length === 0 ||
  legacy.apply({ edgeGlow: 1.2 }, defs, 0).params.edgeGlow === 1.2);
```

- [ ] **Step 4: Run the test**

Run: `node tests/audio-level.test.mjs`
Expected: `ALL PASS`.

Also confirm nothing else regressed:
Run: `for f in tests/*.test.mjs; do node "$f" | tail -1; done`
Expected: five `ALL PASS` lines.

- [ ] **Step 5: Commit**

```bash
git add src/core/modulation.js tests/audio-level.test.mjs
git commit -m "Add an audio source type to the modulation rack"
```

---

### Task 3: Web Audio input

**Files:**
- Create: `src/core/audio-input.js`
- Modify: `src/core/studio.js`

**Interfaces:**
- Consumes: `createLevelFollower` from `./audio-level.js`.
- Produces:
  - `createAudioInput(options) => input` with:
    - `async startMic() => boolean` — requests `getUserMedia({ audio: true })`, wires it into an `AnalyserNode`. Returns `false` (and logs a warning) if denied or unsupported; never throws.
    - `startTestTone(frequency = 220) => boolean` — an internal `OscillatorNode`, so the pipeline can be verified without a microphone or a user gesture.
    - `read() => number` — samples the analyser and returns the smoothed level in `[0, 1]`. Returns `0` when nothing is running.
    - `stop()` — stops tracks/oscillator, closes the context, resets the follower.
    - `isActive` getter, `mode` getter (`'mic' | 'tone' | null`).
    - `setOptions(partial)` — update gain / floor / ceiling / attack / release live.
  - On `OrbStudio`: `this.audioInput` (an input instance) and `enableAudio(mode)` / `disableAudio()`.

- [ ] **Step 1: Write the audio input module**

Create `src/core/audio-input.js`:

```js
// Web Audio wiring for the `audio` modulation source.
//
// Kept apart from audio-level.js so the maths stays testable in Node; everything
// here needs a browser. Failure is always soft — the orb must keep running when
// a microphone is denied or unavailable.

import { createLevelFollower } from './audio-level.js';

const FFT_SIZE = 1024;

export function createAudioInput(options = {}) {
  let context = null;
  let analyser = null;
  let buffer = null;
  let stream = null;
  let oscillator = null;
  let mode = null;
  const follower = createLevelFollower(options);
  let settings = { ...options };

  function ensureContext() {
    if (!context) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (!analyser) {
      analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      buffer = new Uint8Array(analyser.fftSize);
    }
    return context;
  }

  async function startMic() {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('Microphone capture is not available in this browser.');
      return false;
    }
    if (!ensureContext()) {
      console.warn('Web Audio is not available in this browser.');
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Leave processing off: AGC and noise suppression fight the level
        // follower and make the orb's response depend on the browser's guesses.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      console.warn('Microphone access was refused or failed', err);
      return false;
    }
    // Autoplay policy can leave a fresh context suspended.
    if (context.state === 'suspended') await context.resume();
    context.createMediaStreamSource(stream).connect(analyser);
    mode = 'mic';
    return true;
  }

  function startTestTone(frequency = 220) {
    stop();
    if (!ensureContext()) return false;
    oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    // Analyser output is not routed to the speakers — this drives the level, it
    // is not meant to be heard.
    oscillator.connect(analyser);
    oscillator.start();
    mode = 'tone';
    return true;
  }

  function read() {
    if (!analyser || !mode) return 0;
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const s = (buffer[i] - 128) / 128;
      sum += s * s;
    }
    return follower.push(Math.sqrt(sum / buffer.length));
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (oscillator) {
      try { oscillator.stop(); } catch { /* already stopped */ }
      oscillator.disconnect();
      oscillator = null;
    }
    mode = null;
    follower.reset();
  }

  return {
    startMic,
    startTestTone,
    read,
    stop,
    get isActive() {
      return mode !== null;
    },
    get mode() {
      return mode;
    },
    get level() {
      return follower.value;
    },
    setOptions(partial) {
      settings = { ...settings, ...partial };
      Object.assign(options, settings);
    },
    dispose() {
      stop();
      analyser = null;
      buffer = null;
      if (context) {
        context.close().catch(() => {});
        context = null;
      }
    },
  };
}
```

- [ ] **Step 2: Wire it into the studio**

In `src/core/studio.js`, find:

```js
import { isSweepable, sweepValues } from './sweep.js';
```

Add directly below it:

```js
import { createAudioInput } from './audio-input.js';
```

Then find this line in the constructor:

```js
    this.sweepInfo = null;
```

Add directly below it:

```js
    // Created lazily: constructing an AudioContext before any user gesture is
    // wasteful and some browsers start it suspended anyway.
    this.audioInput = null;
```

Then find, in `renderFrame()`:

```js
    const mod = this.modulation.apply(this.baseParams, this.paramDefs, this.virtualTime);
```

Insert directly **above** it:

```js
    // Sample audio before evaluating the rack so an `audio` source sees this
    // frame's level rather than the previous one's.
    if (this.audioInput?.isActive) {
      this.modulation.setAudioLevel(this.audioInput.read());
    }

```

Then find the method `enterSweepMode(state, { paramKey, steps = 5 } = {}) {` and insert these two methods immediately **above** it:

```js
  // `mode` is 'mic' or 'tone'. Returns whether the input actually started —
  // a refused microphone is a normal outcome, not an error.
  async enableAudio(mode = 'mic') {
    if (!this.audioInput) this.audioInput = createAudioInput();
    const started = mode === 'tone'
      ? this.audioInput.startTestTone()
      : await this.audioInput.startMic();
    if (!started) this.modulation.setAudioLevel(0);
    return started;
  }

  disableAudio() {
    this.audioInput?.stop();
    // Leave the rack at zero, or every audio route freezes at its last value.
    this.modulation.setAudioLevel(0);
  }

```

- [ ] **Step 3: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/audio-input.js src/core/studio.js
git commit -m "Wire a Web Audio analyser into the studio's modulation rack"
```

---

### Task 4: Motion Lab controls and level meter

**Files:**
- Modify: `src/ui/studio-ui.js`
- Modify: `src/style.css` (append at end)

**Interfaces:**
- Consumes: `studio.enableAudio`, `studio.disableAudio`, `studio.audioInput`, `studio.modulation.audioLevel`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the controls to the Motion Lab**

In `src/ui/studio-ui.js`, find this block inside `renderMotionLabTab()`:

```js
          <div class="control-row">
            <label class="ctrl-label">Fire Envelope</label>
            <button class="btn-sm btn-accent" id="btn-mod-trigger">Trigger</button>
          </div>
        </div>
      </div>
```

Replace it with:

```js
          <div class="control-row">
            <label class="ctrl-label">Fire Envelope</label>
            <button class="btn-sm btn-accent" id="btn-mod-trigger">Trigger</button>
          </div>

          <div class="control-row">
            <label class="ctrl-label">Audio Input</label>
            <div class="audio-input-row">
              <button class="btn-sm ${this.studio.audioInput?.mode === 'mic' ? 'btn-accent' : ''}" id="btn-audio-mic">Mic</button>
              <button class="btn-sm ${this.studio.audioInput?.mode === 'tone' ? 'btn-accent' : ''}" id="btn-audio-tone">Test Tone</button>
              <button class="btn-sm" id="btn-audio-off">Off</button>
            </div>
          </div>
          <div class="control-row">
            <label class="ctrl-label">Level</label>
            <div class="audio-meter"><div class="audio-meter-fill" id="audio-meter-fill"></div></div>
          </div>
          ${slider('data-mod-src="audio1" data-mod-field="gain"', 'Audio Gain', src.audio1?.gain ?? 1, 0, 4, 0.05)}
        </div>
      </div>
```

- [ ] **Step 2: Wire the buttons and the meter**

In `src/ui/studio-ui.js`, find this block inside `attachMotionLabListeners()`:

```js
    this.root.querySelector('#btn-mod-trigger')?.addEventListener('click', () => {
      this.studio.modulation.trigger(this.studio.virtualTime);
    });
```

Add directly below it:

```js
    this.root.querySelector('#btn-audio-mic')?.addEventListener('click', async () => {
      const started = await this.studio.enableAudio('mic');
      if (!started) alert('Could not access the microphone. Check the browser permission prompt.');
      mod.enabled = true;
      commit(true);
    });

    this.root.querySelector('#btn-audio-tone')?.addEventListener('click', () => {
      this.studio.enableAudio('tone');
      mod.enabled = true;
      commit(true);
    });

    this.root.querySelector('#btn-audio-off')?.addEventListener('click', () => {
      this.studio.disableAudio();
      commit(true);
    });

    // The meter is driven off the rack's stored level rather than its own
    // analyser read, so it shows exactly what the routes are receiving.
    clearInterval(this._audioMeterId);
    this._audioMeterId = setInterval(() => {
      const fill = this.root.querySelector('#audio-meter-fill');
      if (!fill) {
        clearInterval(this._audioMeterId);
        this._audioMeterId = null;
        return;
      }
      fill.style.width = `${Math.round((this.studio.modulation.audioLevel ?? 0) * 100)}%`;
    }, 100);
```

- [ ] **Step 3: Append the styles**

Append to the end of `src/style.css`:

```css

/* ---------------------------------------------------------------------------
   Audio input controls and level meter in the Motion Lab.
   --------------------------------------------------------------------------- */
.audio-input-row {
  display: flex;
  gap: 6px;
}

.audio-meter {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.audio-meter-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--accent-cyan), var(--primary));
  /* No transition: this is a level readout, and easing it would misreport how
     fast the signal is actually moving. */
}
```

- [ ] **Step 4: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 5: Verify in the browser**

Dev server running (`npm run dev`), open http://localhost:5173. The test tone needs no microphone permission and no user gesture, so it can be driven from the console:

```js
const { studio: s, state: st, ui } = window.__orb;

// route audio at a visible destination
st.modulation.enabled = true;
st.modulation.routes = [{ source: 'audio1', dest: 'edgeGlow', amount: 1 }];
s.syncModulation(st);

const started = await s.enableAudio('tone');
const levels = new Set();
const glows = new Set();
for (let i = 0; i < 60; i++) {
  s.renderFrame();                       // step manually: a hidden pane has no rAF
  levels.add(s.modulation.audioLevel.toFixed(3));
  if (s.lastModulated.edgeGlow !== undefined) glows.add(s.lastModulated.edgeGlow.toFixed(3));
}
JSON.stringify({
  started,
  mode: s.audioInput.mode,                 // expect "tone"
  levelRose: Math.max(...[...levels].map(Number)) > 0.1,
  distinctLevels: levels.size,
  distinctGlows: glows.size,               // expect > 1 — audio is driving the param
  baseUntouched: st.engines[st.engine].edgeGlow,
}, null, 2);
```

Expected: `started: true`, `mode: "tone"`, `levelRose: true`, `distinctGlows` greater than 1, and `baseUntouched` unchanged.

Then confirm teardown zeroes the rack:

```js
window.__orb.studio.disableAudio();
for (let i = 0; i < 5; i++) window.__orb.studio.renderFrame();
JSON.stringify({
  active: window.__orb.studio.audioInput.isActive,   // expect false
  level: window.__orb.studio.modulation.audioLevel,  // expect 0
});
```

**Microphone capture must be confirmed by a human** — `getUserMedia` needs a real user gesture and a permission grant. Open the Motion Lab tab, click **Mic**, accept the prompt, and confirm the level meter responds to speech and the orb moves with it.

- [ ] **Step 6: Commit**

```bash
git add src/ui/studio-ui.js src/style.css
git commit -m "Add audio input controls and a level meter to the Motion Lab"
```

---

## Definition of done

- `node tests/audio-level.test.mjs` prints `ALL PASS`, and the other four suites still do.
- `npx vite build` succeeds.
- A test tone drives a routed parameter; the level meter tracks it.
- Turning audio off returns the rack level to 0 and the parameter to base.
- A denied or unavailable microphone logs a warning and leaves the orb running.
- Configs saved before this change still load, and unknown source types stay inert.
- Microphone capture confirmed by hand.
- No console errors beyond intentional warnings.

## Follow-up worth noting

Once this lands, `speaking` becomes designable and the exploration question in `docs/VISION.md` §2 can be attempted properly. Update the capability inventory in that document's appendix in the same commit as your last task — it went stale immediately last time.
