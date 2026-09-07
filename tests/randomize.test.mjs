// Randomize is schema-driven. A new engine must recolour and jitter from its
// catalog entry alone — no per-engine branch. This file is the regression
// lock for the bugs that switch caused: Flux was a bloom-only no-op, Auris
// wrote `shadowColor = palette.bg` (undefined), and Moiré invented `zDepth`.

import {
  ENGINE_INFO,
  ENGINE_PARAM_DEFINITIONS,
  ENGINE_TYPES,
  getDefaultEngineParams,
  randomizeState,
} from '../src/core/state.js';
import {
  applyGeneratedPalette,
  generateHarmoniousPalette,
  paletteTargets,
} from '../src/core/palette.js';
import {
  isRandomizableNumber,
  randomizeNumber,
  randomizeParams,
  snapToStep,
} from '../src/core/randomize.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const hex = /^#[0-9a-f]{6}$/i;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const defs = {
  hue: { type: 'color', default: '#ff0000', section: 'colors' },
  shadow: { type: 'color', default: '#111111', section: 'colors', paletteRole: 'fixed' },
  size: { type: 'number', min: 1, max: 5, step: 0.5, default: 2, section: 'geometry' },
  opted: { type: 'number', min: 0, max: 10, step: 1, default: 4, section: 'geometry', randomize: true },
  locked: { type: 'number', min: 0, max: 2, step: 0.1, default: 1, section: 'motion', randomize: false },
  speed: { type: 'number', min: 0, max: 2, step: 0.05, default: 1, section: 'motion' },
  glow: { type: 'number', min: 0.5, max: 3.5, step: 0.1, default: 1.2, section: 'colors' },
  mode: { type: 'select', options: ['a', 'b', 'c'], default: 'a', section: 'motion' },
};
const current = {
  hue: '#ff0000',
  shadow: '#111111',
  size: 2,
  opted: 4,
  locked: 1,
  speed: 1,
  glow: 1.2,
  mode: 'a',
  leftover: 'keep-me',
};
const palette = { primary: '#111111', secondary: '#222222', accent: '#333333' };

ok('motion numbers are randomizable by default', isRandomizableNumber(defs.speed));
ok('geometry numbers are not, unless opted in',
  !isRandomizableNumber(defs.size) && isRandomizableNumber(defs.opted));
ok('randomize: false wins over a motion section', !isRandomizableNumber(defs.locked));
ok('selects and colours are not randomizable numbers',
  !isRandomizableNumber(defs.mode) && !isRandomizableNumber(defs.hue));

ok('snapToStep stays inside [min, max] and on step',
  snapToStep(1.234, defs.speed) === 1.25
    && snapToStep(-1, defs.speed) === 0
    && snapToStep(9, defs.speed) === 2);

ok('randomizeNumber stays in range and on step', (() => {
  const def = defs.speed;
  for (let i = 0; i < 40; i++) {
    const value = randomizeNumber(def, seeded(i + 1));
    if (value < def.min || value > def.max) return false;
    const snapped = snapToStep(value, def);
    if (value !== snapped) return false;
  }
  return true;
})());

const out = randomizeParams(defs, current, { rng: seeded(7), palette });

ok('writable colours take the generated palette in schema order',
  out.hue === palette.primary);
ok('fixed colours are not overwritten', out.shadow === current.shadow);
ok('geometry stays put unless randomize: true',
  out.size === current.size && out.opted !== current.opted);
ok('motion numbers move; opted-out motion and colour-section numbers do not',
  out.speed !== current.speed && out.locked === current.locked && out.glow === current.glow);
ok('selects are never randomized', out.mode === current.mode);
ok('unknown current keys are preserved, not invented',
  out.leftover === 'keep-me'
    && Object.keys(out).every((key) => key in defs || key in current));

const invented = randomizeParams(defs, current, {
  rng: seeded(3),
  palette: { primary: '#abcdef', secondary: '#fedcba', accent: '#00ffaa', bg: '#ffffff' },
});
ok('palette.bg is not written as a parameter', !('bg' in invented) && invented.shadow === current.shadow);

ok('a seeded rng is deterministic',
  eq(
    randomizeParams(defs, current, { rng: seeded(99), palette }),
    randomizeParams(defs, current, { rng: seeded(99), palette })
  ));
ok('different seeds produce different motion values',
  randomizeParams(defs, current, { rng: seeded(1), palette }).speed
    !== randomizeParams(defs, current, { rng: seeded(2), palette }).speed);

ok('applyGeneratedPalette writes only palette targets', (() => {
  const patch = applyGeneratedPalette(defs, palette);
  return eq(patch, { hue: palette.primary }) && !('shadow' in patch);
})());

ok('generateHarmoniousPalette returns three hex roles', (() => {
  const generated = generateHarmoniousPalette(seeded(12));
  return hex.test(generated.primary)
    && hex.test(generated.secondary)
    && hex.test(generated.accent)
    && !('bg' in generated);
})());
ok('generateHarmoniousPalette is deterministic with a seeded rng',
  eq(generateHarmoniousPalette(seeded(12)), generateHarmoniousPalette(seeded(12))));

const engines = Object.values(ENGINE_TYPES);

for (const engine of engines) {
  const schema = ENGINE_PARAM_DEFINITIONS[engine] || {};
  const name = ENGINE_INFO[engine]?.name ?? engine;
  const targets = paletteTargets(schema);
  const numbers = Object.values(schema).filter(isRandomizableNumber);
  ok(`${name} — Randomize has a colour or a motion number to write`,
    targets.length + numbers.length > 0,
    `${targets.length} colour(s), ${numbers.length} number(s)`);
}

const fluxDefs = ENGINE_PARAM_DEFINITIONS[ENGINE_TYPES.FLUX];
const fluxCurrent = getDefaultEngineParams(ENGINE_TYPES.FLUX);
const fluxOut = randomizeParams(fluxDefs, fluxCurrent, { rng: seeded(5), palette });
ok('Flux palette targets receive generated colours',
  fluxOut.colorA === palette.primary
    && fluxOut.colorB === palette.secondary
    && fluxOut.colorC === palette.accent);
ok('Flux geometry is left alone',
  fluxOut.strands === fluxCurrent.strands
    && fluxOut.layout === fluxCurrent.layout);
ok('Flux motion numbers stay in schema range',
  fluxOut.amplitude >= fluxDefs.amplitude.min
    && fluxOut.amplitude <= fluxDefs.amplitude.max);

const aurisDefs = ENGINE_PARAM_DEFINITIONS[ENGINE_TYPES.AURIS];
const aurisCurrent = getDefaultEngineParams(ENGINE_TYPES.AURIS);
const aurisOut = randomizeParams(aurisDefs, aurisCurrent, { rng: seeded(8), palette });
ok('Auris shadowColor stays defined and untouched',
  aurisOut.shadowColor === aurisCurrent.shadowColor
    && aurisOut.shadowColor !== undefined);
ok('Auris facetColor stays fixed', aurisOut.facetColor === aurisCurrent.facetColor);
ok('Auris writable colours take the palette',
  aurisOut.lightColor === palette.primary && aurisOut.wireColor === palette.secondary);

const moireDefs = ENGINE_PARAM_DEFINITIONS[ENGINE_TYPES.MOIRE];
const moireCurrent = getDefaultEngineParams(ENGINE_TYPES.MOIRE);
const moireOut = randomizeParams(moireDefs, moireCurrent, { rng: seeded(4), palette });
ok('Moiré does not invent zDepth', !('zDepth' in moireOut) && !('zDepth' in moireDefs));
ok('Moiré writes only schema keys plus incoming current keys',
  Object.keys(moireOut).every((key) => key in moireDefs || key in moireCurrent));

for (const engine of engines) {
  const schema = ENGINE_PARAM_DEFINITIONS[engine] || {};
  const bag = getDefaultEngineParams(engine);
  const next = randomizeParams(schema, bag, { rng: seeded(21), palette });
  const name = ENGINE_INFO[engine]?.name ?? engine;

  const extra = Object.keys(next).filter((key) => !(key in schema) && !(key in bag));
  ok(`${name} — invents no keys`, extra.length === 0, extra.join(', '));

  for (const [key, def] of Object.entries(schema)) {
    if (def.type !== 'number') continue;
    if (typeof next[key] !== 'number') {
      ok(`${name}.${key} — stays numeric`, false);
      continue;
    }
    if (isRandomizableNumber(def)) {
      ok(`${name}.${key} — stays in [min, max]`,
        next[key] >= def.min && next[key] <= def.max);
      ok(`${name}.${key} — lands on step`, next[key] === snapToStep(next[key], def));
    } else {
      ok(`${name}.${key} — geometry / opted-out number is unchanged`,
        next[key] === bag[key]);
    }
  }
}

const fluxState = {
  engine: ENGINE_TYPES.FLUX,
  activePresetName: 'Neon Voice Ribbon',
  global: { bloomStrength: 0.25, bloomRadius: 0.25, bloomThreshold: 0.35 },
  engines: {
    [ENGINE_TYPES.FLUX]: { ...fluxCurrent },
    [ENGINE_TYPES.AURIS]: { ...aurisCurrent },
  },
};
const randomized = randomizeState(fluxState);
ok('randomizeState names the result Procedural Creation',
  randomized.activePresetName === 'Procedural Creation');
ok('randomizeState only mutates the active engine bag',
  eq(randomized.engines[ENGINE_TYPES.AURIS], aurisCurrent)
    && randomized.engines[ENGINE_TYPES.FLUX].colorA !== fluxCurrent.colorA);
ok('randomizeState jitters bloom without dropping the rest of global',
  randomized.global.bloomThreshold === 0.35
    && randomized.global.bloomStrength >= 0.5
    && randomized.global.bloomStrength <= 0.9
    && randomized.global.bloomRadius >= 0.3
    && randomized.global.bloomRadius <= 0.55);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
