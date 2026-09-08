import { readFileSync } from 'node:fs';
import { fluxStrandColor } from '../src/engines/flux-color.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const GREEN = [0, 1, 0];
const RED = [1, 0, 0];
const GLOW = 2.1;

const restGreen = fluxStrandColor(GREEN, 0, 0.5, GLOW);
const restRed = fluxStrandColor(RED, 0, 0.5, GLOW);
const crestGreen = fluxStrandColor(GREEN, 1, 0.5, GLOW);

ok('a rest-pose green strand stays in display range',
  restGreen.every((v) => v <= 1 + 1e-9),
  restGreen.map((v) => v.toFixed(3)).join(','));

ok('rest-pose green is still green, not a pale haze',
  restGreen[1] > restGreen[0] * 4 && restGreen[1] > restGreen[2] * 4,
  restGreen.map((v) => v.toFixed(3)).join(','));

ok('rest-pose red and green stay distinguishable',
  Math.abs(restGreen[1] - restRed[1]) > 0.3);

ok('crests still go HDR so additive knots can form',
  crestGreen.some((v) => v > 1));

ok('crests keep the ramp hue instead of mixing toward white',
  crestGreen[1] > crestGreen[0] && crestGreen[1] > crestGreen[2]);

const engine = readFileSync(new URL('../src/engines/flux-engine.js', import.meta.url), 'utf8');
ok('the fragment shader uses the in-hue restGain, not mix-to-white times glow',
  engine.includes('restGain')
    && !engine.includes('mix(ramp, vec3(1.0), hot * 0.34)'));
ok('sparkles follow a ramp colour instead of staying white',
  !/uColor:\s*\{\s*value:\s*new THREE\.Color\('#ffffff'\)/.test(engine));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
