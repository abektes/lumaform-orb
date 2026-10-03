// The engine menu lists every engine, and that list only grows. At 45 engines
// it rendered 3480px tall in a 768px window under a `body { overflow: hidden }`,
// so most engines could not be reached from it at all. The menu has to be
// bounded by the viewport and scroll inside itself.
import { readAllCss } from './css-source.mjs';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const css = readAllCss();
const rule = /\.engine-dropdown-menu\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const decl = (prop) => new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`).exec(rule)?.[1].trim();

ok('the menu rule exists', rule.length > 0);

const maxHeight = decl('max-height');
ok('the menu height is bounded by the viewport', !!maxHeight && /(vh|dvh|svh)/.test(maxHeight), `max-height: ${maxHeight}`);

ok('the menu scrolls inside itself', decl('overflow-y') === 'auto', `overflow-y: ${decl('overflow-y')}`);

// Without containment, reaching the end of the list hands the wheel to the page
// behind it, which reads as the menu being stuck.
ok('scrolling stops at the end of the list', decl('overscroll-behavior') === 'contain', `overscroll-behavior: ${decl('overscroll-behavior')}`);

// The UI is dark, and a browser-default scrollbar is a light slab.
ok('the scrollbar declares its own colours', !!decl('scrollbar-color'), `scrollbar-color: ${decl('scrollbar-color')}`);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
