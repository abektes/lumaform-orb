// Variation grid — breed orbs instead of tuning them.
//
// N live cells, each a mutation of the current config. Click one to promote it to
// the new parent and mutate again. Ten generations in you are somewhere no slider
// path would have taken you.
//
// Rendering: one WebGL context, one renderer, N scissored viewports. Each cell owns
// its own scene + engine instance so params are set once at mutation time rather
// than churned every frame — which matters because several engines rebuild geometry
// on param change. Total fragment cost stays close to a single full-screen render
// since each cell covers 1/N of the area.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  LFO_SHAPES,
  TIME_SCALE_DEST,
  createModulationRack,
  createDefaultModulation,
  listModulationTargets,
} from './modulation.js';

// --- colour jitter ---------------------------------------------------------

function hexToHsl(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// --- mutation --------------------------------------------------------------

// Mutate around `base` rather than jumping fully random — exploration wants a
// controllable radius so you can zoom in on a promising region.
//
// Only ever writes keys that exist in `defs`. randomizeState() in state.js writes
// `rotSpeedZW`, which no engine reads and no schema declares; a mutator that
// invented keys would multiply that class of bug by the number of cells.
export function mutateParams(base, defs, radius = 0.25, sections = null) {
  const out = { ...base };
  const allowed = sections && sections.length ? new Set(sections) : null;

  for (const [key, def] of Object.entries(defs || {})) {
    if (allowed && !allowed.has(def.section)) continue;

    if (def.type === 'number') {
      const span = def.max - def.min;
      const jitter = (Math.random() * 2 - 1) * radius * span;
      const next = (typeof base[key] === 'number' ? base[key] : def.default) + jitter;
      const stepped = def.step ? Math.round(next / def.step) * def.step : next;
      out[key] = +Math.min(def.max, Math.max(def.min, stepped)).toFixed(4);
    } else if (def.type === 'color') {
      const hsl = hexToHsl(base[key] ?? def.default);
      if (!hsl) continue;
      out[key] = hslToHex(
        (hsl.h + (Math.random() * 2 - 1) * radius * 180 + 360) % 360,
        Math.min(100, Math.max(0, hsl.s + (Math.random() * 2 - 1) * radius * 60)),
        Math.min(95, Math.max(8, hsl.l + (Math.random() * 2 - 1) * radius * 40))
      );
    } else if (def.type === 'select' && Array.isArray(def.options)) {
      // Discrete jumps are what produce genuinely different characters, but they
      // shouldn't fire on every cell or the grid loses its family resemblance.
      if (Math.random() < radius) {
        out[key] = def.options[Math.floor(Math.random() * def.options.length)];
      }
    }
  }
  return out;
}


// --- patch mutation --------------------------------------------------------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const jitter = (amount) => (Math.random() * 2 - 1) * amount;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const MAX_ROUTES = 4;

// Breeding the *patch* is what makes the grid surprising. Mutating parameters
// alone gives nine orbs that differ in colour, size and speed but share one
// motion character, because the character now lives in the routing: which source
// drives what, and how hard. Swapping an LFO for noise, or moving a route from
// glow to tempo, changes what the orb *does* rather than how it looks.
export function mutatePatch(patch, destKeys, radius = 0.25) {
  const next = structuredClone(patch || createDefaultModulation());
  next.enabled = true;
  const sourceIds = Object.keys(next.sources || {});
  if (!sourceIds.length || !destKeys.length) return next;

  for (const src of Object.values(next.sources)) {
    if (src.type === 'lfo') {
      src.rate = clamp((src.rate ?? 0.5) + jitter(radius * 2), 0.02, 4);
      src.phase = ((src.phase ?? 0) + jitter(radius) + 1) % 1;
      if (Math.random() < radius) src.shape = pick(LFO_SHAPES);
    } else if (src.type === 'noise') {
      src.rate = clamp((src.rate ?? 0.35) + jitter(radius), 0.02, 2);
      if (Math.random() < radius * 0.5) src.octaves = 1 + Math.floor(Math.random() * 5);
    } else if (src.type === 'env') {
      src.attack = clamp((src.attack ?? 0.08) + jitter(radius * 0.5), 0, 1.5);
      src.decay = clamp((src.decay ?? 0.9) + jitter(radius), 0.05, 3);
    }
  }

  const routes = (next.routes || []).map((r) => ({ ...r }));
  for (const r of routes) {
    r.amount = clamp((r.amount ?? 0) + jitter(radius * 1.5), -1, 1);
    if (Math.random() < radius * 0.6) r.source = pick(sourceIds);
    if (Math.random() < radius * 0.6) r.dest = pick(destKeys);
  }

  if (routes.length < MAX_ROUTES && Math.random() < radius) {
    routes.push({ source: pick(sourceIds), dest: pick(destKeys), amount: jitter(1) });
  } else if (routes.length > 1 && Math.random() < radius * 0.5) {
    routes.splice(Math.floor(Math.random() * routes.length), 1);
  }

  // A cell with no routes has no character to judge, so always keep one.
  if (!routes.length) {
    routes.push({ source: pick(sourceIds), dest: pick(destKeys), amount: 0.5 });
  }

  next.routes = routes;
  return next;
}

// --- grid ------------------------------------------------------------------

export function createVariationGrid({
  renderer,
  engineFactory,
  engineType,
  baseParams,
  globalSettings,
  modulation,
  defs,
  cols = 3,
  rows = 3,
}) {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 7.5);
  camera.lookAt(0, 0, 0);

  const cells = [];
  let parent = { ...baseParams };
  let parentPatch = structuredClone(modulation || createDefaultModulation());

  // Destinations are the same for every cell (same engine), so resolve once.
  const destKeys = [TIME_SCALE_DEST, ...listModulationTargets(defs).map((t) => t.key)];

  // The engines' shaders emit linear colour and rely on OutputPass for tone
  // mapping and the sRGB conversion, so rendering a cell straight to the
  // framebuffer comes out several stops too dark. This composer is RenderPass +
  // OutputPass only — no bloom, which is a full-screen pass and would bleed
  // across cell boundaries — so it costs one extra clipped blit per cell.
  const cellComposer = new EffectComposer(renderer);
  const cellRenderPass = new RenderPass(new THREE.Scene(), camera);
  cellComposer.addPass(cellRenderPass);
  cellComposer.addPass(new OutputPass());

  function buildCell(params, patch) {
    const scene = new THREE.Scene();
    const engine = engineFactory({
      studio: null,
      scene,
      camera,
      renderer,
      composer: null,
      pointerTracker: { pointer: new THREE.Vector2(0, 0) },
      params,
      global: globalSettings,
    });
    if (typeof engine.setParams === 'function') engine.setParams(params);
    else if (typeof engine.onParamsChange === 'function') engine.onParamsChange(params);
    return {
      scene,
      engine,
      params,
      modulation: patch,
      rack: createModulationRack(patch),
      // Each cell integrates its own clock so a route onto tempo actually reads
      // as hesitation. All cells start at 0 on populate(), so equal wall time has
      // elapsed for each and the comparison stays honest.
      time: 0,
      lastMod: {},
      selected: false,
    };
  }

  // Same contract as the studio's applyModulatedParams: push only what changed,
  // and restore base explicitly when a route stops driving a key.
  function pushCellParams(cell, modulated) {
    const patchOut = {};
    let dirty = false;
    for (const [key, value] of Object.entries(modulated)) {
      if (cell.lastMod[key] === undefined || Math.abs(cell.lastMod[key] - value) > 1e-4) {
        patchOut[key] = value;
        dirty = true;
      }
    }
    for (const key of Object.keys(cell.lastMod)) {
      if (modulated[key] === undefined && cell.params[key] !== undefined) {
        patchOut[key] = cell.params[key];
        dirty = true;
      }
    }
    cell.lastMod = { ...modulated };
    if (!dirty) return;
    if (typeof cell.engine.setParams === 'function') cell.engine.setParams(patchOut);
    else if (typeof cell.engine.onParamsChange === 'function') cell.engine.onParamsChange(patchOut);
  }

  function disposeCell(cell) {
    cell.engine?.dispose?.();
    cell.scene?.clear?.();
  }

  function populate(radius, sections) {
    for (const cell of cells) disposeCell(cell);
    cells.length = 0;
    const count = cols * rows;
    // When the mutation is locked to a section, only breed the patch if motion is
    // in scope — otherwise "colours only" would still change how the orb moves.
    const breedPatch = !sections || sections.includes('motion');
    for (let i = 0; i < count; i++) {
      // Cell 0 is the unmutated parent, so you always have the reference in frame.
      const params = i === 0 ? { ...parent } : mutateParams(parent, defs, radius, sections);
      const patch =
        i === 0 || !breedPatch
          ? structuredClone(parentPatch)
          : mutatePatch(parentPatch, destKeys, radius);
      cells.push(buildCell(params, patch));
    }
  }

  // Marked cells get a border drawn as four scissored clears — cheaper than a DOM
  // overlay and it stays in sync with the cell rects automatically.
  const ORIGIN = new THREE.Vector2(0, 0);
  const MARK_COLOR = new THREE.Color(0xffed00);
  const prevClear = new THREE.Color();

  function drawCellBorder(x, y, w, h, thickness = 3) {
    renderer.getClearColor(prevClear);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(MARK_COLOR, 1);
    const strips = [
      [x, y, w, thickness],
      [x, y + h - thickness, w, thickness],
      [x, y, thickness, h],
      [x + w - thickness, y, thickness, h],
    ];
    for (const [sx, sy, sw, sh] of strips) {
      renderer.setScissor(sx, sy, sw, sh);
      renderer.setViewport(sx, sy, sw, sh);
      renderer.clear(true, false, false);
    }
    renderer.setClearColor(prevClear, prevAlpha);
  }

  function cellRect(index, width, height) {
    const w = Math.floor(width / cols);
    const h = Math.floor(height / rows);
    const cx = index % cols;
    const cy = Math.floor(index / cols);
    // WebGL viewport origin is bottom-left; cells are laid out top-left.
    return { x: cx * w, y: height - (cy + 1) * h, w, h };
  }

  return {
    cells,
    get parent() {
      return parent;
    },
    populate,

    render(time, delta, width, height) {
      cellComposer.setSize(width, height);
      renderer.setScissorTest(true);
      camera.aspect = width / cols / (height / rows);
      camera.updateProjectionMatrix();

      for (let i = 0; i < cells.length; i++) {
        const { x, y, w, h } = cellRect(i, width, height);
        renderer.setViewport(x, y, w, h);
        renderer.setScissor(x, y, w, h);
        // Cells share a start time and a delta, so they stay comparable; each one
        // then applies its own patch, which is what lets a tempo route read as
        // hesitation rather than as a random phase offset.
        const cell = cells[i];
        const m = cell.rack.apply(cell.params, defs, cell.time);
        pushCellParams(cell, m.params);
        cell.time += delta * m.timeScale;

        cell.engine?.update?.({
          time: cell.time,
          delta: delta * m.timeScale,
          pointer: ORIGIN,
          marchQuality: 0.7,
          fps: 60,
        });
        // Scissor clips every pass to this cell, so the composer's full-screen
        // quads only ever touch the current rect.
        cellRenderPass.scene = cells[i].scene;
        cellComposer.render();

        if (cells[i].selected) drawCellBorder(x, y, w, h);
      }

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
    },

    hitTest(clientX, clientY, width, height) {
      const cx = Math.floor(clientX / (width / cols));
      const cy = Math.floor(clientY / (height / rows));
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return -1;
      const index = cy * cols + cx;
      return index < cells.length ? index : -1;
    },

    promote(index) {
      if (!cells[index]) return null;
      parent = { ...cells[index].params };
      parentPatch = structuredClone(cells[index].modulation);
      return { params: { ...parent }, modulation: structuredClone(parentPatch) };
    },

    // Fire every cell's envelope at once so attack shapes can be compared.
    triggerEnvelopes() {
      for (const cell of cells) cell.rack.trigger(cell.time);
    },

    toggleSelect(index) {
      if (!cells[index]) return false;
      cells[index].selected = !cells[index].selected;
      return cells[index].selected;
    },

    getSelected() {
      return cells
        .filter((c) => c.selected)
        .map((c) => ({ params: { ...c.params }, modulation: structuredClone(c.modulation) }));
    },

    exportSelected() {
      const selected = cells.filter((c) => c.selected);
      const chosen = selected.length ? selected : cells;
      return chosen.map((c) => ({
        engine: engineType,
        global: { ...globalSettings },
        params: { ...c.params },
        modulation: structuredClone(c.modulation),
      }));
    },

    dispose() {
      for (const cell of cells) disposeCell(cell);
      cells.length = 0;
      cellComposer.dispose();
    },
  };
}
