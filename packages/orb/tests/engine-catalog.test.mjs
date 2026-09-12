// Catalog integrity, checked inside the package that ships it.
//
// The catalog is the single list: types, display info, parameter schema and
// factory all derive from one entry per engine. When those drifted apart the
// failures were silent — the Colors tab did nothing on 9 of 17 engines because
// a private UI map had gone stale while the schema stayed fine.
//
// Assertions that need the studio (main.js wiring, the initial state bag, the
// preset library) live in packages/studio/tests/catalog-wiring.test.mjs. This
// file must not import anything outside packages/orb, or the runtime package
// grows a dependency on the studio.

import { readdirSync, readFileSync } from 'node:fs';
import {
  ENGINE_CATALOG,
  ENGINE_INFO,
  ENGINE_PARAM_DEFINITIONS,
  ENGINE_TYPES,
  getDefaultEngineParams,
  getDefaultPresetName,
} from '../src/engine-catalog.js';
import { listModulationTargets } from '../src/core/modulation.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const root = new URL('../', import.meta.url);
const sections = new Set(['geometry', 'motion', 'colors']);
const colorPattern = /^#[0-9a-f]{6}$/i;

// Shared maths that lives beside the engines but is not an engine.
const HELPER_ENGINE_FILES = new Set([
  'curl-drift-field.js',
  'murmuration-simulation.js',
  'tesseract-projection.js',
]);

const liveEngineFiles = readdirSync(new URL('src/engines', root))
  .filter((name) => name.endsWith('-engine.js'));

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
      && entry.params
      && Object.keys(entry.params).length > 0);

  ok(`${id} info and schema are derived from the same entry`,
    ENGINE_INFO[id]?.name === entry.name
      && ENGINE_PARAM_DEFINITIONS[id] === entry.params);

  const defs = entry.params;
  ok(`${id} defaults are derived from the schema`,
    Object.keys(defs).every((key) => getDefaultEngineParams(id)[key] === defs[key].default));

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

  ok(`${id} exposes a safe modulation target`, listModulationTargets(defs).length > 0);

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

// The generated barrel drifts the moment an engine is added without
// regenerating it, and a missing export fails only at a consumer's build.
const barrel = readFileSync(new URL('src/engines/index.js', root), 'utf8');
for (const entry of ENGINE_CATALOG) {
  ok(`${entry.id} is exported from engines/index.js`,
    barrel.includes(`export { ${entry.factoryName} as ${entry.id} }`));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
