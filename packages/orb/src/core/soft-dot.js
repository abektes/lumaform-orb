import * as THREE from 'three';

// A round, soft-edged sprite for PointsMaterial. Without a map a point is a
// hard square, which at speck size reads as a pixel error rather than a mote.
//
// Built from bytes rather than a 2D canvas so it exists wherever the engine
// does: Node tests, workers and OffscreenCanvas hosts have no `document`, and
// the canvas version this replaces returned null there and fell back to
// squares. White with the falloff in alpha, so vertexColors and `color` tint it.

// Radial alpha stops, the same curve the canvas gradient drew.
const STOPS = [[0, 1], [0.3, 0.8], [0.7, 0.2], [1, 0]];

export function softDotAlpha(r) {
  if (r >= 1) return 0;
  for (let i = 1; i < STOPS.length; i++) {
    const [r1, a1] = STOPS[i];
    if (r <= r1) {
      const [r0, a0] = STOPS[i - 1];
      return a0 + ((a1 - a0) * (r - r0)) / (r1 - r0);
    }
  }
  return 0;
}

export function createSoftDotTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * softDotAlpha(r));
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  // DataTexture defaults to nearest filtering, which steps the falloff.
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
