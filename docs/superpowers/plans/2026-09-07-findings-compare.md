# Findings Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select two kept findings and flip between them live — and breed a new grid from any finding — without loading each one by hand.

**Architecture:** The A/B compare and the findings shelf were built in different sprints and never met. A/B can only ever hold *what is currently on screen*: `ab.store(slot)` snapshots live state, so comparing two findings today means load one, press `1`, find the other in the list, load it, press `2`, then swap. By the time you get there you have forgotten what the first one looked like — which is precisely the failure mode `docs/VISION.md` §4 says comparison exists to prevent.

The fix is small because the shapes already line up: a finding is `{ engine, global, params, modulation }` and so is an A/B snapshot. All that is missing is a way to put a snapshot into a slot without going through the live orb, plus selection in the findings list.

Same reasoning for breeding: the grid always seeds from live state, so "explore around this old finding" means loading it first. One button.

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

Repo root: `/Users/ahmetbektes/WDesignspace/orb-animation`. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` first — §4 (comparison and capture) and §5 (invariants).

**A/B compare** lives in `src/core/ab-compare.js`. `createAbCompare(studio, state, { getTransition })` returns `{ store(slot), has(slot), activeSlot, activate(slot), swap() }`. Internally:

- `snapshotState(state)` → `structuredClone({ engine, global, modulation, params: state.engines[state.engine] })`. **Only the active engine's bag** — snapshotting all eight would silently rewrite engines the user never opened.
- `applySnapshot(state, snapshot)` writes **in place** (`Object.assign` into `state.global` and the engine bag) and returns `true` when the engine type changed. It writes in place because `state`, `state.global` and each `state.engines[…]` bag are held by reference across `main.js`, `StudioUI` and `OrbStudio` — reassigning any of them orphans the other holders. **This is the invariant most likely to bite you; do not "simplify" it.**
- `apply(slot)` cuts via `studio.setEngine` when the engine changed, tweens via `studio.tweenTo` when a transition is configured, and otherwise calls `studio.updateParameters(state)` so rotation phase and `virtualTime` survive the flip.

There are existing tests at `tests/ab-compare.test.mjs` — read them before touching the module, and keep them passing.

**Findings** live in `src/core/findings.js`. Store API: `list()` (newest first), `add`, `remove`, `rename`, `clear`, plus a `lastError` getter. An entry is `{ id, createdAt, note, engine, global, params, modulation, thumb }`. The store is at `ui.findings`. The findings tab is `StudioUI.renderFindingsTab()` / `attachFindingsListeners()` (around line 1133 of `src/ui/studio-ui.js`); cards carry `data-finding="<id>"` and already have Load and Delete buttons.

`ui.importConfigText(json)` is how a finding is loaded today — it validates against the schema and applies in place.

**The grid** seeds from live state: `studio.enterGridMode(state, { radius, sections })` reads `state.engines[state.engine]`. So "breed from this finding" is load-then-enter, not a new grid entry point.

**Wiring pattern:** `StudioUI` does not own the `ab` instance; `main.js` does. The established pattern is a callback field assigned from `main.js` (see `ui.onToggleGrid = toggleGrid`). Follow it — do not import `ab` into `studio-ui.js`.

**`render()` replaces `panelLayer.innerHTML`**, so listeners must be attached inside the `attach*Listeners()` cycle, never once.

**Browser verification handle:** `window.__orb = { studio, state, ui, ab }`.

**CRITICAL browser gotchas:**
- A hidden Browser pane means `requestAnimationFrame` never fires and the render loop is frozen. `studio.fpsTracker.fps` still reports its default `60` — not a liveness signal. Step frames with `studio.renderFrame()`.
- CSS transitions are frozen too, so `getComputedStyle()` on a transitioning property returns the starting value forever. Set `element.style.transition = 'none'` before measuring, and assert on the element that carries the rule — an ancestor's opacity does not change a descendant's computed value.
- **Specific to this sprint:** a tween started by an A/B swap does not advance without frames. Drive it with `studio.paramTween.advance(ms)` rather than waiting.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/ab-compare.js` | **Modify.** Add `stash(slot, snapshot)` and `slotSummary()`. |
| `tests/ab-compare.test.mjs` | **Modify.** Cover the new methods. |
| `src/ui/studio-ui.js` | **Modify.** Selection in the findings list, and the compare / breed actions. |
| `src/main.js` | **Modify.** Wire the callbacks. |
| `src/style.css` | **Modify.** Append selection styles. |

---

### Task 1: Put an arbitrary snapshot into a slot

**Files:**
- Modify: `src/core/ab-compare.js`
- Modify: `tests/ab-compare.test.mjs`

**Interfaces:**
- Produces:
  - `ab.stash(slot, source)` — fills a slot from a plain `{ engine, global, params, modulation }` object (a finding works directly) **without** touching live state.
  - `ab.slotSummary()` → `{ a: { engine, filled } | null, b: … , active }` so the UI can label the buttons.
  - `normalizeSnapshot(source)` exported for testing — clones and drops anything not in the four expected keys.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ab-compare.test.mjs`, **before** the final summary/`process.exit` lines (match the existing file's `ok(...)` helper name — read it first and use whatever it actually calls):

```js
// --- stash: fill a slot from a finding, without disturbing the live orb ---
{
  const finding = {
    id: 'f1', note: 'kept', createdAt: 1, thumb: 'data:image/jpeg;base64,AA',
    engine: 'quantum',
    global: { timeScale: 0.5 },
    params: { edgeGlow: 2 },
    modulation: { enabled: true, sources: {}, routes: [] },
  };

  const state = {
    engine: 'nebula',
    global: { timeScale: 1 },
    modulation: { enabled: false, sources: {}, routes: [] },
    engines: { nebula: { edgeGlow: 0.1 }, quantum: { edgeGlow: 0.1 } },
  };
  const calls = [];
  const studio = {
    setEngine: (t) => calls.push(['setEngine', t]),
    updateParameters: () => calls.push(['updateParameters']),
    syncModulation: () => calls.push(['syncModulation']),
    updateGlobalSettings: () => calls.push(['updateGlobalSettings']),
    tweenTo: (t, o) => calls.push(['tweenTo', t, o]),
  };

  const ab = createAbCompare(studio, state, {});
  ab.stash('a', finding);

  ok('stash fills the slot', ab.has('a') === true);
  ok('stash does not touch live state', state.engine === 'nebula' && state.engines.nebula.edgeGlow === 0.1);
  ok('stash does not call the studio', calls.length === 0, JSON.stringify(calls));
  ok('stash does not make the slot active', ab.activeSlot === null);

  // Activating it must now behave exactly like any other stored slot.
  ab.activate('a');
  ok('activating a stashed slot switches engine', state.engine === 'quantum');
  ok('activating writes the params in place', state.engines.quantum.edgeGlow === 2);
  ok('an engine change is a cut', calls.some((c) => c[0] === 'setEngine'));
  ok('activating marks it active', ab.activeSlot === 'a');

  // Detached from the finding: editing the finding later must not mutate the slot.
  finding.params.edgeGlow = 99;
  state.engines.quantum.edgeGlow = 0.1;
  ab.activate('a');
  ok('the slot holds its own copy', state.engines.quantum.edgeGlow === 2);

  // Only the four known keys survive — a finding also carries id/note/thumb, and
  // letting those into a snapshot would put junk in every future export.
  const cleaned = normalizeSnapshot(finding);
  ok('normalizeSnapshot drops finding metadata',
    !('id' in cleaned) && !('note' in cleaned) && !('thumb' in cleaned) && !('createdAt' in cleaned),
    Object.keys(cleaned).join(','));
  ok('normalizeSnapshot keeps the config',
    cleaned.engine === 'quantum' && cleaned.params.edgeGlow === 99 && cleaned.global.timeScale === 0.5);
  ok('normalizeSnapshot tolerates a missing modulation',
    normalizeSnapshot({ engine: 'x', global: {}, params: {} }).modulation === null);

  const summary = ab.slotSummary();
  ok('summary reports the filled slot', summary.a.filled === true && summary.a.engine === 'quantum');
  ok('summary reports the empty slot', summary.b === null);
  ok('summary reports the active slot', summary.active === 'a');
}
```

Add `normalizeSnapshot` to the file's import from `../src/core/ab-compare.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/ab-compare.test.mjs`
Expected: fails — `normalizeSnapshot` is not exported and `ab.stash` is not a function.

- [ ] **Step 3: Write the implementation**

In `src/core/ab-compare.js`, find:

```js
export function applySnapshot(state, snapshot) {
```

Insert directly **above** it:

```js
// Findings and A/B snapshots hold the same four keys, but a finding also carries
// id / note / createdAt / thumb. Those must not reach a slot: a slot is exported
// and re-imported, and shelf metadata leaking into a config would slowly pollute
// every capture.
export function normalizeSnapshot(source) {
  return {
    engine: source.engine,
    global: structuredClone(source.global ?? {}),
    modulation: source.modulation ? structuredClone(source.modulation) : null,
    params: structuredClone(source.params ?? {}),
  };
}

```

Then find, inside `createAbCompare`'s returned object:

```js
    store(slot) {
      slots[slot] = snapshotState(state);
      activeSlot = slot;
    },
```

Insert directly **below** it:

```js
    // Fills a slot from a config that is not on screen — a kept finding, say.
    // Deliberately does NOT set activeSlot: nothing was applied, so claiming the
    // slot is active would make the next swap() flip the wrong way.
    stash(slot, source) {
      if (!source?.engine) return false;
      slots[slot] = normalizeSnapshot(source);
      return true;
    },
    slotSummary() {
      const describe = (slot) => (slots[slot] ? { filled: true, engine: slots[slot].engine } : null);
      return { a: describe('a'), b: describe('b'), active: activeSlot };
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/ab-compare.test.mjs`
Expected: `ALL PASS`, with the pre-existing checks still passing.

- [ ] **Step 5: Commit**

```bash
git add src/core/ab-compare.js tests/ab-compare.test.mjs
git commit -m "Let A/B slots be filled from a config that is not on screen"
```

---

### Task 2: Selection and actions in the findings list

**Files:**
- Modify: `src/ui/studio-ui.js`
- Modify: `src/style.css` (append at end)

**Interfaces:**
- Consumes: `this.findings`, and the new callbacks `this.onCompareFindings` / `this.onBreedFinding`.
- Produces:
  - `StudioUI.selectedFindings` — a `Set` of ids, capped at 2.
  - Click a card's thumbnail to toggle selection; an action bar appears once anything is selected.
  - Buttons: **Compare A/B** (enabled at exactly 2), **Breed** (enabled at exactly 1), **Clear selection**.

- [ ] **Step 1: Add the selection field**

In `src/ui/studio-ui.js`, find in the constructor:

```js
    this.findings = createFindingsStore(findingsStorage);
```

Add directly below it:

```js
    // Selection is transient: it describes what you are looking at right now, not
    // anything worth persisting alongside the findings themselves. Capped at two,
    // because the only consumer is a two-slot comparison.
    this.selectedFindings = new Set();
    this.onCompareFindings = null;
    this.onBreedFinding = null;
```

- [ ] **Step 2: Mark selection in the card markup**

In `src/ui/studio-ui.js`, find inside `renderFindingsTab()`:

```js
              <div class="finding-card" data-finding="${id}">
                <img class="finding-thumb" src="${safeThumbnail(entry.thumb)}" alt="" loading="lazy" />
```

Replace with:

```js
              <div class="finding-card ${this.selectedFindings.has(entry.id) ? 'selected' : ''}" data-finding="${id}">
                <img class="finding-thumb" src="${safeThumbnail(entry.thumb)}" alt="" loading="lazy"
                     data-finding-select="${id}" title="Click to select for comparison" />
```

- [ ] **Step 3: Add the action bar**

In `src/ui/studio-ui.js`, find inside `renderFindingsTab()`:

```js
        <div class="modal-footer-row findings-footer">
          <button class="btn-sm" id="btn-findings-clear">Clear all</button>
        </div>
```

Replace with:

```js
        ${this.renderFindingsSelectionBar()}
        <div class="modal-footer-row findings-footer">
          <button class="btn-sm" id="btn-findings-clear">Clear all</button>
        </div>
```

Then, immediately **above** `renderFindingsTab() {`, add:

```js
  renderFindingsSelectionBar() {
    const count = this.selectedFindings.size;
    if (!count) return '';
    return `
      <div class="findings-selection-bar">
        <span class="findings-selection-count">${count} selected</span>
        <button class="btn-sm btn-accent" id="btn-findings-compare" ${count === 2 ? '' : 'disabled'}
                title="Load into A and B, then press \` to flip">Compare A/B</button>
        <button class="btn-sm" id="btn-findings-breed" ${count === 1 ? '' : 'disabled'}
                title="Open the variation grid seeded from this finding">Breed</button>
        <button class="btn-sm" id="btn-findings-deselect">Clear</button>
      </div>
    `;
  }

```

- [ ] **Step 4: Wire the listeners**

In `src/ui/studio-ui.js`, find in `attachFindingsListeners()`:

```js
    this.root.querySelectorAll('[data-finding-load]').forEach((button) => {
```

Insert directly **above** it:

```js
    this.root.querySelectorAll('[data-finding-select]').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const id = thumb.getAttribute('data-finding-select');
        if (this.selectedFindings.has(id)) {
          this.selectedFindings.delete(id);
        } else {
          // Two slots, so a third click retires the oldest rather than refusing —
          // refusing would mean an extra deselect click in the common case of
          // wanting to swap one side of a comparison.
          if (this.selectedFindings.size >= 2) {
            this.selectedFindings.delete(this.selectedFindings.values().next().value);
          }
          this.selectedFindings.add(id);
        }
        this.render();
      });
    });

    this.root.querySelector('#btn-findings-deselect')?.addEventListener('click', () => {
      this.selectedFindings.clear();
      this.render();
    });

    this.root.querySelector('#btn-findings-compare')?.addEventListener('click', () => {
      const entries = this.selectedEntries();
      if (entries.length !== 2) return;
      this.onCompareFindings?.(entries[0], entries[1]);
    });

    this.root.querySelector('#btn-findings-breed')?.addEventListener('click', () => {
      const entries = this.selectedEntries();
      if (entries.length !== 1) return;
      this.onBreedFinding?.(entries[0]);
    });

```

Then add this helper immediately **above** `renderFindingsSelectionBar() {`:

```js
  // Resolved in list order rather than click order, so "the top one" is always A.
  // Ids for deleted findings are dropped here rather than tracked on delete.
  selectedEntries() {
    return this.findings.list().filter((entry) => this.selectedFindings.has(entry.id));
  }

```

- [ ] **Step 5: Drop stale ids when findings are removed**

In `src/ui/studio-ui.js`, find in `attachFindingsListeners()`:

```js
      button.addEventListener('click', () => {
        this.findings.remove(button.getAttribute('data-finding-delete'));
```

Replace with:

```js
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-finding-delete');
        this.selectedFindings.delete(id);
        this.findings.remove(id);
```

And find the `#btn-findings-clear` handler's body, after the `confirm(...)` guard, and add `this.selectedFindings.clear();` before it calls `this.findings.clear()`.

- [ ] **Step 6: Append the styles**

Append to the end of `src/style.css`:

```css

/* Findings selected for comparison. The ring is on the card, not the thumbnail,
   so it stays visible while the note field is focused. */
.finding-card.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary), 0 0 14px var(--primary-glow);
}

.finding-card .finding-thumb {
  cursor: pointer;
}

.findings-selection-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid var(--primary);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

.findings-selection-count {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.findings-selection-bar button[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 7: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/ui/studio-ui.js src/style.css
git commit -m "Select findings for comparison and breeding"
```

---

### Task 3: Wire compare and breed

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Wire the callbacks**

In `src/main.js`, find:

```js
// The top-bar Grid button and the G key run the same path.
ui.onToggleGrid = toggleGrid;
```

Insert directly **below** it:

```js
// Loading two findings into A and B and activating A leaves the flip one
// backquote away — the whole point is that the second look does not require
// hunting through the shelf again.
ui.onCompareFindings = (first, second) => {
  ab.stash('a', first);
  ab.stash('b', second);
  ab.activate('a');
  ui.render();
  refreshAbReadout(true);
};

// The grid always seeds from live state, so breeding an old finding means
// loading it first. One click instead of load-then-G.
ui.onBreedFinding = (entry) => {
  ui.importConfigText(JSON.stringify({
    engine: entry.engine,
    global: entry.global,
    params: entry.params,
    modulation: entry.modulation,
  }));
  if (!studio.isGridMode) toggleGrid();
};
```

If `refreshAbReadout` is declared with `function` it is hoisted and this is fine wherever it sits; if it is a `const` arrow, move this block below its declaration.

- [ ] **Step 2: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 3: Verify in the browser**

Dev server running, open http://localhost:5173:

```js
const { studio: s, state: st, ui, ab } = window.__orb;
ui.findings.clear(); ui.selectedFindings.clear();
for (let i = 0; i < 3; i++) s.renderFrame();

// two findings that differ visibly
st.engines[st.engine].edgeGlow = 0.2; s.updateParameters(st); s.renderFrame();
const first = ui.saveFinding('dim');
st.engines[st.engine].edgeGlow = 2.8; s.updateParameters(st); s.renderFrame();
const second = ui.saveFinding('bright');

ui.activeTab = 'findings'; ui.render();
const out = {};

// selection
const thumbs = [...document.querySelectorAll('[data-finding-select]')];
out.thumbCount = thumbs.length;
thumbs[0].click(); thumbs[1].click();
out.selected = ui.selectedFindings.size;
out.barShown = !!document.querySelector('.findings-selection-bar');
out.ringsDrawn = document.querySelectorAll('.finding-card.selected').length;
out.compareEnabled = !document.querySelector('#btn-findings-compare').disabled;
out.breedDisabledAtTwo = document.querySelector('#btn-findings-breed').disabled;

// the cap
thumbs[0].click();                       // deselect
[...document.querySelectorAll('[data-finding-select]')][0].click();
out.capHoldsAtTwo = ui.selectedFindings.size <= 2;

// compare
document.querySelector('#btn-findings-compare')?.click();
const summary = ab.slotSummary();
out.slotsFilled = !!summary.a && !!summary.b;
out.activeIsA = summary.active === 'a';
const afterA = st.engines[st.engine].edgeGlow;
ab.swap();
const afterB = st.engines[st.engine].edgeGlow;
out.swapChangesTheOrb = afterA !== afterB;
out.values = [afterA, afterB];

// live state was untouched before Compare was pressed
out.liveUntouchedByStash = (() => {
  const before = st.engines[st.engine].edgeGlow;
  ab.stash('a', ui.findings.list()[0]);
  return st.engines[st.engine].edgeGlow === before;
})();

ui.findings.clear(); ui.selectedFindings.clear();
JSON.stringify(out, null, 2);
```

Expected: `thumbCount: 2`, `selected: 2`, `barShown: true`, `ringsDrawn: 2`, `compareEnabled: true`, `breedDisabledAtTwo: true`, `capHoldsAtTwo: true`, `slotsFilled: true`, `activeIsA: true`, `swapChangesTheOrb: true` with two clearly different values, `liveUntouchedByStash: true`.

Then verify Breed by hand: select exactly one finding, click **Breed**, and confirm the grid opens with cell 0 matching that finding — cell 0 is always the unmutated parent, so it should look like the thumbnail. Exit with `G`.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "Wire findings compare and breed to A/B and the grid"
```

---

## Definition of done

- `node tests/ab-compare.test.mjs` prints `ALL PASS`, old checks included; the other suites still pass.
- `npx vite build` succeeds.
- Clicking a thumbnail selects it; a third selection retires the oldest.
- **Compare A/B** fills both slots and activates A; `` ` `` then flips between the two findings.
- **Breed** opens the grid seeded from the selected finding.
- `stash` never disturbs live state and never leaks `id` / `note` / `thumb` into a slot.
- Deleting a selected finding does not leave a stale id behind.
- No console errors.

## Follow-up worth noting

This closes the gap `docs/VISION.md` §4 opens between "capture" and "comparison": kept findings are now first-class comparison inputs rather than a write-only archive. Update the capability inventory in the appendix in the same commit as your last task. If comparing old findings turns out to be what people actually do, that is evidence for question 1 in §9 — record it there.
