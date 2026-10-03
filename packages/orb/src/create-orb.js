// The one call most consumers should ever need.
//
// Construct, register the engines you were handed, load a config, start the
// loop. Everything here is otherwise reachable through OrbRuntime, which stays
// exported for hosts that want to drive their own loop — the studio does, and
// it is the reason the runtime has no loop of its own.
//
// Engines are passed in rather than imported. A convenience function that
// reached for the catalog's factories would statically import every engine and undo
// the reason the catalog carries `factoryName` as a string:
//
//   import { createOrb } from '@lumaform/orb';
//   import { nebula } from '@lumaform/orb/engines';
//   const orb = createOrb(el, { engines: { nebula }, config });
//
//   // (templates are planned; until then pass `{ engine, config }`)
//   import { ember } from '@lumaform/orb/templates';
//   const orb = createOrb(el, { template: ember, state: 'idle' });
//   orb.setState('thinking');
//
// That import list is the bundle. Naming one engine ships one engine.
import { OrbRuntime } from './core/runtime.js';
import { getDefaultEngineParams } from './engine-catalog.js';
import { planMount } from './core/mount-plan.js';

export function createOrb(container, options = {}) {
  const {
    engines = {},
    template = null,
    config = null,
    engine = null,
    params = null,
    global = null,
    state = null,
    autoStart = true,
    ...runtimeOptions
  } = options;

  if (!container) throw new TypeError('createOrb(container, …) needs a container element.');

  const runtime = new OrbRuntime(container, runtimeOptions);
  const plan = planMount({ engines, template, config, engine, params, global, state });

  for (const [id, factory] of Object.entries(plan.engines)) {
    if (typeof factory !== 'function') {
      console.error(`createOrb: engine "${id}" is not a factory function.`);
      continue;
    }
    runtime.registerEngine(id, factory);
  }

  const { dropped } = plan;
  if (plan.engine) runtime.mountEngine(plan.engine, plan.mount);

  // The runtime's applyParams replaces the base look wholesale, so a partial
  // setParams({ glow: 2 }) would drop every other key and a later state
  // transition would have nothing to revert to. The handle keeps the full look
  // and merges edits into it.
  let look = { ...(plan.mount?.params || {}) };

  let rafId = null;

  function frame() {
    rafId = requestAnimationFrame(frame);
    runtime.tick(runtime.clock.getDelta());
  }

  function start() {
    if (rafId !== null) return;
    // Reset the clock: its delta is time since the last read, which after a
    // pause is the whole length of the pause and would jump the animation.
    runtime.clock.getDelta();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (autoStart) start();

  return {
    runtime,
    start,
    stop,
    get isRunning() {
      return rafId !== null;
    },
    // Keys the config carried that the engine's schema does not define. Worth
    // surfacing rather than swallowing: it is usually a version mismatch.
    dropped,
    setEngine(type, next = {}) {
      look = { ...getDefaultEngineParams(type), ...(next.params || {}) };
      return runtime.mountEngine(type, {
        params: { ...look },
        global: next.global || {},
        modulation: next.modulation,
      });
    },
    setParams(nextParams, nextGlobal = {}) {
      look = { ...look, ...(nextParams || {}) };
      runtime.applyParams({ params: { ...look }, global: nextGlobal });
    },
    loadConfig(nextConfig, { state: nextState = null } = {}) {
      const next = planMount({ config: nextConfig, state: nextState });
      if (!next.engine) {
        console.error('loadConfig: the config does not name an engine, so there is nothing to mount.');
        return { engine: null, dropped: next.dropped };
      }
      look = { ...next.mount.params };
      runtime.mountEngine(next.engine, next.mount);
      return { engine: next.engine, dropped: next.dropped };
    },
    // Moves toward a named state from the config or template. Returns false,
    // and warns, for a name the config does not define.
    setState(name, opts) {
      return runtime.setState(name, opts);
    },
    get state() {
      return runtime.state;
    },
    get states() {
      return runtime.stateNames;
    },
    // Anything with `.read() → 0..1` and `.isActive`. Deliberately not a
    // microphone: see the note in ./audio about why consent is the consumer's.
    setAudioSource(source) {
      runtime.setAudioSource(source);
    },
    dispose() {
      stop();
      runtime.dispose();
    },
  };
}
