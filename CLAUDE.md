# Lumaform Orb

A WebGL exploration tool for designing animated AI-assistant orbs. Twenty-three engines, one parameter schema, one render loop.

**Read [docs/VISION.md](docs/VISION.md) before non-trivial work** — it explains what this is for and why several decisions that look arbitrary are not. Implementation plans live in `docs/superpowers/plans/`.

**Adding an engine?** [docs/ENGINE-AUTHORING.md](docs/ENGINE-AUTHORING.md) is the full contract — factory shape, one catalog entry, schema rules, and the verification checklist. Proposed engines live in [docs/engine-briefs/](docs/engine-briefs/).

## Stack

Vanilla JS (ES modules), Vite 5, Three.js 0.160. **No framework** — the UI is HTML strings and DOM nodes. Runtime deps are `three` and `shiki`, nothing else.

Two npm workspaces: `packages/orb` (`@lumaform/orb`, the runtime — engines, catalog, modulation, framing, config I/O, the frame loop) and `packages/studio` (the instrument — UI, grid, capture, rehearsal, presets). `three` is a peer dependency of the runtime.

```bash
npm run dev        # http://localhost:5173
npm run build      # must pass
npm test           # every packages/*/tests/*.test.mjs
node packages/orb/tests/<name>.test.mjs      # one suite; plain Node, no framework
```

## The point of the project

We do not yet know what movement reads as "thinking" for an AI orb. This tool exists to find out by playing. **Exploration comes before specification** — proposals that start with "let's define the format for…" are usually premature. See VISION.md §3.

## Invariants — breaking these fails in hard-to-trace ways

- **The store owns state.** Read `store.state`. Write through store methods (`patchEngine`, `patchGlobal`, `setEngine`, …). Never replace `state`, `state.global`, or a `state.engines[<id>]` bag.
- **Never modulate a rate parameter.** Engines compute `angle = time × rate`, so changing a rate mid-flight rewrites the accumulated angle and the object jumps. Shape tempo through the integrated `_timeScale` destination instead.
- **Never modulate a `geometry`-section parameter.** Several engines rebuild geometry on change; at 60fps that thrashes the GPU. Use `listModulationTargets()` — it already excludes both classes.
- **Only touch the active engine's parameter bag** (`state.engines[state.engine]`). Writing all eight silently rewrites engines the user never opened.
- **Engines self-dispose.** A factory returns `{ update, setParams, dispose, onPulse?, onResize? }`. The studio dispatches only those names through `notifyEngine`. Dispose every geometry and material the factory created.
- **Grid cells have no bloom on purpose.** It is a full-screen pass and bleeds across scissored cells.
- **Chrome layering beats z-index.** `.studio-ui-root` forms a stacking context. Session chrome mounts on `ui.root` (overlay tokens below panel tokens). `render()` rewrites inspector tab content only. Full-screen dialogs go on `ui.container`. Take values from the `--z-*` scale in `:root`; `layering.test.mjs` rejects raw literals.
- **Controls must declare their own `background` and `color`**, disabled states included. The UI is dark and browser defaults are light — a button with no fill renders as a light-grey slab, and a disabled one becomes illegible. `opacity` alone is not a disabled state.
- **Every `e.code` binding needs an entry in `packages/studio/src/core/shortcuts.js`.** `shortcuts.test.mjs` scans both files and fails in either direction.
- **User-typed text must be escaped before it reaches `innerHTML`.** Custom preset names and finding notes are typed by the user and persisted; interpolating them raw is both self-XSS and a plain break — a name containing `"` closes the `data-` attribute early and the preset becomes unloadable. Use `escapeHtml` from `packages/studio/src/ui/studio-format.js`; `markup-escaping.test.mjs` covers the preset paths.
- **The runtime never calls a studio method directly.** `OrbRuntime` (`packages/orb/src/core/runtime.js`) owns no frame loop and declares no hooks. It exposes `advance(delta)`, `render()` and `tick(delta)`; the studio runs its own `requestAnimationFrame`, does its rehearsal and tween work, calls `advance()`, then either renders the grid or calls `render()`. Nothing calls down. This replaced five template-method hooks whose defaults were inert — one returned a value only the override read, and two studio mixins ended up talking to each other through the parent. `runtime-seam.test.mjs` loads both classes and compares prototypes: the studio may not override a runtime method except `dispose`, an ordinary lifecycle chain.
- **The runtime takes one engine's params, never a store.** `mountEngine(type, { params, global, modulation })` and `applyParams({ … })`. Indexing `state.engines[type]` inside the runtime made the studio's store shape part of the published API.
- **Nothing in `packages/orb` may import from `packages/studio`.** The dependency runs one way. If a runtime module seems to need something from the studio, the seam is drawn wrong — give the runtime a primitive the host can call, never a hook it calls down through.

## Verification

- **Claims need evidence.** Run the command, show the output. Several bugs here survived because something looked right.
- **The hidden browser pane trap:** if the Browser pane is not displayed, `requestAnimationFrame` never fires and the render loop is frozen — the app looks broken but isn't. `studio.fpsTracker.fps` still reports its default `60`, so it is not a liveness signal. Step frames manually with `studio.renderFrame()`.
- **`setTimeout` is clamped to ~1000 ms in a hidden pane.** Sleeping between `renderFrame()` calls advances a full second of `clock.getDelta()` per frame, so anything integrating real milliseconds (param tween, rehearsal player) races through whole cycles and reports plausible nonsense. Inject the delta instead: `studio.clock.getDelta = () => 0.025`, step, restore.
- **CSS transitions are frozen too** — `getComputedStyle()` returns the starting value forever. Set `element.style.transition = 'none'` before measuring, and assert on the element that carries the rule (an ancestor's `opacity: 0` does not change a descendant's computed value).
- **Check your fixture before reporting a bug.** Writing a param straight to state can put it outside its schema range, and import will legitimately clamp it — that reads as a round-trip bug and isn't one.
- `window.__orb = { studio, state, ui, ab }` is exposed for console-driven checks.

## Conventions

2-space indent, single quotes, semicolons. Comments explain **why**, not what — this codebase is full of non-obvious constraints and a comment restating the code is worse than none.
