# T04 — Four small open items, three of which need a decision first

**Read [CONTEXT.md](CONTEXT.md) first.**

**Depends on:** nothing.
**Blocks:** nothing.
**Size:** small, but **three of the four items are not yet decided**. Do not implement those until the repo owner has chosen. Bring them the evidence and the options; implement whatever they pick.

---

Each item below is a real finding from review or live measurement of the scale ladder. They are batched because individually each is a few lines.

---

## Item 1 — Sub-5px windows make rungs overlap `[NEEDS A DECISION]`

**The finding.** In `packages/studio/src/core/scale-ladder.js`, `scaleRects` floors each rung's edge at 1px:

```js
const edge = Math.max(1, Math.min(Math.floor(size), Math.floor(slot), Math.floor(height)));
```

When the window is narrower than about 5 CSS px the slot is under 1px, the floor wins, and rungs overlap. Verified: `scaleRects([256,128,64,32,20], 3, 100)` returns x-values `0, 0, 1, 2, 2` — two pairs of identical rects.

**Why it is not simply a bug.** The `Math.max(1, …)` is deliberate and load-bearing. The suite asserts `scaleRects([0], 100, 100)[0].w >= 1`, so a requested size of zero must still produce a drawable rect. Removing the floor to fix the overlap breaks that test. The two requirements are genuinely in tension: below a 1px slot you cannot have both a drawable rect and no overlap.

**Also relevant:** a 3px-wide window cannot occur in practice. The studio's responsive breakpoints are 1280px and 900px, and the canvas fills the window.

**Options.**
- **(a) Leave it, document it.** Add a comment at the floor naming the tension and the reason the overlap is acceptable. Zero risk. Recommended unless there is a reason to care about sub-5px windows.
- **(b) Return zero-width rects below the threshold** and let the caller's `isDrawableRect` skip them. The grid already skips non-drawable rects, so nothing would render — which is arguably the honest answer at 3px. Requires changing the `>= 1` test, so the decision must be recorded.
- **(c) Drop rungs that will not fit**, returning fewer rects than sizes. Changes the function's contract — callers index rects by rung — and would ripple into the caption. Most work, least obvious benefit.

**Whichever is chosen, record the reasoning in a comment.** This tension will be rediscovered otherwise.

---

## Item 2 — Two rungs can clamp to the same size and become indistinguishable `[NEEDS A DECISION]`

**The finding.** `scaleRects` clamps each rung to its slot. On a narrow window the two largest rungs both hit the same clamp: measured at a 620px-wide window, the 256 and 128 rungs both render at 124px. The caption reports this honestly — `124px ↓256` and `124px ↓128` — so nothing is lying, but two of five rungs are now duplicates and the ladder carries less information than it appears to.

At a typical 1024px window the same thing happens at 107px for both top rungs. This is not an edge case; it is the common case on a laptop with the inspector open.

**Options.**
- **(a) Leave it.** The caption is honest and the duplicate rungs are harmless. Cheapest.
- **(b) Collapse duplicates.** When two rungs clamp to the same edge, render one and widen the remaining slots. More information on screen, but the slot layout stops being uniform, which `hitTest` currently relies on.
- **(c) Pick the ladder from the available width.** Instead of a fixed `[256,128,64,32,20]`, derive the top rung from the window and keep the same ratios down to 20. The ladder always shows five distinct sizes, but the sizes change as you resize, so two sessions are no longer comparable — which undercuts the point of measuring.

**My read as planner:** (a) or (b). (c) trades away cross-session comparability, which is the thing that makes the numbers worth recording at all.

---

## Item 3 — `luma` ignores alpha `[NEEDS A DECISION, probably no change]`

**The finding.** `luma(r, g, b)` in `scale-ladder.js` ignores the alpha channel. Every buffer measured so far has been fully opaque — a live readback was confirmed to be alpha `255` for all 16384 pixels of a rung — because the renderer clears to an opaque colour. So this is currently harmless.

It would stop being harmless if the studio ever rendered the orb on a transparent background, which is plausible: a transparent export is an obvious future want. A transparent *white* pixel would then read as fully covered ink.

**Options.** Leave it with a comment naming the assumption, or pre-multiply by alpha now. Leaving it is defensible; leaving it *silently* is not.

---

## Item 4 — Stale caption repaint during exit `[JUST FIX THIS ONE]`

**The finding.** In `packages/studio/src/ui/grid-session.js`, a `requestMeasure` callback that is in flight when the ladder exits will repaint the caption during teardown. It currently ends up hidden anyway, because `exitView` calls `showSweepCaption(null)` *after* the grid is disposed — so the ordering saves it.

That is correct by accident, not by construction. Anyone reordering `exitView` reintroduces a caption that survives its own view.

**The fix.** Make the poll's callback a no-op when the ladder is no longer active — check that `studio.scaleInfo` is still set, or capture a generation counter when the poll starts and compare on callback. Add a comment explaining that the guard exists because the callback outlives the view, not because the current ordering is wrong.

No decision needed. Implement it, and verify by entering the ladder, pressing `L` to exit, and confirming the caption is gone and stays gone.

---

## Verification for whatever you implement

```bash
node packages/studio/tests/scale-ladder.test.mjs
npm test
npm run build
```

Any change to `scaleRects` needs its test updated in the same commit, and the reasoning in the commit message.

For Item 4 and for any layout change, verify in the browser with the pane **displayed** (see the hidden-pane trap in CONTEXT.md) and attach a screenshot.

## Out of scope

Do not touch the metrics — `frameMetrics`, `coverage`, `rms` and their replacement are entirely T01's. Do not change `enterScaleMode` or `scaleInfo`.
