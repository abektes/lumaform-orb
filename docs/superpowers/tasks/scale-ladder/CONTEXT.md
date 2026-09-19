# Shared context — read this before any task in this pack

You are working in **Lumaform Orb**, at the repo root that contains `packages/orb` and `packages/studio`. Assume you have no prior knowledge of this codebase. This file is the minimum you need; your task file adds the rest.

## What the project is

A WebGL exploration tool for designing animated orbs — the ambient visual an AI assistant uses to show what it is doing. Twenty-two engines, one parameter schema, one render loop. It is **not** a component library. `docs/VISION.md` explains why several decisions that look arbitrary are not; read §2 (the legibility question) and §3 (exploration before specification) if your task touches product direction.

Two npm workspaces:
- `packages/orb` (`@lumaform/orb`) — the runtime: engines, catalog, modulation, framing, config I/O, the frame loop.
- `packages/studio` — the instrument built on it: UI, grid, capture, presets.

```bash
npm run dev      # http://localhost:5173
npm run build    # must pass
npm test         # every packages/*/tests/*.test.mjs
node packages/studio/tests/<name>.test.mjs   # one suite
```

## What the scale ladder is

The feature these tasks extend. Pressing `L` renders the **current config at five true pixel sizes side by side** — 256, 128, 64, 32, 20 CSS px — as square scissored viewports in one WebGL context. It answers a question `framing.js` cannot: `framing.js` normalises every engine to the same fraction of the viewport, which is *camera distance*, not legibility. The ladder shows the size at which a design stops reading.

Shipped and working:

| File | What it holds |
| --- | --- |
| `packages/studio/src/core/scale-ladder.js` | Pure maths, zero imports: `DEFAULT_SCALE_SIZES` `[256,128,64,32,20]`, `scaleRects(sizes, width, height)`, `frameMetrics(pixels, opts?)`, `formatMetric(value)` |
| `packages/studio/tests/scale-ladder.test.mjs` | Its plain-Node test suite |
| `packages/studio/src/core/variation-grid.js` | `createVariationGrid` — renders N cells as scissored viewports. Options include `rectFactory(index, width, height) => {x,y,w,h}`; returns `requestMeasure(callback)` |
| `packages/studio/src/core/studio-grid.js` | `enterScaleMode(state, { sizes })`, sets `studio.scaleInfo = { label, values, sizes }` |
| `packages/studio/src/ui/grid-session.js` | `toggleScale()`, the `L` binding, the caption and its 500ms measurement poll |
| `packages/studio/src/core/shortcuts.js` | The `KeyL` registry entry |

### Facts about the ladder that tasks rely on

- **Every rung is the same config at the same animation instant.** `enterScaleMode` passes a `cellFactory` returning identical params for all five cells; `populate()` builds them together so each starts at `time = 0`; `render()` advances every cell by the same `delta`. Two rungs are therefore directly comparable — any difference between them is caused by pixel size alone. This is what makes cross-rung comparison meaningful.
- **Rungs clamp.** `scaleRects` clamps each rung to its slot and to the window height, so on a 1024px-wide window the 256px rung actually renders at ~204px. The caption shows this as `204px ↓256`. Never assume the requested size is the rendered size — derive the rendered size from `scaleRects`, or from the buffer itself (`Math.sqrt(buffer.length / 4)` device pixels).
- **Buffers are device pixels, rects are CSS pixels.** `renderer.getPixelRatio()` is the multiplier. A 20 CSS px rung at DPR 1.2 yields a 24×24 buffer, length 2304.
- **Cells render without bloom.** Bloom is a full-screen pass that bleeds across scissored cells, so cells use a RenderPass+OutputPass composer only. The ladder therefore measures geometric legibility, not the final composited look. This is deliberate — do not "fix" it.
- **`requestMeasure(callback)`** fires on the next `render()` with one RGBA `Uint8Array` per cell in cell order. It settles with an empty array if the grid is disposed first, so a Promise wrapping it cannot hang. A skipped degenerate cell contributes an empty buffer so the array stays aligned with cell order.

## Invariants — breaking these fails in hard-to-trace ways

- **The store owns state.** Read `store.state`; write through store methods (`patchEngine`, `patchGlobal`, `setEngine`). Never replace `state`, `state.global`, or a `state.engines[<id>]` bag.
- **Only touch the active engine's parameter bag** (`state.engines[state.engine]`).
- **Never modulate a rate parameter or a `geometry`-section parameter.** Use `listModulationTargets()`, which already excludes both.
- **Nothing in `packages/orb` may import from `packages/studio`.** The dependency runs one way. If a runtime module seems to need something from the studio, the seam is drawn wrong — add a hook.
- **The runtime never calls a studio method directly.** `OrbRuntime` declares five hooks with inert defaults; `OrbStudio` overrides them.
- **Engines self-dispose.** A factory returns `{ update, setParams, dispose, onPulse?, onResize? }` and must dispose every geometry and material it created.
- **Controls must declare their own `background` and `color`**, disabled states included. The UI is dark and browser defaults are light.
- **Do not add CSS classes casually.** `css-hygiene.test.mjs` fails both on a class with no rule and on a rule nothing emits. `layering.test.mjs` rejects raw `z-index` literals — take values from the `--z-*` scale.
- **Every `e.code` binding needs an entry in `packages/studio/src/core/shortcuts.js`.** `shortcuts.test.mjs` scans both directions.
- **User-typed text must be escaped before it reaches `innerHTML`** — use `escapeHtml` from `packages/studio/src/ui/studio-format.js`.

## Conventions

2-space indent, single quotes, semicolons. **Comments explain *why*, not what** — this codebase is full of non-obvious constraints, and a comment restating the code is worse than none. No new npm dependencies; runtime deps are `three` and `shiki` only. Vanilla JS ES modules, no framework, no test framework.

Tests are **plain Node scripts** in `packages/*/tests/*.test.mjs`. Copy the shape of `packages/studio/tests/param-format.test.mjs`: a local `ok(name, condition, extra)` that prints `PASS`/`FAIL`, a failure counter, and `process.exit(failures ? 1 : 0)`. Pure logic is deliberately extracted into DOM-free modules so it can be tested this way — keep doing that.

## Verification rules — these have produced confident wrong answers here before

- **Claims need evidence.** Run the command, show the output. Several bugs in this repo survived because something looked right.
- **The hidden browser pane trap.** If the Browser pane is not displayed, `requestAnimationFrame` never fires and the render loop is frozen — the app looks broken but isn't. `studio.fpsTracker.fps` still reports its default `60`, so it is **not** a liveness signal. Step frames manually with `studio.renderFrame()`.
- **`setTimeout` is clamped to ~1000 ms in a hidden pane**, so sleeping between frames advances a full second of `clock.getDelta()` per frame and anything integrating real milliseconds races through whole cycles reporting plausible nonsense. Inject the delta instead: `studio.clock.getDelta = () => 0.025`, step, restore.
- **CSS transitions are frozen too** — `getComputedStyle()` returns the starting value forever. Set `element.style.transition = 'none'` before measuring, and assert on the element that carries the rule.
- **Check your fixture before reporting a bug.** Writing a param straight to state can put it outside its schema range, and import will legitimately clamp it — that reads as a round-trip bug and isn't one.
- `window.__orb = { studio, state, ui, ab }` is exposed for console-driven checks, and `window.__orb.toggleScale()` enters the ladder through the real UI path.

## Reporting

End your task by reporting: what you changed and where, the exact commands you ran with their output, what you verified and what you could not, and any concern you had to set aside. If you could not verify something, say so plainly — do not describe an untested change as working.

Commit messages explain **why**, not just what. End each with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
