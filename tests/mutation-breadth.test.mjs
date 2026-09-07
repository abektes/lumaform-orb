import {
  chooseMutationKeys,
  eligibleKeys,
  mutateParams,
  mutatePatch,
} from '../src/core/variation-grid.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}
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
  tint: { type: 'color', default: '#00ff00', section: 'colors' },
  glow: { type: 'number', min: 0.5, max: 3.5, step: 0.1, default: 1.2, section: 'colors' },
  size: { type: 'number', min: 1, max: 5, step: 0.5, default: 2, section: 'geometry' },
  detail: { type: 'number', min: 1, max: 8, step: 1, default: 3, section: 'geometry' },
  speed: { type: 'number', min: 0, max: 2, step: 0.05, default: 1, section: 'motion' },
  wobble: { type: 'number', min: 0, max: 1, step: 0.05, default: 0.2, section: 'motion' },
  mode: { type: 'select', options: ['a', 'b', 'c'], default: 'a', section: 'motion' },
};
const base = {
  hue: '#ff0000',
  tint: '#00ff00',
  glow: 1.2,
  size: 2,
  detail: 3,
  speed: 1,
  wobble: 0.2,
  mode: 'a',
};
const ALL = Object.keys(defs);
const changed = (out) => ALL.filter((key) => out[key] !== base[key]);

ok('all keys are eligible without a lock', eligibleKeys(defs, null).length === 8);
ok('empty sections preserve the no-lock API', eligibleKeys(defs, []).length === 8);
ok('section locks preserve definition order',
  eq(eligibleKeys(defs, ['motion']), ['speed', 'wobble', 'mode']));
ok('unknown sections make no parameters eligible', eligibleKeys(defs, ['__none__']).length === 0);

ok('null breadth chooses everything', chooseMutationKeys(defs, { breadth: null }).length === 8);
ok('breadth chooses the requested count',
  chooseMutationKeys(defs, { breadth: 3, rng: seeded(1) }).length === 3);
ok('breadth clamps to the pool',
  chooseMutationKeys(defs, { breadth: 99, rng: seeded(1) }).length === 8);
ok('zero and negative breadth choose nothing',
  chooseMutationKeys(defs, { breadth: 0 }).length === 0 &&
  chooseMutationKeys(defs, { breadth: -2 }).length === 0);
ok('invalid breadth chooses nothing rather than everything',
  chooseMutationKeys(defs, { breadth: NaN }).length === 0 &&
  chooseMutationKeys(defs, { breadth: Infinity }).length === 0 &&
  chooseMutationKeys(defs, { breadth: '3' }).length === 0);
ok('choices do not repeat', (() => {
  for (let i = 0; i < 200; i++) {
    const keys = chooseMutationKeys(defs, { breadth: 4, rng: seeded(i) });
    if (new Set(keys).size !== keys.length) return false;
  }
  return true;
})());
ok('choices respect section locks', (() => {
  for (let i = 0; i < 200; i++) {
    const keys = chooseMutationKeys(defs, {
      sections: ['motion'],
      breadth: 2,
      rng: seeded(i),
    });
    if (keys.some((key) => defs[key].section !== 'motion')) return false;
  }
  return true;
})());
ok('one seed reproduces one selection',
  eq(
    chooseMutationKeys(defs, { breadth: 3, rng: seeded(42) }),
    chooseMutationKeys(defs, { breadth: 3, rng: seeded(42) })
  ));
ok('selection is broadly uniform', (() => {
  const hits = Object.fromEntries(ALL.map((key) => [key, 0]));
  for (let i = 0; i < 4000; i++) {
    for (const key of chooseMutationKeys(defs, { breadth: 2, rng: seeded(i) })) hits[key]++;
  }
  return Math.min(...Object.values(hits)) > 500 && Math.max(...Object.values(hits)) < 1600;
})());

ok('breadth 3 changes at most 3 parameters', (() => {
  for (let i = 0; i < 300; i++) {
    const rng = seeded(i);
    const keys = chooseMutationKeys(defs, { breadth: 3, rng });
    const out = mutateParams(base, defs, 0.5, null, { keys, rng });
    if (changed(out).length > 3) return false;
  }
  return true;
})());
ok('only selected keys can change', (() => {
  for (let i = 0; i < 300; i++) {
    const rng = seeded(i);
    const keys = chooseMutationKeys(defs, { breadth: 2, rng });
    const out = mutateParams(base, defs, 0.5, null, { keys, rng });
    if (changed(out).some((key) => !keys.includes(key))) return false;
  }
  return true;
})());
ok('step snapping can make actual breadth smaller, never larger', (() => {
  const out = mutateParams(base, defs, 0, null, { keys: ['glow'], rng: seeded(1) });
  return changed(out).length === 0;
})());
ok('unbounded calls preserve old all-eligible mutation', changed(
  mutateParams(base, defs, 0.5, null, { rng: seeded(7) })
).length >= 6);
ok('mutation is deterministic with a shared choose-and-mutate stream', (() => {
  const run = () => {
    const rng = seeded(123);
    const keys = chooseMutationKeys(defs, { breadth: 3, rng });
    return { keys, params: mutateParams(base, defs, 0.4, null, { keys, rng }) };
  };
  return eq(run(), run());
})());
ok('base is not mutated', (() => {
  const before = JSON.stringify(base);
  mutateParams(base, defs, 0.8, null, { rng: seeded(2) });
  return JSON.stringify(base) === before;
})());
ok('mutation never invents keys', Object.keys(
  mutateParams(base, defs, 0.8, null, { rng: seeded(2) })
).every((key) => key in base));

const patch = {
  enabled: true,
  sources: {
    lfo1: { type: 'lfo', rate: 0.5, phase: 0, shape: 'sine' },
    noise1: { type: 'noise', rate: 0.35, octaves: 3 },
  },
  routes: [{ source: 'lfo1', dest: 'glow', amount: 0.5 }],
};
ok('patch mutation is deterministic with injected RNG',
  eq(
    mutatePatch(patch, ['glow', '_timeScale'], 0.4, { rng: seeded(9) }),
    mutatePatch(patch, ['glow', '_timeScale'], 0.4, { rng: seeded(9) })
  ));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
