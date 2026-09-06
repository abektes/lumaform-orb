# Lumaform Orb

A WebGL exploration tool for designing animated AI-assistant orbs. Eight shader engines, one parameter schema, one render loop.

**Read [docs/VISION.md](docs/VISION.md) before non-trivial work** — it explains what this is for and why several decisions that look arbitrary are not. Implementation plans live in `docs/superpowers/plans/`.

## Stack

Vanilla JS (ES modules), Vite 5, Three.js 0.160. **No framework** — the UI is HTML strings and DOM nodes. Runtime deps are `three` and `shiki`, nothing else.

```bash
npm run dev        # http://localhost:5173
npx vite build     # must pass
node tests/<name>.test.mjs   # plain Node scripts, no test framework
```

## The point of the project

We do not yet know what movement reads as "thinking" for an AI orb. This tool exists to find out by playing. **Exploration comes before specification** — proposals that start with "let's define the format for…" are usually premature. See VISION.md §3.

## Invariants — breaking these fails in hard-to-trace ways

- **Never reassign `state`, `state.global`, or `state.engines[<id>]`.** They are held by reference in `main.js`, `StudioUI` and `OrbStudio`; reassigning orphans the other holders. Always `Object.assign` into the existing object. This bug already shipped once.
- **Never modulate a rate parameter.** Engines compute `angle = time × rate`, so changing a rate mid-flight rewrites the accumulated angle and the object jumps. Shape tempo through the integrated `_timeScale` destination instead.
- **Never modulate a `geometry`-section parameter.** Several engines rebuild geometry on change; at 60fps that thrashes the GPU. Use `listModulationTargets()` — it already excludes both classes.
- **Only touch the active engine's parameter bag** (`state.engines[state.engine]`). Writing all eight silently rewrites engines the user never opened.
- **Engines self-dispose.** A factory returns `{ update, setParams | onParamsChange, dispose }` and must dispose every geometry and material it created.
- **Grid cells have no bloom on purpose.** It is a full-screen pass and bleeds across scissored cells.

## Verification

- **Claims need evidence.** Run the command, show the output. Several bugs here survived because something looked right.
- **The hidden browser pane trap:** if the Browser pane is not displayed, `requestAnimationFrame` never fires and the render loop is frozen — the app looks broken but isn't. `studio.fpsTracker.fps` still reports its default `60`, so it is not a liveness signal. Step frames manually with `studio.renderFrame()`.
- `window.__orb = { studio, state, ui }` is exposed for console-driven checks.

## Conventions

2-space indent, single quotes, semicolons. Comments explain **why**, not what — this codebase is full of non-obvious constraints and a comment restating the code is worse than none.
