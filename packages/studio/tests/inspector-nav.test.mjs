// The inspector is three jobs, not eleven equal tabs. This file locks the
// catalog and the bounce rule so a later split cannot flatten the strip again.

import { readFileSync } from 'node:fs';
import {
  INSPECTOR_MODES,
  INSPECTOR_MODE_ORDER,
  inspectorLeaves,
  modeForLeaf,
  defaultLeafForMode,
  resolveLeaf,
  rememberSection,
  leafForModeSwitch,
} from '../src/ui/inspector-nav.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

ok('Library, Tune, and Ship are the only modes, in that order',
  INSPECTOR_MODE_ORDER.join(',') === 'library,tune,ship'
    && INSPECTOR_MODE_ORDER.every((id) => INSPECTOR_MODES[id]?.id === id));

ok('Library holds presets, findings, and rehearsal',
  INSPECTOR_MODES.library.sections.map((s) => s.id).join(',') === 'presets,findings,rehearsal');

ok('Tune’s front row is the schema plus optics and space — not Motion Lab',
  INSPECTOR_MODES.tune.sections.map((s) => s.id).join(',') === 'colors,geometry,motion,optics,space'
    && INSPECTOR_MODES.tune.secondary?.id === 'motionlab');

ok('Ship keeps Export and Perf as panel destinations',
  INSPECTOR_MODES.ship.sections.map((s) => s.id).join(',') === 'export,perf');

ok('every leaf resolves to exactly one mode',
  inspectorLeaves().every((leaf) => modeForLeaf(leaf) !== undefined)
    && modeForLeaf('presets') === 'library'
    && modeForLeaf('colors') === 'tune'
    && modeForLeaf('motionlab') === 'tune'
    && modeForLeaf('export') === 'ship');

ok('an unknown ?tab= falls back to presets', resolveLeaf('not-a-tab') === 'presets');
ok('a known ?tab= is kept', resolveLeaf('optics') === 'optics');

ok('switching mode restores the last leaf in that mode', (() => {
  let last = {
    library: defaultLeafForMode('library'),
    tune: defaultLeafForMode('tune'),
    ship: defaultLeafForMode('ship'),
  };
  last = rememberSection(last, 'tune', 'space');
  last = rememberSection(last, 'library', 'findings');
  return leafForModeSwitch(last, 'tune') === 'space'
    && leafForModeSwitch(last, 'library') === 'findings'
    && leafForModeSwitch(last, 'ship') === 'export';
})());

ok('Motion Lab is a remembered Tune destination, not a mode of its own', (() => {
  const last = rememberSection({
    library: 'presets',
    tune: 'colors',
    ship: 'export',
  }, 'tune', 'motionlab');
  return leafForModeSwitch(last, 'tune') === 'motionlab'
    && modeForLeaf(leafForModeSwitch(last, 'tune')) === 'tune';
})());

const root = new URL('../', import.meta.url);
const shell = readFileSync(new URL('src/ui/studio-shell.js', root), 'utf8');
const ui = readFileSync(new URL('src/ui/studio-ui.js', root), 'utf8');

ok('the shell builds modes from the catalog, not a handwritten strip',
  /INSPECTOR_MODE_ORDER/.test(shell) && /mode-btn/.test(shell) && /tab-lab/.test(shell));

ok('the top-bar Export opens the Ship destination rather than a private tab assignment',
  /setInspectorDestination\(\s*['"]export['"]/.test(ui));

ok('render() still only rewrites inspector content',
  /this\.inspectorContent\.innerHTML\s*=\s*this\.renderTabContent\(\)/.test(ui));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
