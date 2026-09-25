# Lumaform Orb

A WebGL exploration tool for designing animated AI-assistant orbs — the kind of ambient, reactive visual an assistant uses to show what it is doing. Twenty-three shader engines, one parameter schema, one render loop.

It is **not** a component library and not a design system. It is an instrument for finding out what is possible.

The repo is two workspaces: `packages/studio` is that instrument, and `packages/orb` is the runtime it renders through. The runtime is published on npm as [`@lumaform/orb`](https://www.npmjs.com/package/@lumaform/orb); it is pre-1.0, so its API may still change — see [Status](#status).

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

Tests are plain Node scripts with no framework — pure logic (mutation maths, modulation, config parsing, palettes) is deliberately extracted into DOM-free modules so it can be run this way. There are 56 of them, 28 covering the runtime and 28 the studio.

## Stack

Vanilla JS (ES modules), Vite 5, Three.js 0.160. **No framework** — the UI is built from HTML strings and DOM nodes. Runtime dependencies are `three` and `shiki`, and nothing else. That constraint is intentional and explained in [docs/VISION.md](docs/VISION.md) §5.

## The engines

Each is a self-contained factory that builds into a scene it is handed, animates from a clock it is handed, and disposes everything it creates.

| Engine | Character | Params |
| --- | --- | --- |
| `tesseract` — 4D Tesseract | Hypercube projection | 19 |
| `moire` — Chiral Moiré | Optical string art | 19 |
| `auris` — Auris Light | Sacred crystallography | 18 |
| `hopf` — Hopf Fibration | Clifford torus | 11 |
| `polytope` — Sacred Polytope | Merkabah & Kepler star | 12 |
| `nebula` — Gyroid Nebula | Volumetric raymarching | 13 |
| `quantum` — Quantum Lattice | 4D hyper-fractal | 13 |
| `singularity` — Chrono Singularity | Relativistic black hole | 13 |
| `flux` — Flux Ribbon | Travelling wave | 19 |
| `aqueous` — Aqueous | Refractive body | 17 |
| `curldrift` — Curl Drift | Advected flow | 17 |
| `murmuration` — Murmuration | Emergent swarm | 18 |
| `filament` — Filament Lattice | Spring network | 14 |
| `prismbloom` — Prism Bloom | Crystalline flora | 14 |
| `coronaveil` — Corona Veil | Aurora membrane | 16 |
| `echorings` — Echo Rings | Signal memory | 16 |
| `ferrotrails` — Ferro Trails | Magnetic fluid & arc trails | 18 |
| `chromasphere` — Chromasphere | Liquid chrome | 20 |
| `vocalis` — Vocalis | Vocal diaphragm | 20 |
| `aetheria` — Aetheria | Iridescent luminescence | 14 |
| `superposition` — Superposition | Quantum wavepacket | 14 |
| `synthesis` — Synthesis | Harmonic fluid fusion | 15 |
| `regard` — Regard | Attentive gaze — the one engine with a front | 16 |

Load any of them directly with `?engine=<id>`, e.g. `http://localhost:5173/?engine=chromasphere`.

Five are **stateful** — Murmuration, Curl Drift, Filament Lattice, Echo Rings and Regard carry bounded history, so settle, overshoot, propagation and hesitation emerge from the simulation rather than being painted on. The rest compute their pose as a function of time.

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

86 curated presets ship across the engines.

## Using the microphone

Motion Lab → **Mic** (or **Test Tone** if you just want to see it work). Enabling either seeds one `audio1 → Tempo` route if you have no audio route yet, so the orb reacts immediately; retarget or delete it in the rack like any other route. Audio needs a user gesture, so the browser will not start it from a page load.

**The audio never leaves the page.** The signal goes to a Web Audio `AnalyserNode`, is reduced to a single amplitude number per frame, and is never recorded, stored or transmitted. There is no backend to send it to. Denying the permission is handled as a normal outcome, not an error — the orb keeps running and audio routes stay inert. See [SECURITY.md](SECURITY.md).

## Using the runtime in your own app

The studio is one consumer of `@lumaform/orb`; your app can be another, through
the same API the studio uses. **[docs/GUIDE.md](docs/GUIDE.md)** walks through it
step by step, from exporting a look in the studio to reacting to your assistant's
voice, and [examples/embed](examples/embed) is the runnable version.

```bash
npm install @lumaform/orb three
```

```js
import { createOrb } from '@lumaform/orb';
import { nebula } from '@lumaform/orb/engines';

const orb = createOrb(document.querySelector('#orb'), {
  engines: { nebula },
  config,            // a JSON config exported from the studio's Export tab
});
```

That is the whole happy path: `createOrb` constructs the runtime, registers the
engines you handed it, reads the config, and starts its own loop. `orb.stop()`
and `orb.start()` pause and resume without a jump, `orb.loadConfig(next)` swaps
to another look, and `orb.dispose()` releases the GPU resources and removes only
the canvas it added.

**You import the engines you want.** `createOrb` never reaches for the catalog's
factories, and catalog entries name theirs as a string rather than binding it, so
reading a parameter schema does not drag in all twenty-three engines and their
geometry. The import list is the bundle: name one engine, ship one engine.

Defaults are the embed's, not the studio's — no drag-to-rotate, no auto-rotation,
no preserved drawing buffer, and the canvas is sized from the container with a
`ResizeObserver` rather than from the window. Opt in when you want them:

```js
createOrb(el, { engines: { nebula }, controls: true, autoRotate: true });
```

Audio is deliberately not a flag. `import` from `@lumaform/orb/audio` to capture
a microphone, or hand `orb.setAudioSource()` any object exposing `read() → 0..1`
and `isActive`. Your assistant's own speech becomes one in a few lines with that
subpath's helpers; [docs/GUIDE.md](docs/GUIDE.md#your-assistants-voice) has the
recipe. Not importing that subpath is the off switch: no `getUserMedia` in the
bundle and nothing for a security review to flag.

For a host that wants to own its own frame loop, construct `OrbRuntime` directly
and call `advance(delta)` and then `render()` yourself. That is exactly what the
studio does.

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
      create-orb.js        createOrb — construct, register, load a config, run
      engine-catalog.js    the one engine list; types, info, schema (no factories)
      internal/            building blocks the studio shares; not semver-stable
      catalog/             grouped catalog entries
      engines/             one file per engine; index.js is the generated barrel
      audio/               microphone capture, behind the ./audio subpath
      shared/              pointer tracking, fps
  studio/                  the exploration tool
    src/
      main.js              composition root; constructs exploration sessions
      core/studio.js       OrbStudio — owns the frame loop, adds the instrument
      core/register-engines.js  pairs catalog ids with the engines barrel
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
  GUIDE.md                 using @lumaform/orb in an app, from studio export to audio
  RELEASING.md             how a version reaches npm: the checklist
  RELEASE-FLOW.md          the whole flow from branch to npm, explained
  VISION.md                why this exists and why several decisions are not arbitrary
  ENGINE-AUTHORING.md      the engine contract
  engine-briefs/           proposed engines
examples/
  embed/                   the guide, runnable: npx vite examples/embed
```

**The runtime never calls a studio method directly.** `OrbRuntime` owns no frame
loop and declares no hooks. It exposes `advance(delta)`, `render()` and
`tick(delta)`; the studio runs its own `requestAnimationFrame`, does its
rehearsal and tween work, calls `advance()`, then either renders the variation
grid or calls `render()`. Nothing calls down, so reaching for `this.grid` or
`this.paramTween` from a runtime method is not something the design permits
rather than something reviewers have to catch.
`packages/studio/tests/runtime-seam.test.mjs` loads both classes and compares
their prototypes: the studio may not override a runtime method except `dispose`.

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

## Deploying

The studio builds to a static site: `npm run build` writes it to `packages/studio/dist`, and any static host can serve that folder. No server, no environment variables.

The public demo runs on [Railway](https://railway.com), whose Railpack builder only recognises a Vite site when Vite is declared in the **root** `package.json`. In this workspace it lives in `packages/studio`, so detection misses it and the build fails with "No start command detected". The service therefore sets one variable:

```bash
RAILPACK_SPA_OUTPUT_DIR=packages/studio/dist
```

It has to be a service variable rather than a `railpack.json` entry — Railpack reads it from the environment only. It is not a secret.

Every merge to `main` redeploys the studio automatically. Releasing the runtime to npm is separate: merging never publishes, and pushing a version tag does. See [docs/RELEASING.md](docs/RELEASING.md).

## Status

This is an exploration instrument in active use, not a released product. The export format is a lab notebook: it round-trips and it carries a `version` field, but it has no stability guarantee, and it will be redesigned around named states once exploration has actually produced a vocabulary. Don't build anything on its shape yet — the version field exists so that redesign can migrate your files rather than break them, not to promise the shape will hold. See [docs/VISION.md](docs/VISION.md) §6.

The runtime, [`@lumaform/orb`](https://www.npmjs.com/package/@lumaform/orb), is published on npm and is pre-1.0: a minor release may break its API. [packages/orb/CHANGELOG.md](packages/orb/CHANGELOG.md) lists what each version contains, and [docs/RELEASING.md](docs/RELEASING.md) is the checklist for the next one.

## Privacy

No backend, no accounts, no telemetry by default. Configurations, findings and custom presets live in `localStorage` on your machine. Microphone audio never leaves the page. Analytics load only when `VITE_GA_ID` is set at build time — unset in this repository, so a clone or fork makes no analytics requests at all. See [.env.example](.env.example) and [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Read [docs/VISION.md](docs/VISION.md) first for anything non-trivial — the most common way a well-intentioned change gets rejected is that it optimises for a goal this project does not have.

## License

MIT — see [LICENSE](LICENSE).
