# T01 — Replace the ladder's legibility metrics with scale-sensitive ones

**Read [CONTEXT.md](CONTEXT.md) first.** It has the repo layout, the invariants, the test conventions and the browser traps. This file assumes you have.

**Depends on:** nothing. All the code it changes is already shipped and passing.
**Blocks:** nothing. But until this lands, the numbers the ladder displays are decorative.
**Size:** the largest task in this pack. Two new pure functions, one wiring change, one docs correction.

---

## Goal

The scale ladder currently prints two numbers under each rung — coverage and RMS contrast. **They do not work.** Replace them with two metrics that are scale-sensitive by construction, and correct the claims made for them in the plan and in `docs/VISION.md`.

## Why — read this, it is the whole task

The shipped metrics come from `frameMetrics` in `packages/studio/src/core/scale-ladder.js`:

- `coverage` — fraction of pixels with luma above `0.06`
- `rms` — root-mean-square contrast of luma

The premise was that coverage catches an orb *vanishing* at small size and RMS catches it going to *mush*. Measured on the real thing, neither happens. Across all five rungs, on three unrelated engines:

```
tesseract     cov 0.075 0.074 0.077 0.077 0.078   rms 0.217 0.216 0.219 0.223 0.227
murmuration   cov 0.076 0.075 0.076 0.095 0.097   rms 0.219 0.218 0.225 0.248 0.236
nebula        cov 0.073 0.072 0.052 0.058 0.082   rms 0.215 0.215 0.181 0.190 0.222
```

Essentially flat, and where it moves it moves the *wrong way*: coverage **rises** at 20px.

The reason is structural, not a tuning problem. **Both metrics are ratios over the cell's own pixels, so they are near-invariant under pure scaling.** A raymarched blob fills the same fraction of its viewport at any size. A wireframe's lines stay roughly one device pixel wide at any size, so as the viewport shrinks those lines occupy a *larger* share of the frame — hence coverage rising. Meanwhile what is actually lost at 20px is **structural distinguishability**: separate lines merge into one another, and detail that existed at 256px is simply not representable. Neither metric models that, and no threshold tweak will make them.

The fix is to stop measuring each rung in isolation and start measuring it **against the largest rung**, which is the design as intended. That makes both numbers relative, and therefore scale-sensitive by construction.

This comparison is legitimate here because of a fact established in CONTEXT.md: every rung is the same config at the same animation instant. Any difference between two rungs is caused by pixel size alone.

## The two replacement metrics

### 1. `retention` — is ink surviving, proportionally?

Mean luma of the rung divided by mean luma of the reference rung.

- `1.0` — the rung carries the same ink density as the reference. Marks are scaling cleanly.
- `< 1.0` — marks are dropping out. This is the *vanishing* failure, which old `coverage` was supposed to catch and could not.
- `> 1.0` — marks are proportionally fatter than intended, because line width and point size have a pixel floor. This is *crowding*, the first half of going to mush, and it is a real finding: it is why a 4000-particle design turns into a grey disc.

### 2. `divergence` — is structure surviving?

Downscale the reference rung to the rung's exact pixel dimensions with an area-average (box) filter, then take the normalised RMS difference between that ideal downscale and what the rung actually rendered.

- `0.0` — the rung is exactly what you would get by shrinking the reference. Nothing was lost; the design scales.
- higher — the rung diverges from its own shrunk self. Detail that the reference had is not present, or aliasing invented detail that was never there.

This is the number that actually answers "does this design survive at 20px", and it is scale-sensitive because the reference is fixed while the target resolution shrinks.

### Caveats to write into the code as comments

- A perfect `0.0` divergence is unattainable — antialiasing differs between resolutions, so there is always a floor. The number is **comparative** across rungs and across configs, never absolute.
- The reference rung may itself be clamped (see CONTEXT.md). Use whichever rung actually rendered largest, not the one whose *requested* size is largest.
- Both metrics are undefined when the reference is blank. Mean luma of zero makes `retention` a division by zero. Return `NaN` in that case; `formatMetric` already renders `NaN` as `–`.

## Files

- **Modify:** `packages/studio/src/core/scale-ladder.js` — add `downscaleLuma`, `structuralDivergence`, `inkRetention`. Keep `frameMetrics`, `scaleRects`, `DEFAULT_SCALE_SIZES`, `formatMetric` exported and unchanged; other code uses them and `frameMetrics.mean` is an input to `inkRetention`.
- **Modify:** `packages/studio/tests/scale-ladder.test.mjs` — add cases for the three new functions. Do not weaken or delete existing cases.
- **Modify:** `packages/studio/src/ui/grid-session.js` — the caption's measurement poll, which currently maps buffers through `frameMetrics` and prints `coverage / rms`.
- **Modify:** `docs/VISION.md` — the Appendix row for the scale ladder currently claims coverage and RMS contrast. Correct it.
- **Modify:** `docs/superpowers/plans/2026-09-18-scale-ladder.md` — its Task 5 section states the now-disproven premise. Add a short correction note; do not rewrite the history of what was built.

## Interfaces to produce

Exact names and signatures. Later work and the caption both depend on these.

```js
// Area-average downscale of the luma channel. `pixels` is RGBA bytes for a
// square image of `size` x `size` device pixels; returns targetSize*targetSize
// luma values in 0..1, row-major, same orientation as the input.
export function downscaleLuma(pixels, size, targetSize)

// Normalised RMS difference between a rung and the ideal downscale of the
// reference. Returns 0 for a perfect scale, higher for lost structure, NaN when
// either input is empty or the reference is smaller than the rung.
export function structuralDivergence(referencePixels, rungPixels)

// Mean luma of the rung over mean luma of the reference. 1 = ink scaling
// cleanly, <1 = marks dropping out, >1 = marks crowding. NaN if the reference
// is blank.
export function inkRetention(rungPixels, referencePixels)
```

Note that `structuralDivergence` and `inkRetention` take **buffers only** — each buffer's edge is derivable as `Math.sqrt(buffer.length / 4)`, because ladder cells are always square. Do not add size parameters to them; a caller passing a mismatched size would be a bug the signature invites. `downscaleLuma` takes an explicit `size` because it is the lower-level primitive and is tested directly.

## Steps

Follow TDD: write the test, run it and **see it fail**, then implement, then see it pass. Commit at the end of each numbered step.

### Step 1 — `downscaleLuma`

Write tests first. Cover at least:
- A 2×2 image downscaled to 1×1 returns the mean of the four luma values.
- A 4×4 image downscaled to 2×2 box-averages each quadrant.
- A **non-integer ratio** — 3×3 to 2×2 — distributes source pixels by area overlap, not by nearest neighbour. This is the case most implementations get wrong; assert an exact expected value you have computed by hand.
- Downscaling to the same size is the identity (within float tolerance).
- `targetSize` larger than `size` is not supported — decide the behaviour, document it in a comment, and assert it.
- An empty buffer returns an empty result rather than throwing.

Use Rec.709 luma over sRGB bytes — the same weighting the existing `luma` helper in this file uses. Reuse that helper; do not write a second one.

Implement with an area-weighted box filter: for each target pixel, integrate the source pixels its footprint covers, weighting partially-covered source pixels by the overlapping fraction.

### Step 2 — `inkRetention`

Tests: identical buffers give `1.0`; a rung at half the reference's mean luma gives `0.5`; a blank reference gives `NaN`; a blank rung against a lit reference gives `0`.

Implementation is two calls to the existing `frameMetrics` (or a direct mean) and a division. Keep it that simple.

### Step 3 — `structuralDivergence`

Tests:
- A rung that is exactly the box-downscale of the reference gives `0` (build the fixture by calling `downscaleLuma` and synthesising RGBA bytes from it).
- A rung that is uniformly grey against a structured reference gives a clearly non-zero value.
- Equal-size buffers that are identical give `0`.
- A rung **larger** than the reference gives `NaN` — you cannot upscale into a meaningful comparison.
- Empty buffers give `NaN`.
- The value is normalised: assert it stays within `0..1` for opposite-extreme inputs (all-black rung vs all-white reference).

### Step 4 — Wire the caption

In `packages/studio/src/ui/grid-session.js`, the poll currently does roughly `buffers.map((buffer) => frameMetrics(buffer))` and the caption prints `formatMetric(m.coverage) / formatMetric(m.rms)`.

Change it to:
1. Pick the reference buffer — **the largest actually-rendered rung**, i.e. the buffer with the greatest length, not index 0 by assumption. Ties are fine; take the first.
2. Compute `retention` and `divergence` for every rung against that reference.
3. Print `formatMetric(retention) / formatMetric(divergence)`.
4. The reference rung compares against itself, so it will always read `1.00 / 0.00`. That is correct and worth a comment — it is the baseline the others are read against, not a measurement.
5. Update the caption's heading or add a legend so a reader knows which number is which. **Do not add CSS classes** — reuse `.sweep-caption` / `.sweep-title` / `.sweep-values`, which is what the existing code does.

Leave the clamped-size labels (`204px ↓256`) exactly as they are. They are correct and were added to fix a real bug.

### Step 5 — Correct the documentation

- `docs/VISION.md`, Appendix table, the "Scale ladder" row: it currently says "per-rung coverage and RMS contrast". Replace with the new metrics, and keep the existing caveat that cells render without bloom so it measures geometry rather than the final composite.
- `docs/superpowers/plans/2026-09-18-scale-ladder.md`: its Task 5 preamble argues the coverage/RMS premise. Append a dated correction stating the premise was disproven on measurement and pointing at this task. Do not delete the original reasoning — the record of why it was believed is worth keeping.

## Verification

Automated, required:

```bash
node packages/studio/tests/scale-ladder.test.mjs
npm test        # expect ALL SUITES PASS, count one higher than before only if you added a suite
npm run build
```

Manual, required — **this is the point of the task and the automated tests cannot do it.** Run the dev server, make sure the Browser pane is **displayed** (see the hidden-pane trap in CONTEXT.md), then in the console:

```js
const { studio, state } = window.__orb;
const { inkRetention, structuralDivergence } = await import('/src/core/scale-ladder.js');
async function ladder(engine) {
  studio.exitGridMode();
  studio.setEngine(engine, state);
  studio.enterScaleMode(state);
  for (let i = 0; i < 6; i++) studio.renderFrame();
  const bufs = await new Promise((r) => studio.grid.requestMeasure(r));
  const ref = bufs.reduce((a, b) => (b.length > a.length ? b : a), bufs[0]);
  return bufs.map((b) => ({
    retention: +inkRetention(b, ref).toFixed(3),
    divergence: +structuralDivergence(ref, b).toFixed(3),
  }));
}
for (const e of ['tesseract', 'murmuration', 'nebula']) console.log(e, await ladder(e));
```

**The task is not done until these numbers move.** Specifically, you must be able to state:
- `divergence` rises monotonically, or near enough, as rungs get smaller — because smaller rungs can represent less of the reference's structure.
- The three engines are **distinguishable from each other**. A wireframe (`tesseract`) and a raymarched blob (`nebula`) should not produce the same profile; the blob should degrade far more gracefully. If all three still look alike, the metric has the same flaw as the old one and you should stop and report that rather than ship it.

Record the actual numbers in your commit message and your report. Flat numbers are a finding, not a failure to hide.

## Definition of done

- Three new exported functions, each with tests that would fail against a naive implementation.
- The caption shows the new numbers and the reference rung is chosen by rendered size, not index.
- `docs/VISION.md` and the plan no longer claim the disproven premise.
- `npm test` and `npm run build` pass.
- Browser numbers recorded, with an explicit statement of whether they discriminate.

## Out of scope — do not do these

- **Do not change `scaleRects`, `enterScaleMode`, `scaleInfo`, or the clamping behaviour.** They are correct.
- **Do not add bloom to grid cells.** See CONTEXT.md.
- **Do not add a per-size parameter-tuning feature** (different dot counts at different sizes). That is a *conclusion* this instrument might eventually justify, and adopting it now is exactly the premature specification `docs/VISION.md` §3 exists to prevent.
- **Do not delete `frameMetrics`.** `inkRetention` builds on it, and its `coverage` is still a reasonable raw readout even though it fails as a legibility metric.
