// The export format carries a version, and old files still load.
//
// Why this exists before anything is published: VISION §3 says the export format
// is a lab notebook that will be redesigned around named states once exploration
// has produced a vocabulary. The moment a runtime package ships, people build on
// the current shape, and that redesign becomes a breaking change instead of a
// migration.
//
// A version field plus a migration chain makes the redesign reversible. The
// v0→v1 migration is deliberately a no-op — establishing the mechanism costs
// nothing today and cannot be added cheaply later, because by then there are
// unversioned files in the wild whose shape you can only guess at.

import {
  CONFIG_VERSION,
  migrateConfig,
  stampVersion,
  parseConfigFile,
  readConfig,
} from '../src/core/config-io.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ENGINES = ['tesseract', 'quantum'];
const DEFS = {
  edgeGlow: { type: 'number', label: 'Edge Luma', min: 0, max: 3, step: 0.05, default: 1.2, section: 'colors' },
  color1: { type: 'color', label: 'Primary', default: '#ffed00', section: 'colors' },
};

// A real pre-versioning export: exactly what exportConfig() emitted before this
// change. Frozen here on purpose — if the shape drifts, files already on disk
// still look like this and must keep loading.
const LEGACY = {
  engine: 'quantum',
  global: { bloomStrength: 0.9, exposure: 1.1 },
  params: { edgeGlow: 2.4, color1: '#00ff88' },
  modulation: { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.5 }] },
};

// --- the constant ----------------------------------------------------------
ok('CONFIG_VERSION is a positive integer', Number.isInteger(CONFIG_VERSION) && CONFIG_VERSION >= 1,
  String(CONFIG_VERSION));

// --- stampVersion ----------------------------------------------------------
const stamped = stampVersion({ engine: 'quantum', params: {} });
ok('stampVersion writes the current version', stamped.version === CONFIG_VERSION);
ok('stampVersion preserves the other fields', stamped.engine === 'quantum');
ok('stampVersion does not mutate its argument', (() => {
  const input = { engine: 'quantum', params: {} };
  stampVersion(input);
  return input.version === undefined;
})());

// --- migrating an unversioned config ---------------------------------------
let m = migrateConfig(LEGACY);
ok('an unversioned config migrates', m.ok === true, m.error || '');
ok('it comes out at the current version', m.config.version === CONFIG_VERSION);
ok('migration preserves params', eq(m.config.params, LEGACY.params));
ok('migration preserves global', eq(m.config.global, LEGACY.global));
ok('migration preserves modulation', eq(m.config.modulation, LEGACY.modulation));
ok('migration does not mutate the input', LEGACY.version === undefined);

// --- an already-current config is left alone -------------------------------
m = migrateConfig({ ...LEGACY, version: CONFIG_VERSION });
ok('a current-version config migrates cleanly', m.ok === true);
ok('a current-version config is unchanged', eq(m.config.params, LEGACY.params));

// --- a config from the future is refused, loudly ---------------------------
// Silently half-loading a file whose shape you do not understand is the failure
// this guards: the orb would render, look subtly wrong, and give no clue why.
const future = CONFIG_VERSION + 1;
m = migrateConfig({ ...LEGACY, version: future });
ok('a future version is rejected', m.ok === false);
ok('the error names the version it saw', typeof m.error === 'string' && m.error.includes(String(future)),
  m.error || '');
ok('the error names the version we understand',
  typeof m.error === 'string' && m.error.includes(String(CONFIG_VERSION)), m.error || '');

// --- malformed versions are refused ----------------------------------------
for (const bad of ['1', 1.5, -1, null, {}, []]) {
  const result = migrateConfig({ ...LEGACY, version: bad });
  ok(`rejects version ${JSON.stringify(bad)}`, result.ok === false, result.error || '');
}

// --- parseConfigFile runs the chain ----------------------------------------
let r = parseConfigFile(JSON.stringify(LEGACY), ENGINES);
ok('parseConfigFile accepts a legacy file', r.ok === true, r.error || '');
ok('parseConfigFile returns it versioned', r.configs[0].version === CONFIG_VERSION);

r = parseConfigFile(JSON.stringify({ ...LEGACY, version: future }), ENGINES);
ok('parseConfigFile rejects a future file', r.ok === false);
ok('parseConfigFile surfaces the version error', typeof r.error === 'string' && r.error.includes(String(future)),
  r.error || '');

// --- grid arrays are versioned per entry -----------------------------------
// The grid writes an array, and a hand-edited notebook can legitimately hold a
// mix — one cell re-exported after an upgrade, the rest older.
const mixed = JSON.stringify([
  LEGACY,
  { ...LEGACY, version: CONFIG_VERSION, params: { edgeGlow: 1 } },
]);
r = parseConfigFile(mixed, ENGINES);
ok('a mixed-version array is accepted', r.ok === true, r.error || '');
ok('every entry comes out versioned',
  r.ok && r.configs.every((c) => c.version === CONFIG_VERSION));

r = parseConfigFile(JSON.stringify([LEGACY, { ...LEGACY, version: future }]), ENGINES);
ok('one future entry rejects the whole array', r.ok === false);

// --- version does not leak into state --------------------------------------
// It is file metadata, not a parameter. Same treatment as mutatedKeys.
const applied = parseConfigFile(JSON.stringify(LEGACY), ENGINES);
const record = readConfig(applied.configs[0], DEFS);
ok('version is not carried into the params', record.params.version === undefined);
ok('version is not carried onto the record', record.version === undefined);
ok('the config still read', record.params.edgeGlow === 2.4);

// --- round trip ------------------------------------------------------------
const roundTripped = parseConfigFile(JSON.stringify(stampVersion(LEGACY)), ENGINES);
ok('a freshly stamped export re-imports', roundTripped.ok === true, roundTripped.error || '');
ok('round trip preserves params', roundTripped.ok && eq(roundTripped.configs[0].params, LEGACY.params));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
