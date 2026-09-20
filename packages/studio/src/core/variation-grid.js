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
import { stampVersion } from '@lumaform/orb';
import { LFO_SHAPES, TIME_SCALE_DEST, createModulationRack, createDefaultModulation, listModulationTargets } from '@lumaform/orb/internal';
import { cameraDistanceForRadius, DEFAULT_FRAME_RADIUS } from '@lumaform/orb/internal';
import { notifyParams } from '@lumaform/orb/internal';
import { isDrawableRect, readbackRegion, createMeasureQueue } from './grid-measure.js';

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

// Three changes per cell keeps a difference attributable while still letting
// the grid surprise you. Null restores the old change-everything behaviour.
export const DEFAULT_BREADTH = 3;

// The keys a mutation may touch, in definition order. An empty section list is
// intentionally the same as no lock for backwards compatibility; the HUD uses
// an unknown sentinel section when the user explicitly turns every section off.
export function eligibleKeys(defs, sections) {
  const allowed = sections && sections.length ? new Set(sections) : null;
  return Object.entries(defs || {})
    .filter(([, def]) => !allowed || allowed.has(def.section))
    .map(([key]) => key);
}

// Breadth controls how many parameters are considered; radius still controls
// how far each chosen parameter moves.
export function chooseMutationKeys(
  defs,
  { sections = null, breadth = null, rng = Math.random } = {}
) {
  const pool = eligibleKeys(defs, sections);
  if (breadth === null || breadth === undefined) return pool;

  // Invalid values must not accidentally restore change-everything behaviour.
  const finiteBreadth = Number.isFinite(breadth) ? Math.floor(breadth) : 0;
  const take = Math.max(0, Math.min(finiteBreadth, pool.length));
  if (take === pool.length) return pool;

  // Partial Fisher-Yates produces a uniform subset without consuming random
  // values for the tail that will never be used.
  const shuffled = [...pool];
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (shuffled.length - i));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, take);
}

// Mutate around `base` rather than jumping fully random — exploration wants a
// controllable radius so you can zoom in on a promising region.
//
// Only ever writes keys that exist in `defs`. The old randomize switch invented
// keys like `rotSpeedZW` that no engine read; a mutator that did the same would
// multiply that class of bug by the number of cells.
export function mutateParams(
  base,
  defs,
  radius = 0.25,
  sections = null,
  { keys = null, rng = Math.random } = {}
) {
  const out = { ...base };
  const allowed = sections && sections.length ? new Set(sections) : null;
  const selected = keys === null ? null : new Set(keys);

  for (const [key, def] of Object.entries(defs || {})) {
    if (allowed && !allowed.has(def.section)) continue;
    if (selected && !selected.has(key)) continue;

    if (def.type === 'number') {
      const span = def.max - def.min;
      const jitter = (rng() * 2 - 1) * radius * span;
      const next = (typeof base[key] === 'number' ? base[key] : def.default) + jitter;
      const stepped = def.step ? Math.round(next / def.step) * def.step : next;
      out[key] = +Math.min(def.max, Math.max(def.min, stepped)).toFixed(4);
    } else if (def.type === 'color') {
      const hsl = hexToHsl(base[key] ?? def.default);
      if (!hsl) continue;
      out[key] = hslToHex(
        (hsl.h + (rng() * 2 - 1) * radius * 180 + 360) % 360,
        Math.min(100, Math.max(0, hsl.s + (rng() * 2 - 1) * radius * 60)),
        Math.min(95, Math.max(8, hsl.l + (rng() * 2 - 1) * radius * 40))
      );
    } else if (def.type === 'select' && Array.isArray(def.options)) {
      // Discrete jumps are what produce genuinely different characters, but they
      // shouldn't fire on every cell or the grid loses its family resemblance.
      if (rng() < radius) {
        out[key] = def.options[Math.floor(rng() * def.options.length)];
      }
    }
  }
  return out;
}


// --- patch mutation --------------------------------------------------------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const jitter = (amount, rng) => (rng() * 2 - 1) * amount;
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

const MAX_ROUTES = 4;

// Breeding the *patch* is what makes the grid surprising. Mutating parameters
// alone gives nine orbs that differ in colour, size and speed but share one
// motion character, because the character now lives in the routing: which source
// drives what, and how hard. Swapping an LFO for noise, or moving a route from
// glow to tempo, changes what the orb *does* rather than how it looks.
export function mutatePatch(patch, destKeys, radius = 0.25, { rng = Math.random } = {}) {
  const next = structuredClone(patch || createDefaultModulation());
  next.enabled = true;
  const sourceIds = Object.keys(next.sources || {});
  if (!sourceIds.length || !destKeys.length) return next;

  for (const src of Object.values(next.sources)) {
    if (src.type === 'lfo') {
      src.rate = clamp((src.rate ?? 0.5) + jitter(radius * 2, rng), 0.02, 4);
      src.phase = ((src.phase ?? 0) + jitter(radius, rng) + 1) % 1;
      if (rng() < radius) src.shape = pick(LFO_SHAPES, rng);
    } else if (src.type === 'noise') {
      src.rate = clamp((src.rate ?? 0.35) + jitter(radius, rng), 0.02, 2);
      if (rng() < radius * 0.5) src.octaves = 1 + Math.floor(rng() * 5);
    } else if (src.type === 'env') {
      src.attack = clamp((src.attack ?? 0.08) + jitter(radius * 0.5, rng), 0, 1.5);
      src.decay = clamp((src.decay ?? 0.9) + jitter(radius, rng), 0.05, 3);
    }
  }

  const routes = (next.routes || []).map((r) => ({ ...r }));
  for (const r of routes) {
    r.amount = clamp((r.amount ?? 0) + jitter(radius * 1.5, rng), -1, 1);
    if (rng() < radius * 0.6) r.source = pick(sourceIds, rng);
    if (rng() < radius * 0.6) r.dest = pick(destKeys, rng);
  }

  if (routes.length < MAX_ROUTES && rng() < radius) {
    routes.push({
      source: pick(sourceIds, rng),
      dest: pick(destKeys, rng),
      amount: jitter(1, rng),
    });
  } else if (routes.length > 1 && rng() < radius * 0.5) {
    routes.splice(Math.floor(rng() * routes.length), 1);
  }

  // A cell with no routes has no character to judge, so always keep one.
  if (!routes.length) {
    routes.push({ source: pick(sourceIds, rng), dest: pick(destKeys, rng), amount: 0.5 });
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
  rng = Math.random,
  // World radius the engine occupies, so cells frame like the main view.
  frameRadius = DEFAULT_FRAME_RADIUS,
  // Optional. When supplied, populate() asks this for each cell's config instead
  // of breeding one. The sweep strip uses it to lay out a deterministic ramp;
  // omit it and the grid mutates exactly as before.
  cellFactory = null,
  // Optional. When supplied, it replaces the uniform lattice with arbitrary
  // per-cell rectangles. The scale ladder uses it to render one square viewport
  // per pixel size; omit it and cells tile the window exactly as before.
  rectFactory = null,
}) {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  // Same derivation as the main view, or a cell would crop differently from the
  // orb it was bred from and the comparison would be dishonest.
  camera.position.set(0, 0, cameraDistanceForRadius(frameRadius, 45));
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

  function buildCell(params, patch, { mutatedKeys = [], mutationBase = params } = {}) {
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
    notifyParams(engine, params);
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
      mutatedKeys: [...mutatedKeys],
      mutationBase: { ...mutationBase },
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
    notifyParams(cell.engine, patchOut);
  }

  function disposeCell(cell) {
    cell.engine?.dispose?.();
    cell.scene?.clear?.();
  }

  function populate(
    radius,
    sections,
    { breadth = DEFAULT_BREADTH, breedPatch = null, rng: populateRng = rng } = {}
  ) {
    for (const cell of cells) disposeCell(cell);
    cells.length = 0;
    const count = cols * rows;

    if (cellFactory) {
      for (let i = 0; i < count; i++) {
        const spec = cellFactory(i, count);
        cells.push(buildCell(spec.params, spec.patch ?? structuredClone(parentPatch)));
      }
      return;
    }

    // Null preserves the pre-toggle rule for API callers. The app passes a
    // boolean so patch breeding and parameter section locks are independent.
    const shouldBreedPatch = breedPatch === null
      ? (!sections || sections.includes('motion'))
      : breedPatch;
    for (let i = 0; i < count; i++) {
      // Cell 0 is the unmutated parent, so you always have the reference in frame.
      if (i === 0) {
        cells.push(buildCell(
          { ...parent },
          structuredClone(parentPatch),
          { mutationBase: parent }
        ));
        continue;
      }

      // One RNG stream flows through choosing, parameter mutation and patch
      // mutation. A seeded grid therefore reproduces complete cells, not just
      // their selected key names.
      const keys = chooseMutationKeys(defs, {
        sections,
        breadth,
        rng: populateRng,
      });
      const params = mutateParams(parent, defs, radius, sections, {
        keys,
        rng: populateRng,
      });
      const patch = shouldBreedPatch
        ? mutatePatch(parentPatch, destKeys, radius, { rng: populateRng })
        : structuredClone(parentPatch);
      const mutatedKeys = keys.filter((key) => params[key] !== parent[key]);
      cells.push(buildCell(params, patch, { mutatedKeys, mutationBase: parent }));
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

  // Reading pixels back is only valid while the drawing buffer holds this
  // frame, so measurement is a request fulfilled inside render() rather than a
  // method that samples whatever happens to be on screen when it is called.
  const measureQueue = createMeasureQueue();

  // Rect arrives in CSS pixels because that is what setViewport takes; the
  // framebuffer is in device pixels, so the readback has to scale by the same
  // ratio or it samples a corner of the cell and calls it the whole thing.
  function readCellPixels(x, y, w, h) {
    const gl = renderer.getContext();
    const dpr = renderer.getPixelRatio();
    // Device-pixel bounds derived by readbackRegion in grid-measure.js.
    const { px, py, pw, ph } = readbackRegion({ x, y, w, h }, dpr);
    const buffer = new Uint8Array(pw * ph * 4);
    // EffectComposer.render() restores the render target it was called with and
    // the final pass draws to screen, so the cell is already in the default
    // framebuffer. This stays as a cheap guard against a caller (or a future
    // pass) leaving a target bound — readPixels would otherwise sample it.
    renderer.setRenderTarget(null);
    gl.readPixels(px, py, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    return { buffer, dim: { w: pw, h: ph } };
  }

  function cellRect(index, width, height) {
    if (rectFactory) return rectFactory(index, width, height);
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

    // Fulfilled on the next render, with one RGBA buffer per cell in cell order.
    requestMeasure(callback) {
      // A second request before that render would otherwise drop the first
      // callback silently, and a Promise wrapped around it would never settle.
      // An empty array is the honest answer: nothing was measured.
      measureQueue.request(callback);
    },

    describeCell(index) {
      const cell = cells[index];
      if (!cell) return null;
      const mutatedKeys = [...(cell.mutatedKeys || [])];
      return {
        index,
        mutatedKeys,
        changes: mutatedKeys.map((key) => ({
          key,
          label: defs[key]?.label ?? key,
          from: cell.mutationBase[key],
          to: cell.params[key],
        })),
      };
    },

    render(_time, delta, width, height) {
      cellComposer.setSize(width, height);

      // Cells are not required to tile the window — the scale ladder centres five
      // small squares in their slots and leaves most of the frame untouched — and
      // the renderer preserves its drawing buffer between frames. Without a
      // full-frame clear the previous frame's pixels survive wherever no cell
      // paints, so the full-screen orb stays visible behind the ladder. Scissor
      // test off, or the clear would be clipped to the last cell's rect. The
      // renderer's own clear colour is the studio's to set; this only consumes it.
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      renderer.setScissorTest(false);
      renderer.clear(true, true, false);

      renderer.setScissorTest(true);

      for (let i = 0; i < cells.length; i++) {
        const rect = cellRect(i, width, height);
        // Non-drawable rects cannot render (see isDrawableRect in grid-measure.js).
        // Skip it, but contribute an empty buffer so the measurement array stays
        // aligned with cell order.
        if (!isDrawableRect(rect)) {
          if (measureQueue.isPending()) {
            measureQueue.collect({ buffer: new Uint8Array(0), rect, dim: { w: 0, h: 0 } });
          }
          continue;
        }
        const { x, y, w, h } = rect;
        // Per cell rather than once for the grid: identical for a uniform
        // lattice, and the only thing that makes a non-uniform one honest. A
        // shared aspect would stretch every cell that is not the average shape.
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
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

        // Read before the border: the mark is chrome, and a 3px 0xffed00 frame
        // baked into the sample would be reported as the orb's own legibility.
        if (measureQueue.isPending()) {
          const { buffer, dim } = readCellPixels(x, y, w, h);
          measureQueue.collect({ buffer, rect, dim });
        }
        if (cells[i].selected) drawCellBorder(x, y, w, h);
      }

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);

      measureQueue.flush();
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
      const description = this.describeCell(index);
      parent = { ...cells[index].params };
      parentPatch = structuredClone(cells[index].modulation);
      return {
        params: { ...parent },
        modulation: structuredClone(parentPatch),
        mutatedKeys: description.mutatedKeys,
      };
    },

    // Fire every cell's envelope at once so attack shapes can be compared.
    triggerEnvelopes() {
      for (const cell of cells) cell.rack.trigger(cell.time);
    },

    setAudioLevel(level) {
      for (const cell of cells) cell.rack.setAudioLevel(level);
    },

    toggleSelect(index) {
      if (!cells[index]) return false;
      cells[index].selected = !cells[index].selected;
      return cells[index].selected;
    },

    getSelected() {
      return cells
        .filter((c) => c.selected)
        .map((c) => ({
          params: { ...c.params },
          modulation: structuredClone(c.modulation),
          mutatedKeys: [...(c.mutatedKeys || [])],
        }));
    },

    exportSelected() {
      const selected = cells.filter((c) => c.selected);
      const chosen = selected.length ? selected : cells;
      return chosen.map((c) => stampVersion({
        engine: engineType,
        global: { ...globalSettings },
        params: { ...c.params },
        modulation: structuredClone(c.modulation),
        mutatedKeys: [...(c.mutatedKeys || [])],
      }));
    },

    dispose() {
      // A request made just before the grid goes away (grid exit, or an engine
      // switch that rebuilds it) never reaches a render(), so settle it here or
      // a Promise wrapping requestMeasure hangs for the rest of the session.
      measureQueue.settle();
      for (const cell of cells) disposeCell(cell);
      cells.length = 0;
      cellComposer.dispose();
    },
  };
}
