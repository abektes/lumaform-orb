// The state player decides what setState() does, without WebGL, so every rule
// in it is checkable here: targets revert keys the last state changed, an
// interrupted transition starts from what is on screen, tempo eases, and an
// unknown name changes nothing.
import { createStatePlayer } from '../src/core/state-player.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const DEFS = {
  spread: { type: 'number', min: 0, max: 1, step: 0.01, section: 'motion' },
  glow:   { type: 'number', min: 0, max: 3, step: 0.05, section: 'colors' },
  tint:   { type: 'color', section: 'colors' },
};
const base = { spread: 0.1, glow: 1, tint: '#000000', rotSpeed: 0.5 };
const states = {
  idle:     { params: {}, tempo: 1 },
  thinking: { params: { spread: 0.9 }, tempo: 2 },
  speaking: { params: { glow: 2, tint: '#ffffff' }, tempo: 1 },
};

const player = createStatePlayer();
player.configure({ base, states, initialState: 'idle', transition: { durationMs: 1000, easing: 'linear' }, defs: DEFS });

ok('lists the state names', player.names.join(',') === 'idle,thinking,speaking');
ok('starts in the initial state', player.current === 'idle');
ok('starts at that state\'s tempo', player.tempo === 1);
ok('is idle before any start', !player.isRunning && player.advance(16) === null);

ok('the target of a state reverts keys other states touch',
  JSON.stringify(player.targetFor('speaking')) === JSON.stringify({ spread: 0.1, glow: 2, tint: '#ffffff' }),
  JSON.stringify(player.targetFor('speaking')));
ok('the target never includes keys no state touches', !('rotSpeed' in player.targetFor('thinking')));

ok('an unknown name returns false', player.start('dreaming', base) === false);
ok('an unknown name changes nothing', player.current === 'idle' && !player.isRunning);

ok('a known name returns true', player.start('thinking', base) === true);
ok('current switches immediately', player.current === 'thinking');
const half = player.advance(500);
ok('halfway is halfway (linear)', near(half.spread, 0.5), String(half.spread));
ok('tempo eases too', near(player.tempo, 1.5), String(player.tempo));

// Interrupt at the halfway point: the next transition must start from 0.5.
player.start('speaking', { ...base, ...half });
const justAfter = player.advance(1);
ok('an interruption starts from the values on screen', near(justAfter.spread, 0.5, 0.01), String(justAfter.spread));
ok('tempo continues from where it was', near(player.tempo, 1.5, 0.01), String(player.tempo));

const landed = player.advance(5000);
ok('lands exactly on the target', landed.spread === 0.1 && landed.glow === 2 && landed.tint === '#ffffff', JSON.stringify(landed));
ok('lands exactly on the tempo', player.tempo === 1);
ok('stops after landing', !player.isRunning && player.advance(16) === null);

player.start('thinking', landed, { durationMs: 0 });
const cut = player.advance(0);
ok('durationMs 0 is a hard cut', cut.spread === 0.9 && player.tempo === 2, JSON.stringify(cut));

player.setBase({ ...base, spread: 0.3 });
ok('setBase cancels a transition', !player.isRunning);
ok('setBase moves every target', player.targetFor('idle').spread === 0.3);

const empty = createStatePlayer();
empty.configure({ base, states: null, initialState: null, transition: null, defs: DEFS });
ok('no states: no names', empty.names.length === 0);
ok('no states: start returns false', empty.start('idle', base) === false);
ok('no states: tempo is 1', empty.tempo === 1);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
