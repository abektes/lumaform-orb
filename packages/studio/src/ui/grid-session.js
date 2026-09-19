import { ENGINE_PARAM_DEFINITIONS } from '../core/state.js';
import { listSweepableParams } from '../core/sweep.js';
import { frameMetrics, formatMetric, scaleRects } from '../core/scale-ladder.js';
import { normalizeSnapshot } from '../core/ab-compare.js';
import { createGridHud } from './grid-hud.js';
import {
  ALL_SECTIONS,
  BREADTH_OPTIONS,
  DEFAULT_BREADTH,
  NO_PARAM_SECTION,
} from './grid-hud-state.js';

const GRID_RADII = [0.12, 0.25, 0.45];

export function createGridSession({ studio, store, state, ui }) {
  const caption = ui.sweepCaption;
  let lastTouchedParam = null;
  let gridRadiusIndex = 1;
  const breadths = BREADTH_OPTIONS;
  let gridBreadth = DEFAULT_BREADTH;
  let gridSections = null;
  let gridBreedPatch = null;
  let gridHud = null;
  let markedPollId = null;
  let scalePollId = null;

  function showSweepCaption(info, metrics = null) {
    if (!info) {
      caption.classList.add('hidden');
      caption.innerHTML = '';
      return;
    }
    caption.classList.remove('hidden');
    // Values and metrics share one column template so a number always sits
    // under the rung it describes, however many rungs there are.
    const columns = `grid-template-columns: repeat(${info.values.length}, 1fr)`;
    caption.innerHTML =
      `<div class="sweep-title">${info.label}</div>` +
      `<div class="sweep-values" style="${columns}">` +
      info.values.map((value) => `<span>${value}</span>`).join('') +
      `</div>` +
      (metrics
        ? `<div class="sweep-values" style="${columns}">` +
          metrics
            .map((m) => `<span>${formatMetric(m.coverage)} / ${formatMetric(m.rms)}</span>`)
            .join('') +
          `</div>`
        : '');
  }

  // scaleInfo.values holds the *requested* sizes, but scaleRects clamps every
  // rung to its slot — on a 1024px window the 256px rung is really drawn at
  // 204px. The caption has to name the pixels that exist, not the ones that were
  // asked for: the metrics below each rung were measured from the clamped
  // viewport, and an instrument that misreports its own measurement is worse
  // than no instrument. The clamp itself is correct, so this only fixes the
  // label — rendered edge first because that is what the numbers describe, with
  // the requested size kept after the arrow so a clamped rung is visibly a
  // clamped rung rather than a different number silently substituted.
  function withRenderedSizes(info) {
    if (!info?.sizes) return info;
    const rects = scaleRects(info.sizes, window.innerWidth, window.innerHeight);
    return {
      ...info,
      values: info.sizes.map((size, index) => {
        const edge = rects[index]?.w ?? size;
        return edge === size ? `${size}px` : `${edge}px ↓${size}`;
      }),
    };
  }

  function downloadSelection() {
    const configs = studio.grid?.exportSelected();
    if (!configs?.length) return;
    const blob = new Blob([JSON.stringify(configs, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `orb-variations-${state.engine}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // Promoting a cell adopts both its look and its motion patch. Shared by the
  // grid and the sweep, which reuse the same pointer handling.
  function onPromote({ params, modulation }) {
    store.patchActiveEngine(params);
    if (modulation) store.setModulation(modulation);
  }

  function syncMarkedCount() {
    if (!gridHud || !studio.grid) return;
    gridHud.setMarked(studio.grid.cells.filter((cell) => cell.selected).length);
  }

  // Shared teardown for both cell-based views (the 3×3 grid and the sweep strip).
  // K can leave the grid and G can leave a sweep, so neither toggle may tear down
  // only its own chrome — the HUD and the caption both have to go whenever the
  // cells do, or one of them is left floating over the single-orb view.
  function exitView() {
    studio.exitGridMode();
    studio.setEngine(state.engine, state);
    ui.root.classList.remove('grid-mode');
    ui.render();

    clearInterval(markedPollId);
    markedPollId = null;
    clearInterval(scalePollId);
    scalePollId = null;
    gridHud?.destroy();
    gridHud = null;

    showSweepCaption(null);
  }

  function toggle() {
    if (studio.isGridMode) {
      exitView();
      return;
    }
    studio.onGridPromote = onPromote;
    studio.enterGridMode(state, {
      radius: GRID_RADII[gridRadiusIndex],
      sections: gridSections,
      breadth: gridBreadth,
      breedPatch: gridBreedPatch,
    });
    // Hide the inspector and dock — the sidebar covers the right-hand column and
    // a grid you can only see two thirds of is useless for comparison. The top
    // bar stays so the Grid button remains reachable to exit.
    ui.root.classList.add('grid-mode');
    ui.render();

    gridHud = createGridHud({
      initialRadius: GRID_RADII[gridRadiusIndex],
      initialSections: gridSections === null
        ? [...ALL_SECTIONS]
        : gridSections.includes(NO_PARAM_SECTION) ? [] : [...gridSections],
      initialBreadth: gridBreadth,
      initialBreedPatch: gridBreedPatch,
      onChange: ({ sections, radius, breadth, breedPatch }) => {
        gridRadiusIndex = Math.max(0, GRID_RADII.indexOf(radius));
        gridSections = sections;
        gridBreadth = breadth;
        gridBreedPatch = breedPatch;
        studio.reseedGrid({ radius, sections, breadth, breedPatch });
      },
      onReseed: () => studio.reseedGrid({}),
      onExport: () => downloadSelection(),
      onExit: () => toggle(),
    });
    ui.root.appendChild(gridHud.element);
    markedPollId = setInterval(syncMarkedCount, 200);
  }

  function toggleSweep() {
    if (studio.isGridMode) {
      exitView();
      return;
    }

    const defs = ENGINE_PARAM_DEFINITIONS[state.engine] || {};
    const candidates = listSweepableParams(defs);
    if (!candidates.length) {
      console.warn(`No sweepable parameters on engine "${state.engine}".`);
      return;
    }
    const key = candidates.some((candidate) => candidate.key === lastTouchedParam)
      ? lastTouchedParam
      : candidates[0].key;

    // A sweep reuses the grid's pointer handling, so a click promotes a cell.
    // Without this handler the click would only update the grid's internal parent
    // and the chosen ladder value would never reach state.
    studio.onGridPromote = onPromote;

    const info = studio.enterSweepMode(state, { paramKey: key, steps: 5 });
    if (!info) return;
    ui.root.classList.add('grid-mode');
    ui.render();
    showSweepCaption(info);
  }

  function toggleScale() {
    if (studio.isGridMode) {
      exitView();
      return;
    }

    // The ladder reuses the grid's pointer handling. Every cell holds the same
    // config, so a click promotes the config unchanged — harmless, and it keeps
    // one exit path rather than a special case that has to know about ladders.
    studio.onGridPromote = onPromote;

    const info = studio.enterScaleMode(state);
    if (!info) return;
    ui.root.classList.add('grid-mode');
    ui.render();
    showSweepCaption(withRenderedSizes(info));

    // Same cadence as the marked-cell poll. A readback stalls the GPU, so this
    // is five reads every 500 ms rather than five per frame — the numbers settle
    // within a second and nobody is watching them change. The labels are rebuilt
    // here too, so a resize that reclamps a rung corrects itself on the next tick.
    scalePollId = setInterval(() => {
      studio.grid?.requestMeasure((buffers) => {
        showSweepCaption(withRenderedSizes(info), buffers.map((buffer) => frameMetrics(buffer)));
      });
    }, 500);
  }

  function breedFinding(entry) {
    // Grid entry always seeds from live state, so first load the finding through
    // the same validating import path used by the shelf's Load action.
    const snapshot = normalizeSnapshot(entry);
    if (!snapshot || !state.engines[snapshot.engine]) return false;
    if (studio.isGridMode) exitView();
    if (!ui.importConfigText(JSON.stringify(snapshot))) return false;
    toggle();
    return studio.isGridMode;
  }

  return {
    mount() {
      document.addEventListener('input', (event) => {
        const key = event.target?.getAttribute?.('data-param');
        if (key) lastTouchedParam = key;
      }, true);
    },
    bind() {
      return {
        toggle,
        toggleSweep,
        toggleScale,
        breedFinding,
        onKey(e) {
          if (e.code === 'KeyK') {
            e.preventDefault();
            toggleSweep();
            return true;
          }
          if (e.code === 'KeyL') {
            e.preventDefault();
            toggleScale();
            return true;
          }
          if (e.code === 'KeyG') {
            e.preventDefault();
            toggle();
            return true;
          }
          if (!studio.isGridMode) return false;
          if (e.code === 'KeyM') {
            e.preventDefault();
            gridRadiusIndex = (gridRadiusIndex + 1) % GRID_RADII.length;
            studio.reseedGrid({ radius: GRID_RADII[gridRadiusIndex] });
            gridHud?.setRadius(GRID_RADII[gridRadiusIndex]);
            return true;
          }
          if (e.code === 'KeyB') {
            e.preventDefault();
            const index = breadths.indexOf(gridBreadth);
            gridBreadth = breadths[(index + 1) % breadths.length];
            studio.reseedGrid({ breadth: gridBreadth });
            gridHud?.setBreadth(gridBreadth);
            return true;
          }
          if (e.code === 'KeyT') {
            e.preventDefault();
            studio.grid.triggerEnvelopes();
            return true;
          }
          if (e.code === 'KeyE') {
            e.preventDefault();
            downloadSelection();
            return true;
          }
          return false;
        },
      };
    },
    dispose() {
      clearInterval(markedPollId);
      clearInterval(scalePollId);
      gridHud?.destroy();
    },
  };
}
