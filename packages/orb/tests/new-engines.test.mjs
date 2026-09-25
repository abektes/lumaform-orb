import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVocalisEngine } from '../src/engines/vocalis-engine.js';
import { createAetheriaEngine } from '../src/engines/aetheria-engine.js';
import { createSuperpositionEngine } from '../src/engines/superposition-engine.js';
import { createSynthesisEngine } from '../src/engines/synthesis-engine.js';
import { createFerroTrailsEngine } from '../src/engines/ferro-trails-engine.js';
import { ENGINE_PARAM_DEFINITIONS, ENGINE_TYPES, getDefaultEngineParams } from '../src/engine-catalog.js';

function mockRenderer() {
  return {
    getSize: (target) => target.set(800, 600),
    getPixelRatio: () => 1.0,
    info: {
      memory: {
        geometries: 0,
        textures: 0,
      },
    },
  };
}

function testEngineContract(id, factory) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const renderer = mockRenderer();
  const params = getDefaultEngineParams(id);

  const initialChildren = scene.children.length;
  const engine = factory({ scene, camera, renderer, params });

  assert.ok(engine, `${id} factory returns an object`);
  assert.ok(Number.isFinite(engine.frame?.radius) && engine.frame.radius > 0, `${id} declares positive frame radius`);
  assert.equal(typeof engine.update, 'function', `${id} implements update`);
  assert.equal(typeof engine.setParams, 'function', `${id} implements setParams`);
  assert.equal(typeof engine.dispose, 'function', `${id} implements dispose`);

  // Update step
  assert.doesNotThrow(() => {
    engine.update({ time: 0.5, delta: 0.016 });
  }, `${id} update executes cleanly`);

  // Pulse
  if (typeof engine.onPulse === 'function') {
    assert.doesNotThrow(() => {
      engine.onPulse();
    }, `${id} onPulse executes cleanly`);
  }

  // Partial param update across sections
  const defs = ENGINE_PARAM_DEFINITIONS[id];
  const patch = {};
  for (const [key, def] of Object.entries(defs)) {
    if (def.type === 'number') {
      patch[key] = (def.min + def.max) / 2;
    } else if (def.type === 'color') {
      patch[key] = '#ff00aa';
    }
  }
  assert.doesNotThrow(() => {
    engine.setParams(patch);
  }, `${id} setParams executes cleanly`);

  // Another frame after params
  assert.doesNotThrow(() => {
    engine.update({ time: 1.0, delta: 0.016 });
  }, `${id} update after setParams executes cleanly`);

  // Resize
  if (typeof engine.onResize === 'function') {
    assert.doesNotThrow(() => {
      engine.onResize(1024, 768);
    }, `${id} onResize executes cleanly`);
  }

  // Dispose
  assert.doesNotThrow(() => {
    engine.dispose();
  }, `${id} dispose executes cleanly`);

  assert.equal(scene.children.length, initialChildren, `${id} dispose removes all scene children`);
  console.log(`PASS  ${id} conforms to engine contract and disposes cleanly`);
}

// 1. Contract tests
testEngineContract(ENGINE_TYPES.VOCALIS, createVocalisEngine);
testEngineContract(ENGINE_TYPES.AETHERIA, createAetheriaEngine);
testEngineContract(ENGINE_TYPES.SUPERPOSITION, createSuperpositionEngine);
testEngineContract(ENGINE_TYPES.SYNTHESIS, createSynthesisEngine);
testEngineContract(ENGINE_TYPES.FERRO_TRAILS, createFerroTrailsEngine);

// Vocalis's mouth, the glottal slit, can be switched off for a face-less orb.
// It is one card, so "off" has to hide all of it: lens, rim, glow and pool.
{
  const mouthCard = (scene) => {
    let card = null;
    scene.traverse((o) => { if (o.material?.uniforms?.uLength && o.material.uniforms.uWidth) card = o; });
    return card;
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const params = getDefaultEngineParams(ENGINE_TYPES.VOCALIS);
  assert.equal(params.mouth, 'on', 'the mouth is on by default');
  const engine = createVocalisEngine({ scene, camera, renderer: mockRenderer(), params });
  engine.update({ time: 0.1, delta: 0.016 });
  assert.ok(mouthCard(scene)?.visible, 'the mouth shows by default');
  engine.setParams({ mouth: 'off' });
  engine.update({ time: 0.2, delta: 0.016 });
  assert.equal(mouthCard(scene).visible, false, 'mouth off hides the slit');
  engine.setParams({ mouth: 'on' });
  assert.equal(mouthCard(scene).visible, true, 'mouth on shows it again');
  engine.dispose();

  const quiet = new THREE.Scene();
  const faceless = createVocalisEngine({ scene: quiet, camera, renderer: mockRenderer(), params: { ...params, mouth: 'off' } });
  assert.equal(mouthCard(quiet).visible, false, 'a config saved with the mouth off starts without it');
  faceless.dispose();
  console.log('PASS  vocalis mouth switches off and on');
}

// 2. Ten engine switch cycles to ensure no accumulated memory leaks
console.log('\nTesting 10 switch cycles for memory stability...');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const renderer = mockRenderer();

const testEngines = [
  { id: ENGINE_TYPES.VOCALIS, factory: createVocalisEngine },
  { id: ENGINE_TYPES.AETHERIA, factory: createAetheriaEngine },
  { id: ENGINE_TYPES.SUPERPOSITION, factory: createSuperpositionEngine },
  { id: ENGINE_TYPES.SYNTHESIS, factory: createSynthesisEngine },
  { id: ENGINE_TYPES.FERRO_TRAILS, factory: createFerroTrailsEngine },
];

for (let cycle = 0; cycle < 10; cycle++) {
  for (const { id, factory } of testEngines) {
    const params = getDefaultEngineParams(id);
    const instance = factory({ scene, camera, renderer, params });
    instance.update({ time: cycle * 0.1, delta: 0.016 });
    instance.dispose();
  }
}
assert.equal(scene.children.length, 0, 'Scene is completely clean after 10 switch cycles');
console.log('PASS  10 engine switch cycles leave scene clean with 0 orphan objects');

console.log('\nALL NEW ENGINE UNIT TESTS PASS\n');
