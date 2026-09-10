# Findings Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every good accident. One key stashes the current orb with a thumbnail; a gallery tab shows what you have found and loads any of it back.

**Architecture:** Capture today means downloading a JSON file and hoping you remember which one was which — filenames are timestamps and there is no way to see a finding without loading it. Exploration produces a stream of near-misses and occasional hits, and without frictionless capture it is amnesia. This adds a localStorage-backed store of findings, each with a small rendered thumbnail, plus a gallery tab. Storage accounting and pruning live in a pure module so quota behaviour is unit-tested rather than discovered when the browser throws.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160, localStorage. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework. UI is HTML strings and DOM nodes.
- **ES modules**, `"type": "module"`.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No test framework; do not add one. Exit `0` on pass, `1` on fail. Node has no `localStorage`, so the store module must accept an injectable storage object.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Do not touch the existing preset store.** `saveCustomPreset` / `loadSavedPresets` / `deleteCustomPreset` in `src/core/state.js` use the key `lumaform_orb_custom_presets_v1`. Findings are a different thing with a different lifecycle — use a separate key and leave presets alone.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: the repository root. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` — especially §4 ("Capture") and §6 (what the export format is and is not: a lab notebook, not an interop contract).

**What a finding is.** The same shape the app already exports, from `StudioUI.exportConfig()` in `src/ui/studio-ui.js`:

```js
{ engine, global, params, modulation }
```

A gallery entry wraps that with `{ id, createdAt, note, thumb }`.

**The app state object** (`createInitialState()` in `src/core/state.js`):

```js
{ engine, activePresetName, global: {...}, modulation: {...}, engines: { <id>: {...}, ... } }
```

**Loading a finding back** is exactly what `StudioUI.importConfigText(text)` already does — it parses, validates against the schema, applies in place, re-renders, and returns a boolean. **Reuse it.** Do not write a second apply path.

**Critical invariant** (`docs/VISION.md` §5): never reassign `state`, `state.global` or `state.engines[<id>]`; they are held by reference across `main.js`, `StudioUI` and `OrbStudio`.

**Rendering a thumbnail.** `OrbStudio.captureSnapshot({ transparent, multiplier })` in `src/core/studio.js` renders at a multiple of the window size, calls `toDataURL('image/png')`, restores the renderer, **and triggers a download**. You cannot reuse it as-is for thumbnails — you need the data URL without the download and at a small fixed size. Task 2 extracts the render half.

The renderer is created with `preserveDrawingBuffer: true`, so `toDataURL` works.

**The tab system** in `src/ui/studio-ui.js`: `validTabs` (a `const` array in the constructor), the tab buttons in `render()`, and a `switch` in `renderTabContent()`. Listeners are attached from `render()` via `attachControlListeners()` / `attachMotionLabListeners()`. **`render()` assigns `this.root.innerHTML`**, so anything parented to `this.root` is destroyed on every re-render — attach listeners inside the attach cycle, never once.

**Existing keybindings — do not collide.** `src/ui/studio-ui.js`: `Space`, `R`, `H`, `S`, `Escape`. `src/main.js`: `G`, `K`, `1`, `2`, `` ` ``, and in grid mode `M`, `T`, `E`. **`src/main.js` returns early on any `metaKey`/`ctrlKey`/`altKey`**, so do not plan modifier chords. This plan uses **`C`** (capture), which is free.

**Browser verification handle:** `window.__orb = { studio, state, ui }`.

**CRITICAL browser gotchas:**
- A hidden Browser pane means `requestAnimationFrame` never fires and the render loop is frozen. `studio.fpsTracker.fps` still reports its default `60` — not a liveness signal. Step frames with `studio.renderFrame()`.
- CSS transitions are frozen too; `getComputedStyle()` on a transitioning property returns the starting value forever.
- Thumbnails render through the composer, which works while hidden, but call `studio.renderFrame()` at least once first so there is a frame to capture.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/findings.js` | **Create.** The findings store: entry shape, size accounting, pruning, persistence. Storage is injected, so it is testable in Node. |
| `src/core/studio.js` | **Modify.** Extract `renderToDataURL()` out of `captureSnapshot()` and add `captureThumbnail()`. |
| `src/ui/studio-ui.js` | **Modify.** A `findings` tab: grid of thumbnails, load, rename, delete; plus `saveFinding()`. |
| `src/main.js` | **Modify.** Bind `C` to capture a finding. |
| `src/style.css` | **Modify.** Append gallery styles. |
| `tests/findings.test.mjs` | **Create.** Node tests for the store. |

---

### Task 1: The findings store

**Files:**
- Create: `src/core/findings.js`
- Test: `tests/findings.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `FINDINGS_KEY = 'lumaform_findings_v1'`
  - `MAX_BYTES = 4_000_000` — localStorage is typically ~5 MB per origin; leave headroom for the preset store and anything else.
  - `makeFinding({ engine, global, params, modulation, thumb, note }) => entry` — adds `id` (unique) and `createdAt` (epoch ms). `note` defaults to `''`.
  - `estimateBytes(entry) => number` — byte length of the entry serialised as JSON.
  - `pruneToQuota(entries, maxBytes = MAX_BYTES) => entries` — keeps newest first and drops from the oldest end until the total fits. Always keeps at least one entry, even if that entry alone exceeds the quota (dropping the thing the user just saved is worse than being over budget).
  - `createFindingsStore(storage) => store` with `list()`, `add(entry)`, `remove(id)`, `rename(id, note)`, `clear()`. `list()` returns newest first and tolerates missing, empty or corrupt stored JSON by returning `[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/findings.test.mjs`:

```js
import {
  FINDINGS_KEY,
  MAX_BYTES,
  makeFinding,
  estimateBytes,
  pruneToQuota,
  createFindingsStore,
} from '../src/core/findings.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// Minimal in-memory localStorage stand-in; Node has no real one.
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() { return map.size; },
  };
}

const base = { engine: 'quantum', global: { bloomStrength: 0.6 }, params: { edgeGlow: 1.2 }, modulation: { enabled: false, sources: {}, routes: [] }, thumb: 'data:image/jpeg;base64,AAAA' };

// --- makeFinding ---
const f1 = makeFinding(base);
ok('has an id', typeof f1.id === 'string' && f1.id.length > 0);
ok('has a timestamp', typeof f1.createdAt === 'number' && f1.createdAt > 0);
ok('note defaults to empty', f1.note === '');
ok('carries the config', f1.engine === 'quantum' && f1.params.edgeGlow === 1.2 && f1.modulation !== undefined);
ok('ids are unique', new Set([makeFinding(base).id, makeFinding(base).id, makeFinding(base).id]).size === 3);
ok('note is preserved when given', makeFinding({ ...base, note: 'thinking?' }).note === 'thinking?');

// --- estimateBytes ---
ok('estimates a positive size', estimateBytes(f1) > 0);
ok('a bigger thumb estimates bigger',
  estimateBytes(makeFinding({ ...base, thumb: 'x'.repeat(5000) })) > estimateBytes(f1));

// --- pruneToQuota ---
const many = [];
for (let i = 0; i < 20; i++) many.push(makeFinding({ ...base, thumb: 'x'.repeat(1000), note: `n${i}` }));
const pruned = pruneToQuota(many, 6000);
ok('prunes to fit the quota', estimateBytes(pruned) <= 6000 || pruned.length === 1, String(pruned.length));
ok('prunes from the oldest end', pruned[0].note === many[0].note);
ok('keeps at least one entry', pruneToQuota(many, 1).length === 1);
ok('leaves a small list untouched', pruneToQuota(many.slice(0, 2), MAX_BYTES).length === 2);
ok('handles an empty list', pruneToQuota([], 1000).length === 0);

// --- createFindingsStore ---
const storage = memoryStorage();
const store = createFindingsStore(storage);
ok('starts empty', store.list().length === 0);

const added = store.add(makeFinding({ ...base, note: 'first' }));
ok('add returns the entry', added.note === 'first');
ok('add persists', store.list().length === 1);
ok('writes under the documented key', storage.getItem(FINDINGS_KEY) !== null);

store.add(makeFinding({ ...base, note: 'second' }));
ok('newest is first', store.list()[0].note === 'second');

const id = store.list()[0].id;
store.rename(id, 'renamed');
ok('rename works', store.list()[0].note === 'renamed');
ok('rename ignores unknown ids', (() => { store.rename('nope', 'x'); return store.list().length === 2; })());

store.remove(id);
ok('remove works', store.list().length === 1 && store.list()[0].note === 'first');
ok('remove ignores unknown ids', (() => { store.remove('nope'); return store.list().length === 1; })());

store.clear();
ok('clear empties the store', store.list().length === 0);

// --- resilience ---
ok('tolerates corrupt json', createFindingsStore(memoryStorage({ [FINDINGS_KEY]: '{not json' })).list().length === 0);
ok('tolerates a non-array payload', createFindingsStore(memoryStorage({ [FINDINGS_KEY]: '{"a":1}' })).list().length === 0);
ok('tolerates a missing key', createFindingsStore(memoryStorage()).list().length === 0);

// a storage that throws on write (quota exceeded) must not take down the caller
const throwing = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
ok('survives a throwing storage', (() => {
  try { createFindingsStore(throwing).add(makeFinding(base)); return true; } catch { return false; }
})());

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/findings.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/core/findings.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/findings.js`:

```js
// The findings shelf — keeping good accidents.
//
// Exploration produces a stream of near-misses and the occasional hit. Without
// frictionless capture it is amnesia, and a folder of timestamped JSON files you
// cannot see is barely better than nothing.
//
// Storage is injected rather than reaching for window.localStorage, so quota and
// corruption behaviour can be tested in Node.

export const FINDINGS_KEY = 'lumaform_findings_v1';

// localStorage is typically ~5 MB per origin and the preset store shares it.
export const MAX_BYTES = 4_000_000;

let counter = 0;

export function makeFinding({ engine, global, params, modulation, thumb, note = '' }) {
  counter += 1;
  return {
    id: `f${Date.now().toString(36)}-${counter.toString(36)}`,
    createdAt: Date.now(),
    note,
    engine,
    global,
    params,
    modulation,
    thumb,
  };
}

export function estimateBytes(value) {
  return JSON.stringify(value)?.length ?? 0;
}

// Entries arrive newest-first and are dropped from the oldest end.
export function pruneToQuota(entries, maxBytes = MAX_BYTES) {
  const out = [...entries];
  while (out.length > 1 && estimateBytes(out) > maxBytes) out.pop();
  return out;
}

export function createFindingsStore(storage) {
  function read() {
    try {
      const raw = storage.getItem(FINDINGS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // A corrupt shelf must not take out the app; an empty one is recoverable.
      return [];
    }
  }

  function write(entries) {
    try {
      storage.setItem(FINDINGS_KEY, JSON.stringify(pruneToQuota(entries)));
    } catch (err) {
      console.warn('Could not persist findings (storage full or unavailable)', err);
    }
    return entries;
  }

  return {
    list() {
      return read().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    },
    add(entry) {
      write([entry, ...read()]);
      return entry;
    },
    remove(id) {
      write(read().filter((e) => e.id !== id));
    },
    rename(id, note) {
      write(read().map((e) => (e.id === id ? { ...e, note } : e)));
    },
    clear() {
      write([]);
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/findings.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add src/core/findings.js tests/findings.test.mjs
git commit -m "Add a localStorage-backed findings store with quota pruning"
```

---

### Task 2: Thumbnail rendering

**Files:**
- Modify: `src/core/studio.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `studio.renderToDataURL({ width, height, transparent, mimeType, quality }) => string` — renders once at the given size and returns a data URL, restoring the renderer afterwards. No download.
  - `studio.captureThumbnail() => string` — a 240×150 JPEG data URL at quality 0.72. JPEG, not PNG: a PNG of a glowing orb is 5–10× larger, and dozens of them will not fit in localStorage.
  - `captureSnapshot()` keeps its current behaviour and signature, now delegating the render half.

- [ ] **Step 1: Extract the render, keep the download**

In `src/core/studio.js`, find the whole `captureSnapshot` method (it begins `captureSnapshot({ transparent = false, multiplier = 1 } = {}) {` and ends with `return dataUrl;` followed by `}`). Replace the entire method with:

```js
  // Render one frame at an arbitrary size and hand back a data URL. Restores the
  // renderer, composer and camera afterwards so the live view is untouched.
  renderToDataURL({ width, height, transparent = false, mimeType = 'image/png', quality } = {}) {
    const origWidth = window.innerWidth;
    const origHeight = window.innerHeight;
    const targetWidth = Math.max(1, Math.round(width ?? origWidth));
    const targetHeight = Math.max(1, Math.round(height ?? origHeight));

    const prevClearColor = new THREE.Color();
    this.renderer.getClearColor(prevClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();
    const prevBg = this.scene.background;

    if (transparent) {
      this.renderer.setClearColor(0x000000, 0);
      this.scene.background = null;
    }

    this.renderer.setSize(targetWidth, targetHeight, false);
    this.composer.setSize(targetWidth, targetHeight);
    this.camera.aspect = targetWidth / targetHeight;
    this.camera.updateProjectionMatrix();
    if (this.activeEngine?.resize) this.activeEngine.resize(targetWidth, targetHeight);

    this.composer.render();
    const dataUrl = this.renderer.domElement.toDataURL(mimeType, quality);

    this.renderer.setClearColor(prevClearColor, prevClearAlpha);
    this.scene.background = prevBg;
    this.renderer.setSize(origWidth, origHeight, false);
    this.composer.setSize(origWidth, origHeight);
    this.camera.aspect = origWidth / origHeight;
    this.camera.updateProjectionMatrix();
    if (this.activeEngine?.resize) this.activeEngine.resize(origWidth, origHeight);

    return dataUrl;
  }

  // JPEG rather than PNG: a PNG of a glowing orb is several times larger, and
  // dozens of these have to share a ~5 MB localStorage budget.
  captureThumbnail() {
    return this.renderToDataURL({
      width: 240,
      height: 150,
      transparent: false,
      mimeType: 'image/jpeg',
      quality: 0.72,
    });
  }

  captureSnapshot({ transparent = false, multiplier = 1 } = {}) {
    const dataUrl = this.renderToDataURL({
      width: window.innerWidth * multiplier,
      height: window.innerHeight * multiplier,
      transparent,
    });

    const link = document.createElement('a');
    link.download = `orb-${this.activeEngineType}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();

    return dataUrl;
  }
```

- [ ] **Step 2: Verify the build and that snapshots still work**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

In the browser (dev server running, http://localhost:5173):

```js
const s = window.__orb.studio;
for (let i = 0; i < 3; i++) s.renderFrame();
const thumb = s.captureThumbnail();
JSON.stringify({
  isJpegDataUrl: thumb.startsWith('data:image/jpeg'),
  approxBytes: thumb.length,                    // expect well under 40000
  rendererRestored: s.renderer.domElement.width > 400,
  stillRenders: (() => { s.renderFrame(); return true; })(),
});
```

Expected: `isJpegDataUrl: true`, a modest `approxBytes`, `rendererRestored: true`.

- [ ] **Step 3: Commit**

```bash
git add src/core/studio.js
git commit -m "Extract renderToDataURL and add small JPEG thumbnails"
```

---

### Task 3: The gallery tab

**Files:**
- Modify: `src/ui/studio-ui.js`
- Modify: `src/style.css` (append at end)

**Interfaces:**
- Consumes: `createFindingsStore`, `makeFinding` from `../core/findings.js`; `studio.captureThumbnail()`; `this.exportConfig()`; `this.importConfigText()`.
- Produces:
  - `StudioUI.findings` — the store instance.
  - `StudioUI.saveFinding(note = '')` — captures a thumbnail plus the current config and adds it. Returns the entry.
  - A `findings` tab.

- [ ] **Step 1: Import and instantiate the store**

In `src/ui/studio-ui.js`, find:

```js
import { parseConfigFile, applyConfig } from '../core/config-io.js';
```

Add directly below it:

```js
import { createFindingsStore, makeFinding } from '../core/findings.js';
```

Then find, in the constructor:

```js
    this.isZenMode = false;
    this.isSidebarOpen = true;
```

Add directly below it:

```js
    this.findings = createFindingsStore(window.localStorage);
```

- [ ] **Step 2: Register the tab**

In `src/ui/studio-ui.js`, find:

```js
    const validTabs = ['presets', 'colors', 'geometry', 'motion', 'motionlab', 'optics', 'space', 'export', 'perf'];
```

Replace with:

```js
    const validTabs = ['presets', 'findings', 'colors', 'geometry', 'motion', 'motionlab', 'optics', 'space', 'export', 'perf'];
```

Then find, in `render()`:

```js
          <button class="tab-btn ${this.activeTab === 'colors' ? 'active' : ''}" data-tab="colors">Colors</button>
```

Insert directly **above** it:

```js
          <button class="tab-btn ${this.activeTab === 'findings' ? 'active' : ''}" data-tab="findings">Findings</button>
```

Then find, in `renderTabContent()`:

```js
      case 'colors':
        return this.renderParamsSection('colors');
```

Insert directly **above** it:

```js
      case 'findings':
        return this.renderFindingsTab();
```

- [ ] **Step 3: Add the save method and the tab renderer**

In `src/ui/studio-ui.js`, find the method `exportConfig() {` (it is preceded by the comment `// The exported config is the save format for a finding`). Insert these two methods immediately **above** that comment:

```js
  // A finding is the exported config plus a thumbnail, so the shelf can be
  // browsed by eye rather than by timestamp.
  saveFinding(note = '') {
    const config = this.exportConfig();
    const entry = makeFinding({
      engine: config.engine,
      global: structuredClone(config.global),
      params: structuredClone(config.params),
      modulation: structuredClone(config.modulation),
      thumb: this.studio.captureThumbnail(),
      note,
    });
    this.findings.add(entry);
    if (this.activeTab === 'findings') this.render();
    return entry;
  }

  renderFindingsTab() {
    const entries = this.findings.list();

    if (!entries.length) {
      return `
        <div class="panel-section">
          <div class="section-header"><span class="section-title">FINDINGS</span></div>
          <div class="empty-notice">
            Nothing kept yet. Press <b>C</b> to stash the current orb with a thumbnail.
          </div>
        </div>
      `;
    }

    return `
      <div class="panel-section">
        <div class="section-header">
          <span class="section-title">FINDINGS</span>
          <span class="section-meta">${entries.length} kept</span>
        </div>
        <div class="findings-grid">
          ${entries.map((e) => `
            <div class="finding-card" data-finding="${e.id}">
              <img class="finding-thumb" src="${e.thumb}" alt="" loading="lazy" />
              <div class="finding-meta">
                <input class="finding-note" data-finding-note="${e.id}"
                       value="${(e.note || '').replace(/"/g, '&quot;')}" placeholder="name this…" />
                <span class="finding-engine">${e.engine}</span>
              </div>
              <div class="finding-actions">
                <button class="btn-sm btn-accent" data-finding-load="${e.id}">Load</button>
                <button class="cp-delete-btn" data-finding-delete="${e.id}" title="Delete">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="modal-footer-row" style="margin-top: 12px;">
          <button class="btn-sm" id="btn-findings-clear">Clear all</button>
        </div>
      </div>
    `;
  }

  attachFindingsListeners() {
    this.root.querySelectorAll('[data-finding-load]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-finding-load');
        const entry = this.findings.list().find((e) => e.id === id);
        if (!entry) return;
        // Route through the existing import path so a finding gets the same
        // schema validation and in-place apply as a pasted config.
        this.importConfigText(JSON.stringify({
          engine: entry.engine,
          global: entry.global,
          params: entry.params,
          modulation: entry.modulation,
        }));
      });
    });

    this.root.querySelectorAll('[data-finding-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.findings.remove(btn.getAttribute('data-finding-delete'));
        this.render();
      });
    });

    this.root.querySelectorAll('[data-finding-note]').forEach((input) => {
      // 'change', not 'input': re-rendering on every keystroke would blur the
      // field mid-word, because render() replaces root.innerHTML.
      input.addEventListener('change', (e) => {
        this.findings.rename(input.getAttribute('data-finding-note'), e.target.value);
      });
    });

    this.root.querySelector('#btn-findings-clear')?.addEventListener('click', () => {
      if (confirm('Delete every kept finding? This cannot be undone.')) {
        this.findings.clear();
        this.render();
      }
    });
  }

```

- [ ] **Step 4: Attach the listeners**

In `src/ui/studio-ui.js`, find:

```js
    this.attachControlListeners();
    this.attachMotionLabListeners();
```

Replace with:

```js
    this.attachControlListeners();
    this.attachMotionLabListeners();
    this.attachFindingsListeners();
```

- [ ] **Step 5: Append the styles**

Append to the end of `src/style.css`:

```css

/* ---------------------------------------------------------------------------
   Findings gallery — browse kept configs by eye rather than by timestamp.
   --------------------------------------------------------------------------- */
.findings-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.finding-card {
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
  transition: border-color 0.15s ease;
}

.finding-card:hover {
  border-color: rgba(255, 237, 0, 0.4);
}

.finding-thumb {
  display: block;
  width: 100%;
  aspect-ratio: 8 / 5;
  object-fit: cover;
  background: #000;
}

.finding-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 2px;
}

.finding-note {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: var(--text-primary);
  font-family: var(--font);
  font-size: 11px;
  padding: 2px 0;
}

.finding-note:focus {
  outline: none;
  border-bottom-color: var(--primary);
}

.finding-engine {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.finding-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 8px;
}

.finding-actions .btn-sm {
  flex: 1;
}
```

- [ ] **Step 6: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/studio-ui.js src/style.css
git commit -m "Add a findings gallery tab with thumbnails, rename and load"
```

---

### Task 4: Bind the capture key

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `ui.saveFinding()`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Bind `C`**

In `src/main.js`, find:

```js
  if (e.code === 'KeyK') {
    e.preventDefault();
    toggleSweep();
    return;
  }
```

Insert directly **above** it:

```js
  // C keeps the current orb on the findings shelf. Deliberately one key with no
  // dialog — capture that costs a prompt does not get used mid-exploration.
  if (e.code === 'KeyC' && !studio.isGridMode) {
    e.preventDefault();
    const entry = ui.saveFinding();
    console.info(`Kept finding ${entry.id}`);
    return;
  }

```

- [ ] **Step 2: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 3: Verify in the browser**

Dev server running, open http://localhost:5173:

```js
const { studio: s, state: st, ui } = window.__orb;
ui.findings.clear();
for (let i = 0; i < 3; i++) s.renderFrame();

// keep two distinguishable findings
st.engines[st.engine].edgeGlow = 0.3; s.updateParameters(st); s.renderFrame();
const a = ui.saveFinding('dim');
st.engines[st.engine].edgeGlow = 2.7; s.updateParameters(st); s.renderFrame();
const b = ui.saveFinding('bright');

const list = ui.findings.list();
const out = {
  count: list.length,
  newestFirst: list[0].note === 'bright',
  hasThumb: list[0].thumb.startsWith('data:image/jpeg'),
  carriesModulation: list[0].modulation !== undefined,
  totalBytes: JSON.stringify(list).length,
};

// loading a finding must restore it
st.engines[st.engine].edgeGlow = 1.5; s.updateParameters(st);
ui.importConfigText(JSON.stringify({ engine: a.engine, global: a.global, params: a.params, modulation: a.modulation }));
out.loadedRestoresGlow = st.engines[st.engine].edgeGlow === 0.3;

// the tab renders
ui.activeTab = 'findings'; ui.render();
out.cardsRendered = document.querySelectorAll('.finding-card').length;
out.thumbsRendered = document.querySelectorAll('.finding-thumb').length;

// survives a reload of the store
out.persisted = ui.findings.list().length === 2;
return JSON.stringify(out, null, 2);
```

Expected: `count: 2`, `newestFirst: true`, `hasThumb: true`, `carriesModulation: true`, `loadedRestoresGlow: true`, `cardsRendered: 2`, and a `totalBytes` comfortably under a megabyte.

Then confirm the shelf survives a page reload — reload http://localhost:5173, open the **Findings** tab, and check both cards are still there with their thumbnails.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "Bind C to keep the current orb as a finding"
```

---

## Definition of done

- `node tests/findings.test.mjs` prints `ALL PASS`, and the other suites still do.
- `npx vite build` succeeds.
- `C` keeps a finding with a visible thumbnail; the Findings tab shows them newest-first.
- Load restores the config **including modulation**; rename and delete persist; Clear all asks first.
- Findings survive a page reload.
- A corrupt or full localStorage degrades to an empty shelf with a warning rather than an exception.
- `S` still downloads a full-size PNG snapshot as before.
- No console errors beyond the intentional `console.info` on capture.

## Follow-up worth noting

This is the tool's memory. Once a session's worth of findings exists, reading them side by side is what produces the motion vocabulary `docs/VISION.md` §3 is waiting for. Update the capability inventory in that document's appendix in the same commit as your last task — it went stale immediately last time.
