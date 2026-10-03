// Engines self-dispose: everything a factory puts on the GPU, it releases.
//
// The only check of this was new-engines.test.mjs, against a hand-kept list of
// five engines, and it counted scene children — an engine that removed its mesh
// but never disposed the geometry passed. At 45 engines a leak would show only
// as memory climbing while someone flicks through the menu.
//
// Every engine on the barrel is built, stepped, made to rebuild once per
// geometry parameter, and disposed. Each geometry, material and texture seen in
// the scene at any point must have been disposed by the end: one dropped by a
// rebuild has to be released by that rebuild, since the final dispose() can no
// longer reach it.
import * as THREE from 'three';
import * as ENGINES from '../src/engines/index.js';
import { ENGINE_PARAM_DEFINITIONS, getDefaultEngineParams } from '../src/engine-catalog.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const disposed = new Set();
for (const proto of [THREE.BufferGeometry.prototype, THREE.Material.prototype, THREE.Texture.prototype]) {
  const original = proto.dispose;
  proto.dispose = function dispose(...args) {
    disposed.add(this);
    return original.apply(this, args);
  };
}

// three's Sprite shares one module-level geometry across every sprite and never
// disposes it; no engine owns it.
const SHARED_SPRITE_GEOMETRY = new THREE.Sprite().geometry;

function collect(scene, into) {
  scene.traverse((object) => {
    if (object.geometry && object.geometry !== SHARED_SPRITE_GEOMETRY) into.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      into.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) into.add(value);
      for (const uniform of Object.values(material.uniforms || {})) {
        if (uniform?.value?.isTexture) into.add(uniform.value);
      }
    }
  });
}

// A value different from the current one, within the schema, so the engine
// actually takes its rebuild path.
function anotherValue(def, current) {
  if (def.type === 'select') return def.options.find((option) => option !== current);
  if (def.type === 'number') {
    const step = def.step || (def.max - def.min) / 10;
    return current + step <= def.max ? current + step : current - step;
  }
  return undefined;
}

const renderer = { getSize: (v) => v.set(800, 600), getPixelRatio: () => 1, info: { memory: { geometries: 0, textures: 0 } } };
const frame = (time) => ({ time, delta: 1 / 60, pointer: new THREE.Vector2(), marchQuality: 1, fps: 60 });

const exported = Object.entries(ENGINES);
ok('the barrel exports every catalog engine', exported.length === Object.keys(ENGINE_PARAM_DEFINITIONS).length,
  `${exported.length} exported, ${Object.keys(ENGINE_PARAM_DEFINITIONS).length} in the catalog`);

for (const [id, factory] of exported) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 100);
  const params = getDefaultEngineParams(id);
  const engine = factory({ scene, camera, renderer, params });

  const seen = new Set();
  let time = 0;
  const step = () => { time += 1 / 60; engine.update(frame(time)); collect(scene, seen); };
  step();
  engine.onPulse?.();
  step();

  for (const [key, def] of Object.entries(ENGINE_PARAM_DEFINITIONS[id])) {
    if (def.section !== 'geometry') continue;
    const next = anotherValue(def, params[key]);
    if (next === undefined) continue;
    engine.setParams({ [key]: next });
    params[key] = next;
    step();
  }

  engine.dispose();

  const leaked = [...seen].filter((resource) => !disposed.has(resource));
  const kinds = leaked.map((r) => (r.isTexture ? 'texture' : r.isMaterial ? r.type : 'geometry'));
  ok(`${id}: releases every geometry, material and texture`, leaked.length === 0,
    leaked.length ? `${leaked.length} leaked: ${kinds.join(', ')}` : `${seen.size} released`);
  ok(`${id}: leaves the scene empty`, scene.children.length === 0, `${scene.children.length} left`);
}

console.log(failures ? `\n${failures} FAILED` : '\ndispose: all checks passed');
process.exit(failures ? 1 : 0);
