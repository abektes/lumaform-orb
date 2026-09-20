# Scale ladder — open work, packaged for handoff

Four self-contained task files. Each is written for an agent with **no session context and no knowledge of this codebase**. Hand one over as-is; it will tell the agent everything it needs.

## How to use this pack

Give the agent **two files**: [CONTEXT.md](CONTEXT.md) and the task file. Nothing else is required — no conversation history, no plan file, no summary of what came before. Tell it to read CONTEXT.md first.

CONTEXT.md carries the repo layout, the architectural invariants, the test conventions, and the browser traps that have produced confident wrong answers here before. Every task file assumes it has been read and does not repeat it.

## The tasks

| | Task | What it is | State |
| --- | --- | --- | --- |
| **T01** | [Scale-sensitive metrics](T01-scale-sensitive-metrics.md) | Replace the ladder's two numbers, which measurement proved do not work, with two that are scale-sensitive by construction | Fully specified, ready to run |
| **T02** | [`variation-grid.js` tests](T02-variation-grid-tests.md) | A 600-line file carrying grid, sweep and ladder has no test touching it. Extract a pure seam and cover it | Fully specified, ready to run |
| **T03** | [Independent review](T03-review-scale-ladder.md) | `enterScaleMode` never got a second pair of eyes — that review was interrupted. Read-only, produces findings | Ready to run |
| **T04** | [Four small open items](T04-open-decisions.md) | Three need a decision from you before implementation; one is just a fix | Item 4 done; **needs your input on items 1–3** |
| **T05** | [Merge blockers](T05-merge-blockers.md) | Three blockers and four cleanups found by reviewing T01/T02, plus one decision that reverses a mistake in T01's spec | **Needs your input on Blocker 3** |

## Status as of 2026-09-20

**T01, T02 and T03 have landed** on branch `scale-ladder`; 40 suites pass and the build is clean. T03's review came back with no findings. T04's item 4 shipped inside T01's commit.

**The branch is not mergeable yet** — see T05, which carries what reviewing T01 and T02 turned up.

What the metrics actually do, measured live rather than argued: **`inkRetention` works.** At a 38px rung against a 308px reference, murmuration reads 1.723 (particles crowding, because line and point size have a pixel floor) against nebula's 0.800 (a raymarched blob simply dimming) — a 2.2× spread between designs at one size, matching the physics. **`structuralDivergence` is correctly implemented but does not discriminate**: 0.11–0.22 across every engine and every rung, non-monotonic. It answers "is there loss" (always yes past the first step), not "how much" or "for which design". That needs its own decision — keep it as a coarse yes/no, or respec it. T05 deliberately leaves it alone.

## Suggested order

**T03 first.** It is read-only, cheap, and may change what T01 and T02 should do. Anything it finds is better known before other agents start editing the same files.

**T01 and T02 can run in parallel** — they touch different files. T01 modifies `scale-ladder.js`, `grid-session.js` and the docs; T02 modifies `variation-grid.js` and adds a new module. The only overlap is that both run the full suite.

**T04 last**, and only after you have answered its three questions. Items 1–3 are decisions, not implementation work; an agent that implements them without your answer is guessing.

**T01 is the one that matters.** The other three are hygiene. Until T01 lands, the ladder is a good visual instrument printing two decorative numbers.

## What already works — do not re-do it

The ladder itself ships and is verified. Pressing `L` renders the current config at five true pixel sizes; the caption honestly reports clamped rungs as `204px ↓256`; the readback regions match the DPR-scaled rects exactly. `npm test` passes 39 suites and the build is clean, on branch `scale-ladder`.

Three defects were found during verification and are already fixed: stale frames bleeding through the gaps between rungs, a caption that reported requested rather than rendered size, and a floating-point cancellation in the variance that reported contrast on a perfectly flat frame.

## The one thing to know before reading T01

The ladder's current metrics — `coverage` and `rms` contrast — **do not discriminate**. Measured across all five rungs on three unrelated engines they sit at roughly `0.075` and `0.22` everywhere, and where they move they move the wrong way.

The cause is structural rather than a tuning problem: both are ratios over a cell's own pixels, so they are near-invariant under pure scaling. T01 explains this in full and specifies the replacement. If you read only one section of this pack, read T01's "Why".

## Branch state

All of this sits on `scale-ladder`, which is stacked on `open-source-packaging` (PR #1). It needs that PR to merge before it can rebase onto `main`. Nothing here is pushed.
