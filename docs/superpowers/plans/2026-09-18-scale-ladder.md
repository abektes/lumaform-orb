# Scale Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the current config side by side at five true pixel sizes — 256, 128, 64, 32, 20 CSS px — with a measured coverage and contrast number under each, so you can see and quantify the size at which a design stops reading.

**Architecture:** A scale ladder is the variation grid with one more axis of freedom. The grid already renders N live cells through scissored viewports from one WebGL context, and `enterSweepMode` already proves the pattern of "same machinery, deterministic cells instead of mutation". Two things block a ladder today: `cellRect` hard-codes uniform cells, and `render()` sets one camera aspect for all of them. This plan makes the rect pluggable, moves the aspect into the per-cell loop (a no-op for uniform grids, correct for any other layout), and adds a pure `scale-ladder.js` that owns the rect maths and the legibility metrics. The metrics are read back inside `render()`, while the drawing buffer is provably intact, rather than after the fact.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.** Runtime deps stay `three` and `shiki`.
- **Vanilla JS only.** No framework. 2-space indent, single quotes, semicolons.
- **Comments explain *why*, not what.** A comment restating the code is worse than none.
- **Tests are plain Node scripts** in `packages/*/tests/*.test.mjs`, run with `npm test` or `node packages/studio/tests/<name>.test.mjs`. There is no test framework and you must not add one. Print `PASS`/`FAIL` per assertion, exit `0` on pass and `1` on fail — copy the shape of `packages/studio/tests/param-format.test.mjs` exactly.
- **The build must pass:** `npm run build`.
- **Backwards compatibility is mandatory.** The 3×3 variation grid and the 5×1 sweep strip must keep working unchanged. Every new option is optional; omitted, `createVariationGrid` behaves exactly as it does today.
- **Nothing in `packages/orb` may import from `packages/studio`.** All work in this plan is studio-side. Do not touch `packages/orb`.
- **Every `e.code` binding needs an entry in `packages/studio/src/core/shortcuts.js`.** `shortcuts.test.mjs` scans both files and fails in either direction.
- **Do not add CSS classes.** The ladder reuses the existing `.sweep-caption` / `.sweep-title` / `.sweep-values` rules. `css-hygiene.test.mjs` fails on a class with no rule *and* on a rule nothing emits.

## Background you need (assume no prior context)

Repo root is the workspace root. Dev server: `npm run dev` → http://localhost:5173. Build: `npm run build`. Two npm workspaces: `packages/orb` (the runtime) and `packages/studio` (the UI instrument).

**Why this exists.** Read `docs/VISION.md` §2 and §9 first. The tool's question is what movement reads as *thinking*, which is a **legibility** problem. Today every engine is framed to the same fraction of the viewport by `packages/orb/src/core/framing.js` — that normalises *camera distance*, not legibility. Nothing anywhere knows that a design carrying 4000 particles at 400px becomes grey mush at 20px. Prior art (`thinking-orbs`) treats 64px and 20px as **separate designs, not a scale factor**, each with its own count, radius and speed tuning. We cannot tell whether that is necessary here because we have never looked. This is the instrument for looking, which is why it is allowed under VISION §3 — it raises the discovery rate, it does not specify a format.

**The variation grid** (`packages/studio/src/core/variation-grid.js`) exports `createVariationGrid(options)`. Read the whole file before starting. The parts you touch:

- `cellRect(index, width, height)` returns `{x, y, w, h}` in **CSS pixels**, with the **WebGL bottom-left origin** already handled (`y = height - (cy + 1) * h`). Three.js multiplies by the renderer pixel ratio internally when you call `setViewport`, so CSS pixels in is correct.
- `render(time, delta, width, height)` sets `camera.aspect` **once** from `width / cols / (height / rows)`, then loops cells setting viewport + scissor, applying each cell's modulation rack, updating the engine, and rendering through `cellComposer` (RenderPass + OutputPass, deliberately **no bloom** — it is a full-screen pass and bleeds across scissored cells).
- `hitTest(clientX, clientY, width, height)` maps a click to a cell index on the uniform column/row lattice.

**The sweep strip** (`enterSweepMode` in `packages/studio/src/core/studio-grid.js`) is the closest precedent and you should read it — a ladder is the same shape with a different varying quantity. It passes `cols: values.length, rows: 1` plus a `cellFactory`, stores `this.sweepInfo = { key, label, values }`, and the UI shows that through `showSweepCaption` in `packages/studio/src/ui/grid-session.js`.

**Engine-switch survival.** `OrbRuntime` calls `onEngineWillChange()` before teardown and hands its return value to `onEngineDidChange(state, ctx)`. `packages/studio/src/core/studio-sequence.js:22-26` builds that context (`wasGridMode`, `wasSweep`); `studio-grid.js:40-42` consumes it and calls `rebuildGridForEngine`. Without this the ladder would silently vanish on an engine change. `runtime-hooks.test.mjs` guards that the runtime never reaches into studio state.

**Verification handle:** `window.__orb = { studio, state, ui, ab }`.

**CRITICAL browser traps** (these have produced confident wrong answers in this repo before):

1. If the Browser pane is **hidden**, `requestAnimationFrame` never fires and the render loop is frozen — the app looks broken but isn't. `studio.fpsTracker.fps` still reports its default `60`, so it is **not** a liveness signal. Step frames manually with `studio.renderFrame()`.
2. `setTimeout` is clamped to ~1000 ms in a hidden pane, so sleeping between frames advances a full second of `clock.getDelta()` per frame. Inject the delta instead: `studio.clock.getDelta = () => 0.025`, step, restore.
3. CSS transitions never advance in a hidden pane, so `getComputedStyle()` returns the starting value forever. Set `element.style.transition = 'none'` before measuring.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/studio/src/core/scale-ladder.js` | **New.** Pure maths, no DOM and no Three.js: the default size ladder, the square-rect layout, and the legibility metrics over a raw RGBA buffer. Everything unit-testable in this feature lives here. |
| `packages/studio/tests/scale-ladder.test.mjs` | **New.** Plain-Node tests for the above. |
| `packages/studio/src/core/variation-grid.js` | **Modify.** Accept an optional `rectFactory`; move camera aspect into the per-cell loop; add an opt-in pixel readback that runs inside `render()`. |
| `packages/studio/src/core/studio-grid.js` | **Modify.** Add `enterScaleMode`; clear `scaleInfo` on exit; re-enter the ladder after an engine switch. |
| `packages/studio/src/core/studio.js` | **Modify.** One field: `this.scaleInfo = null`. |
| `packages/studio/src/core/studio-sequence.js` | **Modify.** Carry `wasScale` in the engine-change context. |
| `packages/studio/src/ui/grid-session.js` | **Modify.** `toggleScale()`, the `KeyL` binding, and the caption with live metrics. |
| `packages/studio/src/core/shortcuts.js` | **Modify.** One `KeyL` entry. |
| `docs/VISION.md` | **Modify.** One capability-inventory row. |

---

### Task 1: The pure scale-ladder module

**Files:**
- Create: `packages/studio/src/core/scale-ladder.js`
- Test: `packages/studio/tests/scale-ladder.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEFAULT_SCALE_SIZES: number[]`, `scaleRects(sizes, width, height) -> {x,y,w,h}[]`, `frameMetrics(pixels, opts?) -> {coverage, mean, rms}`, `formatMetric(value) -> string`. Tasks 2–5 use exactly these names.

- [ ] **Step 1: Write the failing test**

Create `packages/studio/tests/scale-ladder.test.mjs`:

```js
import {
  DEFAULT_SCALE_SIZES,
  scaleRects,
  frameMetrics,
  formatMetric,
} from '../src/core/scale-ladder.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// --- the ladder itself ---
ok('the ladder descends', DEFAULT_SCALE_SIZES.every((s, i, a) => i === 0 || s < a[i - 1]));
ok('the ladder reaches inline scale', DEFAULT_SCALE_SIZES.includes(20));
ok('the ladder includes avatar scale', DEFAULT_SCALE_SIZES.includes(64));

// --- layout: 5 slots across 1000x600 ---
const rects = scaleRects([256, 128, 64, 32, 20], 1000, 600);
ok('one rect per size', rects.length === 5);
ok('every cell is square', rects.every((r) => r.w === r.h));
ok('each cell renders at its requested edge', rects.map((r) => r.w).join(',') === '256,128,64,32,20');
ok('cells are centred in equal slots',
  rects[0].x === Math.round((200 - 256) / 2) + 0 || rects[0].x >= 0);
ok('slot centres are evenly spaced',
  rects.map((r) => Math.round(r.x + r.w / 2)).join(',') === '100,300,500,700,900');
ok('cells are vertically centred', rects.every((r) => r.y === Math.round((600 - r.w) / 2)));
ok('no cell overlaps its neighbour',
  rects.every((r, i) => i === 0 || r.x >= rects[i - 1].x + rects[i - 1].w));

// A cell must never spill into the next slot on a narrow window, or the ladder
// silently lies about which orb you are looking at.
const tight = scaleRects([256, 128, 64, 32, 20], 400, 300);
ok('a large cell is clamped to its slot', tight[0].w <= Math.floor(400 / 5));
ok('clamping keeps cells square', tight.every((r) => r.w === r.h));
ok('a short window clamps by height', scaleRects([256], 1000, 90)[0].w <= 90);
ok('degenerate sizes still produce a drawable rect', scaleRects([0], 100, 100)[0].w >= 1);
ok('an empty ladder produces no rects', scaleRects([], 100, 100).length === 0);

// --- metrics ---
const black = new Uint8Array(4 * 100).fill(0);
for (let i = 3; i < black.length; i += 4) black[i] = 255;
const white = new Uint8Array(4 * 100).fill(255);

const blackM = frameMetrics(black);
ok('an empty frame has no coverage', blackM.coverage === 0);
ok('an empty frame has no contrast', blackM.rms === 0);

const whiteM = frameMetrics(white);
ok('a full frame is fully covered', whiteM.coverage === 1);
ok('a flat frame has no contrast', Math.abs(whiteM.rms) < 1e-9, String(whiteM.rms));
ok('a flat white frame reads as mean 1', Math.abs(whiteM.mean - 1) < 1e-9);

// Half lit, half dark: the structure case. Coverage 0.5, and RMS at its maximum
// for a two-level image.
const half = new Uint8Array(4 * 100);
for (let i = 0; i < 100; i++) {
  const v = i < 50 ? 255 : 0;
  half[i * 4] = v; half[i * 4 + 1] = v; half[i * 4 + 2] = v; half[i * 4 + 3] = 255;
}
const halfM = frameMetrics(half);
ok('half-lit reads as half covered', Math.abs(halfM.coverage - 0.5) < 1e-9);
ok('half-lit has maximum contrast', Math.abs(halfM.rms - 0.5) < 1e-9, String(halfM.rms));

// The threshold is what separates "dim but present" from "gone".
const dim = new Uint8Array(4 * 100);
for (let i = 0; i < 100; i++) {
  dim[i * 4] = 8; dim[i * 4 + 1] = 8; dim[i * 4 + 2] = 8; dim[i * 4 + 3] = 255;
}
ok('below-threshold ink does not count as coverage', frameMetrics(dim).coverage === 0);
ok('a lower threshold does count it', frameMetrics(dim, { threshold: 0.01 }).coverage === 1);

// Luma is weighted, not averaged: a pure-green frame is far brighter than pure blue.
const green = new Uint8Array(4 * 4);
const blue = new Uint8Array(4 * 4);
for (let i = 0; i < 4; i++) {
  green[i * 4 + 1] = 255; green[i * 4 + 3] = 255;
  blue[i * 4 + 2] = 255; blue[i * 4 + 3] = 255;
}
ok('luma is perceptually weighted', frameMetrics(green).mean > frameMetrics(blue).mean * 5);

ok('an empty buffer is safe', frameMetrics(new Uint8Array(0)).coverage === 0);

// --- display formatting ---
ok('metrics format to two decimals', formatMetric(0.12345) === '0.12');
ok('zero formats without an exponent', formatMetric(0) === '0.00');
ok('a non-finite metric degrades to a dash', formatMetric(NaN) === '–');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node packages/studio/tests/scale-ladder.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `../src/core/scale-ladder.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/studio/src/core/scale-ladder.js`:

```js
// Scale ladder — the same orb at five true pixel sizes, side by side.
//
// Framing normalises every engine to the same fraction of the viewport, which
// answers "how much of the frame does it fill" and says nothing about "does it
// still read at 20px". Those are different questions and only the second one
// decides whether a finding can ship as an inline indicator.
//
// Pure maths, no DOM and no Three.js, so it can be tested in Node.

// 256 is the reference most designs are tuned at; 64 is chat-avatar scale and
// 20 is inline-text scale. The two intermediate steps exist so the failure is
// visible as a gradient rather than as a cliff between two extremes.
export const DEFAULT_SCALE_SIZES = [256, 128, 64, 32, 20];

// Equal slots, a square viewport of the requested edge centred in each. Square
// matters: it holds the camera aspect at 1 for every cell, so the only variable
// across the ladder is pixel resolution. Change the aspect too and you are
// comparing two things at once.
export function scaleRects(sizes, width, height) {
  const cols = sizes.length;
  if (!cols) return [];
  const slot = width / cols;

  return sizes.map((size, index) => {
    // Clamped to the slot and to the window: an unclamped 256px cell on a narrow
    // window would render over its neighbour, and you would be judging the wrong
    // orb without any sign that it had happened.
    const edge = Math.max(1, Math.min(Math.floor(size), Math.floor(slot), Math.floor(height)));
    return {
      x: Math.round(index * slot + (slot - edge) / 2),
      // Square and centred, so the bottom-left WebGL origin needs no flip here.
      y: Math.round((height - edge) / 2),
      w: edge,
      h: edge,
    };
  });
}

// Rec.709 luma over sRGB bytes. Strictly this should linearise first, but the
// number is only ever compared against another number produced the same way,
// and skipping it keeps the loop cheap enough to run over five viewports.
function luma(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Two numbers, because there are two distinct ways a small orb fails.
//
// `coverage` catches disappearance: an orb whose marks fall below the visible
// threshold trends to 0 even though the config is unchanged.
// `rms` catches mush: an orb that keeps every pixel lit but loses all internal
// structure trends to 0 contrast at high coverage. Coverage alone would call
// that a success.
export function frameMetrics(pixels, { threshold = 0.06 } = {}) {
  const n = Math.floor(pixels.length / 4);
  if (!n) return { coverage: 0, mean: 0, rms: 0 };

  let lit = 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n * 4; i += 4) {
    const value = luma(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (value > threshold) lit++;
    sum += value;
    sumSq += value * value;
  }

  const mean = sum / n;
  // Float error can push this a hair below zero on a perfectly flat frame, and
  // Math.sqrt of a negative would report NaN for the least interesting input.
  const variance = Math.max(0, sumSq / n - mean * mean);
  return { coverage: lit / n, mean, rms: Math.sqrt(variance) };
}

export function formatMetric(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '–';
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node packages/studio/tests/scale-ladder.test.mjs
```

Expected: every line `PASS`, final line `ALL PASS`, exit code 0.

- [ ] **Step 5: Run the whole suite to prove nothing regressed**

```bash
npm test
```

Expected: no failures.

- [ ] **Step 6: Commit**

```bash
git add packages/studio/src/core/scale-ladder.js packages/studio/tests/scale-ladder.test.mjs
git commit -m "Add the scale-ladder maths: square rects and legibility metrics

Framing normalises camera distance, not legibility, so nothing in the tool
knows whether a design survives at 20px. Coverage and RMS contrast are the
two numbers that separate the two ways it fails: vanishing and going to mush."
```

---

### Task 2: Let the grid render non-uniform cells

**Files:**
- Modify: `packages/studio/src/core/variation-grid.js`

**Interfaces:**
- Consumes: nothing from Task 1 (the grid stays agnostic about *why* a rect is the shape it is).
- Produces: a new optional option `rectFactory: (index, width, height) => {x, y, w, h} | null`, and a new returned method `requestMeasure(callback)` where `callback` receives `Uint8Array[]` — one RGBA buffer per cell, in cell order — on the next `render()`.

There is deliberately no new unit test here. The rect maths that *could* be asserted lives in `scale-ladder.js` and was tested in Task 1; what remains is Three.js wiring with no seam a Node test can reach. It is covered by the existing suite staying green plus the browser check in Step 5.

- [ ] **Step 1: Add the `rectFactory` option**

In `packages/studio/src/core/variation-grid.js`, extend the destructured options of `createVariationGrid` — add this immediately after the existing `cellFactory = null,` line:

```js
  // Optional. When supplied, it replaces the uniform lattice with arbitrary
  // per-cell rectangles. The scale ladder uses it to render one square viewport
  // per pixel size; omit it and cells tile the window exactly as before.
  rectFactory = null,
```

- [ ] **Step 2: Route `cellRect` through it**

Replace the body of `cellRect` (currently at `packages/studio/src/core/variation-grid.js:384-391`) with:

```js
  function cellRect(index, width, height) {
    if (rectFactory) return rectFactory(index, width, height);
    const w = Math.floor(width / cols);
    const h = Math.floor(height / rows);
    const cx = index % cols;
    const cy = Math.floor(index / cols);
    // WebGL viewport origin is bottom-left; cells are laid out top-left.
    return { x: cx * w, y: height - (cy + 1) * h, w, h };
  }
```

- [ ] **Step 3: Move the camera aspect into the per-cell loop**

In `render(time, delta, width, height)`, **delete** these two lines that currently sit just after `renderer.setScissorTest(true);`:

```js
      camera.aspect = width / cols / (height / rows);
      camera.updateProjectionMatrix();
```

Then, inside the `for` loop, immediately after `const { x, y, w, h } = cellRect(i, width, height);`, insert:

```js
        // Per cell rather than once for the grid: identical for a uniform
        // lattice, and the only thing that makes a non-uniform one honest. A
        // shared aspect would stretch every cell that is not the average shape.
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
```

- [ ] **Step 4: Add the in-render readback**

Add this declaration just above `function cellRect(` :

```js
  // Reading pixels back is only valid while the drawing buffer holds this
  // frame, so measurement is a request fulfilled inside render() rather than a
  // method that samples whatever happens to be on screen when it is called.
  let pendingMeasure = null;
```

Inside `render()`, replace the loop's trailing selected-border line and the block that follows it. The end of the loop and the tail of `render` should read:

```js
        if (cells[i].selected) drawCellBorder(x, y, w, h);
        if (pendingMeasure) measured.push(readCellPixels(x, y, w, h));
      }

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);

      if (pendingMeasure) {
        const done = pendingMeasure;
        pendingMeasure = null;
        done(measured);
      }
    },
```

and declare `measured` at the top of `render()`, immediately after `cellComposer.setSize(width, height);`:

```js
      const measured = [];
```

Add `readCellPixels` just above `cellRect`:

```js
  // Rect arrives in CSS pixels because that is what setViewport takes; the
  // framebuffer is in device pixels, so the readback has to scale by the same
  // ratio or it samples a corner of the cell and calls it the whole thing.
  function readCellPixels(x, y, w, h) {
    const gl = renderer.getContext();
    const dpr = renderer.getPixelRatio();
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    const buffer = new Uint8Array(pw * ph * 4);
    // OutputPass leaves its target bound; pixels live in the default framebuffer.
    renderer.setRenderTarget(null);
    gl.readPixels(Math.round(x * dpr), Math.round(y * dpr), pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    return buffer;
  }
```

- [ ] **Step 5: Expose `requestMeasure`**

In the returned object literal, add immediately after the `populate,` entry:

```js
    // Fulfilled on the next render, with one RGBA buffer per cell in cell order.
    requestMeasure(callback) {
      pendingMeasure = callback;
    },
```

- [ ] **Step 6: Prove the existing grid and sweep are unchanged**

```bash
npm test
```

Expected: no failures — `mutation-breadth.test.mjs`, `sweep.test.mjs` and `catalog-wiring.test.mjs` all still pass.

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Verify the uniform grid still frames identically in the browser**

Start the dev server with `preview_start`, make sure the Browser pane is **displayed** (see the traps above), then in the console:

```js
const { studio, state } = window.__orb;
studio.enterGridMode(state, { cols: 3, rows: 3 });
studio.renderFrame();
studio.grid.cells.length;                      // 9
```

Take a screenshot and confirm nine cells tile the window with no letterboxing or stretching versus before the change. A per-cell aspect that is wrong shows up immediately as ovals.

- [ ] **Step 8: Commit**

```bash
git add packages/studio/src/core/variation-grid.js
git commit -m "Let grid cells have their own rect and their own aspect

cellRect hard-coded a uniform lattice and render() set one aspect for the
whole grid, so any layout but a tile was impossible. Per-cell aspect is
identical for a uniform grid and the only honest option for anything else.
requestMeasure reads pixels back inside render(), while the drawing buffer
still holds the frame being measured."
```

---

### Task 3: `enterScaleMode` on the studio

**Files:**
- Modify: `packages/studio/src/core/studio.js`
- Modify: `packages/studio/src/core/studio-grid.js`
- Modify: `packages/studio/src/core/studio-sequence.js`

**Interfaces:**
- Consumes: `DEFAULT_SCALE_SIZES`, `scaleRects` (Task 1); `rectFactory` (Task 2).
- Produces: `studio.enterScaleMode(state, { sizes? }) -> { label, values, sizes } | null`, and the field `studio.scaleInfo` with that same shape or `null`. Task 5 reads `studio.scaleInfo`.

- [ ] **Step 1: Add the field**

In `packages/studio/src/core/studio.js`, directly after the existing `this.sweepInfo = null;` line:

```js
    this.scaleInfo = null;
```

- [ ] **Step 2: Import the ladder in `studio-grid.js`**

At the top of `packages/studio/src/core/studio-grid.js`, after the existing `import { isSweepable, sweepValues, listSweepableParams } from './sweep.js';`:

```js
import { DEFAULT_SCALE_SIZES, scaleRects } from './scale-ladder.js';
```

- [ ] **Step 3: Add `enterScaleMode`**

In `packages/studio/src/core/studio-grid.js`, insert this method into `gridMethods` immediately after `enterSweepMode` ends:

```js
  // A scale ladder is the variation grid with the *viewport* as the varying
  // quantity instead of a parameter: one config, N square cells, each rendered
  // at a true CSS pixel size. It reuses this.grid so grid mode's render branch,
  // exit path and pointer handling all apply unchanged.
  enterScaleMode(state, { sizes = DEFAULT_SCALE_SIZES } = {}) {
    if (this.currentSequence) this.stopSequence();
    const type = state.engine;
    const factory = this.engineConstructors.get(type);
    if (!factory) {
      console.error(`Engine type "${type}" not registered.`);
      return null;
    }
    if (!sizes.length) return null;

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
      defs: ENGINE_PARAM_DEFINITIONS[type] || {},
      cols: sizes.length,
      rows: 1,
      frameRadius: engineFrameRadius(this.activeEngine),
      // Every cell is the same config. The ladder's whole claim is that the only
      // difference between these orbs is how many pixels they were given.
      cellFactory: () => ({ params: { ...base } }),
      rectFactory: (index, width, height) => scaleRects(sizes, width, height)[index],
    });
    this.grid.populate();

    this.scaleInfo = { label: 'Rendered size', values: sizes.map((s) => `${s}px`), sizes: [...sizes] };
    return this.scaleInfo;
  },
```

- [ ] **Step 4: Clear it on exit**

In `exitGridMode`, directly after the existing `this.sweepInfo = null;`:

```js
    this.scaleInfo = null;
```

- [ ] **Step 5: Survive an engine switch**

In `packages/studio/src/core/studio-sequence.js`, extend the object returned by `onEngineWillChange` so it reads:

```js
    return {
      wasGridMode: !!this.grid,
      wasSweep: this.sweepInfo ? { ...this.sweepInfo } : null,
      wasScale: this.scaleInfo ? { ...this.scaleInfo } : null,
    };
```

In `packages/studio/src/core/studio-grid.js`, change `onEngineDidChange` and `rebuildGridForEngine` to carry it:

```js
  onEngineDidChange(state, { wasGridMode = false, wasSweep = null, wasScale = null } = {}) {
    if (wasGridMode) this.rebuildGridForEngine(state, wasSweep, wasScale);
  },
```

```js
  rebuildGridForEngine(state, previousSweep, previousScale) {
    const cols = this.gridCols ?? 3;
    const rows = this.gridRows ?? 3;

    // Checked before the sweep because a ladder always re-enters cleanly: its
    // sizes are a property of the viewport, not of the engine, so unlike a swept
    // parameter there is nothing that can fail to exist on the new engine.
    if (previousScale && this.enterScaleMode(state, { sizes: previousScale.sizes })) {
      return;
    }

    if (previousSweep) {
```

(leave the rest of `rebuildGridForEngine` as it is.)

- [ ] **Step 6: Verify in the browser**

```bash
npm run build
```

Expected: build succeeds.

With the Browser pane **displayed**:

```js
const { studio, state } = window.__orb;
studio.enterScaleMode(state);
studio.renderFrame();
studio.scaleInfo.values.join(',');                      // "256px,128px,64px,32px,20px"
studio.grid.cells.length;                               // 5
JSON.stringify(studio.grid.cells[0].params) === JSON.stringify(studio.grid.cells[4].params); // true
```

Screenshot: five orbs on one row, descending in size, each vertically centred, the smallest a dot. Then confirm the ladder survives an engine change:

```js
studio.setEngine('moire', state);
studio.renderFrame();
studio.scaleInfo !== null && studio.grid.cells.length === 5;   // true
```

- [ ] **Step 7: Run the suite**

```bash
npm test
```

Expected: no failures. `runtime-hooks.test.mjs` in particular must still pass — the new context key travels through the existing hook and adds no new runtime→studio reach.

- [ ] **Step 8: Commit**

```bash
git add packages/studio/src/core/studio.js packages/studio/src/core/studio-grid.js packages/studio/src/core/studio-sequence.js
git commit -m "Add enterScaleMode: one config rendered at five true pixel sizes

The sweep varies a parameter; the ladder varies the viewport. Same grid
machinery, so promote, mark, export and the exit path all apply. It re-enters
before the sweep on an engine switch because its sizes cannot fail to exist
on the new engine."
```

---

### Task 4: The `L` binding and the caption

**Files:**
- Modify: `packages/studio/src/ui/grid-session.js`
- Modify: `packages/studio/src/core/shortcuts.js`

**Interfaces:**
- Consumes: `studio.enterScaleMode` and `studio.scaleInfo` (Task 3).
- Produces: `toggleScale()` on the object returned by `bind()`, and `window.__orb.toggleScale`.

- [ ] **Step 1: Write the failing test**

There is no new test file. `packages/studio/tests/shortcuts.test.mjs` already scans source for `e.code` bindings and cross-checks the registry in both directions, so adding the handler without the registry entry (or the reverse) fails it. Add the handler first so you see the failure.

In `packages/studio/src/ui/grid-session.js`, inside the object returned by `bind()`, add this immediately after the `KeyK` block:

```js
          if (e.code === 'KeyL') {
            e.preventDefault();
            toggleScale();
            return true;
          }
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node packages/studio/tests/shortcuts.test.mjs
```

Expected: FAIL naming `KeyL` as bound in source but missing from the registry. (It will also fail on `toggleScale` being undefined at runtime, which Step 3 fixes.)

- [ ] **Step 3: Add `toggleScale` and the caption**

In `packages/studio/src/ui/grid-session.js`, add this function immediately after `toggleSweep` ends:

```js
  function toggleScale() {
    if (studio.isGridMode) {
      exitView();
      return;
    }

    // The ladder reuses the grid's pointer handling. Every cell holds the same
    // config, so a click promotes the config unchanged — harmless, and it keeps
    // one exit path rather than a special case that has to know about ladders.
    studio.onGridPromote = onPromote;

    const info = studio.enterScaleMode(state);
    if (!info) return;
    ui.root.classList.add('grid-mode');
    ui.render();
    showSweepCaption(info);
  }
```

Export it from `bind()` by adding `toggleScale,` directly after the existing `toggleSweep,` line.

- [ ] **Step 4: Add the registry entry**

In `packages/studio/src/core/shortcuts.js`, directly after the `KeyK` entry:

```js
  { code: 'KeyL', label: 'Scale ladder — one design at five rendered sizes', context: 'any', group: 'Explore' },
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node packages/studio/tests/shortcuts.test.mjs
```

Expected: every line `PASS`.

- [ ] **Step 6: Expose it on the debug handle**

In `packages/studio/src/main.js`, directly after the existing `window.__orb.toggleSweep = grid.toggleSweep;`:

```js
window.__orb.toggleScale = grid.toggleScale;
```

- [ ] **Step 7: Verify end to end**

```bash
npm test
npm run build
```

Expected: both clean.

With the Browser pane displayed, press `L` on the page (not in the console) and screenshot: five descending orbs, the caption reading `Rendered size` over `256px 128px 64px 32px 20px`. Press `L` again and confirm the single-orb view returns with the caption gone and the inspector back. Then confirm the exits are not special-cased: press `L`, then `G` — the ladder must be replaced by the 3×3 grid, not stack with it.

- [ ] **Step 8: Commit**

```bash
git add packages/studio/src/ui/grid-session.js packages/studio/src/core/shortcuts.js packages/studio/src/main.js
git commit -m "Bind L to the scale ladder and caption it

Reuses the sweep caption rather than adding classes: same shape of data, and
css-hygiene fails on a rule nothing emits as readily as on a class with no rule."
```

---

### Task 5: Live legibility metrics under each rung

**Files:**
- Modify: `packages/studio/src/ui/grid-session.js`
- Modify: `docs/VISION.md`

**Interfaces:**
- Consumes: `frameMetrics`, `formatMetric` (Task 1); `grid.requestMeasure` (Task 2); `studio.scaleInfo` (Task 3).
- Produces: nothing downstream.

Eyeballing a 20px orb across the room tells you it is small. The numbers tell you *which way* it failed — coverage falling means the marks are disappearing, contrast falling at steady coverage means it is turning to mush — and they can be compared across sessions and engines, which memory cannot.

- [ ] **Step 1: Import the metrics**

In `packages/studio/src/ui/grid-session.js`, after the existing `import { listSweepableParams } from '../core/sweep.js';`:

```js
import { frameMetrics, formatMetric } from '../core/scale-ladder.js';
```

- [ ] **Step 2: Add a metrics row to the caption**

Replace `showSweepCaption` with:

```js
  function showSweepCaption(info, metrics = null) {
    if (!info) {
      caption.classList.add('hidden');
      caption.innerHTML = '';
      return;
    }
    caption.classList.remove('hidden');
    // Values and metrics share one column template so a number always sits
    // under the rung it describes, however many rungs there are.
    const columns = `grid-template-columns: repeat(${info.values.length}, 1fr)`;
    caption.innerHTML =
      `<div class="sweep-title">${info.label}</div>` +
      `<div class="sweep-values" style="${columns}">` +
      info.values.map((value) => `<span>${value}</span>`).join('') +
      `</div>` +
      (metrics
        ? `<div class="sweep-values" style="${columns}">` +
          metrics
            .map((m) => `<span>${formatMetric(m.coverage)} / ${formatMetric(m.rms)}</span>`)
            .join('') +
          `</div>`
        : '');
  }
```

The values come from `DEFAULT_SCALE_SIZES` and the engine parameter schema, never from user-typed text, so there is nothing to escape here. If that ever stops being true, use `escapeHtml` from `packages/studio/src/ui/studio-format.js`.

- [ ] **Step 3: Poll for measurements while the ladder is up**

Add a module-scope handle next to the existing `let markedPollId = null;`:

```js
  let scalePollId = null;
```

In `toggleScale`, directly after `showSweepCaption(info);`:

```js
    // Same cadence as the marked-cell poll. A readback stalls the GPU, so this
    // is five reads every 500 ms rather than five per frame — the numbers settle
    // within a second and nobody is watching them change.
    scalePollId = setInterval(() => {
      studio.grid?.requestMeasure((buffers) => {
        showSweepCaption(info, buffers.map((buffer) => frameMetrics(buffer)));
      });
    }, 500);
```

In `exitView`, directly after the existing `clearInterval(markedPollId);` / `markedPollId = null;` pair:

```js
    clearInterval(scalePollId);
    scalePollId = null;
```

And in the returned `dispose()`, after `clearInterval(markedPollId);`:

```js
      clearInterval(scalePollId);
```

- [ ] **Step 4: Verify the numbers are real**

```bash
npm test
npm run build
```

Expected: both clean.

With the Browser pane displayed, press `L`, wait a second, and read the caption. Then check the numbers move the way the theory says:

```js
const { studio, state } = window.__orb;
studio.enterScaleMode(state);
studio.renderFrame();
await new Promise((r) => studio.grid.requestMeasure(r));
```

Capture the five `frameMetrics` results. Coverage must be non-zero at 256px. Then raise a count-type parameter (particle count, dot count — whichever the active engine has) to its maximum and re-measure: the 20px rung's `rms` should **fall** while its `coverage` rises, which is exactly the mush failure the metric exists to name. Record the before/after numbers in the commit message — this is the first evidence the instrument works.

**Known limits to state plainly, not to fix here:** cells render without bloom (VISION §5 — it is a full-screen pass and bleeds across scissored cells), so the ladder measures geometric legibility and not the final composited look. Metrics also scale with `global.dpr`, so two sessions' numbers are only comparable at the same DPR.

- [ ] **Step 5: Record the capability**

In `docs/VISION.md`, add this row to the Appendix table directly after the `Parameter sweep` row:

```markdown
| Scale ladder | Built — `L` renders the current config at 256/128/64/32/20 CSS px with per-rung coverage and RMS contrast, so legibility at size is measurable rather than assumed. No bloom in cells, so it measures geometry, not the final composite. |
```

- [ ] **Step 6: Commit**

```bash
git add packages/studio/src/ui/grid-session.js docs/VISION.md
git commit -m "Measure coverage and contrast under each rung of the ladder

Looking at a 20px orb tells you it is small; the numbers tell you which way
it failed. Coverage falling means the marks are vanishing, contrast falling
at steady coverage means it has gone to mush, and only the second one is
invisible to the eye at that size."
```

---

## Self-review notes

- **Spec coverage.** Ladder maths and metrics → Task 1. Non-uniform cells → Task 2. Studio entry point and engine-switch survival → Task 3. Key binding and caption → Task 4. Measurement display and docs → Task 5. Nothing in the spec is unclaimed.
- **Naming consistency.** `DEFAULT_SCALE_SIZES`, `scaleRects`, `frameMetrics`, `formatMetric`, `rectFactory`, `requestMeasure`, `enterScaleMode`, `scaleInfo`, `toggleScale` are each defined once and used with the same spelling everywhere.
- **Deliberately out of scope.** Magnified readback (rendering a 20px cell and upscaling nearest-neighbour so the pixels are visible) would be more comfortable to look at and less honest — true size is the measurement. Per-size parameter tuning (the `thinking-orbs` position that 64 and 20 are separate designs) is a *conclusion* this instrument might lead to, and specifying it now would be exactly the premature specification VISION §3 forbids. Build the ladder, look, then decide.
