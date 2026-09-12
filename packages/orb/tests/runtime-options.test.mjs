// The defaults a consumer gets for free.
//
// These shipped as the studio's defaults: OrbitControls on with autoRotate, a
// preserved drawing buffer for clip capture, sized from window.innerWidth. A
// host dropping an orb into a 400px div got a window-sized canvas that span and
// responded to drag. The package's own design doc said "OrbitControls: off by
// default" while the constructor turned them on, which is the shape of the
// problem: nobody reads a constructor, everybody reads a default.
import { EMBED_DEFAULTS, resolveRuntimeOptions } from '../src/core/runtime-options.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// --- the quiet defaults ---

ok('controls are off by default', EMBED_DEFAULTS.controls === false);
ok('the camera does not auto-rotate by default', EMBED_DEFAULTS.autoRotate === false);
ok('the drawing buffer is not preserved by default', EMBED_DEFAULTS.preserveDrawingBuffer === false);
ok('defaults are frozen', Object.isFrozen(EMBED_DEFAULTS));

{
  const r = resolveRuntimeOptions();
  ok('no options yields the embed defaults',
    r.controls === false && r.autoRotate === false && r.preserveDrawingBuffer === false);
  ok('resolving does not alias the frozen defaults', r !== EMBED_DEFAULTS);
}

// --- opting in ---

{
  const r = resolveRuntimeOptions({ controls: true, preserveDrawingBuffer: true, autoRotate: true });
  ok('a caller can opt into controls', r.controls === true);
  ok('a caller can opt into autoRotate', r.autoRotate === true);
  ok('a caller can opt into the capture buffer', r.preserveDrawingBuffer === true);
}

{
  // A partial object must not wipe the keys it omits.
  const r = resolveRuntimeOptions({ controls: true });
  ok('omitted keys keep their defaults',
    r.controls === true && r.autoRotate === false && r.preserveDrawingBuffer === false);
}

// --- hostile and absent input ---

ok('null options resolve to defaults', resolveRuntimeOptions(null).controls === false);
ok('a non-object resolves to defaults', resolveRuntimeOptions(42).controls === false);
ok('explicit undefined keeps the default',
  resolveRuntimeOptions({ controls: undefined }).controls === false);
ok('a truthy non-boolean is coerced, not stored raw',
  resolveRuntimeOptions({ controls: 'yes' }).controls === true);
ok('explicit false is honoured over a true default',
  resolveRuntimeOptions({ enableZoom: false }).enableZoom === false);

{
  // An unknown key must not become part of the resolved config.
  const r = resolveRuntimeOptions({ nonsense: true });
  ok('unknown keys are dropped', r.nonsense === undefined, Object.keys(r).join(','));
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
