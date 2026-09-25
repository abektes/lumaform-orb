# Changelog

All notable changes to `@lumaform/orb` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package follows [Semantic Versioning](https://semver.org/) with the usual pre-1.0 rule: **a minor release may break the API**; a patch release will not. `@lumaform/orb/internal` is outside semver entirely, as its header says.

Changes land under `[Unreleased]` as they merge; [docs/RELEASING.md](https://github.com/abektes/lumaform-orb/blob/main/docs/RELEASING.md) turns that section into a version.

## [Unreleased]

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

[Unreleased]: https://github.com/abektes/lumaform-orb/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/abektes/lumaform-orb/releases/tag/v0.1.0
