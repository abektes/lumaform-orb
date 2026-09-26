# @lumaform/orb

<p align="center"><img src="https://raw.githubusercontent.com/abektes/lumaform-orb/main/docs/media/orbs.webp" width="480" alt="Four Lumaform orbs looping: Gyroid Nebula, Corona Veil, Vocalis and Hopf Fibration"></p>
<p align="center"><sub>Gyroid Nebula · Corona Veil · Vocalis · Hopf Fibration — <a href="https://orb.lumaform.xyz">try all twenty-three in the studio</a></sub></p>

The runtime behind [Lumaform Orb](https://github.com/abektes/lumaform-orb): twenty-three WebGL shader engines for ambient, reactive assistant orbs, a modulation rack that drives their parameters, and a versioned config format that round-trips a look between the studio and your app.

```bash
npm install @lumaform/orb three
```

**New here?** The [guide](https://github.com/abektes/lumaform-orb/blob/main/docs/GUIDE.md) goes from a look designed in the studio to an orb in your app, with audio.

Requires [three](https://threejs.org) as a peer, a browser with WebGL2, and Node 20+ to build. Pre-1.0, so a minor release may break the API; see [Status](#status).

## Quick start

```js
import { createOrb } from '@lumaform/orb';
import { nebula } from '@lumaform/orb/engines';

const orb = createOrb(document.querySelector('#orb'), {
  engines: { nebula },
  config,          // JSON exported from the studio's Export tab
});
```

`createOrb` constructs the runtime, registers the engines you handed it, reads the config and starts its own frame loop. That is the whole happy path.

## You import the engines you want

`createOrb` never reaches for the catalog's factories. Catalog entries name theirs as a **string** (`factoryName`) rather than binding the function, so reading a parameter schema does not drag in all twenty-three engines and their geometry.

**The import list is the bundle.** Name one engine, ship one engine. This is a structural property, not a bundler setting — `sideEffects: false` cannot drop a module whose export is named in a live binding, which is why the binding is not there.

## API

### `createOrb(container, options) → Orb`

| Option | Default | |
|---|---|---|
| `engines` | `{}` | Engine id → factory. Import from `@lumaform/orb/engines`. |
| `config` | `null` | A parsed config object. Decides which engine mounts. |
| `engine` | `null` | Engine id, when there is no config. Falls back to the sole registered engine. |
| `params`, `global` | `null` | Starting values, merged over schema defaults. |
| `autoStart` | `true` | Start the loop immediately. |
| `controls` | `false` | OrbitControls. An ambient orb rarely wants drag-to-rotate. |
| `autoRotate` | `false` | Camera auto-rotation. Motion belongs to the engine. |
| `preserveDrawingBuffer` | `false` | Only needed to read pixels back with `toDataURL`. |
| `pixelRatio` | device, max 2 | Render density. A config file never sets it. |

The returned orb exposes `start()`, `stop()`, `isRunning`, `setEngine()`, `setParams()`, `loadConfig()`, `setAudioSource()`, `dispose()`, and `dropped` — the config keys the engine's schema does not define, which is usually a version mismatch worth surfacing.

**Defaults are the embed's, not the studio's.** The canvas is sized from the container with a `ResizeObserver`, not from the window; nothing rotates unless you ask; `dispose()` removes the canvas it added and leaves your other children alone. Opt in when you want more:

```js
createOrb(el, { engines: { nebula }, controls: true, autoRotate: true });
```

### `OrbRuntime`

The escape hatch, for a host that wants to own its frame loop. It has none: call `advance(delta)` and `render(delta)`, or `tick(delta)` for both, and interleave whatever you like between them. The studio does exactly this — it advances its rehearsal and tween state, calls `advance()`, then either renders its variation grid or calls `render()`.

`mountEngine(type, { params, global, modulation })` takes one engine's parameters, not a store keyed by every engine type.

### Config

`parseConfigFile(text, knownEngines)` validates and migrates; `readConfig(config, defs)` returns a playback record and mutates nothing. `global` and `modulation` come back **`null`** when the file omits them — a config written before modulation existed has no rack at all, and that must not be confused with an empty one, which would silently wipe a live rack.

### Catalog

`ENGINE_CATALOG`, `ENGINE_PARAM_DEFINITIONS`, `getDefaultEngineParams(id)` and friends. Metadata and schemas only — no factories.

## Subpaths

| | |
|---|---|
| `@lumaform/orb` | `createOrb`, `OrbRuntime`, catalog metadata, config I/O |
| `@lumaform/orb/engines` | One named export per engine, keyed by id |
| `@lumaform/orb/audio` | Microphone capture and level following |
| `@lumaform/orb/internal` | Building blocks the studio shares. **Not covered by semver** |

### Audio is a subpath, not a flag

A `{ audio: true }` option could not be tree-shaken — a bundler cannot prove the value, so `getUserMedia` would ship to everyone and dependency scanners would flag the call rather than its use. Consent also belongs to you, not to a library reading a config field.

**Not importing `@lumaform/orb/audio` is the off switch:** zero bytes, no permission surface, nothing for a security review to find.

It also solves the wrong half. For an assistant orb the interesting signal is usually the assistant's own speech. `setAudioSource()` accepts any object with `read() → 0..1` and `isActive`. An `<audio>` element or a Web Audio node isn't one by itself, but becomes one in a few lines with `createLevelFollower` and `rmsFromTimeDomain` from this subpath. The [guide](https://github.com/abektes/lumaform-orb/blob/main/docs/GUIDE.md#your-assistants-voice) has the recipe:

```js
orb.setAudioSource({ isActive, read }); // read() → loudness 0..1, once per frame
```

## Status

`0.1.0` is the first published version. What each version contains is in [CHANGELOG.md](CHANGELOG.md). `OrbRuntime` stays on the root export as the escape hatch for hosts that drive their own loop; `createOrb` is the path for everyone else. Before 1.0 a minor release may break the API, and anything under `/internal` may change in any release.

Known limitation: a handful of engines still pass an unbounded `time` to a float32 uniform, which quantises motion over multi-day sessions. The periodic terms are fixed by phase accumulation; the remaining cases are aperiodic noise domains that need tileable noise. See `src/core/phase.js`.

## License

MIT © Ahmet Bektes
