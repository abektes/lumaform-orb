import { parseConfigFile, sanitizeParams, readConfig, lookGlobal } from '../src/core/config-io.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ENGINES = ['tesseract', 'quantum'];
const DEFS = {
  edgeGlow: { type: 'number', label: 'Edge Luma', min: 0, max: 3, step: 0.05, default: 1.2, section: 'colors' },
  cubeSize: { type: 'number', label: 'Size', min: 0.6, max: 2.2, step: 0.05, default: 1.25, section: 'geometry' },
  shape:    { type: 'select', label: 'Shape', options: ['sphere', 'cube'], default: 'sphere', section: 'geometry' },
  color1:   { type: 'color', label: 'Primary', default: '#ffed00', section: 'colors' },
};

// --- parseConfigFile ---
const single = JSON.stringify({ engine: 'quantum', global: {}, params: { edgeGlow: 1 } });
let r = parseConfigFile(single, ENGINES);
ok('accepts a single config', r.ok === true && r.configs.length === 1);
const attributed = JSON.stringify({
  engine: 'quantum',
  global: {},
  params: { edgeGlow: 1 },
  mutatedKeys: ['edgeGlow'],
});
r = parseConfigFile(attributed, ENGINES);
ok('accepts additive mutation attribution metadata',
  r.ok === true && eq(r.configs[0].mutatedKeys, ['edgeGlow']));

const many = JSON.stringify([
  { engine: 'quantum', global: {}, params: { edgeGlow: 1 } },
  { engine: 'quantum', global: {}, params: { edgeGlow: 2 } },
]);
r = parseConfigFile(many, ENGINES);
ok('accepts a grid export array', r.ok === true && r.configs.length === 2);

ok('rejects malformed json', parseConfigFile('{nope', ENGINES).ok === false);
ok('rejects a bare number', parseConfigFile('42', ENGINES).ok === false);
ok('rejects null', parseConfigFile('null', ENGINES).ok === false);
ok('rejects an empty array', parseConfigFile('[]', ENGINES).ok === false);
ok('rejects an unknown engine', parseConfigFile(JSON.stringify({ engine: 'nope', params: {} }), ENGINES).ok === false);
ok('rejects a missing params object', parseConfigFile(JSON.stringify({ engine: 'quantum' }), ENGINES).ok === false);
ok('rejects params that is not an object', parseConfigFile(JSON.stringify({ engine: 'quantum', params: 5 }), ENGINES).ok === false);
ok('error is a non-empty string', typeof parseConfigFile('{nope', ENGINES).error === 'string' && parseConfigFile('{nope', ENGINES).error.length > 0);
ok('rejects an array where one entry is bad', parseConfigFile(JSON.stringify([
  { engine: 'quantum', params: {} }, { engine: 'bogus', params: {} },
]), ENGINES).ok === false);

// --- sanitizeParams ---
let s = sanitizeParams({ edgeGlow: 1.5, unknownKey: 3 }, DEFS);
ok('keeps known keys', s.params.edgeGlow === 1.5);
ok('drops unknown keys', s.params.unknownKey === undefined && s.dropped.includes('unknownKey'));

s = sanitizeParams({ edgeGlow: 99 }, DEFS);
ok('clamps above max', s.params.edgeGlow === 3);
s = sanitizeParams({ edgeGlow: -5 }, DEFS);
ok('clamps below min', s.params.edgeGlow === 0);
s = sanitizeParams({ edgeGlow: '2.0' }, DEFS);
ok('coerces numeric strings', s.params.edgeGlow === 2);
s = sanitizeParams({ edgeGlow: 'abc' }, DEFS);
ok('drops non-numeric values', s.params.edgeGlow === undefined && s.dropped.includes('edgeGlow'));
s = sanitizeParams({ edgeGlow: null }, DEFS);
ok('drops null numbers', s.params.edgeGlow === undefined);

s = sanitizeParams({ shape: 'cube' }, DEFS);
ok('keeps valid select options', s.params.shape === 'cube');
s = sanitizeParams({ shape: 'dodecahedron' }, DEFS);
ok('drops invalid select options', s.params.shape === undefined && s.dropped.includes('shape'));

s = sanitizeParams({ color1: '#00ff00' }, DEFS);
ok('keeps valid hex colours', s.params.color1 === '#00ff00');
s = sanitizeParams({ color1: 'green' }, DEFS);
ok('drops invalid colours', s.params.color1 === undefined && s.dropped.includes('color1'));

ok('handles empty params', eq(sanitizeParams({}, DEFS).params, {}));
ok('handles undefined params', eq(sanitizeParams(undefined, DEFS).params, {}));

// --- readConfig: pure, returns what the file asked for ---
//
// Where the record goes is the host's problem and is tested in
// packages/studio/tests/config-apply.test.mjs. What it *means* is tested here.

const res = readConfig({
  engine: 'quantum',
  global: { bloomStrength: 0.9 },
  params: { edgeGlow: 2.5, bogus: 1 },
  modulation: { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.5 }] },
}, DEFS);

ok('reports the engine', res.engine === 'quantum');
ok('sanitizes params', res.params.edgeGlow === 2.5);
ok('drops keys outside the schema', res.dropped.includes('bogus') && res.params.bogus === undefined);
ok('carries global', res.global.bloomStrength === 0.9);
ok('carries modulation', res.modulation.routes.length === 1);

// null, not empty. A caller must be able to tell "this file has no rack" from
// "this file has an empty rack" — the first must leave the current one alone.
const legacy = readConfig({ engine: 'quantum', params: { edgeGlow: 1 } }, DEFS);
ok('absent modulation reads as null', legacy.modulation === null);
ok('absent global reads as null', legacy.global === null);

// A file describes a look, not the machine it was exported on. `dpr` is the
// render quality the author picked on their screen and `paused` is whether they
// had stopped the orb to look at it; applied on playback, the first forced one
// person's choice onto every viewer and the second shipped a frozen orb.
const session = readConfig({
  engine: 'quantum',
  global: { dpr: 1.2, paused: true, bloomStrength: 0.9, background: '#101010' },
  params: {},
}, DEFS);
ok('readConfig drops dpr from a file', !('dpr' in session.global), JSON.stringify(session.global));
ok('readConfig drops paused from a file', !('paused' in session.global));
ok('readConfig keeps the look', session.global.bloomStrength === 0.9 && session.global.background === '#101010');
ok('lookGlobal strips the same keys', JSON.stringify(lookGlobal({ dpr: 2, paused: false, exposure: 1 })) === '{"exposure":1}');
ok('lookGlobal passes null through', lookGlobal(null) === null);

// The record must not alias the parsed file.
const incoming = { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.5 }] };
const detached = readConfig({ engine: 'quantum', params: {}, modulation: incoming }, DEFS);
incoming.routes.push({ source: 'lfo1', dest: '_timeScale', amount: 1 });
ok('modulation is detached from the source object', detached.modulation.routes.length === 1);

const meta = readConfig(JSON.parse(attributed), DEFS);
ok('additive mutation attribution metadata is ignored',
  meta.params.edgeGlow === 1 && meta.mutatedKeys === undefined);

// readConfig must not touch what it is given.
const frozenInput = Object.freeze({
  engine: 'quantum', global: Object.freeze({ bloomStrength: 0.3 }), params: Object.freeze({ edgeGlow: 2 }),
});
let threw = null;
try { readConfig(frozenInput, DEFS); } catch (e) { threw = String(e); }
ok('readConfig does not mutate its input', threw === null, threw || '');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
