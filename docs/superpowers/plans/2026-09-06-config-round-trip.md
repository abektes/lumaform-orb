# Config Round-Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make exported configurations loadable again — including their motion design, including multi-config files produced by the grid, and including files on disk.

**Architecture:** Export was recently extended to carry a `modulation` block, but the import path was not, so every round-trip silently drops the half of the design that makes the orb move. Import also replaces the parameter bag wholesale (so a partial config blanks every key it omits), accepts no validation (so a typo'd key is written into state and silently ignored by the engine forever), and only handles a single object (so the grid's exported array — the actual notebook format — cannot be loaded at all). This plan puts parsing, validation and normalisation in one pure, tested module and reduces the UI handler to a thin caller.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework.
- **ES modules**, `"type": "module"`.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. There is no test framework and you must not add one. Exit `0` on pass, `1` on fail.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Never reassign shared state containers.** `state`, `state.global` and each `state.engines[<id>]` object are held by reference in `src/main.js`, `StudioUI` and `OrbStudio`. Reassigning any of them orphans the other holders — this exact bug previously made the variation grid breed from stale parameters. Always `Object.assign` into the existing object.
- **Backwards compatibility:** files exported before `modulation` existed have no `modulation` key and must still load.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: the repository root. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

**The app state object** (`src/core/state.js`, `createInitialState()`):

```js
{
  engine: 'tesseract',
  activePresetName: '...',
  global: { dpr, exposure, bloomStrength, bloomRadius, bloomThreshold,
            autoRotate, autoRotateSpeed, timeScale, paused, background,
            transparentBg, bgMode },
  modulation: { enabled, loopLength, sources: {...}, routes: [...] },
  engines: { tesseract: {...}, quantum: {...}, /* one bag per engine */ }
}
```

`ENGINE_TYPES` (also from `src/core/state.js`) maps to the 8 valid engine ids: `tesseract`, `moire`, `auris`, `hopf`, `polytope`, `nebula`, `quantum`, `singularity`.

`ENGINE_PARAM_DEFINITIONS[engineId]` is the schema for that engine — an object keyed by parameter name, each entry `{ type, label, min?, max?, step?, default, section }`.

**What export currently writes.** `StudioUI.exportConfig()` in `src/ui/studio-ui.js` returns:

```js
{ engine, global, params, modulation }
```

The variation grid's `exportSelected()` in `src/core/variation-grid.js` returns an **array** of objects with that same shape (one per marked cell). `src/main.js` `downloadGridSelection()` writes that array to `orb-variations-<engine>-<timestamp>.json`.

**The broken import** lives in `src/ui/studio-ui.js` inside `openExportModal()`, on `#btn-import-json`. You will replace it in Task 2. It reads from the textarea `#export-json-area`.

**Browser verification handle:** `window.__orb = { studio, state, ui }`. The export modal can be opened programmatically with `window.__orb.ui.openExportModal()`.

**CRITICAL browser gotcha:** if the Browser pane is hidden, `requestAnimationFrame` never fires, so the render loop is frozen and the app *looks* broken. `studio.fpsTracker.fps` reports its default `60` regardless — don't trust it. Step frames manually with `studio.renderFrame()`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/config-io.js` | **Create.** Parse, validate and normalise imported configs. Pure — no DOM, no Three.js. |
| `src/ui/studio-ui.js` | **Modify.** Replace the import handler; add a file picker. |
| `src/style.css` | **Modify.** Append file-row styles. |
| `tests/config-io.test.mjs` | **Create.** Node tests. |

---

### Task 1: Parsing, validation and normalisation

**Files:**
- Create: `src/core/config-io.js`
- Test: `tests/config-io.test.mjs`

**Interfaces:**
- Consumes: nothing. (Takes `validEngines` and `defs` as arguments rather than importing `state.js`, so it stays a pure leaf module and is trivially testable.)
- Produces:
  - `parseConfigFile(text, validEngines) => { ok: true, configs: Config[] } | { ok: false, error: string }`
    Accepts a single config object **or** an array of them (the grid export format). Rejects malformed JSON, non-objects, empty arrays, and configs whose `engine` is not in `validEngines` or which have no `params` object. `error` is a human-readable sentence suitable for showing to the user.
  - `sanitizeParams(params, defs) => { params: object, dropped: string[] }`
    Keeps only keys present in `defs`. Numeric values are coerced with `Number` and clamped to `[min, max]`; non-finite numbers are dropped. `select` values not in `options` are dropped. `color` values that are not `#rrggbb` are dropped. `dropped` lists every rejected key so the caller can warn.
  - `applyConfig(state, config, defs) => { engine: string, dropped: string[] }`
    Writes the config into `state` **in place** — never reassigns `state`, `state.global`, or `state.engines[<id>]`. Merges params over the existing bag rather than replacing it, so a partial config does not blank omitted keys. Restores `modulation` when present and leaves the current one untouched when absent.

- [ ] **Step 1: Write the failing test**

Create `tests/config-io.test.mjs`:

```js
import { parseConfigFile, sanitizeParams, applyConfig } from '../src/core/config-io.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ENGINES = ['tesseract', 'quantum'];
const DEFS = {
  edgeGlow: { type: 'number', label: 'Edge Luma', min: 0, max: 3, step: 0.05, default: 1.2, section: 'colors' },
  cubeSize: { type: 'number', label: 'Size', min: 0.6, max: 2.2, step: 0.05, default: 1.25, section: 'geometry' },
  shape:    { type: 'select', label: 'Shape', options: ['sphere', 'cube'], default: 'sphere', section: 'geometry' },
  color1:   { type: 'color', label: 'Primary', default: '#ffed00', section: 'colors' },
};

// --- parseConfigFile ---
const single = JSON.stringify({ engine: 'quantum', global: {}, params: { edgeGlow: 1 } });
let r = parseConfigFile(single, ENGINES);
ok('accepts a single config', r.ok === true && r.configs.length === 1);

const many = JSON.stringify([
  { engine: 'quantum', global: {}, params: { edgeGlow: 1 } },
  { engine: 'quantum', global: {}, params: { edgeGlow: 2 } },
]);
r = parseConfigFile(many, ENGINES);
ok('accepts a grid export array', r.ok === true && r.configs.length === 2);

ok('rejects malformed json', parseConfigFile('{nope', ENGINES).ok === false);
ok('rejects a bare number', parseConfigFile('42', ENGINES).ok === false);
ok('rejects null', parseConfigFile('null', ENGINES).ok === false);
ok('rejects an empty array', parseConfigFile('[]', ENGINES).ok === false);
ok('rejects an unknown engine', parseConfigFile(JSON.stringify({ engine: 'nope', params: {} }), ENGINES).ok === false);
ok('rejects a missing params object', parseConfigFile(JSON.stringify({ engine: 'quantum' }), ENGINES).ok === false);
ok('rejects params that is not an object', parseConfigFile(JSON.stringify({ engine: 'quantum', params: 5 }), ENGINES).ok === false);
ok('error is a non-empty string', typeof parseConfigFile('{nope', ENGINES).error === 'string' && parseConfigFile('{nope', ENGINES).error.length > 0);
ok('rejects an array where one entry is bad', parseConfigFile(JSON.stringify([
  { engine: 'quantum', params: {} }, { engine: 'bogus', params: {} },
]), ENGINES).ok === false);

// --- sanitizeParams ---
let s = sanitizeParams({ edgeGlow: 1.5, unknownKey: 3 }, DEFS);
ok('keeps known keys', s.params.edgeGlow === 1.5);
ok('drops unknown keys', s.params.unknownKey === undefined && s.dropped.includes('unknownKey'));

s = sanitizeParams({ edgeGlow: 99 }, DEFS);
ok('clamps above max', s.params.edgeGlow === 3);
s = sanitizeParams({ edgeGlow: -5 }, DEFS);
ok('clamps below min', s.params.edgeGlow === 0);
s = sanitizeParams({ edgeGlow: '2.0' }, DEFS);
ok('coerces numeric strings', s.params.edgeGlow === 2);
s = sanitizeParams({ edgeGlow: 'abc' }, DEFS);
ok('drops non-numeric values', s.params.edgeGlow === undefined && s.dropped.includes('edgeGlow'));
s = sanitizeParams({ edgeGlow: null }, DEFS);
ok('drops null numbers', s.params.edgeGlow === undefined);

s = sanitizeParams({ shape: 'cube' }, DEFS);
ok('keeps valid select options', s.params.shape === 'cube');
s = sanitizeParams({ shape: 'dodecahedron' }, DEFS);
ok('drops invalid select options', s.params.shape === undefined && s.dropped.includes('shape'));

s = sanitizeParams({ color1: '#00ff00' }, DEFS);
ok('keeps valid hex colours', s.params.color1 === '#00ff00');
s = sanitizeParams({ color1: 'green' }, DEFS);
ok('drops invalid colours', s.params.color1 === undefined && s.dropped.includes('color1'));

ok('handles empty params', eq(sanitizeParams({}, DEFS).params, {}));
ok('handles undefined params', eq(sanitizeParams(undefined, DEFS).params, {}));

// --- applyConfig ---
function makeState() {
  return {
    engine: 'tesseract',
    activePresetName: 'x',
    global: { bloomStrength: 0.5, exposure: 1 },
    modulation: { enabled: false, sources: {}, routes: [] },
    engines: {
      tesseract: { edgeGlow: 0.9 },
      quantum: { edgeGlow: 1.2, cubeSize: 1.25, shape: 'sphere', color1: '#ffed00' },
    },
  };
}

const st = makeState();
const globalRef = st.global;
const enginesRef = st.engines;
const quantumRef = st.engines.quantum;

const res = applyConfig(st, {
  engine: 'quantum',
  global: { bloomStrength: 0.9 },
  params: { edgeGlow: 2.5, bogus: 1 },
  modulation: { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.5 }] },
}, DEFS);

ok('switches engine', st.engine === 'quantum');
ok('merges params over the existing bag', st.engines.quantum.edgeGlow === 2.5);
ok('does NOT blank omitted keys', st.engines.quantum.cubeSize === 1.25);
ok('restores modulation', st.modulation.routes.length === 1);
ok('applies global', st.global.bloomStrength === 0.9);
ok('reports dropped keys', res.dropped.includes('bogus'));
ok('keeps global object identity', st.global === globalRef);
ok('keeps engines map identity', st.engines === enginesRef);
ok('keeps the target param bag identity', st.engines.quantum === quantumRef);

// legacy config with no modulation must not wipe the current rack
const st2 = makeState();
st2.modulation = { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 1 }] };
applyConfig(st2, { engine: 'quantum', global: {}, params: { edgeGlow: 1 } }, DEFS);
ok('legacy config leaves modulation untouched', st2.modulation.routes.length === 1);

// applied modulation must be detached from the source object
const st3 = makeState();
const incoming = { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.5 }] };
applyConfig(st3, { engine: 'quantum', global: {}, params: {}, modulation: incoming }, DEFS);
incoming.routes.push({ source: 'lfo1', dest: '_timeScale', amount: 1 });
ok('restored modulation is a detached copy', st3.modulation.routes.length === 1);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/config-io.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/core/config-io.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/config-io.js`:

```js
// Loading exported configurations back in.
//
// Export writes { engine, global, params, modulation }, and the grid writes an
// array of those — that array is the notebook format, the thing you actually
// keep. Import has to accept both, restore the motion design as well as the
// look, and refuse to write junk into state.
//
// Pure: takes the engine list and the parameter schema as arguments rather than
// importing state.js, so it stays a leaf module and tests need no fixtures.

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateConfig(config, validEngines) {
  if (!isPlainObject(config)) return 'Each config must be a JSON object.';
  if (!validEngines.includes(config.engine)) {
    return `Unknown engine "${config.engine}". Expected one of: ${validEngines.join(', ')}.`;
  }
  if (!isPlainObject(config.params)) return 'Each config needs a "params" object.';
  return null;
}

export function parseConfigFile(text, validEngines) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That is not valid JSON.' };
  }

  const configs = Array.isArray(parsed) ? parsed : [parsed];
  if (!configs.length) return { ok: false, error: 'The file contains no configs.' };

  for (const config of configs) {
    const problem = validateConfig(config, validEngines);
    if (problem) return { ok: false, error: problem };
  }
  return { ok: true, configs };
}

// Anything not in the schema is dropped rather than written through. A key the
// engine never reads would sit in state forever, silently doing nothing — the
// same failure mode as the old `rotSpeedZW` ghost key.
export function sanitizeParams(params, defs) {
  const out = {};
  const dropped = [];

  for (const [key, value] of Object.entries(params || {})) {
    const def = defs?.[key];
    if (!def) {
      dropped.push(key);
      continue;
    }

    if (def.type === 'number') {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        dropped.push(key);
        continue;
      }
      const min = Number.isFinite(def.min) ? def.min : -Infinity;
      const max = Number.isFinite(def.max) ? def.max : Infinity;
      out[key] = Math.min(max, Math.max(min, num));
    } else if (def.type === 'select') {
      if (Array.isArray(def.options) && def.options.includes(value)) out[key] = value;
      else dropped.push(key);
    } else if (def.type === 'color') {
      if (typeof value === 'string' && HEX_COLOR.test(value)) out[key] = value;
      else dropped.push(key);
    } else {
      out[key] = value;
    }
  }

  return { params: out, dropped };
}

// Writes in place. state, state.global and each state.engines[...] bag are held
// by reference across main.js, StudioUI and OrbStudio; reassigning any of them
// orphans those holders.
export function applyConfig(state, config, defs) {
  const { params, dropped } = sanitizeParams(config.params, defs);

  state.engine = config.engine;
  if (isPlainObject(config.global)) Object.assign(state.global, config.global);

  if (!state.engines[config.engine]) state.engines[config.engine] = {};
  // Merge, don't replace: a partial config must not blank the keys it omits.
  Object.assign(state.engines[config.engine], params);

  // Absent on configs exported before modulation existed — keep the current rack
  // rather than wiping it.
  if (isPlainObject(config.modulation)) {
    state.modulation = structuredClone(config.modulation);
  }

  return { engine: config.engine, dropped };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/config-io.test.mjs`
Expected: every line `PASS`, final line `ALL PASS`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/config-io.js tests/config-io.test.mjs
git commit -m "Add config import parsing, validation and in-place apply"
```

---

### Task 2: Replace the import handler

**Files:**
- Modify: `src/ui/studio-ui.js`

**Interfaces:**
- Consumes: `parseConfigFile`, `applyConfig` from `../core/config-io.js`; `ENGINE_TYPES`, `ENGINE_PARAM_DEFINITIONS` (both already imported at the top of `studio-ui.js` — verify before adding).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the import**

In `src/ui/studio-ui.js`, find the line:

```js
import { PRESET_LIBRARY } from '../presets/preset-library.js';
```

Add directly below it:

```js
import { parseConfigFile, applyConfig } from '../core/config-io.js';
```

- [ ] **Step 2: Replace the handler**

In `src/ui/studio-ui.js`, find this exact block (inside `openExportModal()`):

```js
    this.modalOverlay.querySelector('#btn-import-json')?.addEventListener('click', (e) => {
      try {
        const area = this.modalOverlay.querySelector('#export-json-area');
        const parsed = JSON.parse(area.value);
        if (parsed.engine && parsed.params) {
          this.state.engine = parsed.engine;
          if (parsed.global) Object.assign(this.state.global, parsed.global);
          this.state.engines[parsed.engine] = parsed.params;
          this.onStateChange(this.state);
          this.render();
          this.closeModal();
        } else {
          alert('Invalid format. JSON must have "engine" and "params".');
        }
      } catch (err) {
        alert('Invalid JSON syntax.');
      }
    });
```

Replace it entirely with:

```js
    this.modalOverlay.querySelector('#btn-import-json')?.addEventListener('click', () => {
      const area = this.modalOverlay.querySelector('#export-json-area');
      this.importConfigText(area?.value ?? '');
    });
```

- [ ] **Step 3: Add the importer method**

In `src/ui/studio-ui.js`, find the method `exportConfig()` (it begins with the comment `// The exported config is the save format for a finding`). Insert this new method immediately **before** it:

```js
  // Accepts a single exported config or the array the variation grid writes.
  // When given an array, loads the first entry — the rest are still in the file,
  // and picking between them is a job for a future gallery.
  importConfigText(text) {
    const result = parseConfigFile(text, Object.values(ENGINE_TYPES));
    if (!result.ok) {
      alert(`Could not load that config.\n\n${result.error}`);
      return false;
    }

    const config = result.configs[0];
    const defs = ENGINE_PARAM_DEFINITIONS[config.engine] || {};
    const { dropped } = applyConfig(this.state, config, defs);

    if (dropped.length) {
      console.warn(
        `Ignored ${dropped.length} parameter(s) not in the "${config.engine}" schema: ${dropped.join(', ')}`
      );
    }

    this.state.activePresetName = 'Imported Config';
    this.onStateChange(this.state);
    this.render();
    this.closeModal();

    if (result.configs.length > 1) {
      alert(`Loaded 1 of ${result.configs.length} configs in that file (the first).`);
    }
    return true;
  }

```

- [ ] **Step 4: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 5: Verify the round-trip in the browser**

Dev server running, open http://localhost:5173, then:

```js
const { studio: s, state: st, ui } = window.__orb;

// build a config that carries a distinctive motion design
st.modulation.enabled = true;
st.modulation.routes = [{ source: 'noise1', dest: '_timeScale', amount: 0.7 }];
st.engines[st.engine].edgeGlow = 2.4;
s.updateParameters(st);

const exported = JSON.stringify(ui.exportConfig());

// wipe it, then load it back
st.modulation.enabled = false;
st.modulation.routes = [];
st.engines[st.engine].edgeGlow = 0.5;
s.updateParameters(st);

ui.importConfigText(exported);

JSON.stringify({
  glowRestored: st.engines[st.engine].edgeGlow === 2.4,
  modulationRestored: st.modulation.routes.length === 1,   // the bug this fixes
  modulationEnabled: st.modulation.enabled === true,
  routeDest: st.modulation.routes[0]?.dest,                // expect "_timeScale"
}, null, 2);
```

Expected: all `true`, `routeDest: "_timeScale"`. **`modulationRestored` is the assertion that matters** — before this change it was always `0`.

Now confirm a grid export array loads, a partial config does not blank other keys, and junk is rejected:

```js
const { state: st, ui } = window.__orb;
const engine = st.engine;

// grid-style array
const arr = JSON.stringify([ui.exportConfig(), ui.exportConfig()]);
const arrOk = ui.importConfigText(arr);

// partial config must merge, not replace
const before = { ...st.engines[engine] };
ui.importConfigText(JSON.stringify({ engine, global: {}, params: { edgeGlow: 1.1 } }));
const otherKey = Object.keys(before).find(k => k !== 'edgeGlow');

JSON.stringify({
  arrayAccepted: arrOk,
  partialMerged: st.engines[engine][otherKey] === before[otherKey],  // expect true
  edgeGlowUpdated: st.engines[engine].edgeGlow === 1.1,
  junkRejected: ui.importConfigText('{not json') === false,
  unknownEngineRejected: ui.importConfigText('{"engine":"nope","params":{}}') === false,
}, null, 2);
```

Expected: **all five values `true`.** `importConfigText` returns `false` when it rejects input, and the last two lines compare against `false` — so a `true` result there means the rejection happened as intended. Two `alert()` dialogs will appear during this snippet; dismiss them.

- [ ] **Step 6: Commit**

```bash
git add src/ui/studio-ui.js
git commit -m "Restore modulation on import and accept grid export arrays"
```

---

### Task 3: Load a config file from disk

**Files:**
- Modify: `src/ui/studio-ui.js`
- Modify: `src/style.css` (append at end)

**Interfaces:**
- Consumes: `this.importConfigText` from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the file input to the modal markup**

In `src/ui/studio-ui.js`, find this line inside `openExportModal()`:

```js
              <button class="btn-accent" id="btn-import-json">Load from Textarea</button>
```

Replace it with:

```js
              <button class="btn-accent" id="btn-import-json">Load from Textarea</button>
              <label class="import-file-label" for="import-config-file">Load .json file…</label>
              <input type="file" id="import-config-file" accept="application/json,.json" hidden />
```

- [ ] **Step 2: Wire the file input**

In `src/ui/studio-ui.js`, find the handler you wrote in Task 2:

```js
    this.modalOverlay.querySelector('#btn-import-json')?.addEventListener('click', () => {
      const area = this.modalOverlay.querySelector('#export-json-area');
      this.importConfigText(area?.value ?? '');
    });
```

Add directly below it:

```js
    this.modalOverlay.querySelector('#import-config-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        // Show what was loaded in the textarea too, so a rejected file can be
        // inspected and corrected in place rather than re-picked.
        const area = this.modalOverlay.querySelector('#export-json-area');
        if (area) area.value = text;
        this.importConfigText(text);
      } catch (err) {
        console.warn('Could not read that file', err);
        alert('Could not read that file.');
      } finally {
        // Reset so picking the same file twice fires `change` again.
        e.target.value = '';
      }
    });
```

- [ ] **Step 3: Append the styles**

Append to the end of `src/style.css`:

```css

/* ---------------------------------------------------------------------------
   File picker in the export modal. A bare <input type="file"> can't be styled,
   so the input is hidden and this label is the button.
   --------------------------------------------------------------------------- */
.import-file-label {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  margin-left: 8px;
  border-radius: var(--radius-pill);
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  font-family: var(--font);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.import-file-label:hover {
  border-color: var(--primary);
  color: var(--primary);
}
```

- [ ] **Step 4: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 5: Verify in the browser**

Dev server running, open http://localhost:5173. Then:

1. Press `G` to enter the variation grid, shift-click two cells to mark them, press `E`. A file `orb-variations-<engine>-<timestamp>.json` downloads. Press `G` to exit.
2. Run `window.__orb.ui.openExportModal()`, switch to the **JSON Config** tab, click **Load .json file…**, and pick the file you just downloaded.
3. Expect: an alert reading `Loaded 1 of 2 configs in that file (the first).`, the modal closes, and the orb changes to the first marked cell's configuration.

Confirm the structural wiring without the file dialog:

```js
window.__orb.ui.openExportModal();
JSON.stringify({
  labelPresent: !!document.querySelector('.import-file-label'),
  inputPresent: !!document.querySelector('#import-config-file'),
  inputHidden: document.querySelector('#import-config-file')?.hidden === true,
  labelPointsAtInput: document.querySelector('.import-file-label')?.getAttribute('for') === 'import-config-file',
});
```

Expected: all `true`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/studio-ui.js src/style.css
git commit -m "Add a file picker for loading exported configs from disk"
```

---

## Definition of done

- `node tests/config-io.test.mjs` prints `ALL PASS`.
- `npx vite build` succeeds.
- Exporting a config with modulation routes and importing it back restores those routes.
- A grid export array loads its first config and reports how many were in the file.
- A partial config merges over the current parameters instead of blanking omitted keys.
- Malformed JSON and unknown engine ids are rejected with a readable message and leave state untouched.
- Parameters not in the engine's schema are dropped and logged, never written into state.
- A `.json` file can be loaded from disk.
- No console errors beyond the intentional `console.warn` for dropped keys.
