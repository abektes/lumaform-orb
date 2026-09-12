// The published surface, and the declarations that describe it.
//
// Two failures this prevents. A hand-written .d.ts drifts silently: the source
// is plain JS with no build step, so nothing but this connects the two, and a
// type file that lies is worse than none. And the barrel itself creeps — it was
// previously the studio's import list, which froze a pointer tracker and an fps
// meter as public API because one caller happened to need them.
//
// This compares names, not types. A name present in one file and absent from
// the other is the drift that actually happens; nothing here type-checks the
// declarations, and there is no TypeScript in this repo to do it with.
import { readFileSync } from 'node:fs';
import * as publicApi from '../src/index.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const dts = readFileSync(new URL('../index.d.ts', import.meta.url), 'utf8');

// --- what the module actually exports at runtime ---

const runtimeExports = Object.keys(publicApi).sort();
ok('the barrel exports something', runtimeExports.length > 0);

// --- what the declarations describe ---

const declared = new Set(
  [...dts.matchAll(/^export declare (?:function|const|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)]
    .map((m) => m[1])
);

for (const name of runtimeExports) {
  ok(`${name} is declared in index.d.ts`, declared.has(name));
}

for (const name of [...declared].sort()) {
  ok(`${name} is actually exported`, runtimeExports.includes(name),
    'declared but missing from the barrel');
}

// --- the barrel stays an API, not an import list ---

// These were on the root export and moved to ./internal. They are how the
// package is built, not what it is for, and a consumer reaching for them is a
// sign the real API is missing something.
const INTERNAL_ONLY = [
  'notifyParams', 'notifyPulse', 'notifyResize',
  'createPointerTracker', 'createClickPulse', 'createFpsTracker',
  'createModulationRack', 'listModulationTargets', 'engineFrameRadius',
  'cameraDistanceForRadius',
];
for (const name of INTERNAL_ONLY) {
  ok(`${name} is not on the public barrel`, !runtimeExports.includes(name));
}

// Engine factories must never reach the root export: that is the whole reason
// the catalog carries factoryName as a string.
const factoryLike = runtimeExports.filter((n) => /^create[A-Z]\w*Engine$/.test(n));
ok('no engine factory is exported from the root', factoryLike.length === 0, factoryLike.join(', '));

// --- the things a consumer cannot do without ---

for (const name of ['createOrb', 'OrbRuntime', 'parseConfigFile', 'readConfig', 'ENGINE_PARAM_DEFINITIONS']) {
  ok(`${name} is on the public barrel`, runtimeExports.includes(name));
}

ok('createOrb is callable', typeof publicApi.createOrb === 'function');

// --- the subpaths are declared in package.json ---

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const sub of ['.', './engines', './audio', './internal']) {
  ok(`package.json exports "${sub}"`, typeof pkg.exports?.[sub] === 'string');
}
ok('package.json points at the declarations', pkg.types === './index.d.ts');

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
