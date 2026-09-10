// Every class in the markup either carries styling or should not be there.
//
// Thirteen classes were being emitted with no rule behind them. That is not
// merely untidy: .cp-delete-btn was one of them, and it rendered as a raw
// browser button (Arial, square, 2px border) on a dark panel for as long as
// nobody looked. A class that looks like a hook and isn't one hides real defects.
import { readFileSync, readdirSync } from 'node:fs';
import { readAllCss } from './css-source.mjs';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const root = new URL('../', import.meta.url);
const css = readAllCss();
const uiFiles = readdirSync(new URL('src/ui', root))
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(new URL(`src/ui/${f}`, root), 'utf8'));
const js = [...uiFiles, readFileSync(new URL('src/main.js', root), 'utf8')].join('\n');

// Strip comments so a class named only in prose does not count as a rule.
const cssNoComments = css
  .replace(/@import\s+[^;]+;/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const defined = new Set();
for (const m of cssNoComments.matchAll(/\.([a-zA-Z][\w-]*)/g)) defined.add(m[1]);

// Classes emitted from static class="..." attributes only. Template expressions
// are skipped: they are conditional and resolved at runtime.
const emitted = new Set();
for (const m of js.matchAll(/class="([^"$]*)"/g)) {
  for (const token of m[1].split(/\s+/)) if (token) emitted.add(token);
}
for (const m of js.matchAll(/className\s*=\s*'([^']+)'/g)) {
  for (const token of m[1].split(/\s+/)) if (token) emitted.add(token);
}

// Known-good exceptions, each with a reason.
const ALLOW_UNSTYLED = new Set([
  'hidden',   // utility, defined as .hidden — keep only if the rule really exists
]);

const unstyled = [...emitted].filter((c) => !defined.has(c) && !ALLOW_UNSTYLED.has(c)).sort();
ok('every emitted class has a CSS rule', unstyled.length === 0,
  unstyled.length ? unstyled.join(', ') : '');

// The reverse: a rule nobody can reach. Checked against the JS only — classes
// enter the document through markup strings, className or classList, and every
// one of those lives here. The CSS itself cannot be the reference corpus: a
// rule's own selector would always match and the check could never fire.
const allSrc = js;
const IGNORE_UNUSED = new Set([
  'shiki', 'shiki-fallback',   // applied by the dynamic Shiki import
  // State classes toggled via classList / conditional template expressions, so
  // they never appear inside a static class="..." attribute.
  'hidden', 'active', 'open', 'selected', 'playing', 'collapsed',
  'empty', 'paused', 'is-default', 'grid-mode', 'zen-hidden',
]);
const unreachable = [...defined]
  .filter((c) => !IGNORE_UNUSED.has(c) && !new RegExp(`['"\`\\s.]${c}['"\`\\s,:.{)]`).test(allSrc))
  .sort();
ok('no CSS rule is unreachable', unreachable.length === 0,
  unreachable.length ? unreachable.join(', ') : '');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
