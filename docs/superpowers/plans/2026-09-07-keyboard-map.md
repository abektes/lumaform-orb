# Keyboard Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `?` overlay listing every keyboard shortcut, backed by a single registry that a test proves is complete.

**Architecture:** Seventeen bare-key shortcuts have accumulated across two files, and **not one of them is documented anywhere in the app**. Every one is a bare letter with no visible affordance, so the fastest paths through the tool are invisible unless you read the source. That is a discovery-rate problem, which puts it squarely in `docs/VISION.md` §4: an instrument you cannot find the controls of has a low discovery rate no matter how good the controls are.

The trap with a help overlay is that it rots — someone adds a key and forgets the list. So the registry is a real module, and a Node test scans `src/main.js` and `src/ui/studio-ui.js` for `e.code === '…'` literals and **fails if any binding is missing from the registry**. The documentation cannot silently fall behind the code.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework. UI is HTML strings and DOM nodes.
- **ES modules**, `"type": "module"`.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No test framework; do not add one. Exit `0` on pass, `1` on fail. Anything tested must be free of DOM and Three.js.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: the repository root. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` first — especially §4 and §10.

**The complete current binding inventory**, verified by reading the source:

`src/ui/studio-ui.js` (`bindEvents`, ~line 108). Guarded only by "not typing in an INPUT/TEXTAREA":

| Code | Action |
| --- | --- |
| `Space` | play / pause |
| `KeyR` | randomize |
| `KeyH` | zen mode (hide the UI) |
| `KeyS` | PNG snapshot (explicitly skipped when Cmd/Ctrl is held, so Cmd+S still saves the page) |
| `Escape` | close the modal |

`src/main.js` (~line 328). **Returns early on `metaKey` / `ctrlKey` / `altKey`** so no modified chord is ever claimed — but *not* on `shiftKey`:

| Code | Action | Context |
| --- | --- | --- |
| `Digit1` / `Digit2` | store the current config into A / B | single-orb only |
| `Backquote` | swap A ↔ B without rebuilding the engine | single-orb only |
| `KeyD` | cycle the transition duration | single-orb only |
| `KeyF` | cycle the transition curve | single-orb only |
| `KeyV` | start / stop clip recording | anywhere |
| `KeyC` | keep the current orb as a finding | single-orb only |
| `KeyK` | toggle the parameter sweep strip | anywhere |
| `KeyG` | toggle the variation grid | anywhere |
| `KeyM` | cycle the mutation radius | grid only |
| `KeyT` | re-trigger every cell's envelopes | grid only |
| `KeyE` | export the marked cells | grid only |

Because the guard ignores `shiftKey`, **`Shift+/` arrives as `e.code === 'Slash'`** and is free. That is the key this plan binds.

**If the rehearsal-room sprint has already landed**, `src/main.js` also binds `KeyP` (play the rehearsal loop). The guard test in Task 1 will tell you: it fails listing any code found in the source but absent from the registry. Add whatever it names.

**Where this mounts, and why it is the exception.** `ui.root` (`.studio-ui-root`, `z-index: 10`) is a positioned element and therefore forms a **stacking context**. Inside it are two layers: `ui.panelLayer` (`z-index: 2`, rewritten wholesale by `render()`) and `ui.overlayLayer` (`z-index: 1`, never rewritten). Because `overlayLayer` sits *below* `panelLayer` and neither can escape the root's stacking context, **anything in `overlayLayer` paints under the inspector panel** — which is right for the grid HUD and the A/B readout, and wrong for a full-screen help map that must cover the panel.

So this overlay mounts on **`ui.container`** — which is `document.body` — as a sibling of `.studio-ui-root`, exactly like the existing `.studio-modal-overlay` (`z-index: 200`) and `.zen-hint-pill` (`z-index: 100`). At `z-index: 150` it lands above the root and the zen pill, and below the modal, so a real dialog still wins.

**Do not copy this for ordinary chrome.** Long-lived overlays that belong *beneath* the panel go in `ui.overlayLayer`; mounting those on `document.body` is what previously made the grid HUD cover the engine dropdown. Body-level mounting is for full-screen dialogs only.

**Browser verification handle:** `window.__orb = { studio, state, ui, ab }`.

**CRITICAL browser gotchas:**
- A hidden Browser pane means `requestAnimationFrame` never fires and the render loop is frozen. `studio.fpsTracker.fps` still reports its default `60` — not a liveness signal. Step frames with `studio.renderFrame()`.
- CSS transitions are frozen too, so `getComputedStyle()` on a transitioning property returns the *starting* value forever. Set `element.style.transition = 'none'` before measuring. And an ancestor's `opacity: 0` does not change a descendant's computed opacity — assert on the element that carries the rule. **This overlay fades in**, so measuring its opacity in a hidden pane will read `0` forever; assert on the `hidden` class instead.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/shortcuts.js` | **Create.** The registry and key formatting. Pure, unit-tested. |
| `src/ui/shortcuts-overlay.js` | **Create.** Builds and toggles the overlay node. |
| `src/main.js` | **Modify.** Mount the overlay, bind `Slash`. |
| `src/ui/studio-ui.js` | **Modify.** A `?` button in the top bar. |
| `src/style.css` | **Modify.** Append overlay styles. |
| `tests/shortcuts.test.mjs` | **Create.** Registry well-formedness **and** the source-scan completeness guard. |

---

### Task 1: The shortcut registry and its completeness guard

**Files:**
- Create: `src/core/shortcuts.js`
- Test: `tests/shortcuts.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SHORTCUTS` — an array of `{ code, label, context, group }`. `context` is `'any' | 'single' | 'grid'`.
  - `SHORTCUT_GROUPS` — ordered group names for display.
  - `formatKey(code) => string` — `'KeyR'` → `'R'`, `'Digit1'` → `'1'`, `'Backquote'` → `'` '`, `'Slash'` → `'?'`, `'Space'` → `'Space'`.
  - `shortcutsInGroup(group) => Shortcut[]`
  - `KNOWN_CODES` — a `Set` of every registered code, for the guard test.

- [ ] **Step 1: Write the failing test**

Create `tests/shortcuts.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  KNOWN_CODES,
  formatKey,
  shortcutsInGroup,
} from '../src/core/shortcuts.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// --- shape ---
ok('registry is non-empty', SHORTCUTS.length > 0);
ok('every entry is well formed', SHORTCUTS.every((s) =>
  typeof s.code === 'string' && s.code &&
  typeof s.label === 'string' && s.label &&
  ['any', 'single', 'grid'].includes(s.context) &&
  SHORTCUT_GROUPS.includes(s.group)));

// --- no ambiguous bindings ---
// The same code may legitimately appear twice with DIFFERENT contexts (grid mode
// reuses keys), but never twice in the same context.
const seen = new Map();
let clash = null;
for (const s of SHORTCUTS) {
  const key = `${s.code}:${s.context}`;
  if (seen.has(key)) clash = key;
  seen.set(key, s);
  // 'any' overlapping a mode-specific binding of the same code is also ambiguous.
  const other = s.context === 'any' ? null : `${s.code}:any`;
  if (other && seen.has(other)) clash = `${s.code} bound both globally and in ${s.context}`;
}
ok('no code is bound twice in one context', clash === null, clash || '');

// --- formatting ---
ok('letters strip the KeyX prefix', formatKey('KeyR') === 'R');
ok('digits strip the DigitX prefix', formatKey('Digit1') === '1');
ok('backquote renders as a backtick', formatKey('Backquote') === '`');
ok('slash renders as the question mark you actually press', formatKey('Slash') === '?');
ok('space keeps its word', formatKey('Space') === 'Space');
ok('escape keeps its word', formatKey('Escape') === 'Esc');
ok('an unknown code passes through', formatKey('F13') === 'F13');

// --- grouping ---
ok('every group has entries', SHORTCUT_GROUPS.every((g) => shortcutsInGroup(g).length > 0));
ok('grouping covers the whole registry',
  SHORTCUT_GROUPS.reduce((n, g) => n + shortcutsInGroup(g).length, 0) === SHORTCUTS.length);

// --- the completeness guard ---
// Scans the real handlers for bound codes. This is what stops the help overlay
// from rotting the first time someone adds a key and forgets the list.
const sources = ['src/main.js', 'src/ui/studio-ui.js'];
const bound = new Set();
for (const path of sources) {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  for (const match of text.matchAll(/e\.code\s*===\s*'([A-Za-z0-9]+)'/g)) {
    bound.add(match[1]);
  }
}
ok('the scan found the handlers at all', bound.size >= 15, `${bound.size} codes found`);

const missing = [...bound].filter((code) => !KNOWN_CODES.has(code)).sort();
ok('every bound key is documented', missing.length === 0,
  missing.length ? `undocumented: ${missing.join(', ')}` : '');

const stale = [...KNOWN_CODES].filter((code) => !bound.has(code)).sort();
ok('no documented key is unbound', stale.length === 0,
  stale.length ? `documented but not bound: ${stale.join(', ')}` : '');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/shortcuts.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/core/shortcuts.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/shortcuts.js`:

```js
// The single source of truth for keyboard shortcuts.
//
// Seventeen bare-key bindings accumulated across main.js and studio-ui.js with
// nothing in the app documenting any of them, which made the fastest paths
// through the tool invisible. A help overlay fixes that once; a help overlay
// nobody updates goes stale within a sprint. So tests/shortcuts.test.mjs scans
// both handlers for `e.code === '…'` and fails when this list disagrees with
// them — the docs cannot fall behind the code without a red test.
//
// Pure — no DOM — so it can be tested in Node.

export const SHORTCUT_GROUPS = ['Playback', 'Explore', 'Compare', 'Capture', 'Grid'];

export const SHORTCUTS = [
  { code: 'Space', label: 'Play / pause', context: 'any', group: 'Playback' },
  { code: 'KeyH', label: 'Hide the interface (zen mode)', context: 'any', group: 'Playback' },
  { code: 'Escape', label: 'Close the open dialog', context: 'any', group: 'Playback' },

  { code: 'KeyR', label: 'Randomize the current engine', context: 'any', group: 'Explore' },
  { code: 'KeyG', label: 'Variation grid — nine mutations at once', context: 'any', group: 'Explore' },
  { code: 'KeyK', label: 'Sweep strip — one parameter across five values', context: 'any', group: 'Explore' },

  { code: 'Digit1', label: 'Store the current orb in slot A', context: 'single', group: 'Compare' },
  { code: 'Digit2', label: 'Store the current orb in slot B', context: 'single', group: 'Compare' },
  { code: 'Backquote', label: 'Swap A ↔ B without restarting the animation', context: 'single', group: 'Compare' },
  { code: 'KeyD', label: 'Cycle the swap duration', context: 'single', group: 'Compare' },
  { code: 'KeyF', label: 'Cycle the swap curve', context: 'single', group: 'Compare' },

  { code: 'KeyC', label: 'Keep this orb as a finding', context: 'single', group: 'Capture' },
  { code: 'KeyS', label: 'PNG snapshot', context: 'any', group: 'Capture' },
  { code: 'KeyV', label: 'Start / stop recording a clip', context: 'any', group: 'Capture' },

  { code: 'KeyM', label: 'Cycle the mutation radius', context: 'grid', group: 'Grid' },
  { code: 'KeyT', label: 'Re-trigger every cell’s envelopes', context: 'grid', group: 'Grid' },
  { code: 'KeyE', label: 'Export the marked cells', context: 'grid', group: 'Grid' },

  { code: 'Slash', label: 'Show or hide this list', context: 'any', group: 'Playback' },
];

export const KNOWN_CODES = new Set(SHORTCUTS.map((s) => s.code));

const NAMED = {
  Space: 'Space',
  Escape: 'Esc',
  Backquote: '`',
  // Bound as Slash because the handler ignores shiftKey, but nobody thinks of
  // this key as "slash" — they press the question mark.
  Slash: '?',
};

export function formatKey(code) {
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function shortcutsInGroup(group) {
  return SHORTCUTS.filter((s) => s.group === group);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/shortcuts.test.mjs`
Expected: `ALL PASS`.

If `every bound key is documented` fails, the guard is doing its job — add the codes it names (most likely `KeyP` from the rehearsal sprint). If `no documented key is unbound` fails on `Slash`, that is expected until Task 3 binds it; complete Task 3, then re-run this test before considering Task 1 done.

- [ ] **Step 5: Commit**

```bash
git add src/core/shortcuts.js tests/shortcuts.test.mjs
git commit -m "Add a shortcut registry with a source-scan completeness guard"
```

---

### Task 2: The overlay

**Files:**
- Create: `src/ui/shortcuts-overlay.js`
- Modify: `src/style.css` (append at end)

**Interfaces:**
- Consumes: `SHORTCUT_GROUPS`, `shortcutsInGroup`, `formatKey` from `../core/shortcuts.js`.
- Produces: `createShortcutsOverlay() => { element, show(), hide(), toggle(), get isOpen }`.

- [ ] **Step 1: Write the module**

Create `src/ui/shortcuts-overlay.js`:

```js
import { SHORTCUT_GROUPS, shortcutsInGroup, formatKey } from '../core/shortcuts.js';

const CONTEXT_NOTE = {
  single: '',
  grid: 'in the grid',
  any: '',
};

// Rendered once at construction. The registry is static, so re-rendering on every
// open would be pure churn.
export function createShortcutsOverlay() {
  const element = document.createElement('div');
  element.className = 'shortcuts-overlay hidden';

  const columns = SHORTCUT_GROUPS.map((group) => `
    <section class="shortcuts-group">
      <h3>${group}</h3>
      ${shortcutsInGroup(group).map((s) => `
        <div class="shortcut-row">
          <kbd>${formatKey(s.code)}</kbd>
          <span>${s.label}${CONTEXT_NOTE[s.context] ? ` <em>${CONTEXT_NOTE[s.context]}</em>` : ''}</span>
        </div>
      `).join('')}
    </section>
  `).join('');

  element.innerHTML = `
    <div class="shortcuts-card">
      <div class="shortcuts-head">
        <span class="shortcuts-title">KEYBOARD</span>
        <button class="cp-delete-btn" data-shortcuts-close title="Close">✕</button>
      </div>
      <div class="shortcuts-columns">${columns}</div>
      <div class="shortcuts-foot">Shortcuts are ignored while you are typing in a field.</div>
    </div>
  `;

  let open = false;

  function hide() {
    open = false;
    element.classList.add('hidden');
  }

  function show() {
    open = true;
    element.classList.remove('hidden');
  }

  element.querySelector('[data-shortcuts-close]').addEventListener('click', hide);
  // Clicking the backdrop closes; clicking the card must not.
  element.addEventListener('click', (e) => {
    if (e.target === element) hide();
  });

  return {
    element,
    show,
    hide,
    toggle() {
      if (open) hide();
      else show();
    },
    get isOpen() {
      return open;
    },
  };
}
```

- [ ] **Step 2: Append the styles**

Append to the end of `src/style.css`:

```css

/* ---------------------------------------------------------------------------
   Keyboard map. A sibling of .studio-ui-root on <body>, not a child of
   .studio-overlay-layer: that layer sits below .studio-panel-layer inside the
   root's stacking context, so anything in it paints under the inspector. This
   one has to cover the panel. 150 puts it above the root (10) and the zen pill
   (100), and below .studio-modal-overlay (200) so a real dialog still wins.
   --------------------------------------------------------------------------- */
.shortcuts-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 6, 9, 0.7);
  backdrop-filter: blur(6px);
  pointer-events: auto;
}

.shortcuts-card {
  width: min(760px, calc(100vw - 48px));
  max-height: min(72vh, 620px);
  overflow-y: auto;
  padding: 18px 20px 14px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  box-shadow: 0 20px 60px var(--panel-glow);
}

.shortcuts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.shortcuts-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-muted);
}

.shortcuts-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px 24px;
}

.shortcuts-group h3 {
  margin: 0 0 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--primary);
}

.shortcut-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.shortcut-row kbd {
  flex: 0 0 auto;
  min-width: 22px;
  padding: 2px 6px;
  text-align: center;
  font-family: var(--font);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--panel-border);
  border-radius: 5px;
}

.shortcut-row em {
  font-style: normal;
  color: var(--text-muted);
}

.shortcuts-foot {
  margin-top: 14px;
  font-size: 11px;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/shortcuts-overlay.js src/style.css
git commit -m "Add the keyboard map overlay"
```

---

### Task 3: Mount it and bind `?`

**Files:**
- Modify: `src/main.js`
- Modify: `src/ui/studio-ui.js`

- [ ] **Step 1: Import and mount**

In `src/main.js`, add to the imports (next to the other `./ui/` imports):

```js
import { createShortcutsOverlay } from './ui/shortcuts-overlay.js';
```

Then find the line that mounts the clip indicator into the overlay layer:

```js
ui.overlayLayer.appendChild(clipIndicator);
```

Add directly below it:

```js
// Body level, beside .studio-modal-overlay — not ui.overlayLayer. That layer is
// below the panel layer inside the root's stacking context, so a map mounted
// there would be covered by the inspector it is meant to explain.
const shortcutsOverlay = createShortcutsOverlay();
ui.container.appendChild(shortcutsOverlay.element);
ui.onToggleShortcuts = () => shortcutsOverlay.toggle();
```

- [ ] **Step 2: Bind the key**

In `src/main.js`, find:

```js
  if (e.code === 'KeyV') {
```

Insert directly **above** it:

```js
  // Shift+/ arrives as code 'Slash'. The modifier guard above deliberately does
  // not check shiftKey, so this fires on the key people actually think of as '?'.
  if (e.code === 'Slash') {
    e.preventDefault();
    shortcutsOverlay.toggle();
    return;
  }

  // Escape closes the map before StudioUI's own Escape reaches the modal.
  if (e.code === 'Escape' && shortcutsOverlay.isOpen) {
    shortcutsOverlay.hide();
    return;
  }

```

**Note on ordering:** `StudioUI` binds its `Escape` handler in its constructor, which runs before this listener is registered, so `StudioUI` sees the event first. That is harmless — it only calls `closeModal()`, which is a no-op when no modal is open. Do not try to `stopPropagation()`; both handlers are on `window` and the ordering cannot be relied on.

- [ ] **Step 3: Add the top-bar button**

In `src/ui/studio-ui.js`, find in `render()`:

```js
          <button class="tab-btn ${this.activeTab === 'colors' ? 'active' : ''}" data-tab="colors">Colors</button>
```

That is the tab strip — **not** where this goes. Instead find the top bar's action buttons and add a `?` button beside them. Locate the top bar markup by searching for `btn-action`, and insert a sibling button in the same group:

```html
<button class="btn-action" id="btn-shortcuts" title="Keyboard shortcuts (?)">?</button>
```

Then find:

```js
    this.attachFindingsListeners();
```

Insert directly **above** it:

```js
    this.root.querySelector('#btn-shortcuts')?.addEventListener('click', () => this.onToggleShortcuts?.());
```

And in the `StudioUI` constructor, next to the other callback fields (search for `this.onToggleGrid`), add:

```js
    this.onToggleShortcuts = null;
```

If `this.onToggleGrid` is assigned only from `main.js` and never declared in the constructor, follow that existing pattern instead and skip this line.

- [ ] **Step 4: Verify the build and the guard**

```bash
npx vite build && node tests/shortcuts.test.mjs
```
Expected: build succeeds, test prints `ALL PASS` — including `no documented key is unbound`, which only passes once `Slash` is actually bound.

- [ ] **Step 5: Verify in the browser**

Dev server running, open http://localhost:5173:

```js
const { ui } = window.__orb;
const overlay = document.querySelector('.shortcuts-overlay');
const root = document.querySelector('.studio-ui-root');
const z = (el) => Number(getComputedStyle(el).zIndex);
const out = {
  // Must be a SIBLING of the root, not inside it — inside means under the panel.
  isSiblingOfRoot: overlay.parentElement === root.parentElement,
  notInOverlayLayer: !ui.overlayLayer.contains(overlay),
  outranksTheRoot: z(overlay) > z(root),
  yieldsToTheModal: z(overlay) < z(document.querySelector('.studio-modal-overlay')),
  startsHidden: overlay.classList.contains('hidden'),
};

// The key path. Constructed events must carry the same code the handler reads.
const press = (code, init = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...init }));

press('Slash', { shiftKey: true });
out.opensOnQuestionMark = !overlay.classList.contains('hidden');
out.rowsRendered = overlay.querySelectorAll('.shortcut-row').length;

press('Escape');
out.escapeCloses = overlay.classList.contains('hidden');

document.querySelector('#btn-shortcuts').click();
out.buttonOpens = !overlay.classList.contains('hidden');
overlay.querySelector('[data-shortcuts-close]').click();
out.closeButtonWorks = overlay.classList.contains('hidden');

// A modified chord must not open it.
press('Slash', { metaKey: true });
out.cmdSlashIgnored = overlay.classList.contains('hidden');

// And it must not fire while typing.
const field = document.querySelector('input[type="text"], input.finding-note, input');
if (field) { field.focus(); field.dispatchEvent(new KeyboardEvent('keydown', { code: 'Slash', bubbles: true })); }
out.ignoredWhileTyping = overlay.classList.contains('hidden');

JSON.stringify(out, null, 2);
```

Expected: every field `true`, and `rowsRendered` equal to `SHORTCUTS.length` (18 with `Slash`, 19 if `KeyP` also landed).

Assert on the `hidden` class, **not** on computed opacity — in a hidden Browser pane the fade never advances and opacity reads its starting value forever.

Then make the pane visible and screenshot with the overlay open to confirm it paints above the panel and the engine dropdown.

- [ ] **Step 6: Commit**

```bash
git add src/main.js src/ui/studio-ui.js
git commit -m "Bind ? to the keyboard map and add a top-bar button"
```

---

## Definition of done

- `node tests/shortcuts.test.mjs` prints `ALL PASS`, including both completeness directions.
- All other suites still pass; `npx vite build` succeeds.
- `?` and the top-bar button both open the map; `Escape`, the ✕, and the backdrop all close it.
- `Cmd+/` does not open it, and neither does typing `/` in a text field.
- The overlay paints above the panel and the engine dropdown.
- No console errors.

## Follow-up worth noting

Adding a keyboard shortcut now means adding a line to `src/core/shortcuts.js` or the build stays green but `node tests/shortcuts.test.mjs` goes red. Say so in `docs/VISION.md` §10 (working agreements) in the same commit as your last task, and update the capability inventory in the appendix.
