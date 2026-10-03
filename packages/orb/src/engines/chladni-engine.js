import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Chladni Plate — cymatic resonance on a circular plate.
//
// The standing wave of a vibrating plate: w = sin(πn·x)sin(πm·y) +
// σ·sin(πm·x)sin(πn·y). Sand collects where the plate is still — the nodal
// lines |w| ≈ 0 — and dances as the resonance σ sweeps. The mode pair (n, m)
// is chosen by the designer; σ breathes on a phase so the figures morph
// continuously without ever leaving the valid family.
//
// Original code; the technique is Ernst Chladni's, 1787.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.2;
const PLATE_MAP = { circle: 0, square: 1 };

export function createChladniEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.1,
    plate: 'circle',
    modeN: 4,
    modeM: 2,
    colorSand: '#ffe9b8',
    colorPlate: '#101b2e',
    rimColor: '#dbe7ff',
    resonance: 0.7,
    lineWeight: 0.05,
    sandGlow: 1.3,
    plateLight: 0.7,
    gain: 1.0,
    contrast: 1.1,
    morphRate: 0.24,
    spinRate: 0.05,
    breatheRate: 0.35,
    breatheAmp: 0.04,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMorphPhase: { value: 0.0 },
      uSpinPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse },
      uColorSand: { value: new THREE.Color(currentParams.colorSand) },
      uColorPlate: { value: new THREE.Color(currentParams.colorPlate) },
      uRimColor: { value: new THREE.Color(currentParams.rimColor) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uPlate: { value: PLATE_MAP[currentParams.plate] ?? 0 },
      uModeN: { value: currentParams.modeN },
      uModeM: { value: currentParams.modeM },
      uResonance: { value: currentParams.resonance },
      uLineWeight: { value: currentParams.lineWeight },
      uSandGlow: { value: currentParams.sandGlow },
      uPlateLight: { value: currentParams.plateLight },
      uGain: { value: currentParams.gain },
      uContrast: { value: currentParams.contrast },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uPointer: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float uMorphPhase;
      uniform float uSpinPhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorSand;
      uniform vec3 uColorPlate;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uPlate;
      uniform float uModeN;
      uniform float uModeM;
      uniform float uResonance;
      uniform float uLineWeight;
      uniform float uSandGlow;
      uniform float uPlateLight;
      uniform float uGain;
      uniform float uContrast;
      uniform float uBreatheAmp;
      uniform vec2 uPointer;

      uniform mat4 cameraWorldMatrix;
      uniform mat4 cameraProjectionMatrixInverse;

      varying vec2 vUv;

      float hash13(vec3 p3) {
        p3 = fract(p3 * 0.1131);
        p3 += dot(p3, p3.zyx + 19.19);
        return fract((p3.x + p3.y) * p3.z);
      }

      vec3 toOklab(vec3 c) {
        c = max(c, vec3(0.0));
        float l = pow(dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929)), 1.0 / 3.0);
        float m = pow(dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566)), 1.0 / 3.0);
        float s = pow(dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005)), 1.0 / 3.0);
        return vec3(
          0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
      }

      vec3 fromOklab(vec3 lab) {
        float l3 = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
        float m3 = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
        float s3 = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
        float L = l3 * l3 * l3;
        float M = m3 * m3 * m3;
        float S = s3 * s3 * s3;
        return vec3(
          dot(vec3(L, M, S), vec3(4.0767416621, -3.3077115913, 0.2309699292)),
          dot(vec3(L, M, S), vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
          dot(vec3(L, M, S), vec3(-0.0041960863, -0.7034186147, 1.7076147010)));
      }

      vec3 oklabMix(vec3 a, vec3 b, float t) {
        return fromOklab(mix(toOklab(a), toOklab(b), clamp(t, 0.0, 1.0)));
      }

      void main() {
        vec2 ndc = (vUv - 0.5) * 2.0;
        vec4 clipPos = vec4(ndc, -1.0, 1.0);
        vec4 viewPos = cameraProjectionMatrixInverse * clipPos;
        vec3 rd = normalize((cameraWorldMatrix * vec4(viewPos.xyz, 0.0)).xyz);
        vec3 ro = cameraPosition;

        vec3 planeN = normalize(ro);
        float denom = dot(rd, planeN);
        if (abs(denom) < 1e-4) { gl_FragColor = vec4(0.0); return; }
        float t = dot(-ro, planeN) / denom;
        if (t <= 0.0) { gl_FragColor = vec4(0.0); return; }
                vec3 hit = ro + rd * t;
        // Plane-local basis: hit.xy in world axes turns the disc into a
        // stretching ellipse as the camera orbits, so measure in the plane's
        // own frame instead.
        vec3 bX = normalize(cross(vec3(0.0, 1.0, 0.0) + vec3(0.001), planeN));
        vec3 bY = cross(planeN, bX);
        vec2 local = vec2(dot(hit, bX), dot(hit, bY));

        float breathe = 1.0 + uBreatheAmp * cos(uBreathePhase) + uPulse * 0.04;
        float radius = uRadius * breathe;
        float r = length(local);
        // Plate silhouette: the circular plate, or the square plate Chladni
        // actually used. q is the normalised plate coordinate either way, so
        // mask, dome shading and edge fade all stay shared.
        float sq = max(abs(local.x), abs(local.y));
        float q = uPlate < 0.5 ? r / radius : sq / (radius * 0.9);
        if (q >= 1.0) { gl_FragColor = vec4(0.0); return; }

        // Plate coordinates in [-1, 1], spun slowly, pointer-tilted.
        float cs = cos(uSpinPhase), sn = sin(uSpinPhase);
        vec2 p = local / radius;
        p = mat2(cs, -sn, sn, cs) * p - uPointer * 0.08;

        // Resonance sweeps symmetrically around the designer's value, so the
        // figure passes cleanly through the pure mode (sigma = 0) forever.
        float sigma = uResonance * sin(uMorphPhase);

        float n = uModeN * 3.14159265;
        float m = uModeM * 3.14159265;
        float w = sin(n * p.x) * sin(m * p.y)
          + sigma * sin(m * p.x) * sin(n * p.y);

        // Sand: the nodal lines. Grain sparkle so it reads as particles.
        float node = 1.0 - smoothstep(uLineWeight, uLineWeight + 0.045, abs(w));
        float grain = 0.75 + 0.25 * hash13(vec3(floor(p * 260.0), 7.31));

        vec3 col = uColorPlate * (0.55 + 0.45 * (w * 0.5 + 0.5)) * uPlateLight;
        col = oklabMix(col, uColorSand * grain, node);
        col += uColorSand * node * uSandGlow * 0.45;

        // Dome shading and rim, as the family does.
        q = clamp(q, 0.0, 1.0);
        float domeZ = sqrt(max(1.0 - q * q, 0.0));
        vec3 domeN = vec3(local, domeZ);
        vec3 lightDir = normalize(vec3(0.4, 0.55, 0.73));
        float lambert = 0.35 + 0.65 * clamp(dot(domeN, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - domeZ, 2.4);
        col *= lambert;
        col += uRimColor * fresnel * 0.3;
        col += uColorSand * uPulse * 0.12;

        col *= uGain;
        col = (col - 0.5) * uContrast + 0.5;

        float dither = hash13(vec3(gl_FragCoord.xy, uDitherPhase * 371.0));
        col += (dither - 0.5) * (1.0 / 255.0) * 3.0;

        float edge = smoothstep(1.0, 0.86, q);
        gl_FragColor = vec4(max(col, vec3(0.0)), edge);
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

  function applyParams(nw) {
    Object.assign(currentParams, nw);
    if (nw.radius !== undefined) material.uniforms.uRadius.value = nw.radius;
    if (nw.edgeFade !== undefined) material.uniforms.uEdgeFade.value = nw.edgeFade;
    if (nw.plate !== undefined) material.uniforms.uPlate.value = PLATE_MAP[nw.plate] ?? 0;
    if (nw.modeN !== undefined) material.uniforms.uModeN.value = nw.modeN;
    if (nw.modeM !== undefined) material.uniforms.uModeM.value = nw.modeM;
    if (nw.resonance !== undefined) material.uniforms.uResonance.value = nw.resonance;
    if (nw.lineWeight !== undefined) material.uniforms.uLineWeight.value = nw.lineWeight;
    if (nw.sandGlow !== undefined) material.uniforms.uSandGlow.value = nw.sandGlow;
    if (nw.plateLight !== undefined) material.uniforms.uPlateLight.value = nw.plateLight;
    if (nw.gain !== undefined) material.uniforms.uGain.value = nw.gain;
    if (nw.contrast !== undefined) material.uniforms.uContrast.value = nw.contrast;
    if (nw.breatheAmp !== undefined) material.uniforms.uBreatheAmp.value = nw.breatheAmp;
    if (nw.colorSand) material.uniforms.uColorSand.value.set(nw.colorSand);
    if (nw.colorPlate) material.uniforms.uColorPlate.value.set(nw.colorPlate);
    if (nw.rimColor) material.uniforms.uRimColor.value.set(nw.rimColor);
  }

  return {
    frame: { radius: 2.5 },

    update({ time, delta, pointer }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uMorphPhase.value = phaseTracker.phase('morph', currentParams.morphRate);
      material.uniforms.uSpinPhase.value = phaseTracker.phase('spin', currentParams.spinRate);
      material.uniforms.uBreathePhase.value = phaseTracker.phase('breathe', currentParams.breatheRate);
      material.uniforms.uDitherPhase.value = phaseTracker.phase('dither', 9.7);
      material.uniforms.uPulse.value = pulseValue;
      material.uniforms.uPointer.value.copy(pointer);

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
