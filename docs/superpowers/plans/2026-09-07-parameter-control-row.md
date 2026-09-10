# Parameter Control Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the row you actually tune with trustworthy — a readable value, a way to type an exact one, a visible range, and one click back to the default.

**Architecture:** This is the most-used control in the tool and the least finished. Measured in the running app:

- It renders raw floats. Edge Radiance displays **`2.9000000000000004`** — the result of `0.5 + 0.1 × n` in binary floating point, printed with no formatting. The Motion Lab formats its sliders with `Number(value).toFixed(2)`; the parameter tabs don't. Two code paths, two behaviours.
- **0 of 6** control rows accept a typed value. A slider with `step="0.1"` over a `0.5–3.5` range is the only input, so you cannot reproduce a value you read off a finding.
- The range is never shown. `min`, `max` and `step` are on the `<input>` but invisible, so you cannot tell where in its travel a parameter sits without dragging it.
- Every definition in `ENGINE_PARAM_DEFINITIONS` has a `default`, and nothing in the UI exposes it. There is no way back from a bad tweak short of reloading.

None of this is about aesthetics. `docs/VISION.md` §4 asks the tool to raise the *discovery rate*; a control you cannot read, type into, or undo lowers it.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Vanilla JS only.** No framework. UI is HTML strings and DOM nodes.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No test framework; do not add one. Exit `0` on pass, `1` on fail. Anything tested must be free of DOM and Three.js.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Never reassign `state`, `state.global`, or `state.engines[<id>]`** — they are held by reference across `main.js`, `StudioUI` and `OrbStudio`. Always `Object.assign` into the existing object.
- **Controls must declare their own `background` and `color`,** disabled states included. The UI is dark and browser defaults are light. `opacity` alone is not a disabled state.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: the repository root. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` first — §4 and §5.

**Where the rows are built.** `StudioUI.renderParamsSection(sectionName)` at [src/ui/studio-ui.js:637](src/ui/studio-ui.js:637) walks `ENGINE_PARAM_DEFINITIONS[engine]` and emits one block per `def.type`:

- `number` → a `.control-row.slider-control` containing `.ctrl-label-row` (`.ctrl-label` + `.ctrl-value`) and `<input type="range" class="studio-slider" data-param="…">` (line ~737).
- `color` → `.color-picker-input` + `.color-hex-input`.
- `select` → `<select class="studio-select" data-param="…">`.

The same `.control-row.slider-control` shape is repeated by hand for the global sliders (bloom, exposure, timeScale) at lines ~770–825, each with a hardcoded `id="val-<name>"` and `data-global="<name>"`.

**Where the value goes stale.** [src/ui/studio-ui.js:1694](src/ui/studio-ui.js:1694):

```js
this.root.querySelectorAll('input[type="range"][data-param]').forEach((slider) => {
  const key = slider.getAttribute('data-param');
  slider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    this.state.engines[this.state.engine][key] = val;
    const valLabel = this.root.querySelector(`#val-${key}`);
    if (valLabel) valLabel.textContent = val;   // <-- raw number, unformatted
    this.onStateChange(this.state);
  });
});
```

There is a matching `data-global` handler nearby. Find both.

**A parameter definition** looks like:

```js
{ type: 'number', label: 'Edge Radiance', min: 0.5, max: 3.5, step: 0.1, default: 1.2, section: 'colors' }
```

`type` is one of `number` / `color` / `select`. `section` is one of `colors` / `geometry` / `motion` / … and **`geometry` parameters rebuild engine geometry on change** — that is why they are excluded from modulation. They are still directly editable; just don't add anything that writes them at frame rate.

**`.ctrl-value` and `.ctrl-label` already have CSS.** `slider-control` and `select-control` are emitted on every row and have **no CSS rule at all** — they are vestigial. Do not build on them; the hygiene sprint removes them.

**`render()` replaces `panelLayer.innerHTML`,** so listeners must be attached inside the `attach*Listeners()` cycle, never once.

**Browser verification handle:** `window.__orb = { studio, state, ui, ab }`.

**CRITICAL browser gotchas:**
- A hidden Browser pane means `requestAnimationFrame` never fires. `studio.fpsTracker.fps` still reports its default `60` — not a liveness signal. Step frames with `studio.renderFrame()`.
- **`setTimeout` is clamped to ~1000 ms in a hidden pane**, so you cannot step frames in real time. Inject the delta: `studio.clock.getDelta = () => 0.025`, step, restore.
- CSS transitions are frozen too; `getComputedStyle()` returns the starting value forever. Set `element.style.transition = 'none'` before measuring.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/param-format.js` | **Create.** Pure value formatting and parsing from a definition. Unit-tested. |
| `src/ui/studio-ui.js` | **Modify.** One shared row builder: value readout, numeric entry, range, reset. |
| `src/style.css` | **Modify.** Append row styles. |
| `tests/param-format.test.mjs` | **Create.** Node tests. |

---

### Task 1: Formatting and parsing a parameter value

**Files:**
- Create: `src/core/param-format.js`
- Test: `tests/param-format.test.mjs`

**Interfaces:**
- `decimalsFor(def) => number` — digits implied by `def.step` (`0.1` → 1, `0.05` → 2, `1` → 0, missing → 2).
- `formatParamValue(value, def) => string` — the display string. Never scientific notation, never a float artefact.
- `parseParamValue(raw, def) => number | null` — parses typed text, snaps to `step`, clamps to `[min, max]`; `null` when unparseable.
- `isAtDefault(value, def) => boolean` — compared at display precision, so `2.9000000000000004` counts as `2.9`.

- [ ] **Step 1: Write the failing test**

Create `tests/param-format.test.mjs`:

```js
import {
  decimalsFor,
  formatParamValue,
  parseParamValue,
  isAtDefault,
} from '../src/core/param-format.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const glow = { type: 'number', min: 0.5, max: 3.5, step: 0.1, default: 1.2 };
const fine = { type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 };
const ints = { type: 'number', min: 1, max: 8, step: 1, default: 3 };
const nostep = { type: 'number', min: 0, max: 10, default: 1 };

// --- decimals ---
ok('step 0.1 implies 1 decimal', decimalsFor(glow) === 1);
ok('step 0.05 implies 2 decimals', decimalsFor(fine) === 2);
ok('step 1 implies 0 decimals', decimalsFor(ints) === 0);
ok('a missing step falls back to 2', decimalsFor(nostep) === 2);

// --- formatting: the actual bug ---
ok('kills the float artefact', formatParamValue(2.9000000000000004, glow) === '2.9',
  formatParamValue(2.9000000000000004, glow));
ok('formats a clean value', formatParamValue(1.2, glow) === '1.2');
ok('pads to the step precision', formatParamValue(0.5, fine) === '0.50');
ok('integers carry no point', formatParamValue(3, ints) === '3');
ok('rounds rather than truncating', formatParamValue(2.86, glow) === '2.9');
ok('never uses exponent notation', !formatParamValue(0.0000001, fine).includes('e'));
ok('handles a negative', formatParamValue(-0.35, { min: -1, max: 1, step: 0.05 }) === '-0.35');
ok('a non-number is not rendered as NaN', formatParamValue(undefined, glow) === '—',
  formatParamValue(undefined, glow));
ok('a null def still formats', typeof formatParamValue(1.5, null) === 'string');

// --- parsing ---
ok('parses a plain number', parseParamValue('2.4', glow) === 2.4);
ok('snaps to the step', parseParamValue('2.43', glow) === 2.4);
ok('clamps above max', parseParamValue('99', glow) === 3.5);
ok('clamps below min', parseParamValue('-4', glow) === 0.5);
ok('tolerates surrounding space', parseParamValue('  2.1  ', glow) === 2.1);
ok('rejects text', parseParamValue('abc', glow) === null);
ok('rejects empty', parseParamValue('', glow) === null);
ok('rejects NaN-ish', parseParamValue('--', glow) === null);
ok('parsed values are free of float noise', (() => {
  for (let i = 0; i < 40; i++) {
    const v = parseParamValue(String(0.5 + i * 0.1), glow);
    if (v === null) continue;
    if (formatParamValue(v, glow).length > 4) return false;   // e.g. "2.9000000000000004"
  }
  return true;
})());
ok('snapping stays inside the range', (() => {
  for (let i = 0; i < 200; i++) {
    const raw = (Math.random() * 8 - 2).toFixed(4);
    const v = parseParamValue(raw, glow);
    if (v === null) continue;
    if (v < glow.min - 1e-9 || v > glow.max + 1e-9) return false;
  }
  return true;
})());

// --- default detection ---
ok('exact default', isAtDefault(1.2, glow) === true);
ok('float-noisy default still counts', isAtDefault(1.2000000000000002, glow) === true);
ok('a different value does not', isAtDefault(1.3, glow) === false);
ok('a def without a default is never at default', isAtDefault(1, { min: 0, max: 2, step: 1 }) === false);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/param-format.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write the implementation**

Create `src/core/param-format.js`:

```js
// Displaying and reading back a parameter value.
//
// The inspector used to print the raw number, so a slider stepping by 0.1 from
// 0.5 showed "2.9000000000000004" — binary floating point, surfaced to the user.
// The Motion Lab separately hardcoded toFixed(2), so the same kind of control
// formatted two different ways depending on which tab it was in. Precision
// belongs to the parameter definition, not to the call site.
//
// Pure — no DOM — so it can be tested in Node.

const FALLBACK_DECIMALS = 2;

export function decimalsFor(def) {
  const step = def?.step;
  if (!Number.isFinite(step) || step <= 0) return FALLBACK_DECIMALS;
  // Read the precision off the step's decimal text rather than computing a log,
  // which would make 0.1 come out as 0.9999… digits.
  const text = String(step);
  if (text.includes('e') || text.includes('E')) return FALLBACK_DECIMALS;
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

export function formatParamValue(value, def) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(decimalsFor(def));
}

export function parseParamValue(raw, def) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  if (!text) return null;

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;

  const step = Number.isFinite(def?.step) && def.step > 0 ? def.step : null;
  // Snap through the step grid anchored at min, so a stepped range that does not
  // start at zero still lands on values the slider itself can produce.
  const min = Number.isFinite(def?.min) ? def.min : -Infinity;
  const max = Number.isFinite(def?.max) ? def.max : Infinity;

  let next = parsed;
  if (step && Number.isFinite(min)) {
    next = min + Math.round((parsed - min) / step) * step;
  } else if (step) {
    next = Math.round(parsed / step) * step;
  }

  next = Math.min(max, Math.max(min, next));
  // Re-round after clamping: the arithmetic above reintroduces float noise.
  return Number(next.toFixed(decimalsFor(def)));
}

export function isAtDefault(value, def) {
  if (!Number.isFinite(def?.default)) return false;
  return formatParamValue(value, def) === formatParamValue(def.default, def);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/param-format.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add src/core/param-format.js tests/param-format.test.mjs
git commit -m "Derive parameter display precision from the step, not the call site"
```

---

### Task 2: One row builder, used everywhere

**Files:**
- Modify: `src/ui/studio-ui.js`

**Interfaces:**
- `StudioUI.renderNumberRow({ key, def, value, attr }) => string` — the single source of truth for a numeric row. `attr` is the data attribute (`data-param="edgeGlow"` or `data-global="exposure"`) so engine and global sliders share one shape.
- Row contains: label, a **numeric input** carrying the exact value, a **reset** button (shown only when off default), the slider, and **min / max end labels**.

- [ ] **Step 1: Import the formatter**

In `src/ui/studio-ui.js`, find:

```js
import { makeStep, totalDuration } from '../core/sequence.js';
```

Add directly below it:

```js
import { formatParamValue, parseParamValue, isAtDefault } from '../core/param-format.js';
```

- [ ] **Step 2: Add the row builder**

In `src/ui/studio-ui.js`, insert this method immediately **above** `renderParamsSection(sectionName) {`:

```js
  // Every numeric control in the inspector goes through here. The engine rows and
  // the global bloom/exposure/tempo rows were duplicated markup with hardcoded
  // ids, which is how they drifted into formatting values differently.
  renderNumberRow({ key, def, value, attr }) {
    const atDefault = isAtDefault(value, def);
    const shown = formatParamValue(value, def);
    return `
      <div class="control-row param-row">
        <div class="ctrl-label-row">
          <label class="ctrl-label">${def.label ?? key}${this.modDot?.(key) ?? ''}</label>
          <span class="ctrl-entry">
            <input class="ctrl-number" type="text" inputmode="decimal"
                   data-param-number="${escapeHtml(key)}" value="${shown}"
                   aria-label="${escapeHtml(def.label ?? key)} value" />
            ${Number.isFinite(def.default) ? `
              <button class="ctrl-reset ${atDefault ? 'is-default' : ''}"
                      data-param-reset="${escapeHtml(key)}"
                      title="Reset to ${formatParamValue(def.default, def)}"
                      ${atDefault ? 'disabled' : ''}>↺</button>` : ''}
          </span>
        </div>
        <input type="range" class="studio-slider" ${attr}
               min="${def.min}" max="${def.max}" step="${def.step ?? 'any'}" value="${value}" />
        <div class="ctrl-range">
          <span>${formatParamValue(def.min, def)}</span>
          <span>${formatParamValue(def.max, def)}</span>
        </div>
      </div>
    `;
  }
```

**Note:** `modDot(key)` is an existing helper local to `renderParamsSection` that marks a parameter driven by a modulation route. If it is a local `const` rather than a method, promote it to a method `modDot(key)` on the class so this builder can call it — the marker must not be lost, because the slider shows the *base* value while the engine renders the modulated one, and without the dot that divergence reads as a broken control.

- [ ] **Step 3: Use it for the engine rows**

In `src/ui/studio-ui.js`, find the numeric branch inside `renderParamsSection` (around line 737):

```js
                  <div class="control-row slider-control">
                    <div class="ctrl-label-row">
                      <label class="ctrl-label">${def.label}${modDot(key)}</label>
                      <span class="ctrl-value" id="val-${key}">${value}</span>
                    </div>
                    <input
                      type="range"
                      class="studio-slider"
                      data-param="${key}"
                      min="${def.min}"
                      max="${def.max}"
                      step="${def.step}"
                      value="${value}"
                    />
                  </div>
```

Replace the whole block with:

```js
                  ${this.renderNumberRow({ key, def, value, attr: `data-param="${key}"` })}
```

- [ ] **Step 4: Use it for the global rows**

Each global slider (bloomStrength, bloomRadius, bloomThreshold, exposure, autoRotateSpeed, timeScale — around lines 770–825) is hand-written markup. Replace each with a `renderNumberRow` call, supplying an inline definition since these have no schema entry. For example:

```js
          ${this.renderNumberRow({
            key: 'bloomStrength',
            def: { label: 'Bloom Strength', min: 0, max: 2.5, step: 0.05, default: 0.9 },
            value: g.bloomStrength,
            attr: 'data-global="bloomStrength"',
          })}
```

Use the `min`/`max`/`step` already present in each existing `<input>` — **do not invent new ranges.** For `default`, use the value in `DEFAULT_GLOBAL_SETTINGS` in `src/core/state.js`; if a key is absent there, omit `default` and the reset button simply won't render.

- [ ] **Step 5: Wire the listeners**

In `src/ui/studio-ui.js`, find:

```js
    this.root.querySelectorAll('input[type="range"][data-param]').forEach((slider) => {
      const key = slider.getAttribute('data-param');
      slider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        this.state.engines[this.state.engine][key] = val;
        const valLabel = this.root.querySelector(`#val-${key}`);
        if (valLabel) valLabel.textContent = val;
        this.onStateChange(this.state);
      });
    });
```

Replace with:

```js
    // Keeps the number field in step with the slider without a full render(),
    // which would destroy the slider mid-drag.
    const syncRow = (key, value, def) => {
      const field = this.root.querySelector(`[data-param-number="${key}"]`);
      if (field && document.activeElement !== field) field.value = formatParamValue(value, def);
      const reset = this.root.querySelector(`[data-param-reset="${key}"]`);
      if (reset) {
        const atDefault = isAtDefault(value, def);
        reset.classList.toggle('is-default', atDefault);
        reset.disabled = atDefault;
      }
    };

    this.root.querySelectorAll('input[type="range"][data-param]').forEach((slider) => {
      const key = slider.getAttribute('data-param');
      const def = (ENGINE_PARAM_DEFINITIONS[this.state.engine] || {})[key] || {};
      slider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        this.state.engines[this.state.engine][key] = val;
        syncRow(key, val, def);
        this.onStateChange(this.state);
      });
    });

    // Typed entry. 'change' rather than 'input' so a half-typed "2." is not
    // parsed as 2 and snapped out from under the cursor.
    this.root.querySelectorAll('[data-param-number]').forEach((field) => {
      const key = field.getAttribute('data-param-number');
      const def = (ENGINE_PARAM_DEFINITIONS[this.state.engine] || {})[key] || {};
      const commit = () => {
        const parsed = parseParamValue(field.value, def);
        if (parsed === null) {
          // Reject rather than write NaN into state; restore what is actually set.
          field.value = formatParamValue(this.state.engines[this.state.engine][key], def);
          return;
        }
        this.state.engines[this.state.engine][key] = parsed;
        field.value = formatParamValue(parsed, def);
        const slider = this.root.querySelector(`input[type="range"][data-param="${key}"]`);
        if (slider) slider.value = parsed;
        syncRow(key, parsed, def);
        this.onStateChange(this.state);
      };
      field.addEventListener('change', commit);
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); field.blur(); }
        if (e.key === 'Escape') { field.value = formatParamValue(this.state.engines[this.state.engine][key], def); field.blur(); }
        // The panel's bare-key shortcuts must not fire while typing a value.
        e.stopPropagation();
      });
    });

    this.root.querySelectorAll('[data-param-reset]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-param-reset');
        const def = (ENGINE_PARAM_DEFINITIONS[this.state.engine] || {})[key];
        if (!def || !Number.isFinite(def.default)) return;
        this.state.engines[this.state.engine][key] = def.default;
        this.onStateChange(this.state);
        this.render();
      });
    });
```

Then apply the same three treatments to the `data-global` handler nearby, writing into `this.state.global` instead of `this.state.engines[...]` and resolving `def` from the inline definitions used in Step 4. Keep a single helper if that is cleaner — just don't leave the global rows on the old raw-value path.

**`ENGINE_PARAM_DEFINITIONS` is already imported** at the top of the file; confirm before adding an import.

- [ ] **Step 6: Append the styles**

Append to the end of `src/style.css`:

```css

/* ---------------------------------------------------------------------------
   Parameter row. The value is an editable field rather than a label, because a
   slider alone cannot reproduce a number you read off a finding.
   --------------------------------------------------------------------------- */
.ctrl-entry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ctrl-number {
  width: 58px;
  padding: 2px 6px;
  text-align: right;
  background: var(--input-bg);
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--text-primary);
  font-family: var(--font);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.ctrl-number:hover {
  border-color: var(--input-border);
}

.ctrl-number:focus {
  outline: none;
  border-color: var(--primary);
  background: rgba(255, 255, 255, 0.08);
}

.ctrl-reset {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--panel-border);
  border-radius: 5px;
  color: var(--text-muted);
  font-family: var(--font);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.ctrl-reset:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

/* Kept in the layout rather than hidden, so rows do not reflow the moment a
   value moves off its default. */
.ctrl-reset:disabled,
.ctrl-reset.is-default {
  opacity: 0.18;
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--panel-border);
  color: var(--text-muted);
  cursor: default;
}

.ctrl-range {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
```

- [ ] **Step 7: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 8: Verify in the browser**

Dev server running, open http://localhost:5173:

```js
const { studio: s, state: st, ui } = window.__orb;
const { ENGINE_PARAM_DEFINITIONS } = await import('/src/core/state.js');
const defs = ENGINE_PARAM_DEFINITIONS[st.engine];
const key = Object.entries(defs).find(([, d]) => d.type === 'number')[0];
const def = defs[key];
ui.activeTab = 'colors'; ui.render();

const out = {};
// 1. no float artefacts anywhere in the panel
st.engines[st.engine][key] = 0.5 + 0.1 * 24;      // classic binary-float value
s.updateParameters(st); ui.render();
out.rawInState = st.engines[st.engine][key];
out.displayed = ui.root.querySelector(`[data-param-number="${key}"]`)?.value;
out.noArtefact = !/\d\.\d{5,}/.test(out.displayed || '');
out.everyFieldClean = [...ui.root.querySelectorAll('.ctrl-number')]
  .every((f) => !/\d\.\d{5,}/.test(f.value));

// 2. typed entry
const field = ui.root.querySelector(`[data-param-number="${key}"]`);
field.value = String(def.max + 99);
field.dispatchEvent(new Event('change', { bubbles: true }));
out.clampedOnType = st.engines[st.engine][key] === def.max;
field.value = 'nonsense';
field.dispatchEvent(new Event('change', { bubbles: true }));
out.rejectsGarbage = st.engines[st.engine][key] === def.max && !Number.isNaN(st.engines[st.engine][key]);

// 3. the slider and the field stay in step
const slider = ui.root.querySelector(`input[type="range"][data-param="${key}"]`);
slider.value = def.min; slider.dispatchEvent(new Event('input', { bubbles: true }));
out.fieldFollowsSlider = ui.root.querySelector(`[data-param-number="${key}"]`).value === (def.min).toFixed(String(def.step).split('.')[1]?.length ?? 2);

// 4. reset
ui.render();
const reset = ui.root.querySelector(`[data-param-reset="${key}"]`);
out.resetEnabledWhenOffDefault = reset && !reset.disabled;
reset.click();
out.resetRestoresDefault = st.engines[st.engine][key] === def.default;
out.resetDisabledAtDefault = ui.root.querySelector(`[data-param-reset="${key}"]`).disabled === true;

// 5. range labels present
out.rangeShown = ui.root.querySelectorAll('.ctrl-range').length > 0;

// 6. typing must not fire panel shortcuts
const before = st.engine;
const f2 = ui.root.querySelector('.ctrl-number');
f2.focus();
f2.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
out.shortcutsSuppressedWhileTyping = st.engine === before;
JSON.stringify(out, null, 2);
```

Expected: `noArtefact: true`, `everyFieldClean: true`, `clampedOnType: true`, `rejectsGarbage: true`, `fieldFollowsSlider: true`, `resetRestoresDefault: true`, `resetDisabledAtDefault: true`, `rangeShown: true`, `shortcutsSuppressedWhileTyping: true`.

Then check the Motion tab and the Optics tab (globals) by eye, and confirm no row still shows a long float.

- [ ] **Step 9: Commit**

```bash
git add src/ui/studio-ui.js src/style.css
git commit -m "Give parameter rows a typed value, a visible range and a reset"
```

---

## Definition of done

- `node tests/param-format.test.mjs` prints `ALL PASS`; every other suite still passes; `npx vite build` succeeds.
- No control anywhere in the inspector displays a float artefact.
- Every numeric parameter accepts a typed value, clamps and snaps it, and rejects garbage without writing `NaN`.
- Slider and field stay in step in both directions; dragging does not fight the field you are typing in.
- Reset returns a parameter to its schema default and is inert when already there.
- Engine rows and global rows go through the same builder.
- Typing a value does not trigger the panel's bare-key shortcuts.
- No console errors.

## Follow-up worth noting

Once every numeric row shares one builder, the Motion Lab's private `slider()` helper (which hardcodes `toFixed(2)`) is the last remaining duplicate. Folding it into `renderNumberRow` is a small, separate change — the hygiene sprint covers it. Update the capability inventory in `docs/VISION.md` in the same commit as your last task.
