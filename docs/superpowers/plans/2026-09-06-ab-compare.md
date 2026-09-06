# A/B Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user stash two configurations and flip between them instantly while the animation keeps running, so two motion designs can be compared directly rather than from memory.

**Architecture:** Motion cannot be judged from a still frame, and comparing two versions sequentially — tweak, look away, tweak back — hides differences the eye catches instantly in a direct swap. This adds two snapshot slots and a swap that applies a stored config **without recreating the engine**, so rotation phase, elapsed time and camera are preserved across the flip. Snapshot/restore logic is pure and unit-tested; only the keybinding and the small HUD readout touch the DOM.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework.
- **ES modules**, `"type": "module"`.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. There is no test framework and you must not add one. Exit `0` on pass, `1` on fail.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: `/Users/ahmetbektes/WDesignspace/orb-animation`. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

This is a WebGL shader studio. A single `OrbStudio` owns the renderer, camera, clock and one active "engine" (a visual generator — there are 8: tesseract, moire, auris, hopf, polytope, nebula, quantum, singularity).

**The app state object** (`src/core/state.js`, `createInitialState()`) has this shape:

```js
{
  engine: 'tesseract',            // which engine is active
  activePresetName: '...',
  global: { dpr, exposure, bloomStrength, bloomRadius, bloomThreshold,
            autoRotate, autoRotateSpeed, timeScale, paused, background,
            transparentBg, bgMode },
  modulation: { enabled, loopLength, sources: {...}, routes: [...] },
  engines: {                       // per-engine parameter bags
    tesseract: { color1: '#ffed00', edgeGlow: 1.2, ... },
    quantum:   { ... },
    // ...one entry per engine
  }
}
```

**Two APIs on `OrbStudio` (`src/core/studio.js`) — the distinction is the crux of this plan:**

```js
studio.setEngine(type, state)
// If `type` differs from the current engine: DISPOSES the current engine and
// builds a new one. Expensive, and it resets the visual. If `type` is the same,
// it delegates to updateParameters().

studio.updateParameters(state)
// Pushes global settings, modulation config and engine params into the LIVE
// engine. Does not dispose anything. Rotation phase and elapsed time survive.
```

**Use `updateParameters` for the swap.** Calling `setEngine` with a different engine type is only acceptable when the two slots genuinely hold different engines — and in that case the visual jump is unavoidable.

`studio.virtualTime` is the accumulated animation clock; do not reset it during a swap.

**Existing keybindings — do NOT collide with any of these.**
In `src/ui/studio-ui.js` (`bindEvents`): `Space` play/pause, `R` randomize, `H` zen mode, `S` snapshot, `Escape` close modal.
In `src/main.js`: `G` grid, and while in grid mode `M`, `T`, `E`.

This plan uses **`1`** and **`2`** to store, and **`` ` ``** (backquote) to swap. None are taken.

**Browser verification handle:** `window.__orb = { studio, state, ui }`.

**CRITICAL browser gotcha:** if the Browser pane is hidden, `requestAnimationFrame` never fires and the render loop is frozen — the app looks broken but is not. `studio.fpsTracker.fps` returns its default `60` regardless, so don't trust it as a liveness signal. Step frames manually with `studio.renderFrame()`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/ab-compare.js` | **Create.** Snapshot/restore/swap logic. Pure except for one call into `studio.updateParameters`. |
| `src/main.js` | **Modify.** Keybindings and a small on-screen readout. |
| `src/style.css` | **Modify.** Append readout styles. |
| `tests/ab-compare.test.mjs` | **Create.** Node tests for snapshot/restore. |

---

### Task 1: Snapshot and restore logic

**Files:**
- Create: `src/core/ab-compare.js`
- Test: `tests/ab-compare.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `snapshotState(state) => Snapshot` — deep copy of `{ engine, global, modulation, params }` where `params` is `state.engines[state.engine]` only (not every engine's bag). Must be fully detached: later edits to `state` must not alter the snapshot.
  - `applySnapshot(state, snapshot) => boolean` — writes the snapshot back into `state` **in place** (never reassigns `state`, `state.global` or `state.engines[...]` — other modules hold those references). Returns `true` if the engine type changed, which tells the caller a full `setEngine` is required instead of `updateParameters`.
  - `createAbCompare(studio, state)` → object with:
    - `store(slot: 'a' | 'b') => void`
    - `has(slot) => boolean`
    - `activate(slot: 'a' | 'b') => 'a' | 'b' | null` — applies that slot, or `null` if it is empty.
    - `swap() => 'a' | 'b' | null` — activates the other filled slot, returns the slot now active, or `null` if fewer than two slots are filled.
    - `activeSlot` getter → `'a' | 'b' | null`

- [ ] **Step 1: Write the failing test**

Create `tests/ab-compare.test.mjs`:

```js
import { snapshotState, applySnapshot } from '../src/core/ab-compare.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

function makeState() {
  return {
    engine: 'quantum',
    activePresetName: 'Cyber Matrix',
    global: { bloomStrength: 0.65, timeScale: 1, exposure: 1.05 },
    modulation: { enabled: true, sources: { lfo1: { type: 'lfo', rate: 0.5 } }, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.4 }] },
    engines: {
      quantum: { edgeGlow: 1.2, cubeSize: 1.25 },
      tesseract: { edgeGlow: 0.8 },
    },
  };
}

// --- snapshotState ---
const s1 = makeState();
const snap = snapshotState(s1);
ok('captures the engine id', snap.engine === 'quantum');
ok('captures only the active engine params', JSON.stringify(snap.params) === JSON.stringify({ edgeGlow: 1.2, cubeSize: 1.25 }));
ok('captures global', snap.global.bloomStrength === 0.65);
ok('captures modulation', snap.modulation.routes.length === 1);

s1.engines.quantum.edgeGlow = 99;
s1.global.bloomStrength = 99;
s1.modulation.routes.push({ source: 'lfo1', dest: '_timeScale', amount: 1 });
ok('snapshot is detached from params', snap.params.edgeGlow === 1.2);
ok('snapshot is detached from global', snap.global.bloomStrength === 0.65);
ok('snapshot is detached from modulation', snap.modulation.routes.length === 1);

// --- applySnapshot ---
const s2 = makeState();
const globalRef = s2.global;
const enginesRef = s2.engines;
const paramsRef = s2.engines.quantum;
s2.engines.quantum.edgeGlow = 42;

const changed = applySnapshot(s2, snap);
ok('restores param values', s2.engines.quantum.edgeGlow === 1.2);
ok('reports no engine change for same engine', changed === false);
ok('keeps the global object identity', s2.global === globalRef);
ok('keeps the engines map identity', s2.engines === enginesRef);
ok('keeps the active params object identity', s2.engines.quantum === paramsRef);

// applying a snapshot from a different engine
const s3 = makeState();
s3.engine = 'quantum';
const tesseractSnap = { engine: 'tesseract', global: { bloomStrength: 0.2 }, modulation: { enabled: false, sources: {}, routes: [] }, params: { edgeGlow: 0.3 } };
const changed2 = applySnapshot(s3, tesseractSnap);
ok('reports an engine change', changed2 === true);
ok('switches the active engine', s3.engine === 'tesseract');
ok('writes into the target engine bag', s3.engines.tesseract.edgeGlow === 0.3);
ok('leaves the other engine bag alone', s3.engines.quantum.edgeGlow === 1.2);

// mutating the state afterwards must not corrupt the snapshot
s3.engines.tesseract.edgeGlow = 7;
ok('applied snapshot stays detached', tesseractSnap.params.edgeGlow === 0.3);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/ab-compare.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/core/ab-compare.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/ab-compare.js`:

```js
// A/B compare — two configuration slots and an instant swap between them.
//
// Motion can't be judged from a still frame or from memory. Flipping between two
// versions while the animation keeps running surfaces differences that
// sequential viewing hides.

// Only the ACTIVE engine's parameter bag is captured. Snapshotting all eight
// would make a swap silently rewrite engines the user never touched.
export function snapshotState(state) {
  return structuredClone({
    engine: state.engine,
    global: state.global,
    modulation: state.modulation,
    params: state.engines[state.engine],
  });
}

// Writes in place. `state`, `state.global` and each `state.engines[...]` bag are
// held by reference in main.js, StudioUI and OrbStudio, so reassigning any of
// them would orphan those holders — the same class of bug that made randomize
// break grid entry.
//
// Returns true when the engine type changed, which the caller must handle with
// setEngine() rather than updateParameters().
export function applySnapshot(state, snapshot) {
  const engineChanged = state.engine !== snapshot.engine;
  const restored = structuredClone(snapshot);

  state.engine = restored.engine;
  Object.assign(state.global, restored.global);
  state.modulation = restored.modulation;

  if (!state.engines[restored.engine]) state.engines[restored.engine] = {};
  Object.assign(state.engines[restored.engine], restored.params);

  return engineChanged;
}

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

  return {
    store(slot) {
      slots[slot] = snapshotState(state);
      activeSlot = slot;
    },
    has(slot) {
      return !!slots[slot];
    },
    get activeSlot() {
      return activeSlot;
    },
    activate(slot) {
      return apply(slot);
    },
    swap() {
      if (!slots.a || !slots.b) return null;
      return apply(activeSlot === 'a' ? 'b' : 'a');
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/ab-compare.test.mjs`
Expected: every line `PASS`, final line `ALL PASS`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/ab-compare.js tests/ab-compare.test.mjs
git commit -m "Add A/B snapshot and restore logic"
```

---

### Task 2: Keybindings and on-screen readout

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css` (append at end)

**Interfaces:**
- Consumes: `createAbCompare` from `./core/ab-compare.js`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the import**

In `src/main.js`, directly below `import { StudioUI } from './ui/studio-ui.js';`, add:

```js
import { createAbCompare } from './core/ab-compare.js';
```

- [ ] **Step 2: Create the instance and the readout**

In `src/main.js`, directly below the line `window.__orb = { studio, state, ui };`, add:

```js
// --- A/B compare ------------------------------------------------------------
// 1 / 2 store the current config into a slot, backquote flips between them.
const ab = createAbCompare(studio, state);

const abReadout = document.createElement('div');
abReadout.className = 'ab-readout hidden';
document.body.appendChild(abReadout);

function refreshAbReadout(justSwapped = false) {
  const filled = ['a', 'b'].filter((s) => ab.has(s));
  if (!filled.length) {
    abReadout.classList.add('hidden');
    return;
  }
  abReadout.classList.remove('hidden');
  abReadout.innerHTML = ['a', 'b']
    .map((slot) => {
      const stored = ab.has(slot);
      const active = ab.activeSlot === slot && stored;
      return `<span class="ab-slot ${active ? 'active' : ''} ${stored ? '' : 'empty'}">${slot.toUpperCase()}</span>`;
    })
    .join('') + `<span class="ab-hint">${ab.has('a') && ab.has('b') ? '` to swap' : 'press 2 to fill B'}</span>`;

  if (justSwapped) {
    abReadout.classList.remove('flash');
    // Force a reflow so the animation restarts on every swap.
    void abReadout.offsetWidth;
    abReadout.classList.add('flash');
  }
}

window.__orb.ab = ab;
```

- [ ] **Step 3: Add the keybindings**

In `src/main.js`, find the existing keydown listener that begins:

```js
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

  if (e.code === 'KeyG') {
```

Insert this block immediately after the `if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;` line and before `if (e.code === 'KeyG') {`:

```js
  // A/B slots. Skipped in grid mode, where digits and backquote are free for
  // future cell selection and the single-orb view isn't on screen anyway.
  if (!studio.isGridMode) {
    if (e.code === 'Digit1' || e.code === 'Digit2') {
      e.preventDefault();
      ab.store(e.code === 'Digit1' ? 'a' : 'b');
      refreshAbReadout();
      return;
    }
    if (e.code === 'Backquote') {
      e.preventDefault();
      const now = ab.swap();
      if (now) {
        ui.render();
        refreshAbReadout(true);
      }
      return;
    }
  }

```

- [ ] **Step 4: Append the styles**

Append to the end of `src/style.css`:

```css

/* ---------------------------------------------------------------------------
   A/B compare readout. Bottom-left, out of the playback dock's way.
   --------------------------------------------------------------------------- */
.ab-readout {
  position: fixed;
  bottom: 24px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  backdrop-filter: blur(20px);
  border-radius: var(--radius-pill);
  font-family: var(--font);
  font-size: 11px;
  z-index: 60;
  pointer-events: none;
}

.ab-readout.hidden {
  display: none;
}

.ab-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: var(--text-secondary);
  font-weight: 700;
}

.ab-slot.empty {
  opacity: 0.35;
}

.ab-slot.active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--ink);
  box-shadow: 0 0 12px var(--primary-glow);
}

.ab-hint {
  color: var(--text-muted);
  margin-left: 4px;
}

.ab-readout.flash {
  animation: ab-flash 0.28s ease-out;
}

@keyframes ab-flash {
  0% { border-color: var(--primary); box-shadow: 0 0 18px var(--primary-glow); }
  100% { border-color: var(--panel-border); box-shadow: none; }
}
```

- [ ] **Step 5: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 6: Verify in the browser**

Start the dev server if needed (`npm run dev`), open http://localhost:5173, then run:

```js
const { studio: s, state: st, ab, ui } = window.__orb;

// store A with a low glow, B with a high one
st.engines[st.engine].edgeGlow = 0.4;
s.updateParameters(st);
ab.store('a');

st.engines[st.engine].edgeGlow = 2.6;
s.updateParameters(st);
ab.store('b');

// advance the clock so we can prove the swap does not reset it
for (let i = 0; i < 10; i++) s.renderFrame();
const timeBefore = s.virtualTime;
const engineBefore = s.activeEngine;

const now = ab.swap();
for (let i = 0; i < 3; i++) s.renderFrame();

JSON.stringify({
  swappedTo: now,                                   // expect "a"
  glowAfterSwap: st.engines[st.engine].edgeGlow,    // expect 0.4
  engineNotRebuilt: s.activeEngine === engineBefore, // expect true — the crux
  clockNotReset: s.virtualTime >= timeBefore,        // expect true
  readoutVisible: !document.querySelector('.ab-readout').classList.contains('hidden'),
}, null, 2);
```

Expected: `swappedTo: "a"`, `glowAfterSwap: 0.4`, **`engineNotRebuilt: true`**, `clockNotReset: true`, `readoutVisible: true`.

`engineNotRebuilt` is the assertion that matters. If it is `false`, the swap is calling `setEngine` when it should call `updateParameters` — the animation will visibly restart on every flip and the feature is worthless.

Then swap back and confirm it alternates:

```js
const back = window.__orb.ab.swap();
JSON.stringify({ swappedTo: back, glow: window.__orb.state.engines[window.__orb.state.engine].edgeGlow });
// expect { swappedTo: "b", glow: 2.6 }
```

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/style.css
git commit -m "Bind 1/2 to store A/B slots and backquote to swap between them"
```

---

## Definition of done

- `node tests/ab-compare.test.mjs` prints `ALL PASS`.
- `npx vite build` succeeds.
- `1` and `2` store slots; the readout appears and marks the active slot.
- `` ` `` alternates between slots and **does not rebuild the engine** when both slots share an engine type.
- Swapping does not reset `studio.virtualTime`.
- Typing in a text input does not trigger any of the new bindings.
- No console errors.
