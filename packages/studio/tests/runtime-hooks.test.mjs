// The runtime/studio seam.
//
// OrbRuntime ships standalone in @lumaform/orb, where the variation grid, the
// rehearsal player and the param tween do not exist. Any runtime method that
// reaches for them directly throws for every consumer who is not the studio —
// and it throws at frame time, deep inside requestAnimationFrame, which is a
// miserable place to debug.
//
// Four hooks are the entire contract. The runtime declares them as no-ops; the
// studio overrides them in studio-sequence.js and studio-grid.js.

import { readFileSync } from 'node:fs';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

// The runtime half currently lives in studio.js; Task 4 of the split moves it
// to packages/orb/src/core/runtime.js and repoints this one line. The
// assertions below are what makes that move safe, so they land first.
const runtime = readFileSync(new URL('../src/core/studio.js', import.meta.url), 'utf8');

const HOOKS = ['onEngineWillChange', 'onEngineDidChange', 'advanceTimeline', 'renderOverride'];
for (const hook of HOOKS) {
  ok(`${hook} is declared on the runtime`, new RegExp(`\\n  ${hook}\\(`).test(runtime));
}

// Extracts a method body by brace matching, so a nested `}` inside the method
// does not truncate it. Naive indexOf('\n  }') stops at the first closing brace
// at method indentation, which several of these methods contain.
function methodBody(source, name) {
  const start = source.search(new RegExp(`\\n  ${name}\\(`));
  if (start === -1) return '';
  const open = source.indexOf('{', start);
  if (open === -1) return '';

  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return '';
}

// Names that only exist once the studio has extended the runtime.
const STUDIO_ONLY = [
  'stopSequence',
  'rebuildGridForEngine',
  'applySequenceStep',
  'sequencePlayer',
  'currentSequence',
  'paramTween',
  'this.grid',
  'clipRecorder',
];

const RUNTIME_METHODS = ['setEngine', 'updateParameters', 'renderFrame', 'dispose'];

for (const method of RUNTIME_METHODS) {
  const body = methodBody(runtime, method);
  ok(`${method} exists on the runtime`, body.length > 0);
  if (!body) continue;

  for (const name of STUDIO_ONLY) {
    ok(`${method} does not reach for ${name}`, !body.includes(name));
  }
}

// The hooks must be genuinely inert on their own, or a bare runtime changes
// behaviour rather than merely doing less.
ok('advanceTimeline defaults to the whole frame delta',
  /advanceTimeline\(delta\)\s*\{[^}]*return delta \* 1000;/.test(runtime));
ok('renderOverride defaults to not claiming the frame',
  /renderOverride\([^)]*\)\s*\{[^}]*return false;/.test(runtime));

// And the studio must actually override them, or the grid and rehearsal are
// silently dead while every assertion above still passes.
const grid = readFileSync(new URL('../src/core/studio-grid.js', import.meta.url), 'utf8');
const sequence = readFileSync(new URL('../src/core/studio-sequence.js', import.meta.url), 'utf8');

ok('the studio overrides onEngineDidChange', /onEngineDidChange\(/.test(grid));
ok('the studio overrides renderOverride', /renderOverride\(/.test(grid));
ok('the studio overrides onEngineWillChange', /onEngineWillChange\(/.test(sequence));
ok('the studio overrides advanceTimeline', /advanceTimeline\(/.test(sequence));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
