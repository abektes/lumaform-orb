import {
  ALL_SECTIONS,
  toggleSection,
  sectionsForMutation,
  RADIUS_STEPS,
  BREADTH_OPTIONS,
  DEFAULT_BREADTH,
  NO_PARAM_SECTION,
  breadthLabel,
  cycleBreadth,
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
ok('allows all parameter sections off for patch-only breeding', eq(toggleSection(['motion'], 'motion'), []));
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
ok('an empty selection uses a no-parameter sentinel',
  eq(sectionsForMutation([]), [NO_PARAM_SECTION]));
ok('returns a copy, not the original array', (() => {
  const input = ['motion'];
  return sectionsForMutation(input) !== input;
})());

// nextRadius
ok('RADIUS_STEPS matches the existing keybinding values', eq(RADIUS_STEPS, [0.12, 0.25, 0.45]));
ok('cycles forward', nextRadius(0.12) === 0.25);
ok('wraps at the end', nextRadius(0.45) === 0.12);
ok('unknown radius falls back to the first step', nextRadius(0.9) === 0.12);

// breadth
ok('default breadth is 3', DEFAULT_BREADTH === 3);
ok('breadth options are the supported values', eq(BREADTH_OPTIONS, [1, 3, 6, null]));
ok('cycles breadth forward', cycleBreadth(1) === 3);
ok('null is the legal Everything option', cycleBreadth(6) === null);
ok('breadth cycling wraps', cycleBreadth(null) === 1);
ok('unknown breadth falls back to the first option', cycleBreadth(4) === 1);
ok('cycling never leaves BREADTH_OPTIONS', (() => {
  let value = DEFAULT_BREADTH;
  for (let i = 0; i < 100; i++) {
    value = cycleBreadth(value);
    if (!BREADTH_OPTIONS.includes(value)) return false;
  }
  return true;
})());
ok('breadth labels include Everything', breadthLabel(null) === 'Everything');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
