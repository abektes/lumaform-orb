import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Clifford Attractor — a strange attractor rendered as ink-density wisps.
//
// The Clifford map x' = sin(a·y) + c·cos(a·x), y' = sin(b·x) + d·cos(b·y),
// iterated per pixel: each iteration leaves a whisper of ink whose weight
// falls with distance to the orbit point. Forty passes and the attractor's
// filaments condense out of pure iteration — no noise anywhere. One
// coefficient drifts slowly on a phase, so the wisps reform continuously.
//
// Original code; the map is Clifford A. Pickover's.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.2;

export function createAttractorEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.1,
    colorEmber: '#fbbf24',
    colorWisp: '#6366f1',
    colorBg: '#07060e',
    rimColor: '#eef2ff',
    coefA: 1.7,
    coefB: 1.7,
    coefC: 0.6,
    coefD: 1.2,
    morphAmp: 0.18,
    densityGain: 1.2,
    iterations: 32,
    gain: 1.0,
    contrast: 1.15,
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
      uColorEmber: { value: new THREE.Color(currentParams.colorEmber) },
      uColorWisp: { value: new THREE.Color(currentParams.colorWisp) },
      uColorBg: { value: new THREE.Color(currentParams.colorBg) },
      uRimColor: { value: new THREE.Color(currentParams.rimColor) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uCoefA: { value: currentParams.coefA },
      uCoefB: { value: currentParams.coefB },
      uCoefC: { value: currentParams.coefC },
      uCoefD: { value: currentParams.coefD },
      uMorphAmp: { value: currentParams.morphAmp },
      uDensityGain: { value: currentParams.densityGain },
      uIterations: { value: currentParams.iterations },
      uGain: { value: currentParams.gain },
      uContrast: { value: currentParams.contrast },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uMarchQuality: { value: 1.0 },
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
      uniform vec3 uColorEmber;
      uniform vec3 uColorWisp;
      uniform vec3 uColorBg;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uCoefA;
      uniform float uCoefB;
      uniform float uCoefC;
      uniform float uCoefD;
      uniform float uMorphAmp;
      uniform float uDensityGain;
      uniform float uIterations;
      uniform float uGain;
      uniform float uContrast;
      uniform float uBreatheAmp;
      uniform vec2 uPointer;
      uniform float uMarchQuality;

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
        if (r >= radius) { gl_FragColor = vec4(0.0); return; }

        float cs = cos(uSpinPhase), sn = sin(uSpinPhase);
        vec2 p = local / radius;
        p = mat2(cs, -sn, sn, cs) * p - uPointer * 0.06;

        // Iterate the map from this pixel; each pass leaves ink near the
        // orbit point. Coefficient a drifts inside its safe band so the
        // attractor never flies apart.
        float a = uCoefA + uMorphAmp * sin(uMorphPhase);
        float b = uCoefB;
        float c = uCoefC;
        float d = uCoefD;
        vec2 z = p * 1.6;
        float density = 0.0;
        float iters = clamp(uIterations * mix(0.6, 1.0, uMarchQuality), 12.0, 40.0);
        for (int i = 0; i < 40; i++) {
          if (float(i) >= iters) break;
          z = vec2(sin(a * z.y) + c * cos(a * z.x),
                   sin(b * z.x) + d * cos(b * z.y));
          density += exp(-dot(p - z * 0.62, p - z * 0.62) * 14.0);
        }
        density = 1.0 - exp(-density * uDensityGain * 0.6);

        vec3 lin1 = max(uColorEmber, vec3(0.0));
        vec3 lin2 = max(uColorWisp, vec3(0.0));
        vec3 col = uColorBg * 0.85;
        col = oklabMix(col, lin2, density * 0.75);
        col = oklabMix(col, lin1, pow(density, 2.6));
        col += lin1 * pow(density, 6.0) * 0.5;

        // Dome shading and rim over the medallion.
        float q = clamp(r / radius, 0.0, 1.0);
        float domeZ = sqrt(max(1.0 - q * q, 0.0));
        vec3 domeN = vec3(local, domeZ);
        vec3 lightDir = normalize(vec3(0.4, 0.55, 0.73));
        float lambert = 0.35 + 0.65 * clamp(dot(domeN, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - domeZ, 2.4);
        col *= lambert;
        col += uRimColor * fresnel * 0.28;
        col += lin1 * uPulse * 0.12;

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
    if (nw.coefA !== undefined) material.uniforms.uCoefA.value = nw.coefA;
    if (nw.coefB !== undefined) material.uniforms.uCoefB.value = nw.coefB;
    if (nw.coefC !== undefined) material.uniforms.uCoefC.value = nw.coefC;
    if (nw.coefD !== undefined) material.uniforms.uCoefD.value = nw.coefD;
    if (nw.morphAmp !== undefined) material.uniforms.uMorphAmp.value = nw.morphAmp;
    if (nw.densityGain !== undefined) material.uniforms.uDensityGain.value = nw.densityGain;
    if (nw.iterations !== undefined) material.uniforms.uIterations.value = nw.iterations;
    if (nw.gain !== undefined) material.uniforms.uGain.value = nw.gain;
    if (nw.contrast !== undefined) material.uniforms.uContrast.value = nw.contrast;
    if (nw.breatheAmp !== undefined) material.uniforms.uBreatheAmp.value = nw.breatheAmp;
    if (nw.colorEmber) material.uniforms.uColorEmber.value.set(nw.colorEmber);
    if (nw.colorWisp) material.uniforms.uColorWisp.value.set(nw.colorWisp);
    if (nw.colorBg) material.uniforms.uColorBg.value.set(nw.colorBg);
    if (nw.rimColor) material.uniforms.uRimColor.value.set(nw.rimColor);
  }

  return {
    frame: { radius: 2.5 },

    update({ time, delta, pointer, marchQuality }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uMorphPhase.value = phaseTracker.phase('morph', 0.14);
      material.uniforms.uSpinPhase.value = phaseTracker.phase('spin', currentParams.spinRate);
      material.uniforms.uBreathePhase.value = phaseTracker.phase('breathe', currentParams.breatheRate);
      material.uniforms.uDitherPhase.value = phaseTracker.phase('dither', 9.7);
      material.uniforms.uPulse.value = pulseValue;
      material.uniforms.uPointer.value.copy(pointer);
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
