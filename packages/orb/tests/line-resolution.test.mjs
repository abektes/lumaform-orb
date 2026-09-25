// LineMaterial draws `linewidth` in pixels of `resolution`, so resolution has
// to be the canvas the lines land on. Six engines set it from
// window.innerWidth/innerHeight. The runtime's resize after mount hid that in
// the studio, where the canvas is nearly the window, but in an orb embedded in
// a smaller container Auris and Moiré drew thinner lines — by the ratio between
// the two — after any geometry change, and Quantum reset it every frame.
//
// Every engine is built into a 300×200 canvas under a 1440×900 window at a
// pixel ratio of 2, checked as constructed (studio grid cells never receive
// onResize), then rebuilt by a geometry change and stepped; every line
// material must say 300×200 throughout — CSS pixels, not the drawing buffer.

import * as THREE from 'three';
import * as ENGINES from '../src/engines/index.js';
import { ENGINE_PARAM_DEFINITIONS, getDefaultEngineParams } from '../src/engine-catalog.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

// A window that disagrees with the canvas, so reading it cannot pass by accident.
globalThis.window = { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2 };
const CANVAS = new THREE.Vector2(300, 200);
const renderer = {
  getSize: (v) => v.copy(CANVAS),
  getPixelRatio: () => 2,
  getDrawingBufferSize: (v) => v.copy(CANVAS).multiplyScalar(2),
  info: { memory: { geometries: 0, textures: 0 } },
};

// Moves every geometry param off its default, which is what makes engines rebuild.
function geometryChange(id) {
  const patch = {};
  for (const [key, def] of Object.entries(ENGINE_PARAM_DEFINITIONS[id])) {
    if (def.section !== 'geometry') continue;
    if (def.type === 'number') patch[key] = def.default === def.max ? def.min : def.max;
    else if (def.type === 'select') patch[key] = def.options.find((o) => o !== def.default) ?? def.default;
    else if (def.type === 'boolean') patch[key] = !def.default;
  }
  return patch;
}

const frame = (time) => ({ time, delta: 1 / 60, pointer: new THREE.Vector2(), marchQuality: 1, fps: 60 });

for (const [id, factory] of Object.entries(ENGINES)) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, CANVAS.x / CANVAS.y, 0.1, 100);
  const engine = factory({ scene, camera, renderer, params: getDefaultEngineParams(id) });
  const check = (when) => {
    const wrong = [];
    let lines = 0;
    scene.traverse((o) => {
      const res = o.material?.resolution;
      if (!o.material?.isLineMaterial || !res) return;
      lines++;
      if (!res.equals(CANVAS)) wrong.push(`${res.x}×${res.y}`);
    });
    if (lines) ok(`${id}: line resolution is the canvas ${when}`, wrong.length === 0,
      wrong.length ? `${wrong.length}/${lines} at ${[...new Set(wrong)].join(', ')}` : `${lines} line material(s)`);
  };

  engine.update(frame(0));
  check('as constructed');
  engine.onResize?.(CANVAS.x, CANVAS.y); // what the runtime does after mounting
  engine.setParams({ ...getDefaultEngineParams(id), ...geometryChange(id) });
  engine.update(frame(1 / 60));
  check('after a rebuild');
  engine.dispose();
}

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nline resolution: all checks passed');
