// The catalog ships data. It must not reach the engine factories.
//
// ENGINE_CATALOG carries every engine's param schema, so everyone imports it —
// a consumer reading `ENGINE_PARAM_DEFINITIONS` to build a settings panel, an
// embed that shows one engine, a test. When a catalog entry binds
// `factory: createTesseractEngine`, that import is static and real, and pulling
// a schema drags all 23 engines plus three.js geometry into the bundle.
//
// `sideEffects: false` cannot undo this. It lets a bundler drop modules with no
// observable effect; it does not let it drop a module whose export is named in
// a live binding. The fix has to be structural, so this test is structural:
// the catalog sources may not import from ../engines at all.
//
// Entries keep `factoryName` as a *string*. The engines barrel exports each
// factory under its engine id, so whoever wants a running engine pairs the two
// — and pays only for what it names.
import { readFileSync, readdirSync } from 'node:fs';
import { ENGINE_CATALOG } from '../src/engine-catalog.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const src = new URL('../src/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, src), 'utf8');

// --- the sources that make up the catalog ---

const catalogFiles = [
  'engine-catalog.js',
  ...readdirSync(new URL('catalog/', src))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `catalog/${f}`),
];

ok('found the catalog sources', catalogFiles.length >= 4, catalogFiles.join(', '));

for (const rel of catalogFiles) {
  const source = read(rel);

  // Strip comments so prose naming a factory does not count as an import.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  ok(`${rel} does not import from ../engines`,
    !/from\s+['"][^'"]*engines\//.test(code),
    (code.match(/from\s+['"][^'"]*engines\/[^'"]*['"]/g) || []).slice(0, 2).join(', '));

  ok(`${rel} declares no live factory binding`,
    !/\bfactory\s*:/.test(code),
    (code.match(/\bfactory\s*:.*/g) || []).slice(0, 2).join(', '));
}

// --- the shape entries actually carry ---

for (const entry of ENGINE_CATALOG) {
  ok(`${entry.id} names its factory as a string`,
    typeof entry.factoryName === 'string' && entry.factoryName.length > 0,
    String(entry.factoryName));

  ok(`${entry.id} carries no live factory`,
    entry.factory === undefined,
    typeof entry.factory);
}

// --- registering belongs to whoever wants engines running ---

// registerAllEngines binds all 23 by definition. Exporting it from the package
// root puts the whole engine layer one import away from every consumer, which
// is the same leak by another route.
const index = read('index.js');
ok('the package root does not export registerAllEngines',
  !/registerAllEngines/.test(index));

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
