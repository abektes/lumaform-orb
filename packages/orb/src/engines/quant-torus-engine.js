import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Quant Torus — chunky quantized plasma flowing around a raymarched torus.
//
// Second shape experiment: a torus SDF marched per pixel, with the plasma
// pattern computed in the surface's natural (ring angle, tube angle)
// coordinates. Both angles wrap at TAU and the pixel counts are integers,
// so the chunky pixel lattice is seamless all the way around.
//
// Inspired by shadercn/XorDev orb-14 ("plasma dome quantized to chunky
// pixels"); original code, new geometry.

const FRAME_RADIUS = 4.25;
const BASE_RING_R = 1.35;
const BASE_TUBE_R = 0.65;
const BASE_TILT = 1.2;
const PROFILE_MAP = { round: 0, square: 1, hexagon: 2 };

export function createQuantTorusEngine({ scene, camera, params }) {
  const currentParams = {
    ringR: BASE_RING_R,
    tubeR: BASE_TUBE_R,
    tilt: BASE_TILT,
    profile: 'round',
    cells: 40,
    levels: 3,
    colorInk: '#101426',
    colorPaper: '#cfe6ff',
    patternScale: 2.0,
    plasmaAmp: 1.0,
    light: 0.9,
    rim: 0.35,
    gain: 1.0,
    contrast: 1.3,
    plasmaRate: 0.5,
    spinRate: 0.12,
    breatheRate: 0.35,
    breatheAmp: 0.04,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPlasmaPhase: { value: 0.0 },
      uSpinPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse },
      uColorInk: { value: new THREE.Color(currentParams.colorInk) },
      uColorPaper: { value: new THREE.Color(currentParams.colorPaper) },
      uRingR: { value: currentParams.ringR },
      uTubeR: { value: currentParams.tubeR },
      uProfile: { value: PROFILE_MAP[currentParams.profile] ?? 0 },
      uTilt: { value: currentParams.tilt },
      uCells: { value: currentParams.cells },
      uLevels: { value: currentParams.levels },
      uPatternScale: { value: currentParams.patternScale },
      uPlasmaAmp: { value: currentParams.plasmaAmp },
      uLight: { value: currentParams.light },
      uRim: { value: currentParams.rim },
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
      uniform float uPlasmaPhase;
      uniform float uSpinPhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorInk;
      uniform vec3 uColorPaper;
      uniform float uRingR;
      uniform float uTubeR;
      uniform float uProfile;
      uniform float uTilt;
      uniform float uCells;
      uniform float uLevels;
      uniform float uPatternScale;
      uniform float uPlasmaAmp;
      uniform float uLight;
      uniform float uRim;
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

      mat2 rot2(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      float sdHexagon2(vec2 p, float r) {
        const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
        p = abs(p);
        p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
        p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
        return length(p) * sign(p.y);
      }

      // Torus SDF; p is already in object space. The fixed tilt tips the
      // hole axis toward the camera so the ring reads as a donut, not a
      // mound. The tube cross-section is round, square or hexagonal.
      float map(vec3 p) {
        p.yz = rot2(uTilt) * p.yz;
        vec2 t = vec2(length(p.xz) - uRingR, p.y);
        if (uProfile < 0.5) return length(t) - uTubeR;
        if (uProfile < 1.5) {
          vec2 d = abs(t) - vec2(uTubeR * 0.82);
          return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
        }
        return sdHexagon2(t, uTubeR * 0.95);
      }

      vec3 calcNormal(vec3 p) {
        const vec2 e = vec2(0.0025, -0.0025);
        return normalize(
          e.xyy * map(p + e.xyy)
          + e.yyx * map(p + e.yyx)
          + e.yxy * map(p + e.yxy)
          + e.xxx * map(p + e.xxx));
      }

      void main() {
        vec2 ndc = (vUv - 0.5) * 2.0;
        vec4 clipPos = vec4(ndc, -1.0, 1.0);
        vec4 viewPos = cameraProjectionMatrixInverse * clipPos;
        vec3 rd = normalize((cameraWorldMatrix * vec4(viewPos.xyz, 0.0)).xyz);
        vec3 ro = cameraPosition;

        float breathe = 1.0 + uBreatheAmp * cos(uBreathePhase) + uPulse * 0.04;
        float tubeR = uTubeR * breathe;

        // Bounding-sphere entry: skip empty space, and never starve the
        // march budget when the camera sits far out on a tall viewport.
        float t = max(length(ro) - (uRingR + tubeR * 1.6 + 0.6), 0.0);
        bool hit = false;
        int steps = int(64.0 * mix(0.6, 1.0, clamp(uMarchQuality, 0.0, 1.0)));
        for (int i = 0; i < 64; i++) {
          if (i >= steps) break;
          float d = map(ro + rd * t);
          if (d < 0.0012 * t + 0.0008) { hit = true; break; }
          t += d;
          if (t > length(ro) + uRingR + tubeR * 1.6 + 0.6) break;
        }

        if (!hit) {
          gl_FragColor = vec4(0.0);
          return;
        }

        vec3 pos = ro + rd * t;

        // Object space: the same spin the SDF saw, plus the fixed tilt.
        vec3 q = pos;
        q.xz = rot2(uSpinPhase) * q.xz;
        q.yz = rot2(uTilt) * q.yz;

        // Surface coordinates: ring angle and tube angle. uCells is an
        // integer, so both angular wraps at TAU are exactly seamless.
        vec2 ang = vec2(atan(q.z, q.x), atan(q.y, length(q.xz) - uRingR));
        vec2 domain = ang / 6.2831853 * uCells;

        // Chunky pixels: sample the plasma at cell centres only.
        vec2 pq = floor(domain) + 0.5;
        float val = sin(pq.x * 0.55 + uPlasmaPhase)
          + sin(pq.y * 0.75 - uPlasmaPhase * 0.7)
          + uPlasmaAmp * vnoise(vec3(pq * 0.22 * uPatternScale, uPlasmaPhase * 0.12));
        val = val / (2.0 + uPlasmaAmp) * 0.5 + 0.5;

        float v = floor(val * uLevels) / max(uLevels - 1.0, 1.0);
        v = clamp(v, 0.0, 1.0);

        vec3 col = oklabMix(uColorInk, uColorPaper, v);
        col *= 0.7 + 0.5 * v;

        vec3 nrm = calcNormal(pos);
        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(nrm, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - clamp(dot(nrm, -rd), 0.0, 1.0), 2.6);
        col *= (0.45 + 0.55 * lambert) * uLight;
        col += uColorPaper * fresnel * uRim;
        col += uColorPaper * uPulse * 0.12;

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
    if (n.ringR !== undefined) material.uniforms.uRingR.value = n.ringR;
    if (n.tubeR !== undefined) material.uniforms.uTubeR.value = n.tubeR;
    if (n.tilt !== undefined) material.uniforms.uTilt.value = n.tilt;
    if (n.profile !== undefined) material.uniforms.uProfile.value = PROFILE_MAP[n.profile] ?? 0;
    if (n.cells !== undefined) material.uniforms.uCells.value = n.cells;
    if (n.levels !== undefined) material.uniforms.uLevels.value = n.levels;
    if (n.patternScale !== undefined) material.uniforms.uPatternScale.value = n.patternScale;
    if (n.plasmaAmp !== undefined) material.uniforms.uPlasmaAmp.value = n.plasmaAmp;
    if (n.light !== undefined) material.uniforms.uLight.value = n.light;
    if (n.rim !== undefined) material.uniforms.uRim.value = n.rim;
    if (n.gain !== undefined) material.uniforms.uGain.value = n.gain;
    if (n.contrast !== undefined) material.uniforms.uContrast.value = n.contrast;
    if (n.breatheAmp !== undefined) material.uniforms.uBreatheAmp.value = n.breatheAmp;
    if (n.colorInk) material.uniforms.uColorInk.value.set(n.colorInk);
    if (n.colorPaper) material.uniforms.uColorPaper.value.set(n.colorPaper);
  }

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta, marchQuality }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uPlasmaPhase.value = phaseTracker.phase('plasma', currentParams.plasmaRate);
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
