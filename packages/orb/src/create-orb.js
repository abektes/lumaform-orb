// The one call most consumers should ever need.
//
// Construct, register the engines you were handed, load a config, start the
// loop. Everything here is otherwise reachable through OrbRuntime, which stays
// exported for hosts that want to drive their own loop — the studio does, and
// it is the reason the runtime has no loop of its own.
//
// Engines are passed in rather than imported. A convenience function that
// reached for the catalog's factories would statically import all 23 and undo
// the reason the catalog carries `factoryName` as a string:
//
//   import { createOrb } from '@lumaform/orb';
//   import { nebula } from '@lumaform/orb/engines';
//   const orb = createOrb(el, { engines: { nebula }, config });
//
// That import list is the bundle. Naming one engine ships one engine.
import { OrbRuntime } from './core/runtime.js';
import { ENGINE_PARAM_DEFINITIONS, getDefaultEngineParams } from './engine-catalog.js';
import { readConfig } from './core/config-io.js';

export function createOrb(container, options = {}) {
  const {
    engines = {},
    config = null,
    engine = null,
    params = null,
    global = null,
    autoStart = true,
    ...runtimeOptions
  } = options;

  if (!container) throw new TypeError('createOrb(container, …) needs a container element.');

  const runtime = new OrbRuntime(container, runtimeOptions);

  for (const [id, factory] of Object.entries(engines)) {
    if (typeof factory !== 'function') {
      console.error(`createOrb: engine "${id}" is not a factory function.`);
      continue;
    }
    runtime.registerEngine(id, factory);
  }

  // A config names its own engine, so it decides what mounts. Without one, fall
  // back to an explicit `engine`, then to the only engine that was handed over —
  // a consumer who passed exactly one clearly meant that one.
  const registered = Object.keys(engines);
  const startingEngine = config?.engine ?? engine ?? (registered.length === 1 ? registered[0] : null);
  let dropped = [];

  if (startingEngine) {
    const defs = ENGINE_PARAM_DEFINITIONS[startingEngine] || {};
    // Schema defaults first, so a partial config does not leave an engine
    // holding undefined for every key it omitted.
    let startParams = { ...getDefaultEngineParams(startingEngine), ...(params || {}) };
    let startGlobal = global || {};
    let modulation;

    if (config) {
      const record = readConfig(config, defs);
      dropped = record.dropped;
      startParams = { ...startParams, ...record.params };
      if (record.global) startGlobal = { ...startGlobal, ...record.global };
      if (record.modulation) modulation = record.modulation;
    }

    runtime.mountEngine(startingEngine, { params: startParams, global: startGlobal, modulation });
  }

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
      return runtime.mountEngine(type, {
        params: { ...getDefaultEngineParams(type), ...(next.params || {}) },
        global: next.global || {},
        modulation: next.modulation,
      });
    },
    setParams(nextParams, nextGlobal = {}) {
      runtime.applyParams({ params: nextParams, global: nextGlobal });
    },
    loadConfig(nextConfig) {
      const defs = ENGINE_PARAM_DEFINITIONS[nextConfig.engine] || {};
      const record = readConfig(nextConfig, defs);
      runtime.mountEngine(record.engine, {
        params: { ...getDefaultEngineParams(record.engine), ...record.params },
        global: record.global || {},
        modulation: record.modulation,
      });
      return { engine: record.engine, dropped: record.dropped };
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
