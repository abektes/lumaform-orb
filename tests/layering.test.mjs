// Guards the stacking contract. The grid HUD once painted over the engine
// dropdown because two subtrees were ordered against different, undocumented
// scales; naming them is only half a fix if a raw number can still be added.
import { readAllCss } from './css-source.mjs';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const css = readAllCss();

// --- the scale is declared ---
const scale = {};
for (const m of css.matchAll(/--z-([a-z-]+):\s*(-?\d+);/g)) scale[m[1]] = Number(m[2]);

const REQUIRED = [
  'canvas', 'ui-root', 'zen-pill', 'dialog', 'modal',
  'overlay-hud', 'overlay-caption', 'overlay-readout', 'overlay-clip',
  'panel-stats', 'panel-inspector', 'panel-topbar', 'panel-dock', 'panel-dropdown',
];
const missing = REQUIRED.filter((k) => !(k in scale));
ok('every layer is named', missing.length === 0, missing.join(', '));

// --- body-level order: canvas < root < zen pill < dialog < modal ---
const bodyOrder = ['canvas', 'ui-root', 'zen-pill', 'dialog', 'modal'];
ok('body-level order is strictly increasing', bodyOrder.every((k, i) =>
  i === 0 || scale[k] > scale[bodyOrder[i - 1]]),
  bodyOrder.map((k) => `${k}=${scale[k]}`).join(' '));

// Overlay chrome and panel chrome are siblings inside the root. Every overlay
// token must stay below every panel token or the HUD covers the dropdown again.
const overlays = ['overlay-hud', 'overlay-caption', 'overlay-readout', 'overlay-clip'];
const panel = ['panel-stats', 'panel-inspector', 'panel-topbar', 'panel-dock', 'panel-dropdown'];
ok('every overlay token sits below every panel token',
  Math.max(...overlays.map((k) => scale[k])) < Math.min(...panel.map((k) => scale[k])));

ok('overlay order is strictly increasing', overlays.every((k, i) =>
  i === 0 || scale[k] > scale[overlays[i - 1]]));
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
// position:fixed inside the root works only while no ancestor has a
// transform, filter or backdrop-filter. This file uses backdrop-filter freely,
// so the first one applied to the root would silently re-anchor all four
// overlays.
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
