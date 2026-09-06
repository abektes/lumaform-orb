# Parameter Sweep Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one parameter at five evenly spaced values side by side, so you can see what a knob actually does instead of inferring it by dragging.

**Architecture:** The variation grid already renders N live cells from a single WebGL context using scissored viewports, and every cell is an independent scene + engine instance. A sweep is the same machinery with two differences: a 5×1 layout instead of 3×3, and cells derived from a deterministic parameter ramp rather than random mutation. Rather than duplicating the renderer, this plan adds an optional `cellFactory` hook to `createVariationGrid` and a thin `enterSweepMode` on the studio that supplies a ramp.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework.
- **ES modules**, `"type": "module"`.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. There is no test framework and you must not add one. Exit `0` on pass, `1` on fail.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Backwards compatibility is mandatory:** the existing 3×3 variation grid must keep working unchanged. `cellFactory` is optional; when omitted, `populate()` behaves exactly as it does today.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: `/Users/ahmetbektes/WDesignspace/orb-animation`. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

**The parameter schema** lives in `src/core/state.js` as `ENGINE_PARAM_DEFINITIONS`, keyed by engine id. Each parameter definition looks like:

```js
edgeGlow: { type: 'number', label: 'Edge Luma', min: 0.0, max: 3.0, step: 0.05, default: 1.2, section: 'colors' }
archetype: { type: 'select', label: 'Archetype', options: ['geodesic', 'cubic_compound'], default: 'geodesic', section: 'geometry' }
color1:    { type: 'color',  label: 'Primary', default: '#ffed00', section: 'colors' }
```

`type` is one of `'number' | 'select' | 'color'`. `section` is one of `'colors' | 'geometry' | 'motion'`. The 8 engine ids are: `tesseract`, `moire`, `auris`, `hopf`, `polytope`, `nebula`, `quantum`, `singularity`.

**The existing grid** (`src/core/variation-grid.js`) exports `createVariationGrid(options)`. Read that file before starting. The parts you will touch:

```js
export function createVariationGrid({
  renderer, engineFactory, engineType, baseParams, globalSettings,
  modulation, defs, cols = 3, rows = 3,
}) { ... }
```

Inside it, `populate(radius, sections)` disposes all cells and rebuilds `cols * rows` of them; `buildCell(params, patch)` creates one scene + engine instance; `cellRect(index, width, height)` computes each cell's viewport rectangle (note: **WebGL viewport origin is bottom-left**, cells are laid out top-left, which `cellRect` already handles).

`render(time, delta, width, height)` iterates cells, applies each cell's modulation rack, and renders each through a RenderPass+OutputPass composer with scissor clipping. Bloom is deliberately excluded because it is a full-screen pass that would bleed across cell boundaries.

**Studio grid API** (`src/core/studio.js`): `enterGridMode(state, opts)`, `exitGridMode()`, `isGridMode`, `reseedGrid({radius, sections})`, and the field `studio.grid`.

**Grid mode UI:** entering adds the CSS class `grid-mode` to `ui.root`, which hides the inspector sidebar and playback dock (see `src/style.css`). `src/main.js` has `toggleGrid()` and binds `G`.

**Browser verification handle:** `window.__orb = { studio, state, ui }`.

**CRITICAL browser gotcha:** if the Browser pane is hidden, `requestAnimationFrame` never fires, so the render loop is frozen and the app *looks* broken. `studio.fpsTracker.fps` reports its default `60` regardless — don't trust it. Step frames manually with `studio.renderFrame()`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/sweep.js` | **Create.** Pure ramp maths: which params are sweepable, and the value ladder for one. |
| `src/core/variation-grid.js` | **Modify.** Add an optional `cellFactory` hook to `createVariationGrid`. |
| `src/core/studio.js` | **Modify.** Add `enterSweepMode(state, { paramKey, steps })`. |
| `src/main.js` | **Modify.** Bind a key to sweep the most recently touched parameter; render a caption strip. |
| `src/style.css` | **Modify.** Append caption styles. |
| `tests/sweep.test.mjs` | **Create.** Node tests for the ramp maths. |

---

### Task 1: Sweep ramp maths

**Files:**
- Create: `src/core/sweep.js`
- Test: `tests/sweep.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULT_STEPS = 5`
  - `isSweepable(def) => boolean` — `true` only for `type === 'number'` definitions that have finite `min` and `max` with `max > min`. Colours and selects are not sweepable (a five-step ramp between two hex colours or three enum options is not a meaningful ladder).
  - `sweepValues(def, steps = DEFAULT_STEPS) => number[]` — `steps` values from `def.min` to `def.max` inclusive, evenly spaced, snapped to `def.step` when present, rounded to 4 decimals, and **clamped back inside `[min, max]`** after snapping. Returns `[]` when `!isSweepable(def)` or `steps < 2`.
  - `listSweepableParams(defs) => Array<{ key, label, min, max, section }>`

- [ ] **Step 1: Write the failing test**

Create `tests/sweep.test.mjs`:

```js
import { DEFAULT_STEPS, isSweepable, sweepValues, listSweepableParams } from '../src/core/sweep.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const numberDef = { type: 'number', label: 'Edge Luma', min: 0, max: 3, step: 0.05, section: 'colors' };
const tinyDef   = { type: 'number', label: 'Internal Glow', min: 0.002, max: 0.03, step: 0.001, section: 'colors' };
const noStepDef = { type: 'number', label: 'Free', min: 0, max: 1, section: 'motion' };
const colorDef  = { type: 'color', label: 'Primary', default: '#ffed00', section: 'colors' };
const selectDef = { type: 'select', label: 'Shape', options: ['a', 'b'], section: 'geometry' };

ok('DEFAULT_STEPS is 5', DEFAULT_STEPS === 5);

// isSweepable
ok('numbers are sweepable', isSweepable(numberDef) === true);
ok('colors are not sweepable', isSweepable(colorDef) === false);
ok('selects are not sweepable', isSweepable(selectDef) === false);
ok('missing bounds are not sweepable', isSweepable({ type: 'number' }) === false);
ok('zero-width range is not sweepable', isSweepable({ type: 'number', min: 1, max: 1 }) === false);
ok('undefined def is not sweepable', isSweepable(undefined) === false);

// sweepValues
const v = sweepValues(numberDef);
ok('returns DEFAULT_STEPS values', v.length === 5, JSON.stringify(v));
ok('starts at min', v[0] === 0);
ok('ends at max', v[4] === 3);
ok('is strictly ascending', v.every((x, i) => i === 0 || x > v[i - 1]), JSON.stringify(v));
ok('stays within bounds', v.every((x) => x >= numberDef.min && x <= numberDef.max));
ok('snaps to step', v.every((x) => Math.abs(Math.round(x / 0.05) * 0.05 - x) < 1e-6), JSON.stringify(v));

const tiny = sweepValues(tinyDef);
ok('handles a narrow range', tiny.length === 5 && tiny[0] === 0.002 && tiny[4] === 0.03, JSON.stringify(tiny));
ok('narrow range stays in bounds', tiny.every((x) => x >= 0.002 && x <= 0.03));

const free = sweepValues(noStepDef, 3);
ok('honours a custom step count', eq(free, [0, 0.5, 1]), JSON.stringify(free));

ok('rejects non-sweepable defs', eq(sweepValues(colorDef), []));
ok('rejects fewer than 2 steps', eq(sweepValues(numberDef, 1), []));
ok('all values are finite', sweepValues(numberDef, 9).every(Number.isFinite));

// listSweepableParams
const defs = { edgeGlow: numberDef, color1: colorDef, shape: selectDef, glow: tinyDef };
const list = listSweepableParams(defs);
ok('lists only sweepable params', eq(list.map((p) => p.key).sort(), ['edgeGlow', 'glow']));
ok('carries the label through', list.find((p) => p.key === 'edgeGlow').label === 'Edge Luma');
ok('handles empty defs', eq(listSweepableParams({}), []));
ok('handles undefined defs', eq(listSweepableParams(undefined), []));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/sweep.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/core/sweep.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/sweep.js`:

```js
// Parameter sweep — one parameter rendered at N evenly spaced values.
//
// Dragging a slider tells you where a value ends up; a ladder tells you what the
// parameter *does*. Pure maths, no DOM and no Three.js, so it can be tested in
// Node.

export const DEFAULT_STEPS = 5;

// Only numeric parameters ladder meaningfully. A ramp between two hex colours or
// across three enum options is not a comparison, it's a slideshow.
export function isSweepable(def) {
  if (!def || def.type !== 'number') return false;
  if (!Number.isFinite(def.min) || !Number.isFinite(def.max)) return false;
  return def.max > def.min;
}

export function sweepValues(def, steps = DEFAULT_STEPS) {
  if (!isSweepable(def) || steps < 2) return [];

  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    let value = def.min + (def.max - def.min) * t;
    if (def.step) value = Math.round(value / def.step) * def.step;
    // Snapping can push the endpoints just outside the declared range, and an
    // out-of-range value would be clamped inconsistently by each engine.
    value = Math.min(def.max, Math.max(def.min, value));
    out.push(+value.toFixed(4));
  }
  return out;
}

export function listSweepableParams(defs) {
  return Object.entries(defs || {})
    .filter(([, def]) => isSweepable(def))
    .map(([key, def]) => ({
      key,
      label: def.label,
      min: def.min,
      max: def.max,
      section: def.section,
    }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/sweep.test.mjs`
Expected: every line `PASS`, final line `ALL PASS`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/sweep.js tests/sweep.test.mjs
git commit -m "Add sweep ramp maths for parameter ladders"
```

---

### Task 2: Let the grid build cells from a supplied factory

**Files:**
- Modify: `src/core/variation-grid.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createVariationGrid` gains an optional `cellFactory` option.
  - Signature: `cellFactory(index: number, count: number) => { params: object, patch?: object }`
  - When supplied, `populate()` calls it for every cell instead of mutating. When omitted, behaviour is byte-for-byte what it is today.

- [ ] **Step 1: Add the option to the factory signature**

In `src/core/variation-grid.js`, find:

```js
export function createVariationGrid({
  renderer,
  engineFactory,
  engineType,
  baseParams,
  globalSettings,
  modulation,
  defs,
  cols = 3,
  rows = 3,
}) {
```

Replace with:

```js
export function createVariationGrid({
  renderer,
  engineFactory,
  engineType,
  baseParams,
  globalSettings,
  modulation,
  defs,
  cols = 3,
  rows = 3,
  // Optional. When supplied, populate() asks this for each cell's config instead
  // of breeding one. The sweep strip uses it to lay out a deterministic ramp;
  // omit it and the grid mutates exactly as before.
  cellFactory = null,
}) {
```

- [ ] **Step 2: Branch inside populate**

In the same file, find:

```js
  function populate(radius, sections) {
    for (const cell of cells) disposeCell(cell);
    cells.length = 0;
    const count = cols * rows;
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
  }
```

Replace with:

```js
  function populate(radius, sections) {
    for (const cell of cells) disposeCell(cell);
    cells.length = 0;
    const count = cols * rows;

    if (cellFactory) {
      for (let i = 0; i < count; i++) {
        const spec = cellFactory(i, count);
        cells.push(buildCell(spec.params, spec.patch ?? structuredClone(parentPatch)));
      }
      return;
    }

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
  }
```

- [ ] **Step 3: Verify the existing grid still works**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

Then in the browser (dev server running, http://localhost:5173):

```js
const { studio: s, ui } = window.__orb;
ui.onToggleGrid();
for (let i = 0; i < 3; i++) s.renderFrame();
const g = s.grid;
JSON.stringify({
  cells: g.cells.length,                                                   // expect 9
  distinctConfigs: new Set(g.cells.map(c => JSON.stringify(c.params))).size, // expect 9
  cell0IsParent: JSON.stringify(g.cells[0].params) === JSON.stringify(window.__orb.state.engines[window.__orb.state.engine]),
});
```

Expected: `cells: 9`, `distinctConfigs: 9`, `cell0IsParent: true` — i.e. the existing grid is unchanged. Exit grid mode with `window.__orb.ui.onToggleGrid()`.

- [ ] **Step 4: Commit**

```bash
git add src/core/variation-grid.js
git commit -m "Allow the variation grid to build cells from a supplied factory"
```

---

### Task 3: Studio sweep mode

**Files:**
- Modify: `src/core/studio.js`

**Interfaces:**
- Consumes: `sweepValues`, `isSweepable` from `./sweep.js`; `createVariationGrid` (already imported in `studio.js`).
- Produces:
  - `studio.enterSweepMode(state, { paramKey, steps = 5 }) => { key, label, values } | null` — returns `null` (and logs a warning) if the parameter is not sweepable for the active engine.
  - `studio.sweepInfo` — `{ key, label, values } | null`, readable while a sweep is active.
  - Sweeps reuse `this.grid`, so `isGridMode`, `exitGridMode()` and the existing render branch all work untouched.

- [ ] **Step 1: Add the import**

In `src/core/studio.js`, find:

```js
import { createVariationGrid } from './variation-grid.js';
```

Add directly below it:

```js
import { isSweepable, sweepValues } from './sweep.js';
```

- [ ] **Step 2: Add sweep state to the constructor**

In `src/core/studio.js`, find this line in the constructor:

```js
    this.onGridPromote = null;
```

Add directly below it:

```js
    this.sweepInfo = null;
```

- [ ] **Step 3: Add enterSweepMode**

In `src/core/studio.js`, find the method `reseedGrid` (it begins `reseedGrid({ radius, sections } = {}) {`). Insert this new method immediately **before** it:

```js
  // A sweep is the variation grid with a deterministic ramp instead of mutation:
  // one row, N cells, one parameter walked from min to max. It reuses this.grid
  // so grid mode's render branch, exit path and pointer handling all apply.
  enterSweepMode(state, { paramKey, steps = 5 } = {}) {
    const type = state.engine;
    const factory = this.engineConstructors.get(type);
    if (!factory) {
      console.error(`Engine type "${type}" not registered.`);
      return null;
    }

    const defs = ENGINE_PARAM_DEFINITIONS[type] || {};
    const def = defs[paramKey];
    if (!isSweepable(def)) {
      console.warn(`Parameter "${paramKey}" is not sweepable on engine "${type}".`);
      return null;
    }

    const values = sweepValues(def, steps);
    const base = state.engines[type];

    this.exitGridMode();
    this.controls.enabled = false;

    this.grid = createVariationGrid({
      renderer: this.renderer,
      engineFactory: factory,
      engineType: type,
      baseParams: base,
      globalSettings: state.global,
      modulation: state.modulation,
      defs,
      cols: values.length,
      rows: 1,
      cellFactory: (index) => ({ params: { ...base, [paramKey]: values[index] } }),
    });
    this.grid.populate();

    this.sweepInfo = { key: paramKey, label: def.label, values };
    return this.sweepInfo;
  }

```

- [ ] **Step 4: Clear sweep state on exit**

In `src/core/studio.js`, find the method:

```js
  exitGridMode() {
    if (!this.grid) return;
    this.grid.dispose();
    this.grid = null;
    this.controls.enabled = true;
    this.renderer.setScissorTest(false);
    this.onWindowResize();
  }
```

Replace with:

```js
  exitGridMode() {
    if (!this.grid) return;
    this.grid.dispose();
    this.grid = null;
    this.sweepInfo = null;
    this.controls.enabled = true;
    this.renderer.setScissorTest(false);
    this.onWindowResize();
  }
```

- [ ] **Step 5: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/studio.js
git commit -m "Add sweep mode: one parameter laddered across a row of cells"
```

---

### Task 4: Keybinding and caption strip

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css` (append at end)

**Interfaces:**
- Consumes: `studio.enterSweepMode`, `studio.sweepInfo`, `studio.exitGridMode`, `listSweepableParams` from `./core/sweep.js`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the import**

In `src/main.js`, directly below `import { StudioUI } from './ui/studio-ui.js';`, add:

```js
import { listSweepableParams } from './core/sweep.js';
```

- [ ] **Step 2: Add the sweep toggle and caption**

In `src/main.js`, directly below `window.__orb = { studio, state, ui };`, add:

```js
// --- parameter sweep --------------------------------------------------------
// K sweeps one parameter across a row of cells. Which parameter: the last one
// the user actually touched, falling back to the first sweepable one, so the
// key does something useful without a picker.
import { ENGINE_PARAM_DEFINITIONS } from './core/state.js';

let lastTouchedParam = null;
document.addEventListener('input', (e) => {
  const key = e.target?.getAttribute?.('data-param');
  if (key) lastTouchedParam = key;
}, true);

const sweepCaption = document.createElement('div');
sweepCaption.className = 'sweep-caption hidden';
document.body.appendChild(sweepCaption);

function showSweepCaption(info) {
  if (!info) {
    sweepCaption.classList.add('hidden');
    sweepCaption.innerHTML = '';
    return;
  }
  sweepCaption.classList.remove('hidden');
  sweepCaption.style.gridTemplateColumns = `repeat(${info.values.length}, 1fr)`;
  sweepCaption.innerHTML =
    `<div class="sweep-title">${info.label}</div>` +
    `<div class="sweep-values" style="grid-template-columns: repeat(${info.values.length}, 1fr)">` +
    info.values.map((v) => `<span>${v}</span>`).join('') +
    `</div>`;
}

function toggleSweep() {
  if (studio.isGridMode) {
    studio.exitGridMode();
    studio.setEngine(state.engine, state);
    ui.root.classList.remove('grid-mode');
    ui.render();
    showSweepCaption(null);
    return;
  }

  const defs = ENGINE_PARAM_DEFINITIONS[state.engine] || {};
  const candidates = listSweepableParams(defs);
  if (!candidates.length) {
    console.warn(`No sweepable parameters on engine "${state.engine}".`);
    return;
  }
  const key = candidates.some((c) => c.key === lastTouchedParam)
    ? lastTouchedParam
    : candidates[0].key;

  const info = studio.enterSweepMode(state, { paramKey: key, steps: 5 });
  if (!info) return;
  ui.root.classList.add('grid-mode');
  ui.render();
  showSweepCaption(info);
}

window.__orb.toggleSweep = toggleSweep;
```

- [ ] **Step 3: Bind the key**

In `src/main.js`, find the existing keydown listener block that starts with `if (e.code === 'KeyG') {`. Insert this **immediately before** that `if`:

```js
  if (e.code === 'KeyK') {
    e.preventDefault();
    toggleSweep();
    return;
  }

```

- [ ] **Step 4: Append the styles**

Append to the end of `src/style.css`:

```css

/* ---------------------------------------------------------------------------
   Sweep strip caption. Labels the parameter and prints the value under each
   cell — a ladder with no numbers is just a row of shapes.
   --------------------------------------------------------------------------- */
.sweep-caption {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 18px;
  z-index: 50;
  pointer-events: none;
  font-family: var(--font);
  text-align: center;
}

.sweep-caption.hidden {
  display: none;
}

.sweep-title {
  display: inline-block;
  padding: 4px 14px;
  margin-bottom: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--primary);
}

.sweep-values {
  display: grid;
  width: 100%;
}

.sweep-values span {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}
```

- [ ] **Step 5: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 6: Verify in the browser**

Dev server running, open http://localhost:5173, then:

```js
const { studio: s, state: st, toggleSweep } = window.__orb;
toggleSweep();
for (let i = 0; i < 3; i++) s.renderFrame();

const info = s.sweepInfo;
const key = info.key;
const cellValues = s.grid.cells.map(c => c.params[key]);

JSON.stringify({
  sweeping: key,
  values: info.values,
  cells: s.grid.cells.length,                       // expect 5
  cellValuesMatchLadder: JSON.stringify(cellValues) === JSON.stringify(info.values),
  ascending: cellValues.every((v, i) => i === 0 || v > cellValues[i - 1]),
  onlyOneParamDiffers: s.grid.cells.every(c =>
    Object.keys(c.params).every(k => k === key || c.params[k] === st.engines[st.engine][k])
  ),
  captionVisible: !document.querySelector('.sweep-caption').classList.contains('hidden'),
}, null, 2);
```

Expected: `cells: 5`, `cellValuesMatchLadder: true`, `ascending: true`, **`onlyOneParamDiffers: true`** (a sweep that changes anything else is not a sweep), `captionVisible: true`.

Then confirm exit restores the single view:

```js
window.__orb.toggleSweep();
JSON.stringify({
  gridOff: !window.__orb.studio.isGridMode,
  sweepCleared: window.__orb.studio.sweepInfo === null,
  scissorOff: window.__orb.studio.renderer.getScissorTest() === false,
  captionHidden: document.querySelector('.sweep-caption').classList.contains('hidden'),
});
```

Expected: all `true`.

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/style.css
git commit -m "Bind K to sweep the last-touched parameter across a strip"
```

---

## Definition of done

- `node tests/sweep.test.mjs` prints `ALL PASS`.
- `npx vite build` succeeds.
- `K` renders 5 cells in one row, ascending along the chosen parameter, with values captioned beneath.
- Only the swept parameter differs between cells.
- `K` again exits and restores the single orb, camera controls and scissor state.
- The 3×3 variation grid (`G`) still produces 9 distinct mutated cells with cell 0 as the parent.
- No console errors.
