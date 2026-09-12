import { ANALYTIC_ENGINES } from './catalog/analytic.js';
import { SIMULATION_ENGINES } from './catalog/simulation.js';
import { BODIES_ENGINES } from './catalog/bodies.js';

export const ENGINE_CATALOG = [
  ...ANALYTIC_ENGINES,
  ...SIMULATION_ENGINES,
  ...BODIES_ENGINES,
];

export const ENGINE_TYPES = Object.fromEntries(
  ENGINE_CATALOG.map((entry) => [entry.key, entry.id])
);

export const ENGINE_INFO = Object.fromEntries(
  ENGINE_CATALOG.map((entry) => [
    entry.id,
    {
      id: entry.id,
      name: entry.name,
      badge: entry.badge,
      description: entry.description,
    },
  ])
);

export const ENGINE_PARAM_DEFINITIONS = Object.fromEntries(
  ENGINE_CATALOG.map((entry) => [entry.id, entry.params])
);

export function getEngineEntry(id) {
  return ENGINE_CATALOG.find((entry) => entry.id === id) ?? null;
}

export function getDefaultPresetName(id) {
  return getEngineEntry(id)?.defaultPreset ?? 'Aurora Core';
}

export function getDefaultEngineParams(engineType) {
  const defs = ENGINE_PARAM_DEFINITIONS[engineType] || {};
  const params = {};
  for (const [key, meta] of Object.entries(defs)) {
    params[key] = meta.default;
  }
  return params;
}

export function defaultEngineBags() {
  return Object.fromEntries(
    ENGINE_CATALOG.map((entry) => [entry.id, getDefaultEngineParams(entry.id)])
  );
}

