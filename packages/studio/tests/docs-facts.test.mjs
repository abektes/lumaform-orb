// The README's numbers are claims a visitor reads before anything else, and
// they drift silently: at release review five engine parameter counts were
// stale, the suite count said 38 of 50, and VISION still said 17 engines.
// Each claim here is checked against the thing it describes.

import { readFileSync, readdirSync } from 'node:fs';
import { ENGINE_CATALOG } from '../../orb/src/engine-catalog.js';
import { PRESET_LIBRARY } from '../src/presets/preset-library.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const repo = new URL('../../../', import.meta.url);
const readme = readFileSync(new URL('README.md', repo), 'utf8');
const vision = readFileSync(new URL('docs/VISION.md', repo), 'utf8');
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = { 2: 'twenty', 3: 'thirty' };
const inWords = (n) => (n < 20 ? WORDS[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${WORDS[n % 10]}` : ''}`);

const engines = ENGINE_CATALOG.length;
ok('README opening states the engine count', new RegExp(`${inWords(engines)} shader engines`, 'i').test(readme), inWords(engines));

for (const entry of ENGINE_CATALOG) {
  const params = Object.keys(entry.params).length;
  const row = readme.match(new RegExp(`\\| \`${entry.id}\` — [^|]*\\| [^|]*\\| (\\d+) \\|`));
  ok(`README engine table lists ${entry.id} with ${params} params`, row && Number(row[1]) === params, row ? `says ${row[1]}` : 'missing');
}
const rows = readme.match(/^\| `[a-z]+` — /gm) || [];
ok('README engine table has one row per engine', rows.length === engines, `${rows.length} rows`);

const count = (dir) => readdirSync(new URL(dir, repo)).filter((f) => f.endsWith('.test.mjs')).length;
const orbSuites = count('packages/orb/tests/');
const studioSuites = count('packages/studio/tests/');
const suites = readme.match(/There are (\d+) of them, (\d+) covering the runtime and (\d+) the studio/);
ok('README suite counts match the test directories',
  suites && Number(suites[1]) === orbSuites + studioSuites && Number(suites[2]) === orbSuites && Number(suites[3]) === studioSuites,
  suites ? `says ${suites.slice(1).join('/')}, actual ${orbSuites + studioSuites}/${orbSuites}/${studioSuites}` : 'sentence missing');

const presets = readme.match(/(\d+) curated presets/);
ok('README preset count matches the library', presets && Number(presets[1]) === PRESET_LIBRARY.length, presets ? `says ${presets[1]}, actual ${PRESET_LIBRARY.length}` : 'missing');

ok('VISION opening states the engine count', new RegExp(`runs ${inWords(engines)} independent engines`).test(vision));
const inventory = vision.match(/\| Engines \| (\d+) registered/);
ok('VISION inventory states the engine count', inventory && Number(inventory[1]) === engines, inventory ? `says ${inventory[1]}` : 'missing');

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\ndocs facts: all checks passed');
