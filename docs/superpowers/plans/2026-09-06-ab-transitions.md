# A/B Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the A/B swap *travel* between two configurations over time instead of cutting, so the transition itself becomes something you can look at and judge.

**Architecture:** A/B compare currently applies a stored config instantly. That answers "which of these two looks better" but says nothing about the half of an AI orb's motion vocabulary that lives in *getting there* — how listening becomes thinking. This adds a parameter tween: a pure interpolator over the schema, driven from the studio's render loop, writing into `baseParams` so the existing modulation rack layers on top untouched. **This is deliberately not a state machine** — no named states, no schema, no persistence. It is an instrument for discovering what transitions feel like, which is a prerequisite for specifying them later.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework.
- **ES modules**, `"type": "module"`.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No test framework; do not add one. Exit `0` on pass, `1` on fail.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Do not introduce named states or a config schema.** See `docs/VISION.md` §3 — specification comes after exploration, and this sprint is on the exploration side of that line. A tween has a duration and a curve; it does not have a name.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: `/Users/ahmetbektes/WDesignspace/orb-animation`. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` §3 and §5 before starting.

**The parameter schema** (`ENGINE_PARAM_DEFINITIONS` in `src/core/state.js`) is keyed by engine id; each entry looks like:

```js
edgeGlow: { type: 'number', label: 'Edge Luma', min: 0, max: 3, step: 0.05, default: 1.2, section: 'colors' }
color1:   { type: 'color',  label: 'Primary', default: '#ffed00', section: 'colors' }
shape:    { type: 'select', label: 'Lattice', options: ['sphere','cube'], default: 'sphere', section: 'geometry' }
```

Only `number` and `color` can be interpolated. A `select` cannot be halfway between `sphere` and `cube`.

**A/B compare** (`src/core/ab-compare.js`) exposes:

```js
snapshotState(state) => { engine, global, modulation, params }   // deep copy, active engine only
applySnapshot(state, snapshot) => boolean                        // in place; true if engine changed
createAbCompare(studio, state) => { store, has, activate, swap, activeSlot }
```

`swap()` currently calls `applySnapshot` then `studio.updateParameters(state)` (same engine) or `studio.setEngine` (different engine). It is bound to `` ` `` in `src/main.js`; `1` and `2` store slots.

**How parameters reach an engine each frame** (`OrbStudio.renderFrame()` in `src/core/studio.js`):

```js
const mod = this.modulation.apply(this.baseParams, this.paramDefs, this.virtualTime);
if (!this.isPaused) this.virtualTime += delta * this.timeScale * mod.timeScale;
this.applyModulatedParams(mod.params);
```

`this.baseParams` is the studio's copy of the active engine's parameters — the unmodulated truth. `applyModulatedParams()` pushes only changed keys and restores base when a route stops driving a key. **A tween must write `this.baseParams`**, so modulation continues to layer on top of the moving base rather than fighting it.

**Critical invariant** (`docs/VISION.md` §5): never reassign `state`, `state.global` or `state.engines[<id>]` — they are held by reference across `main.js`, `StudioUI` and `OrbStudio`. Always `Object.assign` into the existing object.

**Existing keybindings — do not collide.** `src/ui/studio-ui.js`: `Space`, `R`, `H`, `S`, `Escape`. `src/main.js`: `G`, `K`, `1`, `2`, `` ` ``, and in grid mode `M`, `T`, `E`. **Note:** `src/main.js` has a single guard `if (e.metaKey || e.ctrlKey || e.altKey) return;` at the top of its keydown handler — do not add modifier-based shortcuts, they will never fire.

**Browser verification handle:** `window.__orb = { studio, state, ui, ab }`.

**CRITICAL browser gotchas:**
- A hidden Browser pane means `requestAnimationFrame` never fires and the render loop is frozen. `studio.fpsTracker.fps` still reports its default `60`, so it is not a liveness signal. Step frames with `studio.renderFrame()`.
- CSS transitions are frozen for the same reason; `getComputedStyle()` on a transitioning property returns the starting value forever.
- **For this sprint specifically:** the tween advances on `delta` from `studio.clock`. When you step `renderFrame()` by hand in a hidden pane, `clock.getDelta()` returns tiny values, so a 400 ms tween will not complete in 20 manual frames. Drive the tween directly with `studio.paramTween.advance(ms)` in tests rather than relying on wall-clock frames.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/easing.js` | **Create.** Named easing curves. Pure. |
| `src/core/param-tween.js` | **Create.** Interpolation between two parameter sets. Pure, no DOM, no Three.js. |
| `src/core/studio.js` | **Modify.** Own the tween and advance it in `renderFrame()`. |
| `src/core/ab-compare.js` | **Modify.** Route the swap through the tween when a duration is set. |
| `src/main.js` | **Modify.** Duration/curve controls and readout. |
| `src/style.css` | **Modify.** Append control styles. |
| `tests/param-tween.test.mjs` | **Create.** Node tests for easing and interpolation. |

---

### Task 1: Easing curves

**Files:**
- Create: `src/core/easing.js`
- Test: `tests/param-tween.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `EASINGS: Record<string, (t: number) => number>` with exactly these keys: `linear`, `easeOut`, `easeInOut`, `spring`, `snap`.
  - Every curve maps `0 → 0` and `1 → 1` and accepts `t` in `[0, 1]`.
  - `spring` deliberately overshoots above 1 before settling — that overshoot is the point, it is what makes motion read as physical rather than mechanical.
  - `snap` is heavily front-loaded: most of the distance is covered in the first third.
  - `EASING_NAMES: string[]` — the keys, in display order.
  - `applyEasing(name, t) => number` — falls back to `linear` for an unknown name.

- [ ] **Step 1: Write the failing test**

Create `tests/param-tween.test.mjs`:

```js
import { EASINGS, EASING_NAMES, applyEasing } from '../src/core/easing.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

ok('exposes the five named curves',
  JSON.stringify(EASING_NAMES) === JSON.stringify(['linear', 'easeOut', 'easeInOut', 'spring', 'snap']));

for (const name of EASING_NAMES) {
  const fn = EASINGS[name];
  ok(`${name} starts at 0`, Math.abs(fn(0)) < 1e-9, String(fn(0)));
  ok(`${name} ends at 1`, Math.abs(fn(1) - 1) < 1e-9, String(fn(1)));
  ok(`${name} is finite throughout`, (() => {
    for (let t = 0; t <= 1; t += 0.01) if (!Number.isFinite(fn(t))) return false;
    return true;
  })());
}

ok('spring overshoots above 1', (() => {
  for (let t = 0; t <= 1; t += 0.005) if (EASINGS.spring(t) > 1.02) return true;
  return false;
})());
ok('easeOut never overshoots', (() => {
  for (let t = 0; t <= 1; t += 0.005) if (EASINGS.easeOut(t) > 1.0001) return false;
  return true;
})());
ok('snap is front-loaded', EASINGS.snap(0.33) > 0.6, String(EASINGS.snap(0.33)));
ok('linear is the identity', Math.abs(EASINGS.linear(0.42) - 0.42) < 1e-9);
ok('easeInOut is symmetric about the midpoint',
  Math.abs(EASINGS.easeInOut(0.25) - (1 - EASINGS.easeInOut(0.75))) < 1e-6);

ok('applyEasing dispatches by name', Math.abs(applyEasing('linear', 0.3) - 0.3) < 1e-9);
ok('applyEasing falls back to linear', Math.abs(applyEasing('nope', 0.3) - 0.3) < 1e-9);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/param-tween.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/core/easing.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/easing.js`:

```js
// Named easing curves for parameter tweens.
//
// All map 0 -> 0 and 1 -> 1. `spring` is allowed to exceed 1 in between: that
// overshoot is what makes a transition read as physical rather than mechanical,
// so it is a feature and callers must tolerate values above 1 mid-flight.

export const EASINGS = {
  linear: (t) => t,

  easeOut: (t) => 1 - Math.pow(1 - t, 3),

  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),

  // Damped oscillation, pinned to exactly 1 at t = 1.
  spring: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - Math.pow(2, -10 * t) * Math.cos((t * 10 - 0.75) * ((2 * Math.PI) / 3));
  },

  // Most of the distance in the first third, then a long settle. Reads as
  // "reacted immediately, then thought about it".
  snap: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - Math.pow(1 - t, 6);
  },
};

export const EASING_NAMES = ['linear', 'easeOut', 'easeInOut', 'spring', 'snap'];

export function applyEasing(name, t) {
  return (EASINGS[name] || EASINGS.linear)(t);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/param-tween.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add src/core/easing.js tests/param-tween.test.mjs
git commit -m "Add named easing curves for parameter tweens"
```

---

### Task 2: The parameter tween

**Files:**
- Create: `src/core/param-tween.js`
- Test: `tests/param-tween.test.mjs` (extend)

**Interfaces:**
- Consumes: `applyEasing` from `./easing.js`.
- Produces:
  - `lerpHexColor(from: string, to: string, t: number) => string` — component-wise RGB interpolation, returns `#rrggbb`. Falls back to `to` if either input is not `#rrggbb`.
  - `interpolateParams(from, to, defs, t) => object` — for every key in `to`: `number` lerps and clamps to `[min, max]`; `color` uses `lerpHexColor`; anything else (including `select`) snaps at `t >= 0.5`. Keys absent from `defs` are copied from `to` unchanged at `t >= 0.5`.
  - `createParamTween()` → object with:
    - `start(from, to, defs, { durationMs = 400, easing = 'easeOut' }) => void`
    - `advance(deltaMs) => object | null` — advances the clock and returns the interpolated params, or `null` when nothing is running.
    - `isRunning` getter
    - `progress` getter — raw `[0, 1]`, before easing
    - `cancel()`
    - A tween with `durationMs <= 0` completes on its first `advance()` and yields exactly `to`.

- [ ] **Step 1: Extend the test**

Insert the following into `tests/param-tween.test.mjs`, immediately **before** the final `console.log(failures === 0 ...)` line:

```js
// --- param tween ---
const { lerpHexColor, interpolateParams, createParamTween } = await import('../src/core/param-tween.js');

const DEFS = {
  edgeGlow: { type: 'number', min: 0, max: 3, step: 0.05, section: 'colors' },
  color1:   { type: 'color', section: 'colors' },
  shape:    { type: 'select', options: ['sphere', 'cube'], section: 'geometry' },
};

// lerpHexColor
ok('colour lerp endpoints', lerpHexColor('#000000', '#ffffff', 0) === '#000000' && lerpHexColor('#000000', '#ffffff', 1) === '#ffffff');
ok('colour lerp midpoint', lerpHexColor('#000000', '#ffffff', 0.5) === '#808080', lerpHexColor('#000000', '#ffffff', 0.5));
ok('colour lerp always valid hex', (() => {
  for (let t = 0; t <= 1; t += 0.05) if (!/^#[0-9a-f]{6}$/i.test(lerpHexColor('#ffed00', '#057eff', t))) return false;
  return true;
})());
ok('colour lerp tolerates junk input', lerpHexColor('nope', '#ffffff', 0.5) === '#ffffff');

// interpolateParams
const A = { edgeGlow: 0, color1: '#000000', shape: 'sphere' };
const B = { edgeGlow: 3, color1: '#ffffff', shape: 'cube' };
ok('t=0 yields the source', JSON.stringify(interpolateParams(A, B, DEFS, 0)) === JSON.stringify(A));
ok('t=1 yields the target', JSON.stringify(interpolateParams(A, B, DEFS, 1)) === JSON.stringify(B));
const midway = interpolateParams(A, B, DEFS, 0.5);
ok('numbers lerp', Math.abs(midway.edgeGlow - 1.5) < 1e-9, String(midway.edgeGlow));
ok('colours lerp', midway.color1 === '#808080', midway.color1);
ok('selects snap at the midpoint', midway.shape === 'cube');
ok('selects hold before the midpoint', interpolateParams(A, B, DEFS, 0.49).shape === 'sphere');
ok('numbers stay clamped even when eased past 1',
  interpolateParams(A, B, DEFS, 1.3).edgeGlow === 3, String(interpolateParams(A, B, DEFS, 1.3).edgeGlow));
ok('never emits NaN', (() => {
  for (let t = -0.2; t <= 1.4; t += 0.05) {
    const p = interpolateParams(A, B, DEFS, t);
    if (!Number.isFinite(p.edgeGlow)) return false;
  }
  return true;
})());

// createParamTween
const tw = createParamTween();
ok('idle tween returns null', tw.advance(16) === null && tw.isRunning === false);

tw.start(A, B, DEFS, { durationMs: 400, easing: 'linear' });
ok('starts running', tw.isRunning === true);
const first = tw.advance(200);
ok('midway value is between the endpoints', first.edgeGlow > 0 && first.edgeGlow < 3, String(first.edgeGlow));
ok('progress is tracked', Math.abs(tw.progress - 0.5) < 1e-6, String(tw.progress));
const last = tw.advance(200);
ok('lands exactly on the target', last.edgeGlow === 3 && last.color1 === '#ffffff' && last.shape === 'cube');
ok('stops running when complete', tw.isRunning === false);
ok('returns null after completing', tw.advance(16) === null);

// monotonic under a non-overshooting curve
const tw2 = createParamTween();
tw2.start(A, B, DEFS, { durationMs: 300, easing: 'easeOut' });
let prev = -Infinity, monotonic = true;
for (let i = 0; i < 40; i++) {
  const p = tw2.advance(10);
  if (!p) break;
  if (p.edgeGlow < prev - 1e-9) monotonic = false;
  prev = p.edgeGlow;
}
ok('easeOut progresses monotonically', monotonic);

// spring may overshoot mid-flight but must land exactly
const tw3 = createParamTween();
tw3.start({ edgeGlow: 0 }, { edgeGlow: 2 }, DEFS, { durationMs: 300, easing: 'spring' });
let sawOvershoot = false, lastVal = 0;
for (let i = 0; i < 40; i++) {
  const p = tw3.advance(10);
  if (!p) break;
  if (p.edgeGlow > 2.0001) sawOvershoot = true;
  lastVal = p.edgeGlow;
}
ok('spring lands exactly on target', lastVal === 2, String(lastVal));
ok('spring overshoot stays clamped to the param range', lastVal <= 3);

// zero duration completes immediately
const tw4 = createParamTween();
tw4.start(A, B, DEFS, { durationMs: 0 });
const instant = tw4.advance(16);
ok('zero duration lands immediately', instant.edgeGlow === 3 && tw4.isRunning === false);

// cancel
const tw5 = createParamTween();
tw5.start(A, B, DEFS, { durationMs: 400 });
tw5.cancel();
ok('cancel stops the tween', tw5.isRunning === false && tw5.advance(16) === null);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/param-tween.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/core/param-tween.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/param-tween.js`:

```js
// Interpolating between two parameter sets over time.
//
// This is an instrument for looking at transitions, not a state machine: a tween
// has a duration and a curve, and nothing else. Naming transitions is
// specification, which docs/VISION.md §3 defers until exploration has produced a
// vocabulary worth naming.
//
// Pure — no DOM, no Three.js — so it can be tested in Node.

import { applyEasing } from './easing.js';

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export function lerpHexColor(from, to, t) {
  const a = HEX.exec(from || '');
  const b = HEX.exec(to || '');
  if (!a || !b) return to;
  const mix = (i) => {
    const x = parseInt(a[i], 16);
    const y = parseInt(b[i], 16);
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  };
  return `#${mix(1)}${mix(2)}${mix(3)}`;
}

export function interpolateParams(from, to, defs, t) {
  const out = {};
  for (const [key, target] of Object.entries(to || {})) {
    const def = defs?.[key];
    const source = from?.[key];

    if (def?.type === 'number' && typeof source === 'number' && typeof target === 'number') {
      const raw = source + (target - source) * t;
      // A spring overshoots past 1, which would push a parameter outside its
      // declared range; each engine would then clamp it differently.
      const min = Number.isFinite(def.min) ? def.min : -Infinity;
      const max = Number.isFinite(def.max) ? def.max : Infinity;
      out[key] = Math.min(max, Math.max(min, raw));
    } else if (def?.type === 'color') {
      out[key] = lerpHexColor(source, target, Math.min(1, Math.max(0, t)));
    } else {
      // Selects and anything unrecognised cannot be halfway between two values.
      out[key] = t >= 0.5 ? target : (source ?? target);
    }
  }
  return out;
}

export function createParamTween() {
  let from = null;
  let to = null;
  let defs = null;
  let elapsed = 0;
  let duration = 0;
  let easing = 'easeOut';
  let running = false;

  return {
    get isRunning() {
      return running;
    },
    get progress() {
      return duration > 0 ? Math.min(1, elapsed / duration) : 1;
    },
    start(nextFrom, nextTo, paramDefs, { durationMs = 400, easing: curve = 'easeOut' } = {}) {
      from = { ...nextFrom };
      to = { ...nextTo };
      defs = paramDefs || {};
      duration = Math.max(0, durationMs);
      easing = curve;
      elapsed = 0;
      running = true;
    },
    advance(deltaMs) {
      if (!running) return null;
      elapsed += Math.max(0, deltaMs);
      const raw = duration > 0 ? Math.min(1, elapsed / duration) : 1;
      if (raw >= 1) {
        running = false;
        // Land exactly on the target rather than on whatever the curve returned
        // at t = 1, so a tween can never leave a parameter fractionally off.
        return { ...to };
      }
      return interpolateParams(from, to, defs, applyEasing(easing, raw));
    },
    cancel() {
      running = false;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/param-tween.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add src/core/param-tween.js tests/param-tween.test.mjs
git commit -m "Add a parameter tween with clamped interpolation"
```

---

### Task 3: Drive the tween from the studio

**Files:**
- Modify: `src/core/studio.js`

**Interfaces:**
- Consumes: `createParamTween` from `./param-tween.js`.
- Produces:
  - `studio.paramTween` — the tween instance.
  - `studio.tweenTo(targetParams, { durationMs, easing }) => void` — starts a tween from the current `baseParams`.
  - Each frame, while the tween runs, the studio writes the interpolated values into `this.baseParams` and pushes them to the engine.

- [ ] **Step 1: Add the import and the instance**

In `src/core/studio.js`, find:

```js
import { isSweepable, sweepValues } from './sweep.js';
```

Add directly below it:

```js
import { createParamTween } from './param-tween.js';
```

Then find this line in the constructor:

```js
    this.sweepInfo = null;
```

Add directly below it:

```js
    // Tweens move baseParams, so the modulation rack keeps layering on top of a
    // moving base rather than fighting it.
    this.paramTween = createParamTween();
```

- [ ] **Step 2: Advance the tween each frame**

In `src/core/studio.js`, find this in `renderFrame()`:

```js
    const mod = this.modulation.apply(this.baseParams, this.paramDefs, this.virtualTime);
```

Insert directly **above** it:

```js
    // Advance before evaluating the rack so modulation reads this frame's base.
    // Real milliseconds, not virtualTime: a transition's duration should not
    // change when playback speed does.
    if (this.paramTween.isRunning) {
      const tweened = this.paramTween.advance(delta * 1000);
      if (tweened) {
        Object.assign(this.baseParams, tweened);
        this.applyModulatedParams({});
        if (typeof this.activeEngine?.setParams === 'function') {
          this.activeEngine.setParams(tweened);
        } else if (typeof this.activeEngine?.onParamsChange === 'function') {
          this.activeEngine.onParamsChange(tweened);
        }
      }
    }

```

- [ ] **Step 3: Add the entry point**

In `src/core/studio.js`, find the method `syncModulation(state) {` and insert this immediately **above** it:

```js
  // Travel from the current base to `targetParams`. Passing durationMs 0 is a
  // hard cut, which is what A/B did before transitions existed.
  tweenTo(targetParams, { durationMs = 400, easing = 'easeOut' } = {}) {
    if (durationMs <= 0) {
      Object.assign(this.baseParams, targetParams);
      this.paramTween.cancel();
      return;
    }
    this.paramTween.start({ ...this.baseParams }, targetParams, this.paramDefs, { durationMs, easing });
  }

```

- [ ] **Step 4: Cancel the tween when the engine changes**

A tween holds parameters for the engine that was active when it started; letting it keep running across an engine swap would write those into the new engine. In `src/core/studio.js`, find in `setEngine()`:

```js
    this.baseParams = { ...state.engines[type] };
    this.paramDefs = ENGINE_PARAM_DEFINITIONS[type] || {};
    this.lastModulated = {};
```

Replace with:

```js
    this.baseParams = { ...state.engines[type] };
    this.paramDefs = ENGINE_PARAM_DEFINITIONS[type] || {};
    this.lastModulated = {};
    // A tween in flight targets the previous engine's parameters.
    this.paramTween.cancel();
```

- [ ] **Step 5: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/studio.js
git commit -m "Advance parameter tweens from the studio render loop"
```

---

### Task 4: Route the A/B swap through the tween

**Files:**
- Modify: `src/core/ab-compare.js`
- Modify: `src/main.js`
- Modify: `src/style.css` (append at end)

**Interfaces:**
- Consumes: `studio.tweenTo`.
- Produces: `createAbCompare(studio, state, options)` gains a third argument `{ getTransition: () => ({ durationMs, easing }) }`. When omitted, behaviour is unchanged (hard cut), so existing callers and tests keep passing.

- [ ] **Step 1: Give the swap a transition**

In `src/core/ab-compare.js`, find:

```js
export function createAbCompare(studio, state) {
  const slots = { a: null, b: null };
  let activeSlot = null;

  function apply(slot) {
    const snapshot = slots[slot];
    if (!snapshot) return null;
    const engineChanged = applySnapshot(state, snapshot);
    if (engineChanged) {
      // Unavoidable rebuild: the two slots hold different engines.
      studio.setEngine(state.engine, state);
    } else {
      // Same engine — push params into the live engine so rotation phase and
      // virtualTime survive the flip. That continuity is the whole point.
      studio.updateParameters(state);
    }
    activeSlot = slot;
    return slot;
  }
```

Replace with:

```js
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
        // updateParameters first so global settings and modulation land
        // immediately, then travel the engine parameters over time.
        const target = { ...state.engines[state.engine] };
        studio.updateParameters(state);
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
```

- [ ] **Step 2: Add the controls in main.js**

In `src/main.js`, find:

```js
import { createAbCompare } from './core/ab-compare.js';
```

Add directly below it:

```js
import { EASING_NAMES } from './core/easing.js';
```

Then find:

```js
const ab = createAbCompare(studio, state);
```

Replace with:

```js
// Transition settings for the A/B swap. Duration 0 is a hard cut, which is how
// A/B behaved before transitions existed.
const TRANSITION_DURATIONS = [0, 200, 400, 900];
let transitionIndex = 2;
let transitionEasing = 'easeOut';

const ab = createAbCompare(studio, state, {
  getTransition: () => ({ durationMs: TRANSITION_DURATIONS[transitionIndex], easing: transitionEasing }),
});
```

Then find the `abHint` function and replace it with:

```js
// Name the slot that is still empty, rather than assuming A is always filled
// first — pressing 2 before 1 used to produce "press 2 to fill B".
function abHint() {
  const empty = ['a', 'b'].find((slot) => !ab.has(slot));
  if (!empty) {
    const ms = TRANSITION_DURATIONS[transitionIndex];
    return `\` to swap · ${ms === 0 ? 'cut' : `${ms}ms ${transitionEasing}`} · D/F to change`;
  }
  return `press ${empty === 'a' ? '1' : '2'} to fill ${empty.toUpperCase()}`;
}
```

- [ ] **Step 3: Bind the transition keys**

In `src/main.js`, find:

```js
    if (e.code === 'Backquote') {
      e.preventDefault();
      const now = ab.swap();
      if (now) {
        ui.render();
        refreshAbReadout(true);
      }
      return;
    }
```

Add directly below it (still inside the `if (!studio.isGridMode) {` block):

```js
    // D cycles transition duration, F cycles the curve. Both are bare keys —
    // the handler returns early on any modifier.
    if (e.code === 'KeyD') {
      e.preventDefault();
      transitionIndex = (transitionIndex + 1) % TRANSITION_DURATIONS.length;
      refreshAbReadout();
      return;
    }
    if (e.code === 'KeyF') {
      e.preventDefault();
      const i = EASING_NAMES.indexOf(transitionEasing);
      transitionEasing = EASING_NAMES[(i + 1) % EASING_NAMES.length];
      refreshAbReadout();
      return;
    }
```

- [ ] **Step 4: Widen the readout**

Append to the end of `src/style.css`:

```css

/* The A/B hint carries transition settings once both slots are filled, so it
   needs more room than the original "` to swap". */
.ab-readout .ab-hint {
  max-width: 340px;
  white-space: nowrap;
}
```

- [ ] **Step 5: Verify the build and the existing tests**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

Run: `node tests/ab-compare.test.mjs`
Expected: `ALL PASS` — `createAbCompare`'s new third argument is optional, so the existing tests must be unaffected.

- [ ] **Step 6: Verify in the browser**

Dev server running, open http://localhost:5173:

```js
const { studio: s, state: st, ab } = window.__orb;
const key = 'edgeGlow';

st.engines[st.engine][key] = 0.2; s.updateParameters(st); ab.store('a');
st.engines[st.engine][key] = 2.8; s.updateParameters(st); ab.store('b');
for (let i = 0; i < 5; i++) s.renderFrame();

const engineBefore = s.activeEngine;
ab.swap();                                  // should start a tween, not cut

const samples = [];
// Drive the tween directly: a hidden pane produces tiny frame deltas, so
// wall-clock frames would never complete a 400ms transition.
for (let i = 0; i < 12; i++) {
  const v = s.paramTween.advance(40);
  if (!v) break;
  samples.push(+v[key].toFixed(3));
}

JSON.stringify({
  tweenStarted: samples.length > 1,
  samples,
  movesGradually: samples.length > 3,
  monotonic: samples.every((v, i) => i === 0 || v <= samples[i - 1] + 1e-6),
  landsOnTarget: samples[samples.length - 1] === 0.2,
  engineNotRebuilt: s.activeEngine === engineBefore,
  stoppedWhenDone: s.paramTween.isRunning === false,
}, null, 2);
```

Expected: `tweenStarted: true`, several intermediate `samples` between 2.8 and 0.2, `landsOnTarget: true`, `engineNotRebuilt: true`, `stoppedWhenDone: true`.

Then confirm duration 0 still cuts:

```js
const { studio: s, ab } = window.__orb;
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));  // 900
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));  // 0
ab.swap();
JSON.stringify({ tweenRunning: s.paramTween.isRunning });   // expect false — a cut
```

- [ ] **Step 7: Commit**

```bash
git add src/core/ab-compare.js src/main.js src/style.css
git commit -m "Give the A/B swap a duration and an easing curve"
```

---

## Definition of done

- `node tests/param-tween.test.mjs` prints `ALL PASS`, and the other suites still do.
- `npx vite build` succeeds.
- `` ` `` travels between slots over the configured duration instead of cutting.
- The engine is not rebuilt and `virtualTime` is not reset by a transition.
- `D` cycles duration (including 0 = cut), `F` cycles the curve, both shown in the readout.
- A tween in flight is cancelled when the engine changes.
- Numeric parameters never leave their declared range, even under `spring` overshoot.
- No console errors.

## Follow-up worth noting

This is the first time transitions are visible in the tool. If a transition character starts to feel nameable — "listening→thinking always wants a slow settle" — that observation is exactly the residue `docs/VISION.md` §3 is waiting for. Record it in the vision doc's open questions rather than encoding it in the format.
