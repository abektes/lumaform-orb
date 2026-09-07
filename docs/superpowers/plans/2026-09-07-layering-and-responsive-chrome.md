# Layering Contract & Responsive Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the stacking order a named, tested contract instead of eleven scattered magic numbers — and stop the chrome from colliding on a laptop screen.

**Architecture:** A z-index bug just shipped: the grid HUD painted over the engine dropdown because the HUD was mounted on `document.body` while the dropdown's `z-index: 1000` was trapped inside `.studio-ui-root`'s stacking context. It was fixed by splitting the root into an overlay layer and a panel layer.

That fix is correct but **undocumented and unenforced**. There are eleven raw `z-index` literals in `src/style.css` spanning 1 → 1000, with nothing saying which scale a new one belongs to, and three comments in the file still describe the *old* body-mounted arrangement — so the next person to add an overlay will read a stale comment and reintroduce the bug.

Two smaller hazards ride along. The four overlays are still `position: fixed` even though they now live inside an `inset: 0` absolutely-positioned layer: that works today only because no ancestor has a `transform` or `filter`, and this codebase applies `backdrop-filter` freely — **the day someone adds one to the root or a layer, every fixed overlay silently re-anchors to it and jumps.** And there is exactly one media query in 1700 lines of CSS, so on a 1280px laptop the inspector, the grid HUD and the top bar compete for the same pixels.

This is maintenance work, not an instrument, and it is worth a sprint precisely because the failure mode is "the tool looks broken" — which costs exploration time (`docs/VISION.md` §4).

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework, no CSS preprocessor, no PostCSS plugin.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No test framework; do not add one. Exit `0` on pass, `1` on fail.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **No visual redesign.** Positions may move to avoid collisions; colours, radii, type and spacing stay as they are.
- **Match surrounding code style:** 2-space indent, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: `/Users/ahmetbektes/WDesignspace/orb-animation`. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` first — §5 (invariants) and §10 (working agreements).

**The current DOM layering**, verified by reading the source:

```
document.body                          (ui.container — StudioUI is constructed with document.body)
├── #container                         z-index: 1     ← the WebGL canvas
├── .studio-ui-root                    z-index: 10    ← positioned ⇒ STACKING CONTEXT
│   ├── .studio-overlay-layer          z-index: 1     ← absolute, inset:0, never rewritten
│   │   ├── .grid-hud                  z-index: 40
│   │   ├── .sweep-caption             z-index: 50
│   │   ├── .ab-readout                z-index: 60
│   │   └── .clip-indicator            z-index: 70
│   └── .studio-panel-layer            z-index: 2     ← absolute, inset:0, REPLACED by render()
│       ├── .studio-topbar             z-index: 100
│       │   └── .engine-dropdown-menu  z-index: 1000
│       └── .studio-playback-dock      z-index: 120
├── .zen-hint-pill                     z-index: 100
└── .studio-modal-overlay              z-index: 200
```

**The load-bearing fact:** because `.studio-ui-root` forms a stacking context, everything inside it is ordered *relative to its siblings inside that context only*. The dropdown's `1000` cannot outrank `.studio-modal-overlay`'s `200`, and `.clip-indicator`'s `70` cannot outrank the panel layer, because their parent layers (`1` and `2`) decide first. This is why the two-layer split fixed the bug, and why the numbers inside each layer only need to be ordered *within* that layer.

**Three stale comments to fix** — all describe the pre-fix arrangement:
1. `.grid-hud` (~line 1352): *"Fixed, not absolute: the HUD is mounted on document.body … and body is not a positioned ancestor."* It is now in `overlayLayer`, which **is** positioned.
2. The block at ~line 1570 describing zen mode: *"these three overlays are mounted on document.body … fade them out via a class mirrored onto `<body>` by toggleZenMode()."* `toggleZenMode()` (`src/ui/studio-ui.js:159`) only toggles the class on `this.root`; the `body.zen-hidden` rules were removed. The overlays are now inside the root and inherit its fade directly.
3. `.clip-indicator` (~line 1637) mentions the fix but not the layer it lives in.

**Do not "clean up" `applySnapshot`-style in-place writes or anything in `src/core/`.** This sprint touches CSS, one new test, and comments only — plus the `position` change in Task 2.

**Browser verification handle:** `window.__orb = { studio, state, ui }`.

**CRITICAL browser gotchas:**
- A hidden Browser pane means `requestAnimationFrame` never fires and the render loop is frozen. `studio.fpsTracker.fps` still reports its default `60` — not a liveness signal. Step frames with `studio.renderFrame()`.
- **CSS transitions are frozen in a hidden pane**, so `getComputedStyle()` on a transitioning property returns the *starting* value forever. `.grid-hud`, `.ab-readout` and `.sweep-caption` all have `transition: opacity 0.3s`, and `.studio-ui-root` has `transition: opacity 0.3s`. Set `element.style.transition = 'none'` before measuring opacity, and remember an ancestor's `opacity: 0` does **not** change a descendant's computed opacity — assert on the element carrying the rule. This exact trap produced contradictory zen-mode measurements before.
- **`getComputedStyle(el).zIndex` returns the string `'auto'`** for elements without one. `Number('auto')` is `NaN`, and every comparison with `NaN` is false — so a broken assertion reads as a passing one. Guard explicitly.
- Use `resize_window` to test breakpoints; **reload after resizing**, since some layout is measured at load.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/style.css` | **Modify.** A `--z-*` scale, corrected comments, `fixed` → `absolute`, new breakpoints. |
| `tests/layering.test.mjs` | **Create.** Scans the stylesheet: every `z-index` must come from the scale, and the scale must stay ordered. |
| `docs/VISION.md` | **Modify.** Add the layering rule to §5. |

---

### Task 1: Name the scale and enforce it

**Files:**
- Modify: `src/style.css`
- Create: `tests/layering.test.mjs`

**Interfaces:**
- Produces: CSS custom properties on `:root` defining every legal stacking value, and a test that fails on any raw `z-index` literal outside a small allow-list.

- [ ] **Step 1: Write the failing test**

Create `tests/layering.test.mjs`:

```js
// Guards the stacking contract. The grid HUD once painted over the engine
// dropdown because two subtrees were ordered against different, undocumented
// scales; naming them is only half a fix if a raw number can still be added.
import { readFileSync } from 'node:fs';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

// --- the scale is declared ---
const scale = {};
for (const m of css.matchAll(/--z-([a-z-]+):\s*(-?\d+);/g)) scale[m[1]] = Number(m[2]);

const REQUIRED = [
  'canvas', 'ui-root', 'zen-pill', 'dialog', 'modal',
  'layer-overlays', 'layer-panel',
  'overlay-hud', 'overlay-caption', 'overlay-readout', 'overlay-clip',
  'panel-topbar', 'panel-dock', 'panel-dropdown',
];
const missing = REQUIRED.filter((k) => !(k in scale));
ok('every layer is named', missing.length === 0, missing.join(', '));

// --- body-level order: canvas < root < zen pill < dialog < modal ---
const bodyOrder = ['canvas', 'ui-root', 'zen-pill', 'dialog', 'modal'];
ok('body-level order is strictly increasing', bodyOrder.every((k, i) =>
  i === 0 || scale[k] > scale[bodyOrder[i - 1]]),
  bodyOrder.map((k) => `${k}=${scale[k]}`).join(' '));

// The whole point of the fix: the panel layer paints ABOVE the overlay layer.
ok('the panel layer outranks the overlay layer', scale['layer-panel'] > scale['layer-overlays']);

// --- within-layer order ---
const overlays = ['overlay-hud', 'overlay-caption', 'overlay-readout', 'overlay-clip'];
ok('overlay order is strictly increasing', overlays.every((k, i) =>
  i === 0 || scale[k] > scale[overlays[i - 1]]));
const panel = ['panel-topbar', 'panel-dock', 'panel-dropdown'];
ok('panel order is strictly increasing', panel.every((k, i) =>
  i === 0 || scale[k] > scale[panel[i - 1]]));

// A dialog mounted at body level must clear the root, or it renders behind the
// panel it is supposed to cover — the bug this whole contract exists to prevent.
ok('a body-level dialog clears the root', scale.dialog > scale['ui-root']);

// --- no raw literals ---
// Only the :root declarations themselves may carry a number. Everything else
// must reference var(--z-…).
const rawLiterals = [];
for (const m of css.matchAll(/(^|\n)([^\n]*\bz-index:\s*)([^;]+);/g)) {
  const value = m[3].trim();
  if (value.startsWith('var(--z-')) continue;
  if (value === 'auto') continue;
  const line = css.slice(0, m.index).split('\n').length + (m[1] === '\n' ? 1 : 0);
  rawLiterals.push(`line ${line}: z-index: ${value}`);
}
ok('no raw z-index literals remain', rawLiterals.length === 0, rawLiterals.join(' | '));

// --- the stale comments are gone ---
const zIndexSection = css;
ok('no comment still claims overlays live on document.body',
  !/mounted on\s+document\.body/i.test(zIndexSection) &&
  !/mounted on <body>/i.test(zIndexSection));
ok('no comment still claims a class is mirrored onto <body>',
  !/mirrored onto <body>/i.test(zIndexSection));

// --- overlays are absolute, not fixed ---
// position:fixed inside the overlay layer works only while no ancestor has a
// transform, filter or backdrop-filter. This file uses backdrop-filter freely,
// so the first one applied to the root or a layer would silently re-anchor all
// four overlays.
for (const selector of ['.grid-hud', '.sweep-caption', '.ab-readout', '.clip-indicator']) {
  const block = css.slice(css.indexOf(`\n${selector} {`));
  const body = block.slice(0, block.indexOf('}'));
  ok(`${selector} is absolutely positioned`, /position:\s*absolute;/.test(body),
    (body.match(/position:\s*\w+;/) || ['no position'])[0]);
}

// --- breakpoints exist ---
const breakpoints = [...css.matchAll(/@media[^{]*\(max-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
ok('there is more than one breakpoint', breakpoints.length >= 2, breakpoints.join(', '));
ok('a laptop-width breakpoint exists', breakpoints.some((b) => b >= 1100 && b <= 1440),
  breakpoints.join(', '));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/layering.test.mjs`
Expected: many failures — no `--z-*` properties, eleven raw literals, stale comments present, four `position: fixed` overlays, one breakpoint.

- [ ] **Step 3: Declare the scale**

In `src/style.css`, find the `:root {` block and add these declarations at the end of it, just before its closing brace:

```css
  /* ---------------------------------------------------------------------------
     Stacking contract. Three independent scales, because .studio-ui-root is a
     positioned element with a z-index and therefore forms a STACKING CONTEXT:
     values inside it are only ever compared with their siblings inside it. The
     engine dropdown's old raw 1000 could never outrank the modal's 200 for this
     reason, and the grid HUD once covered that dropdown because it was mounted
     outside the root entirely. Enforced by tests/layering.test.mjs.

     1. Body level — real siblings, compared with each other.
     2. Layers inside .studio-ui-root — this pair decides overlay-vs-panel, and
        nothing inside either layer can override it.
     3. Within a layer — ordering among that layer's own children.

     Adding chrome? Pick the layer first, then a value from that layer's scale.
     Only a full-screen dialog belongs at body level.
     --------------------------------------------------------------------------- */
  --z-canvas: 1;
  --z-ui-root: 10;
  --z-zen-pill: 100;
  --z-dialog: 150;
  --z-modal: 200;

  --z-layer-overlays: 1;
  --z-layer-panel: 2;

  --z-overlay-hud: 40;
  --z-overlay-caption: 50;
  --z-overlay-readout: 60;
  --z-overlay-clip: 70;

  --z-panel-topbar: 100;
  --z-panel-dock: 120;
  --z-panel-dropdown: 1000;
```

`--z-dialog` is unused until a body-level dialog exists (the keyboard-map sprint adds one). Declaring it now is what makes the scale a contract rather than a description.

- [ ] **Step 4: Replace every literal**

Replace each of these in `src/style.css`. The line numbers are from the current file — **find by selector, not by line**, since earlier edits shift them.

| Selector | Was | Becomes |
| --- | --- | --- |
| `#container` | `z-index: 1;` | `z-index: var(--z-canvas);` |
| `.studio-ui-root` | `z-index: 10;` | `z-index: var(--z-ui-root);` |
| `.zen-hint-pill` | `z-index: 100;` | `z-index: var(--z-zen-pill);` |
| `.studio-topbar` | `z-index: 100;` | `z-index: var(--z-panel-topbar);` |
| `.studio-playback-dock` | `z-index: 120;` | `z-index: var(--z-panel-dock);` |
| `.engine-dropdown-menu` | `z-index: 1000;` | `z-index: var(--z-panel-dropdown);` |
| `.studio-modal-overlay` | `z-index: 200;` | `z-index: var(--z-modal);` |
| `.grid-hud` | `z-index: 40;` | `z-index: var(--z-overlay-hud);` |
| `.sweep-caption` | `z-index: 50;` | `z-index: var(--z-overlay-caption);` |
| `.ab-readout` | `z-index: 60;` | `z-index: var(--z-overlay-readout);` |
| `.clip-indicator` | `z-index: 70;` | `z-index: var(--z-overlay-clip);` |
| `.studio-overlay-layer` | `z-index: 1;` | `z-index: var(--z-layer-overlays);` |
| `.studio-panel-layer` | `z-index: 2;` | `z-index: var(--z-layer-panel);` |

Run `grep -n "z-index" src/style.css` afterwards and confirm every hit is either a `--z-` declaration or a `var(--z-…)` reference.

- [ ] **Step 5: Commit**

```bash
git add src/style.css tests/layering.test.mjs
git commit -m "Name the stacking scale and guard it with a test"
```

(The test will still be red — Task 2 finishes it. Note that in the commit body.)

---

### Task 2: Correct the comments and re-anchor the overlays

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: Fix the `.grid-hud` comment and position**

In `src/style.css`, find:

```css
.grid-hud {
  /* Fixed, not absolute: the HUD is mounted on document.body (out of reach of
     StudioUI.render(), which replaces root.innerHTML) and body is not a
     positioned ancestor. */
  position: fixed;
  top: 88px;
```

Replace with:

```css
.grid-hud {
  /* Absolute against .studio-overlay-layer, which is inset:0 over the viewport.
     Not fixed: fixed positioning silently re-anchors to the nearest ancestor
     with a transform, filter or backdrop-filter, and this file applies
     backdrop-filter to almost every panel — one added to the root or a layer
     would move all four overlays at once. */
  position: absolute;
  top: 88px;
```

- [ ] **Step 2: Re-anchor the other three**

Same change — `position: fixed` → `position: absolute` — in `.sweep-caption`, `.ab-readout` and `.clip-indicator`. Do not touch their offsets; the overlay layer is `inset: 0` over the same box the viewport was, so they do not move.

Then trim `.clip-indicator`'s comment to just the placement rationale:

```css
  /* Bottom-left, stacked above the A/B readout. The old top-right position sat
     under the inspector, which paints above the overlay layer. */
```

- [ ] **Step 3: Replace the stale zen-mode block**

In `src/style.css`, find this comment block (immediately above the two-layer rules, ~line 1570):

```css
/* ---------------------------------------------------------------------------
   Zen mode hides the whole UI, but these three overlays are mounted on
   document.body rather than inside .studio-ui-root so that StudioUI.render()
   cannot destroy them. That puts them outside the .zen-hidden subtree, so fade
   them out via a class mirrored onto <body> by toggleZenMode(). A sibling
   combinator would work only for whichever order the overlays happen to be
   appended in, which is not stable.
   --------------------------------------------------------------------------- */
```

Delete it entirely. It describes a mechanism that no longer exists: `toggleZenMode()` (`src/ui/studio-ui.js:159`) toggles `.zen-hidden` on `this.root` only, the overlays are now *inside* the root, and the `body.zen-hidden` rules it refers to were removed. Leaving it is worse than no comment — the next person adding an overlay would mount it on `<body>` and reintroduce the original bug.

- [ ] **Step 4: Tighten the two-layer comment**

Find:

```css
/* Two layers inside .studio-ui-root. The root is positioned with a z-index and
   so forms a stacking context: anything mounted outside it outranks the entire
   panel subtree regardless of the panel's own z-index, which is what put the
   grid HUD over the engine dropdown. Keeping the overlays in here — below the
   panel layer — restores the intended order, and the root's zen rule hides them
   along with everything else. */
```

Replace with:

```css
/* Two layers inside .studio-ui-root, and the pair that decides overlay-vs-panel
   for everything below them — see the stacking contract in :root.
   overlayLayer is never rewritten, so long-lived chrome (grid HUD, A/B readout,
   sweep caption, clip indicator) survives render(); panelLayer is replaced
   wholesale on every render. Both are inside the root, so zen mode fades them
   with everything else and a full-screen dialog must mount at body level to
   cover them. */
```

- [ ] **Step 5: Run the test**

Run: `node tests/layering.test.mjs`
Expected: everything passes except the two breakpoint checks, which Task 3 handles.

- [ ] **Step 6: Verify nothing moved**

Run `npx vite build`, then with the Browser pane **visible** at http://localhost:5173, check that the overlays are where they were:

```js
const { studio: s, ui } = window.__orb;
const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; };
document.querySelector('#btn-shortcuts'); // ignore
const out = { abBefore: rect('.ab-readout') };
// force the overlays to exist
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', bubbles: true }));
out.ab = rect('.ab-readout');
out.abIsBottomLeft = out.ab && out.ab[0] < 60 && out.ab[1] > window.innerHeight - 120;
const z = (sel) => { const v = getComputedStyle(document.querySelector(sel)).zIndex; return v === 'auto' ? null : Number(v); };
out.z = { overlayLayer: z('.studio-overlay-layer'), panelLayer: z('.studio-panel-layer'), root: z('.studio-ui-root'), dropdown: z('.engine-dropdown-menu') };
out.panelAboveOverlays = out.z.panelLayer > out.z.overlayLayer;
out.varsResolved = Object.values(out.z).every((v) => typeof v === 'number' && Number.isFinite(v));
JSON.stringify(out, null, 2);
```

Expected: `abIsBottomLeft: true`, `panelAboveOverlays: true`, `varsResolved: true`. `varsResolved` is the one that catches a typo'd custom property — an unresolvable `var()` makes `z-index` compute to `auto`, which would silently flatten the ordering.

Then press `G` for the grid, open the engine dropdown, and screenshot: the dropdown must paint **over** the HUD.

- [ ] **Step 7: Commit**

```bash
git add src/style.css
git commit -m "Re-anchor overlays to the layer and delete comments describing the old arrangement"
```

---

### Task 3: Breakpoints

**Files:**
- Modify: `src/style.css`

The chrome is laid out for a wide window. At 1280px the 360px inspector plus 16px gutters leaves ~890px of canvas, and the grid HUD — a single flex row of chips, separators and buttons — is wider than that, so in grid mode it runs under the top bar or off the edge. There is currently **one** media query (`max-width: 900px`), which is far too late.

- [ ] **Step 1: Add a laptop breakpoint**

In `src/style.css`, find:

```css
/* Responsive */
@media (max-width: 900px) {
```

Insert directly **above** it:

```css
/* Laptop widths. The inspector is a fixed 360px and the grid HUD is a single
   wide flex row, so they start competing well before the 900px phone
   breakpoint — at 1280px the HUD is wider than the canvas left beside the
   panel. Narrow the panel and let the HUD wrap rather than overflow. */
@media (max-width: 1280px) {
  .studio-inspector {
    width: 300px;
  }

  .grid-hud {
    max-width: calc(100vw - 48px);
    flex-wrap: wrap;
    justify-content: center;
    row-gap: 6px;
  }

  /* A wrapped HUD is two rows tall and would sit under the top bar. */
  .studio-ui-root.grid-mode .grid-hud {
    top: 96px;
  }
}
```

- [ ] **Step 2: Harden the phone breakpoint**

In `src/style.css`, find:

```css
@media (max-width: 900px) {
  .pill-name {
    display: none;
  }
  .studio-inspector {
    width: calc(100vw - 32px);
    max-height: 52vh;
    top: auto;
    bottom: 16px;
  }
}
```

Replace with:

```css
@media (max-width: 900px) {
  .pill-name {
    display: none;
  }
  .studio-inspector {
    width: calc(100vw - 32px);
    max-height: 52vh;
    top: auto;
    bottom: 16px;
  }

  /* Bottom-left overlays would land on top of the bottom-docked inspector. */
  .ab-readout {
    bottom: auto;
    top: 88px;
  }
  .clip-indicator {
    bottom: auto;
    top: 128px;
  }
  .sweep-caption {
    bottom: 56vh;
  }
}
```

The tab strip (`.inspector-tabs`) already sets `overflow-x: auto` with hidden scrollbars, so it needs nothing here — leave it alone.

- [ ] **Step 3: Run the test**

Run: `node tests/layering.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 4: Verify at each width**

Build first (`npx vite build`), then with the pane **visible**, use `resize_window` and **reload after each resize**:

At **1280×800** — enter grid mode with `G`, open the engine dropdown:
- the HUD wraps or fits, and does not overlap the top bar;
- the dropdown paints over the HUD;
- the inspector is 300px and nothing is clipped.

At **900×700**:
- the inspector is docked to the bottom;
- press `1` and `V` and confirm the A/B readout and clip indicator sit at the top, clear of the inspector.

Measure rather than eyeball the collision:

```js
const hit = (a, b) => {
  const x = document.querySelector(a)?.getBoundingClientRect();
  const y = document.querySelector(b)?.getBoundingClientRect();
  if (!x || !y) return null;
  return !(x.right <= y.left || x.left >= y.right || x.bottom <= y.top || x.top >= y.bottom);
};
JSON.stringify({
  hudVsTopbar: hit('.grid-hud', '.studio-topbar'),
  readoutVsInspector: hit('.ab-readout', '.studio-inspector'),
  clipVsInspector: hit('.clip-indicator', '.studio-inspector'),
  hudFits: (document.querySelector('.grid-hud')?.getBoundingClientRect().width ?? 0) <= window.innerWidth - 32,
}, null, 2);
```

Expected at both widths: every `hit` is `false` (or `null` when the element is not on screen), and `hudFits: true`.

Reset with `resize_window` preset `desktop` when done.

- [ ] **Step 5: Commit**

```bash
git add src/style.css
git commit -m "Add laptop and phone breakpoints for the chrome"
```

---

### Task 4: Write the rule down

**Files:**
- Modify: `docs/VISION.md`

- [ ] **Step 1: Add the invariant**

In `docs/VISION.md` §5 ("Architectural invariants"), find the paragraph beginning:

```
**Bloom is a full-screen pass.**
```

Insert directly **above** it:

```
**Chrome is layered, and the layer decides before the z-index does.** `.studio-ui-root` is positioned with a z-index and so forms a stacking context — a `z-index: 1000` inside it cannot outrank a `200` outside it. Inside the root are two layers: `overlayLayer` (never rewritten by `render()`, holds long-lived chrome, paints *below* the panel) and `panelLayer` (replaced wholesale on every `render()`). Mounting an overlay on `document.body` to survive `render()` puts it above the entire panel — that is what made the grid HUD cover the engine dropdown. Pick the layer first, then take a value from the scale declared in `:root` in `src/style.css`; only a full-screen dialog belongs at body level. `tests/layering.test.mjs` fails on any raw `z-index` literal.
```

- [ ] **Step 2: Update the appendix**

In the capability inventory table at the end of `docs/VISION.md`, add:

```
| Chrome layering | Two layers inside the root, named `--z-*` scale, guarded by `tests/layering.test.mjs` |
| Responsive | Breakpoints at 1280px (laptop) and 900px (phone) |
```

- [ ] **Step 3: Full regression**

```bash
for f in tests/*.test.mjs; do echo "== $f"; node "$f" | tail -1; done && npx vite build
```
Expected: every suite prints `ALL PASS`, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add docs/VISION.md
git commit -m "Document the chrome layering contract"
```

---

## Definition of done

- `node tests/layering.test.mjs` prints `ALL PASS`; every other suite still passes; `npx vite build` succeeds.
- `grep -n "z-index" src/style.css` shows only `--z-` declarations and `var(--z-…)` references.
- No comment in `src/style.css` still describes overlays as living on `document.body` or a class mirrored onto `<body>`.
- All four overlays are `position: absolute`, and none of them moved on screen.
- At 1280px the grid HUD does not overlap the top bar and the dropdown paints over it.
- At 900px the readout and clip indicator clear the bottom-docked inspector.
- §5 of `docs/VISION.md` states the layering rule.

## Follow-up worth noting

The stale comments found here were written **in the same session that made them stale** — the fix moved the overlays and the comments describing their old home were left behind. Worth a line in §10: when a comment explains a placement, moving the thing means rewriting the comment in the same commit. This codebase leans hard on comments carrying non-obvious constraints, so a wrong one is more expensive here than in most repos.
