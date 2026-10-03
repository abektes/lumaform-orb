import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// LED Box — an LED tile wall wrapped on a raymarched rounded cube.
//
// First shape experiment in the family: the geometry is a signed-distance
// rounded box, marched per pixel, not an analytic sphere. Tiles are a 3D
// cell lattice in object space; a value-noise blob field (advected by the
// churn and drift phases) decides which tiles are lit, with a confetti mode
// flashing random tiles on their own wrapped slot clock.
//
// Inspired by shadercn/XorDev orb-29 ("LED tile wall lighting up in flowing
// blobs"); original code.

const FRAME_RADIUS = 2.6;
const BASE_SIZE = 1.5;
const SHAPE_MAP = { box: 0, octahedron: 1, sphere: 2 };

export function createLedBoxEngine({ scene, camera, params }) {
  const currentParams = {
    boxSize: BASE_SIZE,
    shape: 'box',
    bevel: 0.12,
    cells: 40,
    colorLit: '#fff2dd',
    colorWall: '#161616',
    light: 0.6,
    gain: 1.0,
    contrast: 1.0,
    blobScale: 1.3,
    coverage: 0.62,
    confetti: 0.22,
    churnRate: 0.5,
    driftRate: 0.45,
    twinkleRate: 2.0,
    spinRate: 0.1,
    breatheRate: 0.35,
    breatheAmp: 0.03,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uChurnPhase: { value: 0.0 },
      uDriftPhase: { value: 0.0 },
      uTwinklePhase: { value: 0.0 },
      uSpinPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse },
      uColorLit: { value: new THREE.Color(currentParams.colorLit) },
      uColorWall: { value: new THREE.Color(currentParams.colorWall) },
      uBoxSize: { value: currentParams.boxSize },
      uShape: { value: SHAPE_MAP[currentParams.shape] ?? 0 },
      uBevel: { value: currentParams.bevel },
      uCells: { value: currentParams.cells },
      uBlobScale: { value: currentParams.blobScale },
      uCoverage: { value: currentParams.coverage },
      uConfetti: { value: currentParams.confetti },
      uLight: { value: currentParams.light },
      uGain: { value: currentParams.gain },
      uContrast: { value: currentParams.contrast },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uMarchQuality: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float uChurnPhase;
      uniform float uDriftPhase;
      uniform float uTwinklePhase;
      uniform float uSpinPhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorLit;
      uniform vec3 uColorWall;
      uniform float uBoxSize;
      uniform float uShape;
      uniform float uBevel;
      uniform float uCells;
      uniform float uBlobScale;
      uniform float uCoverage;
      uniform float uConfetti;
      uniform float uLight;
      uniform float uGain;
      uniform float uContrast;
      uniform float uBreatheAmp;
      uniform float uMarchQuality;

      uniform mat4 cameraWorldMatrix;
      uniform mat4 cameraProjectionMatrixInverse;

      varying vec2 vUv;

      float hash13(vec3 p3) {
        p3 = fract(p3 * 0.1131);
        p3 += dot(p3, p3.zyx + 19.19);
        return fract((p3.x + p3.y) * p3.z);
      }

      float vnoise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(
          mix(
            mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
            mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x),
            u.y),
          mix(
            mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
            mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x),
            u.y),
          u.z) * 2.0 - 1.0;
      }

      mat2 rot2(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      // Solid SDF; p is already in object (spun) space. Three solids — the
      // tile lattice is 3D, so it wraps whichever solid is selected.
      float map(vec3 p, float size) {
        if (uShape < 0.5) {
          vec3 q = abs(p) - size + uBevel;
          return length(max(q, vec3(0.0)))
            + min(max(q.x, max(q.y, q.z)), 0.0) - uBevel;
        }
        if (uShape < 1.5) {
          return (abs(p.x) + abs(p.y) + abs(p.z) - size * 1.02) * 0.57735027 - uBevel;
        }
        return length(p) - size * 0.94;
      }

      vec3 calcNormal(vec3 p, float size) {
        const vec2 e = vec2(0.0025, -0.0025);
        return normalize(
          e.xyy * map(p + e.xyy, size)
          + e.yyx * map(p + e.yyx, size)
          + e.yxy * map(p + e.yxy, size)
          + e.xxx * map(p + e.xxx, size));
      }

      void main() {
        vec2 ndc = (vUv - 0.5) * 2.0;
        vec4 clipPos = vec4(ndc, -1.0, 1.0);
        vec4 viewPos = cameraProjectionMatrixInverse * clipPos;
        vec3 rd = normalize((cameraWorldMatrix * vec4(viewPos.xyz, 0.0)).xyz);
        vec3 ro = cameraPosition;

        float breathe = 1.0 + uBreatheAmp * cos(uBreathePhase) + uPulse * 0.04;
        float size = uBoxSize * breathe;

        // March the rounded box. Steps scale with marchQuality for the
        // nine-cell grid.
        // Start at the bounding-sphere entry: the camera can sit farther
        // than the march budget from the surface (tall viewports), and this
        // also skips empty space on every march.
        float t = max(length(ro) - size * 1.9, 0.0);
        bool hit = false;
        int steps = int(64.0 * mix(0.6, 1.0, clamp(uMarchQuality, 0.0, 1.0)));
        for (int i = 0; i < 64; i++) {
          if (i >= steps) break;
          float d = map(ro + rd * t, size);
          if (d < 0.0012 * t + 0.0008) { hit = true; break; }
          t += d;
          if (t > length(ro) + size * 1.9) break;
        }

        if (!hit) {
          gl_FragColor = vec4(0.0);
          return;
        }

        vec3 pos = ro + rd * t;

        // Object space: undo nothing — spin lives inside map(), so apply the
        // same rotation to the surface point for a pattern that rides the box.
        vec3 q = pos;
        q.xz = rot2(uSpinPhase) * q.xz;

        // Tile lattice in object space: uCells tiles per box edge.
        float span = 2.0 * size;
        vec3 g = q * (uCells / span);
        vec3 id = floor(g);
        vec3 f = fract(g) - 0.5;
        float edge = 0.5 - max(abs(f.x), max(abs(f.y), abs(f.z)));
        float tile = smoothstep(0.03, 0.09, edge);

        // Flowing blobs: two octaves of value noise advected by churn and
        // drift, sampled at tile centres so a whole tile lights at once.
        vec3 cc = (id + 0.5) * (span / uCells);
        float n = vnoise(cc * uBlobScale * 0.9 + vec3(uDriftPhase * 0.35, uChurnPhase * 0.5, uDriftPhase * 0.2));
        n = 0.65 * n + 0.35 * vnoise(cc * uBlobScale * 1.9 - vec3(uChurnPhase * 0.4));
        float lit = smoothstep(uCoverage - 0.045, uCoverage + 0.045, n * 0.5 + 0.5);

        // Confetti: a stable per-tile random subset blinks on a wrapped slot
        // clock (period 1 — the fract lattice demands it).
        float cellRand = hash13(id + 5.77);
        float blink = step(0.55, fract(cellRand * 11.0 + uTwinklePhase));
        float confetti = uConfetti * blink * step(0.62, cellRand);
        float litLevel = clamp(lit + confetti * (1.0 - lit), 0.0, 1.0);

        vec3 nrm = calcNormal(pos, size);
        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(nrm, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - clamp(dot(nrm, -rd), 0.0, 1.0), 2.6);

        vec3 wallCol = uColorWall * (0.45 + 0.55 * lambert);
        vec3 litCol = uColorLit * (0.6 + 0.4 * n * 0.5 + 0.5) * 0.5;
        vec3 col = mix(wallCol, litCol, litLevel * tile);
        col *= mix(0.22, 1.0, tile);
        col += vec3(1.0) * pow(max(dot(nrm, normalize(lightDir - rd)), 0.0), 48.0) * 0.25 * uLight;
        col += uColorLit * fresnel * 0.12;
        col += uColorLit * uPulse * 0.15;

        col *= uGain;
        col = (col - 0.5) * uContrast + 0.5;

        float dither = hash13(vec3(gl_FragCoord.xy, uDitherPhase * 371.0));
        col += (dither - 0.5) * (1.0 / 255.0) * 3.0;

        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const fullScreenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  fullScreenQuad.frustumCulled = false;
  scene.add(fullScreenQuad);

  let pulseValue = 0;
  const phaseTracker = createPhaseTracker();

  function applyParams(n) {
    Object.assign(currentParams, n);
    if (n.boxSize !== undefined) material.uniforms.uBoxSize.value = n.boxSize;
    if (n.shape !== undefined) material.uniforms.uShape.value = SHAPE_MAP[n.shape] ?? 0;
    if (n.bevel !== undefined) material.uniforms.uBevel.value = n.bevel;
    if (n.cells !== undefined) material.uniforms.uCells.value = n.cells;
    if (n.blobScale !== undefined) material.uniforms.uBlobScale.value = n.blobScale;
    if (n.coverage !== undefined) material.uniforms.uCoverage.value = n.coverage;
    if (n.confetti !== undefined) material.uniforms.uConfetti.value = n.confetti;
    if (n.light !== undefined) material.uniforms.uLight.value = n.light;
    if (n.gain !== undefined) material.uniforms.uGain.value = n.gain;
    if (n.contrast !== undefined) material.uniforms.uContrast.value = n.contrast;
    if (n.breatheAmp !== undefined) material.uniforms.uBreatheAmp.value = n.breatheAmp;
    if (n.colorLit) material.uniforms.uColorLit.value.set(n.colorLit);
    if (n.colorWall) material.uniforms.uColorWall.value.set(n.colorWall);
  }

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta, marchQuality }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uChurnPhase.value = phaseTracker.phase('churn', currentParams.churnRate);
      material.uniforms.uDriftPhase.value = phaseTracker.phase('drift', currentParams.driftRate);
      material.uniforms.uTwinklePhase.value = phaseTracker.phase('twinkle', currentParams.twinkleRate, 1.0);
      material.uniforms.uSpinPhase.value = phaseTracker.phase('spin', currentParams.spinRate);
      material.uniforms.uBreathePhase.value = phaseTracker.phase('breathe', currentParams.breatheRate);
      material.uniforms.uDitherPhase.value = phaseTracker.phase('dither', 9.7);
      material.uniforms.uPulse.value = pulseValue;
      if (marchQuality !== undefined) {
        material.uniforms.uMarchQuality.value = marchQuality;
      }

      material.uniforms.cameraWorldMatrix.value.copy(camera.matrixWorld);
      material.uniforms.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
    },

    setParams: applyParams,
    onPulse() { pulseValue = 1.0; },

    dispose() {
      scene.remove(fullScreenQuad);
      material.dispose();
      fullScreenQuad.geometry.dispose();
    },
  };
}
