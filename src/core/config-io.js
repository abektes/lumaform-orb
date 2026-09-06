// Loading exported configurations back in.
//
// Export writes { engine, global, params, modulation }, and the grid writes an
// array of those — that array is the notebook format, the thing you actually
// keep. Import has to accept both, restore the motion design as well as the
// look, and refuse to write junk into state.
//
// Pure: takes the engine list and the parameter schema as arguments rather than
// importing state.js, so it stays a leaf module and tests need no fixtures.

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

  const configs = Array.isArray(parsed) ? parsed : [parsed];
  if (!configs.length) return { ok: false, error: 'The file contains no configs.' };

  for (const config of configs) {
    const problem = validateConfig(config, validEngines);
    if (problem) return { ok: false, error: problem };
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

// Writes in place. state, state.global and each state.engines[...] bag are held
// by reference across main.js, StudioUI and OrbStudio; reassigning any of them
// orphans those holders.
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
