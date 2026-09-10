# Lumaform Orb

A WebGL exploration tool for designing animated AI-assistant orbs — the kind of ambient, reactive visual an assistant uses to show what it is doing. Twenty-two shader engines, one parameter schema, one render loop.

It is **not** a component library and not a design system. It is an instrument for finding out what is possible.

The repo is two workspaces: `packages/studio` is that instrument, and `packages/orb` is the runtime it renders through. The runtime is not published yet and its API is not stable — see [Status](#status).

---

## The question it exists to answer

> **What movement makes an orb read as *thinking*?**

And by extension: listening, speaking, idle, interrupted, error. An AI-communication orb has one job — answer *what is the AI doing right now?* pre-attentively, in well under a second. That is a **legibility** problem, not a beauty problem.

Nobody on this project can currently write down what "thinking" looks like as a parameter set. So the tool exists to find out by playing. **Exploration comes before specification** — see [docs/VISION.md](docs/VISION.md) §3 for why that ordering is deliberate and what it rules out.

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

```bash
npm run build
```

```bash
npm test
```

Tests are plain Node scripts with no framework — pure logic (mutation maths, modulation, config parsing, palettes) is deliberately extracted into DOM-free modules so it can be run this way. There are 38 of them, 15 covering the runtime and 23 the studio.

## Stack

Vanilla JS (ES modules), Vite 5, Three.js 0.160. **No framework** — the UI is built from HTML strings and DOM nodes. Runtime dependencies are `three` and `shiki`, and nothing else. That constraint is intentional and explained in [docs/VISION.md](docs/VISION.md) §5.

## The engines

Each is a self-contained factory that builds into a scene it is handed, animates from a clock it is handed, and disposes everything it creates.

| Engine | Character | Params |
| --- | --- | --- |
| `tesseract` — 4D Tesseract | Hypercube projection | 18 |
| `moire` — Chiral Moiré | Optical string art | 19 |
| `auris` — Auris Light | Sacred crystallography | 18 |
| `hopf` — Hopf Fibration | Clifford torus | 11 |
| `polytope` — Sacred Polytope | Merkabah & Kepler star | 12 |
| `nebula` — Gyroid Nebula | Volumetric raymarching | 13 |
| `quantum` — Quantum Lattice | 4D hyper-fractal | 13 |
| `singularity` — Chrono Singularity | Relativistic black hole | 13 |
| `flux` — Flux Ribbon | Travelling wave | 19 |
| `aqueous` — Aqueous | Refractive body | 17 |
| `curldrift` — Curl Drift | Advected flow | 14 |
| `murmuration` — Murmuration | Emergent swarm | 16 |
| `filament` — Filament Lattice | Spring network | 14 |
| `prismbloom` — Prism Bloom | Crystalline flora | 14 |
| `coronaveil` — Corona Veil | Aurora membrane | 14 |
| `echorings` — Echo Rings | Signal memory | 14 |
| `ferrotrails` — Ferro Trails | Magnetic fluid & arc trails | 18 |
| `chromasphere` — Chromasphere | Liquid chrome | 20 |
| `vocalis` — Vocalis | Vocal diaphragm | 16 |
| `aetheria` — Aetheria | Iridescent luminescence | 14 |
| `superposition` — Superposition | Quantum wavepacket | 14 |
| `synthesis` — Synthesis | Harmonic fluid fusion | 15 |

Load any of them directly with `?engine=<id>`, e.g. `http://localhost:5173/?engine=chromasphere`.

Roughly half are **stateful** — Murmuration, Curl Drift, Filament Lattice and Echo Rings carry bounded history, so settle, overshoot and propagation emerge from the simulation rather than being painted on. The rest compute their pose as a function of time.

## What the tool is good at

Four capabilities, in rough priority order.

**Variation throughput.** Tuning one orb one slider at a time is a terrible discovery rate. `G` opens a 3×3 grid of mutations — click to promote, shift-click to mark. Mutation breadth and radius control how many parameters move and how far, independently.

**Motion shape, not just motion speed.** Every engine drives motion as `rate × time`, so the only native axis is faster/slower. Character lives in *shape*. The Motion Lab routes LFO / fbm noise / envelope / live microphone onto parameters and onto tempo.

**Comparison.** Motion cannot be judged from a still frame or compared from memory. `1` and `2` store two configs and `` ` `` swaps between them **without rebuilding the engine**, so the animation never restarts. `K` ladders one parameter across five cells.

**Capture.** Exploration produces a stream of near-misses and occasional hits; without frictionless "keep this", exploration is amnesia. JSON export, PNG snapshots, 30-second WebM/MP4 clips, and a thumbnail findings shelf.

## Keyboard

Press `?` in the app for the live, source-verified list. Every binding is checked in both directions by `tests/shortcuts.test.mjs`, so this table cannot drift from the code.

| | |
| --- | --- |
| **Playback** | `Space` play/pause · `P` rehearsal loop · `H` zen mode · `Esc` close dialog · `?` shortcuts |
| **Explore** | `R` randomize · `G` variation grid · `K` sweep strip |
| **Compare** | `1` store slot A · `2` store slot B · `` ` `` swap A↔B · `D` swap duration · `F` swap curve |
| **Capture** | `C` keep as finding · `S` PNG snapshot · `V` record clip |
| **Grid** | `M` mutation radius · `B` parameters varied · `T` re-trigger envelopes · `E` export marked cells |

## Panel

Eleven tabs: Presets, Findings, Rehearsal, Colors, Geometry, Motion, Motion Lab, Optics, Space, Export, Perf.

Colors, Geometry and Motion are generated entirely from each engine's schema — there is no per-engine control code. An engine's `section` assignment is a behavioural declaration, not a tab name: `geometry` means "may rebuild geometry, therefore never modulated". See [docs/ENGINE-AUTHORING.md](docs/ENGINE-AUTHORING.md) §3.

83 curated presets ship across the engines.

## Using the microphone

Motion Lab → **Mic** (or **Test Tone** if you just want to see it work). Enabling either seeds one `audio1 → Tempo` route if you have no audio route yet, so the orb reacts immediately; retarget or delete it in the rack like any other route. Audio needs a user gesture, so the browser will not start it from a page load.

**The audio never leaves the page.** The signal goes to a Web Audio `AnalyserNode`, is reduced to a single amplitude number per frame, and is never recorded, stored or transmitted. There is no backend to send it to. Denying the permission is handled as a normal outcome, not an error — the orb keeps running and audio routes stay inert. See [SECURITY.md](SECURITY.md).

## Project layout

Two npm workspaces. **`packages/orb`** is the runtime — everything needed to
render a config. **`packages/studio`** is the instrument built on top of it.

```
packages/
  orb/                     the runtime
    src/
      core/runtime.js      OrbRuntime — the frame loop, the single place time advances
      core/modulation.js   LFO / noise / envelope / audio → parameters and tempo
      core/framing.js      derives camera distance from each engine's declared radius
      core/config-io.js    versioned config parse, migrate, sanitize
      core/engine-notify.js  setParams / onPulse / onResize dispatch
      engine-catalog.js    the one engine list; types, info, schema, factories
      catalog/             grouped catalog entries
      engines/             one file per engine; index.js is the generated barrel
      audio/               microphone capture, behind the ./audio subpath
      shared/              pointer tracking, fps
  studio/                  the exploration tool
    src/
      main.js              composition root; constructs exploration sessions
      core/studio.js       OrbStudio — extends OrbRuntime, adds the instrument
      core/studio-grid.js  variation grid and parameter sweep
      core/studio-capture.js   clip recording and snapshots
      core/studio-sequence.js  rehearsal playback
      core/state.js        initial state, randomize, custom presets
      core/store.js        single owner of the live state object
      core/variation-grid.js   nine independent engine instances, one renderer
      core/palette.js      schema-driven colour harmonies
      …                    sweep, sequence, findings, param tween, clip recording
      ui/                  studio-ui.js, tab modules, exploration sessions
      styles/              CSS surfaces; style.css is the barrel
      presets/             curated looks; preset-library.js is the barrel
  */tests/                 plain Node scripts, no framework
docs/
  VISION.md                why this exists and why several decisions are not arbitrary
  ENGINE-AUTHORING.md      the engine contract
  engine-briefs/           proposed engines
```

**The runtime never calls a studio method directly.** `OrbRuntime` declares five
hooks — `onEngineWillChange`, `onEngineDidChange`, `advanceTimeline`,
`renderOverride`, `onDispose` — with inert defaults, and `OrbStudio` overrides
them. Reaching into `this.grid` or `this.paramTween` from a runtime method
breaks the package for anyone who is not the studio, and it breaks at frame time
inside `requestAnimationFrame`. `packages/studio/tests/runtime-hooks.test.mjs`
checks this in both directions.

## Adding an engine

One engine file plus one catalog entry. [docs/ENGINE-AUTHORING.md](docs/ENGINE-AUTHORING.md) is the full contract — factory shape, the catalog, schema rules, the six contexts an engine has to survive, and the verification checklist. If your change is bigger than that, the abstraction has leaked; say so rather than routing around it.

## Working in this repo

A few constraints break in hard-to-trace ways. The full list is in [CLAUDE.md](CLAUDE.md) and [docs/VISION.md](docs/VISION.md) §5, but the ones that bite first:

- **Never reassign `state`, `state.global`, or `state.engines[<id>]`.** They are held by reference across `main.js`, `StudioUI` and `OrbStudio`. Always `Object.assign` into the existing object.
- **Never modulate a rate parameter.** Engines compute `angle = time × rate`, so changing a rate mid-flight rewrites the accumulated angle and the object jumps. Shape tempo through the integrated `_timeScale` destination.
- **Engines self-dispose.** A factory owns every geometry and material it creates.
- **Grid cells have no bloom on purpose.** It is a full-screen pass and bleeds across scissored cells.
- **Verify, don't assert.** Claims about behaviour need a command and its output. Several bugs here survived because something *looked* right.

One trap worth knowing before you debug anything visual: **if the browser pane is not displayed, `requestAnimationFrame` never fires** and the render loop is frozen — the app looks broken but isn't. `studio.fpsTracker.fps` still reports its default `60`, so it is not a liveness signal. Step frames manually with `studio.renderFrame()`, and inject the delta (`studio.clock.getDelta = () => 0.025`) rather than sleeping, because `setTimeout` is clamped to ~1000 ms in a hidden pane.

`window.__orb = { studio, state, ui, ab }` is exposed for console-driven checks.

## Status

This is an exploration instrument in active use, not a released product. The export format is a lab notebook: it round-trips and it carries a `version` field, but it has no stability guarantee, and it will be redesigned around named states once exploration has actually produced a vocabulary. Don't build anything on its shape yet — the version field exists so that redesign can migrate your files rather than break them, not to promise the shape will hold. See [docs/VISION.md](docs/VISION.md) §6.

## Privacy

No backend, no accounts, no telemetry by default. Configurations, findings and custom presets live in `localStorage` on your machine. Microphone audio never leaves the page. Analytics load only when `VITE_GA_ID` is set at build time — unset in this repository, so a clone or fork makes no analytics requests at all. See [.env.example](.env.example) and [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Read [docs/VISION.md](docs/VISION.md) first for anything non-trivial — the most common way a well-intentioned change gets rejected is that it optimises for a goal this project does not have.

## License

MIT — see [LICENSE](LICENSE).
