# Rehearsal Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play a scripted sequence of kept findings on a loop, so an orb can be judged the way it will actually be seen — moving between states over time, not held still.

**Architecture:** Everything the tool captures is a single moment: one config, one still, one clip of one behaviour. But an AI orb is never seen as one moment — it is seen going from listening to thinking to speaking, and whether that reads is a property of the *sequence*, not of any config in it. Now that transitions and a findings shelf both exist, a sequence is just an ordered list of findings with a hold and a transition between each. Timing logic is a pure module driven by elapsed milliseconds; the studio applies each step with the `tweenTo` it already has.

**This is still exploration, not specification.** A step has a duration and a curve. It does not have a name, and there is no state vocabulary — see `docs/VISION.md` §3. Naming comes later, out of what this surfaces.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework. UI is HTML strings and DOM nodes.
- **ES modules**, `"type": "module"`.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No test framework; do not add one. Exit `0` on pass, `1` on fail. Anything tested must be free of DOM and Three.js.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Do not introduce named states or a config schema.** A sequence is an ordered list with timings.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: `/Users/ahmetbektes/WDesignspace/orb-animation`. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` first — §3 (exploration before specification) and §5 (invariants).

**Findings** (`src/core/findings.js`) are the kept configs this sequences. Store API: `list()` (newest first), `add(entry)`, `remove(id)`, `rename(id, note)`, `clear()`, plus a `lastError` getter. An entry is:

```js
{ id, createdAt, note, engine, global, params, modulation, thumb }
```

`thumb` is a JPEG data URL. The store lives at `ui.findings` (a `StudioUI` field).

**Transitions already exist.** `studio.tweenTo(targetParams, { durationMs, easing })` travels from the live `baseParams` to `targetParams`, writing into `baseParams` each frame so the modulation rack keeps layering on top. `durationMs <= 0` is a hard cut. Curves come from `EASING_NAMES` in `src/core/easing.js`: `['linear', 'easeOut', 'easeInOut', 'spring', 'snap']`.

`studio.paramTween` is the tween instance — `isRunning`, `progress`, `advance(deltaMs)`, `cancel()`.

**Important:** `studio.updateParameters(state)` **cancels any in-flight tween** (a direct edit supersedes a transition). A sequence player must therefore not route its steps through `updateParameters` — apply modulation and globals directly, exactly as `src/core/ab-compare.js` does:

```js
studio.syncModulation(state);
studio.updateGlobalSettings(state.global);
studio.tweenTo(target, transition);
```

**Critical invariant** (`docs/VISION.md` §5): never reassign `state`, `state.global`, or `state.engines[<id>]` — they are held by reference across `main.js`, `StudioUI` and `OrbStudio`. Always `Object.assign` into the existing object.

**A sequence step whose engine differs from the live one cannot be tweened** — switching engines disposes and rebuilds. Treat an engine change as a cut (`studio.setEngine`), the same way `ab-compare.js` does.

**The UI has two layers inside `ui.root`:** `ui.panelLayer` (rewritten by `render()`) and `ui.overlayLayer` (never rewritten — long-lived chrome lives there). Anything you mount for the whole session goes in `overlayLayer`; anything rendered as part of a tab goes in the normal `render()` markup. Do **not** append to `document.body` — that puts it in a stacking context above the entire panel and is what previously made the grid HUD cover the engine dropdown.

**Tabs** are registered in three places in `src/ui/studio-ui.js`: the `validTabs` array in the constructor, a `<button class="tab-btn" data-tab="...">` in `render()`, and a `case` in `renderTabContent()`. Listeners attach from `render()` via the `attach*Listeners()` cycle — attach inside that cycle, never once, because `render()` replaces `panelLayer.innerHTML`.

**Existing keybindings — do not collide.** `src/ui/studio-ui.js`: `Space`, `R`, `H`, `S`, `Escape`. `src/main.js`: `1`, `2`, `` ` ``, `D`, `F`, `V`, `C`, `K`, `G`, and in grid mode `M`, `T`, `E`. **`src/main.js` returns early on `metaKey`/`ctrlKey`/`altKey`**, so modifier chords never fire. This plan uses **`P`**, which is free.

**Browser verification handle:** `window.__orb = { studio, state, ui, ab }`.

**CRITICAL browser gotchas:**
- A hidden Browser pane means `requestAnimationFrame` never fires and the render loop is frozen. `studio.fpsTracker.fps` still reports its default `60` — not a liveness signal. Step frames with `studio.renderFrame()`.
- CSS transitions are frozen too, so `getComputedStyle()` on a transitioning property returns the starting value forever. Set `element.style.transition = 'none'` before measuring, and remember an ancestor's `opacity: 0` does **not** change a descendant's computed opacity — assert on the element that carries the rule.
- **For this sprint:** the player advances on real milliseconds from `studio.clock`. Manual `renderFrame()` stepping in a hidden pane produces near-zero deltas, so a 2-second step will never complete. Drive the player directly with `player.advance(ms)` in tests.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/sequence.js` | **Create.** Pure sequence model and timing: step boundaries, total duration, which step is active at time T. Unit-tested. |
| `src/core/studio.js` | **Modify.** Hold a sequence player and advance it in `renderFrame()`. |
| `src/ui/studio-ui.js` | **Modify.** A `rehearsal` tab: build the sequence from findings, edit timings, play/loop. |
| `src/main.js` | **Modify.** Bind `P` to play/pause the sequence. |
| `src/style.css` | **Modify.** Append sequence-strip styles. |
| `tests/sequence.test.mjs` | **Create.** Node tests for the timing model. |

---

### Task 1: The sequence timing model

**Files:**
- Create: `src/core/sequence.js`
- Test: `tests/sequence.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULT_HOLD_MS = 1200`, `DEFAULT_TRANSITION_MS = 400`
  - `makeStep(finding, overrides = {}) => step` — `{ id, findingId, note, engine, params, modulation, thumb, holdMs, transitionMs, easing }`. `id` is unique per step so the same finding can appear twice.
  - `stepDuration(step) => number` — `transitionMs + holdMs`.
  - `totalDuration(sequence) => number`
  - `stepAtTime(sequence, elapsedMs, { loop = true }) => { index, phase, t, stepElapsedMs } | null` — `phase` is `'transition'` or `'hold'`; `t` is progress `0..1` within that phase. Returns `null` for an empty sequence. When `loop` is false and `elapsedMs` exceeds the total, returns the final step at `phase: 'hold'`, `t: 1`.
  - `createSequencePlayer()` → `{ load(sequence, opts), play(), pause(), stop(), advance(deltaMs) => { index, phase, t, entered } | null, isPlaying, elapsedMs, seek(ms) }`. `entered` is `true` only on the frame the active step index changes — that is the signal to fire a transition.

- [ ] **Step 1: Write the failing test**

Create `tests/sequence.test.mjs`:

```js
import {
  DEFAULT_HOLD_MS,
  DEFAULT_TRANSITION_MS,
  makeStep,
  stepDuration,
  totalDuration,
  stepAtTime,
  createSequencePlayer,
} from '../src/core/sequence.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const finding = (note) => ({
  id: 'f-' + note, note, engine: 'quantum',
  params: { edgeGlow: 1 }, modulation: { enabled: false, sources: {}, routes: [] },
  thumb: 'data:image/jpeg;base64,AAAA',
});

// --- makeStep ---
const s1 = makeStep(finding('a'));
ok('carries the finding id', s1.findingId === 'f-a');
ok('copies the config', s1.engine === 'quantum' && s1.params.edgeGlow === 1);
ok('defaults the timings', s1.holdMs === DEFAULT_HOLD_MS && s1.transitionMs === DEFAULT_TRANSITION_MS);
ok('has its own id', typeof s1.id === 'string' && s1.id !== s1.findingId);
ok('same finding twice yields distinct steps', makeStep(finding('a')).id !== makeStep(finding('a')).id);
ok('overrides apply', makeStep(finding('a'), { holdMs: 50, easing: 'spring' }).holdMs === 50);
ok('is detached from the finding', (() => {
  const f = finding('a');
  const step = makeStep(f);
  f.params.edgeGlow = 99;
  return step.params.edgeGlow === 1;
})());

// --- durations ---
const seq = [
  makeStep(finding('a'), { transitionMs: 100, holdMs: 400 }),
  makeStep(finding('b'), { transitionMs: 200, holdMs: 300 }),
];
ok('step duration is transition + hold', stepDuration(seq[0]) === 500);
ok('total duration sums steps', totalDuration(seq) === 1000);
ok('empty sequence has zero duration', totalDuration([]) === 0);

// --- stepAtTime ---
ok('empty sequence returns null', stepAtTime([], 0) === null);
let at = stepAtTime(seq, 0);
ok('t=0 is step 0 in transition', at.index === 0 && at.phase === 'transition' && Math.abs(at.t) < 1e-9);
at = stepAtTime(seq, 50);
ok('mid-transition reports progress', at.index === 0 && at.phase === 'transition' && Math.abs(at.t - 0.5) < 1e-9, String(at.t));
at = stepAtTime(seq, 100);
ok('transition end enters hold', at.index === 0 && at.phase === 'hold');
at = stepAtTime(seq, 300);
ok('mid-hold reports progress', at.index === 0 && at.phase === 'hold' && Math.abs(at.t - 0.5) < 1e-9, String(at.t));
at = stepAtTime(seq, 500);
ok('crosses into step 1', at.index === 1 && at.phase === 'transition');
at = stepAtTime(seq, 1000);
ok('loops back to step 0', at.index === 0 && at.phase === 'transition');
at = stepAtTime(seq, 1050);
ok('loop keeps advancing', at.index === 0 && Math.abs(at.t - 0.5) < 1e-9);
at = stepAtTime(seq, 1000, { loop: false });
ok('without loop it parks on the last step', at.index === 1 && at.phase === 'hold' && at.t === 1);
ok('never returns a t outside [0,1]', (() => {
  for (let ms = 0; ms < 3000; ms += 7) {
    const a = stepAtTime(seq, ms);
    if (a.t < 0 || a.t > 1 || !Number.isFinite(a.t)) return false;
  }
  return true;
})());
ok('a zero-duration step does not divide by zero', (() => {
  const z = [makeStep(finding('z'), { transitionMs: 0, holdMs: 0 })];
  const a = stepAtTime(z, 0);
  return a && Number.isFinite(a.t);
})());

// --- player ---
const p = createSequencePlayer();
ok('idle player advances to null', p.advance(16) === null);
p.load(seq);
ok('loading does not auto-play', p.isPlaying === false && p.advance(16) === null);

p.play();
ok('play starts it', p.isPlaying === true);
let first = p.advance(0);
ok('first advance enters step 0', first.index === 0 && first.entered === true);
let second = p.advance(50);
ok('staying in a step does not re-enter', second.index === 0 && second.entered === false);
let crossed = null;
for (let i = 0; i < 100; i++) { const r = p.advance(10); if (r.index === 1) { crossed = r; break; } }
ok('crossing into step 1 reports entered', crossed && crossed.index === 1 && crossed.entered === true);

p.pause();
ok('pause stops advancing', p.isPlaying === false && p.advance(100) === null);
p.play();
ok('resume keeps elapsed', p.elapsedMs > 0);
p.stop();
ok('stop resets elapsed', p.elapsedMs === 0 && p.isPlaying === false);

p.play();
p.seek(600);
const seeked = p.advance(0);
ok('seek jumps to the right step', seeked.index === 1, JSON.stringify(seeked));
ok('seek marks the step as entered', seeked.entered === true);

// looping fires entered once per wrap, not every frame
const p2 = createSequencePlayer();
p2.load(seq);
p2.play();
let entries = 0;
for (let i = 0; i < 400; i++) { const r = p2.advance(10); if (r?.entered) entries++; }
ok('entered fires once per step crossing', entries === 8, `${entries} entries over 4 loops of 2 steps`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/sequence.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/core/sequence.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/sequence.js`:

```js
// A rehearsal sequence — kept findings played in order, on a loop.
//
// Every other capture in this tool is a single moment, but an orb is never seen
// as one moment: it is seen going from one state to the next, and whether that
// reads is a property of the sequence rather than of any config in it.
//
// A step has a duration and a curve and nothing else. Naming states is
// specification, which docs/VISION.md §3 defers until exploration has produced a
// vocabulary worth naming.
//
// Pure — no DOM, no Three.js — so it can be tested in Node.

export const DEFAULT_HOLD_MS = 1200;
export const DEFAULT_TRANSITION_MS = 400;

let counter = 0;

export function makeStep(finding, overrides = {}) {
  counter += 1;
  return {
    // Distinct from findingId: the same finding may appear twice in a sequence.
    id: `s${Date.now().toString(36)}-${counter.toString(36)}`,
    findingId: finding.id,
    note: finding.note ?? '',
    engine: finding.engine,
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
  return Math.max(0, step.transitionMs ?? 0) + Math.max(0, step.holdMs ?? 0);
}

export function totalDuration(sequence) {
  return (sequence || []).reduce((sum, step) => sum + stepDuration(step), 0);
}

export function stepAtTime(sequence, elapsedMs, { loop = true } = {}) {
  if (!sequence?.length) return null;

  const total = totalDuration(sequence);
  let time = Math.max(0, elapsedMs);

  if (total <= 0) {
    // Every step is instantaneous; treat the first as permanently held rather
    // than dividing by zero below.
    return { index: 0, phase: 'hold', t: 1, stepElapsedMs: 0 };
  }

  if (time >= total) {
    if (!loop) {
      const index = sequence.length - 1;
      return { index, phase: 'hold', t: 1, stepElapsedMs: stepDuration(sequence[index]) };
    }
    time %= total;
  }

  for (let index = 0; index < sequence.length; index++) {
    const step = sequence[index];
    const duration = stepDuration(step);
    if (time >= duration) {
      time -= duration;
      continue;
    }
    const transition = Math.max(0, step.transitionMs ?? 0);
    if (time < transition) {
      return { index, phase: 'transition', t: transition > 0 ? time / transition : 1, stepElapsedMs: time };
    }
    const hold = Math.max(0, step.holdMs ?? 0);
    const held = time - transition;
    return { index, phase: 'hold', t: hold > 0 ? held / hold : 1, stepElapsedMs: time };
  }

  // Floating-point drift can land exactly on the total; park on the last step.
  const index = sequence.length - 1;
  return { index, phase: 'hold', t: 1, stepElapsedMs: stepDuration(sequence[index]) };
}

export function createSequencePlayer() {
  let sequence = [];
  let options = { loop: true };
  let elapsed = 0;
  let playing = false;
  let lastIndex = -1;

  function sample() {
    const at = stepAtTime(sequence, elapsed, options);
    if (!at) return null;
    const entered = at.index !== lastIndex;
    lastIndex = at.index;
    return { ...at, entered };
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
      sequence = next || [];
      options = { loop: true, ...opts };
      elapsed = 0;
      lastIndex = -1;
    },
    play() {
      if (!sequence.length) return;
      playing = true;
    },
    pause() {
      playing = false;
    },
    stop() {
      playing = false;
      elapsed = 0;
      lastIndex = -1;
    },
    seek(ms) {
      elapsed = Math.max(0, ms);
      // Force the next sample to report `entered`, so seeking always applies the
      // step it landed on rather than waiting for the next boundary.
      lastIndex = -1;
    },
    advance(deltaMs) {
      if (!playing || !sequence.length) return null;
      elapsed += Math.max(0, deltaMs);
      return sample();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/sequence.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add src/core/sequence.js tests/sequence.test.mjs
git commit -m "Add a pure sequence timing model for the rehearsal room"
```

---

### Task 2: Drive the sequence from the studio

**Files:**
- Modify: `src/core/studio.js`

**Interfaces:**
- Consumes: `createSequencePlayer` from `./sequence.js`.
- Produces:
  - `studio.sequencePlayer` — the player.
  - `studio.playSequence(sequence, state, { loop = true }) => void`
  - `studio.stopSequence() => void`
  - `studio.isPlayingSequence` getter
  - `studio.onSequenceStep` — settable callback fired with `{ index, step }` whenever a step is entered, so the UI can highlight it.
  - Each frame, when a step is entered, the studio applies that step: modulation and globals immediately, engine params via `tweenTo` (or `setEngine` when the engine differs).

- [ ] **Step 1: Add the import and the fields**

In `src/core/studio.js`, find:

```js
import { createClipRecorder } from './clip-recorder.js';
```

Add directly below it:

```js
import { createSequencePlayer } from './sequence.js';
```

Then find this line in the constructor:

```js
    this.paramTween = createParamTween();
```

Add directly below it:

```js
    // Rehearsal playback. Holds the state object so a step can apply its
    // modulation and globals the same way an A/B swap does.
    this.sequencePlayer = createSequencePlayer();
    this.sequenceState = null;
    this.currentSequence = null;
    this.onSequenceStep = null;
```

- [ ] **Step 2: Add the control methods**

In `src/core/studio.js`, find the method `tweenTo(targetParams, { durationMs = 400, easing = 'easeOut' } = {}) {` and insert these immediately **above** it:

```js
  get isPlayingSequence() {
    return this.sequencePlayer.isPlaying;
  }

  playSequence(sequence, state, { loop = true } = {}) {
    if (!sequence?.length) return;
    this.sequenceState = state;
    this.currentSequence = sequence;
    this.sequencePlayer.load(sequence, { loop });
    this.sequencePlayer.play();
  }

  stopSequence() {
    this.sequencePlayer.stop();
    this.currentSequence = null;
    this.paramTween.cancel();
  }

  // Applies one step. Mirrors ab-compare's transition path deliberately: routing
  // through updateParameters() would cancel the tween it just started, because a
  // direct edit is supposed to supersede an in-flight transition.
  applySequenceStep(step) {
    const state = this.sequenceState;
    if (!state || !step) return;

    if (step.modulation) state.modulation = structuredClone(step.modulation);
    Object.assign(state.engines[step.engine] || (state.engines[step.engine] = {}), step.params);

    if (step.engine !== state.engine) {
      // Engines cannot be tweened across a dispose, so this is always a cut.
      state.engine = step.engine;
      this.setEngine(step.engine, state);
      return;
    }

    this.syncModulation(state);
    this.updateGlobalSettings(state.global);
    this.tweenTo({ ...step.params }, { durationMs: step.transitionMs, easing: step.easing });
  }

```

- [ ] **Step 3: Advance the player each frame**

In `src/core/studio.js`, find this in `renderFrame()`:

```js
    // Advance before evaluating the rack so modulation reads this frame's base.
```

Insert directly **above** that comment:

```js
    // Sequence first: entering a step starts the tween that the block below then
    // advances, so a step boundary and its transition land on the same frame.
    if (this.sequencePlayer.isPlaying) {
      const at = this.sequencePlayer.advance(delta * 1000);
      if (at?.entered) {
        const step = this.currentSequence?.[at.index];
        if (step) {
          this.applySequenceStep(step);
          this.onSequenceStep?.({ index: at.index, step });
        }
      }
    }

```

- [ ] **Step 4: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 5: Verify in the browser**

Dev server running (`npm run dev`), open http://localhost:5173. Drive the player directly — a hidden pane produces near-zero frame deltas:

```js
const { studio: s, state: st, ui } = window.__orb;
const { makeStep } = await import('/src/core/sequence.js');

const engine = st.engine;
const dim = { id: 'x1', note: 'dim', engine, params: { ...st.engines[engine], edgeGlow: 0.2 }, modulation: st.modulation, thumb: '' };
const bright = { id: 'x2', note: 'bright', engine, params: { ...st.engines[engine], edgeGlow: 2.8 }, modulation: st.modulation, thumb: '' };
const seq = [makeStep(dim, { transitionMs: 200, holdMs: 200 }), makeStep(bright, { transitionMs: 200, holdMs: 200 })];

const entered = [];
s.onSequenceStep = ({ index }) => entered.push(index);
s.playSequence(seq, st, { loop: true });

const glows = new Set();
for (let i = 0; i < 60; i++) {
  const at = s.sequencePlayer.advance(40);
  if (at?.entered) s.applySequenceStep(seq[at.index]);
  const v = s.paramTween.advance(40);
  if (v) glows.add(+v.edgeGlow.toFixed(2));
}
const out = {
  stepsEntered: entered.length,
  distinctGlows: glows.size,
  travelled: glows.size > 3,
  playing: s.isPlayingSequence,
};
s.stopSequence();
out.stoppedCleanly = !s.isPlayingSequence && !s.paramTween.isRunning;
JSON.stringify(out, null, 2);
```

Expected: `stepsEntered` greater than 1 (the loop crosses boundaries repeatedly), `travelled: true` with several distinct interpolated values, and `stoppedCleanly: true`.

- [ ] **Step 6: Commit**

```bash
git add src/core/studio.js
git commit -m "Play rehearsal sequences from the studio render loop"
```

---

### Task 3: The Rehearsal tab

**Files:**
- Modify: `src/ui/studio-ui.js`
- Modify: `src/style.css` (append at end)

**Interfaces:**
- Consumes: `makeStep`, `totalDuration` from `../core/sequence.js`; `this.findings`; `studio.playSequence` / `stopSequence` / `onSequenceStep`.
- Produces:
  - `StudioUI.sequence` — the working sequence array.
  - A `rehearsal` tab with the findings shelf on top (click to append) and the sequence strip below (reorder, retime, remove).
  - `StudioUI.toggleSequencePlayback()`.

- [ ] **Step 1: Register the tab**

In `src/ui/studio-ui.js`, find:

```js
    const validTabs = ['presets', 'findings', 'colors', 'geometry', 'motion', 'motionlab', 'optics', 'space', 'export', 'perf'];
```

Replace with:

```js
    const validTabs = ['presets', 'findings', 'rehearsal', 'colors', 'geometry', 'motion', 'motionlab', 'optics', 'space', 'export', 'perf'];
```

Then find, in the constructor:

```js
    this.findings = createFindingsStore(findingsStorage);
```

Add directly below it:

```js
    // The working rehearsal sequence. Deliberately not persisted: it is a
    // scratch arrangement of findings, and the findings themselves are the
    // durable artefact.
    this.sequence = [];
    this.activeSequenceIndex = -1;
```

Then find, in `render()`:

```js
          <button class="tab-btn ${this.activeTab === 'colors' ? 'active' : ''}" data-tab="colors">Colors</button>
```

Insert directly **above** it:

```js
          <button class="tab-btn ${this.activeTab === 'rehearsal' ? 'active' : ''}" data-tab="rehearsal">Rehearsal</button>
```

Then find, in `renderTabContent()`:

```js
      case 'colors':
        return this.renderParamsSection('colors');
```

Insert directly **above** it:

```js
      case 'rehearsal':
        return this.renderRehearsalTab();
```

- [ ] **Step 2: Add the imports**

In `src/ui/studio-ui.js`, find:

```js
import { createFindingsStore, makeFinding } from '../core/findings.js';
```

Replace with:

```js
import { createFindingsStore, makeFinding } from '../core/findings.js';
import { makeStep, totalDuration } from '../core/sequence.js';
import { EASING_NAMES } from '../core/easing.js';
```

- [ ] **Step 3: Add the tab renderer and its listeners**

In `src/ui/studio-ui.js`, find the method `renderFindingsTab() {` and insert these methods immediately **above** it:

```js
  toggleSequencePlayback() {
    if (this.studio.isPlayingSequence) {
      this.studio.stopSequence();
      this.activeSequenceIndex = -1;
    } else {
      if (!this.sequence.length) return;
      this.studio.onSequenceStep = ({ index }) => {
        this.activeSequenceIndex = index;
        // Only repaint the strip's highlight; a full render() every step would
        // fight the tab's own inputs and thrash the panel.
        this.root.querySelectorAll('[data-seq-step]').forEach((el, i) => {
          el.classList.toggle('playing', i === index);
        });
      };
      this.studio.playSequence(this.sequence, this.state, { loop: true });
    }
    if (this.activeTab === 'rehearsal') this.render();
  }

  renderRehearsalTab() {
    const findings = this.findings.list();
    const playing = this.studio.isPlayingSequence;
    const total = totalDuration(this.sequence);

    const shelf = findings.length
      ? `<div class="rehearsal-shelf">
          ${findings.map((f) => `
            <button class="rehearsal-chip" data-seq-add="${escapeHtml(f.id)}" title="Append to sequence">
              <img src="${safeThumbnail(f.thumb)}" alt="" loading="lazy" />
              <span>${escapeHtml(f.note || f.engine)}</span>
            </button>
          `).join('')}
        </div>`
      : `<div class="empty-notice">Keep some findings first — press <b>C</b> to stash the current orb.</div>`;

    const strip = this.sequence.length
      ? this.sequence.map((step, i) => `
          <div class="seq-step ${i === this.activeSequenceIndex ? 'playing' : ''}" data-seq-step="${i}">
            <img class="seq-thumb" src="${safeThumbnail(step.thumb)}" alt="" loading="lazy" />
            <div class="seq-body">
              <div class="seq-name">${escapeHtml(step.note || step.engine)}</div>
              <div class="seq-timings">
                <label>in<input type="number" min="0" max="5000" step="50" value="${step.transitionMs}" data-seq-transition="${i}" /></label>
                <label>hold<input type="number" min="0" max="10000" step="50" value="${step.holdMs}" data-seq-hold="${i}" /></label>
                <select data-seq-easing="${i}">
                  ${EASING_NAMES.map((n) => `<option value="${n}" ${step.easing === n ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="seq-actions">
              <button class="cp-delete-btn" data-seq-up="${i}" title="Move earlier">↑</button>
              <button class="cp-delete-btn" data-seq-down="${i}" title="Move later">↓</button>
              <button class="cp-delete-btn" data-seq-remove="${i}" title="Remove">✕</button>
            </div>
          </div>
        `).join('')
      : `<div class="empty-notice">Click a finding above to add it as a step.</div>`;

    return `
      <div class="panel-section">
        <div class="section-header">
          <span class="section-title">FINDINGS</span>
          <span class="section-meta">click to append</span>
        </div>
        ${shelf}
      </div>

      <div class="panel-section">
        <div class="section-header">
          <span class="section-title">SEQUENCE</span>
          <span class="section-meta">${this.sequence.length} steps · ${(total / 1000).toFixed(1)}s loop</span>
        </div>
        <div class="seq-strip">${strip}</div>
        <div class="modal-footer-row" style="margin-top: 12px;">
          <button class="btn-sm btn-accent" id="btn-seq-play">${playing ? 'Stop' : 'Play loop'}</button>
          <button class="btn-sm" id="btn-seq-clear">Clear</button>
        </div>
      </div>
    `;
  }

  attachRehearsalListeners() {
    this.root.querySelectorAll('[data-seq-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entry = this.findings.list().find((f) => f.id === btn.getAttribute('data-seq-add'));
        if (!entry) return;
        this.sequence.push(makeStep(entry));
        this.render();
      });
    });

    const reindex = (attr, fn) => {
      this.root.querySelectorAll(`[${attr}]`).forEach((el) => {
        el.addEventListener('click', () => {
          fn(Number(el.getAttribute(attr)));
          this.render();
        });
      });
    };
    reindex('data-seq-remove', (i) => this.sequence.splice(i, 1));
    reindex('data-seq-up', (i) => {
      if (i <= 0) return;
      [this.sequence[i - 1], this.sequence[i]] = [this.sequence[i], this.sequence[i - 1]];
    });
    reindex('data-seq-down', (i) => {
      if (i >= this.sequence.length - 1) return;
      [this.sequence[i + 1], this.sequence[i]] = [this.sequence[i], this.sequence[i + 1]];
    });

    // 'change', not 'input': re-rendering per keystroke would blur the field.
    const retime = (attr, key) => {
      this.root.querySelectorAll(`[${attr}]`).forEach((el) => {
        el.addEventListener('change', (e) => {
          const step = this.sequence[Number(el.getAttribute(attr))];
          if (step) step[key] = Math.max(0, Number(e.target.value) || 0);
          this.render();
        });
      });
    };
    retime('data-seq-transition', 'transitionMs');
    retime('data-seq-hold', 'holdMs');

    this.root.querySelectorAll('[data-seq-easing]').forEach((el) => {
      el.addEventListener('change', (e) => {
        const step = this.sequence[Number(el.getAttribute('data-seq-easing'))];
        if (step) step.easing = e.target.value;
      });
    });

    this.root.querySelector('#btn-seq-play')?.addEventListener('click', () => this.toggleSequencePlayback());
    this.root.querySelector('#btn-seq-clear')?.addEventListener('click', () => {
      this.studio.stopSequence();
      this.sequence = [];
      this.activeSequenceIndex = -1;
      this.render();
    });
  }

```

- [ ] **Step 4: Attach the listeners**

In `src/ui/studio-ui.js`, find:

```js
    this.attachFindingsListeners();
```

Replace with:

```js
    this.attachFindingsListeners();
    this.attachRehearsalListeners();
```

- [ ] **Step 5: Append the styles**

Append to the end of `src/style.css`:

```css

/* ---------------------------------------------------------------------------
   Rehearsal room — findings shelf and the sequence strip.
   --------------------------------------------------------------------------- */
.rehearsal-shelf {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.rehearsal-chip {
  flex: 0 0 auto;
  width: 76px;
  padding: 0 0 4px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
  font-family: var(--font);
  font-size: 10px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.rehearsal-chip:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.rehearsal-chip img {
  display: block;
  width: 100%;
  aspect-ratio: 8 / 5;
  object-fit: cover;
  background: #000;
}

.rehearsal-chip span {
  display: block;
  padding: 3px 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.seq-strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.seq-step {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 6px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.seq-step.playing {
  border-color: var(--primary);
  box-shadow: 0 0 12px var(--primary-glow);
}

.seq-thumb {
  width: 56px;
  aspect-ratio: 8 / 5;
  object-fit: cover;
  border-radius: 4px;
  background: #000;
}

.seq-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.seq-timings {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--text-muted);
}

.seq-timings label {
  display: flex;
  align-items: center;
  gap: 3px;
}

.seq-timings input {
  width: 52px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: var(--font);
  font-size: 10px;
  padding: 2px 4px;
}

.seq-timings select {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: var(--font);
  font-size: 10px;
  padding: 2px;
}

.seq-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
```

- [ ] **Step 6: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/studio-ui.js src/style.css
git commit -m "Add a Rehearsal tab for sequencing findings"
```

---

### Task 4: Bind the playback key

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Bind `P`**

In `src/main.js`, find:

```js
  if (e.code === 'KeyK') {
```

Insert directly **above** it:

```js
  // P plays or stops the rehearsal loop from anywhere, so you can watch it
  // without the inspector open.
  if (e.code === 'KeyP' && !studio.isGridMode) {
    e.preventDefault();
    ui.toggleSequencePlayback();
    return;
  }

```

- [ ] **Step 2: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 3: Verify end to end in the browser**

Dev server running, open http://localhost:5173:

```js
const { studio: s, state: st, ui } = window.__orb;
for (let i = 0; i < 3; i++) s.renderFrame();

// keep two visibly different findings
st.engines[st.engine].edgeGlow = 0.2; s.updateParameters(st); s.renderFrame();
ui.saveFinding('dim');
st.engines[st.engine].edgeGlow = 2.8; s.updateParameters(st); s.renderFrame();
ui.saveFinding('bright');

// build the sequence through the real tab
ui.activeTab = 'rehearsal'; ui.render();
document.querySelectorAll('[data-seq-add]').forEach((b) => b.click());
const out = { steps: ui.sequence.length, stepCards: document.querySelectorAll('[data-seq-step]').length };

// play it
document.querySelector('#btn-seq-play').click();
out.playing = s.isPlayingSequence;

const glows = new Set();
for (let i = 0; i < 60; i++) {
  const at = s.sequencePlayer.advance(40);
  if (at?.entered) s.applySequenceStep(ui.sequence[at.index]);
  const v = s.paramTween.advance(40);
  if (v) glows.add(+v.edgeGlow.toFixed(2));
}
out.distinctGlows = glows.size;
out.travelled = glows.size > 3;

document.querySelector('#btn-seq-play').click();
out.stopped = !s.isPlayingSequence;
ui.findings.clear(); ui.sequence = [];
JSON.stringify(out, null, 2);
```

Expected: `steps: 2`, `stepCards: 2`, `playing: true`, `travelled: true`, `stopped: true`.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "Bind P to play the rehearsal loop"
```

---

## Definition of done

- `node tests/sequence.test.mjs` prints `ALL PASS`, and the other suites still do.
- `npx vite build` succeeds.
- Findings can be appended to a sequence, reordered, retimed and removed.
- `P` or the Play button loops the sequence, travelling between steps with each step's own duration and curve.
- A step whose engine differs cuts rather than tweening, and does not leave a tween running.
- Stopping cancels the tween and clears the highlight.
- No console errors.

## Follow-up worth noting

This is the instrument `docs/VISION.md` §2 has been building toward: a sequence is the first thing in this tool that can be judged as *communication* rather than as a look. If a step ordering starts to feel nameable — "this one is unmistakably thinking" — record that in the vision doc's open questions. That observation, not the sequence format, is what §3 is waiting for. Update the capability inventory in the appendix in the same commit as your last task.
