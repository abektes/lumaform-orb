import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Harmonograph — a damped pendulum trace, drawn in ink.
//
// x(t) = A·sin(f1·t + φ1)·e^{-d·t}, y likewise with f2: the Victorian
// harmonograph's figure. The shader sweeps t across the trace and glows
// near the pen path, so the ink sits ON the curve; the trace length
// breathes, which reads as the figure being slowly drawn and redrawn.
//
// Original code; the instrument is Tisley & Spiller's, 1877.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.2;

export function createHarmonographEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.1,
    colorInk: '#1d4ed8',
    colorPaper: '#f8f5ec',
    rimColor: '#dbeafe',
    freqA: 3.0,
    freqB: 2.0,
    damping: 0.16,
    traceLength: 10.0,
    lineWeight: 1.9,
    inkGlow: 1.2,
    gain: 1.0,
    contrast: 1.0,
    driftRate: 0.18,
    spinRate: 0.04,
    breatheRate: 0.3,
    breatheAmp: 0.05,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDriftPhase: { value: 0.0 },
      uSpinPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse },
      uColorInk: { value: new THREE.Color(currentParams.colorInk) },
      uColorPaper: { value: new THREE.Color(currentParams.colorPaper) },
      uRimColor: { value: new THREE.Color(currentParams.rimColor) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uFreqA: { value: currentParams.freqA },
      uFreqB: { value: currentParams.freqB },
      uDamping: { value: currentParams.damping },
      uTraceLength: { value: currentParams.traceLength },
      uLineWeight: { value: currentParams.lineWeight },
      uInkGlow: { value: currentParams.inkGlow },
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
      uniform float uDriftPhase;
      uniform float uSpinPhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorInk;
      uniform vec3 uColorPaper;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uFreqA;
      uniform float uFreqB;
      uniform float uDamping;
      uniform float uTraceLength;
      uniform float uLineWeight;
      uniform float uInkGlow;
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

      // Distance from p to the chord a->b (the pen stroke between samples).
      float distSegment(vec2 p, vec2 a, vec2 b) {
        vec2 ab = b - a;
        float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        return length(p - (a + h * ab));
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
        float tt = dot(-ro, planeN) / denom;
        if (tt <= 0.0) { gl_FragColor = vec4(0.0); return; }
                vec3 hit = ro + rd * tt;
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

        // Sweep the pen path as connected strokes — distance to the SEGMENT
        // between consecutive samples, so the ink is a line, not a fog. The
        // phase drifts the two pendulums against each other, so the figure
        // rotates through its family. marchQuality trims samples in the grid.
        float samples = clamp(56.0 * mix(0.6, 1.0, uMarchQuality), 24.0, 56.0);
        float tMax = uTraceLength * (1.0 + 0.06 * cos(uBreathePhase));
        float ph = uDriftPhase * 0.5;
        float ink = 0.0;
        for (int i = 0; i < 56; i++) {
          float fi = float(i);
          if (fi >= samples) break;
          float t1 = (fi + 0.5) / samples * tMax;
          float t2 = (fi + 1.5) / samples * tMax;
          float dcy1 = exp(-uDamping * t1);
          float dcy2 = exp(-uDamping * t2);
          vec2 c1 = vec2(sin(uFreqA * t1 + ph) * dcy1, sin(uFreqB * t1) * dcy1) * 0.72;
          vec2 c2 = vec2(sin(uFreqA * t2 + ph) * dcy2, sin(uFreqB * t2) * dcy2) * 0.72;
          float dd = distSegment(p, c1, c2);
          ink += exp(-dd * dd * uLineWeight * uLineWeight * 90.0);
        }
        ink = clamp(ink * 0.85, 0.0, 1.0);

        vec3 col = uColorPaper * 0.92;
        vec3 inkCol = max(uColorInk, vec3(0.0));
        col = oklabMix(col, inkCol * 0.85, ink);
        col += inkCol * pow(ink, 3.0) * uInkGlow * 0.5;

        // Dome shading and rim over the paper.
        float q = clamp(r / radius, 0.0, 1.0);
        float domeZ = sqrt(max(1.0 - q * q, 0.0));
        vec3 domeN = vec3(local, domeZ);
        vec3 lightDir = normalize(vec3(0.4, 0.55, 0.73));
        float lambert = 0.35 + 0.65 * clamp(dot(domeN, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - domeZ, 2.4);
        col *= lambert * uGain;
        col += uRimColor * fresnel * 0.25;
        col += inkCol * uPulse * 0.1;

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
    if (nw.freqA !== undefined) material.uniforms.uFreqA.value = nw.freqA;
    if (nw.freqB !== undefined) material.uniforms.uFreqB.value = nw.freqB;
    if (nw.damping !== undefined) material.uniforms.uDamping.value = nw.damping;
    if (nw.traceLength !== undefined) material.uniforms.uTraceLength.value = nw.traceLength;
    if (nw.lineWeight !== undefined) material.uniforms.uLineWeight.value = nw.lineWeight;
    if (nw.inkGlow !== undefined) material.uniforms.uInkGlow.value = nw.inkGlow;
    if (nw.gain !== undefined) material.uniforms.uGain.value = nw.gain;
    if (nw.contrast !== undefined) material.uniforms.uContrast.value = nw.contrast;
    if (nw.breatheAmp !== undefined) material.uniforms.uBreatheAmp.value = nw.breatheAmp;
    if (nw.colorInk) material.uniforms.uColorInk.value.set(nw.colorInk);
    if (nw.colorPaper) material.uniforms.uColorPaper.value.set(nw.colorPaper);
    if (nw.rimColor) material.uniforms.uRimColor.value.set(nw.rimColor);
  }

  return {
    frame: { radius: 2.5 },

    update({ time, delta, pointer, marchQuality }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uDriftPhase.value = phaseTracker.phase('drift', currentParams.driftRate);
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
