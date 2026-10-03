import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Phyllotaxis — the sunflower's golden-angle spiral.
//
// Vogel's model: seed n sits at radius c·√n, angle n·137.508°. Each seed
// breathes on its own slice of the phase, so a swell rolls outward through
// the spiral head. The count, dot size, and the golden angle itself are
// exposed — nudging the angle makes the whole head re-pack.
//
// Original code; the model is Helmut Vogel's (1979).

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.2;
const GOLDEN = 2.39996323;

export function createPhyllotaxisEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.1,
    count: 220,
    colorCore: '#ffd166',
    colorEdge: '#e879f9',
    colorBg: '#0c0a14',
    rimColor: '#fefce8',
    dotScale: 0.55,
    angleDrift: 0.0,
    dotBreath: 0.55,
    glow: 1.0,
    light: 0.9,
    gain: 1.0,
    contrast: 1.05,
    spinRate: 0.08,
    breatheRate: 0.4,
    breatheAmp: 0.05,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSpinPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDriftPhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse },
      uColorCore: { value: new THREE.Color(currentParams.colorCore) },
      uColorEdge: { value: new THREE.Color(currentParams.colorEdge) },
      uColorBg: { value: new THREE.Color(currentParams.colorBg) },
      uRimColor: { value: new THREE.Color(currentParams.rimColor) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uCount: { value: currentParams.count },
      uDotScale: { value: currentParams.dotScale },
      uAngleDrift: { value: currentParams.angleDrift },
      uDotBreath: { value: currentParams.dotBreath },
      uGlow: { value: currentParams.glow },
      uLight: { value: currentParams.light },
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
      uniform float uDriftPhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorCore;
      uniform vec3 uColorEdge;
      uniform vec3 uColorBg;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uCount;
      uniform float uDotScale;
      uniform float uAngleDrift;
      uniform float uDotBreath;
      uniform float uGlow;
      uniform float uLight;
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

        // Sweep the spiral once, nearest seed wins. marchQuality trims the
        // count for the nine-cell grid.
        float count = clamp(uCount * mix(0.6, 1.0, uMarchQuality), 60.0, 320.0);
        float angle = 2.39996323 + uAngleDrift + 0.05 * sin(uDriftPhase);
        float best = 1e9;
        float bestN = 0.0;
        for (int i = 0; i < 320; i++) {
          float fi = float(i);
          if (fi >= count) break;
          float rr = sqrt(fi / count);
          float th = fi * angle;
          vec2 seed = rr * vec2(cos(th), sin(th));
          float d = length(p - seed);
          if (d < best) { best = d; bestN = fi; }
        }

        // Seed size shrinks gently outward; each seed breathes on its own
        // slice of the phase.
        float nf = bestN / count;
        float seedR = uDotScale * 0.075 * (1.3 - 0.55 * sqrt(nf));
        seedR *= 1.0 - uDotBreath * 0.35 * (0.5 + 0.5 * sin(uBreathePhase * 2.0 - nf * 9.0));
        float seed = smoothstep(seedR, seedR * 0.55, best);

        vec3 lin1 = max(uColorCore, vec3(0.0));
        vec3 lin2 = max(uColorEdge, vec3(0.0));
        vec3 seedCol = oklabMix(lin1, lin2, nf);
        float seedLum = 1.05 - 0.45 * nf;

        vec3 col = uColorBg * (0.8 + 0.2 * (1.0 - nf));
        col = oklabMix(col, seedCol * seedLum, seed);
        col += seedCol * seed * uGlow * 0.35;

        // Dome shading and rim over the flat head.
        float q = clamp(r / radius, 0.0, 1.0);
        float domeZ = sqrt(max(1.0 - q * q, 0.0));
        vec3 domeN = vec3(local, domeZ);
        vec3 lightDir = normalize(vec3(0.4, 0.55, 0.73));
        float lambert = 0.35 + 0.65 * clamp(dot(domeN, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - domeZ, 2.4);
        col *= lambert * uLight;
        col += uRimColor * fresnel * 0.3;
        col += uColorCore * uPulse * 0.12;

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
    if (nw.count !== undefined) material.uniforms.uCount.value = nw.count;
    if (nw.dotScale !== undefined) material.uniforms.uDotScale.value = nw.dotScale;
    if (nw.angleDrift !== undefined) material.uniforms.uAngleDrift.value = nw.angleDrift;
    if (nw.dotBreath !== undefined) material.uniforms.uDotBreath.value = nw.dotBreath;
    if (nw.glow !== undefined) material.uniforms.uGlow.value = nw.glow;
    if (nw.light !== undefined) material.uniforms.uLight.value = nw.light;
    if (nw.gain !== undefined) material.uniforms.uGain.value = nw.gain;
    if (nw.contrast !== undefined) material.uniforms.uContrast.value = nw.contrast;
    if (nw.breatheAmp !== undefined) material.uniforms.uBreatheAmp.value = nw.breatheAmp;
    if (nw.colorCore) material.uniforms.uColorCore.value.set(nw.colorCore);
    if (nw.colorEdge) material.uniforms.uColorEdge.value.set(nw.colorEdge);
    if (nw.colorBg) material.uniforms.uColorBg.value.set(nw.colorBg);
    if (nw.rimColor) material.uniforms.uRimColor.value.set(nw.rimColor);
  }

  return {
    frame: { radius: 2.5 },

    update({ time, delta, pointer, marchQuality }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uSpinPhase.value = phaseTracker.phase('spin', currentParams.spinRate);
      material.uniforms.uBreathePhase.value = phaseTracker.phase('breathe', currentParams.breatheRate);
      material.uniforms.uDriftPhase.value = phaseTracker.phase('drift', 0.3);
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
