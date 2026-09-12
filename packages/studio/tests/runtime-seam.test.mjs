// The seam between the runtime and the studio.
//
// This replaces runtime-hooks.test.mjs, which asserted the opposite design and
// checked it by regex over runtime.js source text — it never loaded the module,
// so it could confirm a method was *written* but not that it existed, and it
// went on passing while the comment above the hooks said "these four" about
// five of them.
//
// The rule now: the runtime owns no loop and declares no hooks, and the studio
// composes the runtime's primitives rather than overriding them. That is
// checkable against the real classes, because importing them does not need a
// WebGL context — only constructing them does.
import { OrbRuntime } from '@lumaform/orb';
import { OrbStudio } from '../src/core/studio.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const methods = (cls) =>
  Object.getOwnPropertyNames(cls.prototype).filter((n) => n !== 'constructor');

const runtimeMethods = methods(OrbRuntime);
const studioMethods = methods(OrbStudio);

// --- the hooks are gone ---

for (const hook of ['onEngineWillChange', 'onEngineDidChange', 'advanceTimeline', 'renderOverride', 'onDispose']) {
  ok(`the runtime declares no ${hook} hook`, !runtimeMethods.includes(hook));
}

// --- the runtime owns primitives, not a loop ---

for (const m of ['advance', 'render', 'tick', 'mountEngine', 'applyParams']) {
  ok(`the runtime exposes ${m}()`, runtimeMethods.includes(m), runtimeMethods.join(','));
}

ok('the runtime has no frame loop of its own', !runtimeMethods.includes('renderFrame'));

// --- the studio composes rather than overrides ---

// dispose is the one deliberate exception: a subclass releasing what it added
// before calling super is an ordinary lifecycle chain, not an inversion. The
// parent never calls into the child, which is the property that matters.
const ALLOWED_OVERRIDES = new Set(['dispose']);
const overrides = studioMethods.filter((n) => runtimeMethods.includes(n));
const unexpected = overrides.filter((n) => !ALLOWED_OVERRIDES.has(n));

ok('the studio overrides no runtime method beyond the allowed lifecycle chain',
  unexpected.length === 0, unexpected.join(', '));

ok('the studio owns the frame loop', studioMethods.includes('renderFrame'));
ok('the studio owns its own engine swap', studioMethods.includes('setEngine'));
ok('setEngine is not a runtime method the studio shadows', !runtimeMethods.includes('setEngine'));

// --- the runtime does not know what a studio is ---

// A runtime that reaches into the grid or the rehearsal player breaks for every
// consumer that is not this studio. Reading the source is the right tool here:
// the claim is about what the module may mention at all.
const { readFileSync } = await import('node:fs');
const runtimeSource = readFileSync(
  new URL('../../orb/src/core/runtime.js', import.meta.url), 'utf8'
);
const code = runtimeSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

for (const studioOnly of ['this.grid', 'sequencePlayer', 'paramTween', 'clipRecorder', 'sweepInfo']) {
  ok(`the runtime never touches ${studioOnly}`, !code.includes(studioOnly));
}

// --- the runtime's engine API is not the studio's store ---

// `state.engines[type]` in the runtime made the studio's store shape part of
// the published API: a consumer with a config file had to rebuild that store
// before it could mount anything.
ok('mountEngine does not index a store by engine type',
  !/state\.engines\[/.test(code));

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
