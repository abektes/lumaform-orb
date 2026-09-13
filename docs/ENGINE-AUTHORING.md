# Authoring a New Engine

**Audience:** an agent or engineer adding another engine to Lumaform Orb.

Read [VISION.md](VISION.md) first — it explains what the tool is for. This document is the contract: what an engine must implement, what it must never do, and how to prove it works. Engine-specific briefs live in [engine-briefs/](engine-briefs/).

The claim in VISION.md §5 is that adding an engine should be **one engine file plus one catalog entry**. If your change is bigger than that, the abstraction has leaked and you should say so rather than route around it.

---

## 1. What an engine is

A factory function that builds Three.js objects into a scene it is handed, animates them from a clock it is handed, and disposes everything it created. It owns no camera, no renderer settings, no post-processing, and no time.

```js
export function createFooEngine({ studio, scene, camera, renderer, composer, pointerTracker, params, global }) {
  // ...build geometry and materials, add them to `scene`
  return {
    frame: { radius: 2.3 },
    update({ time, delta, pointer, marchQuality, fps }) { /* per frame */ },
    setParams(patch) { /* apply a partial parameter update */ },
    onPulse() { /* optional: a click happened */ },
    onResize(width, height) { /* optional: drawing buffer changed */ },
    dispose() { /* release every geometry, material and texture you made */ },
  };
}
```

### The construction arguments

| Argument | Notes |
|---|---|
| `scene` | Yours to add to. In the variation grid **each of the nine cells gets its own scene** — never assume there is one. |
| `camera` | Read-only. Do not move it; the studio derives its distance from your `frame.radius`. You may read `camera.position` in a shader uniform. |
| `renderer` | Shared with eight other cell instances in grid mode. Do not change global renderer state (`setClearColor`, tone mapping, pixel ratio) — the studio owns those. |
| `composer` | **`null` in grid mode.** Never assume it exists. |
| `pointerTracker` | `{ pointer: Vector2 }`. In grid mode it is a fixed `(0,0)` stub. Parallax must degrade gracefully, not throw. |
| `params` | The initial parameter bag from `state.engines[<id>]`. May be partial — merge over your own defaults. |
| `global` | `DEFAULT_GLOBAL_SETTINGS` shape. Mostly the studio's business; read it only if you genuinely need it. |
| `studio` | **`null` in grid mode.** Practically: never use it. No current engine does. |

### The returned object

**`update({ time, delta, pointer, marchQuality, fps })`** — called once per frame, and once per cell per frame in grid mode.

- `time` is `virtualTime`, not wall clock. It already has `timeScale`, pause, and the modulation rack's `_timeScale` folded in. **Never call `clock.getElapsedTime()` or `performance.now()` yourself** — doing so makes the engine ignore pause, scrubbing, and every tempo route in the modulation rack.
- `delta` is `0` when paused. If you integrate state (a simulation), integrate `delta`, not a constant.
- **Never assign `time` straight to a shader uniform.** Uniform floats are float32, whose resolution is relative to magnitude, and `virtualTime` grows without bound. Ten hours in, a 16.67 ms frame advance can no longer be represented evenly (the step alternates 15.6/19.5 ms); a week in, only 17 frames in 60 advance at all. FPS never drops — the motion just stops flowing and starts lurching. Accumulate a wrapped phase instead:

  ```js
  import { createPhaseTracker } from '../core/phase.js'; // packages/orb/src/core/phase.js
  const phaseTracker = createPhaseTracker();
  // in update({ time }):
  phaseTracker.advance(time);
  mat.uniforms.uSpinPhase.value = phaseTracker.phase('spin', currentParams.spinSpeed);
  ```

  Then write `rot(uSpinPhase)` in GLSL rather than `rot(uTime * uSpinSpeed)`. The tracker differences successive `virtualTime` values, so it keeps `_timeScale`, and integrating the rate also makes a mid-flight rate change safe instead of a jump.

  Two traps. **Match the period to the consumer** — `phase(key, rate)` wraps at TAU for `sin`/`cos`/`rot`, but a `fract()` or `floor()` lattice needs `phase(key, rate, 1.0)`, and a term like `palette(t)` defined as `sin(t * 1.4)` needs `TAU / 1.4`. **A wrapped phase cannot be rescaled** — `0.8 * (x mod TAU)` is not `(0.8x) mod TAU`, so a term running at `-rate * 0.8` needs its own accumulator, not a scaled reuse of another phase.

  This only works for terms that are genuinely periodic in time. A time-varying noise domain (`fbm(p + time * speed)`) or a per-fragment rate (`time * (2.4 / sqrt(r))`) has no wrap period, so those still take raw `time` — see the remaining cases noted in [phase.js](../packages/orb/src/core/phase.js).
- `marchQuality` is a 0–1 hint from the FPS tracker; raymarchers should scale their step count by it. Grid cells are pinned to `0.7`.
- Everything in the argument object is optional to consume. Destructure only what you use.

**`setParams(patch)`** — a *partial* update. It arrives from the UI, from presets, from an import, from the A/B swap, from a running param tween, and from the modulation rack **every frame**. There is no `onParamsChange` synonym.

- Merge with `Object.assign(currentParams, patch)`, then act only on the keys present.
- It must be cheap. The modulation rack calls it at 60fps with only the keys it changed.
- **Guard every side effect with `if (patch.key !== undefined)`.** Rebuilding geometry because a color arrived is the most common way to make an engine stutter.

**`frame: { radius: N }`** — the world-space radius your engine occupies. The studio derives camera distance from it so every engine fills the same fraction of the frame ([framing.js](../packages/orb/src/core/framing.js)). Omit it and you get `DEFAULT_FRAME_RADIUS = 2.5`, which is almost certainly wrong for you. Measure it: bounding sphere of everything you render at default parameters.

**`onPulse()`** — a click. Implement this one method. `onPointerClick` is not called. Decay the value in `update`; do not restore it on a timer from captured initial params — that silently discards edits the user made in between.

**`onResize(width, height)`** — the drawing buffer changed. Line2 `LineMaterial.resolution` must be updated here or line widths go wrong. **Not called for grid cells**, which is a known and accepted quirk: cells render at the resolution set during construction.

**`dispose()`** — remove your group from the scene and `.dispose()` every geometry, material, texture and render target you created. This runs on every engine switch and on all nine cells whenever the grid is reseeded, so a leak here compounds fast.

---

## 2. The two registration touch points

`ENGINE_TYPES`, `ENGINE_INFO`, `ENGINE_PARAM_DEFINITIONS`, default bags, the default preset name, and `studio.registerEngine` are all **derived** from `packages/orb/src/engine-catalog.js`. Do not add a parallel copy in `state.js` or `main.js`.

### 2a. `packages/orb/src/engines/<name>-engine.js`

The engine itself. One file. Named export `create<Name>Engine`.

### 2b. One entry in `packages/orb/src/catalog/`

Add the object to the group file that matches the substrate (`analytic.js`, `simulation.js`, or `bodies.js`):

```js
import { createFooEngine } from '../../engines/foo-engine.js';

{
  key: 'FOO',
  id: 'foo',
  name: 'Foo Engine',
  badge: 'Short Technique',
  description: 'One sentence a designer would understand.',
  defaultPreset: 'Foo Default',
  file: 'foo-engine.js',
  factoryName: 'createFooEngine',
  factory: createFooEngine,
  params: { /* see §3 */ },
}
```

`engine-catalog.test.mjs` fails if the factory file is missing from the catalog, or if the catalog points at a file that does not exist.

Randomize (`R`) reads this schema. There is no per-engine branch to add. Colours follow `paletteTargets`; motion numbers jump within `min`/`max`. An engine with neither is a no-op — `randomize.test.mjs` fails if that happens.

### 2c. `src/presets/` *(optional)*

Two or three presets in the group file that matches the catalog (`analytic.js`, `simulation.js`, `bodies.js`; Moiré lives in `moire.js` because that list is already large). `preset-library.js` is only the barrel. Each preset is `{ name, engine, badge, description, global, params }`. Not required, but an engine with no presets gives a reviewer nothing to compare against.

The dropdown, tab UI, grid, sweep, export, import and A/B all read from the derived catalog maps. **There is nothing else to wire.** If you find yourself editing `studio-ui.js` or `main.js` to make your engine appear, stop — you have missed a catalog field.

---

## 3. The parameter schema

Every parameter the UI shows, the grid mutates, the sweep ladders, and the exporter writes comes from `ENGINE_PARAM_DEFINITIONS`. The schema *is* the UI — there is no separate control code to write.

```js
color1:  { type: 'color',  label: 'Core Tint',   default: '#ffed00',                                   section: 'colors' },
count:   { type: 'select', label: 'Agent Count', options: [128, 256, 512], default: 256,               section: 'geometry' },
cohesion:{ type: 'number', label: 'Cohesion',    min: 0, max: 1, step: 0.01, default: 0.4,             section: 'motion' },
```

### `section` is a behavioural declaration, not a tab name

Choosing the wrong section is the single most consequential schema mistake.

| `section` | What it means operationally |
|---|---|
| `geometry` | **Changing this may dispose and rebuild geometry.** Excluded from modulation entirely ([modulation.js:30](../packages/orb/src/core/modulation.js:30)) because rebuilding at 60fps thrashes the GPU. |
| `motion` | Safe to modulate. Anything that is a cheap transform or uniform write belongs here — **even if it is conceptually "shape".** |
| `colors` | Safe to modulate. Colors themselves aren't (only `type: 'number'` is modulatable), but numeric glow/opacity parameters here are. |

Two consequences worth internalising:

1. **A cheap parameter must not live in `geometry`**, or you lock it out of the modulation rack for no reason. See `shellGap` in the Moiré schema ([catalog/analytic.js](../packages/orb/src/catalog/analytic.js)) — it is conceptually geometry, but it is applied as a scale on an existing object, so it lives in `motion` and stays modulatable. Prefer designing parameters to be transforms/uniforms precisely so they can escape `geometry`.
2. **An expensive parameter must live in `geometry`**, or the rack will rebuild your buffers sixty times a second.

### Rate parameters

Any key matching `/speed|rate|spin|flow|rot[A-Z]|^rot/i` is excluded from modulation automatically, because engines compute `angle = time × rate` and changing a rate mid-flight retroactively rewrites the whole accumulated angle — the object visibly jumps. Tempo is shaped through the `_timeScale` destination instead.

**This means naming matters.** If you have a numeric parameter that is *not* a rate but happens to be called `flowDensity`, the pattern will match and silently exclude it. Either rename it or add it to `RATE_EXCEPTIONS` — with a comment saying why, as `twistHarmonics` and `hatchDensity` do.

Conversely: if you invent a rate-like parameter named `tempo` or `velocity`, the pattern will **not** match, and the rack will happily modulate it into a visible jump. Name rates so the pattern catches them.

### Colour parameters and the palette chips

The Colors tab offers six one-click harmonies. They are applied to your engine's colour
parameters **in schema declaration order**, cycling through the palette's three roles —
so declare your most characteristic colour first.

Mark any colour that is structural rather than expressive with `paletteRole: 'fixed'`:

```js
shadowColor: { type: 'color', label: 'Shadow Ambient Tone', default: '#090d16', section: 'colors', paletteRole: 'fixed' },
```

Shadow tones, dark resting states and white core sparks are load-bearing contrast, not
decoration — tinting them palette-cyan does not recolour the orb, it destroys the read.
Everything else should stay writable.

This used to be a map in `studio-ui.js` keyed by literal parameter name (`color1`,
`color2`, `colorShell`…), guarded with `if (params[k] !== undefined)`. Any engine that
named its colours anything else got a silent no-op — nine of seventeen engines did, and
nobody noticed because nothing errored. `panel-coverage.test.mjs` now fails if any
engine has no palette-writable colour.

### Randomize

The Randomize button uses the same schema. Do not add a switch, and do not invent keys.

- Writable colours take a generated `{ primary, secondary, accent }` palette in schema order — the same list the chips use. `paletteRole: 'fixed'` is skipped.
- `section: 'motion'` numbers jump within `min`/`max`, snapped to `step`.
- Geometry numbers stay put unless you opt in with `randomize: true`. Opt a motion number out with `randomize: false`.
- Selects are never randomized.

### Ranges

`min`/`max` are not decoration. They set slider bounds, they normalise modulation depth (an `amount` of 0.5 means half the declared span, so a 0..0.03 param and a 0..360 one behave identically), they define the ladder for the parameter sweep, and they clamp on import. **A range wider than what actually looks good produces mostly-garbage variation grids** — the grid mutates within these bounds. Set them to the usable range, not the mathematically valid one.

---

## 4. Hard invariants

Each of these has already gone wrong at least once in this repo.

1. **The store owns state.** Write through store methods. Never replace `state`, `state.global`, or a `state.engines[<id>]` bag. Engines never touch app state at all — this constrains any studio-side edit your engine tempts you into.
2. **Only the active engine's bag is meaningful.** `state.engines[state.engine]` — never write all nine.
3. **Never modulate a rate.** Enforced by `isModulatable`. Do not build your own destination list; use `listModulationTargets()`.
4. **Never modulate a `geometry` parameter.** Same enforcement, same reason.
5. **Take no time from the wall clock.** `update({ time })` is the only clock.
6. **Dispose everything.** Including render targets, if you use them.
7. **No global renderer mutation.** Nine cells share one renderer.
8. **No bloom assumptions.** Grid cells render through RenderPass + OutputPass with no bloom, deliberately ([VISION.md §5](VISION.md)). If your engine is only legible *because* of bloom, it will look broken in the grid — build the glow into your own material instead of leaning on the post pass.
9. **`composer`, `studio`, and a real `pointerTracker` are all absent in grid mode.** Optional-chain or guard.

---

## 5. Contexts your engine must survive

An engine that only works in the main view is half-finished. All six of these exercise it differently:

| Context | What it stresses |
|---|---|
| Main view | The normal path. Bloom on, real pointer, `onResize` fires. |
| Variation grid (`G`) | Nine simultaneous instances, nine scenes, one renderer, no composer, no bloom, no `onResize`, stub pointer, `marchQuality: 0.7`. **The hardest context — check it explicitly.** |
| Parameter sweep (`K`) | Same as the grid, plus your parameter walked min→max. Reveals ranges that break at their own endpoints. |
| Modulation rack | `setParams` at 60fps with partial patches; `_timeScale` making `delta` non-uniform. |
| A/B compare (`` ` ``) | A full parameter set swapped in **without rebuilding the engine**. A `setParams` that only handles some keys shows up here as a half-applied config. |
| Param tween / rehearsal | `setParams` called continuously with interpolated values. Anything that rebuilds on change will stutter through the whole transition. |

---

## 6. Performance budget

Nine instances at once is the real constraint, not one.

- **60fps with nine cells** on integrated graphics is the target. If your engine can only manage that at reduced quality, scale on `marchQuality`.
- Allocate in the factory, mutate in `update`. Building a `new THREE.Color()` per frame per fiber is tolerable (Hopf does it); allocating geometry is not.
- Prefer updating existing buffer attributes and setting `needsUpdate = true` over creating new geometry. `Line2.setPositions()` per frame is a proven-acceptable pattern here ([hopf-engine.js:234](../packages/orb/src/engines/hopf-engine.js:234)).
- If you use `InstancedMesh`, size it for the maximum of your count parameter at construction and vary the visible count, rather than rebuilding on change.

---

## 7. Verification — required before you report done

Claims need evidence. Run the commands, paste the output.

```bash
npm run build
```

```bash
npm test
```

Then in the browser (`npm run dev`), with `window.__orb = { studio, state, ui, ab }`:

1. Select your engine from the dropdown. Confirm every parameter renders a control and moving each one visibly does something.
2. Press `G` for the variation grid. Confirm nine cells render, none are black, and the frame rate holds.
3. Press `K` for a sweep on one numeric parameter. Confirm the endpoints are usable rather than degenerate.
4. Switch to another engine and back **ten times**, then check for leaks:
   ```js
   __orb.studio.renderer.info.memory
   ```
   Geometry and texture counts must return to a stable number, not climb.
5. Export the config, re-import it, and confirm the orb is unchanged.
6. Enable a modulation route onto one of your `motion` parameters and confirm it moves smoothly with no jump.

### The hidden-pane traps

If the browser pane is not displayed, `requestAnimationFrame` never fires and the render loop is frozen. The app looks broken but isn't. `studio.fpsTracker.fps` still reports its default `60`, so it is **not** a liveness signal.

- Step frames manually: `studio.renderFrame()`.
- `setTimeout` is clamped to ~1000 ms in a hidden pane, so sleeping between frames advances a full second of `clock.getDelta()` each step. Inject the delta instead: `studio.clock.getDelta = () => 0.025`, step, restore.
- CSS transitions are frozen too; `getComputedStyle()` returns the starting value forever.

### Before reporting a bug

Check your fixture. Writing a parameter straight to state can put it outside its schema range, and import will legitimately clamp it — that reads as a round-trip bug and isn't one.

---

## 8. Definition of done

- [ ] `packages/orb/src/engines/<name>-engine.js` exists, exports `create<Name>Engine`, disposes everything it creates
- [ ] `frame.radius` declared and measured, not guessed
- [ ] One catalog entry in `packages/orb/src/catalog/` (id, info, schema, factory, defaultPreset)
- [ ] `engine-catalog.test.mjs` passes — the catalog, not `main.js`, is what registers the engine
- [ ] Every parameter has a correct `section`, a `label` a designer would understand, and a usable range
- [ ] At least one numeric `motion` parameter is modulatable (verify with `listModulationTargets()`)
- [ ] `npm run build` passes — output pasted
- [ ] All suites pass (`npm test`) — output pasted
- [ ] Verified in main view, grid, and sweep — screenshot of the grid attached
- [ ] Ten engine switches leave `renderer.info.memory` stable — numbers pasted
- [ ] Optional: 2–3 presets in the matching `src/presets/` group file
- [ ] Commit message explains *why* the engine exists, not just that it was added

---

## 9. Reference engines

Copy the closest one rather than starting blank.

| If you are building… | Read |
|---|---|
| Lines / wireframes / analytic curves | [hopf-engine.js](../packages/orb/src/engines/hopf-engine.js) — cleanest example: Line2 rebuilt per frame, particles, correct `onResize` and `dispose` |
| A full-screen raymarched SDF | [nebula-engine.js](../packages/orb/src/engines/nebula-engine.js) — fullscreen quad, `marchQuality` scaling, uniform-driven `setParams` |
| Lit meshes with real geometry rebuilds | [auris-engine.js](../packages/orb/src/engines/auris-engine.js) — `buildGeometry` gated on `geometry`-section keys only |
| Two counter-rotating structures | [moire-engine.js](../packages/orb/src/engines/moire-engine.js) — plus a good example of a `motion`-section parameter that could have been `geometry` and deliberately isn't |

---

## 10. Scope discipline

VISION.md §3 is load-bearing: **exploration comes before specification.** You are adding a vocabulary to play with, not a feature to configure.

- Do not add a config format, a versioning scheme, or a state machine.
- Do not refactor the studio, the UI, or another engine to accommodate yours. If your engine genuinely cannot be expressed within the contract, **stop and report that** — it is more valuable information than a working engine plus an invasive change.
- Do not add runtime dependencies. `three` and `shiki` are the whole list.
- Ten well-chosen parameters beat thirty. Every parameter you add is one the variation grid can waste a mutation on.
