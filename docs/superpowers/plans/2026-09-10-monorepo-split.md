# Monorepo Split — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the repo into `packages/orb` (a reusable runtime) and `packages/studio` (the exploration tool) without changing a single observable behaviour.

**Architecture:** npm workspaces, two packages. `OrbRuntime` in `packages/orb` owns the renderer, scene, camera, bloom composer, engine registry, modulation and the frame loop. `OrbStudio` in `packages/studio` extends it and adds the variation grid, clip capture, rehearsal sequences and param tweening through **hook methods that `OrbRuntime` declares as no-ops**. All 22 engines move to `packages/orb` unchanged.

**Tech Stack:** Vanilla JS (ES modules), Vite 5, Three.js 0.160, npm workspaces. Tests are plain Node scripts, no framework.

## Global Constraints

- **No behaviour changes.** This phase is a pure refactor. If the studio looks or acts different, something is wrong. Do not add features, do not fix unrelated bugs, do not reformat untouched code.
- **All 36 tests stay green at every task boundary.** They are the only safety net for a ~12k LOC move.
- **The store owns state.** Never reassign `state`, `state.global`, or `state.engines[<id>]`.
- **Engines self-dispose.** A factory owns every geometry and material it creates.
- **Runtime dependencies stay `three` and `shiki`, nothing else.** `three` becomes a peer dependency of `packages/orb`.
- 2-space indent, single quotes, semicolons. Comments explain **why**, not what.
- Commit after every task. Never batch two tasks into one commit.

---

## The problem this plan exists to solve

The design spec assumed the split follows the existing mixin seam:

```js
class OrbStudio extends OrbRuntime {}
Object.assign(OrbStudio.prototype, gridMethods, captureMethods, sequenceMethods);
```

**That is not sufficient, and finding out mid-move would be expensive.** `OrbStudio`'s base-class methods call *into* the mixins. Verified call sites in `src/core/studio.js`:

| Base method | Calls | Line |
| --- | --- | --- |
| `setEngine` | `this.stopSequence({ reconcile: false })` | 151 |
| `setEngine` | `this.rebuildGridForEngine(state, wasSweep)` | 213 |
| `updateParameters` | `this.stopSequence({ reconcile: false })` | 223 |
| `renderFrame` | `this.sequencePlayer`, `this.applySequenceStep`, `this.stopSequence` | 409–446 |
| `renderFrame` | `this.paramTween.advance` | 434 |
| `renderFrame` | `this.grid.render(...)`, `this.grid?.setAudioLevel` | 457, 470 |
| `dispose` | `this.stopSequence()`, `this.exitGridMode()`, `this.clipRecorder` | 532–540 |

Today this works because the mixins are installed onto the same prototype. Once `OrbRuntime` lives in a separate package and is usable standalone, those calls hit `undefined`.

**The fix is hook methods with no-op defaults on `OrbRuntime`**, overridden by `OrbStudio`. Four hooks cover every call site above:

| Hook | Default | Studio override |
| --- | --- | --- |
| `onEngineWillChange()` | no-op | `stopSequence({ reconcile: false })` |
| `onEngineDidChange(state, ctx)` | no-op | `rebuildGridForEngine(state, ctx.wasSweep)` |
| `advanceTimeline(delta)` | returns `delta * 1000` | sequence playback + param tween |
| `renderOverride(delta)` | returns `false` | grid render, returns `true` |

`dispose()` uses optional calls (`this.stopSequence?.()`) since teardown has no meaningful default.

**Task 3 introduces these hooks in the existing file and verifies green before anything moves.** Refactoring the seam and relocating 12k LOC in one step makes a failure impossible to attribute. Do them separately.

---

## File structure after this phase

```
lumaform-orb/
├── package.json                        workspaces root, private
├── packages/
│   ├── orb/
│   │   ├── package.json                @lumaform/orb, three as peerDep
│   │   ├── src/
│   │   │   ├── engines/                22 files, moved unchanged
│   │   │   ├── catalog/                analytic.js, bodies.js, simulation.js
│   │   │   ├── engine-catalog.js
│   │   │   ├── core/
│   │   │   │   ├── runtime.js          NEW — OrbRuntime
│   │   │   │   ├── modulation.js
│   │   │   │   ├── framing.js
│   │   │   │   ├── engine-notify.js
│   │   │   │   ├── config-io.js
│   │   │   │   ├── moire-sphere.js
│   │   │   │   └── flow-field.js
│   │   │   ├── audio/
│   │   │   │   ├── audio-input.js      → ./audio subpath
│   │   │   │   └── audio-level.js
│   │   │   ├── shared/
│   │   │   │   ├── pointer.js
│   │   │   │   └── fps.js
│   │   │   └── index.js                exports OrbRuntime
│   │   └── tests/                      engine, config, modulation, framing tests
│   └── studio/
│       ├── package.json                private, depends on @lumaform/orb
│       ├── index.html
│       ├── vite.config.js
│       ├── src/                        core/ (studio.js + studio-*), ui/, styles/,
│       │                               presets/, state.js, store.js, palette.js,
│       │                               easing.js, randomize.js, main.js, analytics.js
│       └── tests/                      layering, css-hygiene, UI and session tests
└── docs/, README.md, LICENSE, …        stay at root
```

**Placements verified by import-graph check, not assumption:** `palette.js` and `easing.js` are studio-side (imported only by `randomize.js`/`state.js`/`studio-*` and by `param-tween.js`/`ab-session.js`/`studio-library.js` respectively). `audio-level.js` goes with the audio subpath — its `createLevelFollower` is used only inside `audio-input.js`.

---

### Task 1: Workspace skeleton, studio moved wholesale

Move the working app into `packages/studio` with no code changes. Proves the harness before any code is restructured.

**Files:**
- Create: `package.json` (new workspaces root), `packages/studio/package.json`
- Move: `src/`, `tests/`, `index.html`, `vite.config.js` → `packages/studio/`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: a two-workspace repo where `npm run dev -w @lumaform/studio` and the test suite both work.

- [ ] **Step 1: Record the baseline**

```bash
for t in tests/*.test.mjs; do node "$t" >/dev/null 2>&1 || echo "FAILED: $t"; done; echo "baseline recorded"
```

Expected: no `FAILED:` lines. If any test is already failing, stop and fix that first — you cannot use a red suite as a safety net.

- [ ] **Step 2: Move the app with `git mv` so history follows**

```bash
mkdir -p packages/studio && git mv src tests index.html vite.config.js packages/studio/
```

- [ ] **Step 3: Write the workspaces root package.json**

```json
{
  "name": "lumaform-orb-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "npm run dev -w @lumaform/studio",
    "build": "npm run build -w @lumaform/studio",
    "test": "node scripts/run-tests.mjs"
  }
}
```

- [ ] **Step 4: Write packages/studio/package.json**

```json
{
  "name": "@lumaform/studio",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "shiki": "^4.4.3",
    "three": "^0.160.1"
  },
  "devDependencies": {
    "vite": "^5.4.19"
  }
}
```

- [ ] **Step 5: Write the test runner both packages will share**

Create `scripts/run-tests.mjs`:

```js
// Runs every packages/*/tests/*.test.mjs and fails if any of them fails.
// A shell for-loop swallowed non-zero exits and reported success; this does not.
import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const packages = readdirSync('packages');
let failures = 0;

for (const pkg of packages) {
  const dir = `packages/${pkg}/tests`;
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
    const path = `${dir}/${file}`;
    try {
      execFileSync('node', [path], { stdio: 'inherit' });
    } catch {
      console.error(`FAILED: ${path}`);
      failures++;
    }
  }
}

console.log(failures === 0 ? '\nALL SUITES PASS' : `\n${failures} SUITE(S) FAILED`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 6: Reinstall so workspace symlinks are created**

```bash
rm -rf node_modules package-lock.json && npm install
```

- [ ] **Step 7: Run the suite**

```bash
npm test
```

Expected: 36 suites run, `ALL SUITES PASS`. Tests use relative imports (`../src/...`) so moving the whole tree together keeps them resolving.

- [ ] **Step 8: Verify the build**

```bash
npm run build
```

Expected: `✓ built in …`. The chunk-size warning is pre-existing; ignore it.

- [ ] **Step 9: Update CI to use the workspace scripts**

In `.github/workflows/ci.yml`, replace the `Run tests` step's shell loop and the `npx vite build` step with:

```yaml
      - run: npm test
      - run: npm run build
```

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "Move the studio into packages/studio under npm workspaces

Pure relocation, no code changes. Establishes the workspace harness
before any code is restructured, so a later failure is attributable to
the restructure rather than to the move."
```

---

### Task 2: Create packages/orb and move the engine layer

The engines import only `three` and three leaf helpers, so this is a file move.

**Files:**
- Create: `packages/orb/package.json`, `packages/orb/src/index.js`
- Move: `packages/studio/src/engines/` → `packages/orb/src/engines/`
- Move: `catalog/`, `engine-catalog.js`, `modulation.js`, `framing.js`, `engine-notify.js`, `config-io.js`, `moire-sphere.js`, `flow-field.js`, `shared/pointer.js`, `shared/fps.js`
- Modify: every studio file importing those paths

**Interfaces:**
- Consumes: Task 1's workspace layout.
- Produces: `@lumaform/orb` exporting `ENGINE_CATALOG`, `ENGINE_TYPES`, `ENGINE_INFO`, `ENGINE_PARAM_DEFINITIONS`, `getEngineEntry`, `getDefaultEngineParams`, `getDefaultPresetName`, `registerAllEngines`, `createModulationRack`, `createDefaultModulation`, `listModulationTargets`, `cameraDistanceForRadius`, `engineFrameRadius`, `notifyParams`, `notifyPulse`, `notifyResize`, `CONFIG_VERSION`, `stampVersion`, `migrateConfig`, `parseConfigFile`, `sanitizeParams`, `applyConfig`, `createPointerTracker`, `createClickPulse`, `createFpsTracker`.

- [ ] **Step 1: Write packages/orb/package.json**

```json
{
  "name": "@lumaform/orb",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./engines": "./src/engines/index.js"
  },
  "sideEffects": false,
  "peerDependencies": {
    "three": ">=0.160 <1"
  }
}
```

`private: true` and `version: 0.0.0` for now — publishing is phase 4. Setting them here avoids an accidental `npm publish` from the workspace root.

- [ ] **Step 2: Move the files**

```bash
mkdir -p packages/orb/src/core packages/orb/src/shared
git mv packages/studio/src/engines packages/orb/src/engines
git mv packages/studio/src/core/catalog packages/orb/src/catalog
git mv packages/studio/src/core/engine-catalog.js packages/orb/src/engine-catalog.js
for f in modulation.js framing.js engine-notify.js config-io.js moire-sphere.js flow-field.js; do
  git mv "packages/studio/src/core/$f" "packages/orb/src/core/$f"
done
git mv packages/studio/src/shared/pointer.js packages/orb/src/shared/pointer.js
git mv packages/studio/src/shared/fps.js packages/orb/src/shared/fps.js
```

- [ ] **Step 3: Fix intra-package imports inside packages/orb**

Two engine files import helpers that moved alongside them. In `packages/orb/src/engines/moire-engine.js` and `curl-drift-engine.js`, the paths `../core/moire-sphere.js` and `../core/flow-field.js` still resolve correctly — verify rather than assume:

```bash
node -e "import('./packages/orb/src/engine-catalog.js').then(m=>console.log('catalog ok:', m.ENGINE_CATALOG.length)).catch(e=>{console.error(e.message);process.exit(1)})"
```

Expected: `catalog ok: 22`. If it fails, the error names the unresolved path — fix that import and re-run.

- [ ] **Step 4: Write packages/orb/src/engines/index.js**

Named exports per engine, so consumers tree-shake. Catalog entries already carry
everything needed — verified fields are `file` (e.g. `"tesseract-engine.js"`) and
`factoryName` (e.g. `"createTesseractEngine"`) — so generate it rather than
hand-listing 22 lines:

```bash
node --input-type=module -e "
import { ENGINE_CATALOG } from './packages/orb/src/engine-catalog.js';
const header = [
  '// Generated from ENGINE_CATALOG. One named export per engine so a consumer',
  '// that imports one does not pay for the other 21.',
  '',
].join('\n');
const lines = ENGINE_CATALOG.map(
  (e) => \`export { \${e.factoryName} as \${e.id} } from './\${e.file}';\`
);
console.log(header + lines.join('\n'));
" > packages/orb/src/engines/index.js
```

Verify it round-trips:

```bash
node -e "import('./packages/orb/src/engines/index.js').then(m=>console.log('engine exports:', Object.keys(m).length))"
```

Expected: `engine exports: 22`.

- [ ] **Step 5: Write packages/orb/src/index.js**

```js
// Public surface of the runtime package. Phase 4 adds createOrb; for now this
// is the set the studio consumes, so the studio's imports are the same shape a
// future external consumer will use.
export {
  ENGINE_CATALOG, ENGINE_TYPES, ENGINE_INFO, ENGINE_PARAM_DEFINITIONS,
  getEngineEntry, getDefaultEngineParams, getDefaultPresetName, registerAllEngines,
} from './engine-catalog.js';
export { createModulationRack, createDefaultModulation, listModulationTargets } from './core/modulation.js';
export { cameraDistanceForRadius, engineFrameRadius } from './core/framing.js';
export { notifyParams, notifyPulse, notifyResize } from './core/engine-notify.js';
export {
  CONFIG_VERSION, stampVersion, migrateConfig,
  parseConfigFile, sanitizeParams, applyConfig,
} from './core/config-io.js';
export { createPointerTracker, createClickPulse } from './shared/pointer.js';
export { createFpsTracker } from './shared/fps.js';
```

All of these are verified exports of their modules — `listModulationTargets` is
`modulation.js:36`, and `registerAllEngines` iterates `ENGINE_CATALOG` calling
`studio.registerEngine(entry.id, entry.factory)`, so it works against any object
with a `registerEngine` method and needs no change.

- [ ] **Step 6: Add the dependency to the studio**

In `packages/studio/package.json`, add to `dependencies`:

```json
    "@lumaform/orb": "*"
```

Then `npm install` to create the symlink.

- [ ] **Step 7: Repoint studio imports**

Find every studio file importing a moved module:

```bash
git grep -ln "core/engine-catalog.js\|core/modulation.js\|core/framing.js\|core/engine-notify.js\|core/config-io.js\|shared/pointer.js\|shared/fps.js\|src/engines/" -- packages/studio/src
```

Rewrite each to import from `@lumaform/orb`. Example — `packages/studio/src/core/state.js` currently has:

```js
import { createDefaultModulation } from './modulation.js';
```

becomes:

```js
import { createDefaultModulation } from '@lumaform/orb';
```

- [ ] **Step 8: Repoint the tests that import moved modules**

```bash
git grep -ln "src/core/modulation\|src/core/config-io\|src/core/framing\|src/core/engine-catalog\|src/engines/" -- packages/studio/tests
```

Leave them in `packages/studio/tests` for now — Task 6 relocates them. Only fix the import paths so the suite stays green.

- [ ] **Step 9: Run the suite and the build**

```bash
npm test && npm run build
```

Expected: `ALL SUITES PASS` (36) and a successful build.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "Move the engine layer into packages/orb

The 22 engine files import only three, three's line addons and three
leaf helpers, so this is a relocation rather than a rewrite. The studio
now consumes them through @lumaform/orb, which is the same shape an
external consumer will use in phase 4."
```

---

### Task 3: Introduce runtime hooks in place

**Do not move any code in this task.** Refactor the seam inside the existing `studio.js`, prove it green, and only then split. Doing both at once makes a failure impossible to attribute.

**Files:**
- Modify: `packages/studio/src/core/studio.js`
- Test: `packages/studio/tests/runtime-hooks.test.mjs` (create)

**Interfaces:**
- Consumes: Task 2's `@lumaform/orb` imports.
- Produces: `OrbStudio` with four hook methods — `onEngineWillChange()`, `onEngineDidChange(state, ctx)`, `advanceTimeline(deltaSeconds) → tweenDeltaMs`, `renderOverride(delta) → boolean`. Task 4 moves everything *except* these overrides into `OrbRuntime`.

- [ ] **Step 1: Write the failing test**

Create `packages/studio/tests/runtime-hooks.test.mjs`:

```js
// The runtime/studio seam. OrbRuntime's own methods must never call a studio
// method directly — that is what breaks when the runtime ships standalone.
// These four hooks are the entire contract between the two halves.
import { readFileSync } from 'node:fs';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const source = readFileSync(new URL('../src/core/studio.js', import.meta.url), 'utf8');

for (const hook of ['onEngineWillChange', 'onEngineDidChange', 'advanceTimeline', 'renderOverride']) {
  ok(`${hook} is defined`, new RegExp(`\\n  ${hook}\\(`).test(source));
}

// The studio-only names must appear only inside hook overrides, never in the
// methods destined for OrbRuntime.
const RUNTIME_METHODS = ['setEngine', 'updateParameters', 'renderFrame'];
const STUDIO_ONLY = ['stopSequence', 'rebuildGridForEngine', 'applySequenceStep', 'sequencePlayer', 'paramTween', 'this.grid'];

function methodBody(name) {
  const start = source.indexOf(`\n  ${name}(`);
  if (start === -1) return '';
  const rest = source.slice(start + 1);
  const end = rest.indexOf('\n  }');
  return rest.slice(0, end);
}

for (const method of RUNTIME_METHODS) {
  const body = methodBody(method);
  ok(`${method} has a body to check`, body.length > 0);
  for (const name of STUDIO_ONLY) {
    ok(`${method} does not reference ${name}`, !body.includes(name),
      body.includes(name) ? `found in ${method}` : '');
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
node packages/studio/tests/runtime-hooks.test.mjs
```

Expected: FAIL on all four `is defined` assertions and on several `does not reference` assertions.

- [ ] **Step 3: Add the four hooks with runtime-safe defaults**

Add to the `OrbStudio` class body in `packages/studio/src/core/studio.js`, immediately after `togglePlayPause()`:

```js
  // --- runtime/studio seam -------------------------------------------------
  // OrbRuntime keeps these as no-ops so it runs standalone; the studio
  // overrides them in studio-sequence.js and studio-grid.js. Without them the
  // frame loop and setEngine reach directly into the grid and the rehearsal
  // player, which do not exist in a bare runtime.

  // A direct edit supersedes an in-flight rehearsal transition.
  onEngineWillChange() {}

  // The grid owns engine instances built from the previously active factory.
  onEngineDidChange(_state, _context) {}

  // Returns the milliseconds a param tween should advance this frame. A
  // throttled frame can skip step boundaries, so the studio returns only the
  // elapsed portion of the current step rather than the whole frame delta.
  advanceTimeline(delta) {
    return delta * 1000;
  }

  // Return true to claim the frame. The grid renders N scissored viewports
  // straight to the framebuffer, bypassing the bloom composer.
  renderOverride(_delta) {
    return false;
  }
```

- [ ] **Step 4: Route `setEngine` through the hooks**

In `setEngine`, replace lines 149–152:

```js
    if (this.currentSequence && !this.applyingSequenceStep) {
      // The caller already wrote the requested engine into state.
      this.stopSequence({ reconcile: false });
    }
```

with:

```js
    this.onEngineWillChange();
```

and replace line 213:

```js
    if (wasGridMode) this.rebuildGridForEngine(state, wasSweep);
```

with:

```js
    this.onEngineDidChange(state, { wasGridMode, wasSweep });
```

- [ ] **Step 5: Route `updateParameters` through the hook**

Replace lines 219–224 in `updateParameters`:

```js
    if (this.currentSequence && !this.applyingSequenceStep) {
      // A slider, preset or import has already written its desired value into
      // state, so stopping rehearsal must not replace that edit with the
      // intermediate visual value.
      this.stopSequence({ reconcile: false });
    }
    this.paramTween.cancel();
```

with:

```js
    this.onEngineWillChange();
```

`paramTween.cancel()` moves into the studio's `onEngineWillChange` override — see Step 7.

- [ ] **Step 6: Route `renderFrame` through the hooks**

Replace lines 407–446 (from `let tweenDeltaMs = …` through `if (sequenceCompleted) this.stopSequence();`) with:

```js
    const tweenDeltaMs = this.advanceTimeline(delta);
```

and replace lines 469–472:

```js
    if (this.grid) {
      this.grid.render(this.virtualTime, this.isPaused ? 0 : delta * this.timeScale, window.innerWidth, window.innerHeight);
      return;
    }
```

with:

```js
    if (this.renderOverride(delta)) return;
```

`tweenDeltaMs` is now unused inside `renderFrame` — the tween advance moves into `advanceTimeline`. Delete the now-dead local if the linter flags it.

Also replace the audio block at lines 454–458 so the grid reference leaves the runtime:

```js
    if (this.audioInput?.isActive) {
      this.modulation.setAudioLevel(this.audioInput.read());
    }
```

and add `this.grid?.setAudioLevel(level)` to the studio's `renderOverride` override.

- [ ] **Step 7: Add the studio overrides**

In `packages/studio/src/core/studio-sequence.js`, add to `sequenceMethods`:

```js
  onEngineWillChange() {
    if (this.currentSequence && !this.applyingSequenceStep) {
      // The caller already wrote the requested engine or param into state, so
      // stopping rehearsal must not replace that edit with the intermediate
      // visual value.
      this.stopSequence({ reconcile: false });
    }
    this.paramTween.cancel();
  },

  // Sequence playback and param tweening both advance on real milliseconds, so
  // a transition's duration does not change when playback speed does.
  advanceTimeline(delta) {
    let tweenDeltaMs = delta * 1000;
    let sequenceCompleted = false;

    if (this.sequencePlayer.isPlaying) {
      const at = this.sequencePlayer.advance(tweenDeltaMs);
      sequenceCompleted = !!at?.completed;
      if (at?.entered) {
        const step = this.currentSequence?.[at.index];
        if (step && this.applySequenceStep(step)) {
          tweenDeltaMs = at.phase === 'transition'
            ? at.stepElapsedMs
            : Math.max(0, Number(step.transitionMs) || 0);
          this.onSequenceStep?.({ index: at.index, step });
        }
      }
    }

    // Pausing a rehearsal freezes both its clock and the transition in flight;
    // stop cancels that transition and resets the clock.
    const sequencePaused = this.currentSequence
      && !this.sequencePlayer.isPlaying
      && !sequenceCompleted;

    if (this.paramTween.isRunning && !sequencePaused) {
      const tweened = this.paramTween.advance(tweenDeltaMs);
      if (tweened) {
        const patch = {};
        for (const [key, value] of Object.entries(tweened)) {
          if (!Object.is(this.baseParams[key], value)) patch[key] = value;
        }
        Object.assign(this.baseParams, tweened);
        this.applyModulatedParams({});
        if (Object.keys(patch).length) notifyParams(this.activeEngine, patch);
      }
    }

    if (sequenceCompleted) this.stopSequence();
    return tweenDeltaMs;
  },
```

`studio-sequence.js` currently has **no imports at all** — every method reaches
through `this`. `advanceTimeline` is the first to need one, so add this as the
file's first line:

```js
import { notifyParams } from '@lumaform/orb';
```

In `packages/studio/src/core/studio-grid.js`, add to `gridMethods`:

```js
  onEngineDidChange(state, { wasGridMode, wasSweep }) {
    // The grid owns engine instances built from the factory that was active
    // when it was created, and renderFrame returns early whenever a grid
    // exists. Switching engine without rebuilding left nine stale cells of the
    // previous engine on screen while the new one rendered nowhere.
    if (wasGridMode) this.rebuildGridForEngine(state, wasSweep);
  },

  renderOverride(delta) {
    if (!this.grid) return false;
    if (this.audioInput?.isActive) this.grid.setAudioLevel(this.modulation.audioLevel);
    this.grid.render(
      this.virtualTime,
      this.isPaused ? 0 : delta * this.timeScale,
      window.innerWidth,
      window.innerHeight
    );
    return true;
  },
```

- [ ] **Step 8: Make `dispose` tolerant of a missing studio half**

In `dispose()`, change the two studio calls to optional:

```js
    this.stopSequence?.();
    …
    this.exitGridMode?.();
```

- [ ] **Step 9: Run the hook test**

```bash
node packages/studio/tests/runtime-hooks.test.mjs
```

Expected: `ALL PASS`.

- [ ] **Step 10: Run the whole suite**

```bash
npm test
```

Expected: 37 suites, `ALL SUITES PASS`.

- [ ] **Step 11: Verify behaviour in the browser — this is the real gate**

Start the dev server, then in the console check every path the hooks touch:

```js
const { studio, state, ui } = window.__orb;
// grid still rebuilds on engine switch
studio.enterGridMode(state);
studio.setEngine('hopf', state);
console.log('cells after switch:', studio.grid?.cells?.length);   // expect 9
studio.exitGridMode(state);
// rehearsal still stops on a direct edit
console.log('tween cancels:', (studio.tweenTo({}, {durationMs: 0}), !studio.paramTween.isRunning));
```

Expected: 9 cells, `tween cancels: true`, no console errors. Also switch engines from the dropdown, open the grid with `G`, run a sweep with `K`, and play a rehearsal with `P` — all must behave exactly as before.

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "Introduce the runtime/studio seam as four hook methods

OrbStudio's base methods called directly into the grid, the rehearsal
player and the param tween, so extracting a standalone runtime would
leave those calls hitting undefined. onEngineWillChange,
onEngineDidChange, advanceTimeline and renderOverride cover every such
call site; the runtime keeps no-op defaults and the studio overrides
them. No code has moved yet — the seam is proven green first so a later
failure is attributable to the move."
```

---

### Task 4: Extract OrbRuntime into packages/orb

Now the seam is proven, the move is mechanical.

**Files:**
- Create: `packages/orb/src/core/runtime.js`
- Modify: `packages/studio/src/core/studio.js`, `packages/orb/src/index.js`

**Interfaces:**
- Consumes: Task 3's hooks.
- Produces: `OrbRuntime` exported from `@lumaform/orb`. `OrbStudio extends OrbRuntime`.

- [ ] **Step 1: Create runtime.js from studio.js**

Copy `packages/studio/src/core/studio.js` to `packages/orb/src/core/runtime.js`, rename the class to `OrbRuntime`, and delete:

- the `studio-grid.js` / `studio-capture.js` / `studio-sequence.js` imports and the `installMethods` call at the bottom
- the `param-tween.js`, `audio-input.js`, `sequence.js`, `variation-grid.js` imports
- `tweenTo()`, `enableAudio()`, `disableAudio()`
- constructor lines for grid, sweep, clip, tween and sequence state (lines 72–99 of the original), and `bindGridPointer(this)`

Keep the four hooks with their no-op defaults. Replace `DEFAULT_BREADTH` usage by deleting `this.gridBreadth`. Change `import { ENGINE_PARAM_DEFINITIONS } from './state.js'` to `from '../engine-catalog.js'`.

Add an `audioSource` option so audio remains possible without the package owning `getUserMedia`:

```js
    // Anything with .read() → 0..1 and .isActive. The studio supplies a
    // microphone input from @lumaform/orb/audio; a consumer can supply their
    // own analyser, or nothing at all, in which case audio routes stay inert.
    this.audioSource = options.audioSource ?? null;
```

and in `renderFrame` replace `this.audioInput?.isActive` with `this.audioSource?.isActive` and `this.audioInput.read()` with `this.audioSource.read()`.

- [ ] **Step 2: Reduce studio.js to the subclass**

Replace the whole of `packages/studio/src/core/studio.js` with:

```js
import { OrbRuntime } from '@lumaform/orb';
import { createParamTween } from './param-tween.js';
import { createSequencePlayer } from './sequence.js';
import { createAudioInput } from '@lumaform/orb/audio';
import { DEFAULT_BREADTH } from './variation-grid.js';
import { bindGridPointer, gridMethods } from './studio-grid.js';
import { captureMethods } from './studio-capture.js';
import { sequenceMethods } from './studio-sequence.js';

// The exploration tool: a runtime plus the things only an instrument needs —
// the variation grid, clip capture, rehearsal playback and param tweening.
// Everything here overrides or extends the seam OrbRuntime declares.
export class OrbStudio extends OrbRuntime {
  constructor(containerElement, options = {}) {
    super(containerElement, options);

    this.grid = null;
    this.gridRadius = 0.25;
    this.gridSections = null;
    this.gridBreadth = DEFAULT_BREADTH;
    // null = follow the section lock: locking mutation to colours also holds
    // the motion character still, which is what made a colour comparison
    // readable. The HUD sends an explicit boolean once the user touches the
    // Patch chip.
    this.gridBreedPatch = null;
    this.onGridPromote = null;
    this.sweepInfo = null;
    // Sessions that never record should never create a canvas capture stream.
    this.clipRecorder = null;
    // Tweens move baseParams, so the modulation rack keeps layering on top of
    // a moving base rather than fighting it.
    this.paramTween = createParamTween();
    this.sequencePlayer = createSequencePlayer();
    this.sequenceState = null;
    this.currentSequence = null;
    this.onSequenceStep = null;
    this.onSequenceStop = null;
    this.applyingSequenceStep = false;
    // Created lazily: constructing an AudioContext before a user gesture is
    // wasteful and some browsers start it suspended anyway.
    this.audioInput = null;

    bindGridPointer(this);
  }

  // Travel from the current base to `targetParams`. durationMs 0 is a hard cut,
  // which is what A/B did before transitions existed.
  tweenTo(targetParams, { durationMs = 400, easing = 'easeOut' } = {}) {
    this.onEngineWillChange();
    if (durationMs <= 0) {
      Object.assign(this.baseParams, targetParams);
      this.paramTween.cancel();
      return;
    }
    this.paramTween.start({ ...this.baseParams }, targetParams, this.paramDefs, { durationMs, easing });
  }

  // A refused microphone is a normal outcome, not an error.
  async enableAudio(mode = 'mic') {
    const audio = this.modulation.config.sources?.audio1 || {};
    const options = { attack: audio.attack ?? 0.5, release: audio.release ?? 0.12 };

    if (!this.audioInput) {
      this.audioInput = createAudioInput(options);
      this.audioSource = this.audioInput;
    } else {
      this.audioInput.setOptions(options);
    }

    // Both branches are awaited: an un-awaited promise is truthy, which would
    // report every failure as a success.
    const started = mode === 'tone'
      ? await this.audioInput.startTestTone()
      : await this.audioInput.startMic();
    if (!started) {
      this.modulation.setAudioLevel(0);
      this.grid?.setAudioLevel(0);
    }
    return started;
  }

  disableAudio() {
    this.audioInput?.stop();
    // Otherwise every audio route freezes at its last value.
    this.modulation.setAudioLevel(0);
    this.grid?.setAudioLevel(0);
  }

  dispose() {
    this.clipRecorder?.dispose();
    this.audioInput?.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.handleGridPointer);
    super.dispose();
  }
}

function installMethods(ctor, ...bags) {
  for (const bag of bags) {
    Object.defineProperties(ctor.prototype, Object.getOwnPropertyDescriptors(bag));
  }
}

installMethods(OrbStudio, gridMethods, captureMethods, sequenceMethods);
```

- [ ] **Step 3: Export OrbRuntime**

Add to `packages/orb/src/index.js`:

```js
export { OrbRuntime } from './core/runtime.js';
```

- [ ] **Step 4: Remove the studio-only teardown from runtime dispose**

In `packages/orb/src/core/runtime.js`, `dispose()` should read:

```js
  dispose() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.clickPulseTracker?.dispose();
    this.pointerTracker?.dispose();
    this.controls.dispose();
    this.activeEngine?.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
    this.container.innerHTML = '';
  }
```

The studio's override handles `clipRecorder`, `audioInput` and the grid pointer listener before calling `super.dispose()`. `stopSequence` and `exitGridMode` are called from the studio's `dispose` too — add them at the top of the studio override:

```js
    this.stopSequence();
    this.exitGridMode();
```

- [ ] **Step 5: Run the suite**

```bash
npm test
```

Expected: 37 suites, `ALL SUITES PASS`.

- [ ] **Step 6: Verify in the browser**

Repeat Task 3 Step 11's checks, and additionally:

```js
const { studio } = window.__orb;
console.log('is an OrbRuntime:', Object.getPrototypeOf(Object.getPrototypeOf(studio)).constructor.name);
```

Expected: `OrbRuntime`. Then exercise engine switch, `G`, `K`, `P`, `V` (clip record), `S` (snapshot) and confirm no console errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Extract OrbRuntime into packages/orb

OrbStudio now extends it and contributes the grid, clip capture,
rehearsal playback and param tweening through the hooks from the
previous commit. The runtime takes an audioSource rather than owning
getUserMedia, so a consumer that never imports the audio subpath ships
no microphone code."
```

---

### Task 5: Move audio to the ./audio subpath

**Files:**
- Move: `audio-input.js`, `audio-level.js` → `packages/orb/src/audio/`
- Modify: `packages/orb/package.json`

**Interfaces:**
- Consumes: Task 4's `audioSource` option.
- Produces: `@lumaform/orb/audio` exporting `createAudioInput`.

- [ ] **Step 1: Move the files**

```bash
mkdir -p packages/orb/src/audio
git mv packages/studio/src/core/audio-input.js packages/orb/src/audio/audio-input.js
git mv packages/studio/src/core/audio-level.js packages/orb/src/audio/audio-level.js
```

- [ ] **Step 2: Add the subpath export**

In `packages/orb/package.json`, extend `exports`:

```json
  "exports": {
    ".": "./src/index.js",
    "./engines": "./src/engines/index.js",
    "./audio": "./src/audio/index.js"
  },
```

- [ ] **Step 3: Write packages/orb/src/audio/index.js**

```js
// Microphone capture, deliberately behind its own subpath.
//
// A runtime flag cannot be tree-shaken — a bundler cannot prove its value — so
// a boolean would ship getUserMedia to every consumer whether or not they use
// it, and dependency scanners flag the presence of the call, not its use. Not
// importing this module is the strongest possible off switch: zero bytes, zero
// permission surface. Consent UX belongs to the consumer anyway.
export { createAudioInput } from './audio-input.js';
export {
  createLevelFollower, normalizeLevel, rmsFromTimeDomain, smoothLevel,
} from './audio-level.js';
```

- [ ] **Step 4: Run the suite**

```bash
npm test
```

Expected: `ALL SUITES PASS`. `audio-level.test.mjs` imports `audio-level.js` by relative path — fix that path; Task 6 relocates the file itself.

- [ ] **Step 5: Verify the microphone still works**

In the browser, open Motion Lab and click **Test Tone** (it needs no permission prompt, unlike Mic). Confirm the orb reacts and:

```js
console.log('audio active:', window.__orb.studio.audioInput?.isActive);
console.log('level > 0:', window.__orb.studio.modulation.audioLevel > 0);
```

Expected: both true. Then click Test Tone again to disable and confirm the level returns to 0.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Move microphone capture to the @lumaform/orb/audio subpath

Not importing it is the off switch. A runtime boolean cannot be
tree-shaken, so it would ship getUserMedia to every consumer regardless."
```

---

### Task 6: Relocate tests to their packages

**Files:**
- Move: engine/config/modulation/framing tests → `packages/orb/tests/`
- Keep: layering, css-hygiene, UI and session tests in `packages/studio/tests/`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces: each package's tests runnable from its own directory.

- [ ] **Step 1: Move the runtime-side tests**

These 16 test only modules that now live in `packages/orb`. The list is exact —
every name was checked against `ls tests/` and against what each file imports.

```bash
mkdir -p packages/orb/tests
for t in aqueous-color audio-level config-io config-version curl-drift-field \
         engine-catalog flow-field flux-color framing moire-sphere \
         murmuration-shell murmuration-simulation new-engines \
         tesseract-projection vocalis-layout; do
  git mv "packages/studio/tests/$t.test.mjs" "packages/orb/tests/"
done
```

**`engine-contract.test.mjs` stays in the studio.** It looks runtime-side but
imports `store.js` and `state.js`, both of which are studio modules. Moving it
would force a dependency from the orb package back to the studio — the exact
cycle the risk table forbids.

- [ ] **Step 2: Teach file-size.test.mjs about both packages**

It walks a single `../src/` tree, which no longer exists. In
`packages/studio/tests/file-size.test.mjs`, replace:

```js
const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
```

with:

```js
// Two package trees now. The 1k-line cliff applies to both — a runtime file
// that grows past it hides seams just as well as a studio file does.
const srcRoots = [
  fileURLToPath(new URL('../src/', import.meta.url)),
  fileURLToPath(new URL('../../orb/src/', import.meta.url)),
];
```

and change the single `walk(srcRoot)` call to accumulate across both:

```js
const files = srcRoots.flatMap((root) => walk(root, []));
```

The `relative()` call used for reporting takes `srcRoot` as its base — pass the
matching root, or switch to reporting paths relative to `packages/`.

- [ ] **Step 3: Fix relative imports in the moved tests**

Each moved test imports `../src/...`. From `packages/orb/tests/` that now resolves inside `packages/orb`, which is where the modules live — so most will resolve unchanged. Run them and fix what breaks:

```bash
for t in packages/orb/tests/*.test.mjs; do node "$t" >/dev/null 2>&1 || echo "BROKEN: $t"; done
```

Fix each `BROKEN` file's import paths, then re-run until the loop prints nothing.

- [ ] **Step 4: Run the whole suite**

```bash
npm test
```

Expected: 37 suites across both packages (15 in `packages/orb`, 22 in
`packages/studio`), `ALL SUITES PASS`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Move tests to the package whose code they cover"
```

---

### Task 7: Final verification and documentation

**Files:**
- Modify: `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: docs describing the real layout.

- [ ] **Step 1: Update the project-layout section of README.md**

Replace the `src/` tree with the two-package tree from this plan's "File structure after this phase" section. Update the Quick start commands to `npm run dev` and `npm test` at the root.

- [ ] **Step 2: Update CONTRIBUTING.md**

Replace the two test/build commands with `npm test` and `npm run build`.

- [ ] **Step 3: Update CLAUDE.md**

Add to the invariants list:

```markdown
- **The runtime never calls a studio method directly.** `OrbRuntime` in `packages/orb` declares four no-op hooks — `onEngineWillChange`, `onEngineDidChange`, `advanceTimeline`, `renderOverride` — and `OrbStudio` overrides them. Reaching into `this.grid`, `this.paramTween` or `this.sequencePlayer` from a runtime method breaks the package for anyone who is not the studio. `tests/runtime-hooks.test.mjs` checks this.
```

- [ ] **Step 4: Full verification**

```bash
npm test && npm run build
```

Expected: `ALL SUITES PASS` and a successful build.

- [ ] **Step 5: Browser regression pass**

Exercise every capability the README claims, and confirm no console errors:

| Key | Expect |
| --- | --- |
| engine dropdown | switches cleanly, orb reframes |
| `G` | 9-cell grid, click promotes, shift-click marks |
| `K` | 5-cell sweep strip with caption |
| `1` `2` `` ` `` | A/B store and swap without restarting the animation |
| `P` | rehearsal loop plays and stops |
| `C` `S` | finding kept, PNG downloads |
| `V` | clip records and downloads |
| Motion Lab → Test Tone | orb reacts |
| Export → JSON | carries `"version": 1`, re-imports |

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Document the two-package layout"
```

---

## Risks

| Risk | Mitigation |
| --- | --- |
| A hook subtly changes frame ordering | Task 3 lands hooks with no move, verified green plus a browser pass, before Task 4 moves anything. |
| `git mv` loses history | `git mv` preserves it; `git log --follow <path>` verifies after each move task. |
| A test passes because it silently no-ops after a move | `scripts/run-tests.mjs` fails on non-zero exit, unlike the old shell loop that swallowed them. Suite count is asserted at each task: expect 36 through Task 2, 37 from Task 3. |
| Circular import between the packages | The studio depends on the orb; never the reverse. If a runtime module needs something from the studio, the seam is wrong — add a hook instead. |
| The grid regresses invisibly | It has no unit test. Task 3 Step 11 and Task 7 Step 5 check it in the browser explicitly. |

## Out of scope

`createOrb`, the `.d.ts`, the `exports` map for publishing, provenance, the examples directory and the npm release — all phase 4, which gets its own plan once this lands.
