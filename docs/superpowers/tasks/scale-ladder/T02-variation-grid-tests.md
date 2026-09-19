# T02 — Put `variation-grid.js` under test

**Read [CONTEXT.md](CONTEXT.md) first.**

**Depends on:** nothing.
**Blocks:** nothing, but every future change to the grid is currently unguarded.
**Size:** medium. One new test suite, one small refactor to create a seam. No behaviour change.

---

## Goal

`packages/studio/src/core/variation-grid.js` is ~600 lines carrying the grid, the sweep strip and the scale ladder, and **no test touches it**. Four separate correctness fixes landed in it recently with `npm test` and `npm run build` as the only gate — neither of which executes a single line of `render()`. Give it a real suite.

## Why

The recent fixes added exactly the kind of logic that rots silently:

- `requestMeasure(callback)` settles a stale callback with an empty array when a second request arrives, and again on `dispose()`, so a Promise wrapping it cannot hang.
- Cells with `w <= 0 || h <= 0` are skipped, but still push an empty buffer so the measurement array stays aligned with cell order.
- `cellRect` delegates to an optional `rectFactory`, and the camera aspect is now computed per cell rather than once per grid.
- The whole drawing buffer is cleared before the loop, because ladder cells do not tile the window and the renderer is created with `preserveDrawingBuffer: true`.

None of these paths runs in the default 3×3 grid. They exist for the ladder, and they are exercised only by a human looking at the screen.

## The obstacle, and the seam that solves it

`createVariationGrid` takes a live `THREE.WebGLRenderer` and calls `gl.readPixels`. You cannot construct one in plain Node, and **you must not add a test framework, a headless-GL dependency, or any npm package** — CONTEXT.md is firm on this and so is `docs/VISION.md`.

The way this codebase has solved that problem repeatedly is to **extract the pure logic into a DOM-free sibling module and test that**. `curl-drift-field.js`, `murmuration-simulation.js`, `tesseract-projection.js`, `vocalis-layout.js`, `moire-sphere.js` and `scale-ladder.js` all exist for exactly this reason. Follow the pattern rather than inventing a new one.

### What to extract

Create `packages/studio/src/core/grid-measure.js` holding the *decision* logic currently inlined in `variation-grid.js`, with no Three.js and no WebGL:

```js
// Which cells render, and what the measurement array should look like.
// Pure: no renderer, no GL, no DOM.

// A rect is drawable when both extents are positive. A zero height makes the
// camera aspect Infinity or NaN; a negative extent makes gl.viewport and
// gl.scissor raise INVALID_VALUE and silently keep the previous rect, so the
// cell would paint over its neighbour.
export function isDrawableRect(rect)

// Device-pixel readback region for a CSS-pixel rect. Extents are derived from
// the rounded edges rather than rounding the size independently, because
// independent rounding can push the far edge one pixel past the drawing buffer
// and those bytes are undefined.
export function readbackRegion(rect, dpr)

// The pending-callback state machine, lifted out so its lifecycle is testable.
// createMeasureQueue() -> { request(cb), isPending(), collect(buffer),
//                           flush(), settle() }
// - request(cb) while one is pending settles the earlier cb with []
// - flush() delivers everything collected since the last flush and clears
// - settle() delivers [] and clears — this is what dispose() calls
export function createMeasureQueue()
```

Then have `variation-grid.js` import and use them. Behaviour must be identical; this is a refactor, not a fix.

## Files

- **Create:** `packages/studio/src/core/grid-measure.js`
- **Create:** `packages/studio/tests/grid-measure.test.mjs`
- **Modify:** `packages/studio/src/core/variation-grid.js` — replace the inlined logic with calls into the new module. Keep every existing comment that explains *why*; move it with the code it describes.

## What the tests must cover

`isDrawableRect`: positive extents pass; zero width, zero height, negative width, negative height, and non-finite extents all fail.

`readbackRegion`: at DPR 1 it is the identity; at DPR 1.2 a `{x:0,y:0,w:20,h:20}` rect yields a 24×24 region; a fractional origin does not make the region over-run — assert specifically that `x + w` in device pixels equals `Math.round((rect.x + rect.w) * dpr)`; extents floor to 1 rather than 0.

`createMeasureQueue`, the important one:
- `request` then `flush` delivers the collected buffers in collection order.
- A second `request` before any `flush` settles the first callback with `[]` exactly once, and the second callback is the one `flush` delivers to.
- `settle()` on a pending request delivers `[]`, and a subsequent `flush()` delivers nothing to the already-settled callback.
- `flush()` with nothing pending is a no-op and must not throw.
- A callback is never invoked twice.
- `collect()` while nothing is pending does not accumulate — otherwise buffers leak between frames.

That last case is worth thinking about: in `render()`, `collect` is only called when a request is pending. Assert the queue enforces it rather than relying on the caller.

## Verification

```bash
node packages/studio/tests/grid-measure.test.mjs
npm test        # expect one more suite than before, all passing
npm run build
```

Then prove the refactor changed nothing observable. With the Browser pane **displayed** (see CONTEXT.md):

```js
const { studio, state } = window.__orb;
// the 3x3 grid still tiles and frames correctly
studio.enterGridMode(state, { cols: 3, rows: 3 });
studio.renderFrame();
// the ladder still renders five rungs and still measures
studio.exitGridMode();
studio.enterScaleMode(state);
for (let i = 0; i < 4; i++) studio.renderFrame();
const bufs = await new Promise((r) => studio.grid.requestMeasure(r));
console.log(bufs.map((b) => b.length));   // five non-zero lengths, descending
```

Take a screenshot of each and confirm the grid is undistorted and the ladder is unchanged. A refactor that alters framing has failed.

## Definition of done

- New pure module plus its suite, all assertions passing.
- `variation-grid.js` uses it; no duplicated logic left behind.
- Grid and ladder visually unchanged, with screenshots as evidence.
- `npm test` and `npm run build` pass.

## Out of scope

- **Do not add any npm dependency**, including headless GL or a test framework.
- **Do not try to test `render()` end to end.** If it cannot be reached without a GPU, extracting it or leaving it uncovered are both acceptable; pretending otherwise with a mock that asserts nothing is not.
- **Do not change grid, sweep or ladder behaviour.** If you find a bug while extracting, report it — do not fix it in the same commit as a refactor.
