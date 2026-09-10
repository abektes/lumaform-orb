// User-typed text must not reach innerHTML unescaped.
//
// Custom preset names are typed into an input, persisted to localStorage, and
// interpolated into the Presets tab markup. They were the one user-controlled
// string in the panel that skipped escapeHtml — findings notes two functions
// away in the same file already used it. Two failures came out of that:
//
//   1. self-XSS — a name containing a tag executes when the tab renders.
//   2. a plain functional break — a name containing a double quote closes
//      data-load-custom early, so the preset can never be loaded or deleted.
//
// The second is why this test asserts a round-trip and not just the absence of
// angle brackets: escaping that loses the name is not a fix.

import { escapeHtml } from '../src/ui/studio-format.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

// renderPresetsTab calls loadSavedPresets(), which reads localStorage. Stub it
// before importing anything that might touch it at module scope.
const HOSTILE = 'My "Best" <b>Orb</b> & \'Co\'';
const STORAGE_KEY = 'lumaform_orb_custom_presets_v1'; // must match src/core/state.js
const store = new Map([
  [STORAGE_KEY, JSON.stringify([{ name: HOSTILE, engine: 'tesseract', global: {}, params: {} }])],
]);
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const { renderPresetsTab } = await import('../src/ui/studio-library.js');

const markup = renderPresetsTab.call({
  state: { engine: 'tesseract', activePresetName: null },
});

// --- the saved preset actually rendered -----------------------------------
// Without this the rest would pass vacuously on an empty custom-preset list.
ok('the hostile preset reached the markup', markup.includes(escapeHtml(HOSTILE)));

// --- nothing executable survives ------------------------------------------
ok('no raw <b> from a preset name', !markup.includes('<b>Orb</b>'));
ok('no raw script-capable tag from stored data', !/<\/?b>/.test(markup));

// --- attributes stay closed -----------------------------------------------
// The bug: data-load-custom="My "Best" ..." terminates at the second quote and
// the remainder becomes stray attributes. Extract the attribute and check it
// round-trips to exactly what the user typed.
function unescape(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

for (const attr of ['data-load-custom', 'data-delete-custom']) {
  const match = markup.match(new RegExp(`${attr}="([^"]*)"`));
  ok(`${attr} is present`, !!match);
  if (match) {
    ok(`${attr} round-trips the typed name`, unescape(match[1]) === HOSTILE,
      JSON.stringify(match[1]));
  }
}

// --- curated preset data is escaped too -----------------------------------
// Not a security issue — PRESET_LIBRARY is authored in this repo, not typed by
// a user. But 2 of the 83 curated entries carry a raw `&`, which emits
// technically-invalid HTML, and the escaping rule is easier to keep if it has
// no exceptions.
const bareAmpersands = [...markup.matchAll(/&(?!(?:amp|quot|lt|gt|#39);)/g)];
ok('no bare ampersand survives into the markup', bareAmpersands.length === 0,
  bareAmpersands.map((m) => markup.slice(m.index - 20, m.index + 20).trim()).join(' | '));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
