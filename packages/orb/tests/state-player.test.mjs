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

// Fix round 1: inherited names, stranded tempo, non-finite input, spring overshoot.
const guard = createStatePlayer();
guard.configure({ base, states, initialState: 'idle', transition: { durationMs: 1000, easing: 'linear' }, defs: DEFS });
ok('an inherited name "constructor" is not a state', guard.start('constructor', base) === false);
ok('an inherited name "toString" is not a state', guard.start('toString', base) === false);
ok('inherited names change nothing', guard.current === 'idle' && !guard.isRunning);
ok('targetFor an inherited name patches nothing', !('spread' in guard.targetFor('constructor')) || guard.targetFor('constructor').spread === 0.1);
const inheritedInit = createStatePlayer();
inheritedInit.configure({ base, states, initialState: 'constructor', transition: null, defs: DEFS });
ok('an inherited initialState gives no current state', inheritedInit.current === null);
const inheritedKey = createStatePlayer();
inheritedKey.configure({ base: { ...base, spread: 0.1 }, states: { a: { params: { toString: 'x', spread: 0.2 }, tempo: 1 }, b: { params: {}, tempo: 1 } }, initialState: 'b', transition: null, defs: DEFS });
ok('a patch key is read as own, not inherited', inheritedKey.targetFor('b').spread === 0.1 && !Object.hasOwn(inheritedKey.targetFor('b'), 'toString'));

for (const how of ['setBase', 'cancel']) {
  const p = createStatePlayer();
  p.configure({ base, states, initialState: 'idle', transition: { durationMs: 1000, easing: 'linear' }, defs: DEFS });
  p.start('thinking', base, { durationMs: 1000 });
  p.advance(500);
  if (how === 'setBase') p.setBase(base); else p.cancel();
  ok(`${how} snaps tempo to the current state's tempo`, p.tempo === 2 && !p.isRunning, String(p.tempo));
}

const nan = createStatePlayer();
nan.configure({ base, states, initialState: 'idle', transition: { durationMs: 1000, easing: 'linear' }, defs: DEFS });
nan.start('thinking', base, { durationMs: NaN });
const nanLanded = nan.advance(5000);
ok('NaN durationMs uses the default and lands', nanLanded.spread === 0.9 && nan.tempo === 2 && !nan.isRunning, JSON.stringify(nanLanded) + ' ' + nan.tempo);
const inf = createStatePlayer();
inf.configure({ base, states, initialState: 'idle', transition: { durationMs: 1000, easing: 'linear' }, defs: DEFS });
inf.start('thinking', base, { durationMs: Infinity });
const infLanded = inf.advance(5000);
ok('Infinity durationMs uses the default and lands', infLanded.spread === 0.9 && inf.tempo === 2 && !inf.isRunning);
const badDelta = createStatePlayer();
badDelta.configure({ base, states, initialState: 'idle', transition: { durationMs: 1000, easing: 'linear' }, defs: DEFS });
badDelta.start('thinking', base);
badDelta.advance(NaN);
const afterBad = badDelta.advance(5000);
ok('a NaN delta does not break landing', afterBad && afterBad.spread === 0.9 && badDelta.tempo === 2 && !badDelta.isRunning);

const spring = createStatePlayer();
spring.configure({ base, states: { lo: { params: {}, tempo: 1 }, hi: { params: {}, tempo: 4 } }, initialState: 'lo', transition: { durationMs: 1000, easing: 'spring' }, defs: DEFS });
spring.start('hi', base);
let maxTempo = 0;
for (let i = 0; i < 100; i++) { spring.advance(10); maxTempo = Math.max(maxTempo, spring.tempo); }
ok('spring easing never pushes tempo above 4', maxTempo <= 4, String(maxTempo));
const springDown = createStatePlayer();
springDown.configure({ base, states: { lo: { params: {}, tempo: 0.25 }, hi: { params: {}, tempo: 1 } }, initialState: 'hi', transition: { durationMs: 1000, easing: 'spring' }, defs: DEFS });
springDown.start('lo', base);
let minTempo = 99;
for (let i = 0; i < 100; i++) { springDown.advance(10); minTempo = Math.min(minTempo, springDown.tempo); }
ok('spring easing never pushes tempo below 0.25', minTempo >= 0.25, String(minTempo));

// A partial base (a host edit that set only `glow`) must not leave a target
// key mapped to undefined: the engine would receive `undefined` for it.
const partial = createStatePlayer();
partial.configure({ base, states, initialState: 'idle', transition: { durationMs: 1000, easing: 'linear' }, defs: DEFS });
partial.setBase({ glow: 2 });
const partialTarget = partial.targetFor('idle');
ok('a partial base leaves no target key undefined',
  Object.values(partialTarget).every((v) => v !== undefined) && !('spread' in partialTarget) && !('tint' in partialTarget),
  JSON.stringify(partialTarget));
ok('a state patch still supplies a key the base lacks', partial.targetFor('thinking').spread === 0.9);

const nullOpts = createStatePlayer();
nullOpts.configure({ base, states, initialState: 'idle', transition: { durationMs: 1000, easing: 'linear' }, defs: DEFS });
let nullThrew = null;
try { nullOpts.start('thinking', base, null); } catch (e) { nullThrew = e; }
ok('start(name, params, null) is the same as no options', nullThrew === null && near(nullOpts.advance(500).spread, 0.5), String(nullThrew));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
