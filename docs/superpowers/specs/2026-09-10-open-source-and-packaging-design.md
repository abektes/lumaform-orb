# Open-sourcing Lumaform Orb, and splitting out a runtime package

**Date:** 2026-09-10
**Status:** Approved, not started

Take the repo from private to public under MIT, and extract the engine layer into
`@lumaform/orb` — a package that plays back the JSON the studio exports. Four
phases; the first two are independently shippable.

---

## 1. Why

The studio's Export tab already generates a "Three.js Embed Snippet" that ends
with this comment:

```js
// Usage Example:
// Pass ORB_CONFIG into your Three.js engine loader.
```

No such loader exists. Anyone who clicks *Copy Three.js Code* today gets a config
object and a dead end. The exported JSON is a **pointer into code**, not a
self-contained description — `"engine": "chromasphere"` means nothing without
`chromasphere-engine.js` to interpret it. Making the export reusable therefore
means shipping the engines, and that package is the runtime.

This is finishing something already stubbed, not opening a new front.

## 2. What makes it tractable

Measured, not assumed. Every file in `src/engines/` imports only `three`,
three's line addons, and three leaf helpers (`vocalis-layout.js`,
`moire-sphere.js`, `flow-field.js`). **Zero imports from `ui/`, `store.js`, or
`studio.js`.** There is already a library inside the app.

| | LOC | Destination |
| --- | --- | --- |
| `src/engines/` | 10,382 | runtime |
| studio.js, modulation, framing, catalog, engine-notify, pointer | ~1,700 | runtime (studio.js needs surgery) |
| grid, capture, sequence, variation-grid, sweep, findings, clip-recorder | ~1,273 | studio |
| `src/ui/` + `src/styles/` | 6,048 | studio |

Three placements are less obvious than they look, and were checked rather than
assumed — getting them wrong would cause churn during phase 3:

- **`palette.js` is studio-side.** Imported only by `randomize.js`, `state.js`,
  `studio-export.js` and `studio-params.js`. No engine and nothing on the
  runtime path touches it.
- **`easing.js` is studio-side.** Imported only by `param-tween.js`,
  `ab-session.js` and `studio-library.js`. `modulation.js` imports nothing.
- **`audio-level.js` goes with the audio subpath, not the core.** Its
  `createLevelFollower` is used inside `audio-input.js`; `modulation.js` clamps
  the incoming level itself.

**Baseline at time of writing:** 34/34 tests pass, `vite build` succeeds, studio
bundle is 933 kB / 250 kB gzip. That bundle figure is the argument for
tree-shaking: a runtime that auto-loads all 21 engines would push most of it into
every consumer.

## 3. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| License | MIT | Matches all three deps (`three`, `shiki`, `vite` are MIT). No adoption friction. |
| Repo shape | npm workspaces monorepo, two packages | A single package would ship 6,048 LOC of studio UI and CSS to every npm consumer. |
| Renderer ownership | Runtime owns its canvas | Matches what `studio.js` already does, so it is extraction rather than redesign. Bloom is a full-screen pass and only works correctly when the runtime owns the composer. |
| Engine loading | Explicit registration | A runtime flag cannot be tree-shaken. Passing engines in lets the bundler drop the other 20, and it mirrors the existing `registerEngine` API. |
| Microphone | Opt-in subpath, not a boolean | See §6. |
| `OrbitControls` | Off by default | An embedded ambient orb rarely wants drag-to-rotate, and it is dead bundle weight. |
| Analytics | Env-gated, off by default | See §5.1. |
| Types | Hand-written `index.d.ts` | ~100 lines covering the public surface only, versus a `tsc` step over 12k LOC of untyped internals. |
| `createElementInput` (TTS) | Deferred to 0.2 | New code with a real CORS gotcha, not extraction. Add when a use case asks for it. |

## 4. Target structure

```
lumaform-orb/
├── packages/
│   ├── orb/                  → @lumaform/orb (published, MIT)
│   │   ├── src/
│   │   │   ├── engines/      21 files, moved verbatim
│   │   │   ├── catalog/      + engine-catalog.js (schema needed at runtime)
│   │   │   ├── core/         modulation, framing, engine-notify,
│   │   │   │                 moire-sphere, flow-field
│   │   │   ├── audio/        audio-input.js, audio-level.js  → ./audio subpath
│   │   │   ├── presets/      54 curated looks                → ./presets subpath
│   │   │   ├── runtime.js    NEW — OrbRuntime, extracted from OrbStudio
│   │   │   ├── config.js     NEW — versioned parse + migrate
│   │   │   └── index.js      createOrb, OrbRuntime
│   │   └── index.d.ts
│   └── studio/               → private, deployed as a static site
│       └── src/              ui/, styles/, store.js, state.js, studio-grid,
│                             studio-capture, studio-sequence, variation-grid,
│                             sweep, findings, clip-recorder, param-tween,
│                             easing, palette, randomize, main.js

├── examples/vanilla/         a real page consuming the built package
└── .github/workflows/        ci.yml, release.yml
```

## 5. Phase 1 — Make it publishable

No restructuring. Ends with the repo public and correct.

### 5.1 Security fixes

Four items, from an audit of all tracked files and all 50 commits of history.
The audit found **no credentials**, no `.env`/`.pem`/`dist`/`node_modules` ever
committed, no emails or personal data in docs, no `fetch`/`eval`/`new Function`
in `src/`, and `npm audit --omit=dev` reports 0 vulnerabilities. Config import is
properly schema-gated (`config-io.js`) — a malicious `.json` cannot inject state.

1. **Google Analytics tag** — `index.html:5` hardcodes `G-C4WY3TDE88`. Not a
   secret, but every fork and self-host would report into that property and
   silently track their own visitors. Read the measurement ID from
   `import.meta.env.VITE_GA_ID`; skip injecting the snippet when unset. Document
   the var in the studio README.

2. **Unescaped user input in `innerHTML`** — `studio-library.js:83-84`
   interpolates custom preset names (typed by the user, persisted in
   `localStorage`) raw into both an attribute and a text node. Same at `:46` and
   `:54`. `escapeHtml` already exists in `studio-format.js` and is used correctly
   for findings notes two functions away at `:284`; presets were missed. This is
   self-XSS *and* a plain functional bug — a preset named `My "Best" Orb` breaks
   `data-load-custom` and becomes unloadable. Wrap all four sites in
   `escapeHtml`. Add a regression test asserting a quote-bearing preset name
   round-trips through save → render → load.

3. **`scratch/test_shots.sh`** — tracked despite the gitignore rule (committed
   before the rule existed) and contains
   an absolute home-directory path from another tool's session. No credentials, but it
   is noise that should not be public. `git rm` it. History retains it; that is
   acceptable given the content is a home-directory path, so no history rewrite.

4. **No LICENSE** — the repo is currently "all rights reserved" by default.
   Nobody could legally use it. Add MIT.

### 5.2 Repo hygiene

- `LICENSE` (MIT, Copyright 2026 Ahmet Bektes)
- `SECURITY.md` — where to report, expected response time
- `CONTRIBUTING.md` — build, test, the engine-authoring pointer, the invariants that bite
- `.github/workflows/ci.yml` — run all `tests/*.test.mjs` and `vite build` on push and PR
- README pass. Two corrections: it claims 22 tests (there are 34), and it states
  the project is *"not an embeddable runtime"* — true today, false after phase 4.
  Rewrite that framing once, in phase 4, rather than letting it rot.
- Add a README note that microphone audio is local-only and never transmitted, so
  nobody has to read the source to establish that.

**Exit criteria:** 34/34 tests green, build green, CI green on a PR, repo public.

## 6. Phase 2 — Version the export format

The one piece worth doing even if everything after it is abandoned.

`README.md` currently says the export format *"has no version field and no
stability guarantee, and it will be redesigned around named states… Don't build
anything on its shape yet."* Publishing a runtime means people build on exactly
that shape. Adding a version field **before** v1 turns the promised redesign into
a migration rather than a break.

```json
{ "version": 1, "engine": "chromasphere", "global": {…}, "params": {…}, "modulation": [] }
```

- `CURRENT_VERSION = 1`, plus an ordered `MIGRATIONS` array.
- `parseConfig(json)` treats a missing `version` as `0` and runs the chain, then
  hands off to the existing `validateConfig` / `sanitizeParams` in `config-io.js`.
- The v0→v1 migration is a **no-op today**. That is the point: establish the
  mechanism while it costs nothing.
- Export writes `version: 1`. Grid array exports carry it per entry.

**Tests:** an unversioned fixture (a real export saved before this change) loads
unchanged; a `version: 1` file round-trips; an unknown *future* version fails
with a message naming the version rather than silently half-loading.

**Exit criteria:** every existing saved export still imports. 34+ tests green.

## 7. Phase 3 — The split

Pure refactor. No new features, no behaviour change. The 34-test suite is the
safety net and must be green at every step.

### 7.1 `OrbRuntime` extraction

`OrbStudio` is already a class plus three mixin objects, so the split follows a
seam that exists rather than inventing one.

`OrbRuntime` (in `packages/orb`) keeps: renderer/scene/camera/composer setup,
`registerEngine`, `setEngine`, `updateParameters`, `updateGlobalSettings`,
`syncModulation`, `applyModulatedParams`, `onWindowResize`, `frameActiveEngine`,
`reframeForRadiusChange`, `resetCamera`, `togglePlayPause`, `renderFrame`,
`dispose`.

It drops: `enableAudio`/`disableAudio` (→ §7.2), `tweenTo` (studio-only, used by
A/B swap), and the grid/capture/sequence mixins.

The studio then becomes:

```js
class OrbStudio extends OrbRuntime {}
Object.assign(OrbStudio.prototype, gridMethods, captureMethods, sequenceMethods);
```

Studio-side call sites should not need to change. If one does, that is a signal
the seam was drawn wrong — fix the seam, do not paper over it at the call site.

### 7.2 Audio

The seam already exists. `modulation.js:168` takes audio as a single float pushed
in once per frame; its own comment describes it that way. `audio-level.js` is
pure maths with no Web Audio and no DOM. `audio-input.js` is the only file
touching `getUserMedia` and `AudioContext`.

So the runtime is already audio-reactive through a one-number interface, and the
only bridge is ~30 lines in `studio.js:498`.

**The toggle is an import boundary, not a boolean.** A runtime flag cannot be
tree-shaken — bundlers cannot prove its value, so mic-acquisition code would ship
to every consumer regardless, and dependency scanners flag the *presence* of
`getUserMedia`, not its use. Consent UX also belongs to the consumer, not to a
library reacting to a config field.

- Runtime core exposes `orb.setAudioLevel(n)` and accepts an optional
  `audioSource` — anything with `.read() → 0..1`.
- `@lumaform/orb/audio` exports `createMicInput()`, essentially today's
  `audio-input.js` verbatim including `startTestTone`.
- The studio imports that subpath and behaves exactly as it does now.

Not importing the subpath means zero bytes and zero permission surface.

### 7.3 Mechanics

npm workspaces. `packages/studio/package.json` depends on `"@lumaform/orb": "*"`,
resolved by symlink. Test files move with the code they cover: engine, config and
modulation tests to `packages/orb/tests/`; layering, css-hygiene, file-size,
inspector-nav and the session tests stay with the studio.

**Exit criteria:** all 34 tests green in their new homes, both packages build,
and the studio is verified running in the browser with an engine switch, a grid
open, and a clip recorded — behaviour indistinguishable from before.

## 8. Phase 4 — Public API and publish

### 8.1 API

```js
import { createOrb } from '@lumaform/orb';
import { chromasphere } from '@lumaform/orb/engines';
import config from './my-orb.json';

const orb = createOrb(document.getElementById('orb'), config, {
  engines: [chromasphere],
});

orb.setParams({ … });
orb.pulse();
orb.pause();
orb.play();
orb.dispose();
```

An engine named in the config but absent from `engines` throws an error naming
the exact import to add — not a blank canvas.

### 8.2 Package

- `"peerDependencies": { "three": ">=0.160 <1" }` so consumers never get two copies
- ESM only. This is a browser/Three.js package; no CJS build.
- `"sideEffects": false`
- `exports` map: `.`, `./engines`, `./audio`, `./presets`
- `"files": ["dist", "index.d.ts"]`, built with Vite library mode
- Hand-written `index.d.ts` for the public surface

### 8.3 Release

- `.github/workflows/release.yml` publishes on tag with `npm publish --provenance`
  — free supply-chain attestation, worth having from the first release.
- Publish `0.1.0`. Zero-major signals the format is still moving, consistent with
  VISION §3.

### 8.4 Docs

- `packages/orb/README.md` — install, usage, API, the engine list, bundle-size guidance
- Root README reframed: an instrument, plus the runtime that plays back what it finds
- **VISION.md §3 amendment.** A runtime looks like specification-before-exploration
  and needs an explicit answer: the format is versioned and migratable, so
  specifying it is reversible. That is what makes it compatible with §3 rather
  than a quiet abandonment of it.

### 8.5 Tests

- Every engine in the catalog is exported from `./engines` — this export map will
  drift otherwise
- A config naming an unregistered engine throws, with the engine id in the message
- `examples/vanilla/` installs the built tarball and renders a real orb, verified
  in the browser. Not an assertion that it should work.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Phase 3 silently changes studio behaviour | 34 tests green at every step, plus a manual browser pass. Do not add features during phase 3. |
| Export map drifts from the catalog | A test asserts they match (§8.5). |
| Format freezes despite VISION §3 | Version field and migration chain land in phase 2, before anything is published. |
| Bundle bloat for consumers | Explicit registration plus `sideEffects: false`; the example measures real output size. |
| Two WebGL contexts when the host already uses Three.js | Accepted for 0.1. An attach-to-scene API is the 0.2 answer if anyone hits it. |

## 10. Out of scope

- Homebrew. It ships CLI tools and macOS apps; this is a browser app, and
  `brew install` launching a dev server is strictly worse than `npx`. Also,
  homebrew-core has notability requirements the project does not meet.
- Publishing the studio to npm. It stays `private: true` and deploys as a static
  site. An `npx lumaform-studio` launcher is a small later add-on if wanted.
- `createElementInput` / `createNodeInput` for TTS reactivity — deferred to 0.2.
- Rewriting git history. The only leak is a home-directory path (§5.1.3).
- An attach-to-existing-scene API.
