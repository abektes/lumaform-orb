import { readFileSync } from 'node:fs';
import { aqueousAbsorption, aqueousCoreColor } from '../src/engines/aqueous-color.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const RED = [1, 0, 0];
const TEAL = [0.176, 0.831, 0.749];
const YELLOW = [1, 0.929, 0];

const redVolume = aqueousAbsorption(RED, 1.2);
const tealVolume = aqueousAbsorption(TEAL, 1.2);
ok('a red body absorbs cyan, not red',
  redVolume[0] > redVolume[1] && redVolume[0] > redVolume[2],
  redVolume.map((v) => v.toFixed(3)).join(','));
ok('a teal body still drinks red the way water does',
  tealVolume[1] > tealVolume[0] && tealVolume[2] > tealVolume[0],
  tealVolume.map((v) => v.toFixed(3)).join(','));

const redCore = aqueousCoreColor(RED, 0.8, 1.6);
const yellowCore = aqueousCoreColor(YELLOW, 0.8, 1.6);
ok('a red core stays red, not amber',
  redCore[0] > redCore[1] * 1.8 && redCore[0] > redCore[2] * 1.8,
  redCore.map((v) => v.toFixed(3)).join(','));
ok('a yellow core is not pulled into orange-red',
  yellowCore[1] > yellowCore[2] * 2 && Math.abs(yellowCore[0] - yellowCore[1]) < 0.35,
  yellowCore.map((v) => v.toFixed(3)).join(','));
ok('red and yellow cores remain distinguishable',
  Math.abs(redCore[1] - yellowCore[1]) > 0.25);

const engine = readFileSync(new URL('../src/engines/aqueous-engine.js', import.meta.url), 'utf8');
ok('volume absorption is not hardcoded as water (red-killing)',
  !engine.includes('vec3(0.78, 0.15, 0.08)'));
ok('the core does not hard-mix toward amber',
  !engine.includes('vec3(1.0, 0.16, 0.025)')
    && !engine.includes('vec3(1.0, 0.52, 0.08)'));
ok('the fake environment is not locked to teal',
  !engine.includes('vec3(0.16, 0.58, 0.60)')
    && !engine.includes('vec3(0.52, 0.94, 0.86)'));
ok('inner light through the body is strong enough to read',
  engine.includes('uCoreColor * innerLens * uCoreIntensity * uTransmission * 0.12'));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
