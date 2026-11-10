// The runtime's mount and dispose transitions, through the real methods. The
// constructor needs WebGL, so the instance is built from the prototype with
// only the fields these paths read. See docs/STATE-MACHINES.md, issue D.
import { OrbRuntime } from '../src/core/runtime.js';
import { createStatePlayer } from '../src/core/state-player.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

function bareRuntime() {
  const disposed = [];
  const rt = Object.create(OrbRuntime.prototype);
  Object.assign(rt, {
    engineConstructors: new Map(),
    statePlayer: createStatePlayer(),
    activeEngineType: 'nebula',
    activeEngine: { name: 'nebula', dispose() { disposed.push('nebula'); }, update() {} },
    disposed: false,
    fpsTracker: { ticks: 0, tick() { this.ticks++; } },
  });
  return { rt, disposed };
}

// --- D1: an unregistered engine is refused before anything is torn down ---
{
  const { rt, disposed } = bareRuntime();
  const engine = rt.activeEngine;
  const error = console.error;
  let logged = '';
  console.error = (message) => { logged = String(message); };
  const result = rt.mountEngine('nebuls', { params: {} });
  console.error = error;
  ok('mounting an unknown engine returns false', result === false, String(result));
  ok('it names the engine it could not find', logged.includes('nebuls'), logged);
  // It used to dispose first, leaving a blank canvas that still claimed "nebula".
  ok('the current engine is not disposed', disposed.length === 0);
  ok('the current engine stays mounted', rt.activeEngine === engine && rt.activeEngineType === 'nebula');
}

// --- D2: dispose is idempotent and terminal ---
{
  const { rt, disposed } = bareRuntime();
  let removed = 0;
  Object.assign(rt, {
    resizeObserver: { disconnect() {} },
    renderer: { dispose() {}, domElement: { remove() { removed++; } } },
  });
  rt.dispose();
  rt.dispose();
  ok('a second dispose does not dispose the engine again', disposed.length === 1, disposed.join(','));
  ok('a second dispose does not touch the page again', removed === 1);
  ok('dispose drops the engine', rt.activeEngine === null);

  let advanced = 0;
  rt.advance = () => { advanced++; };
  rt.render = () => { advanced++; };
  rt.tick(0.016);
  ok('tick after dispose does nothing', advanced === 0 && rt.fpsTracker.ticks === 0);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
