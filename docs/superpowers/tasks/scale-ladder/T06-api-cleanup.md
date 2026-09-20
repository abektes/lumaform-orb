# T06 — One dimension type, measurement that carries its own geometry, and the degenerate viewport

**Read [CONTEXT.md](CONTEXT.md) first.** It has the repo layout, the invariants, the test conventions and the browser traps.

**Depends on:** T01, T02 and T05, all merged on branch `scale-ladder`.
**Blocks:** nothing, but every part of this is a wart that will otherwise harden.
**Size:** medium. Four parts, three of them mechanical. Part C fixes a live bug.

---

## Goal

T05 landed correctly but left three API warts and one false premise. Two independent reviews found the warts; the false premise I found by accident and it is a real bug. Fix all four.

**None of this is a wrong number on screen at a normal window size.** Verified after T05: `ALL SUITES PASS (40)`, clean build, and at a 1500px window the ladder reads `1.00/0.00 · 1.01/0.12 · 0.95/0.16 · 1.09/0.18 · 1.07/0.15` across five unclamped rungs with no `NaN`. This task is about the shape of the code and one degenerate case.

---

## Part A — Collapse three dimension shapes into one

`packages/studio/src/core/scale-ladder.js` currently accepts **three** shapes for a dimension in two functions:

```js
const rw = typeof refDim === 'number' ? refDim : (refDim.w ?? refDim.pw);
const rh = typeof refDim === 'number' ? refDim : (refDim.h ?? refDim.ph);
const tw = typeof rungDim === 'number' ? rungDim : (rungDim.w ?? rungDim.pw);
const th = typeof rungDim === 'number' ? rungDim : (rungDim.h ?? rungDim.ph);
```

`downscaleLuma` does the same four-way dance with `size` and `targetSize`. That is eight inline normalisations for a value the caller knows exactly.

**Why this is wrong, specifically.** T05's decision (a) existed to *delete* dimension inference — the old `bufferDimensions` guessed a buffer's shape from its length and resolved ambiguity by picking whichever orientation scored best. Passing explicit dimensions fixed that. Then accepting three shapes for those explicit dimensions re-introduced a softer version of the same problem: the function still does not know what it has been handed, and `{w,h}` versus `{pw,ph}` is exactly the CSS-pixel versus device-pixel distinction that this codebase has already been bitten by. A caller who passes `{w,h}` (CSS pixels, from `scaleRects`) where `{pw,ph}` (device pixels, from `readbackRegion`) was meant will get a silently wrong number, not an error.

**The fix.** Pick **one** dimension type — `{w, h}` in **device pixels** — and use it everywhere. Delete every `typeof … === 'number'` ternary and every `?? …pw` fallback from both functions. Convert at the one boundary that produces the other shape.

`readbackRegion` in `packages/studio/src/core/grid-measure.js` returns `{px, py, pw, ph}`. Either rename its extent fields to `w`/`h`, or have the single call site destructure them into `{w, h}`. Prefer whichever produces fewer total changes, and say in a comment that the metric functions take **device** pixels, because that is the mistake this consolidation exists to prevent.

A function that silently accepts three shapes cannot tell you that you passed the wrong one.

## Part B — Make the argument order consistent, and stop recomputing the layout

Two problems with one fix.

**B1 — Sibling metrics disagree on operand order.**

```js
inkRetention(rungPixels, referencePixels)                       // rung first
structuralDivergence(referencePixels, refDim, rungPixels, rungDim)  // reference first
```

These are read and called side by side in the caption poll. Flipped operand order between siblings is a bug magnet, and swapping them silently returns a plausible wrong number rather than throwing. (This is a defect in the specs that produced them — T01 and T05 — not in the implementation; both were written exactly as specified.)

Settle on **reference first** for both, matching the mental model "compare this rung *against* the reference": `inkRetention(referencePixels, rungPixels)` and `structuralDivergence(referencePixels, refDim, rungPixels, rungDim)`. Update the tests and the single caller.

**B2 — The caption recomputes geometry the grid already has.**

`packages/studio/src/ui/grid-session.js` currently does:

```js
const dpr = studio.renderer.getPixelRatio();
const rects = scaleRects(info.sizes, window.innerWidth, window.innerHeight);
const dims = rects.map((rect) => readbackRegion(rect, dpr));
```

Three problems. It reaches through `studio` into the renderer for DPR. It re-runs `scaleRects`, which `enterScaleMode` already encodes as the grid's `rectFactory`. And it recomputes from `window.innerWidth` rather than from the width the grid was actually rendered with — so if those ever diverge, the metrics describe a layout that was never drawn.

**The fix: have the measurement carry its own geometry.** Change `requestMeasure`'s callback payload from bare buffers to one object per cell:

```js
{ buffer, rect, dim }   // rect = the CSS-pixel {x,y,w,h} the cell was drawn with
                        // dim  = the device-pixel {w,h} the buffer actually is
```

`variation-grid.js` already has both values in hand at readback time. This kills the recomputation, the `studio.renderer` reach-through and the drift risk together, and it hands `structuralDivergence` exactly the dimensions Part A wants. The caption then takes its clamped-size labels from `rect.w` — which is what was *drawn*, strictly better than a recomputation.

`createMeasureQueue` in `grid-measure.js` collects whatever it is handed, so its logic is unchanged — but its tests assert on buffer arrays and will need updating to the new payload shape. Keep every existing lifecycle assertion (stale settle on replace, `settle()` on dispose, no double-invoke, no collection while not pending); only the payload changes.

A skipped degenerate cell must still contribute an entry so the array stays aligned with cell order. Decide what that entry looks like — an empty buffer with its rect, most likely — and pin it with a test.

## Part C — The degenerate viewport is real, and the tension that blocked it is not `[FIXES A LIVE BUG]`

**T04 item 1 said sub-5px windows are unreachable in practice, because the studio's breakpoints are 900px and 1280px. That was wrong, and it was my error.** Observed live: with the browser pane collapsed, `window.innerWidth === 0`, and the ladder produces **five 1px rungs that all overlap**, with retention reading `–` for every one. Zero-width viewports happen on pane collapse, on minimise, and transiently during resize.

T04 framed this as an irreconcilable tension: the `Math.max(1, …)` floor is required by the test `scaleRects([0], 100, 100)[0].w >= 1`, so removing it to stop the overlap breaks that test.

**The tension is an artifact of conflating two different clamps.** There are two distinct questions and the current code answers both with one `Math.max`:

- *How big does this rung want to be?* A requested size of `0` should still want one pixel.
- *How much room is there?* If the slot has no room, there is genuinely nowhere to draw, and the honest answer is zero.

Separate them and both requirements hold:

```js
// A zero-size request still wants a pixel; a slot with no room genuinely has
// nowhere to draw. Conflating these is what made a collapsed pane render five
// overlapping 1px rungs instead of nothing.
const wanted = Math.max(1, Math.floor(size));
const available = Math.min(Math.floor(slot), Math.floor(height));
const edge = Math.min(wanted, available);
```

I ran this formula against every case the suite and the app exercise. Edges produced:

| input | edges | note |
| --- | --- | --- |
| `([256,128,64,32,20], 0, 0)` | `0,0,0,0,0` | collapsed pane — nothing drawable, no overlap |
| `([256,128,64,32,20], 3, 100)` | `0,0,0,0,0` | the overlap T04 documented simply stops existing |
| `([0], 100, 100)` | `1` | **the existing test still passes** |
| `([256,128,64,32,20], 2000, 600)` | `256,128,64,32,20` | centres `200,600,1000,1400,1800`, no overlap |
| `([256,128,64,32,20], 1024, 768)` | `204,128,64,32,20` | normal clamping unchanged |
| `([256,128,64,32,20], 400, 300)` | `80,80,64,32,20` | no overlap |
| `([256], 1000, 90)` | `90` | height clamp unchanged |

Every existing assertion in `scale-ladder.test.mjs` holds, and both degenerate cases are fixed. You should still re-run the suite rather than trusting this table.

`isDrawableRect` in `grid-measure.js` already rejects non-positive extents and `render()` already skips those cells while keeping the measurement array aligned — so the machinery to handle zero-width rects is **already there and already tested**. This change just lets it do its job.

**Also handle the caption.** When no rung is drawable, five `–` entries is noise. Skip the metrics row entirely in that case rather than printing dashes.

**Update the comment.** `scale-ladder.js` currently carries `// Tension: at window widths under ~5px…` documenting this as accepted. Replace it with what is now true, and note that the zero case is reachable via a collapsed pane — that is the fact that makes the handling necessary rather than defensive.

## Part D — One leftover duplicated comment

`packages/studio/src/core/variation-grid.js` (in `readCellPixels`, around lines 399–402) still restates verbatim the "derive the extent from the rounded edges… those bytes are undefined" rationale that now lives on `readbackRegion` in `grid-measure.js:20-23`. T05's C1 removed the `isDrawableRect` duplication but missed this one. Delete the duplicated body; leave a one-line pointer only if the call site genuinely needs the context.

---

## Verification

```bash
node packages/studio/tests/scale-ladder.test.mjs
node packages/studio/tests/grid-measure.test.mjs
npm test        # 40 suites pass today; keep it at 40 or higher
npm run build
```

Add a test for the Part C behaviour specifically:

```js
const collapsed = scaleRects([256, 128, 64, 32, 20], 0, 0);
ok('a collapsed viewport yields nothing drawable', collapsed.every((r) => r.w === 0));
ok('a collapsed viewport still returns one rect per rung', collapsed.length === 5);
ok('a zero-size request in a real window still gets a pixel',
  scaleRects([0], 100, 100)[0].w === 1);
```

**Browser verification is required** — Parts B and C both change what reaches the screen. With the pane **displayed** (see the hidden-pane trap in CONTEXT.md):

```js
const { studio, state } = window.__orb;
studio.exitGridMode();
studio.setEngine('murmuration', state);
window.__orb.toggleScale();
for (let i = 0; i < 8; i++) studio.renderFrame();
await new Promise((r) => setTimeout(r, 800));
for (let i = 0; i < 3; i++) studio.renderFrame();
console.log(window.innerWidth, document.querySelector('.sweep-caption').innerText);
```

At a window wide enough for an unclamped ladder (~1500px) this must still read five rungs with real numbers and **no `–` and no `NaN`** — for example `1.00/0.00 · 1.01/0.12 · 0.95/0.16 · 1.09/0.18 · 1.07/0.15`. Exact values vary with width; what must hold is that the reference rung reads `1.00 / 0.00` and a particle engine's small rungs read retention above 1.

Then confirm Part C at a narrow window: emulate a very small viewport, re-enter the ladder, and verify nothing renders and the caption does not print a row of dashes.

## Definition of done

- One dimension type, in device pixels, with every `typeof`/`??` shape-normalisation gone.
- Both metrics take the reference first.
- `requestMeasure` delivers `{buffer, rect, dim}`; `grid-session.js` no longer calls `scaleRects` or touches `studio.renderer` for measurement.
- A collapsed viewport produces zero drawable rungs and no dash row; `scaleRects([0], 100, 100)[0].w === 1` still holds.
- The duplicated `readCellPixels` comment is gone.
- Both suites and the build pass; browser verified at a wide and a narrow window.

## Out of scope

**Do not redesign or delete `structuralDivergence`.** It remains correctly implemented but poorly discriminating — measured 0.11–0.22 across every engine and rung, non-monotonic. Whether to keep it at all is an open decision that has not been taken. Changing its argument order and dimension type (Parts A and B) is in scope; changing what it computes is not.

**Do not touch `inkRetention`'s behaviour.** Only its argument order changes. It works — 2.2× spread between engines at one rung.

**T04 item 2 is still open and stays open.** Two rungs clamping to the same size and becoming indistinguishable is a separate decision, still recorded in [T04](T04-open-decisions.md). Part C's change does not resolve it and must not try to.

**Do not change `enterScaleMode`, `scaleInfo`, or the clamped-size label format.**
