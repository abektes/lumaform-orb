# T03 — Independent review of the scale ladder

**Read [CONTEXT.md](CONTEXT.md) first.**

**Depends on:** nothing. Can run in parallel with T01 and T02, but is most useful *before* them.
**Blocks:** merging the branch with confidence.
**Size:** small. Read-only — this task produces findings, not commits.

---

## Goal

The scale ladder shipped in ten commits. Four of them were reviewed by an independent agent; **`enterScaleMode` and its engine-switch plumbing never were** — that review was interrupted and the work was accepted on the strength of the author's own browser verification. Close that gap.

This is a read-only task. Do not fix anything you find. Report.

## Scope

The commit range is `373b81c..24ca516` on branch `scale-ladder`. Produce the diff yourself:

```bash
git log --oneline 373b81c..24ca516
git diff 373b81c..24ca516 --stat
git diff -U10 373b81c..24ca516
```

Concentrate on the two commits that were never independently reviewed:

- `b01b627` — `enterScaleMode` in `packages/studio/src/core/studio-grid.js`, the `scaleInfo` field in `studio.js`, and the `wasScale` key threaded through `studio-sequence.js`.
- `7ab434f` — the full-buffer clear in `variation-grid.js`.

The rest of the range has been reviewed; skim it for cross-cutting problems only.

## What to examine

Read `enterSweepMode` alongside `enterScaleMode` — the latter deliberately mirrors the former, and divergence between them is the most likely place a bug hides.

**Lifecycle.** Does `enterScaleMode` dispose the previous grid before building a new one? Can `scaleInfo` outlive its grid, or a grid outlive its `scaleInfo`? Is `scaleInfo` cleared on *every* path that tears the grid down, including engine switches and the sequence player stopping?

**Recursion.** `rebuildGridForEngine` runs from the `onEngineDidChange` hook. A comment claims neither `enterGridMode` nor `enterSweepMode` calls `setEngine`, so it cannot loop. Verify that claim still holds now a third branch exists, and that the scale branch sitting *before* the sweep branch leaves the sweep and plain-grid fallbacks reachable exactly as before.

**Shared state.** `wasScale` is a shallow copy of `scaleInfo`, so `sizes` is shared by reference. Trace whether anything mutates that array in place. `enterScaleMode` stores `[...sizes]` — confirm that is actually sufficient.

**The clear.** Is it correctly placed relative to the scissor test and the loop? Does it use the renderer's existing clear colour without stomping state the studio owns? `drawCellBorder` in the same file shows the save/restore dance required when the clear colour *is* changed — confirm the new code does not need it. Check its interaction with the `measured` array and the degenerate-rect skip.

**Engine disposal.** Five engine instances are created per ladder. Are all five disposed on exit, on re-entry, and on engine switch? A leak here compounds across every mode change.

**The invariants in CONTEXT.md.** In particular: only the active engine's parameter bag is touched, nothing in `packages/orb` imports from `packages/studio`, and the runtime never calls a studio method directly.

## Known and already accepted — do not re-raise

- `hitTest` still uses the uniform lattice. Intended: the ladder's slots *are* that lattice, and every ladder cell holds the same config so promotion is a no-op.
- The camera aspect is computed from floored rect dimensions. Accepted as more honest than the previous unfloored grid-wide value.
- Cells render without bloom. Deliberate — see CONTEXT.md.
- Coverage and RMS contrast do not discriminate legibility. Already known and owned by T01; do not spend review effort on it.
- `enterScaleMode` does not set `gridCols`/`gridRows`, mirroring `enterSweepMode`.

## Output

Report findings ranked most severe first. For each: file, line, what breaks, and the concrete input or sequence of actions that triggers it. Separate what you **confirmed** from what you **suspect but could not verify** — a reviewer who blurs those is worse than no reviewer.

If you find nothing, say so plainly. "No findings" from a careful read is a real result.

Do not run `npm test`; it is green and it does not execute any of this code, which is the whole reason this review exists.
