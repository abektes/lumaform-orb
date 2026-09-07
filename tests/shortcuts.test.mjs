import { readFileSync } from 'node:fs';
import {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  KNOWN_CODES,
  formatKey,
  shortcutsInGroup,
} from '../src/core/shortcuts.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

ok('registry is non-empty', SHORTCUTS.length > 0);
ok('every entry is well formed', SHORTCUTS.every((shortcut) =>
  typeof shortcut.code === 'string' && shortcut.code &&
  typeof shortcut.label === 'string' && shortcut.label &&
  ['any', 'single', 'grid'].includes(shortcut.context) &&
  SHORTCUT_GROUPS.includes(shortcut.group)));

const seen = new Map();
let clash = null;
for (const shortcut of SHORTCUTS) {
  const key = `${shortcut.code}:${shortcut.context}`;
  if (seen.has(key)) clash = key;
  seen.set(key, shortcut);
  const globalKey = `${shortcut.code}:any`;
  if (shortcut.context !== 'any' && seen.has(globalKey)) {
    clash = `${shortcut.code} bound both globally and in ${shortcut.context}`;
  }
  if (shortcut.context === 'any') {
    const specific = ['single', 'grid'].find((context) => seen.has(`${shortcut.code}:${context}`));
    if (specific) clash = `${shortcut.code} bound both globally and in ${specific}`;
  }
}
ok('no code is bound twice in one context', clash === null, clash || '');

ok('letters strip the KeyX prefix', formatKey('KeyR') === 'R');
ok('digits strip the DigitX prefix', formatKey('Digit1') === '1');
ok('backquote renders as a backtick', formatKey('Backquote') === '`');
ok('slash renders as the question mark you actually press', formatKey('Slash') === '?');
ok('space keeps its word', formatKey('Space') === 'Space');
ok('escape keeps its word', formatKey('Escape') === 'Esc');
ok('an unknown code passes through', formatKey('F13') === 'F13');

ok('every group has entries', SHORTCUT_GROUPS.every((group) => shortcutsInGroup(group).length > 0));
ok('grouping covers the whole registry',
  SHORTCUT_GROUPS.reduce((count, group) => count + shortcutsInGroup(group).length, 0) === SHORTCUTS.length);

// Both handlers intentionally use e.code literals. Scanning that common form
// makes an undocumented binding fail immediately without executing browser code.
const sources = ['src/main.js', 'src/ui/studio-ui.js'];
const bound = new Set();
for (const path of sources) {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  for (const match of text.matchAll(/e\.code\s*===\s*'([A-Za-z0-9]+)'/g)) {
    bound.add(match[1]);
  }
}
ok('the scan found the handlers at all', bound.size >= 15, `${bound.size} codes found`);

const missing = [...bound].filter((code) => !KNOWN_CODES.has(code)).sort();
ok('every bound key is documented', missing.length === 0,
  missing.length ? `undocumented: ${missing.join(', ')}` : '');

const stale = [...KNOWN_CODES].filter((code) => !bound.has(code)).sort();
ok('no documented key is unbound', stale.length === 0,
  stale.length ? `documented but not bound: ${stale.join(', ')}` : '');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
