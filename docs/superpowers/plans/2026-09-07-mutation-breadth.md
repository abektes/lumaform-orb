# Variation Grid — Mutation Breadth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a grid cell's difference from its parent *attributable*. Today every cell changes almost everything, so you can see that a cell is better and never learn why.

**Architecture — the measured problem.** In the running app, on a tesseract with 18 parameters:

| Radius | Parameters changed per cell (of 18) |
| --- | --- |
| 0.1 "Small" | 15, 15, 14, 15, 13, 15, 15, 13 — avg **14.4** |
| 0.25 "Medium" | 16, 16, 15, 16, 16, 17, 15, 15 — avg **15.8** |
| 0.5 "Large" | 17, 17, 15, 18, 16, 15, 16, 17 — avg **16.4** |

The radius control does **not** change how many parameters vary — only how far each one moves. Turning it down from Large to Small takes you from 16 changed parameters to 14. Every cell is effectively a fresh randomisation.

The cause is in `mutateParams` ([src/core/variation-grid.js:66](src/core/variation-grid.js:66)): it loops over every key in `defs` and mutates each unconditionally. Only the `select` branch has a probability gate (`Math.random() < radius`); `number` and `color` always fire. `mutatePatch` *is* properly gated — it is only the parameter mutation that is unconditional.

The one working breadth control is the section lock, and it is coarse: locking to `motion` gives 3–6 changed parameters out of 18. That number is the right order of magnitude, which is the clue — but you get there by giving up two thirds of the search space, not by choosing how much to vary.

**Why this matters more than it looks.** `docs/VISION.md` §2 asks what movement reads as *thinking*, and §4 says the grid exists so differences can be **compared**. A cell that differs in sixteen ways cannot answer either question: you promote it, breed again, and sixteen more things change. Ten generations in you are somewhere interesting with no idea how you got there and no way back. Narrow, attributable mutation is what turns the grid from a slot machine into an instrument.

**The proposed model** (recommended; alternatives and how to overrule them are in the *Design note* below):

- **Radius keeps one job: magnitude.** How far a chosen parameter moves.
- **Breadth becomes a separate, explicit control:** how many parameters move at all. Default **3**.
- **Patch breeding becomes its own toggle** instead of being implied by whether `motion` is in the section list, so "vary the routing, hold the parameters" is expressible.
- **Each cell records what it changed** (`cell.mutatedKeys`), so attribution survives into the HUD and the export.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Design note — read before Task 1

This plan implements *breadth as a separate control*. Two alternatives were considered:

1. **Per-parameter axes** — make the grid a 2×2 matrix of one parameter across columns and another down rows. Fully attributable, but it is the sweep strip (`K`) generalised, and it throws away the serendipity that makes breeding worth having. Rejected as the *default*; it would be a good third grid mode later.
2. **Leave the model, document the finding.** Rejected because the radius control currently lies about what it does, and a control that lies is worse than no control.

If the repo owner has since chosen differently, follow that and adapt Tasks 1–3; Task 4 (recording what changed) is worth doing under any model.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework. UI is HTML strings and DOM nodes.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No test framework. Exit `0` on pass, `1` on fail. Anything tested must be free of DOM and Three.js.
- **Randomised behaviour must be tested deterministically.** Every mutation entry point takes an injectable `rng`; tests pass a seeded generator, never `Math.random`. A flaky test here is worse than no test.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Never modulate a rate parameter, and never modulate a `geometry`-section parameter.** Those constraints belong to the modulation rack, not to mutation — mutation may still change geometry parameters, because it sets them once at cell build time rather than every frame. Do not "fix" that.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: `/Users/ahmetbektes/WDesignspace/orb-animation`. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` first — §2, §4 and §5.

**`mutateParams(base, defs, radius = 0.25, sections = null)`** ([src/core/variation-grid.js:66](src/core/variation-grid.js:66)) returns a new params object. It only ever writes keys present in `defs` — deliberately, because `randomizeState()` in `state.js` once wrote a `rotSpeedZW` key no engine reads, and a mutator that invented keys would multiply that bug by the cell count. **Preserve that property.**

Its three branches:
- `number`: jitters by `±radius × (max − min)`, snaps to `def.step`, clamps to `[min, max]`, rounds to 4dp.
- `color`: converts to HSL, jitters hue by `±radius × 180`, saturation by `±radius × 60`, lightness by `±radius × 40`.
- `select`: **gated** — `if (Math.random() < radius)` picks a random option.

**`mutatePatch(patch, destKeys, radius)`** breeds the modulation rack — source rates, route amounts, and occasionally which source drives which destination. Already probability-gated throughout. `MAX_ROUTES = 4`, and it always keeps at least one route because a cell with no routes has no character to judge.

**`populate(radius, sections)`** ([src/core/variation-grid.js:249](src/core/variation-grid.js:249)) disposes and rebuilds every cell:

```js
const breedPatch = !sections || sections.includes('motion');
for (let i = 0; i < count; i++) {
  // Cell 0 is the unmutated parent, so you always have the reference in frame.
  const params = i === 0 ? { ...parent } : mutateParams(parent, defs, radius, sections);
  const patch = i === 0 || !breedPatch
    ? structuredClone(parentPatch)
    : mutatePatch(parentPatch, destKeys, radius);
  cells.push(buildCell(params, patch));
}
```

`cellFactory` short-circuits all of this — the sweep strip supplies deterministic cells. **Leave that path alone.**

**A cell** is `{ scene, engine, params, modulation, rack, time, lastMod, selected }`. Cells own their own clock so a tempo route reads as hesitation; all start at 0 so equal wall time has elapsed.

**`studio.reseedGrid({ radius, sections })`** ([src/core/studio.js:689](src/core/studio.js:689)) stores `gridRadius` / `gridSections` and calls `grid.populate(...)`.

**The HUD** is `createGridHud({ initialRadius, onChange: ({ sections, radius }) => …, onReseed, onExport, onExit })` in `src/ui/grid-hud.js`, with pure state logic in `src/ui/grid-hud-state.js` (tested by `tests/grid-hud-state.test.mjs` — **read it before changing the module**). `main.js` owns `GRID_RADII` and the `M` key that cycles it.

**The grid HUD lives in `ui.overlayLayer`** and must stay there — mounting it on `document.body` is what once made it cover the engine dropdown.

**Browser verification handle:** `window.__orb = { studio, state, ui, ab }`.

**CRITICAL browser gotchas:**
- A hidden Browser pane means `requestAnimationFrame` never fires. `studio.fpsTracker.fps` still reports `60` regardless — not a liveness signal. Step frames with `studio.renderFrame()`.
- **`setTimeout` is clamped to ~1000 ms in a hidden pane.** Inject the delta instead: `studio.clock.getDelta = () => 0.025`.
- **Grid mode runs at ~15 FPS with 9 cells** on this machine. That is a known, separate problem and is *not* in scope here — do not try to fix it, and do not let it make you think your changes broke something.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/variation-grid.js` | **Modify.** Breadth selection, injectable rng, changed-key tracking. |
| `src/core/studio.js` | **Modify.** Carry breadth and patch-breeding through `reseedGrid`. |
| `src/ui/grid-hud-state.js` | **Modify.** Breadth and patch state. |
| `src/ui/grid-hud.js` | **Modify.** The VARY control and the patch toggle. |
| `src/main.js` | **Modify.** Breadth options and the key that cycles them. |
| `tests/mutation-breadth.test.mjs` | **Create.** Deterministic tests for selection and breadth. |
| `tests/grid-hud-state.test.mjs` | **Modify.** Cover the new state. |

---

### Task 1: Choose which parameters mutate

**Files:**
- Modify: `src/core/variation-grid.js`
- Create: `tests/mutation-breadth.test.mjs`

**Interfaces:**
- `eligibleKeys(defs, sections) => string[]` — keys a mutation is allowed to touch, in definition order.
- `chooseMutationKeys(defs, { sections = null, breadth = null, rng = Math.random }) => string[]` — `breadth === null` means all eligible (today's behaviour, which the sweep and any old caller keep). Otherwise a uniform random subset of size `min(breadth, eligible.length)`, without repeats.
- `mutateParams(base, defs, radius, sections, { keys = null, rng = Math.random } = {})` — when `keys` is supplied, mutate exactly those; otherwise behave as before. **Return shape is unchanged.**

- [ ] **Step 1: Write the failing test**

Create `tests/mutation-breadth.test.mjs`:

```js
import {
  eligibleKeys,
  chooseMutationKeys,
  mutateParams,
} from '../src/core/variation-grid.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// Deterministic generator — a flaky mutation test is worse than none.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const defs = {
  hue:     { type: 'color',  default: '#ff0000', section: 'colors' },
  tint:    { type: 'color',  default: '#00ff00', section: 'colors' },
  glow:    { type: 'number', min: 0.5, max: 3.5, step: 0.1, default: 1.2, section: 'colors' },
  size:    { type: 'number', min: 1,   max: 5,   step: 0.5, default: 2,   section: 'geometry' },
  detail:  { type: 'number', min: 1,   max: 8,   step: 1,   default: 3,   section: 'geometry' },
  speed:   { type: 'number', min: 0,   max: 2,   step: 0.05, default: 1,  section: 'motion' },
  wobble:  { type: 'number', min: 0,   max: 1,   step: 0.05, default: 0.2, section: 'motion' },
  mode:    { type: 'select', options: ['a', 'b', 'c'], default: 'a', section: 'motion' },
};
const base = { hue: '#ff0000', tint: '#00ff00', glow: 1.2, size: 2, detail: 3, speed: 1, wobble: 0.2, mode: 'a' };
const ALL = Object.keys(defs);
const changed = (out) => ALL.filter((k) => out[k] !== base[k]);

// --- eligibility ---
ok('all keys are eligible with no lock', eligibleKeys(defs, null).length === 8);
ok('a section lock narrows eligibility',
  JSON.stringify(eligibleKeys(defs, ['motion'])) === JSON.stringify(['speed', 'wobble', 'mode']));
ok('multiple sections union', eligibleKeys(defs, ['colors', 'geometry']).length === 5);
ok('an empty lock means no restriction', eligibleKeys(defs, []).length === 8);
ok('an unknown section yields nothing', eligibleKeys(defs, ['nope']).length === 0);

// --- choosing ---
ok('null breadth chooses everything', chooseMutationKeys(defs, { breadth: null }).length === 8);
ok('breadth caps the count', chooseMutationKeys(defs, { breadth: 3, rng: seeded(1) }).length === 3);
ok('breadth above the pool is clamped', chooseMutationKeys(defs, { breadth: 99, rng: seeded(1) }).length === 8);
ok('breadth 0 chooses nothing', chooseMutationKeys(defs, { breadth: 0, rng: seeded(1) }).length === 0);
ok('choices never repeat', (() => {
  for (let i = 0; i < 200; i++) {
    const picked = chooseMutationKeys(defs, { breadth: 4, rng: seeded(i) });
    if (new Set(picked).size !== picked.length) return false;
  }
  return true;
})());
ok('choices respect the section lock', (() => {
  for (let i = 0; i < 200; i++) {
    const picked = chooseMutationKeys(defs, { breadth: 2, sections: ['motion'], rng: seeded(i) });
    if (picked.some((k) => defs[k].section !== 'motion')) return false;
  }
  return true;
})());
ok('the same seed gives the same choice',
  JSON.stringify(chooseMutationKeys(defs, { breadth: 3, rng: seeded(42) })) ===
  JSON.stringify(chooseMutationKeys(defs, { breadth: 3, rng: seeded(42) })));
ok('different seeds eventually differ', (() => {
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(chooseMutationKeys(defs, { breadth: 3, rng: seeded(i) }).join(','));
  return seen.size > 5;
})());
ok('selection is roughly uniform across keys', (() => {
  const hits = Object.fromEntries(ALL.map((k) => [k, 0]));
  for (let i = 0; i < 4000; i++) {
    for (const k of chooseMutationKeys(defs, { breadth: 2, rng: seeded(i) })) hits[k]++;
  }
  const counts = Object.values(hits);
  // 4000 draws x 2 of 8 keys => ~1000 each. Nothing should be starved or hogged.
  return Math.min(...counts) > 500 && Math.max(...counts) < 1600;
})());

// --- the actual defect: breadth must bound what changes ---
ok('unbounded mutation still changes nearly everything', (() => {
  const out = mutateParams(base, defs, 0.5, null, { rng: seeded(7) });
  return changed(out).length >= 6;
})(), 'this is the behaviour being replaced, kept for back-compat');

ok('breadth 3 changes at most 3 parameters', (() => {
  for (let i = 0; i < 300; i++) {
    const keys = chooseMutationKeys(defs, { breadth: 3, rng: seeded(i) });
    const out = mutateParams(base, defs, 0.5, null, { keys, rng: seeded(i + 9000) });
    if (changed(out).length > 3) return false;
  }
  return true;
})());
ok('breadth 1 changes at most 1', (() => {
  for (let i = 0; i < 300; i++) {
    const keys = chooseMutationKeys(defs, { breadth: 1, rng: seeded(i) });
    const out = mutateParams(base, defs, 0.5, null, { keys, rng: seeded(i + 5) });
    if (changed(out).length > 1) return false;
  }
  return true;
})());
ok('only the chosen keys can change', (() => {
  for (let i = 0; i < 300; i++) {
    const keys = chooseMutationKeys(defs, { breadth: 2, rng: seeded(i) });
    const out = mutateParams(base, defs, 0.5, null, { keys, rng: seeded(i + 3) });
    if (changed(out).some((k) => !keys.includes(k))) return false;
  }
  return true;
})());
ok('a chosen numeric key usually does move', (() => {
  let moved = 0;
  for (let i = 0; i < 200; i++) {
    const out = mutateParams(base, defs, 0.5, null, { keys: ['glow'], rng: seeded(i) });
    if (out.glow !== base.glow) moved++;
  }
  return moved > 150;   // step-snapping can land back on the original
})());

// --- properties that must survive ---
ok('never invents a key outside defs', (() => {
  const out = mutateParams(base, defs, 0.5, null, { rng: seeded(11) });
  return Object.keys(out).every((k) => k in base);
})());
ok('always stays inside min/max', (() => {
  for (let i = 0; i < 400; i++) {
    const out = mutateParams(base, defs, 1.0, null, { rng: seeded(i) });
    for (const [k, d] of Object.entries(defs)) {
      if (d.type !== 'number') continue;
      if (out[k] < d.min - 1e-9 || out[k] > d.max + 1e-9) return false;
    }
  }
  return true;
})());
ok('colours stay valid hex', (() => {
  for (let i = 0; i < 200; i++) {
    const out = mutateParams(base, defs, 1.0, null, { rng: seeded(i) });
    if (!/^#[0-9a-f]{6}$/i.test(out.hue)) return false;
  }
  return true;
})());
ok('selects only ever take a declared option', (() => {
  for (let i = 0; i < 300; i++) {
    const out = mutateParams(base, defs, 1.0, null, { rng: seeded(i) });
    if (!defs.mode.options.includes(out.mode)) return false;
  }
  return true;
})());
ok('the base object is not mutated', (() => {
  const snapshot = JSON.stringify(base);
  mutateParams(base, defs, 0.8, null, { rng: seeded(2) });
  return JSON.stringify(base) === snapshot;
})());

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/mutation-breadth.test.mjs`
Expected: fails — `eligibleKeys` and `chooseMutationKeys` are not exported.

- [ ] **Step 3: Write the implementation**

In `src/core/variation-grid.js`, find:

```js
export function mutateParams(base, defs, radius = 0.25, sections = null) {
  const out = { ...base };
  const allowed = sections && sections.length ? new Set(sections) : null;

  for (const [key, def] of Object.entries(defs || {})) {
    if (allowed && !allowed.has(def.section)) continue;
```

Replace with:

```js
// The keys a mutation may touch, in definition order. Section locking is the
// only breadth control this file had for a long time, which is why locking to
// one section was the only way to get a comparable cell.
export function eligibleKeys(defs, sections) {
  const allowed = sections && sections.length ? new Set(sections) : null;
  return Object.entries(defs || {})
    .filter(([, def]) => !allowed || allowed.has(def.section))
    .map(([key]) => key);
}

// How MANY parameters vary, as opposed to how FAR each one moves.
//
// mutateParams used to jitter every eligible key on every cell, so a 3x3 grid at
// any radius gave nine orbs differing in ~16 of 18 parameters. You could see that
// a cell was better and never learn why, and promoting it changed sixteen more
// things. Radius still means magnitude; this decides breadth.
//
// `rng` is injectable so the behaviour can be tested deterministically.
export function chooseMutationKeys(defs, { sections = null, breadth = null, rng = Math.random } = {}) {
  const pool = eligibleKeys(defs, sections);
  if (breadth === null || breadth === undefined) return pool;

  const take = Math.max(0, Math.min(Math.floor(breadth), pool.length));
  if (take === pool.length) return pool;

  // Partial Fisher-Yates: unbiased, and it stops after `take` swaps.
  const shuffled = [...pool];
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (shuffled.length - i));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, take);
}

export function mutateParams(base, defs, radius = 0.25, sections = null, { keys = null, rng = Math.random } = {}) {
  const out = { ...base };
  const allowed = sections && sections.length ? new Set(sections) : null;
  // A caller that has already chosen its keys (the grid, so it can record what
  // changed) passes them in; anything else keeps the old all-eligible behaviour.
  const selected = keys ? new Set(keys) : null;

  for (const [key, def] of Object.entries(defs || {})) {
    if (allowed && !allowed.has(def.section)) continue;
    if (selected && !selected.has(key)) continue;
```

Then, within the same function body, replace every remaining `Math.random()` with `rng()`. There are four: the numeric jitter, three in the colour branch, and the `select` gate and its option pick. Read the whole function and convert them all — a missed one silently defeats the determinism the tests rely on.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/mutation-breadth.test.mjs`
Expected: `ALL PASS`.

Also run the existing suites — `mutateParams`'s signature grew but its behaviour with the old 4-argument call must be identical:

```bash
for f in tests/*.test.mjs; do echo "== $f"; node "$f" | tail -1; done
```

- [ ] **Step 5: Commit**

```bash
git add src/core/variation-grid.js tests/mutation-breadth.test.mjs
git commit -m "Separate mutation breadth from mutation magnitude"
```

---

### Task 2: Breed with a breadth, and record what changed

**Files:**
- Modify: `src/core/variation-grid.js`
- Modify: `src/core/studio.js`

**Interfaces:**
- `populate(radius, sections, { breadth, breedPatch })`
- Each cell gains `mutatedKeys: string[]` (empty for cell 0).
- `grid.describeCell(index) => { index, mutatedKeys, changes: [{ key, from, to }] }`
- `studio.reseedGrid({ radius, sections, breadth, breedPatch })`

- [ ] **Step 1: Thread breadth through populate**

In `src/core/variation-grid.js`, find:

```js
  function populate(radius, sections) {
```

Replace with:

```js
  function populate(radius, sections, { breadth = DEFAULT_BREADTH, breedPatch = null } = {}) {
```

Then find:

```js
    // When the mutation is locked to a section, only breed the patch if motion is
    // in scope — otherwise "colours only" would still change how the orb moves.
    const breedPatch = !sections || sections.includes('motion');
    for (let i = 0; i < count; i++) {
      // Cell 0 is the unmutated parent, so you always have the reference in frame.
      const params = i === 0 ? { ...parent } : mutateParams(parent, defs, radius, sections);
      const patch =
        i === 0 || !breedPatch
          ? structuredClone(parentPatch)
          : mutatePatch(parentPatch, destKeys, radius);
      cells.push(buildCell(params, patch));
    }
```

Replace with:

```js
    // Patch breeding used to be implied by whether 'motion' was in the section
    // list, which made "vary the routing but hold the parameters" inexpressible.
    // It is now its own switch, defaulting to the old rule.
    const shouldBreedPatch = breedPatch === null
      ? (!sections || sections.includes('motion'))
      : breedPatch;

    for (let i = 0; i < count; i++) {
      // Cell 0 is the unmutated parent, so you always have the reference in frame.
      if (i === 0) {
        const cell = buildCell({ ...parent }, structuredClone(parentPatch));
        cell.mutatedKeys = [];
        cells.push(cell);
        continue;
      }
      // Keys are chosen here rather than inside mutateParams so the cell can
      // record what it changed — attribution is the whole point of breadth.
      const keys = chooseMutationKeys(defs, { sections, breadth });
      const params = mutateParams(parent, defs, radius, sections, { keys });
      const patch = shouldBreedPatch
        ? mutatePatch(parentPatch, destKeys, radius)
        : structuredClone(parentPatch);
      const cell = buildCell(params, patch);
      // Only the keys that actually moved: step-snapping can land a chosen key
      // back on its original value, and reporting it would be a lie.
      cell.mutatedKeys = keys.filter((key) => params[key] !== parent[key]);
      cells.push(cell);
    }
```

Add near the top of the module, beside the other constants:

```js
// Three changes per cell keeps a difference attributable while still letting the
// grid surprise you. Null would restore the old change-everything behaviour.
export const DEFAULT_BREADTH = 3;
```

- [ ] **Step 2: Expose what changed**

In `src/core/variation-grid.js`, find the returned object of `createVariationGrid` (search for `return {` near `populate,`) and add:

```js
    // What separates a cell from its parent, for the HUD and the export. Reading
    // it back off the cell rather than recomputing keeps it honest if the
    // mutation model changes again.
    describeCell(index) {
      const cell = cells[index];
      if (!cell) return null;
      return {
        index,
        mutatedKeys: cell.mutatedKeys ?? [],
        changes: (cell.mutatedKeys ?? []).map((key) => ({
          key,
          label: defs[key]?.label ?? key,
          from: parent[key],
          to: cell.params[key],
        })),
      };
    },
```

- [ ] **Step 3: Carry it through the studio**

In `src/core/studio.js`, find:

```js
  reseedGrid({ radius, sections } = {}) {
    if (!this.grid) return;
    if (radius !== undefined) this.gridRadius = radius;
    if (sections !== undefined) this.gridSections = sections;
    this.grid.populate(this.gridRadius, this.gridSections);
  }
```

Replace with:

```js
  reseedGrid({ radius, sections, breadth, breedPatch } = {}) {
    if (!this.grid) return;
    if (radius !== undefined) this.gridRadius = radius;
    if (sections !== undefined) this.gridSections = sections;
    if (breadth !== undefined) this.gridBreadth = breadth;
    if (breedPatch !== undefined) this.gridBreedPatch = breedPatch;
    this.grid.populate(this.gridRadius, this.gridSections, {
      breadth: this.gridBreadth,
      breedPatch: this.gridBreedPatch,
    });
  }
```

Then find `enterGridMode` and, after the grid is created, make its first populate use the same defaults. Search for where `enterGridMode` calls `populate` (or relies on `createVariationGrid` to do it) and pass `{ breadth: this.gridBreadth, breedPatch: this.gridBreedPatch }`. Initialise both in the constructor beside the other grid fields:

```js
    this.gridBreadth = DEFAULT_BREADTH;
    this.gridBreedPatch = null;   // null = follow the section lock, as before
```

importing `DEFAULT_BREADTH` from `./variation-grid.js`.

**Do not touch `enterSweepMode`** — it supplies a `cellFactory`, which short-circuits mutation entirely.

- [ ] **Step 4: Verify the build and the numbers**

Run: `npx vite build`, then in the browser with the pane open:

```js
const { studio: s, state: st, ui } = window.__orb;
if (!s.isGridMode) ui.onToggleGrid();
const out = {};
const count = (cells) => {
  const keys = Object.keys(cells[0].params);
  return cells.slice(1).map((c) => keys.filter((k) => c.params[k] !== cells[0].params[k]).length);
};
for (const breadth of [1, 3, 6, null]) {
  s.reseedGrid({ radius: 0.5, breadth });
  const changed = count(s.grid.cells);
  out[`breadth_${breadth}`] = { changed, max: Math.max(...changed) };
}
out.totalParams = Object.keys(s.grid.cells[0].params).length;
// radius must now only affect magnitude, not count
s.reseedGrid({ radius: 0.1, breadth: 3 });
out.smallRadiusStillThree = Math.max(...count(s.grid.cells)) <= 3;
s.reseedGrid({ radius: 0.5, breadth: 3 });
out.largeRadiusStillThree = Math.max(...count(s.grid.cells)) <= 3;
out.describeCell1 = s.grid.describeCell(1);
out.cell0IsParent = s.grid.describeCell(0).mutatedKeys.length === 0;
JSON.stringify(out, null, 2);
```

Expected: `breadth_1.max === 1`, `breadth_3.max === 3`, `breadth_6.max === 6`, `breadth_null.max` back around 15–17, both radius checks `true`, and `describeCell(1)` listing at most 3 changes with `from`/`to` values.

- [ ] **Step 5: Commit**

```bash
git add src/core/variation-grid.js src/core/studio.js
git commit -m "Breed grid cells with a bounded breadth and record what changed"
```

---

### Task 3: The VARY control

**Files:**
- Modify: `src/ui/grid-hud-state.js`
- Modify: `tests/grid-hud-state.test.mjs`
- Modify: `src/ui/grid-hud.js`
- Modify: `src/main.js`

**Read `tests/grid-hud-state.test.mjs` first** and follow its existing structure and helper names.

- [ ] **Step 1: Extend the HUD state**

Add `breadth` to the state module alongside `radius` and `sections`, with:
- `BREADTH_OPTIONS = [1, 3, 6, null]` and labels `['1 param', '3 params', '6 params', 'Everything']`.
- `cycleBreadth(state)` returning the next option, wrapping.
- The default is `3`.

Add tests to `tests/grid-hud-state.test.mjs` covering: the default is 3; cycling wraps through all four; `null` is a legal value meaning everything; and cycling never yields a value outside `BREADTH_OPTIONS`.

- [ ] **Step 2: Render the control**

In `src/ui/grid-hud.js`, add a `VARY` group beside `RADIUS`, matching the existing chip markup and using the same `.grid-hud-chip` / `.grid-hud-label` classes. Extend the `onChange` payload to `{ sections, radius, breadth, breedPatch }` and add a `Patch` toggle chip next to the section chips.

Keep the HUD in `ui.overlayLayer`. The HUD is already wide; add the new group to the existing wrap-capable row rather than a second row, and re-check at 1280px that it still fits (`.grid-hud` has `flex-wrap: wrap` and `max-width: calc(100vw - 48px)` under the 1280px breakpoint).

- [ ] **Step 3: Bind a key**

In `src/main.js`, add `GRID_BREADTHS` beside `GRID_RADII`, and bind a grid-mode key to cycle it. **`B` is free** — verify with `grep -n "e.code === " src/main.js src/ui/studio-ui.js` before using it.

Then add the entry to `src/core/shortcuts.js`:

```js
{ code: 'KeyB', label: 'Cycle how many parameters vary', context: 'grid', group: 'Grid' },
```

`tests/shortcuts.test.mjs` scans both files and **will fail** if you bind a key without registering it, or register one you did not bind.

- [ ] **Step 4: Verify**

```bash
npx vite build && for f in tests/*.test.mjs; do echo "== $f"; node "$f" | tail -1; done
```

Then in the browser: enter the grid, press `B` and confirm the VARY chip cycles `1 → 3 → 6 → Everything → 1` and that the cells visibly re-breed with the corresponding breadth each time. Screenshot the HUD at 1280px wide to confirm it still fits.

- [ ] **Step 5: Commit**

```bash
git add src/ui/grid-hud-state.js src/ui/grid-hud.js src/main.js src/core/shortcuts.js tests/grid-hud-state.test.mjs
git commit -m "Add a VARY control so breadth is adjustable from the grid"
```

---

### Task 4: Carry attribution into the export

**Files:**
- Modify: `src/core/variation-grid.js`

- [ ] **Step 1: Include the changed keys**

Find `exportSelected()` in `src/core/variation-grid.js` and add `mutatedKeys` to each emitted entry, beside `engine` / `global` / `params` / `modulation`.

Keep it **additive and optional** — `docs/VISION.md` §6 is explicit that the export format is a lab notebook with no stability guarantee, but import must still round-trip. Confirm `parseConfigFile` ignores unknown top-level keys, or add `mutatedKeys` to its allow-list, and re-run `node tests/config-io.test.mjs`.

- [ ] **Step 2: Verify the round trip**

```js
const { studio: s, ui } = window.__orb;
if (!s.isGridMode) ui.onToggleGrid();
s.reseedGrid({ radius: 0.4, breadth: 3 });
s.grid.cells[1].selected = true; s.grid.cells[4].selected = true;
const json = JSON.stringify(s.grid.exportSelected());
const parsed = JSON.parse(json);
const out = {
  entries: parsed.length,
  carriesAttribution: parsed.every((e) => Array.isArray(e.mutatedKeys)),
  atMostBreadth: parsed.every((e) => e.mutatedKeys.length <= 3),
  reimports: ui.importConfigText(JSON.stringify(parsed[0])),
};
ui.onToggleGrid();
JSON.stringify(out, null, 2);
```

Expected: `entries: 2`, `carriesAttribution: true`, `atMostBreadth: true`, `reimports: true`.

- [ ] **Step 3: Commit**

```bash
git add src/core/variation-grid.js
git commit -m "Carry the mutated keys into the grid export"
```

---

## Definition of done

- `node tests/mutation-breadth.test.mjs` prints `ALL PASS`; every other suite still passes; `npx vite build` succeeds.
- At breadth 3, **no cell differs from cell 0 in more than 3 parameters**, at any radius.
- Radius changes how far a parameter moves and nothing else.
- "Everything" restores the old behaviour, so nothing is lost.
- The sweep strip (`K`) is unaffected — it goes through `cellFactory`.
- `grid.describeCell(i)` names what changed, with before/after values.
- The VARY control and its key work, and are registered in `src/core/shortcuts.js`.
- Marked-cell export carries `mutatedKeys` and still re-imports.
- No console errors.

## Follow-up worth noting

With breadth bounded, the obvious next question is whether the grid should *show* what changed on each cell — a one-line caption per cell, the way the sweep strip already captions its ramp. `describeCell` exists to make that a small change. Hold it until breadth has been used for a real session: if three changes per cell turns out to be legible without labels, the caption is clutter.

Record in `docs/VISION.md` §9 whether narrower mutation actually raises the discovery rate. That is a direct test of the §4 claim that the grid's value is *comparison* rather than *volume*, and it is the kind of observation §3 says the eventual state vocabulary should be built out of. Update the capability inventory in the same commit as your last task.
