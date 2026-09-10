// render() used to assign the entire chrome — topbar, dock, inspector — to
// panelLayer.innerHTML, then rebind six listener families. Overlays had to live
// in a second stacking wrapper so the wipe would not destroy them. This file
// locks the new update model: the shell is built once, tab content is the only
// rebuild, and overlayLayer is gone.

import { readFileSync } from 'node:fs';
import { readAllCss } from './css-source.mjs';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const root = new URL('../', import.meta.url);
const ui = readFileSync(new URL('src/ui/studio-ui.js', root), 'utf8');
const main = readFileSync(new URL('src/main.js', root), 'utf8');
const gridSession = readFileSync(new URL('src/ui/grid-session.js', root), 'utf8');
const abSession = readFileSync(new URL('src/ui/ab-session.js', root), 'utf8');
const css = readAllCss();

ok('StudioUI no longer exposes overlayLayer', !/\boverlayLayer\b/.test(ui));
ok('StudioUI no longer exposes panelLayer', !/\bpanelLayer\b/.test(ui));
ok('the shell is assigned once from shellMarkup()',
  /this\.root\.innerHTML\s*=\s*this\.shellMarkup\(\)/.test(ui)
    && (ui.match(/this\.root\.innerHTML\s*=/g) || []).length === 1);
ok('render() writes only inspector tab content',
  /this\.inspectorContent\.innerHTML\s*=\s*this\.renderTabContent\(\)/.test(ui));
ok('top-bar listeners bind once, not from render()',
  (ui.match(/attachTopBarListeners\(\)/g) || []).length === 2);
ok('session chrome hosts live on StudioUI',
  /this\.clipIndicator/.test(ui) && /this\.abReadout/.test(ui) && /this\.sweepCaption/.test(ui));

ok('main.js does not mount through overlayLayer', !/\boverlayLayer\b/.test(main));
ok('main.js wires sessions to the UI-owned chrome hosts',
  /ui\.clipIndicator/.test(main)
    && /createAbSession\(/.test(main)
    && /createGridSession\(/.test(main));
ok('A/B readout and sweep caption still mount on StudioUI hosts',
  /ui\.abReadout/.test(abSession) && /ui\.sweepCaption/.test(gridSession));
ok('the grid HUD still appends to the persistent root',
  /ui\.root\.appendChild\(gridHud\.element\)/.test(gridSession));

ok('the two-layer stacking wrappers are gone from CSS',
  !/\.studio-overlay-layer/.test(css) && !/\.studio-panel-layer/.test(css)
    && !/--z-layer-overlays/.test(css) && !/--z-layer-panel/.test(css));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
