import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Maurer Rose — Peter Maurer's chord web through a rose curve.
//
// The rose r(θ) = cos(k·θ) is sampled at angles i·d degrees and consecutive
// samples are joined by straight chords; the envelope of hundreds of chords
// weaves the petals out of pure lines. The shader measures true
// point-to-segment distance, so every chord is a crisp ink line, and the
// web slowly rotates through its family on a wrapped spin.
//
// Original code; the construction is Peter Maurer's, 1987.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.2;

export function createMaurerRoseEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.1,
    petals: 5,
    step: 71,
    colorWeb: '#f9a8d4',
    colorHeart: '#170b1e',
    rimColor: '#fdf2f8',
    chordGlow: 1.25,
    lineWeight: 1.4,
    coreBloom: 0.5,
    gain: 1.0,
    contrast: 1.05,
    spinRate: 0.06,
    breatheRate: 0.35,
    breatheAmp: 0.04,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSpinPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse },
      uColorWeb: { value: new THREE.Color(currentParams.colorWeb) },
      uColorHeart: { value: new THREE.Color(currentParams.colorHeart) },
      uRimColor: { value: new THREE.Color(currentParams.rimColor) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uPetals: { value: currentParams.petals },
      uStep: { value: currentParams.step },
      uChordGlow: { value: currentParams.chordGlow },
      uLineWeight: { value: currentParams.lineWeight },
      uCoreBloom: { value: currentParams.coreBloom },
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
      uniform float uSpinPhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorWeb;
      uniform vec3 uColorHeart;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uPetals;
      uniform float uStep;
      uniform float uChordGlow;
      uniform float uLineWeight;
      uniform float uCoreBloom;
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

      // Distance from p to the chord a->b.
      float distSegment(vec2 p, vec2 a, vec2 b) {
        vec2 ab = b - a;
        float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        return length(p - (a + h * ab));
      }

      vec2 rosePoint(float degreesIn, float k, float scale) {
        float th = degreesIn * 0.01745329;
        float rr = cos(k * th) * scale;
        return vec2(cos(th), sin(th)) * rr;
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

        // Walk the maurer sequence: 64 chords per march-quality budget.
        float steps = clamp(64.0 * mix(0.6, 1.0, uMarchQuality), 32.0, 64.0);
        float scale = 0.8;
        float web = 0.0;
        vec2 prev = rosePoint(0.0, uPetals, scale);
        for (int i = 1; i <= 64; i++) {
          if (float(i) > steps) break;
          float deg = float(i) * uStep;
          vec2 cur = rosePoint(deg, uPetals, scale);
          web += exp(-pow(distSegment(p, prev, cur) / (0.012 * uLineWeight), 1.6));
          prev = cur;
        }
        web = 1.0 - exp(-web * 0.35 * uChordGlow);

        vec3 lin1 = max(uColorWeb, vec3(0.0));
        vec3 col = uColorHeart * (1.0 - uCoreBloom * 0.4);
        col = oklabMix(col, lin1 * 0.9, web);
        col += lin1 * pow(web, 4.0) * uChordGlow * 0.4;

        // Dome shading and rim over the medallion.
        float q = clamp(r / radius, 0.0, 1.0);
        float domeZ = sqrt(max(1.0 - q * q, 0.0));
        vec3 domeN = vec3(local, domeZ);
        vec3 lightDir = normalize(vec3(0.4, 0.55, 0.73));
        float lambert = 0.35 + 0.65 * clamp(dot(domeN, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - domeZ, 2.4);
        col *= lambert;
        col += uRimColor * fresnel * 0.3;
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
    if (nw.petals !== undefined) material.uniforms.uPetals.value = nw.petals;
    if (nw.step !== undefined) material.uniforms.uStep.value = nw.step;
    if (nw.chordGlow !== undefined) material.uniforms.uChordGlow.value = nw.chordGlow;
    if (nw.lineWeight !== undefined) material.uniforms.uLineWeight.value = nw.lineWeight;
    if (nw.coreBloom !== undefined) material.uniforms.uCoreBloom.value = nw.coreBloom;
    if (nw.gain !== undefined) material.uniforms.uGain.value = nw.gain;
    if (nw.contrast !== undefined) material.uniforms.uContrast.value = nw.contrast;
    if (nw.breatheAmp !== undefined) material.uniforms.uBreatheAmp.value = nw.breatheAmp;
    if (nw.colorWeb) material.uniforms.uColorWeb.value.set(nw.colorWeb);
    if (nw.colorHeart) material.uniforms.uColorHeart.value.set(nw.colorHeart);
    if (nw.rimColor) material.uniforms.uRimColor.value.set(nw.rimColor);
  }

  return {
    frame: { radius: 2.5 },

    update({ time, delta, pointer, marchQuality }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

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
