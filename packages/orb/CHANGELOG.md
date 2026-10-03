# Changelog

All notable changes to `@lumaform/orb` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package follows [Semantic Versioning](https://semver.org/) with the usual pre-1.0 rule: **a minor release may break the API**; a patch release will not. `@lumaform/orb/internal` is outside semver entirely, as its header says.

Changes land under `[Unreleased]` as they merge; [docs/RELEASING.md](https://github.com/abektes/lumaform-orb/blob/main/docs/RELEASING.md) turns that section into a version.

## [Unreleased]

### Added

- Twenty-two engines on `@lumaform/orb/engines`, for 45 in all: `silkwarp`, `kaleido`, `veil`, `mosaic`, `kaliset`, `scrolldome`, `nacre`, `quantplasma`, `beads`, `radar`, `ledbox`, `quanttorus`, `chladni`, `phyllotaxis`, `harmonograph`, `attractor`, `maurer`, `inkmarble`, `lavalamp`, `truchet`, `caustics` and `superbloom`. Most are patterns on a shaded sphere or disc, from classical constructions (Chladni figures, phyllotaxis, harmonographs, the Clifford attractor, Maurer roses, suminagashi marbling, Truchet tiles, the Gielis superformula); `ledbox` and `quanttorus` are raymarched solids.
- Config version 2. A config can carry named `states`, each a patch over its `params` with its own `tempo`, plus `initialState` and `transition` (`durationMs`, `easing`). A state may change only parameters that can be eased safely: rates, `geometry` parameters and selects are dropped on load and listed in `dropped`. Version 1 files load unchanged; a version 2 file is refused by 0.2 with an error naming both versions. `sanitizeStates` is exported.
- `setState(name)` on `OrbRuntime` and on the handle `createOrb` returns. It eases toward a named state from the config (default 600 ms, `easeInOut`; override per call), including the state's `tempo`. An interrupted transition starts from what is on screen. An unknown name warns and returns `false`. `state` and `states` report the current state and the names available.
- `createOrb(el, { template, state })`. A template carries its engine and a config with states; `state` picks where it starts. `loadConfig(config, { state })` takes the same option.
- Five finishing settings in a config's `global`: `contrast` (0.5–2), `saturation` (0–2), `grain` (0–0.15), `edgeFade` (0–1, a soft falloff around the framed orb) and `lightCoverage` (0–1, transparent backgrounds only: lets glow show on a light page instead of vanishing into it). All default to no change, and the pass costs nothing until one moves.

### Fixed

- `auris` released its geometry but not its two materials each time a `geometry` parameter rebuilt it, so every archetype or scale change left a shader material and a line material behind.
- `polytope` never released its core sphere after a `coreRadius` change: `dispose()` freed the original sphere, which the change had already replaced.

## [0.2.0] - 2026-09-25

### Added

- A `pixelRatio` option for `createOrb` and `OrbRuntime`, to choose the render density yourself.
- `echorings` pings on its own and remembers. `pingRate` (Spontaneous Pings, default 0.18 a second) sends an echo on a fixed schedule, so the orb is alive without clicks. `memoryHold` (default 10 s) makes a resting ring swing onto each wavefront at its widest and hold it, so the ring stack records the recent pulses. Set either to 0 for the old behaviour.
- `murmuration` gathers. `gathering` (default 0.45) draws the flock toward three roosts that wander over the shell, so it condenses into clouds that travel, merge and split, where local flocking alone spread it evenly over the shell. Set it to 0 for the old behaviour.
- `vocalis` has a **Mouth** switch (`mouth`: `on` or `off`). Off hides the glottal slit entirely, leaving the rings around an empty centre, for an orb without a face.
- [A guide](https://github.com/abektes/lumaform-orb/blob/main/docs/GUIDE.md) from a look designed in the studio to an orb in your app, including how to drive it from your assistant's voice, and a runnable example in `examples/embed`.

### Fixed

- `superposition` draws its orbitals. Every sample sat on one of two fixed Fibonacci shells, so every state read as a dotted sphere around a wireframe ball. Samples now fill the lobes of the state (the sp dumbbell, the d clover, the f octupole, the chiral crescent), coloured by the wave's sign, around a soft glowing nucleus. `coherence` did nothing; it now scales the interference between the two states, so at 0 they stop beating. A click is a measurement: the cloud falls onto one spot, chosen with the probabilities it shows, then spreads back out.
- An orb in a portrait container fits its width. Framing used only the vertical field of view, so a view narrower than it is tall (a phone held upright, a tall sidebar) put the orb past both sides. Resizing now re-frames too, keeping any zoom the viewer set.
- The orb renders at the device's pixel density, capped at 2. It used to render at 1 on every screen unless a config said otherwise, which looked soft on high-density displays.
- A config file no longer sets the render density or pauses the orb. Files exported from the studio carried the author's quality setting (`dpr`) and pause state (`paused`), and both were applied on playback: every viewer got one person's density, and a file exported while paused played frozen. `readConfig` now ignores both, and the studio no longer writes them.

## [0.1.0] - 2026-09-25

The first published version. Everything below is new.

### Rendering an orb

- `createOrb(container, options)` mounts the runtime into a container, registers the engines you pass it, reads a config and starts its own frame loop. `stop()`/`start()` pause and resume without a jump, `loadConfig()` swaps looks, and `dispose()` releases GPU resources and removes only the canvas it added.
- `OrbRuntime` for hosts that drive their own loop. It exposes `advance(delta)`, `render()` and `tick(delta)` and never calls back into the host.
- Twenty-three engines on `@lumaform/orb/engines`, one named export each, so the import list is the bundle. Among them are wireframes (`tesseract`, `hopf`, `polytope`), raymarchers (`nebula`, `singularity`), physical bodies (`chromasphere`, `aqueous`), stateful simulations (`murmuration`, `filament`, `curldrift`), and `regard`, the one engine with a front: a single inner light whose gaze reads as listening or thinking.
- A data-only catalog on the root: `ENGINE_CATALOG`, `ENGINE_INFO`, `ENGINE_PARAM_DEFINITIONS`, `ENGINE_TYPES` and helpers. Reading a schema does not pull in any engine code.

### Configs

- A versioned config format (`CONFIG_VERSION` 1) that round-trips between the studio's Export tab and your app: `readConfig`, `parseConfigFile`, `sanitizeParams`, `stampVersion` and `migrateConfig`. A file from a newer version is refused with an error naming both versions rather than half-loaded.

### Motion

- A modulation rack (LFO, fbm noise, envelopes, live audio) that drives parameters and tempo. Rate and geometry parameters are excluded from modulation because changing them mid-flight jumps or rebuilds.
- Engines see a single clock. `delta` is exactly the step `time` advanced, including the rack's tempo route, and click responses fade per second of virtual time, so they last equally long at 60 Hz and 120 Hz and freeze when paused.

### Audio

- `@lumaform/orb/audio`: microphone, audio-file and test-tone input reduced to a single level per frame. Audio never leaves the page.

### Output

- The background colour reaches the screen exactly as specified, independent of exposure and tone mapping. The scene is composited over it after tone mapping.
- A transparent background is truly transparent even with bloom on, and additive glow adds light over the host page without darkening it.
- Engines size themselves from the orb's own canvas, never the browser window, so an orb in a small container draws its lines and particles at the width they were designed at.

### Requirements

- `three` `>=0.160 <1` as a peer dependency, a browser with WebGL2, and ES modules. The package is `sideEffects: false`.

### Known issues

- Three engines still feed raw, unbounded time into some shader terms (`singularity`'s Keplerian disk shear, the noise drift in `aqueous` and `nebula`). After many hours of continuous running, float32 precision makes that part of the motion step instead of flowing. Fixing it needs tileable noise; see `src/core/phase.js`.

[Unreleased]: https://github.com/abektes/lumaform-orb/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/abektes/lumaform-orb/releases/tag/v0.2.0
[0.1.0]: https://github.com/abektes/lumaform-orb/releases/tag/v0.1.0
