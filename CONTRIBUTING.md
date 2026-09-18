# Contributing

## Setup

```bash
npm install
```

```bash
npm run dev
```

## Before opening a pull request

```bash
npm test
```

```bash
npm run build
```

Both must pass. CI runs both, plus `npm run verify:package` — which packs
`@lumaform/orb`, installs the tarball into a scratch project and imports every
subpath it declares. Run that one yourself if you touched the runtime package's
manifest, its `exports` map or its `files` list; a packaging mistake is
otherwise invisible until after publish.

## Adding an engine

[docs/ENGINE-AUTHORING.md](docs/ENGINE-AUTHORING.md) is the full contract —
factory shape, the single catalog entry, schema rules, the six contexts an engine
has to survive, and the verification checklist. One engine file plus one catalog
entry. If your change needs more than that, the abstraction has leaked; say so in
the pull request rather than routing around it.

Ideas for engines that do not exist yet live in
[docs/engine-briefs/](docs/engine-briefs/).

## Read this first for anything non-trivial

[docs/VISION.md](docs/VISION.md) explains what this tool is for and why several
decisions that look arbitrary are not. The most common way a well-intentioned
change gets rejected is that it optimises for a goal the project does not have.

## Constraints that break in hard-to-trace ways

The full list is in [CLAUDE.md](CLAUDE.md). These are the ones that bite first:

- **The store owns state.** Read `store.state`, write through store methods.
  Never reassign `state`, `state.global`, or `state.engines[<id>]` — they are held
  by reference across `main.js`, `StudioUI` and `OrbStudio`.
- **Never modulate a rate parameter.** Engines compute `angle = time × rate`, so
  changing a rate mid-flight rewrites the accumulated angle and the object jumps.
  Shape tempo through the integrated `_timeScale` destination instead.
- **Never modulate a `geometry`-section parameter.** Several engines rebuild
  geometry on change, and at 60fps that thrashes the GPU.
- **Engines self-dispose.** A factory owns every geometry and material it creates.
- **Controls must declare their own `background` and `color`,** disabled states
  included. The UI is dark and browser defaults are light.
- **Every `e.code` binding needs an entry in `src/core/shortcuts.js`.**
  `tests/shortcuts.test.mjs` checks both directions.
- **User-typed text must be escaped before it reaches `innerHTML`.** Use
  `escapeHtml` from `src/ui/studio-format.js`; `tests/markup-escaping.test.mjs`
  covers the preset paths.

## Verification

Claims need evidence. Run the command and show the output in the pull request.
Several bugs here survived review because something looked right.

One trap worth knowing before debugging anything visual: **if the browser tab is
not displayed, `requestAnimationFrame` never fires** and the render loop is
frozen — the app looks broken but isn't. `studio.fpsTracker.fps` still reports its
default `60`, so it is not a liveness signal. Step frames manually with
`studio.renderFrame()`, and inject the delta (`studio.clock.getDelta = () =>
0.025`) rather than sleeping, because `setTimeout` is clamped to ~1000 ms in a
hidden tab.

`window.__orb = { studio, state, ui, ab }` is exposed for console-driven checks.

## Style

2-space indent, single quotes, semicolons. Comments explain **why**, not what.
This codebase is full of non-obvious constraints, and a comment restating the
code is worse than none.
