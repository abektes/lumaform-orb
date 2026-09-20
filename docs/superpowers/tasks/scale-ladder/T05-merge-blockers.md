# T05 — Clear the merge blockers on the new metrics

**Read [CONTEXT.md](CONTEXT.md) first.** It has the repo layout, the invariants, the test conventions and the browser traps.

**Depends on:** T01 and T02, both already merged on branch `scale-ladder`.
**Blocks:** merging the branch.
**Size:** small. Three blockers, four cleanups, one decision. No new features.

---

## Goal

T01 replaced the scale ladder's legibility metrics and T02 extracted a testable seam out of the grid renderer. Both work. An independent review plus live browser measurement turned up **three things that block merge and four worth cleaning up**. Fix them.

Nothing here is a wrong number on screen. The maths is sound — `downscaleLuma` was independently confirmed genuinely area-weighted (matching a supersampled reference to 3.8e-12 on a non-integer ratio), and `structuralDivergence` scores a synthetic perfect downscale at 0.0007 against 0.2074 for the real rung. These are correctness-of-claims and coverage problems, not arithmetic problems.

---

## Blocker 1 — The `frameMetrics` comment still teaches the disproven premise

`packages/studio/src/core/scale-ladder.js:172-178` still reads:

```js
// Two numbers, because there are two distinct ways a small orb fails.
//
// `coverage` catches disappearance: an orb whose marks fall below the visible
// threshold trends to 0 even though the config is unchanged.
// `rms` catches mush: an orb that keeps every pixel lit but loses all internal
// structure trends to 0 contrast at high coverage. Coverage alone would call
// that a success.
```

**That claim was disproven by measurement**, which is the entire reason T01 existed. `docs/VISION.md` and the plan were corrected; this comment — the one a developer actually reads when they open the module — was not. In a codebase where comments explain *why*, a comment that confidently explains a false *why* is the worst kind of stale.

**Fix.** Rewrite it to say what is true: `coverage` and `rms` are ratios over a cell's own pixels and are therefore near-invariant under scaling, which is why they measured flat (~0.075 and ~0.22) across every rung of every engine. State what `frameMetrics` is still legitimately for — `mean` is the input to `inkRetention`, and `coverage` remains a reasonable raw readout of how much of a frame is lit — and point at `inkRetention` / `structuralDivergence` as the metrics that answer the legibility question.

Do not delete `frameMetrics`. It is still used.

## Blocker 2 — The divergence comment overstates comparability

`packages/studio/src/core/scale-ladder.js:135-138` claims the number is "comparative across rungs and configs, never absolute."

**Across rungs is true. Across configs is not.** Divergence is a plain per-pixel RMS difference normalised only by pixel count — never by the reference's own contrast or mean. A dim config therefore scores lower divergence than a bright one at *identical relative* structural loss. Comparing two different designs' divergence numbers is not meaningful, and the comment currently invites exactly that.

**Fix.** Narrow the claim to rungs within one ladder, and add one sentence saying why cross-config comparison does not hold: the normalisation is by pixel count, not by the reference's contrast.

## Blocker 3 — `bufferDimensions` is untested and silently optimistic `[NEEDS A DECISION]`

`packages/studio/src/core/scale-ladder.js:59-69` infers a buffer's dimensions from its length: the square root when the pixel count is a perfect square, otherwise both `k×(k+1)` orientations, otherwise an empty list.

Then `structuralDivergence` (`:142-169`) loops over every candidate pair of reference and rung dimensions and keeps `Math.min` of the resulting divergences.

Three problems, all confirmed:

- **No test passes a non-square buffer.** That branch exists precisely because ladder readbacks can be off by one device pixel at fractional DPR — a real case, observed live as a 128×129 buffer. The novel part of T01 is the part nothing exercises.
- **The `Math.min` scores a genuinely non-square rung by whichever transpose flatters it.** Only one orientation is real. Picking the better-looking one biases every such measurement optimistically.
- **Any pixel count that is neither square nor `k(k+1)` returns `NaN` silently.** Verified: a 7-pixel buffer compared against itself returns `NaN`. No comment says so.

**This is a defect in the T01 spec, not in the implementation.** T01 said: *"Do not add size parameters to them; a caller passing a mismatched size would be a bug the signature invites."* That was written on the false assumption that ladder buffers are always square. They are not. The implementer met the constraint as written and `bufferDimensions` is the reasonable consequence.

### The decision

**(a) Pass the real dimensions in. Recommended.** Change the signatures to `structuralDivergence(referencePixels, refDim, rungPixels, rungDim)` and `inkRetention(rungPixels, referencePixels)` (retention is a scalar ratio and needs no dimensions). Delete `bufferDimensions` and the orientation loop entirely. The caller in `packages/studio/src/ui/grid-session.js` already computes the live rects via `scaleRects` for the clamped-size labels, and `readbackRegion` in `grid-measure.js` turns a rect into the exact device-pixel `{pw, ph}` — so the true dimensions are already in hand at the call site. This removes the guessing rather than testing it.

**(b) Keep the inference, make it honest.** Add non-square test coverage, replace `Math.min` with a deterministic single choice (document which orientation wins and why), and give the `NaN` fallthrough an explaining comment.

**(c) Prove buffers are always square and delete the branch.** Only if you can actually establish that; the observed 128×129 buffer says you cannot.

Take (a) unless there is a reason not to. It is less code, and it replaces an inference with a fact the caller already has.

**Whichever you take, tests must cover a non-square buffer** — construct a `k×(k+1)` case (for example 24×25) and pin its behaviour.

---

## Cleanups — fix these in the same pass

**C1 — Comments were duplicated instead of moved.** `packages/studio/src/core/variation-grid.js:474-477` restates verbatim what now lives in `grid-measure.js:4-7`. T02 asked for comments to move with the code they describe. Leave a short pointer at the call site if the context helps there; delete the duplicated body.

**C2 — `isDrawableRect` widened behaviour inside a commit declared behaviour-neutral.** `grid-measure.js:8-10` adds `!!rect` and finiteness checks on `x` and `y`, beyond the inline `w <= 0 || h <= 0` it replaced and beyond T02's stated "non-finite extents". A `rectFactory` returning `{x: NaN, …}` now skips the cell where it previously drew it. The behaviour is *better* — keep it — but add a comment saying the `x`/`y` finiteness check is deliberate and why, so the next reader does not take it for copy-paste defensiveness.

**C3 — That line is far too long.** `grid-measure.js:9` is a single ~160-character boolean. Break it across lines to match the file's style.

**C4 — Re-entrancy hole in the queue.** In `createMeasureQueue`, if a callback settled inside `request()` synchronously calls `request()` again, the re-entrant registration is overwritten by the outer call's `pendingCallback = callback`. Unreachable from the current caller, but it is three lines to make safe: settle the stale callback *after* installing the new one, or guard against re-entry. This was flagged in an earlier review and survived; close it or write a comment saying it is knowingly accepted.

---

## Explicitly out of scope

**Do not redesign `structuralDivergence`.** It is correctly implemented but its dynamic range is compressed — measured at 0.11 to 0.22 across every engine and every rung, and non-monotonic (tesseract runs 0.176 → 0.164 → 0.167). It fails the "rises monotonically, engines distinguishable" condition T01 set for it. That is a real open question, but it needs its own spec and its own decision about whether to keep the metric at all. Leave it exactly as it is.

**Do not touch `inkRetention`.** It works. Verified live: at the same 38px rung with a 308px reference, murmuration reads 1.723 (particles crowding, because line and point size have a pixel floor) against nebula's 0.800 (a raymarched blob simply dimming). A 2.2× spread between designs at one size, matching the physics.

**Do not change `scaleRects`, `enterScaleMode`, `scaleInfo`, or the clamped-size labels.** All correct.

**Do not add bloom to grid cells.** See CONTEXT.md.

---

## Verification

```bash
node packages/studio/tests/scale-ladder.test.mjs
node packages/studio/tests/grid-measure.test.mjs
npm test        # 40 suites currently pass; keep it at 40 or higher
npm run build
```

If you take decision (a), the call site in `grid-session.js` changes, so verify the caption still works in the browser with the pane **displayed** (see the hidden-pane trap in CONTEXT.md):

```js
const { studio, state } = window.__orb;
studio.exitGridMode();
studio.setEngine('murmuration', state);
window.__orb.toggleScale();
for (let i = 0; i < 8; i++) studio.renderFrame();
await new Promise((r) => setTimeout(r, 700));
for (let i = 0; i < 3; i++) studio.renderFrame();
document.querySelector('.sweep-caption').innerText;
```

Expected shape — five rungs, a clamped first rung, retention above 1 on the small rungs for a particle engine:

```
RENDERED SIZE · RETENTION / DIVERGENCE
174px ↓256
128px
...
1.00 / 0.00
1.02 / 0.18
...
```

The numbers will differ with window width. What must hold: the reference rung reads `1.00 / 0.00`, and murmuration's smallest rungs read retention well above 1.

## Definition of done

- The `frameMetrics` comment describes what is true.
- The divergence comment claims comparability only across rungs.
- `bufferDimensions` is either gone (decision a) or tested and deterministic (decision b), with a non-square case pinned either way.
- C1–C4 addressed.
- Both suites and the build pass; caption verified in the browser if the call site changed.

## Context you may want

The full review this task came from, and the measurements behind it, are summarised in the commit messages on `scale-ladder` and in `.superpowers/sdd/review-t03.md`. You do not need them to do this task — everything required is above.
