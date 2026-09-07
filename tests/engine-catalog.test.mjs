import { readdirSync, readFileSync } from 'node:fs';
import {
  ENGINE_CATALOG,
  ENGINE_INFO,
  ENGINE_PARAM_DEFINITIONS,
  ENGINE_TYPES,
  getDefaultEngineParams,
  getDefaultPresetName,
} from '../src/core/engine-catalog.js';
import { createInitialState } from '../src/core/state.js';
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

const HELPER_ENGINE_FILES = new Set([
  'curl-drift-field.js',
  'murmuration-simulation.js',
  'tesseract-projection.js',
]);

const liveEngineFiles = readdirSync(new URL('src/engines', root))
  .filter((name) => name.endsWith('-engine.js'));

ok('main.js registers from the catalog, not a hand-written factory list',
  main.includes('registerAllEngines(studio)')
    && !main.includes('studio.registerEngine('));

ok('every catalog id is unique',
  new Set(ENGINE_CATALOG.map((entry) => entry.id)).size === ENGINE_CATALOG.length);

ok('ENGINE_TYPES is derived from the catalog',
  Object.values(ENGINE_TYPES).length === ENGINE_CATALOG.length
    && ENGINE_CATALOG.every((entry) => ENGINE_TYPES[entry.key] === entry.id));

for (const entry of ENGINE_CATALOG) {
  const { id } = entry;
  ok(`${id} catalog entry is complete`,
    !!entry.key
      && !!entry.name
      && !!entry.badge
      && !!entry.description
      && !!entry.defaultPreset
      && !!entry.file
      && !!entry.factoryName
      && typeof entry.factory === 'function'
      && entry.params
      && Object.keys(entry.params).length > 0);

  ok(`${id} info and schema are derived from the same entry`,
    ENGINE_INFO[id]?.name === entry.name
      && ENGINE_PARAM_DEFINITIONS[id] === entry.params);

  const bag = state.engines[id];
  const defs = entry.params;
  ok(`${id} initial bag is derived from schema defaults`,
    !!bag
      && Object.keys(defs).every((key) => bag[key] === defs[key].default)
      && Object.keys(bag).every((key) => key in defs)
      && JSON.stringify(getDefaultEngineParams(id)) === JSON.stringify(bag));

  ok(`${id} default preset name comes from the catalog`,
    getDefaultPresetName(id) === entry.defaultPreset);

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
  ok(`${id} schema fields are complete and bounded`, schemaValid);
  ok(`${id} exposes a safe modulation target`,
    listModulationTargets(defs).length > 0);

  const source = readFileSync(new URL(`src/engines/${entry.file}`, root), 'utf8');
  ok(`${id} factory file exports ${entry.factoryName}`,
    source.includes(`export function ${entry.factoryName}`));

}

ok('every live engine file is in the catalog or an explicit helper',
  liveEngineFiles.every((file) => (
    HELPER_ENGINE_FILES.has(file)
      || ENGINE_CATALOG.some((entry) => entry.file === file)
  )));

ok('the catalog does not point at a missing engine file',
  ENGINE_CATALOG.every((entry) => liveEngineFiles.includes(entry.file)));

ok('every preset targets a catalogued engine',
  PRESET_LIBRARY.every((preset) => ENGINE_CATALOG.some((entry) => entry.id === preset.engine)));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
