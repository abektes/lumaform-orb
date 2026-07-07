import GUI from 'lil-gui';
import * as THREE from 'three';
import { createLiquidParticles } from './demos/liquid-particles.js';
import { createQuantumCube } from './demos/quantum-cube.js';
import { createSmoothOrb } from './demos/smooth-orb.js';

const DEMO_IDS = {
  SMOOTH_ORB: 'Smooth AI Orb',
  QUANTUM_CUBE: 'Quantum Cube',
  LIQUID_PARTICLES: 'Liquid Particles',
};

const demos = {
  [DEMO_IDS.SMOOTH_ORB]: createSmoothOrb,
  [DEMO_IDS.QUANTUM_CUBE]: createQuantumCube,
  [DEMO_IDS.LIQUID_PARTICLES]: createLiquidParticles,
};

const container = document.getElementById('container');
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const appState = { demo: DEMO_IDS.SMOOTH_ORB };

let gui = null;
let activeDemo = null;

function buildGui() {
  gui?.destroy();
  gui = new GUI({ title: 'Prototype' });
  gui
    .add(appState, 'demo', Object.values(DEMO_IDS))
    .name('Demo')
    .onChange((demoId) => {
      switchDemo(demoId);
    });
}

function switchDemo(demoId) {
  activeDemo?.dispose();
  buildGui();
  activeDemo = demos[demoId]({ container, renderer, gui });
  activeDemo.resize();
  gui.close();
}

function animate() {
  requestAnimationFrame(animate);
  activeDemo?.update(clock.getElapsedTime());
}

window.addEventListener('resize', () => {
  activeDemo?.resize();
});

switchDemo(appState.demo);
animate();
