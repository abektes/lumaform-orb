# Markup & CSS Hygiene Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the class names mean something. Right now thirteen of them are decoration, and a reader cannot tell which ones carry styling without grepping.

**Architecture — the measured problem.** Two audits over `src/ui/*.js` and `src/style.css`:

**Thirteen classes are emitted in markup with zero CSS rules behind them:**

| Class | Markup uses | Where |
| --- | --- | --- |
| `slider-control` | 8 | on every numeric `.control-row` |
| `empty-notice` | 5 | findings / rehearsal empty states — **visibly unstyled text** |
| `modal-tab-pane` | 3 | export modal |
| `mod-route-source` / `-dest` / `-amount` / `-remove` | 2 each | Motion Lab routing rows |
| `select-control` | 2 | select `.control-row`s |
| `dock-play-icon` / `dock-play-text` | 2 each | playback dock |
| `custom-presets-list` / `custom-preset-item` / `cp-name` | 1 each | saved presets |

**Four CSS rules are never referenced by any markup:** `.mjs`, `.modal-desc`, `.pill-name`, `.section-subtext`. (`.shiki` and `.shiki-fallback` *are* used — by the dynamic Shiki import — so leave them.)

`.cp-delete-btn` was in the first list until a rule was written for it; before that it rendered as a raw browser button — Arial 13px, square, 2px border — because nothing styled it. That is the failure mode this sweep prevents: a class that looks like a styling hook, isn't one, and hides a control that was never designed.

**A second inconsistency:** value formatting. The Motion Lab's private `slider()` helper hardcodes `Number(value).toFixed(2)`; the parameter tabs print the raw number and show things like `2.9000000000000004`. Same control, two behaviours, depending on tab.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Sequencing note

**Task 3 depends on the parameter-control-row sprint** (`docs/superpowers/plans/2026-09-07-parameter-control-row.md`), which creates `src/core/param-format.js` and replaces the numeric row markup. If that sprint has not landed:

- Skip Task 3 and say so in your final report.
- In Task 1, **do not remove `slider-control`** — that sprint rewrites the row that carries it, and removing it first would collide. Remove the other twelve.

Check with `ls src/core/param-format.js` before starting.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework. UI is HTML strings and DOM nodes.
- **This sprint must not change how anything looks**, except where it fixes something that is currently unstyled. Take before/after screenshots and compare.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No test framework.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Controls must declare their own `background` and `color`,** disabled states included — the UI is dark, browser defaults are light. `opacity` alone is not a disabled state.
- **Take z-index values from the `--z-*` scale** in `:root`. `tests/layering.test.mjs` fails on any raw literal.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: the repository root. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` first — §5 and §10.

**The real styling hooks** for a parameter row are `.control-row`, `.ctrl-label-row`, `.ctrl-label`, `.ctrl-value` and `.studio-slider`. All have rules. `slider-control` and `select-control` sit alongside them doing nothing.

**`render()` replaces `panelLayer.innerHTML`.** Removing a class from a template is safe as long as no JS selects on it — check with `grep` for `querySelector`, `closest`, `classList` and `matches` before deleting anything.

**Not every dead class should be deleted.** `empty-notice` marks real, currently-unstyled user-facing text; it wants a rule, not removal. `mod-route-*` marks the three columns of a routing row that currently rely on source order; giving them rules makes that layout explicit. Decide per class — the rule is *"a class either carries styling or is not emitted,"* not *"delete everything."*

**Browser verification handle:** `window.__orb = { studio, state, ui, ab }`.

**CRITICAL browser gotchas:**
- A hidden Browser pane means `requestAnimationFrame` never fires; `studio.fpsTracker.fps` still reports `60` regardless. Step frames with `studio.renderFrame()`.
- **`setTimeout` is clamped to ~1000 ms in a hidden pane.** Inject the delta: `studio.clock.getDelta = () => 0.025`.
- CSS transitions are frozen too — `getComputedStyle()` returns the starting value forever. Set `element.style.transition = 'none'` before measuring, and assert on the element carrying the rule.

## File Structure

| File | Responsibility |
| --- | --- |
| `tests/css-hygiene.test.mjs` | **Create.** Guards both directions so this cannot rot again. |
| `src/ui/studio-ui.js` | **Modify.** Drop vestigial classes; unify the Motion Lab slider. |
| `src/style.css` | **Modify.** Rules for the classes worth keeping; delete unreferenced rules. |

---

### Task 1: The guard, then the sweep

**Files:**
- Create: `tests/css-hygiene.test.mjs`
- Modify: `src/ui/studio-ui.js`, `src/style.css`

- [ ] **Step 1: Write the failing test**

Create `tests/css-hygiene.test.mjs`:

```js
// Every class in the markup either carries styling or should not be there.
//
// Thirteen classes were being emitted with no rule behind them. That is not
// merely untidy: .cp-delete-btn was one of them, and it rendered as a raw
// browser button (Arial, square, 2px border) on a dark panel for as long as
// nobody looked. A class that looks like a hook and isn't one hides real defects.
import { readFileSync, readdirSync } from 'node:fs';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const root = new URL('../', import.meta.url);
const css = readFileSync(new URL('src/style.css', root), 'utf8');
const uiFiles = readdirSync(new URL('src/ui', root))
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(new URL(`src/ui/${f}`, root), 'utf8'));
const js = [...uiFiles, readFileSync(new URL('src/main.js', root), 'utf8')].join('\n');

// Strip comments so a class named only in prose does not count as a rule.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const defined = new Set();
for (const m of cssNoComments.matchAll(/\.([a-zA-Z][\w-]*)/g)) defined.add(m[1]);

// Classes emitted from static class="..." attributes only. Template expressions
// are skipped: they are conditional and resolved at runtime.
const emitted = new Set();
for (const m of js.matchAll(/class="([^"$]*)"/g)) {
  for (const token of m[1].split(/\s+/)) if (token) emitted.add(token);
}
for (const m of js.matchAll(/className\s*=\s*'([^']+)'/g)) {
  for (const token of m[1].split(/\s+/)) if (token) emitted.add(token);
}

// Known-good exceptions, each with a reason.
const ALLOW_UNSTYLED = new Set([
  'hidden',   // utility, defined as .hidden — keep only if the rule really exists
]);

const unstyled = [...emitted].filter((c) => !defined.has(c) && !ALLOW_UNSTYLED.has(c)).sort();
ok('every emitted class has a CSS rule', unstyled.length === 0,
  unstyled.length ? unstyled.join(', ') : '');

// The reverse: a rule nobody can reach. Checked against the whole of src/, since
// classes may be added via classList or built into a template string.
const allSrc = js + css;
const IGNORE_UNUSED = new Set([
  'shiki', 'shiki-fallback',   // applied by the dynamic Shiki import
  'hidden', 'active', 'open', 'selected', 'playing', 'collapsed',
  'empty', 'paused', 'is-default', 'grid-mode', 'zen-hidden', 'mjs',
]);
const unreachable = [...defined]
  .filter((c) => !IGNORE_UNUSED.has(c) && !new RegExp(`['"\`\\s.]${c}['"\`\\s,:.{)]`).test(allSrc))
  .sort();
ok('no CSS rule is unreachable', unreachable.length === 0,
  unreachable.length ? unreachable.join(', ') : '');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it and read the list**

Run: `node tests/css-hygiene.test.mjs`
Expected: fails, naming the unstyled classes. That list is your work queue for this task.

If the "unreachable" check produces obvious false positives (a class only ever built by string concatenation, say), widen `IGNORE_UNUSED` **with a comment giving the reason** rather than weakening the regex.

- [ ] **Step 3: Give a rule to the classes worth keeping**

Append to `src/style.css`:

```css

/* Empty states. These were emitted with no rule at all, so the text that tells a
   first-time user what to do rendered at browser defaults. */
.empty-notice {
  padding: 14px 12px;
  border: 1px dashed var(--panel-border);
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

.empty-notice b {
  color: var(--text-secondary);
  font-weight: 700;
}

/* Modulation routing row. The three columns previously relied on source order
   inside a flex container; naming them makes the intent explicit and stops a
   long destination label from squeezing the amount field to nothing. */
.mod-route-source,
.mod-route-dest {
  min-width: 0;      /* lets a long <option> label ellipsize instead of pushing */
  flex: 1 1 0;
}

.mod-route-amount {
  flex: 0 0 62px;
}

.mod-route-remove {
  flex: 0 0 auto;
}
```

Then, for each remaining class the test names, decide and act:

- **Marks visible chrome that is currently unstyled** → write a rule, matching the surrounding tokens (`--panel-border`, `--text-muted`, `var(--font)`).
- **Duplicates a hook that already has a rule** (`slider-control`, `select-control` next to `.control-row`) → remove it from the markup.
- **Unsure** → check it in the browser first; `document.querySelectorAll('.<class>')` plus a look at the element tells you whether anything depends on it.

**Before removing any class, confirm no JS selects on it:**

```bash
grep -n "slider-control\|select-control\|modal-tab-pane\|dock-play-text\|dock-play-icon\|custom-presets-list\|custom-preset-item\|cp-name" src/ui/*.js src/main.js
```

A hit inside a `querySelector`, `closest`, `classList` or `matches` call means the class is load-bearing for behaviour — keep it and give it a rule, or migrate the selector.

- [ ] **Step 4: Delete the unreachable rules**

Remove the rules for `.modal-desc`, `.pill-name` and `.section-subtext` once the test confirms nothing references them. `.pill-name` appears only inside the 900px media query, so delete that declaration too and check the block is not left empty.

Leave `.shiki` and `.shiki-fallback` — `src/ui/highlight.js` uses them.

- [ ] **Step 5: Verify nothing moved**

```bash
node tests/css-hygiene.test.mjs && npx vite build
```

Then, with the pane visible, screenshot each inspector tab (Presets, Findings, Rehearsal, Colors, Geometry, Motion, Motion Lab, Optics, Space, Export, Perf) plus grid mode, and compare against screenshots taken before your changes. **The only intended visual differences are the empty states and the routing row**; anything else means you removed a class something depended on.

Programmatic check that nothing fell back to browser defaults:

```js
const { ui } = window.__orb;
const uaGrey = ['rgb(239, 239, 239)', 'rgba(239, 239, 239, 0.3)'];
const bad = [];
for (const tab of ['presets','findings','rehearsal','colors','geometry','motion','motionlab','optics','space','export','perf']) {
  ui.activeTab = tab; ui.render();
  for (const el of ui.root.querySelectorAll('button, input, select')) {
    const cs = getComputedStyle(el);
    if (uaGrey.includes(cs.backgroundColor) || cs.fontFamily.startsWith('Arial')) {
      bad.push(`${tab}: ${el.id || el.className || el.tagName}`);
    }
  }
}
JSON.stringify({ unstyledControls: bad, clean: bad.length === 0 }, null, 2);
```

Expected: `clean: true`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/studio-ui.js src/style.css tests/css-hygiene.test.mjs
git commit -m "Make every emitted class carry styling, and guard it"
```

---

### Task 2: One value formatter for the Motion Lab

> Skip this task if `src/core/param-format.js` does not exist yet — see the sequencing note.

**Files:**
- Modify: `src/ui/studio-ui.js`

- [ ] **Step 1: Replace the private helper**

In `src/ui/studio-ui.js`, find the Motion Lab's local slider helper (around line 912):

```js
    const slider = (attr, label, value, min, max, step) => `
      <div class="control-row slider-control">
        <label class="ctrl-label">${label}<span class="ctrl-value">${Number(value).toFixed(2)}</span></label>
        <input type="range" class="studio-slider" ${attr} min="${min}" max="${max}" step="${step}" value="${value}" />
      </div>`;
```

Replace with a call into the shared row builder, so a Motion Lab slider gains the same typed entry, range labels and reset as every other numeric control:

```js
    // Was a private helper hardcoding toFixed(2), which is how the same control
    // came to format differently depending on which tab it was in.
    const slider = (attr, label, value, min, max, step) =>
      this.renderNumberRow({
        key: attr.replace(/^data-[\w-]+="|"$/g, ''),
        def: { label, min, max, step },
        value,
        attr,
      });
```

`renderNumberRow` omits the reset button when a definition has no `default`, so these rows simply won't show one — which is correct, since the modulation sources have no schema defaults.

**Check the listener wiring.** Motion Lab sliders carry their own data attributes (`data-mod-*`), handled in `attachMotionLabListeners()`. `renderNumberRow` also emits a `data-param-number` field; make sure the Motion Lab listener block reads and writes that field too, or those rows will render a number input that does nothing. Follow the pattern from the parameter-row sprint.

- [ ] **Step 2: Verify**

```bash
npx vite build && node tests/css-hygiene.test.mjs
```

In the browser:

```js
const { ui } = window.__orb;
ui.activeTab = 'motionlab'; ui.render();
const fields = [...ui.root.querySelectorAll('.ctrl-number')];
const out = {
  rows: fields.length,
  noFloatArtefacts: fields.every((f) => !/\d\.\d{5,}/.test(f.value)),
};
// typing into a Motion Lab field must actually move the rack
const f = ui.root.querySelector('[data-param-number]');
const before = f.value;
f.value = f.value === '0.50' ? '0.80' : '0.50';
f.dispatchEvent(new Event('change', { bubbles: true }));
out.typedValueSticks = ui.root.querySelector('[data-param-number]').value !== before;
JSON.stringify(out, null, 2);
```

Expected: `noFloatArtefacts: true`, `typedValueSticks: true`, and the LFO/noise/envelope sliders still drive the orb (route something onto `edgeGlow` and watch it move).

- [ ] **Step 3: Commit**

```bash
git add src/ui/studio-ui.js
git commit -m "Route Motion Lab sliders through the shared parameter row"
```

---

## Definition of done

- `node tests/css-hygiene.test.mjs` prints `ALL PASS`; every other suite still passes; `npx vite build` succeeds.
- No class is emitted without a rule; no rule is unreachable.
- No control anywhere renders at browser defaults (the programmatic check returns `clean: true`).
- Empty states and routing rows are styled; **every other tab is visually unchanged** against before/after screenshots.
- If Task 2 ran: one formatter across every numeric control, and no float artefacts anywhere.
- No console errors.

## Follow-up worth noting

The two guards now in place (`tests/css-hygiene.test.mjs` here, `tests/layering.test.mjs` from the layering sprint) mean the stylesheet has structural tests but no visual ones. That is the right trade for a repo with no test framework — but it does mean a rule can be *present and wrong*. Note in `docs/VISION.md` §10 that the CSS guards check for existence and layering, not appearance, so screenshot comparison is still the reviewer's job. Update the capability inventory in the same commit as your last task.
