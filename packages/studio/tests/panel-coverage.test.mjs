// Every engine must be reachable through every panel tab that claims to serve it.
//
// This exists because the Colors tab silently did nothing on 9 of 17 engines: the
// palette chips were keyed by parameter name (color1, color2, colorShell...) and
// guarded with `if (params[k] !== undefined)`, so an engine that named its colours
// anything else got a no-op with no error. Nothing failed, nothing logged, and the
// engine-catalog test still passed because the *schema* was fine — it was the UI's
// private map that was stale.
//
// The guards here are therefore about reachability, not appearance: does each tab
// have something to show, and does each control path actually write to the engine's
// own parameters? A control can be reachable and still be ugly; that stays a
// reviewer's job.

import { readFileSync } from 'node:fs';
import {
  ENGINE_INFO,
  ENGINE_PARAM_DEFINITIONS,
  ENGINE_TYPES,
  getDefaultEngineParams,
} from '../src/core/state.js';
import { PALETTES, PALETTE_KEYS, applyPalette, paletteTargets, isPaletteTarget } from '../src/core/palette.js';
import { listModulationTargets } from '../../orb/src/core/modulation.js';
import { listSweepableParams } from '../src/core/sweep.js';
import { inspectorLeaves } from '../src/ui/inspector-nav.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const root = new URL('../', import.meta.url);
const ui = readFileSync(new URL('src/ui/studio-ui.js', root), 'utf8');
const engines = Object.values(ENGINE_TYPES);
const hex = /^#[0-9a-f]{6}$/i;

// --- the tabs the panel offers -------------------------------------------------

// Kept in step with inspectorLeaves(); if the catalog drops a parameter section
// this test fails rather than quietly covering tabs the UI no longer has.
const PARAM_TABS = ['colors', 'geometry', 'motion'];
const list = inspectorLeaves();
ok('every parameter tab this test covers still exists in the UI',
  PARAM_TABS.every((t) => list.includes(t)),
  `ui has: ${list.join(', ')}`);

// --- Colors / Geometry / Motion tabs -------------------------------------------

// renderParamsSection filters the schema by `section` and shows an empty notice when
// nothing matches. An engine with an empty tab is not broken, but it is a design
// decision, so it has to be a deliberate one rather than an oversight.
for (const engine of engines) {
  const defs = ENGINE_PARAM_DEFINITIONS[engine] || {};
  const name = ENGINE_INFO[engine]?.name ?? engine;
  for (const tab of PARAM_TABS) {
    const keys = Object.keys(defs).filter((k) => defs[k].section === tab);
    ok(`${name} — ${tab} tab has controls`, keys.length > 0, `${keys.length} param(s)`);
  }
}

// --- Colors tab: the palette chips ---------------------------------------------

ok('every palette declares three ordered colours',
  PALETTE_KEYS.length > 0 && PALETTE_KEYS.every((k) => {
    const p = PALETTES[k];
    return p.colors.length === 3 && p.colors.every((c) => hex.test(c)) && !!p.label && !!p.title;
  }));

ok('the UI no longer carries its own palette map',
  !/cosmic:\s*\{\s*color1:/.test(ui),
  'a name-keyed map in studio-ui.js is the bug this test exists for');

for (const engine of engines) {
  const defs = ENGINE_PARAM_DEFINITIONS[engine] || {};
  const name = ENGINE_INFO[engine]?.name ?? engine;
  const targets = paletteTargets(defs);
  const colorKeys = Object.keys(defs).filter((k) => defs[k].type === 'color');

  ok(`${name} — has at least one palette-writable colour`,
    targets.length > 0,
    `${targets.length}/${colorKeys.length} colour params writable`);

  for (const key of PALETTE_KEYS) {
    const params = getDefaultEngineParams(engine);
    const patch = applyPalette(defs, params, key);
    const keys = Object.keys(patch);
    const applied = { ...params, ...patch };

    // Not "the patch is non-empty" — a palette whose colour an engine already uses
    // legitimately patches nothing. What must hold is that the targets end up
    // carrying the palette, whatever they started as.
    ok(`${name} — "${key}" palette reaches every writable colour`,
      targets.every((k, i) => applied[k] === PALETTES[key].colors[i % PALETTES[key].colors.length]));
    ok(`${name} — "${key}" writes only declared colour params`,
      keys.every((k) => isPaletteTarget(defs[k])));
    ok(`${name} — "${key}" writes only valid hex`,
      keys.every((k) => hex.test(patch[k])));
    ok(`${name} — "${key}" leaves structural colours alone`,
      Object.keys(defs)
        .filter((k) => defs[k].paletteRole === 'fixed')
        .every((k) => !(k in patch)));
  }
}

// Applying a palette twice must be a no-op the second time: the patch reports only
// what changed, so a UI that re-renders on a non-empty patch would otherwise loop.
for (const engine of engines) {
  const defs = ENGINE_PARAM_DEFINITIONS[engine] || {};
  const params = getDefaultEngineParams(engine);
  Object.assign(params, applyPalette(defs, params, 'cosmic'));
  ok(`${ENGINE_INFO[engine]?.name ?? engine} — re-applying the same palette is a no-op`,
    Object.keys(applyPalette(defs, params, 'cosmic')).length === 0);
}

ok('an unknown palette key is ignored rather than throwing',
  Object.keys(applyPalette(ENGINE_PARAM_DEFINITIONS[engines[0]], {}, 'not-a-palette')).length === 0);

// --- Motion Lab tab -------------------------------------------------------------

// The rack needs a destination or the tab is inert. This is the same class of failure
// as the palette: the tab renders, but nothing in it can reach the engine.
for (const engine of engines) {
  const defs = ENGINE_PARAM_DEFINITIONS[engine] || {};
  const targets = listModulationTargets(defs);
  ok(`${ENGINE_INFO[engine]?.name ?? engine} — Motion Lab has a routable destination`,
    targets.length > 0, `${targets.length} target(s)`);
  ok(`${ENGINE_INFO[engine]?.name ?? engine} — no modulation target rebuilds geometry`,
    targets.every((t) => defs[t.key].section !== 'geometry'));
}

// --- Sweep (K) ------------------------------------------------------------------

for (const engine of engines) {
  const defs = ENGINE_PARAM_DEFINITIONS[engine] || {};
  ok(`${ENGINE_INFO[engine]?.name ?? engine} — has a sweepable parameter`,
    listSweepableParams(defs).length > 0);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
