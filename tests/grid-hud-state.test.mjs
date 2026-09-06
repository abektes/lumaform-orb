import {
  ALL_SECTIONS,
  toggleSection,
  sectionsForMutation,
  RADIUS_STEPS,
  nextRadius,
} from '../src/ui/grid-hud-state.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok('ALL_SECTIONS is the three schema sections', eq(ALL_SECTIONS, ['colors', 'geometry', 'motion']));

// toggleSection
ok('removes an active section', eq(toggleSection(['colors', 'geometry', 'motion'], 'colors'), ['geometry', 'motion']));
ok('adds an inactive section', eq(toggleSection(['motion'], 'colors').sort(), ['colors', 'motion']));
ok('refuses to empty the selection', eq(toggleSection(['motion'], 'motion'), ['motion']));
ok('does not mutate its input', (() => {
  const input = ['colors', 'motion'];
  toggleSection(input, 'colors');
  return eq(input, ['colors', 'motion']);
})());
ok('ignores unknown section names', eq(toggleSection(['motion'], 'bogus'), ['motion']));

// sectionsForMutation
ok('all sections active means no lock (null)', sectionsForMutation(['colors', 'geometry', 'motion']) === null);
ok('all sections active in any order means null', sectionsForMutation(['motion', 'colors', 'geometry']) === null);
ok('a subset returns that subset', eq(sectionsForMutation(['motion']), ['motion']));
ok('returns a copy, not the original array', (() => {
  const input = ['motion'];
  return sectionsForMutation(input) !== input;
})());

// nextRadius
ok('RADIUS_STEPS matches the existing keybinding values', eq(RADIUS_STEPS, [0.12, 0.25, 0.45]));
ok('cycles forward', nextRadius(0.12) === 0.25);
ok('wraps at the end', nextRadius(0.45) === 0.12);
ok('unknown radius falls back to the first step', nextRadius(0.9) === 0.12);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
