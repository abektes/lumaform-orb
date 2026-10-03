// Config v2 adds named states. A state is a patch over the base look, and may
// only touch what can be eased safely — the same set modulation may touch, plus
// colours. Rates and geometry params are dropped and reported, not trusted.
import {
  CONFIG_VERSION, migrateConfig, readConfig, sanitizeStates, sanitizeTransition,
} from '../src/core/config-io.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const DEFS = {
  glow:     { type: 'number', min: 0, max: 3, step: 0.05, section: 'colors' },
  spread:   { type: 'number', min: 0, max: 1, step: 0.01, section: 'motion' },
  rotSpeed: { type: 'number', min: 0, max: 2, step: 0.01, section: 'motion' },
  segments: { type: 'number', min: 4, max: 64, step: 1, section: 'geometry' },
  shape:    { type: 'select', options: ['a', 'b'], section: 'colors' },
  tint:     { type: 'color', section: 'colors' },
  edgeTint: { type: 'color', section: 'geometry' },
};

ok('the current version is 2', CONFIG_VERSION === 2, String(CONFIG_VERSION));

const v1 = migrateConfig({ version: 1, engine: 'x', params: { glow: 1 } });
ok('v1 migrates to v2', v1.ok && v1.config.version === 2);
ok('v1 → v2 changes nothing else', v1.ok && v1.config.params.glow === 1 && v1.config.states === undefined);

const v0 = migrateConfig({ engine: 'x', params: {} });
ok('v0 migrates through the whole chain', v0.ok && v0.config.version === 2);

const v3 = migrateConfig({ version: 3, engine: 'x', params: {} });
ok('v3 is refused', !v3.ok && /3/.test(v3.error) && /2/.test(v3.error), v3.error);

const { states, dropped } = sanitizeStates({
  idle: { params: {}, tempo: 1 },
  thinking: {
    params: { spread: 0.8, rotSpeed: 1.5, segments: 32, shape: 'b', tint: '#ff0000', edgeTint: '#00ff00', ghost: 1 },
    tempo: 1.4,
  },
  speaking: { params: { glow: 99 }, tempo: 10 },
  broken: 'nope',
}, DEFS);

ok('keeps a safe number', states.thinking.params.spread === 0.8);
ok('keeps a non-geometry colour', states.thinking.params.tint === '#ff0000');
ok('drops a rate', !('rotSpeed' in states.thinking.params));
ok('drops a geometry number', !('segments' in states.thinking.params));
ok('drops a select', !('shape' in states.thinking.params));
ok('drops a geometry colour', !('edgeTint' in states.thinking.params));
ok('drops an unknown key', !('ghost' in states.thinking.params));
ok('reports each drop as state.key',
  ['thinking.rotSpeed', 'thinking.segments', 'thinking.shape', 'thinking.edgeTint', 'thinking.ghost']
    .every((k) => dropped.includes(k)), dropped.join(', '));
ok('clamps a number into its range', states.speaking.params.glow === 3);
ok('clamps tempo into its range', states.speaking.tempo === 4);
ok('drops a state that is not an object', !('broken' in states) && dropped.includes('broken'));
ok('defaults tempo to 1', sanitizeStates({ a: { params: {} } }, DEFS).states.a.tempo === 1);
ok('no states → null', sanitizeStates(undefined, DEFS).states === null);

ok('transition defaults', JSON.stringify(sanitizeTransition(undefined)) === JSON.stringify({ durationMs: 600, easing: 'easeInOut' }));
ok('transition clamps duration', sanitizeTransition({ durationMs: 99999 }).durationMs === 10000);
ok('transition rejects an unknown easing', sanitizeTransition({ easing: 'wobble' }).easing === 'easeInOut');

const record = readConfig({
  version: 2, engine: 'x', params: { glow: 1 },
  states: { idle: { params: {} }, thinking: { params: { spread: 0.5, rotSpeed: 1 }, tempo: 1.2 } },
  initialState: 'thinking',
  transition: { durationMs: 300, easing: 'spring' },
}, DEFS);
ok('readConfig returns states', record.states?.thinking?.params.spread === 0.5);
ok('readConfig returns initialState', record.initialState === 'thinking');
ok('readConfig returns transition', record.transition.durationMs === 300 && record.transition.easing === 'spring');
ok('readConfig appends dropped state keys', record.dropped.includes('thinking.rotSpeed'), record.dropped.join(', '));

const missingInitial = readConfig({ engine: 'x', params: {}, states: { idle: { params: {} } }, initialState: 'gone' }, DEFS);
ok('an initialState naming no state reads as null', missingInitial.initialState === null);

const single = readConfig({ engine: 'x', params: { glow: 1 } }, DEFS);
ok('a file without states is a single look', single.states === null && single.initialState === null);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
