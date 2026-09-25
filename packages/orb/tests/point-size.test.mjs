// PointsMaterial's `size` is in world units unless sizeAttenuation is turned
// off, and three.js turns it on by default. Two engines were written as if it
// were pixels: Synthesis's stardust (2.4) drew ~160 px squares over the whole
// orb, and Ferro Trails's heads (7, pulsing to 12) and motes (4.5) drew a
// blown-out halo several orbs wide. Nothing about either reads as a bug in
// code review, so every engine's points are measured here against its orb.
//
// An attenuated point covers size·tan(fov/2) world units at any depth, the
// same as a sprite of that width, so it compares directly with frame.radius.

import * as THREE from 'three';
import * as ENGINES from '../src/engines/index.js';
import { getDefaultEngineParams } from '../src/engine-catalog.js';
import { engineFrameRadius } from '../src/core/framing.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const FOV = 45; // runtime.js and the studio grid both use 45°
const HALF_TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
// A point is a speck. Five percent of the orb's diameter is already a large
// one (~20 px on a 400 px orb); the bugs above were 25% and over 100%.
const MAX_FRACTION = 0.05;
const MAX_PIXELS = 16; // for sizeAttenuation: false, where size is CSS pixels

const renderer = { getSize: (v) => v.set(800, 600), getPixelRatio: () => 1, info: { memory: { geometries: 0, textures: 0 } } };

for (const [id, factory] of Object.entries(ENGINES)) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 0.1, 100);
  const engine = factory({ scene, camera, renderer, params: getDefaultEngineParams(id) });
  // What the runtime frames the orb by, default included.
  const diameter = 2 * engineFrameRadius(engine);

  // Sizes can pulse per frame, so take the largest over a click and its decay.
  const largest = new Map();
  const measure = () => scene.traverse((o) => {
    if (!o.isPoints || !o.material?.isPointsMaterial) return;
    largest.set(o.material, Math.max(largest.get(o.material) ?? 0, o.material.size));
  });
  // The same frame context the runtime passes.
  const frame = (time) => ({ time, delta: 1 / 60, pointer: new THREE.Vector2(), marchQuality: 1, fps: 60 });
  let time = 0;
  engine.update(frame(time)); measure();
  engine.onPulse?.();
  for (let i = 0; i < 30; i++) { time += 1 / 60; engine.update(frame(time)); measure(); }

  for (const [material, size] of largest) {
    if (material.sizeAttenuation) {
      const fraction = (size * HALF_TAN) / diameter;
      ok(`${id}: points stay specks next to the orb`, fraction <= MAX_FRACTION,
        `size ${size.toFixed(3)} → ${(fraction * 100).toFixed(1)}% of the orb's diameter`);
    } else {
      ok(`${id}: fixed-pixel points stay specks`, size <= MAX_PIXELS, `${size} px`);
    }
  }
  engine.dispose();
}

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\npoint size: all checks passed');
