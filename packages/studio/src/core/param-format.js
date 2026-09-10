// Parameter precision belongs to the schema, not the control that happens to
// render it. Keeping this module DOM-free also makes typed values testable.

const FALLBACK_DECIMALS = 2;
const MAX_DECIMALS = 100;

function decimalPlaces(value) {
  const text = String(value).toLowerCase();
  const [coefficient, exponentText] = text.split('e');
  const coefficientDecimals = coefficient.includes('.')
    ? coefficient.length - coefficient.indexOf('.') - 1
    : 0;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);

  if (!Number.isFinite(exponent)) return FALLBACK_DECIMALS;
  return Math.min(MAX_DECIMALS, Math.max(0, coefficientDecimals - exponent));
}

export function decimalsFor(def) {
  const step = def?.step;
  if (!Number.isFinite(step) || step <= 0) return FALLBACK_DECIMALS;
  return decimalPlaces(step);
}

export function formatParamValue(value, def) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(decimalsFor(def));
}

export function parseParamValue(raw, def) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  if (!text) return null;

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;

  const step = Number.isFinite(def?.step) && def.step > 0 ? def.step : null;
  const min = Number.isFinite(def?.min) ? def.min : -Infinity;
  const max = Number.isFinite(def?.max) ? def.max : Infinity;

  let next = parsed;
  if (step && Number.isFinite(min)) {
    // HTML range steps are anchored at min, including when min is negative.
    next = min + Math.round((parsed - min) / step) * step;
  } else if (step) {
    next = Math.round(parsed / step) * step;
  }

  next = Math.min(max, Math.max(min, next));
  // Step arithmetic reintroduces binary noise, so normalize to the same
  // precision as the step grid. Its anchor can carry more digits than the step.
  const gridDecimals = Math.max(
    decimalsFor(def),
    Number.isFinite(min) ? decimalPlaces(min) : 0,
    Number.isFinite(max) ? decimalPlaces(max) : 0
  );
  return Number(next.toFixed(gridDecimals));
}

export function isAtDefault(value, def) {
  if (!Number.isFinite(def?.default)) return false;
  return formatParamValue(value, def) === formatParamValue(def.default, def);
}
