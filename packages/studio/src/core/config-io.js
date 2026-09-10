// Loading exported configurations back in.
//
// Export writes { version, engine, global, params, modulation }, and the grid
// writes an array of those — that array is the notebook format, the thing you
// actually keep. Import has to accept both, restore the motion design as well as
// the look, and refuse to write junk into state.
//
// Pure: takes the engine list and the parameter schema as arguments rather than
// importing state.js, so it stays a leaf module and tests need no fixtures.

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// --- versioning ------------------------------------------------------------
//
// VISION §3 says this format will be redesigned around named states once
// exploration has produced a vocabulary. Without a version field that redesign
// breaks every file already on disk; with one it is a migration. The mechanism
// has to land before anything is published, because afterwards there are
// unversioned files in the wild whose shape can only be guessed at.

export const CONFIG_VERSION = 1;

// Ordered: MIGRATIONS[n] takes a config at version n and returns version n+1.
const MIGRATIONS = [
  // v0 → v1. No shape change — files written before versioning are already
  // v1-shaped, and this only makes that explicit. The no-op is the point: the
  // chain exists and is exercised, so the first real migration is a one-line
  // addition rather than a redesign of how loading works.
  (config) => ({ ...config, version: 1 }),
];

// Absent means "written before versioning existed", which is v0. Anything else
// that is not a non-negative integer is corrupt, not old.
function readVersion(config) {
  if (config?.version === undefined) return 0;
  const raw = config.version;
  return Number.isInteger(raw) && raw >= 0 ? raw : NaN;
}

export function stampVersion(config) {
  return { ...config, version: CONFIG_VERSION };
}

export function migrateConfig(config) {
  const from = readVersion(config);

  if (Number.isNaN(from)) {
    return {
      ok: false,
      error: `Invalid config version ${JSON.stringify(config.version)}. Expected a whole number, or no version field at all for a file exported before versioning.`,
    };
  }

  // Refusing is the whole point. A newer file may carry keys this build reads
  // with different meaning, so loading it anyway would render something subtly
  // wrong with nothing to explain why.
  if (from > CONFIG_VERSION) {
    return {
      ok: false,
      error: `This file was written by a newer version of Lumaform Orb (config version ${from}; this build understands up to ${CONFIG_VERSION}). Update, or re-export from the version that wrote it.`,
    };
  }

  let migrated = config;
  for (let version = from; version < CONFIG_VERSION; version++) {
    migrated = MIGRATIONS[version](migrated);
  }
  return { ok: true, config: migrated };
}

function validateConfig(config, validEngines) {
  if (!isPlainObject(config)) return 'Each config must be a JSON object.';
  if (!validEngines.includes(config.engine)) {
    return `Unknown engine "${config.engine}". Expected one of: ${validEngines.join(', ')}.`;
  }
  if (!isPlainObject(config.params)) return 'Each config needs a "params" object.';
  return null;
}

export function parseConfigFile(text, validEngines) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That is not valid JSON.' };
  }

  const raw = Array.isArray(parsed) ? parsed : [parsed];
  if (!raw.length) return { ok: false, error: 'The file contains no configs.' };

  // Migrate before validating. A future migration may well be what turns an old
  // file into something the schema recognises, so validating first would reject
  // files this build is capable of reading.
  //
  // Versions are per entry: a hand-kept notebook can legitimately hold one cell
  // re-exported after an upgrade alongside older ones.
  const configs = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) return { ok: false, error: 'Each config must be a JSON object.' };

    const migration = migrateConfig(entry);
    if (!migration.ok) return { ok: false, error: migration.error };

    const problem = validateConfig(migration.config, validEngines);
    if (problem) return { ok: false, error: problem };

    configs.push(migration.config);
  }
  return { ok: true, configs };
}

// Anything not in the schema is dropped rather than written through. A key the
// engine never reads would sit in state forever, silently doing nothing — the
// same failure mode as the old `rotSpeedZW` ghost key.
export function sanitizeParams(params, defs) {
  const out = {};
  const dropped = [];

  for (const [key, value] of Object.entries(params || {})) {
    const def = defs?.[key];
    if (!def) {
      dropped.push(key);
      continue;
    }

    if (def.type === 'number') {
      // Number(null), Number('') and Number([]) all coerce to 0 — accepting
      // them would silently turn junk into a legitimate value. Only real
      // numbers and non-empty numeric strings count.
      const numeric = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
      const num = numeric ? Number(value) : NaN;
      if (!Number.isFinite(num)) {
        dropped.push(key);
        continue;
      }
      const min = Number.isFinite(def.min) ? def.min : -Infinity;
      const max = Number.isFinite(def.max) ? def.max : Infinity;
      out[key] = Math.min(max, Math.max(min, num));
    } else if (def.type === 'select') {
      if (Array.isArray(def.options) && def.options.includes(value)) out[key] = value;
      else dropped.push(key);
    } else if (def.type === 'color') {
      if (typeof value === 'string' && HEX_COLOR.test(value)) out[key] = value;
      else dropped.push(key);
    } else {
      out[key] = value;
    }
  }

  return { params: out, dropped };
}

// Writes in place into the store-owned containers. Callers pass store.state.
export function applyConfig(state, config, defs) {
  const { params, dropped } = sanitizeParams(config.params, defs);

  state.engine = config.engine;
  if (isPlainObject(config.global)) Object.assign(state.global, config.global);

  if (!state.engines[config.engine]) state.engines[config.engine] = {};
  // Merge, don't replace: a partial config must not blank the keys it omits.
  Object.assign(state.engines[config.engine], params);

  // Absent on configs exported before modulation existed — keep the current rack
  // rather than wiping it.
  if (isPlainObject(config.modulation)) {
    state.modulation = structuredClone(config.modulation);
  }

  return { engine: config.engine, dropped };
}
