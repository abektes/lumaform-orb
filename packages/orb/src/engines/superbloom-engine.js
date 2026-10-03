import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Superbloom — the superformula as a living bloom.
//
// Gielis' superformula r(θ) = (|cos(mθ/4)|^n2 + |sin(mθ/4)|^n3)^(-1/n1)
// draws everything from star to flower to blob as its three exponents move.
// The pixel is inside when its radius beats r(θ_pixel); petals are filled
// with a heart-to-edge OKLab gradient, the boundary glows, and the bloom
// morphs continuously between adjacent petal counts.
//
// Original code; the formula is Johan Gielis', 2003.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.2;

export function createSuperbloomEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.1,
    symmetry: 6,
    colorPetal: '#f472b6',
    colorHeart: '#fde68a',
    colorEdge: '#4c1d95',
    rimColor: '#fdf2f8',
    pinch: 0.5,
    roundness: 1.3,
    fillGradient: 0.65,
    edgeGlow: 1.2,
    gain: 1.0,
    contrast: 1.05,
    morphRate: 0.16,
    spinRate: 0.06,
    breatheRate: 0.35,
    breatheAmp: 0.05,
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
      uColorPetal: { value: new THREE.Color(currentParams.colorPetal) },
      uColorHeart: { value: new THREE.Color(currentParams.colorHeart) },
      uColorEdge: { value: new THREE.Color(currentParams.colorEdge) },
      uRimColor: { value: new THREE.Color(currentParams.rimColor) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uSymmetry: { value: currentParams.symmetry },
      uPinch: { value: currentParams.pinch },
      uRoundness: { value: currentParams.roundness },
      uFillGradient: { value: currentParams.fillGradient },
      uEdgeGlow: { value: currentParams.edgeGlow },
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
      uniform vec3 uColorPetal;
      uniform vec3 uColorHeart;
      uniform vec3 uColorEdge;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uSymmetry;
      uniform float uPinch;
      uniform float uRoundness;
      uniform float uFillGradient;
      uniform float uEdgeGlow;
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

      float superR(float theta, float m) {
        float t = m * theta * 0.25;
        float term = pow(abs(cos(t)), uRoundness) + pow(abs(sin(t)), uRoundness);
        return pow(term, -1.0 / uPinch);
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

        float breathe = 1.0 + uBreatheAmp * cos(uBreathePhase) + uPulse * 0.05;
        float radius = uRadius * breathe;
        float r = length(local);
        if (r >= radius) { gl_FragColor = vec4(0.0); return; }

        float cs = cos(uSpinPhase), sn = sin(uSpinPhase);
        vec2 p = local / radius;
        p = mat2(cs, -sn, sn, cs) * p - uPointer * 0.06;
        float theta = atan(p.y, p.x);
        float pr = length(p);

        // Morph continuously between symmetry m and m+1: both radii are
        // well-defined for every theta, so the crossfade never pops.
        float mBase = floor(uSymmetry * (0.75 + 0.25 * sin(uMorphPhase)) + 0.5);
        float mFrac = uSymmetry * (0.75 + 0.25 * sin(uMorphPhase)) + 0.5 - mBase;
        float rA = superR(theta, mBase);
        float rB = superR(theta, mBase + 1.0);
        float shape = mix(rA, rB, mFrac);

        float rr = pr / (shape * 0.78);
        float inside = 1.0 - smoothstep(0.985, 1.0, rr);
        float rim = smoothstep(0.9, 1.0, rr) * inside;

        // Petal fill: heart at the center through petal tint to the edge.
        vec3 lin1 = max(uColorPetal, vec3(0.0));
        vec3 lin2 = max(uColorHeart, vec3(0.0));
        vec3 lin3 = max(uColorEdge, vec3(0.0));
        float g = clamp(pr / (shape * 0.78 + 1e-4), 0.0, 1.0);
        vec3 petal = oklabMix(lin2, lin1, smoothstep(0.05, 0.75, g));
        petal = oklabMix(petal, lin3, uFillGradient * smoothstep(0.6, 1.0, g) * 0.7);

        vec3 col = oklabMix(uColorHeart * 0.22, petal, inside);
        col += uRimColor * rim * uEdgeGlow * 0.55;
        col += uRimColor * uPulse * 0.12;

        // Dome shading and rim over the medallion.
        float q = clamp(r / radius, 0.0, 1.0);
        float domeZ = sqrt(max(1.0 - q * q, 0.0));
        vec3 domeN = vec3(local, domeZ);
        vec3 lightDir = normalize(vec3(0.4, 0.55, 0.73));
        float lambert = 0.35 + 0.65 * clamp(dot(domeN, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - domeZ, 2.4);
        col *= lambert;
        col += uRimColor * fresnel * 0.3;

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
    if (nw.symmetry !== undefined) material.uniforms.uSymmetry.value = nw.symmetry;
    if (nw.pinch !== undefined) material.uniforms.uPinch.value = nw.pinch;
    if (nw.roundness !== undefined) material.uniforms.uRoundness.value = nw.roundness;
    if (nw.fillGradient !== undefined) material.uniforms.uFillGradient.value = nw.fillGradient;
    if (nw.edgeGlow !== undefined) material.uniforms.uEdgeGlow.value = nw.edgeGlow;
    if (nw.gain !== undefined) material.uniforms.uGain.value = nw.gain;
    if (nw.contrast !== undefined) material.uniforms.uContrast.value = nw.contrast;
    if (nw.breatheAmp !== undefined) material.uniforms.uBreatheAmp.value = nw.breatheAmp;
    if (nw.colorPetal) material.uniforms.uColorPetal.value.set(nw.colorPetal);
    if (nw.colorHeart) material.uniforms.uColorHeart.value.set(nw.colorHeart);
    if (nw.colorEdge) material.uniforms.uColorEdge.value.set(nw.colorEdge);
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
