import * as THREE from 'three';

// The canvas's CSS size: what the runtime passes to onResize, and what
// LineMaterial.resolution means (its linewidth is in CSS pixels).
//
// Not window.innerWidth/innerHeight. An embedded orb's canvas is its container,
// and a line material sized to the window draws every line thinner by the ratio
// between the two. onResize corrects it after mount, but engines that rebuild
// on a geometry change set it again — and Quantum reset it every frame.
export function canvasSize(renderer, target = new THREE.Vector2()) {
  return renderer?.getSize ? renderer.getSize(target) : target.set(1024, 768);
}
