# Orb Templates, Step 1: States, Finish Pass, Copy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@lumaform/orb` named states with eased transitions (`setState`), a shared finishing pass, and copy that no longer reads as generated. These are the three foundations that the studio States strip (step 2) and the 8 templates (step 3) are built on.

**Spec:** [docs/superpowers/specs/2026-10-03-orb-templates-design.md](../specs/2026-10-03-orb-templates-design.md)

**Architecture:** Three independent parts. Each one lands green on its own, so they can be built in any order or in parallel.
- **Part A** moves the pure tween into the runtime, adds config v2 with `states`, adds a pure `state-player.js`, and wires `setState` into `OrbRuntime` and `createOrb`.
- **Part B** adds one `ShaderPass` (`finish-pass.js`) between `OutputPass` and the background pass, five identity-default globals, grid wiring, and studio sliders.
- **Part C** adds a source-scanning copy guard, then rewrites the catalog, the presets and the page chrome until it passes.

**Tech Stack:** Vanilla JS ES modules, Three.js 0.160, Vite 5. Tests are plain Node scripts (`node <file>`, exit code 1 on failure, `ok(name, cond, extra)` helper). Run everything with `npm test`.

## Global Constraints

- 2-space indent, single quotes, semicolons. Comments explain **why**, never what.
- `three` and `shiki` are the only runtime dependencies. Add none.
- Nothing in `packages/orb` may import from `packages/studio`.
- `OrbRuntime` owns no frame loop and declares no hooks. The studio may not override a runtime method except `dispose` (`runtime-seam.test.mjs`).
- The runtime takes one engine's params, never a store.
- Never modulate or ease a rate parameter (`isModulatable()` false) or a `geometry`-section parameter. States may contain only `isModulatable()` numbers and non-geometry colours.
- The store owns state. Write through store methods; never replace `state`, `state.global` or `state.engines[id]`.
- Controls must declare their own `background` and `color`.
- No file may pass 1000 lines (`file-size.test.mjs`). `runtime.js` is at 496.
- A change a runtime user would notice gets a line under `## [Unreleased]` in `packages/orb/CHANGELOG.md`.
- README states the suite counts ("There are N of them, R covering the runtime and S the studio"). `docs-facts.test.mjs` fails until they match. Update them in the same task that adds or moves a suite.
- Verify browser-visible changes in the running studio (`npm run dev`, http://localhost:5173). If the Browser pane is hidden, `requestAnimationFrame` does not fire: step frames with `__orb.studio.renderFrame()` and inject `studio.clock.getDelta = () => 0.025`.
- Commit at the end of every task. Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Status | Responsibility |
| --- | --- | --- |
| `packages/orb/src/core/easing.js` | moved from studio | Named easing curves |
| `packages/orb/src/core/param-tween.js` | moved from studio | Interpolating one param set toward another |
| `packages/orb/src/core/state-player.js` | new | Named states, current state, eased tempo. Pure. |
| `packages/orb/src/core/config-io.js` | modify | `CONFIG_VERSION` 2, `sanitizeStates`, states in `readConfig` |
| `packages/orb/src/core/runtime.js` | modify | `setState`, `state`, `stateTempo`, finish pass wiring |
| `packages/orb/src/core/finish-pass.js` | new | Contrast, saturation, grain, edge fade, light coverage |
| `packages/orb/src/create-orb.js` | modify | `template` and `state` options; `setState`, `state`, `states` on the handle |
| `packages/orb/src/core/mount-plan.js` | new | Pure: options → what to register and mount. Testable without WebGL. |
| `packages/orb/src/internal/index.js` | modify | Export tween, easing, state player, finish pass |
| `packages/orb/src/index.js` | modify | Export `sanitizeStates` |
| `packages/orb/index.d.ts` | modify | Types for all of the above |
| `packages/studio/src/core/variation-grid.js` | modify | Per-pixel finish in grid cells |
| `packages/studio/src/core/state.js`, `src/ui/studio-format.js`, `src/ui/studio-params.js` | modify | Finish sliders |
| `packages/orb/src/catalog/{analytic,bodies,simulation,refined}.js` | modify | Copy |
| `packages/studio/src/presets/{moire,analytic,bodies,simulation,flow}.js` | modify | Copy and renames |
| `packages/studio/index.html` | modify | Title and meta |
| `packages/studio/tests/copy-hygiene.test.mjs` | new | The guard |

---

# Part A: States

### Task 1: Move the tween and easing curves into the runtime

The runtime needs the same interpolation the studio uses. Both modules are already pure, so they move rather than get copied.

**Files:**
- Move: `packages/studio/src/core/easing.js` → `packages/orb/src/core/easing.js`
- Move: `packages/studio/src/core/param-tween.js` → `packages/orb/src/core/param-tween.js`
- Move: `packages/studio/tests/param-tween.test.mjs` → `packages/orb/tests/param-tween.test.mjs`
- Modify: `packages/orb/src/internal/index.js`, `packages/studio/src/core/studio.js:13`, `packages/studio/src/ui/studio-library.js:7`, `packages/studio/src/ui/ab-session.js:2`, `README.md`

**Interfaces:**
- Produces, from `@lumaform/orb/internal`: `EASINGS`, `EASING_NAMES`, `applyEasing(name, t)`, `lerpHexColor(from, to, t)`, `interpolateParams(from, to, defs, t)`, `createParamTween()`. Signatures are unchanged.

- [ ] **Step 1: Move the files with git**

```bash
git mv packages/studio/src/core/easing.js packages/orb/src/core/easing.js
git mv packages/studio/src/core/param-tween.js packages/orb/src/core/param-tween.js
git mv packages/studio/tests/param-tween.test.mjs packages/orb/tests/param-tween.test.mjs
```

- [ ] **Step 2: Fix the moved module's imports**

`param-tween.js` imported `isModulatable` through the package name. Inside the runtime, use the relative path instead, so the runtime never imports itself by name. In `packages/orb/src/core/param-tween.js`, replace:

```js
import { applyEasing } from './easing.js';
import { isModulatable } from '@lumaform/orb/internal';
```

with:

```js
import { applyEasing } from './easing.js';
import { isModulatable } from './modulation.js';
```

The test imports `../src/core/easing.js` and `../src/core/param-tween.js`. Those relative paths are still correct from `packages/orb/tests/`, so the test needs no change.

- [ ] **Step 3: Export both modules from the internal barrel**

Append to `packages/orb/src/internal/index.js`:

```js
// Interpolating one parameter set toward another, and the curves it eases by.
// setState() uses them; the studio's A/B and rehearsal transitions use the same
// ones, so a transition previewed in the studio is the one an app gets.
export { EASINGS, EASING_NAMES, applyEasing } from '../core/easing.js';
export { lerpHexColor, interpolateParams, createParamTween } from '../core/param-tween.js';
```

- [ ] **Step 4: Point the studio at the runtime's copies**

- In `packages/studio/src/core/studio.js`, replace `import { createParamTween } from './param-tween.js';` with `import { createParamTween } from '@lumaform/orb/internal';`
- In `packages/studio/src/ui/studio-library.js` and `packages/studio/src/ui/ab-session.js`, replace `import { EASING_NAMES } from '../core/easing.js';` with `import { EASING_NAMES } from '@lumaform/orb/internal';`
- Then check nothing still points at the old paths:

```bash
grep -rn "core/easing.js\|param-tween.js" packages/studio/src packages/studio/tests
```

Expected: no output.

- [ ] **Step 5: Update the README suite counts**

The studio loses one suite and the runtime gains one, so the total stays 58. In `README.md`, replace `There are 58 of them, 29 covering the runtime and 29 the studio.` with `There are 58 of them, 30 covering the runtime and 28 the studio.`

- [ ] **Step 6: Run the tests and build**

```bash
node packages/orb/tests/param-tween.test.mjs | tail -1
npm test 2>&1 | tail -1
npm run build 2>&1 | grep -E "built in|rror"
```

Expected: `ALL PASS`, then `ALL SUITES PASS (58)`, then `✓ built in …`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Move the param tween and easing curves into the runtime

setState() needs the same interpolation the studio's A/B and rehearsal
transitions use. Both modules were already pure, so they move rather
than get copied, and the studio imports them back from ./internal.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Config v2 with states

**Files:**
- Modify: `packages/orb/src/core/config-io.js`, `packages/orb/src/index.js`
- Test: `packages/orb/tests/config-v2.test.mjs` (new)

**Interfaces:**
- Produces:
  - `CONFIG_VERSION === 2`.
  - `sanitizeStates(states, defs) → { states: Record<string, { params: object, tempo: number }> | null, dropped: string[] }`. Dropped entries look like `'thinking.rotSpeed'`, or `'thinking'` for a state that isn't an object.
  - `sanitizeTransition(transition) → { durationMs: number, easing: string }`.
  - `readConfig(config, defs)` additionally returns `states` (sanitized, or `null`), `initialState` (a string naming an existing state, or `null`) and `transition`. Dropped state keys are appended to its existing `dropped` array.
  - Constants: `TEMPO_RANGE = [0.25, 4]`, `DEFAULT_TRANSITION = { durationMs: 600, easing: 'easeInOut' }`.

- [ ] **Step 1: Write the failing test**

Create `packages/orb/tests/config-v2.test.mjs`:

```js
// Config v2 adds named states. A state is a patch over the base look, and may
// only touch what can be eased safely — the same set modulation may touch, plus
// colours. Rates and geometry params are dropped and reported, not trusted.
import {
  CONFIG_VERSION, migrateConfig, readConfig, sanitizeStates, sanitizeTransition,
} from '../src/core/config-io.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const DEFS = {
  glow:     { type: 'number', min: 0, max: 3, step: 0.05, section: 'colors' },
  spread:   { type: 'number', min: 0, max: 1, step: 0.01, section: 'motion' },
  rotSpeed: { type: 'number', min: 0, max: 2, step: 0.01, section: 'motion' },
  segments: { type: 'number', min: 4, max: 64, step: 1, section: 'geometry' },
  shape:    { type: 'select', options: ['a', 'b'], section: 'colors' },
  tint:     { type: 'color', section: 'colors' },
  edgeTint: { type: 'color', section: 'geometry' },
};

ok('the current version is 2', CONFIG_VERSION === 2, String(CONFIG_VERSION));

const v1 = migrateConfig({ version: 1, engine: 'x', params: { glow: 1 } });
ok('v1 migrates to v2', v1.ok && v1.config.version === 2);
ok('v1 → v2 changes nothing else', v1.ok && v1.config.params.glow === 1 && v1.config.states === undefined);

const v0 = migrateConfig({ engine: 'x', params: {} });
ok('v0 migrates through the whole chain', v0.ok && v0.config.version === 2);

const v3 = migrateConfig({ version: 3, engine: 'x', params: {} });
ok('v3 is refused', !v3.ok && /3/.test(v3.error) && /2/.test(v3.error), v3.error);

const { states, dropped } = sanitizeStates({
  idle: { params: {}, tempo: 1 },
  thinking: {
    params: { spread: 0.8, rotSpeed: 1.5, segments: 32, shape: 'b', tint: '#ff0000', edgeTint: '#00ff00', ghost: 1 },
    tempo: 1.4,
  },
  speaking: { params: { glow: 99 }, tempo: 10 },
  broken: 'nope',
}, DEFS);

ok('keeps a safe number', states.thinking.params.spread === 0.8);
ok('keeps a non-geometry colour', states.thinking.params.tint === '#ff0000');
ok('drops a rate', !('rotSpeed' in states.thinking.params));
ok('drops a geometry number', !('segments' in states.thinking.params));
ok('drops a select', !('shape' in states.thinking.params));
ok('drops a geometry colour', !('edgeTint' in states.thinking.params));
ok('drops an unknown key', !('ghost' in states.thinking.params));
ok('reports each drop as state.key',
  ['thinking.rotSpeed', 'thinking.segments', 'thinking.shape', 'thinking.edgeTint', 'thinking.ghost']
    .every((k) => dropped.includes(k)), dropped.join(', '));
ok('clamps a number into its range', states.speaking.params.glow === 3);
ok('clamps tempo into its range', states.speaking.tempo === 4);
ok('drops a state that is not an object', !('broken' in states) && dropped.includes('broken'));
ok('defaults tempo to 1', sanitizeStates({ a: { params: {} } }, DEFS).states.a.tempo === 1);
ok('no states → null', sanitizeStates(undefined, DEFS).states === null);

ok('transition defaults', JSON.stringify(sanitizeTransition(undefined)) === JSON.stringify({ durationMs: 600, easing: 'easeInOut' }));
ok('transition clamps duration', sanitizeTransition({ durationMs: 99999 }).durationMs === 10000);
ok('transition rejects an unknown easing', sanitizeTransition({ easing: 'wobble' }).easing === 'easeInOut');

const record = readConfig({
  version: 2, engine: 'x', params: { glow: 1 },
  states: { idle: { params: {} }, thinking: { params: { spread: 0.5, rotSpeed: 1 }, tempo: 1.2 } },
  initialState: 'thinking',
  transition: { durationMs: 300, easing: 'spring' },
}, DEFS);
ok('readConfig returns states', record.states?.thinking?.params.spread === 0.5);
ok('readConfig returns initialState', record.initialState === 'thinking');
ok('readConfig returns transition', record.transition.durationMs === 300 && record.transition.easing === 'spring');
ok('readConfig appends dropped state keys', record.dropped.includes('thinking.rotSpeed'), record.dropped.join(', '));

const missingInitial = readConfig({ engine: 'x', params: {}, states: { idle: { params: {} } }, initialState: 'gone' }, DEFS);
ok('an initialState naming no state reads as null', missingInitial.initialState === null);

const single = readConfig({ engine: 'x', params: { glow: 1 } }, DEFS);
ok('a file without states is a single look', single.states === null && single.initialState === null);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node packages/orb/tests/config-v2.test.mjs`
Expected: it fails at import with `does not provide an export named 'sanitizeStates'`.

- [ ] **Step 3: Implement**

In `packages/orb/src/core/config-io.js`:

1. Add the imports below the header comment:

```js
import { isModulatable } from './modulation.js';
import { EASING_NAMES } from './easing.js';
```

2. Change `export const CONFIG_VERSION = 1;` to `export const CONFIG_VERSION = 2;`.

3. Append to the `MIGRATIONS` array, after the v0 → v1 entry:

```js
  // v1 → v2. States, initialState and transition are new and optional, so a v1
  // file is already a valid v2 file with one look and no states.
  (config) => ({ ...config, version: 2 }),
```

4. Add after `sanitizeParams`:

```js
export const TEMPO_RANGE = Object.freeze([0.25, 4]);
export const DEFAULT_TRANSITION = Object.freeze({ durationMs: 600, easing: 'easeInOut' });

// What a state may change: what modulation may change, plus colours that do
// not rebuild geometry. A state is eased over hundreds of milliseconds, and a
// rate or a geometry param is exactly as unsafe to ease as to modulate — the
// first rewrites accumulated angle, the second rebuilds geometry every frame.
// Selects are left out too: snapping one mid-transition is a cut, not an ease.
function isStateSafe(key, def) {
  if (def?.type === 'color') return def.section !== 'geometry';
  return isModulatable(key, def);
}

export function sanitizeStates(states, defs) {
  if (!isPlainObject(states)) return { states: null, dropped: [] };
  const out = {};
  const dropped = [];

  for (const [name, state] of Object.entries(states)) {
    if (!isPlainObject(state)) {
      dropped.push(name);
      continue;
    }
    const safeDefs = {};
    for (const [key, def] of Object.entries(defs || {})) {
      if (isStateSafe(key, def)) safeDefs[key] = def;
    }
    const { params, dropped: droppedKeys } = sanitizeParams(state.params, safeDefs);
    for (const key of droppedKeys) dropped.push(`${name}.${key}`);

    const rawTempo = Number(state.tempo);
    const tempo = Number.isFinite(rawTempo)
      ? Math.min(TEMPO_RANGE[1], Math.max(TEMPO_RANGE[0], rawTempo))
      : 1;
    out[name] = { params, tempo };
  }

  return { states: out, dropped };
}

export function sanitizeTransition(transition) {
  const raw = isPlainObject(transition) ? transition : {};
  const duration = Number(raw.durationMs);
  return {
    durationMs: Number.isFinite(duration)
      ? Math.min(10000, Math.max(0, duration))
      : DEFAULT_TRANSITION.durationMs,
    easing: EASING_NAMES.includes(raw.easing) ? raw.easing : DEFAULT_TRANSITION.easing,
  };
}
```

5. Replace the body of `readConfig` with:

```js
export function readConfig(config, defs) {
  const { params, dropped } = sanitizeParams(config.params, defs);
  const { states, dropped: droppedStates } = sanitizeStates(config.states, defs);
  // An initialState that names no state is a broken reference, not a request.
  const initialState = states && typeof config.initialState === 'string' && states[config.initialState]
    ? config.initialState
    : null;

  return {
    engine: config.engine,
    params,
    global: isPlainObject(config.global) ? lookGlobal(config.global) : null,
    // Detached, so a later edit to the parsed file cannot reach into whatever
    // the caller installs this in.
    modulation: isPlainObject(config.modulation) ? structuredClone(config.modulation) : null,
    states,
    initialState,
    transition: sanitizeTransition(config.transition),
    dropped: [...dropped, ...droppedStates],
  };
}
```

6. Update the file's header comment, which describes what export writes. Change `Export writes { version, engine, global, params, modulation }` to `Export writes { version, engine, global, params, modulation }, plus states, initialState and transition when it has them`.

7. In `packages/orb/src/index.js`, add `sanitizeStates` to the config-io export list.

- [ ] **Step 4: Run the new test and the whole suite**

```bash
node packages/orb/tests/config-v2.test.mjs | tail -1
npm test 2>&1 | grep -E "FAIL|SUITES"
```

Expected: `ALL PASS`. Any existing test that asserted `CONFIG_VERSION === 1` or `version: 1` in an export will now fail. Fix each one by asserting against `CONFIG_VERSION` rather than a literal. Find them first:

```bash
grep -rn "version: 1\|CONFIG_VERSION === 1\|version, 1\|'version': 1" packages/*/tests
```

Then rerun until the summary reads `ALL SUITES PASS (59)`.

- [ ] **Step 5: Update the README count and the changelog**

- `README.md`: `There are 59 of them, 31 covering the runtime and 28 the studio.`
- `packages/orb/CHANGELOG.md`, under `## [Unreleased]` → `### Added`:

```markdown
- Config version 2. A config can carry named `states`, each a patch over its `params` with its own `tempo`, plus `initialState` and `transition` (`durationMs`, `easing`). A state may change only parameters that can be eased safely: rates, `geometry` parameters and selects are dropped on load and listed in `dropped`. Version 1 files load unchanged; a version 2 file is refused by 0.2 with an error naming both versions. `sanitizeStates` is exported.
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add named states to the config format

A state is a patch over the base look plus a tempo. It may change only
what modulation may change, plus colours, because easing a rate or a
geometry parameter over 600 ms fails the same way modulating it does.
Disallowed keys are dropped on load and reported as state.key.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The state player

All of the logic in `setState` lives here, so it can be tested without WebGL. The runtime only glues it in (Task 4).

**Files:**
- Create: `packages/orb/src/core/state-player.js`
- Test: `packages/orb/tests/state-player.test.mjs`
- Modify: `packages/orb/src/internal/index.js`

**Interfaces:**
- Consumes: `createParamTween()`, `applyEasing()` (Task 1); the sanitized states, initialState and transition shapes (Task 2).
- Produces `createStatePlayer()`, returning:
  - `configure({ base, states, initialState, transition, defs })`: resets everything. `base` is the base look's params. `states` is the output of `sanitizeStates`, or `null`.
  - `setBase(params)`: replaces the base look and cancels any transition in flight.
  - `start(name, currentParams, { durationMs, easing } = {}) → boolean`
  - `advance(deltaMs) → object | null`: params to apply this frame, or `null` when idle.
  - `cancel()`
  - Getters: `current` (`string | null`), `names` (`string[]`), `tempo` (`number`), `isRunning` (`boolean`).
  - `targetFor(name) → object`: base plus the state's patch, over every key any state touches.

- [ ] **Step 1: Write the failing test**

Create `packages/orb/tests/state-player.test.mjs`:

```js
// The state player decides what setState() does, without WebGL, so every rule
// in it is checkable here: targets revert keys the last state changed, an
// interrupted transition starts from what is on screen, tempo eases, and an
// unknown name changes nothing.
import { createStatePlayer } from '../src/core/state-player.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const DEFS = {
  spread: { type: 'number', min: 0, max: 1, step: 0.01, section: 'motion' },
  glow:   { type: 'number', min: 0, max: 3, step: 0.05, section: 'colors' },
  tint:   { type: 'color', section: 'colors' },
};
const base = { spread: 0.1, glow: 1, tint: '#000000', rotSpeed: 0.5 };
const states = {
  idle:     { params: {}, tempo: 1 },
  thinking: { params: { spread: 0.9 }, tempo: 2 },
  speaking: { params: { glow: 2, tint: '#ffffff' }, tempo: 1 },
};

const player = createStatePlayer();
player.configure({ base, states, initialState: 'idle', transition: { durationMs: 1000, easing: 'linear' }, defs: DEFS });

ok('lists the state names', player.names.join(',') === 'idle,thinking,speaking');
ok('starts in the initial state', player.current === 'idle');
ok('starts at that state\'s tempo', player.tempo === 1);
ok('is idle before any start', !player.isRunning && player.advance(16) === null);

ok('the target of a state reverts keys other states touch',
  JSON.stringify(player.targetFor('speaking')) === JSON.stringify({ spread: 0.1, glow: 2, tint: '#ffffff' }),
  JSON.stringify(player.targetFor('speaking')));
ok('the target never includes keys no state touches', !('rotSpeed' in player.targetFor('thinking')));

ok('an unknown name returns false', player.start('dreaming', base) === false);
ok('an unknown name changes nothing', player.current === 'idle' && !player.isRunning);

ok('a known name returns true', player.start('thinking', base) === true);
ok('current switches immediately', player.current === 'thinking');
const half = player.advance(500);
ok('halfway is halfway (linear)', near(half.spread, 0.5), String(half.spread));
ok('tempo eases too', near(player.tempo, 1.5), String(player.tempo));

// Interrupt at the halfway point: the next transition must start from 0.5.
player.start('speaking', { ...base, ...half });
const justAfter = player.advance(1);
ok('an interruption starts from the values on screen', near(justAfter.spread, 0.5, 0.01), String(justAfter.spread));
ok('tempo continues from where it was', near(player.tempo, 1.5, 0.01), String(player.tempo));

const landed = player.advance(5000);
ok('lands exactly on the target', landed.spread === 0.1 && landed.glow === 2 && landed.tint === '#ffffff', JSON.stringify(landed));
ok('lands exactly on the tempo', player.tempo === 1);
ok('stops after landing', !player.isRunning && player.advance(16) === null);

player.start('thinking', landed, { durationMs: 0 });
const cut = player.advance(0);
ok('durationMs 0 is a hard cut', cut.spread === 0.9 && player.tempo === 2, JSON.stringify(cut));

player.setBase({ ...base, spread: 0.3 });
ok('setBase cancels a transition', !player.isRunning);
ok('setBase moves every target', player.targetFor('idle').spread === 0.3);

const empty = createStatePlayer();
empty.configure({ base, states: null, initialState: null, transition: null, defs: DEFS });
ok('no states: no names', empty.names.length === 0);
ok('no states: start returns false', empty.start('idle', base) === false);
ok('no states: tempo is 1', empty.tempo === 1);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node packages/orb/tests/state-player.test.mjs`
Expected: fails with `Cannot find module '…/state-player.js'`.

- [ ] **Step 3: Implement**

Create `packages/orb/src/core/state-player.js`:

```js
// Named states and the transition between them.
//
// Pure — no Three.js, no DOM — so OrbRuntime only glues this in and every rule
// lives where Node can test it. The runtime hands it the base look and the
// sanitized states from readConfig; it hands back params to apply and the
// tempo to fold into the frame step.
//
// Names mean nothing here. `thinking` is not special; VISION §7 keeps the
// vocabulary open and makes it a UI concern.

import { createParamTween } from './param-tween.js';
import { applyEasing } from './easing.js';

const DEFAULTS = { durationMs: 600, easing: 'easeInOut' };

export function createStatePlayer() {
  let base = {};
  let states = {};
  let defs = {};
  let transition = { ...DEFAULTS };
  let touched = [];
  let current = null;
  const tween = createParamTween();

  // Tempo is eased beside the params, not through the tween: the tween
  // rejects rate-like keys by design, and tempo is safe precisely because the
  // runtime integrates it into the frame step rather than multiplying time.
  let tempo = 1;
  let tempoFrom = 1;
  let tempoTo = 1;
  let tempoEasing = DEFAULTS.easing;
  let elapsed = 0;
  let duration = 0;

  function targetFor(name) {
    const patch = states[name]?.params || {};
    const target = {};
    // Every key any state touches, so leaving a state reverts what it changed.
    for (const key of touched) target[key] = key in patch ? patch[key] : base[key];
    return target;
  }

  return {
    configure(next) {
      base = { ...(next.base || {}) };
      states = next.states || {};
      defs = next.defs || {};
      transition = { ...DEFAULTS, ...(next.transition || {}) };
      touched = [...new Set(Object.values(states).flatMap((s) => Object.keys(s.params || {})))];
      current = next.initialState && states[next.initialState] ? next.initialState : null;
      tween.cancel();
      tempo = current ? states[current].tempo ?? 1 : 1;
      tempoFrom = tempoTo = tempo;
      elapsed = duration = 0;
    },

    setBase(params) {
      base = { ...params };
      tween.cancel();
      tempoFrom = tempoTo = tempo;
      elapsed = duration = 0;
    },

    targetFor,

    get names() {
      return Object.keys(states);
    },
    get current() {
      return current;
    },
    get tempo() {
      return tempo;
    },
    get isRunning() {
      return tween.isRunning || elapsed < duration;
    },

    start(name, currentParams, options = {}) {
      if (!states[name]) return false;
      const durationMs = options.durationMs ?? transition.durationMs;
      const easing = options.easing ?? transition.easing;
      current = name;
      // From what is on screen, so an interruption never jumps back.
      tween.start(currentParams, targetFor(name), defs, { durationMs, easing });
      tempoFrom = tempo;
      tempoTo = states[name].tempo ?? 1;
      tempoEasing = easing;
      elapsed = 0;
      duration = Math.max(0, durationMs);
      return true;
    },

    advance(deltaMs) {
      if (elapsed < duration || (duration === 0 && tempo !== tempoTo)) {
        elapsed = Math.min(duration, elapsed + Math.max(0, deltaMs));
        const t = duration > 0 ? elapsed / duration : 1;
        tempo = t >= 1 ? tempoTo : tempoFrom + (tempoTo - tempoFrom) * applyEasing(tempoEasing, t);
      }
      if (!tween.isRunning) return null;
      return tween.advance(deltaMs);
    },

    cancel() {
      tween.cancel();
      tempoFrom = tempoTo = tempo;
      elapsed = duration = 0;
    },
  };
}
```

Append to `packages/orb/src/internal/index.js`:

```js
// Named states for one engine: what setState() delegates to.
export { createStatePlayer } from '../core/state-player.js';
```

- [ ] **Step 4: Run the tests**

```bash
node packages/orb/tests/state-player.test.mjs | tail -1
npm test 2>&1 | grep -E "FAIL|SUITES"
```

Expected: `ALL PASS`. The suite will fail only on `docs-facts`, which is fixed in Step 5.

- [ ] **Step 5: README count.** `There are 60 of them, 32 covering the runtime and 28 the studio.` Rerun `npm test`. Expected: `ALL SUITES PASS (60)`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add a state player for named states

Targets cover every key any state touches, so leaving a state reverts
what it changed. A transition starts from the values on screen, so an
interruption never jumps. Tempo eases beside the params and lands
exactly. Pure, so all of it is tested in Node.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `setState` in the runtime

**Files:**
- Modify: `packages/orb/src/core/runtime.js`
- Test: `packages/orb/tests/set-state.test.mjs` (new)

**Interfaces:**
- Consumes: `createStatePlayer()` (Task 3); `readConfig`'s `states`, `initialState` and `transition` (Task 2).
- Produces on `OrbRuntime`:
  - `mountEngine(type, { params, global, modulation, states, initialState, transition })`
  - `setState(name, { durationMs, easing } = {}) → boolean`
  - `get state() → string | null`
  - `get stateNames() → string[]`
  - The frame step becomes `delta · timeScale · mod.timeScale · statePlayer.tempo`.

- [ ] **Step 1: Write the failing test**

`OrbRuntime`'s constructor needs WebGL, so the test builds a bare instance from the prototype and gives it only the fields that `advance`, `setState` and the param plumbing read.

Create `packages/orb/tests/set-state.test.mjs`:

```js
// setState() through the real OrbRuntime methods. The constructor needs WebGL,
// so the instance is built from the prototype with only the fields advance(),
// setState() and the param plumbing read — the same methods the browser runs.
import { OrbRuntime } from '../src/core/runtime.js';
import { createModulationRack, createDefaultModulation } from '../src/core/modulation.js';
import { createStatePlayer } from '../src/core/state-player.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const DEFS = {
  spread: { type: 'number', min: 0, max: 1, step: 0.01, section: 'motion' },
  glow:   { type: 'number', min: 0, max: 3, step: 0.05, section: 'colors' },
};

function bareRuntime() {
  const received = [];
  const rt = Object.create(OrbRuntime.prototype);
  Object.assign(rt, {
    modulation: createModulationRack(createDefaultModulation()),
    statePlayer: createStatePlayer(),
    baseParams: { spread: 0.1, glow: 1 },
    paramDefs: DEFS,
    lastModulated: {},
    virtualTime: 0,
    frameStep: 0,
    timeScale: 1,
    isPaused: false,
    audioSource: null,
    activeEngineType: 'x',
    activeEngine: { setParams: (p) => received.push({ ...p }), update() {}, dispose() {} },
  });
  rt.statePlayer.configure({
    base: rt.baseParams,
    states: { idle: { params: {}, tempo: 1 }, thinking: { params: { spread: 0.9 }, tempo: 2 } },
    initialState: 'idle',
    transition: { durationMs: 1000, easing: 'linear' },
    defs: DEFS,
  });
  return { rt, received };
}

{
  const { rt, received } = bareRuntime();
  ok('state reports the initial state', rt.state === 'idle');
  ok('stateNames lists the states', rt.stateNames.join(',') === 'idle,thinking');

  const warn = console.warn;
  let warned = '';
  console.warn = (m) => { warned = String(m); };
  ok('an unknown state returns false', rt.setState('dreaming') === false);
  console.warn = warn;
  ok('an unknown state warns with its name', warned.includes('dreaming'), warned);
  ok('an unknown state changes nothing', rt.state === 'idle' && received.length === 0);

  ok('a known state returns true', rt.setState('thinking') === true);
  rt.advance(0.5);
  ok('advance eases the base params', near(rt.baseParams.spread, 0.5), String(rt.baseParams.spread));
  ok('the engine receives the eased value', received.some((p) => near(p.spread ?? -1, 0.5)), JSON.stringify(received.at(-1)));
  ok('tempo folds into the frame step', near(rt.frameStep, 0.5 * 1.5), String(rt.frameStep));

  const before = rt.virtualTime;
  rt.advance(0.6);
  ok('virtual time only ever accumulates', rt.virtualTime > before);
  ok('lands on the target', rt.baseParams.spread === 0.9);
  ok('frame step at the landed tempo', near(rt.frameStep, 0.6 * 2), String(rt.frameStep));
}

{
  // A transition is wall-clock time: pausing playback or slowing timeScale must
  // not stretch a 600 ms transition.
  const { rt } = bareRuntime();
  rt.timeScale = 0.25;
  rt.setState('thinking');
  rt.advance(0.5);
  ok('transition time ignores timeScale', near(rt.baseParams.spread, 0.5), String(rt.baseParams.spread));
}

{
  // A modulated key that a state also eases must still reach the engine
  // modulated, not at its bare eased value.
  const { rt, received } = bareRuntime();
  rt.modulation.setConfig({
    ...createDefaultModulation(),
    enabled: true,
    sources: { ...createDefaultModulation().sources, lfo1: { type: 'lfo', shape: 'square', rate: 0.001, phase: 0 } },
    routes: [{ source: 'lfo1', dest: 'spread', amount: 0.2 }],
  });
  rt.setState('thinking');
  rt.advance(0.5);
  const last = received.filter((p) => 'spread' in p).at(-1);
  ok('modulation still applies on top of a state', last && !near(last.spread, rt.baseParams.spread), JSON.stringify(last));
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node packages/orb/tests/set-state.test.mjs`
Expected: `FAIL  state reports the initial state` (`state` is undefined), and the run ends with `TypeError: rt.setState is not a function`.

- [ ] **Step 3: Implement in `runtime.js`**

1. Import the player, next to the other core imports:

```js
import { createStatePlayer } from './state-player.js';
```

2. In the constructor, after `this.lastModulated = {};`:

```js
    // Named states for the mounted engine. Empty until a config carries them.
    this.statePlayer = createStatePlayer();
```

3. Change the `mountEngine` signature and configure the player. Replace

```js
  mountEngine(type, { params = {}, global = {}, modulation } = {}) {
    if (this.activeEngineType === type && this.activeEngine) {
      this.applyParams({ params, global, modulation });
      return false;
    }
```

with:

```js
  mountEngine(type, { params = {}, global = {}, modulation, states = null, initialState = null, transition = null } = {}) {
    const configureStates = (base) => this.statePlayer.configure({
      base, states, initialState, transition, defs: ENGINE_PARAM_DEFINITIONS[type] || {},
    });

    if (this.activeEngineType === type && this.activeEngine) {
      this.applyParams({ params, global, modulation });
      configureStates(this.baseParams);
      this.applyInitialState();
      return false;
    }
```

   At the end of `mountEngine`, just before `return true;`, add:

```js
    configureStates(this.baseParams);
    this.applyInitialState();
```

4. Add these methods after `applyParams`:

```js
  // A config that names an initial state starts there, not at the base look.
  // A hard cut: there is nothing on screen yet to transition from.
  applyInitialState() {
    const name = this.statePlayer.current;
    if (!name) return;
    this.statePlayer.start(name, this.baseParams, { durationMs: 0 });
    this.stepStateTransition(0);
  }

  // Moves toward a named state. The host calls this; nothing calls back up.
  // An unknown name is a typo in someone's app, so it warns and does nothing
  // rather than throwing inside their render loop.
  setState(name, options = {}) {
    const started = this.statePlayer.start(name, this.baseParams, options);
    if (!started) {
      const known = this.statePlayer.names;
      console.warn(`setState: no state named "${name}". ${known.length ? `Known: ${known.join(', ')}.` : 'This config has no states.'}`);
    }
    return started;
  }

  get state() {
    return this.statePlayer.current;
  }

  get stateNames() {
    return this.statePlayer.names;
  }

  // Applies one step of a running transition to the base params. The pattern
  // is the studio's own tween step: write base, then send the engine only what
  // changed. Keys it sends are forgotten by applyModulatedParams so a route on
  // the same key re-sends its modulated value over the bare eased one.
  stepStateTransition(deltaMs) {
    const eased = this.statePlayer.advance(deltaMs);
    if (!eased || !this.activeEngine) return;
    const patch = {};
    for (const [key, value] of Object.entries(eased)) {
      if (!Object.is(this.baseParams[key], value)) patch[key] = value;
    }
    Object.assign(this.baseParams, eased);
    for (const key of Object.keys(patch)) delete this.lastModulated[key];
    if (Object.keys(patch).length) notifyParams(this.activeEngine, patch);
  }
```

5. In `applyParams`, after `this.lastModulated = {};`, add:

```js
      // A direct edit is the new base look. Any transition in flight was
      // easing toward a target built from the old one.
      this.statePlayer.setBase(this.baseParams);
```

6. In `advance(delta)`, before the line `const mod = this.modulation.apply(…)`, add:

```js
    // Wall-clock milliseconds, not virtual time: a 600 ms transition should not
    // stretch when playback is slowed or paused.
    this.stepStateTransition(delta * 1000);
```

   Then change the frame step line to:

```js
    this.frameStep = this.isPaused ? 0 : delta * this.timeScale * mod.timeScale * this.statePlayer.tempo;
```

   Add one sentence to the comment above it: `The state player's tempo is integrated the same way, which is what lets a state be faster without a rate parameter changing.`

- [ ] **Step 4: Run the tests**

```bash
node packages/orb/tests/set-state.test.mjs | tail -1
node packages/studio/tests/runtime-seam.test.mjs | tail -1
npm test 2>&1 | grep -E "FAIL|SUITES"
wc -l packages/orb/src/core/runtime.js
```

Expected: `ALL PASS` twice. The suite fails only on `docs-facts` (Step 5). `runtime.js` is under 1000 lines.

- [ ] **Step 5: README count.** `There are 61 of them, 33 covering the runtime and 28 the studio.` Rerun `npm test`. Expected: `ALL SUITES PASS (61)`.

- [ ] **Step 6: Check it in the studio**

The studio is an `OrbRuntime` subclass, so `setState` works from the console. Start `npm run dev`, open http://localhost:5173 and run:

```js
const { studio, state } = __orb;
studio.mountEngine('regard', {
  params: { ...state.engines.regard },
  states: { idle: { params: {}, tempo: 1 }, thinking: { params: { attention: 0.9 }, tempo: 1.6 } },
  initialState: 'idle',
});
studio.setState('thinking');
```

Expected: Regard's light looks away over about 600 ms, without a jump, and starts moving faster. `studio.setState('idle')` brings it back. `studio.setState('nope')` warns and returns `false`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add setState to the runtime

The host calls setState(name); the runtime eases the base params toward
that state and folds the state's tempo into the integrated frame step.
Transitions run on wall-clock time, so slowing playback doesn't stretch
them, and a modulated key that a state also eases still reaches the
engine modulated. No hooks, nothing calls up into the host.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `template` and `state` in `createOrb`

**Files:**
- Create: `packages/orb/src/core/mount-plan.js`
- Modify: `packages/orb/src/create-orb.js`, `packages/orb/index.d.ts`
- Test: `packages/orb/tests/mount-plan.test.mjs`

**Interfaces:**
- Consumes: `readConfig` (Task 2); `runtime.mountEngine`, `setState`, `state` and `stateNames` (Task 4).
- Produces:
  - `planMount(options) → { engines: Record<string, Function>, engine: string | null, mount: { params, global, modulation, states, initialState, transition } | null, dropped: string[] }`.
  - `createOrb` accepts `template` (`{ id, name, description, engine: factory, config }`) and `state` (a string). The handle gains `setState(name, opts)`, `state` and `states`, and `loadConfig` carries states too.

- [ ] **Step 1: Write the failing test**

Create `packages/orb/tests/mount-plan.test.mjs`:

```js
// What createOrb registers and mounts, decided without a renderer.
import { planMount } from '../src/core/mount-plan.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const factory = () => ({ update() {}, dispose() {} });
const regard = () => ({ update() {}, dispose() {} });

const template = {
  id: 'ember', name: 'Ember', description: 'x', engine: regard,
  config: {
    version: 2, engine: 'regard', params: { attention: 0.05 },
    states: { idle: { params: {} }, thinking: { params: { attention: 0.85 }, tempo: 1.4 } },
    initialState: 'idle',
  },
};

const fromTemplate = planMount({ template });
ok('a template registers its own engine', fromTemplate.engines.regard === regard);
ok('a template mounts its config\'s engine', fromTemplate.engine === 'regard');
ok('a template carries its states', fromTemplate.mount.states?.thinking?.params.attention === 0.85);
ok('a template starts in its initialState', fromTemplate.mount.initialState === 'idle');

const overridden = planMount({ template, state: 'thinking' });
ok('`state` overrides initialState', overridden.mount.initialState === 'thinking');

const unknownState = planMount({ template, state: 'dreaming' });
ok('an unknown `state` falls back to initialState', unknownState.mount.initialState === 'idle');

const both = planMount({ template, engines: { tesseract: factory } });
ok('a template adds to engines passed alongside it', both.engines.tesseract === factory && both.engines.regard === regard);

const plain = planMount({ engines: { tesseract: factory }, config: { engine: 'tesseract', params: {} } });
ok('config without template still works', plain.engine === 'tesseract' && plain.mount.states === null);

const sole = planMount({ engines: { tesseract: factory } });
ok('falls back to the only engine handed over', sole.engine === 'tesseract');

const none = planMount({});
ok('nothing to mount → null', none.engine === null && none.mount === null);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
```

Note: `planMount` reads the schema for `regard` from the real catalog, so `attention` survives sanitizing because Regard defines it as a motion number.

- [ ] **Step 2: Run it to make sure it fails**

Run: `node packages/orb/tests/mount-plan.test.mjs`
Expected: `Cannot find module '…/mount-plan.js'`.

- [ ] **Step 3: Implement `mount-plan.js`**

Create `packages/orb/src/core/mount-plan.js`. The logic is moved out of `createOrb`'s body, with templates and states added:

```js
// What createOrb registers and mounts, decided without a renderer so it can
// be tested in Node. createOrb itself only constructs and calls.
import { ENGINE_PARAM_DEFINITIONS, getDefaultEngineParams } from '../engine-catalog.js';
import { readConfig } from './config-io.js';

export function planMount({ engines = {}, template = null, config = null, engine = null, params = null, global = null, state = null } = {}) {
  const allEngines = { ...engines };
  let source = config;
  if (template) {
    // The template brings its own engine, so importing one template ships one
    // engine. That is the property `engines` exists to keep.
    allEngines[template.config.engine] = template.engine;
    source = template.config;
  }

  // A config names its own engine, so it decides what mounts. Without one, fall
  // back to an explicit `engine`, then to the only engine that was handed over —
  // a consumer who passed exactly one clearly meant that one.
  const registered = Object.keys(allEngines);
  const startingEngine = source?.engine ?? engine ?? (registered.length === 1 ? registered[0] : null);
  if (!startingEngine) return { engines: allEngines, engine: null, mount: null, dropped: [] };

  const defs = ENGINE_PARAM_DEFINITIONS[startingEngine] || {};
  // Schema defaults first, so a partial config does not leave an engine
  // holding undefined for every key it omitted.
  let startParams = { ...getDefaultEngineParams(startingEngine), ...(params || {}) };
  let startGlobal = global || {};
  let modulation;
  let states = null;
  let initialState = null;
  let transition = null;
  let dropped = [];

  if (source) {
    const record = readConfig(source, defs);
    dropped = record.dropped;
    startParams = { ...startParams, ...record.params };
    if (record.global) startGlobal = { ...startGlobal, ...record.global };
    if (record.modulation) modulation = record.modulation;
    states = record.states;
    transition = record.transition;
    // An explicit `state` wins, but only if it names one; a typo should still
    // give a working orb in its default state rather than none.
    initialState = state && states?.[state] ? state : record.initialState;
  }

  return {
    engines: allEngines,
    engine: startingEngine,
    mount: { params: startParams, global: startGlobal, modulation, states, initialState, transition },
    dropped,
  };
}
```

- [ ] **Step 4: Use it in `create-orb.js`**

Replace everything in `createOrb` from `const { engines = {}, …` through `runtime.mountEngine(startingEngine, …); }` with:

```js
  const {
    engines = {},
    template = null,
    config = null,
    engine = null,
    params = null,
    global = null,
    state = null,
    autoStart = true,
    ...runtimeOptions
  } = options;

  if (!container) throw new TypeError('createOrb(container, …) needs a container element.');

  const runtime = new OrbRuntime(container, runtimeOptions);
  const plan = planMount({ engines, template, config, engine, params, global, state });

  for (const [id, factory] of Object.entries(plan.engines)) {
    if (typeof factory !== 'function') {
      console.error(`createOrb: engine "${id}" is not a factory function.`);
      continue;
    }
    runtime.registerEngine(id, factory);
  }

  const { dropped } = plan;
  if (plan.engine) runtime.mountEngine(plan.engine, plan.mount);
```

Replace the `ENGINE_PARAM_DEFINITIONS` and `readConfig` imports with `import { planMount } from './core/mount-plan.js';`. Keep `getDefaultEngineParams`, which `setEngine` still uses.

Replace `loadConfig` in the returned handle with:

```js
    loadConfig(nextConfig, { state: nextState = null } = {}) {
      const next = planMount({ config: nextConfig, state: nextState });
      runtime.mountEngine(next.engine, next.mount);
      return { engine: next.engine, dropped: next.dropped };
    },
    // Moves toward a named state from the config or template. Returns false,
    // and warns, for a name the config does not define.
    setState(name, opts) {
      return runtime.setState(name, opts);
    },
    get state() {
      return runtime.state;
    },
    get states() {
      return runtime.stateNames;
    },
```

Add a fourth example to the header comment, after the `nebula` example:

```js
//   import { ember } from '@lumaform/orb/templates';
//   const orb = createOrb(el, { template: ember, state: 'idle' });
//   orb.setState('thinking');
```

- [ ] **Step 5: Types in `index.d.ts`**

- Add to `OrbConfig`:

```ts
  states?: Record<string, OrbState>;
  initialState?: string;
  transition?: Transition;
```

- Add these new types:

```ts
export interface OrbState {
  /** A patch over the config's params. Only easable keys survive loading. */
  params?: ParamValues;
  /** Speed multiplier, 0.25–4, eased into the frame step. Default 1. */
  tempo?: number;
}
export interface Transition {
  durationMs?: number;
  easing?: 'linear' | 'easeOut' | 'easeInOut' | 'spring' | 'snap';
}
export interface OrbTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly engine: EngineFactory;
  readonly config: OrbConfig;
}
```

- Add to `ConfigRecord`: `states: Record<string, { params: ParamValues; tempo: number }> | null; initialState: string | null; transition: Required<Transition>;`
- Add to `OrbRuntime`: `setState(name: string, options?: Transition): boolean; readonly state: string | null; readonly stateNames: string[];`, and add `states`, `initialState` and `transition` to `mountEngine`'s state parameter type.
- Add to `CreateOrbOptions`: `template?: OrbTemplate | null; /** Starting state; falls back to the config's initialState if unknown. */ state?: string | null;`
- Add to `Orb`: `setState(name: string, options?: Transition): boolean; readonly state: string | null; readonly states: string[];`, and change `loadConfig` to `loadConfig(config: OrbConfig, options?: { state?: string }): { engine: string; dropped: string[] };`
- Add `export declare function sanitizeStates(states: unknown, defs: ParamSchema): { states: Record<string, { params: ParamValues; tempo: number }> | null; dropped: string[] };`

- [ ] **Step 6: Run the tests**

```bash
node packages/orb/tests/mount-plan.test.mjs | tail -1
npm test 2>&1 | grep -E "FAIL|SUITES"
```

Then set the README count to `There are 62 of them, 34 covering the runtime and 28 the studio.` and rerun. Expected: `ALL SUITES PASS (62)`.

- [ ] **Step 7: Check it in the embed example**

Run `npx vite examples/embed --port 5191`. Vite serves files inside the workspace under `/@fs/` plus their absolute path, so in the page console (with `ROOT` set to the absolute repo path):

```js
const ROOT = '/Users/ahmetbektes/WDesignspace/orb-animation';
const { createOrb } = await import(`/@fs${ROOT}/packages/orb/src/index.js`);
const { createRegardEngine } = await import(`/@fs${ROOT}/packages/orb/src/engines/regard-engine.js`);
const el = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'width:300px;height:300px' }));
const orb = createOrb(el, { template: { id: 't', name: 'T', description: '', engine: createRegardEngine,
  config: { version: 2, engine: 'regard', params: {}, states: { idle: { params: {} }, thinking: { params: { attention: 0.9 }, tempo: 1.5 } }, initialState: 'idle' } } });
orb.states; orb.state; orb.setState('thinking');
```

Expected: `orb.states` is `['idle', 'thinking']`, `orb.state` is `'idle'`, and the orb eases into thinking.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Accept a template and a starting state in createOrb

A template brings its own engine, so importing one template ships one
engine. The decision about what to register and mount moves into
mount-plan.js, which needs no renderer and is tested in Node. The handle
gains setState, state and states.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Record the decision in VISION, the changelog and the guide

**Files:**
- Modify: `docs/VISION.md`, `packages/orb/CHANGELOG.md`, `docs/GUIDE.md`

- [ ] **Step 1: VISION.md**

- **§3:** after the paragraph "**Practical consequence for anyone working here:** …", add:

```markdown
**Revisited 2026-10-03.** Named states are now built. Two products arrived at the same three states independently — `thinking-orbs` (logged in §9.1) and [shadercn](https://www.shadercn.run/docs/components/orbs/orb-07), both a fixed set of looks with `idle`, `thinking` and `speaking`, consumed in one line — and Reddit feedback read our open-ended sampler as generated. The vocabulary stays open in the format: names are free strings and the runtime gives none of them meaning. What is fixed is only the starter set the templates use. Exploration continues; it now has somewhere to land.
```

- **§8:** replace the first bullet ("**The state schema and a `setState()` runtime.** …") with:

```markdown
- ~~**The state schema and a `setState()` runtime.**~~ Built 2026-10-03; see §3 and the decision log.
```

- **§7:** add three rows to the decision log table:

```markdown
| Named states built before exploration produced them (2026-10-03) | Two independent products converged on idle / thinking / speaking; see §3. Names stay open. |
| A state may change only easable keys, plus colours | Easing a rate or geometry param over 600 ms fails the same way modulating it does. Enforced on load by `sanitizeStates`, not by author discipline. |
| Speed between states is `tempo`, integrated into the frame step | A rate cannot be eased without the jump; a multiplier on the step can. |
```

- **§9.1:** after the `thinking-orbs` evidence paragraph, add:

```markdown
   **Second signal, logged 2026-10-03.** [shadercn](https://www.shadercn.run) ships 33 shader orbs as React components, each with `state: "idle" | "thinking" | "speaking"` easing between built-in presets, plus `volumes` for input and output level. Same product shape as `thinking-orbs`, arrived at independently. Acted on: see §3.
```

- [ ] **Step 2: Changelog**

Under `## [Unreleased]` → `### Added` in `packages/orb/CHANGELOG.md`, add:

```markdown
- `setState(name)` on `OrbRuntime` and on the handle `createOrb` returns. It eases toward a named state from the config (default 600 ms, `easeInOut`; override per call), including the state's `tempo`. An interrupted transition starts from what is on screen. An unknown name warns and returns `false`. `state` and `states` report the current state and the names available.
- `createOrb(el, { template, state })`. A template carries its engine and a config with states; `state` picks where it starts.
```

- [ ] **Step 3: GUIDE.md**

After the section on making the orb react to sound, add a section `## 6. States`. It should cover: a config with `states` (show the v2 JSON from the spec, §3), `createOrb(el, { config, state: 'idle' })`, and calling `orb.setState('thinking')` when the assistant starts working and `orb.setState('speaking')` when TTS starts. Add one sentence on why speed changes go in `tempo`. Renumber any later sections.

- [ ] **Step 4: Run the tests and commit**

```bash
npm test 2>&1 | grep -E "FAIL|SUITES"
git add -A
git commit -m "Record why named states are built now

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `ALL SUITES PASS (62)`.

---

# Part B: The finish pass

### Task 7: The finish pass module

**Files:**
- Create: `packages/orb/src/core/finish-pass.js`
- Test: `packages/orb/tests/finish-pass.test.mjs`
- Modify: `packages/orb/src/internal/index.js`

**Interfaces:**
- Produces:
  - `FINISH_DEFAULTS`: `{ contrast: 1, saturation: 1, grain: 0, edgeFade: 0, lightCoverage: 0 }`
  - `FINISH_RANGES`
  - `resolveFinish(current, patch)`: clamps, ignores non-numbers, returns a new object.
  - `isIdentityFinish(finish, { transparent })`
  - `createFinishPass()`, returning `{ pass, settings, set(globalPatch, { transparent }), frame({ center: [x, y], radius, aspect, seed }) }`. `center` is in UV units (0..1). `radius` is the orb's radius as a fraction of the viewport half-height.

- [ ] **Step 1: Write the failing test**

Create `packages/orb/tests/finish-pass.test.mjs`:

```js
// The finish pass must be invisible until asked for: every existing config
// renders identically, and the pass costs nothing while it is at identity.
import {
  FINISH_DEFAULTS, resolveFinish, isIdentityFinish, createFinishPass,
} from '../src/core/finish-pass.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

ok('defaults are identity', isIdentityFinish(FINISH_DEFAULTS, { transparent: false }));
ok('contrast off identity', !isIdentityFinish({ ...FINISH_DEFAULTS, contrast: 1.2 }, { transparent: false }));
ok('lightCoverage is ignored on an opaque background',
  isIdentityFinish({ ...FINISH_DEFAULTS, lightCoverage: 0.5 }, { transparent: false }));
ok('lightCoverage counts on a transparent one',
  !isIdentityFinish({ ...FINISH_DEFAULTS, lightCoverage: 0.5 }, { transparent: true }));

const resolved = resolveFinish(FINISH_DEFAULTS, { contrast: 9, grain: -1, saturation: 'x', unrelated: 5 });
ok('clamps to the top of a range', resolved.contrast === 2);
ok('clamps to the bottom of a range', resolved.grain === 0);
ok('ignores non-numbers', resolved.saturation === 1);
ok('ignores keys it does not own', !('unrelated' in resolved));
ok('does not mutate its input', FINISH_DEFAULTS.contrast === 1);

const finish = createFinishPass();
ok('the pass starts disabled', finish.pass.enabled === false);
finish.set({ contrast: 1.3, saturation: 0.6 }, { transparent: false });
ok('a non-identity setting enables it', finish.pass.enabled === true);
const u = finish.pass.material.uniforms;
ok('contrast reaches its uniform', u.uContrast.value === 1.3);
ok('saturation reaches its uniform', u.uSaturation.value === 0.6);
finish.set({ lightCoverage: 0.7 }, { transparent: false });
ok('lightCoverage is zeroed when opaque', u.uLightCoverage.value === 0);
finish.set({}, { transparent: true });
ok('lightCoverage applies when transparent', u.uLightCoverage.value === 0.7);
finish.set({ contrast: 1, saturation: 1, lightCoverage: 0 }, { transparent: true });
ok('back to identity disables it', finish.pass.enabled === false);

finish.frame({ center: [0.4, 0.6], radius: 0.8, aspect: 1.5, seed: 3 });
ok('frame sets the centre', u.uCenter.value.x === 0.4 && u.uCenter.value.y === 0.6);
ok('frame sets the radius and aspect', u.uRadius.value === 0.8 && u.uAspect.value === 1.5);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node packages/orb/tests/finish-pass.test.mjs`
Expected: `Cannot find module '…/finish-pass.js'`.

- [ ] **Step 3: Implement**

Create `packages/orb/src/core/finish-pass.js`:

```js
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// The last grade before the backdrop: what makes a look read as finished
// rather than as a raw shader. Runs after OutputPass, so it works on
// display-referred sRGB — contrast around a mid-grey that means mid-grey on
// screen — and before the background pass, so the backdrop stays the exact
// colour picked.
//
// The buffer holds premultiplied light, and glow carries colour with little or
// no coverage (see background-pass.js). So every grade is weighted by
// `presence` — coverage, or light — and empty background is never touched: a
// contrast below 1 would otherwise lift black into a grey veil over the frame.

export const FINISH_DEFAULTS = Object.freeze({
  contrast: 1, saturation: 1, grain: 0, edgeFade: 0, lightCoverage: 0,
});

export const FINISH_RANGES = Object.freeze({
  contrast: [0.5, 2], saturation: [0, 2], grain: [0, 0.15], edgeFade: [0, 1], lightCoverage: [0, 1],
});

export function resolveFinish(current, patch) {
  const out = { ...current };
  for (const key of Object.keys(FINISH_DEFAULTS)) {
    const value = patch?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const [lo, hi] = FINISH_RANGES[key];
    out[key] = Math.min(hi, Math.max(lo, value));
  }
  return out;
}

// lightCoverage only means something over a transparent background: on an
// opaque one, raising alpha under glow would darken the backdrop behind it.
export function isIdentityFinish(finish, { transparent }) {
  return Object.keys(FINISH_DEFAULTS).every((key) =>
    key === 'lightCoverage' && !transparent ? true : finish[key] === FINISH_DEFAULTS[key]);
}

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uGrain: { value: 0 },
    uEdgeFade: { value: 0 },
    uLightCoverage: { value: 0 },
    uSeed: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRadius: { value: 0.8 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uGrain;
    uniform float uEdgeFade;
    uniform float uLightCoverage;
    uniform float uSeed;
    uniform vec2 uCenter;
    uniform float uRadius;
    uniform float uAspect;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 rgb = src.rgb;
      float a = src.a;
      float peak = max(rgb.r, max(rgb.g, rgb.b));
      float presence = clamp(max(a, peak * 4.0), 0.0, 1.0);

      float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(vec3(luma), rgb, uSaturation);
      vec3 graded = clamp((rgb - 0.5) * uContrast + 0.5, 0.0, 1.0);
      rgb = mix(rgb, graded, presence);

      // Seeded from virtual time, so a paused orb holds still instead of
      // crawling with static.
      float n = hash(gl_FragCoord.xy + uSeed) - 0.5;
      rgb += n * uGrain * presence;

      if (uEdgeFade > 0.0) {
        // Distance from the orb's centre in viewport half-heights, the unit
        // uRadius is measured in.
        float d = length((vUv - uCenter) * vec2(uAspect, 1.0)) * 2.0;
        float inner = uRadius * (1.0 - 0.6 * uEdgeFade);
        float outer = uRadius * (1.0 + 0.25 * uEdgeFade);
        float mask = 1.0 - smoothstep(inner, outer, d);
        rgb *= mask;
        a *= mask;
      }

      a = max(a, clamp(max(rgb.r, max(rgb.g, rgb.b)) * uLightCoverage, 0.0, 1.0));
      gl_FragColor = vec4(max(rgb, 0.0), a);
    }
  `,
};

export function createFinishPass() {
  const pass = new ShaderPass(FinishShader);
  pass.enabled = false;
  const u = pass.material.uniforms;
  let settings = { ...FINISH_DEFAULTS };
  let transparent = false;

  return {
    pass,
    get settings() {
      return settings;
    },
    // Takes the whole global bag; only the five finish keys are read.
    set(globalPatch, { transparent: nextTransparent } = {}) {
      settings = resolveFinish(settings, globalPatch);
      if (nextTransparent !== undefined) transparent = !!nextTransparent;
      u.uContrast.value = settings.contrast;
      u.uSaturation.value = settings.saturation;
      u.uGrain.value = settings.grain;
      u.uEdgeFade.value = settings.edgeFade;
      u.uLightCoverage.value = transparent ? settings.lightCoverage : 0;
      pass.enabled = !isIdentityFinish(settings, { transparent });
    },
    frame({ center, radius, aspect, seed }) {
      u.uCenter.value.set(center[0], center[1]);
      u.uRadius.value = radius;
      u.uAspect.value = aspect;
      u.uSeed.value = seed;
    },
  };
}
```

Append to `packages/orb/src/internal/index.js`:

```js
// The finishing grade. The studio's grid composer runs the per-pixel part of
// it, so cells and the main view agree on contrast, saturation and grain.
export { createFinishPass, FINISH_DEFAULTS, FINISH_RANGES } from '../core/finish-pass.js';
```

- [ ] **Step 4: Run the test**

Run: `node packages/orb/tests/finish-pass.test.mjs | tail -1`
Expected: `ALL PASS`.

- [ ] **Step 5: README count and commit**

Set the README count to `There are 63 of them, 35 covering the runtime and 28 the studio.` Run `npm test`. Expected: `ALL SUITES PASS (63)`.

```bash
git add -A
git commit -m "Add a finish pass for contrast, grain and a soft edge

Five settings, all identity by default, so every existing config renders
unchanged and the pass stays disabled until one of them moves. Grades
are weighted by coverage or light, so empty background is never lifted
into a veil. lightCoverage turns glow into alpha on transparent pages,
where additive light would otherwise vanish into a white page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wire the finish pass into the runtime

**Files:**
- Modify: `packages/orb/src/core/runtime.js`, `packages/orb/CHANGELOG.md`

**Interfaces:**
- Consumes: `createFinishPass` (Task 7).
- Produces: the globals `contrast`, `saturation`, `grain`, `edgeFade` and `lightCoverage` are honoured by `updateGlobalSettings`, and so by configs.

- [ ] **Step 1: Add the pass between output and background**

In `initPostProcessing()`, after `this.composer.addPass(this.outputPass);` and before the background pass, add:

```js
    // After tone mapping, before the backdrop: grades the orb in display
    // space and leaves the picked background colour exact. See finish-pass.js.
    this.finish = createFinishPass();
    this.composer.addPass(this.finish.pass);
```

Add the import: `import { createFinishPass } from './finish-pass.js';`

- [ ] **Step 2: Apply the globals**

At the end of `updateGlobalSettings(global)`, after `this.background.set(…)`, add:

```js
    // transparentBg may arrive without any finish key, and lightCoverage
    // depends on it, so this runs on every update rather than on finish keys.
    this.finish.set(global, { transparent: global.transparentBg });
```

- [ ] **Step 3: Feed the per-frame uniforms**

Add a field in the constructor, after `this.smoothedPointer`: `this.finishProbe = new THREE.Vector3();`. Then add a method before `render()`:

```js
  // Where the orb is on screen, for the finish pass's edge fade. The orb sits
  // at the orbit target; its radius in viewport half-heights follows from the
  // engine's frame hint and the camera distance, so a zoom or a portrait
  // container moves the fade with it.
  updateFinishFrame() {
    if (!this.finish.pass.enabled) return;
    const target = this.controlsTarget;
    const ndc = this.finishProbe.copy(target).project(this.camera);
    const distance = this.camera.position.distanceTo(target);
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * distance;
    this.finish.frame({
      center: [(ndc.x + 1) / 2, (ndc.y + 1) / 2],
      radius: halfHeight > 0 ? engineFrameRadius(this.activeEngine) / halfHeight : 1,
      aspect: this.camera.aspect,
      // Steps 24 times a second of virtual time: film-like, and frozen on pause.
      seed: (Math.floor(this.virtualTime * 24) % 997) * 0.618,
    });
  }
```

In `render()`, call `this.updateFinishFrame();` immediately before `lightCarriesNoCoverage(this.scene);`.

In `dispose()`, after `this.background?.pass.dispose();`, add `this.finish?.pass.dispose();`.

- [ ] **Step 4: Check in the studio**

Run `npm test`. Expected: `ALL SUITES PASS (63)`. Then in the studio console:

```js
const { studio, store, state } = __orb;
const shot = () => studio.renderer.domElement.toDataURL().length;
const before = shot();
studio.applyParams({ params: state.engines[state.engine], global: { contrast: 1.6, saturation: 0.2 } });
studio.renderFrame();
({ enabled: studio.finish.pass.enabled, changed: shot() !== before });
```

Expected: `{ enabled: true, changed: true }`. Take a screenshot showing a desaturated, contrasty orb. Then set `{ contrast: 1, saturation: 1 }` and check that `studio.finish.pass.enabled === false`.

Then check `edgeFade` (0.6) and `grain` (0.08) the same way, and take a screenshot. Then check `lightCoverage` on white: `global: { transparentBg: true, lightCoverage: 0.7 }`, with `document.body.style.background = '#fff'` and the canvas container set to a transparent background. Expected: the orb's glow is visible on white rather than washed out. Repeat with `lightCoverage: 0` for comparison, and take both screenshots.

- [ ] **Step 5: Changelog and commit**

Under `### Added` in `packages/orb/CHANGELOG.md`:

```markdown
- Five finishing settings in a config's `global`: `contrast` (0.5–2), `saturation` (0–2), `grain` (0–0.15), `edgeFade` (0–1, a soft falloff around the framed orb) and `lightCoverage` (0–1, transparent backgrounds only: lets glow show on a light page instead of vanishing into it). All default to no change, and the pass costs nothing until one moves.
```

```bash
git add -A
git commit -m "Run the finish pass in the runtime

Between OutputPass and the background pass. The edge fade follows the
framed orb through zoom and portrait containers, and grain steps on
virtual time so a paused orb holds still.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The finish pass in grid cells

**Files:**
- Modify: `packages/studio/src/core/variation-grid.js`, `docs/VISION.md`

- [ ] **Step 1: Add the pass to the cell composer**

In `variation-grid.js`, add `createFinishPass` to the import from `'@lumaform/orb/internal'`. After `cellComposer.addPass(new OutputPass());` add:

```js
  // The per-pixel part of the main view's finish, so contrast, saturation and
  // grain read the same in a cell as after promotion. edgeFade needs each
  // cell's own centre and is left out, like bloom (VISION §5).
  const cellFinish = createFinishPass();
  cellComposer.addPass(cellFinish.pass);
```

- [ ] **Step 2: Set it per render**

Where `cellBackground.set({ background: globalSettings?.background, transparent });` is called (around line 472), add right after it:

```js
      cellFinish.set({ ...globalSettings, edgeFade: 0 }, { transparent });
```

Where `cellBackground.pass.dispose();` is called (around line 603), add `cellFinish.pass.dispose();`.

- [ ] **Step 3: VISION §5**

At the end of the "Bloom is a full-screen pass" paragraph, add: `The finish pass's edgeFade is left out of cells for the same reason: it needs each cell's own centre. Contrast, saturation and grain are per-pixel and do run in cells.`

- [ ] **Step 4: Check and commit**

Run `npm test`. Expected: `ALL SUITES PASS (63)`. In the studio, set `contrast: 1.6, saturation: 0.2` (as in Task 8), press **G**, and take a screenshot: the cells should be desaturated like the main view.

```bash
git add -A
git commit -m "Grade grid cells with the per-pixel finish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Finish sliders in the studio

**Files:**
- Modify: `packages/studio/src/core/state.js`, `packages/studio/src/ui/studio-format.js`, `packages/studio/src/ui/studio-params.js`

- [ ] **Step 1: Defaults.** In `DEFAULT_GLOBAL_SETTINGS` (`state.js`), add after `bloomThreshold`:

```js
  // The finishing grade. Identity here, so a fresh session renders exactly as
  // before; templates are where these move.
  contrast: 1,
  saturation: 1,
  grain: 0,
  edgeFade: 0,
  lightCoverage: 0,
```

- [ ] **Step 2: Row definitions.** Add to `GLOBAL_NUMBER_DEFINITIONS` (`studio-format.js`):

```js
  contrast: { label: 'Contrast', min: 0.5, max: 2, step: 0.01, default: DEFAULT_GLOBAL_SETTINGS.contrast },
  saturation: { label: 'Saturation', min: 0, max: 2, step: 0.01, default: DEFAULT_GLOBAL_SETTINGS.saturation },
  grain: { label: 'Grain', min: 0, max: 0.15, step: 0.005, default: DEFAULT_GLOBAL_SETTINGS.grain },
  edgeFade: { label: 'Edge Fade', min: 0, max: 1, step: 0.01, default: DEFAULT_GLOBAL_SETTINGS.edgeFade },
  lightCoverage: { label: 'Glow on Light Pages', min: 0, max: 1, step: 0.01, default: DEFAULT_GLOBAL_SETTINGS.lightCoverage },
```

- [ ] **Step 3: The FINISH section.** In `renderOpticsTab()` (`studio-params.js`), insert this section between the bloom section and "TONE MAPPING & CAMERA". It reuses the existing row renderer, so reading and writing already work through `numberValue` and `writeNumberValue`:

```js
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">FINISH</span>
      </div>
      <div class="controls-list">
        ${['contrast', 'saturation', 'grain', 'edgeFade', 'lightCoverage'].map((key) =>
          this.renderNumberRow({
            key,
            def: GLOBAL_NUMBER_DEFINITIONS[key],
            value: g[key],
            attr: `data-global="${key}"`,
            scope: 'global',
          })
        ).join('')}
      </div>
    </div>
```

- [ ] **Step 4: Run the tests**

```bash
npm test 2>&1 | grep -E "FAIL|SUITES"
```

Expected: `ALL SUITES PASS (63)`. `css-hygiene` passes because no new classes are added.

- [ ] **Step 5: Check in the studio.** Open Tune → Optics. Drag Contrast and confirm the orb responds live. Drag Edge Fade and confirm the edge softens. Press the reset on each row and confirm it returns to identity, with `studio.finish.pass.enabled === false` once all five are reset. Export a config and confirm the five keys appear in `global`. Take a screenshot of the section.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add finish sliders to the Optics tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Part C: Copy

### Task 11: The copy guard

**Files:**
- Create: `packages/studio/tests/copy-hygiene.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write the guard**

Create `packages/studio/tests/copy-hygiene.test.mjs`:

```js
// Copy that reads as generated. Reddit's verdict on the studio was "AI slop",
// and the loudest tell was the words: a page titled "Hyper-Geometric 3D
// Shaders", presets of "lime quantum photon packets" against "pure obsidian
// void". This scans every user-facing string the catalog, presets and page
// carry, so the register cannot drift back.
//
// The list targets tone, not subject. Mathematics stays: hypercube, hyperboloid
// and hyperbolic are what those things are called. `quantum` is allowed only
// for Superposition, which draws real quantum orbitals.
import { readFileSync } from 'node:fs';
import { ENGINE_CATALOG } from '@lumaform/orb';
import { PRESET_LIBRARY } from '../src/presets/preset-library.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const BANNED = [
  /\bcyber\w*/i, /\bneon\b/i, /\bvoid\b/i, /\bobsidian\b/i, /\bpristine\b/i,
  /\bethereal\b/i, /\baetheric\b/i, /\bmatrix\b/i, /\bcelestial\b/i, /\bcosmic\b/i,
  /\btranscend\w*/i, /\bmystic\w*/i, /\bsacred\b/i, /\bmerkabah\b/i, /\bquantum\b/i,
  /\bhyperspace\b/i, /\bhyper-\w+/i,
];
const ALLOWED = { superposition: [/\bquantum\b/i] };

function offences(text, engine) {
  const allowed = ALLOWED[engine] || [];
  return BANNED
    .filter((re) => !allowed.some((a) => a.source === re.source))
    .map((re) => re.exec(text || '')?.[0])
    .filter(Boolean);
}

const found = [];
for (const entry of ENGINE_CATALOG) {
  for (const field of ['name', 'badge', 'description']) {
    for (const word of offences(entry[field], entry.id)) found.push(`catalog ${entry.id}.${field}: "${word}"`);
  }
  for (const [key, def] of Object.entries(entry.params)) {
    for (const word of offences(def.label, entry.id)) found.push(`catalog ${entry.id}.params.${key}.label: "${word}"`);
  }
}
for (const preset of PRESET_LIBRARY) {
  for (const field of ['name', 'badge', 'description']) {
    for (const word of offences(preset[field], preset.engine)) found.push(`preset "${preset.name}" .${field}: "${word}"`);
  }
}
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
for (const word of offences(head, null)) found.push(`index.html <head>: "${word}"`);

ok('no generated-sounding words in user-facing copy', found.length === 0,
  found.length ? `\n  ${found.join('\n  ')}` : '');

// Renaming a preset must not orphan the engine whose default it was.
const names = new Set(PRESET_LIBRARY.map((p) => `${p.engine}/${p.name}`));
const orphaned = ENGINE_CATALOG
  .filter((e) => !names.has(`${e.id}/${e.defaultPreset}`))
  .map((e) => `${e.id} → "${e.defaultPreset}"`);
ok('every catalog defaultPreset names a preset of that engine', orphaned.length === 0, orphaned.join(', '));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails, and keep the list**

```bash
node packages/studio/tests/copy-hygiene.test.mjs
```

Expected: `FAIL  no generated-sounding words…`, followed by about 60 lines of offences. The `defaultPreset` check should **pass** now; if it fails, an engine's default is already broken, and fixing that comes before anything else. The list is the worklist for Tasks 12–14.

- [ ] **Step 3: README count and commit**

Set the README count to `There are 64 of them, 35 covering the runtime and 29 the studio.` Commit the guard while it is red: it's the specification for the next three tasks, and the branch is not merged until it passes.

```bash
git add -A
git commit -m "Add a guard against generated-sounding copy

Fails today, deliberately; the next three commits make it pass. Also
checks that every catalog defaultPreset still names a real preset, which
nothing did, so the renames ahead can't orphan an engine's default.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Rewrite the catalog

**Files:**
- Modify: `packages/orb/src/catalog/analytic.js`, `packages/orb/src/catalog/bodies.js`, `packages/orb/CHANGELOG.md`

Only display text changes: `name`, `badge`, `description` and `label`. **Never change an `id`, a parameter key or a `defaultPreset` in this task.**

- [ ] **Step 1: Engine entries.** Find each by `id:`, and replace the fields shown:

| id | name | badge | description |
| --- | --- | --- | --- |
| `tesseract` | `Tesseract` | (keep) | `A four-dimensional cube projected into 3D. The inner and outer cubes trade places as it turns through the fourth dimension.` |
| `moire` | (keep) | (keep) | `String art in three dimensions: straight lines strung between two rings and twisted until their crossings make moiré. Nine shapes, from funnels to saddles.` |
| `auris` | `Auris` | `Lit Polyhedra` | `Geodesic polyhedra and Kepler compounds in wireframe and facet, lit from one side with line hatching.` |
| `polytope` | `Star Polytope` | `Star Tetrahedron` | `Two interlocked tetrahedra turning against each other around a Kepler–Poinsot star, with dispersion on the facets.` |
| `nebula` | (keep) | (keep) | `A gyroid surface raymarched as a glowing volume inside a soft atmospheric shell, with chromatic aberration and fine sparkle.` |
| `quantum` | `Fractal Lattice` | `IFS Fractal` | `A recursive iterated-function lattice folded through four dimensions and traced with glowing orbit lines.` |
| `singularity` | `Black Hole` | `Accretion Disk` | (keep) |
| `kaliset` | (keep) | (keep) | `Lace drawn by the Kaliset fold: points folded and inverted again and again, lit where their orbit passes near a ring.` |
| `aetheria` | (keep) | `Fluid Pearl` | `A pearl of slow fluid: warped ripples on the surface, a dispersive rim, and caustics moving underneath.` |
| `superposition` | (keep) | (keep) | `Orbital lobes from two quantum states beating against each other. A click measures it: the cloud collapses to one spot, then spreads out again.` |
| `synthesis` | (keep) | `Merging Bodies` | `Four fluid bodies on a figure-eight orbit, merging through liquid bridges as they pass and pulling apart again.` |
| `ferrotrails` | (keep) | `Ferrofluid` | `A ferrofluid core whose spikes rise and fall, circled by ribbon trails that follow its field.` |

- [ ] **Step 2: Parameter labels**

| id | key | new label |
| --- | --- | --- |
| `tesseract` | `rotSpeedXW` | `4D Rotation XW` |
| `tesseract` | `rotSpeedYW` | `4D Rotation YW` |
| `quantum` | `color1` | `Primary Colour` |
| `quantum` | `color2` | `Secondary Colour` |
| `quantum` | `color3` | `Core Colour` |
| `quantum` | `morphSpeed` | `Morph Speed` |
| `nebula` | `color2` | `Secondary Colour` |
| `synthesis` | `envelopeRadius` | `Envelope Radius` |
| `synthesis` | `veilColor` | `Veil Glow` |
| `ferrotrails` | `colorTrail1` | `Trail Head Colour` |
| `ferrotrails` | `colorTrail2` | `Trail Tail Colour` |
| `attractor` | `colorBg` | `Background` |

`attractor` is in `packages/orb/src/catalog/refined.js`; add it to this task's Files.

- [ ] **Step 3: Run the guard and the catalog tests**

```bash
node packages/studio/tests/copy-hygiene.test.mjs | grep -c "catalog "
node packages/orb/tests/engine-catalog.test.mjs | tail -1
node packages/studio/tests/docs-facts.test.mjs | tail -1
```

Expected: `0` catalog offences and `ALL PASS` from both.

Then update the README engine table, which `docs-facts` doesn't check by name. Change only the name and badge columns and keep each row's parameter count:

| Row starting | New name — badge |
| --- | --- |
| `` `tesseract` — 4D Tesseract `` | `Tesseract` — Hypercube projection |
| `` `auris` — Auris Light `` | `Auris` — Lit polyhedra |
| `` `polytope` — Sacred Polytope `` | `Star Polytope` — Star tetrahedron |
| `` `quantum` — Quantum Lattice `` | `Fractal Lattice` — IFS fractal |
| `` `singularity` — Chrono Singularity `` | `Black Hole` — Accretion disk |

Also update the badge column for `aetheria`, `synthesis` and `ferrotrails` to match Step 1, lowercased like the other rows. Then run `node packages/studio/tests/docs-facts.test.mjs | tail -1`. Expected: `ALL PASS`.

- [ ] **Step 4: Changelog and commit**

Under `### Changed`:

```markdown
- Plainer catalog copy. Display names: `tesseract` is "Tesseract", `auris` "Auris", `polytope` "Star Polytope", `quantum` "Fractal Lattice", `singularity` "Black Hole". Several descriptions and parameter labels are rewritten. Engine ids and parameter keys are unchanged, so configs load as before.
```

```bash
git add -A
git commit -m "Rewrite the catalog copy that read as generated

Display text only: ids, parameter keys and default presets are unchanged,
so every saved config still loads.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Rewrite and rename presets

**Files:**
- Modify: `packages/studio/src/presets/{moire,analytic,bodies,simulation,flow}.js`, `packages/orb/src/catalog/{analytic,bodies,simulation}.js` (`defaultPreset` only), `packages/studio/tests/ab-compare.test.mjs`, `packages/studio/tests/randomize.test.mjs`

- [ ] **Step 1: Apply the preset table.** "(keep)" means leave that field unchanged.

| engine | current name | new name | new badge | new description |
| --- | --- | --- | --- | --- |
| moire | `9. Bilateral Winged Moiré` | (keep) | (keep) | `Two mirrored fans of string arching into wing horns, a recessed centre, and a curling fringe.` |
| moire | `Cyber Gold Chiral Vortex` | `Gold Chiral Funnel` | `3D Gold Funnel` | `A gold hyperboloid funnel with a slow wave running through it, glowing against black.` |
| moire | `Electric Cyan Moiré Rosette` | (keep) | `3D Cyan Rosette` | (keep) |
| auris | `Sacred Hexagonal Rosette` | `Hexagonal Rosette` | `Six-Fold` | (keep) |
| tesseract | `Harmonic Hyper-Fold` | `Harmonic Fold` | (keep) | `The inner and outer cubes exchange places through the eight corner struts without shearing.` |
| tesseract | `Cyber Matrix Tesseract` | `Emerald Tesseract` | `Emerald & Violet` | `An emerald outer cube around a violet inner one, with small lime lights travelling along the struts between them.` |
| tesseract | `Monochrome Architect` | (keep) | (keep) | `White and titanium wireframes, precisely aligned, on black.` |
| hopf | `Clifford Quantum Vortex` | `Clifford Vortex` | (keep) | `Nested Villarceau circles in continuous Clifford translation, with light streaming along them.` |
| hopf | `Aetheric Torus` | `Pastel Torus` | `Pastel` | `Pastel fibre ribbons forming linked Villarceau circles.` |
| hopf | `Neon Villarceau` | `Dense Villarceau` | `48 Fibres` | `A dense 48-circle Hopf fibration in fast Clifford circulation.` |
| polytope | `Lumaform Gold Merkabah` | `Gold Star Tetrahedron` | (keep) | (keep) |
| polytope | `Obsidian Sacred Core` | `Dark Star Core` | `Dark Facets` | `Dark glassy facets reflecting cyan wireframes, with a magenta star turning the other way.` |
| nebula | `Void Singularity` | `Violet Depths` | `Deep Violet` | `A deep violet volume with strong chromatic aberration, ultraviolet folds and fine diamond sparkle.` |
| quantum | `Cyber Matrix` | `Phosphor Lattice` | `Green Lattice` | `A phosphor-green lattice folding through four dimensions, traced in fine glowing lines.` |
| quantum | `Quantum Prism` | `Prism Lattice` | `Spectral` | `A many-coloured lattice that refracts as it folds, flickering at high frequency.` |
| kaleido | `Gilded Rose Window` | (keep) | `Eight-Fold` | `An eight-fold gilded mandala of glowing contour lines, turning slowly.` |
| flux | `Neon Voice Ribbon` | `Voice Ribbon` | (keep) | (keep) |
| aetheria | `Iridescent Aurora` | (keep) | (keep) | `Mint, peach and pale azure fluid breathing gently under soft subsurface light.` |
| synthesis | `Gemini Harmonic` | (keep) | (keep) | `Four fluid bodies on a figure-eight orbit, merging through liquid bridges as they pass.` |
| synthesis | `Celestial Symbiosis` | `Four-Colour Ballet` | (keep) | `Sapphire, lavender, rose and amber lobes linked by glowing filaments, with small sparkles orbiting.` |
| ferrotrails | `Magnetic Nebula Oval` | (keep) | (keep) | `An elongated ferrofluid core with cyan spikes, wrapped in azure and violet arc trails.` |
| ferrotrails | `Obsidian Solar Arc` | `Amber Dynamo` | (keep) | `A dark liquid sphere with amber and gold spikes, bound by tight ruby arc trails and dense motes.` |

- [ ] **Step 2: Update every reference to a renamed preset**

```bash
for n in "Lumaform Gold Merkabah" "Cyber Gold Chiral Vortex" "Sacred Hexagonal Rosette" "Harmonic Hyper-Fold" "Cyber Matrix Tesseract" "Clifford Quantum Vortex" "Aetheric Torus" "Neon Villarceau" "Obsidian Sacred Core" "Void Singularity" "Cyber Matrix" "Quantum Prism" "Neon Voice Ribbon" "Celestial Symbiosis" "Obsidian Solar Arc"; do
  grep -rnF "$n" packages README.md docs/GUIDE.md examples | grep -v -e node_modules -e dist -e "docs/superpowers"
done
```

Expected references, all of which must be updated to the new names:
- `defaultPreset` lines in `packages/orb/src/catalog/analytic.js` (Lumaform Gold Merkabah, Clifford Quantum Vortex, Cyber Matrix) and `simulation.js` (Neon Voice Ribbon).
- `activePresetName: 'Cyber Matrix'` in `packages/studio/tests/ab-compare.test.mjs`.
- `activePresetName: 'Neon Voice Ribbon'` in `packages/studio/tests/randomize.test.mjs`.

Rerun the loop. Expected: no output, apart from the preset files' own new names if a substring overlaps.

- [ ] **Step 3: Run the guard and the suite**

```bash
node packages/studio/tests/copy-hygiene.test.mjs
npm test 2>&1 | grep -E "FAIL|SUITES"
```

Expected: the only remaining offences are in `index.html <head>` (Task 14). The `defaultPreset` check passes. Every other suite passes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Rename and rewrite presets that read as generated

Every renamed preset's references move with it: the catalog defaults
and two tests. The guard's defaultPreset check proves none was missed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Page title, meta and backdrop buttons

**Files:**
- Modify: `packages/studio/index.html:6-8`, `packages/studio/src/ui/studio-params.js:239-242`

- [ ] **Step 1: index.html**

Replace lines 6–8 with:

```html
    <title>Lumaform Orb</title>
    <meta name="description" content="A studio for designing animated orbs for AI assistants: dozens of shader engines, a variation grid for exploring them, and a runtime that ships the result." />
    <meta property="og:title" content="Lumaform Orb" />
```

If there are other `og:` or `twitter:` tags carrying the old text, apply the same treatment. Find them with `grep -n "Hyper-Geometric\|hyper-geometric" packages/studio/index.html`.

- [ ] **Step 2: Backdrop buttons.** In `renderSpaceTab()`, change only the button labels. Keep the `data-bg` values, so the colours are unchanged: `Void Black` → `Black`, `Deep Navy` → `Navy`, `Obsidian` → `Oxblood`, `Violet Void` → `Violet`.

- [ ] **Step 3: Run the guard and the full suite**

```bash
node packages/studio/tests/copy-hygiene.test.mjs | tail -1
npm test 2>&1 | grep -E "FAIL|SUITES"
npm run build 2>&1 | grep -E "built in|rror"
```

Expected: `ALL PASS`, `ALL SUITES PASS (64)`, and a clean build.

- [ ] **Step 4: Check in the studio.** Confirm the browser tab reads "Lumaform Orb" and that Tune → Space shows the four renamed buttons, each still selecting its colour. Take a screenshot.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Give the page and the backdrop buttons plain names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Final verification and pull request

- [ ] **Step 1: Full suite and build**

```bash
npm test 2>&1 | tail -1
npm run build 2>&1 | grep -E "built in|rror"
```

Expected: `ALL SUITES PASS (64)` and a clean build.

- [ ] **Step 2: The changelog reads as one release.** Open `packages/orb/CHANGELOG.md` and confirm that `[Unreleased]` has Added (22 engines, config v2, `setState`, `createOrb` template/state, finish settings), Changed (catalog copy) and Fixed (Auris, Polytope), in that order.

- [ ] **Step 3: Push and open the PR against `main`.** This branch is built on `add-22-engines` (PR #12). If #12 has merged, rebase onto `main` first. If not, open this PR with base `add-22-engines` and say so in the description. The description lists the three parts, the screenshots from Tasks 8–10 and 14, and the verification commands with their output.

---

## Not in this plan

Plan 2 covers the studio States strip (spec §8). Plan 3 covers authoring the 8 templates and `@lumaform/orb/templates` (spec §6, plus the `templates.test.mjs` from §9). Each follows once this plan has merged.
