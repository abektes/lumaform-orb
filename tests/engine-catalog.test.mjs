import { readFileSync } from 'node:fs';
import {
  ENGINE_INFO,
  ENGINE_PARAM_DEFINITIONS,
  ENGINE_TYPES,
  createInitialState,
} from '../src/core/state.js';
import { listModulationTargets } from '../src/core/modulation.js';
import { PRESET_LIBRARY } from '../src/presets/preset-library.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const root = new URL('../', import.meta.url);
const main = readFileSync(new URL('src/main.js', root), 'utf8');
const state = createInitialState();
const sections = new Set(['geometry', 'motion', 'colors']);
const colorPattern = /^#[0-9a-f]{6}$/i;

const NEW_ENGINES = [
  'aqueous',
  'curldrift',
  'murmuration',
  'filament',
  'prismbloom',
  'coronaveil',
  'echorings',
  'mycelium',
];

ok('all eight new engines are in the catalog',
  NEW_ENGINES.every((id) => Object.values(ENGINE_TYPES).includes(id)));

for (const engine of Object.values(ENGINE_TYPES)) {
  const info = ENGINE_INFO[engine];
  const defs = ENGINE_PARAM_DEFINITIONS[engine];
  const bag = state.engines[engine];
  ok(`${engine} has designer-facing metadata`,
    !!info?.name && !!info?.badge && !!info?.description);
  ok(`${engine} has a parameter schema`, !!defs && Object.keys(defs).length > 0);
  ok(`${engine} has an initial parameter bag`, !!bag);
  if (!defs || !bag) continue;

  ok(`${engine} defaults exactly match its schema`,
    Object.keys(defs).every((key) => bag[key] === defs[key].default)
      && Object.keys(bag).every((key) => key in defs));

  let schemaValid = true;
  for (const def of Object.values(defs)) {
    if (!sections.has(def.section) || !def.label) schemaValid = false;
    if (def.type === 'number') {
      if (
        !Number.isFinite(def.min)
        || !Number.isFinite(def.max)
        || !Number.isFinite(def.step)
        || !Number.isFinite(def.default)
        || def.step <= 0
        || def.min > def.default
        || def.max < def.default
      ) schemaValid = false;
    } else if (def.type === 'select') {
      if (!Array.isArray(def.options) || !def.options.includes(def.default)) schemaValid = false;
    } else if (def.type === 'color') {
      if (!colorPattern.test(def.default)) schemaValid = false;
    } else {
      schemaValid = false;
    }
  }
  ok(`${engine} schema fields are complete and bounded`, schemaValid);
  ok(`${engine} exposes a safe modulation target`,
    listModulationTargets(defs).length > 0);
}

for (const engine of NEW_ENGINES) {
  const constant = Object.entries(ENGINE_TYPES).find(([, id]) => id === engine)?.[0];
  const info = ENGINE_INFO[engine];
  const defs = ENGINE_PARAM_DEFINITIONS[engine];
  const preset = PRESET_LIBRARY.find((entry) => entry.engine === engine);
  const filename = {
    aqueous: 'aqueous',
    curldrift: 'curl-drift',
    murmuration: 'murmuration',
    filament: 'filament',
    prismbloom: 'prism-bloom',
    coronaveil: 'corona-veil',
    echorings: 'echo-rings',
    mycelium: 'mycelium',
  }[engine];
  const factory = {
    aqueous: 'createAqueousEngine',
    curldrift: 'createCurlDriftEngine',
    murmuration: 'createMurmurationEngine',
    filament: 'createFilamentEngine',
    prismbloom: 'createPrismBloomEngine',
    coronaveil: 'createCoronaVeilEngine',
    echorings: 'createEchoRingsEngine',
    mycelium: 'createMyceliumEngine',
  }[engine];

  ok(`${info.name} factory file exists and exports its factory`, (() => {
    const source = readFileSync(new URL(`src/engines/${filename}-engine.js`, root), 'utf8');
    return source.includes(`export function ${factory}`);
  })());
  ok(`${info.name} is imported and registered`,
    main.includes(`import { ${factory} }`)
      && main.includes(`studio.registerEngine(ENGINE_TYPES.${constant}, ${factory})`));
  ok(`${info.name} has a complete curated preset`,
    !!preset
      && Object.keys(defs).every((key) => key in preset.params)
      && Object.keys(preset.params).every((key) => key in defs));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
