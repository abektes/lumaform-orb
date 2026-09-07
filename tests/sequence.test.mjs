import {
  DEFAULT_HOLD_MS,
  DEFAULT_TRANSITION_MS,
  makeStep,
  stepDuration,
  totalDuration,
  stepAtTime,
  createSequencePlayer,
} from '../src/core/sequence.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const finding = (note, overrides = {}) => ({
  id: 'f-' + note,
  note,
  engine: 'quantum',
  global: { exposure: 1.1 },
  params: { edgeGlow: 1 },
  modulation: { enabled: false, sources: {}, routes: [] },
  thumb: 'data:image/jpeg;base64,AAAA',
  ...overrides,
});

// --- makeStep ---
const s1 = makeStep(finding('a'));
ok('carries the finding id', s1.findingId === 'f-a');
ok('copies the config', s1.engine === 'quantum' && s1.params.edgeGlow === 1);
ok('copies global settings', s1.global.exposure === 1.1);
ok('defaults the timings', s1.holdMs === DEFAULT_HOLD_MS && s1.transitionMs === DEFAULT_TRANSITION_MS);
ok('has its own id', typeof s1.id === 'string' && s1.id !== s1.findingId);
ok('same finding twice yields distinct steps', makeStep(finding('a')).id !== makeStep(finding('a')).id);
ok('overrides apply', makeStep(finding('a'), { holdMs: 50, easing: 'spring' }).holdMs === 50);
ok('is detached from the finding', (() => {
  const f = finding('a');
  const step = makeStep(f);
  f.params.edgeGlow = 99;
  f.global.exposure = 99;
  f.modulation.enabled = true;
  return step.params.edgeGlow === 1 && step.global.exposure === 1.1 && step.modulation.enabled === false;
})());

// --- durations ---
const seq = [
  makeStep(finding('a'), { transitionMs: 100, holdMs: 400 }),
  makeStep(finding('b'), { transitionMs: 200, holdMs: 300 }),
];
ok('step duration is transition + hold', stepDuration(seq[0]) === 500);
ok('negative and invalid durations are zero', stepDuration({ transitionMs: -1, holdMs: NaN }) === 0);
ok('total duration sums steps', totalDuration(seq) === 1000);
ok('empty sequence has zero duration', totalDuration([]) === 0);

// --- stepAtTime ---
ok('empty sequence returns null', stepAtTime([], 0) === null);
let at = stepAtTime(seq, 0);
ok('t=0 is step 0 in transition', at.index === 0 && at.phase === 'transition' && Math.abs(at.t) < 1e-9);
at = stepAtTime(seq, 50);
ok('mid-transition reports progress', at.index === 0 && at.phase === 'transition' && Math.abs(at.t - 0.5) < 1e-9, String(at.t));
at = stepAtTime(seq, 100);
ok('transition end enters hold', at.index === 0 && at.phase === 'hold');
at = stepAtTime(seq, 300);
ok('mid-hold reports progress', at.index === 0 && at.phase === 'hold' && Math.abs(at.t - 0.5) < 1e-9, String(at.t));
at = stepAtTime(seq, 500);
ok('crosses into step 1', at.index === 1 && at.phase === 'transition');
at = stepAtTime(seq, 1000);
ok('loops back to step 0', at.index === 0 && at.phase === 'transition');
at = stepAtTime(seq, 1050);
ok('loop keeps advancing', at.index === 0 && Math.abs(at.t - 0.5) < 1e-9);
at = stepAtTime(seq, 1000, { loop: false });
ok('without loop it parks on the last step', at.index === 1 && at.phase === 'hold' && at.t === 1);
ok('never returns a t outside [0,1]', (() => {
  for (let ms = 0; ms < 3000; ms += 7) {
    const a = stepAtTime(seq, ms);
    if (a.t < 0 || a.t > 1 || !Number.isFinite(a.t)) return false;
  }
  return true;
})());
ok('zero-duration steps are skipped when a timed step follows', (() => {
  const z = [
    makeStep(finding('z'), { transitionMs: 0, holdMs: 0 }),
    makeStep(finding('a'), { transitionMs: 0, holdMs: 100 }),
  ];
  const a = stepAtTime(z, 0);
  return a?.index === 1 && a.phase === 'hold' && Number.isFinite(a.t);
})());
ok('all-zero sequence does not divide by zero', (() => {
  const z = [
    makeStep(finding('z1'), { transitionMs: 0, holdMs: 0 }),
    makeStep(finding('z2'), { transitionMs: 0, holdMs: 0 }),
  ];
  const a = stepAtTime(z, 500);
  return a?.index === 1 && a.phase === 'hold' && a.t === 1;
})());

// --- player ---
const p = createSequencePlayer();
ok('idle player advances to null', p.advance(16) === null);
p.load(seq);
ok('loading does not auto-play', p.isPlaying === false && p.advance(16) === null);

p.play();
ok('play starts it', p.isPlaying === true);
let first = p.advance(0);
ok('first advance enters step 0', first.index === 0 && first.entered === true);
let second = p.advance(50);
ok('staying in a step does not re-enter', second.index === 0 && second.entered === false);
let crossed = null;
for (let i = 0; i < 100; i++) {
  const r = p.advance(10);
  if (r.index === 1) {
    crossed = r;
    break;
  }
}
ok('crossing into step 1 reports entered', crossed && crossed.index === 1 && crossed.entered === true);

p.pause();
const pausedAt = p.elapsedMs;
ok('pause stops advancing', p.isPlaying === false && p.advance(100) === null && p.elapsedMs === pausedAt);
p.play();
ok('resume keeps elapsed', p.elapsedMs === pausedAt);
p.stop();
ok('stop resets elapsed', p.elapsedMs === 0 && p.isPlaying === false);

p.play();
p.seek(600);
const seeked = p.advance(0);
ok('seek jumps to the right step', seeked.index === 1, JSON.stringify(seeked));
ok('seek marks the step as entered', seeked.entered === true);

// Looping fires entered once per boundary, including one-step loop wraps.
const p2 = createSequencePlayer();
p2.load(seq);
p2.play();
let entries = 0;
for (let i = 0; i < 400; i++) {
  const r = p2.advance(10);
  if (r?.entered) entries++;
}
ok('entered fires once per step crossing', entries === 9, `${entries} entries at t=10 through t=4000`);

const one = createSequencePlayer();
one.load([makeStep(finding('one'), { transitionMs: 50, holdMs: 50 })]);
one.play();
ok('one-step loop initially enters', one.advance(0)?.entered === true);
ok('one-step loop wrap re-enters', one.advance(100)?.entered === true);

const skipped = createSequencePlayer();
skipped.load(seq);
skipped.play();
skipped.advance(0);
const jumped = skipped.advance(1600);
ok('large deltas enter the landed step after skipped boundaries', jumped.index === 1 && jumped.entered === true);

const finite = createSequencePlayer();
finite.load(seq, { loop: false });
finite.play();
finite.advance(0);
const finished = finite.advance(5000);
ok('non-loop playback parks on the final step', finished.index === 1 && finished.phase === 'hold' && finished.t === 1);
ok('non-loop playback completes', finished.completed === true && finite.isPlaying === false);
ok('completed player does not keep advancing', finite.advance(10) === null);

const empty = createSequencePlayer();
empty.load([makeStep(finding('zero'), { transitionMs: 0, holdMs: 0 })]);
empty.play();
const zero = empty.advance(0);
ok('zero-duration player samples the last step once', zero.index === 0 && zero.entered === true);
ok('zero-duration player stops cleanly', zero.completed === true && empty.isPlaying === false);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
