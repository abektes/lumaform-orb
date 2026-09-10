import {
  decimalsFor,
  formatParamValue,
  parseParamValue,
  isAtDefault,
} from '../src/core/param-format.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const glow = { type: 'number', min: 0.5, max: 3.5, step: 0.1, default: 1.2 };
const fine = { type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 };
const ints = { type: 'number', min: 1, max: 8, step: 1, default: 3 };
const nostep = { type: 'number', min: 0, max: 10, default: 1 };

// --- decimals ---
ok('step 0.1 implies 1 decimal', decimalsFor(glow) === 1);
ok('step 0.05 implies 2 decimals', decimalsFor(fine) === 2);
ok('step 1 implies 0 decimals', decimalsFor(ints) === 0);
ok('a missing step falls back to 2', decimalsFor(nostep) === 2);
ok('range endpoints do not change step display precision',
  decimalsFor({ min: 0.25, max: 1.05, step: 0.2 }) === 1);
ok('scientific step notation keeps its precision',
  decimalsFor({ step: 1e-7 }) === 7);
ok('scientific step notation includes its coefficient precision',
  decimalsFor({ step: 2.5e-7 }) === 8);

// --- formatting: the actual bug ---
ok('kills the float artefact', formatParamValue(2.9000000000000004, glow) === '2.9',
  formatParamValue(2.9000000000000004, glow));
ok('formats a clean value', formatParamValue(1.2, glow) === '1.2');
ok('pads to the step precision', formatParamValue(0.5, fine) === '0.50');
ok('integers carry no point', formatParamValue(3, ints) === '3');
ok('rounds rather than truncating', formatParamValue(2.86, glow) === '2.9');
ok('never uses exponent notation', !formatParamValue(0.0000001, fine).includes('e'));
ok('formats values at a scientific step without exponent notation',
  formatParamValue(0.0000002, { step: 1e-7 }) === '0.0000002');
ok('handles a negative', formatParamValue(-0.35, { min: -1, max: 1, step: 0.05 }) === '-0.35');
ok('a non-number is not rendered as NaN', formatParamValue(undefined, glow) === '—',
  formatParamValue(undefined, glow));
ok('a null def still formats', typeof formatParamValue(1.5, null) === 'string');

// --- parsing ---
ok('parses a plain number', parseParamValue('2.4', glow) === 2.4);
ok('snaps to the step', parseParamValue('2.43', glow) === 2.4);
ok('snaps against a positive minimum rather than zero',
  parseParamValue('0.6', { min: 0.25, max: 1, step: 0.2 }) === 0.65);
ok('snaps against a negative minimum rather than zero',
  parseParamValue('-0.7', { min: -0.95, max: 1, step: 0.2 }) === -0.75);
ok('clamps above max', parseParamValue('99', glow) === 3.5);
ok('clamps below min', parseParamValue('-4', glow) === 0.5);
ok('tolerates surrounding space', parseParamValue('  2.1  ', glow) === 2.1);
ok('rejects text', parseParamValue('abc', glow) === null);
ok('rejects empty', parseParamValue('') === null);
ok('rejects NaN-ish', parseParamValue('--', glow) === null);
ok('parsed values are free of float noise', (() => {
  for (let i = 0; i < 40; i++) {
    const v = parseParamValue(String(0.5 + i * 0.1), glow);
    if (v === null) continue;
    if (formatParamValue(v, glow).length > 4) return false;
  }
  return true;
})());
ok('snapping stays inside the range', (() => {
  for (let i = 0; i < 200; i++) {
    const raw = (Math.random() * 8 - 2).toFixed(4);
    const v = parseParamValue(raw, glow);
    if (v === null) continue;
    if (v < glow.min - 1e-9 || v > glow.max + 1e-9) return false;
  }
  return true;
})());

// --- default detection ---
ok('exact default', isAtDefault(1.2, glow) === true);
ok('float-noisy default still counts', isAtDefault(1.2000000000000002, glow) === true);
ok('a different value does not', isAtDefault(1.3, glow) === false);
ok('a def without a default is never at default', isAtDefault(1, { min: 0, max: 2, step: 1 }) === false);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
