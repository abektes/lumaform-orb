// setState() through the real OrbRuntime methods. The constructor needs WebGL,
// so the instance is built from the prototype with only the fields advance(),
// setState() and the param plumbing read — the same methods the browser runs.
import { OrbRuntime } from '../src/core/runtime.js';
import { createModulationRack, createDefaultModulation } from '../src/core/modulation.js';
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
};

function bareRuntime() {
  const received = [];
  const rt = Object.create(OrbRuntime.prototype);
  Object.assign(rt, {
    modulation: createModulationRack(createDefaultModulation()),
    statePlayer: createStatePlayer(),
    baseParams: { spread: 0.1, glow: 1 },
    paramDefs: DEFS,
    lastModulated: {},
    virtualTime: 0,
    frameStep: 0,
    timeScale: 1,
    isPaused: false,
    audioSource: null,
    activeEngineType: 'x',
    activeEngine: { setParams: (p) => received.push({ ...p }), update() {}, dispose() {} },
  });
  rt.statePlayer.configure({
    base: rt.baseParams,
    states: { idle: { params: {}, tempo: 1 }, thinking: { params: { spread: 0.9 }, tempo: 2 } },
    initialState: 'idle',
    transition: { durationMs: 1000, easing: 'linear' },
    defs: DEFS,
  });
  return { rt, received };
}

{
  const { rt, received } = bareRuntime();
  ok('state reports the initial state', rt.state === 'idle');
  ok('stateNames lists the states', rt.stateNames.join(',') === 'idle,thinking');

  const warn = console.warn;
  let warned = '';
  console.warn = (m) => { warned = String(m); };
  ok('an unknown state returns false', rt.setState('dreaming') === false);
  console.warn = warn;
  ok('an unknown state warns with its name', warned.includes('dreaming'), warned);
  ok('an unknown state changes nothing', rt.state === 'idle' && received.length === 0);

  ok('a known state returns true', rt.setState('thinking') === true);
  rt.advance(0.5);
  ok('advance eases the base params', near(rt.baseParams.spread, 0.5), String(rt.baseParams.spread));
  ok('the engine receives the eased value', received.some((p) => near(p.spread ?? -1, 0.5)), JSON.stringify(received.at(-1)));
  ok('tempo folds into the frame step', near(rt.frameStep, 0.5 * 1.5), String(rt.frameStep));

  const before = rt.virtualTime;
  rt.advance(0.6);
  ok('virtual time only ever accumulates', rt.virtualTime > before);
  ok('lands on the target', rt.baseParams.spread === 0.9);
  ok('frame step at the landed tempo', near(rt.frameStep, 0.6 * 2), String(rt.frameStep));
}

{
  // A transition is wall-clock time: pausing playback or slowing timeScale must
  // not stretch a 600 ms transition.
  const { rt } = bareRuntime();
  rt.timeScale = 0.25;
  rt.setState('thinking');
  rt.advance(0.5);
  ok('transition time ignores timeScale', near(rt.baseParams.spread, 0.5), String(rt.baseParams.spread));
}

{
  // A modulated key that a state also eases must still reach the engine
  // modulated, not at its bare eased value.
  const { rt, received } = bareRuntime();
  rt.modulation.setConfig({
    ...createDefaultModulation(),
    enabled: true,
    sources: { ...createDefaultModulation().sources, lfo1: { type: 'lfo', shape: 'square', rate: 0.001, phase: 0 } },
    routes: [{ source: 'lfo1', dest: 'spread', amount: 0.2 }],
  });
  rt.setState('thinking');
  rt.advance(0.5);
  const last = received.filter((p) => 'spread' in p).at(-1);
  ok('modulation still applies on top of a state', last && !near(last.spread, rt.baseParams.spread), JSON.stringify(last));
}

{
  // A host edit replaces the base look. A state that was landed must survive
  // it: otherwise 'thinking' silently shows the bare base after any edit.
  // The bare runtime has no renderer, so the two methods applyParams reaches
  // for are stubbed on the instance; the code under test is the real applyParams.
  const { rt } = bareRuntime();
  rt.updateGlobalSettings = () => {};
  rt.refitCamera = () => {};
  rt.setState('thinking');
  rt.advance(1.5);
  ok('thinking has landed', rt.state === 'thinking' && rt.baseParams.spread === 0.9);

  rt.applyParams({ params: { spread: 0.2, glow: 1.5 } });
  ok('the current state survives a host edit', rt.state === 'thinking');
  ok('the state patch is re-applied over the edit', rt.baseParams.spread === 0.9, String(rt.baseParams.spread));
  ok('the edit to an unpatched key took', rt.baseParams.glow === 1.5, String(rt.baseParams.glow));
}

{
  // Pausing stops virtual time, not a transition: the comment above promises
  // wall-clock easing, so a paused orb still moves toward the state it was told.
  const { rt } = bareRuntime();
  rt.isPaused = true;
  rt.setState('thinking');
  rt.advance(0.5);
  ok('paused: virtual time does not move', rt.frameStep === 0 && rt.virtualTime === 0);
  ok('paused: the transition still runs', near(rt.baseParams.spread, 0.5), String(rt.baseParams.spread));
}

{
  // Re-mounting the same engine type with a new config. The old config's
  // current state must not leak into the new base look.
  const sameType = () => {
    const made = bareRuntime();
    made.rt.updateGlobalSettings = () => {};
    made.rt.refitCamera = () => {};
    made.rt.setState('thinking');
    made.rt.advance(1.5);
    return made;
  };

  const { rt, received } = sameType();
  ok('same-type: thinking landed first', rt.state === 'thinking' && rt.baseParams.spread === 0.9);
  rt.mountEngine('x', { params: { spread: 0.1, glow: 1 } });
  ok('same-type, no states: the old state is gone', rt.state === null, String(rt.state));
  ok('same-type, no states: base is the incoming look', rt.baseParams.spread === 0.1, String(rt.baseParams.spread));
  ok('same-type, no states: the engine saw 0.1', received.filter((p) => 'spread' in p).at(-1)?.spread === 0.1, JSON.stringify(received.at(-1)));

  const second = sameType();
  second.rt.mountEngine('x', {
    params: { spread: 0.1, glow: 1 },
    states: { calm: { params: { spread: 0.4 }, tempo: 1 }, bright: { params: { glow: 2 }, tempo: 1 } },
    initialState: 'calm',
  });
  ok('same-type, new states: the initial state is a hard cut', second.rt.state === 'calm' && second.rt.baseParams.spread === 0.4, String(second.rt.baseParams.spread));
  ok('same-type, new states: the player base stayed clean', second.rt.statePlayer.targetFor('bright').spread === 0.1, JSON.stringify(second.rt.statePlayer.targetFor('bright')));
}

{
  // A host edit that sets only some params (orb.setParams({ glow: 2 })) leaves
  // the base without `spread`. Leaving a state that patches `spread` must not
  // send the engine `undefined` for it.
  const { rt, received } = bareRuntime();
  rt.updateGlobalSettings = () => {};
  rt.refitCamera = () => {};
  rt.setState('thinking');
  rt.advance(1.5);
  rt.applyParams({ params: { glow: 2 } });
  rt.setState('idle');
  rt.advance(0.5);
  rt.advance(1);
  const undef = received.filter((p) => Object.values(p).some((v) => v === undefined));
  ok('a partial host edit never sends undefined to the engine', undef.length === 0, JSON.stringify(undef));
}

{
  // The route clamps: amount 4 on a 0..1 param with the square LFO high would
  // add 2, so the modulated value is 1 every frame. The first advance sends it;
  // the second only re-sends it because the transition's step forgot it. If the
  // engine's last `spread` is the bare eased value, the modulated one was lost.
  const { rt, received } = bareRuntime();
  rt.modulation.setConfig({
    ...createDefaultModulation(),
    enabled: true,
    sources: { ...createDefaultModulation().sources, lfo1: { type: 'lfo', shape: 'square', rate: 0.001, phase: 0 } },
    routes: [{ source: 'lfo1', dest: 'spread', amount: 4 }],
  });
  rt.setState('thinking');
  rt.advance(0.1);
  rt.advance(0.1);
  const last = received.filter((p) => 'spread' in p).at(-1);
  ok('a clamped route still wins over the eased value mid-transition', last?.spread === 1, JSON.stringify(last));
  ok('the bare eased value is below the clamp', rt.baseParams.spread < 1 && rt.baseParams.spread > 0.1, String(rt.baseParams.spread));
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
