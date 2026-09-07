# Lumaform Orb — Vision & Product Requirements

**Status:** Living document. Reflects the direction as of 2026-09-06.
**Audience:** Anyone — human or agent — picking up work on this repo.

Read this before writing code. The implementation plans in `docs/superpowers/plans/` tell you *how*; this tells you *why*, and several decisions here will look arbitrary until you know the reasoning.

---

## 1. What this is

Lumaform Orb is a **WebGL exploration tool** for designing animated orbs — the kind of ambient, reactive visual an AI assistant uses to show what it's doing. It runs seventeen independent engines spanning wireframes, raymarchers, physical bodies, particles, membranes, and stateful simulations, all driven through one parameter schema and one render loop.

It is **not** a component library, not a runtime you embed, and not (yet) a design system. It is an instrument for finding out what's possible.

## 2. The question we are trying to answer

> **What movement makes an orb read as *thinking*?**

And by extension: listening, speaking, idle, interrupted, error. An AI-communication orb has one job — answer *what is the AI doing right now?* pre-attentively, in well under a second. That is a **legibility** problem, not a beauty problem.

The bet behind this tool is that the answer is discoverable but not yet known. Nobody on this project can currently write down what "thinking" looks like as a parameter set. So the tool's purpose is to find out by playing.

## 3. The central strategic decision: exploration before specification

This is the most important thing in this document.

There was a real fork early on. One path was to define a config schema up front — named states, transitions, versioning, an embeddable runtime — and build the tool to author against it. That path was **explicitly rejected**, for one reason:

> You cannot write a good "thinking" state until you have discovered what motion actually reads as thinking. Specifying first would freeze the vocabulary at whatever we had already stumbled into.

So the ordering is:

1. **Explore.** Build instruments that raise the rate of discovery — breeding, comparison, modulation, capture.
2. **Notice.** Keep the findings that land.
3. **Only then specify.** The state schema is the *residue* of exploration, not its input.

**Practical consequence for anyone working here:** if a proposal starts with "let's define the format for…", it is probably premature. Ask what it lets you *discover* first. The exception is anything needed to keep findings from being lost (see §4, capture).

## 4. What the tool needs to be good at

Four capabilities, in rough priority order:

**Variation throughput.** Tuning one orb one slider at a time is a terrible discovery rate. The tool should generate many candidates at once and let you steer toward the interesting ones. *(Built: the 3×3 variation grid — click to promote, shift-click to mark; mutation breadth and radius independently control how many parameters move and how far.)*

**Motion shape, not just motion speed.** Every engine natively drives motion as `rate × linearTime`, which means the only native axis is faster/slower. Character lives in *shape* — acceleration, hesitation, settle, irregularity. *(Built: the modulation rack — LFO / noise / envelope / live audio routed onto parameters and tempo.)*

**Comparison.** Motion cannot be judged from a still frame, and cannot be compared from memory. Two designs must be viewable against each other, ideally without the animation restarting. *(Built: the grid compares nine at once with per-cell clocks; `1`/`2` store two configs and `` ` `` swaps between them without rebuilding the engine, so the animation never restarts; `K` ladders one parameter across five cells.)*

**Capture.** Exploration produces a stream of near-misses and occasional hits. Without frictionless "keep this", exploration is amnesia. *(Built: JSON export of the current config and of marked grid cells, PNG snapshots, up to 30-second live canvas clips, and a thumbnail findings shelf. See §6 on what the config format is and isn't.)*

## 5. Architectural invariants

Break these and things fail in ways that are hard to trace. Each one exists because it already went wrong.

**No framework.** Vanilla JS, ES modules, Vite. The UI is built as HTML strings and DOM nodes. Adding React to drive a sidebar over a Three.js canvas is a large, invasive change with no rendering benefit. Most component libraries are therefore off the table — that is a known and accepted cost.

**Never reassign shared state containers.** `state`, `state.global`, and each `state.engines[<id>]` object are held by reference across `main.js`, `StudioUI` and `OrbStudio`. Reassigning any of them orphans the other holders. This exact bug made the variation grid breed from stale parameters after a randomize. Always `Object.assign` into the existing object. The `StudioUI` constructor is the only place `this.state` is ever assigned.

**Rate parameters must never be modulated directly.** Engines compute `angle = time × rate`. Changing a rate mid-flight retroactively rewrites the entire accumulated angle and the object visibly jumps. Tempo is shaped instead through the integrated `_timeScale` destination, which multiplies the delta before it is added to `virtualTime`. `listModulationTargets()` enforces this — use it rather than building your own destination list.

**Geometry-section parameters must never be modulated.** Several engines dispose and rebuild geometry on parameter change (`auris` `buildGeometry`, `polytope` `buildMeshes`, `tesseract` `LineGeometry`). Doing that at 60fps thrashes the GPU. Every such parameter lives in the `geometry` section, so excluding that section covers the class.

**Engines are interchangeable and self-disposing.** An engine is a factory returning `{ update, setParams | onParamsChange, dispose, onPulse?, onResize? }`. It owns its geometries and materials and must dispose all of them. Adding another engine should be one engine file plus small catalog, schema, registration, and optional preset edits — if it needs studio or UI changes, the abstraction has leaked.

**The studio is the single choke point.** `OrbStudio.renderFrame()` is the one place time advances and parameters reach the active engine. Anything that should affect every engine belongs there, not in each engine.

**Only the active engine's parameter bag is meaningful.** State holds a bag per engine. Snapshot, export and import must touch only `state.engines[state.engine]` — writing every bag would silently rewrite engines the user never opened.

**Chrome is layered, and the layer decides before the z-index does.** `.studio-ui-root` is positioned with a z-index and so forms a stacking context — a `z-index: 1000` inside it cannot outrank a `200` outside it. Inside the root are two layers: `overlayLayer` (never rewritten by `render()`, holds long-lived chrome, paints *below* the panel) and `panelLayer` (replaced wholesale on every `render()`). Mounting an overlay on `document.body` to survive `render()` puts it above the entire panel — that is what made the grid HUD cover the engine dropdown. Pick the layer first, then take a value from the scale declared in `:root` in `src/style.css`; only a full-screen dialog belongs at body level. `tests/layering.test.mjs` fails on any raw `z-index` literal.

**Every control must declare its own fill — never inherit the user agent's.** The UI is dark; browser defaults are light. A `<button>` with no `background`/`color` renders as a light-grey slab with black text, and when disabled it drops to near-black text on translucent grey, which is illegible here. `.btn-sm` had no fill and `.cp-delete-btn` had no rule at all, so both rendered as raw browser buttons (Arial, square, 2px border) until this was fixed. A disabled state needs an explicit `background` and `color`, not just `opacity`. Watch specificity when adding one: variant classes like `.btn-accent` are defined *earlier* in `src/style.css` than the `.btn-sm` base, which is why the base fill is scoped with `:not()` — and why the disabled rule has to repeat that chain to win.

**Bloom is a full-screen pass.** It bleeds across scissored cell boundaries, which is why grid cells render through a RenderPass+OutputPass composer with no bloom. Cells look flatter than the main view; that is deliberate, not a bug. Do not "fix" it without per-cell render targets.

## 6. What the export format is — and is not

Export currently emits `{ engine, global, params, modulation }`, and the grid emits an array of those.

**It is a lab notebook.** Its job is to stop good accidents from evaporating. It has no version field, no state vocabulary, and no guaranteed stability.

**It is not an interop contract.** Do not build anything that depends on its shape staying fixed, and do not add versioning or a published schema until §3's exploration phase has actually produced a vocabulary. When that happens the format will be redesigned around states and transitions, and the notebook files will be migrated or discarded.

**But it must round-trip.** A capture format you cannot load back is not a capture format. Import must restore everything export writes.

## 7. Decision log

| Decision | Rationale |
| --- | --- |
| Explore before specifying a state schema | Specifying first freezes the motion vocabulary at whatever we already stumbled into. See §3. |
| State names will be **open**, with a fixed set offered as a starter template | Designers will reach for this for loading indicators, brand idents, status lights — not just AI orbs. The format is "a named-state motion config"; AI communication is the first template, not the definition. |
| The runtime will be **name-agnostic** | `setState(name)` looks up a named parameter target and springs to it. It never needs to know "thinking" is special. This makes openness free architecturally and keeps the vocabulary a UI concern. |
| Modulation lives in app state, not just in the rack | So it round-trips through export and presets. A config that loses its motion is half a config. |
| Grid cells own their own patch **and their own clock** | Mutating parameters alone gives nine orbs that differ in colour and speed but share one motion character — the character lives in the routing. Per-cell clocks let a tempo route read as hesitation rather than an arbitrary phase offset. Cells still start together, so equal wall time has elapsed for each. |
| Cell 0 of the grid is always the unmutated parent | You need the reference in frame to judge the other eight. |
| Dead code archived, not deleted | `archive/` keeps `src/` readable while the six original demo files stay browsable. It is **tracked in git** — ignoring it would defeat the point. |
| No React, no component library | See §5. Most of the ecosystem's UI libraries are React-only and therefore unavailable. Accepted. |
| Shiki loaded via dynamic import | Importing it directly cost 355 kB in the main bundle for one snippet in one modal. |

## 8. Deliberately deferred

Not "forgotten" — actively decided against, for now.

- **The state schema and a `setState()` runtime.** Blocked on §3. This is the eventual destination, not the next step.
- **Video / WebM export.** A rendered loop per state ships everywhere with no WebGL cost, and may end up being the honest primary export for non-web targets. Premature until there are states to render.
- **Bloom in grid cells.** Needs per-cell render targets. See §5.
- **Re-rooting the tab IA on a state axis.** The current tabs are organised by parameter category, which is right for tuning one look and wrong for authoring behaviour. Correct eventually; premature now.

## 9. Open questions

These are genuinely unresolved. If your work bears on one, say so.

1. **Will anyone actually author behaviour?** The entire bet is that someone will sit down and define five states with transition curves. It is possible they just want one beautiful look and will let an engineer wire up a CSS fade. If that turns out true, the state machine is over-engineering and the real product is brand-colour ingestion plus a clean export. **This is the riskiest assumption in the project.**
2. **Can a designer ship without a frontend engineer?** If no, the primary export should be video and the tool aims at designers. If yes, it's a dev tool with a nice preview and the config should be a first-class visible object. Currently leaning toward the second.
3. **How much does grid fidelity matter?** Cells have no bloom and render at reduced march quality. Is that close enough to judge, or does it mislead?
4. **Does the tool need a picker for which parameter to sweep**, or is "the last one you touched" sufficient?

## 10. Working agreements

- **Verify, don't assert.** Claims about behaviour need a command and its output. Several bugs in this repo survived because something *looked* right.
- **Beware the hidden browser pane.** If the pane isn't displayed, `requestAnimationFrame` never fires, the render loop is frozen, and the app looks broken. `studio.fpsTracker.fps` still reports its default `60`, so it is not a liveness signal. Step frames manually with `studio.renderFrame()`.
- **CSS transitions are frozen too.** A hidden page produces no frames, so a transitioning property never advances and `getComputedStyle()` keeps returning the *starting* value indefinitely. Asserting on an animated property in a hidden pane produces confident, repeatable, wrong answers. Set `element.style.transition = 'none'` before measuring, or assert on the matching rule rather than the computed value.
- **`setTimeout` is clamped to ~1000 ms in a hidden pane**, so you cannot step frames in real time there. `await new Promise(r => setTimeout(r, 25))` between `studio.renderFrame()` calls actually advances a *full second* of `clock.getDelta()` per frame. Anything that integrates real milliseconds — the param tween, the rehearsal player — then races through whole cycles per frame and produces plausible-looking nonsense (a step-entered event on literally every frame). Inject the delta instead: `studio.clock.getDelta = () => 0.025`, step, then restore. This is the third form of the hidden-pane trap; assume there is a fourth.
- **Measure the fixture before believing the finding.** Two "bugs" in the review of the rehearsal sprint were bad fixtures: a param written directly to state below its schema `min` (import correctly clamped it), and a sequence whose first step targeted the value already on screen (so nothing moved). When a result looks wrong, instrument the thing you are measuring before reporting it.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No framework. Pure logic (mutation, modulation maths, config parsing) is extracted into DOM-free modules specifically so it can be tested this way. Keep doing that.
- **The build must pass:** `npx vite build`.
- **Commit in coherent slices** with messages that explain *why*, not just what changed.
- **Comments explain why.** The codebase is full of non-obvious constraints; a comment that restates the code is worse than none.
- **Placement comments move with the thing they describe.** Re-rooting or repositioning chrome means rewriting its placement comment in the same change; stale placement guidance can recreate the bug the move fixed.
- **Keyboard bindings and the map move together.** Every `e.code` shortcut in `main.js` or `studio-ui.js` needs a matching entry in `src/core/shortcuts.js`; `tests/shortcuts.test.mjs` scans both directions so hidden or stale bindings fail validation.
- **CSS guards check existence, not appearance.** `tests/css-hygiene.test.mjs` proves every emitted class has a rule and no rule is unreachable; `tests/layering.test.mjs` proves z-index values come from the `--z-*` scale. Neither proves a rule is *right* — a rule can be present, reachable and wrong. Screenshot comparison against the previous look is still the reviewer's job for any stylesheet change.

---

## Appendix: current capability inventory

| Area | State |
| --- | --- |
| Engines | 17 registered vocabularies: analytic wireframes, raymarchers, physical bodies, particles, membranes, and stateful simulations |
| Stateful motion | Murmuration, Curl Drift, Filament Lattice and Echo Rings carry bounded history so settle and propagation emerge from motion |
| Parameter schema | `ENGINE_PARAM_DEFINITIONS` in `src/core/state.js` — drives the entire UI |
| Parameter controls | Shared numeric rows with formatted and typed exact values, visible ranges, and one-click reset |
| Modulation | LFO / fbm noise / envelope / live mic or test tone → parameters and tempo; Motion Lab tab |
| Variation grid | 3×3, per-cell patch + clock, promote, mark, export |
| Capture | JSON export (config + marked cells), PNG snapshot, 30s live WebM/MP4 clip recording, localStorage presets, thumbnail findings gallery |
| Import | Single config or grid array; restores modulation; validates against the schema |
| A/B compare | Built — `1`/`2` store, findings can fill both slots, `` ` `` swaps without rebuilding the engine |
| Rehearsal room | Built — findings can be arranged, retimed and looped with per-step transitions to judge movement between configs |
| Parameter sweep | Built — `K` ladders one parameter across 5 cells |
| Section-locked mutation | Built — chips in the grid HUD |
| Mutation breadth | Built — attributable 1 / 3 / 6 / everything parameter breeding, independent patch breeding, and changed-key export metadata |
| Chrome layering | Two layers inside the root, named `--z-*` scale, guarded by `tests/layering.test.mjs` |
| Responsive | Breakpoints at 1280px (laptop) and 900px (phone) |
| Keyboard map | Built — `?` or the top-bar button opens the complete, source-scan-guarded shortcut inventory |
| Markup/CSS hygiene | Guarded — every emitted class carries a rule, no rule is unreachable (`tests/css-hygiene.test.mjs`); existence, not appearance, so visual review stays manual |
