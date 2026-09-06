import { parseConfigFile, sanitizeParams, applyConfig } from '../src/core/config-io.js';

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

// --- applyConfig ---
function makeState() {
  return {
    engine: 'tesseract',
    activePresetName: 'x',
    global: { bloomStrength: 0.5, exposure: 1 },
    modulation: { enabled: false, sources: {}, routes: [] },
    engines: {
      tesseract: { edgeGlow: 0.9 },
      quantum: { edgeGlow: 1.2, cubeSize: 1.25, shape: 'sphere', color1: '#ffed00' },
    },
  };
}

const st = makeState();
const globalRef = st.global;
const enginesRef = st.engines;
const quantumRef = st.engines.quantum;

const res = applyConfig(st, {
  engine: 'quantum',
  global: { bloomStrength: 0.9 },
  params: { edgeGlow: 2.5, bogus: 1 },
  modulation: { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.5 }] },
}, DEFS);

ok('switches engine', st.engine === 'quantum');
ok('merges params over the existing bag', st.engines.quantum.edgeGlow === 2.5);
ok('does NOT blank omitted keys', st.engines.quantum.cubeSize === 1.25);
ok('restores modulation', st.modulation.routes.length === 1);
ok('applies global', st.global.bloomStrength === 0.9);
ok('reports dropped keys', res.dropped.includes('bogus'));
ok('keeps global object identity', st.global === globalRef);
ok('keeps engines map identity', st.engines === enginesRef);
ok('keeps the target param bag identity', st.engines.quantum === quantumRef);

// legacy config with no modulation must not wipe the current rack
const st2 = makeState();
st2.modulation = { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 1 }] };
applyConfig(st2, { engine: 'quantum', global: {}, params: { edgeGlow: 1 } }, DEFS);
ok('legacy config leaves modulation untouched', st2.modulation.routes.length === 1);

// applied modulation must be detached from the source object
const st3 = makeState();
const incoming = { enabled: true, sources: {}, routes: [{ source: 'lfo1', dest: 'edgeGlow', amount: 0.5 }] };
applyConfig(st3, { engine: 'quantum', global: {}, params: {}, modulation: incoming }, DEFS);
incoming.routes.push({ source: 'lfo1', dest: '_timeScale', amount: 1 });
ok('restored modulation is a detached copy', st3.modulation.routes.length === 1);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
