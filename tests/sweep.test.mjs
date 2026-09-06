import { DEFAULT_STEPS, isSweepable, sweepValues, listSweepableParams } from '../src/core/sweep.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const numberDef = { type: 'number', label: 'Edge Luma', min: 0, max: 3, step: 0.05, section: 'colors' };
const tinyDef   = { type: 'number', label: 'Internal Glow', min: 0.002, max: 0.03, step: 0.001, section: 'colors' };
const noStepDef = { type: 'number', label: 'Free', min: 0, max: 1, section: 'motion' };
const colorDef  = { type: 'color', label: 'Primary', default: '#ffed00', section: 'colors' };
const selectDef = { type: 'select', label: 'Shape', options: ['a', 'b'], section: 'geometry' };

ok('DEFAULT_STEPS is 5', DEFAULT_STEPS === 5);

// isSweepable
ok('numbers are sweepable', isSweepable(numberDef) === true);
ok('colors are not sweepable', isSweepable(colorDef) === false);
ok('selects are not sweepable', isSweepable(selectDef) === false);
ok('missing bounds are not sweepable', isSweepable({ type: 'number' }) === false);
ok('zero-width range is not sweepable', isSweepable({ type: 'number', min: 1, max: 1 }) === false);
ok('undefined def is not sweepable', isSweepable(undefined) === false);

// sweepValues
const v = sweepValues(numberDef);
ok('returns DEFAULT_STEPS values', v.length === 5, JSON.stringify(v));
ok('starts at min', v[0] === 0);
ok('ends at max', v[4] === 3);
ok('is strictly ascending', v.every((x, i) => i === 0 || x > v[i - 1]), JSON.stringify(v));
ok('stays within bounds', v.every((x) => x >= numberDef.min && x <= numberDef.max));
ok('snaps to step', v.every((x) => Math.abs(Math.round(x / 0.05) * 0.05 - x) < 1e-6), JSON.stringify(v));

const tiny = sweepValues(tinyDef);
ok('handles a narrow range', tiny.length === 5 && tiny[0] === 0.002 && tiny[4] === 0.03, JSON.stringify(tiny));
ok('narrow range stays in bounds', tiny.every((x) => x >= 0.002 && x <= 0.03));

const free = sweepValues(noStepDef, 3);
ok('honours a custom step count', eq(free, [0, 0.5, 1]), JSON.stringify(free));

ok('rejects non-sweepable defs', eq(sweepValues(colorDef), []));
ok('rejects fewer than 2 steps', eq(sweepValues(numberDef, 1), []));
ok('all values are finite', sweepValues(numberDef, 9).every(Number.isFinite));

// listSweepableParams
const defs = { edgeGlow: numberDef, color1: colorDef, shape: selectDef, glow: tinyDef };
const list = listSweepableParams(defs);
ok('lists only sweepable params', eq(list.map((p) => p.key).sort(), ['edgeGlow', 'glow']));
ok('carries the label through', list.find((p) => p.key === 'edgeGlow').label === 'Edge Luma');
ok('handles empty defs', eq(listSweepableParams({}), []));
ok('handles undefined defs', eq(listSweepableParams(undefined), []));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
