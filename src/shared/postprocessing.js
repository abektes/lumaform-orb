import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export function createBloomPipeline(renderer, scene, camera, params = {}) {
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    params.strength ?? 0.8,
    params.radius ?? 0.35,
    params.threshold ?? 0.15
  );

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  return {
    composer,
    bloomPass,
    renderPass,
    render() {
      composer.render();
    },
    resize(width, height) {
      composer.setSize(width, height);
    },
    dispose() {
      composer.dispose();
      bloomPass.dispose();
    },
  };
}

export function applyAcesToneMapping(renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
}

export function resetToneMapping(renderer) {
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;
}

export function createFpsTracker() {
  let frames = 0;
  let lastTime = performance.now();
  let fps = 60;

  return {
    get fps() {
      return fps;
    },
    tick() {
      frames += 1;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        fps = frames;
        frames = 0;
        lastTime = now;
      }
    },
    getMarchQuality(dpr) {
      if (fps < 40) return 0.55;
      if (fps < 50) return 0.72;
      if (dpr > 1.5) return 0.78;
      return 1.0;
    },
  };
}
