import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Caustic Pool — underwater light caustics over the sphere.
//
// Three octaves of ridged value noise: each ridge line is a bright
// filament, and stacked at increasing frequency with drifting phases the
// filaments cross and knot into the classic caustic net. The water tint
// deepens away from the key light; filaments warm at the crest.
//
// Original code; the ridged-octave construction is the standard caustic
// approximation (radiosity-aware estimators do it with photon maps).

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.15;

export function createCausticPoolEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.18,
    colorShallow: '#67e8f9',
    colorDeep: '#0e3a5c',
    colorFilament: '#f0fdfa',
    filamentSharp: 9.0,
    waterScale: 2.2,
    warpAmp: 0.6,
    flowRate: 0.4,
    gain: 1.0,
    contrast: 1.1,
    light: 0.85,
    rim: 0.3,
    haloStrength: 0.2,
    driftSpin: 0.1,
    counterSpin: -0.07,
    breatheRate: 0.35,
    breatheAmp: 0.06,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uFlowPhase: { value: 0.0 },
      uDriftPhase: { value: 0.0 },
      uCounterPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse },
      uColorShallow: { value: new THREE.Color(currentParams.colorShallow) },
      uColorDeep: { value: new THREE.Color(currentParams.colorDeep) },
      uColorFilament: { value: new THREE.Color(currentParams.colorFilament) },
      uRimColor: { value: new THREE.Color(currentParams.colorFilament) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uFilamentSharp: { value: currentParams.filamentSharp },
      uWaterScale: { value: currentParams.waterScale },
      uWarpAmp: { value: currentParams.warpAmp },
      uGain: { value: currentParams.gain },
      uContrast: { value: currentParams.contrast },
      uLight: { value: currentParams.light },
      uRim: { value: currentParams.rim },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uPointer: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float uFlowPhase;
      uniform float uDriftPhase;
      uniform float uCounterPhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorShallow;
      uniform vec3 uColorDeep;
      uniform vec3 uColorFilament;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uFilamentSharp;
      uniform float uWaterScale;
      uniform float uWarpAmp;
      uniform float uGain;
      uniform float uContrast;
      uniform float uLight;
      uniform float uRim;
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

      vec2 intersectSphere(vec3 ro, vec3 rd, float r) {
        float b = dot(ro, rd);
        float c = dot(ro, ro) - r * r;
        float h = b * b - c;
        if (h < 0.0) return vec2(0.0);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      void main() {
        vec2 ndc = (vUv - 0.5) * 2.0;
        vec4 clipPos = vec4(ndc, -1.0, 1.0);
        vec4 viewPos = cameraProjectionMatrixInverse * clipPos;
        vec3 rd = normalize((cameraWorldMatrix * vec4(viewPos.xyz, 0.0)).xyz);
        vec3 ro = cameraPosition;

        float breathe = 1.0 + uBreatheAmp * cos(uBreathePhase) + uPulse * 0.05;
        float radius = uRadius * breathe;

        vec2 hit = intersectSphere(ro, rd, radius);
        if (hit.y <= 0.0) { gl_FragColor = vec4(0.0); return; }

        vec3 p = normalize(ro + rd * hit.x);
        vec3 pole = normalize(vec3(uPointer.x * 0.35, uPointer.y * 0.35, 1.0));
        vec3 tX = normalize(cross(pole, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
        vec3 tY = cross(pole, tX);
        vec3 domain = vec3(dot(p, tX), dot(p, tY), dot(p, pole));

        float ca = cos(uDriftPhase), sa = sin(uDriftPhase);
        vec3 layerA = vec3(domain.x * ca - domain.y * sa, domain.x * sa + domain.y * ca, domain.z);
        float cb = cos(uCounterPhase), sb = sin(uCounterPhase);
        vec3 layerB = vec3(domain.x * cb + domain.z * sb, domain.y, -domain.x * sb + domain.z * cb);
        vec2 q = mix(layerA, layerB, 0.5).xy * uWaterScale;

        // Refraction wobble: the water surface bends the light before it
        // lands, so the net swims instead of sliding.
        q += uWarpAmp * 0.4 * vec2(
          vnoise(vec3(q * 0.7, uFlowPhase * 0.35)),
          vnoise(vec3(q * 0.7 + 4.7, uFlowPhase * 0.3)));

        // Ridged caustics: three octaves, each a sharpened noise ridge.
        float net = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float n = vnoise(vec3(q * (1.0 + fi * 0.85), uFlowPhase * (0.5 + fi * 0.25) + fi * 3.1));
          net += pow(1.0 - abs(n), uFilamentSharp * (1.0 - fi * 0.18));
        }
        net /= 3.0;

        vec3 lin1 = max(uColorShallow, vec3(0.0));
        vec3 lin2 = max(uColorDeep, vec3(0.0));
        // Water colour rides the net directly: bright ridges reach the
        // shallow tint, dark cells sink to the deep tint.
        vec3 water = oklabMix(lin2 * 0.7, lin1, clamp(net * 1.5, 0.0, 1.0));

        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(p, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - clamp(dot(p, -rd), 0.0, 1.0), 2.6);
        float terminator = 0.3 + 0.7 * lambert;

        vec3 col = water * terminator * uLight;
        col += uColorFilament * pow(net, 1.6) * 1.8;
        col += uColorFilament * fresnel * uRim;
        col += lin1 * uPulse * 0.15;

        col *= uGain;
        col = (col - 0.5) * uContrast + 0.5;

        float dither = hash13(vec3(gl_FragCoord.xy, uDitherPhase * 371.0));
        col += (dither - 0.5) * (1.0 / 255.0) * 3.0;

        float rimDist = 1.0 - fresnel;
        float edge = smoothstep(0.0, uEdgeFade, rimDist);
        gl_FragColor = vec4(max(col, vec3(0.0)), edge);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(currentParams.colorShallow) },
      glowStrength: { value: currentParams.haloStrength },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float glowStrength;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
        float innerFade = smoothstep(1.0, 0.82, max(dot(viewDir, normal), 0.0));
        gl_FragColor = vec4(glowColor, fresnel * innerFade * glowStrength);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const haloMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BASE_RADIUS * 1.03, 48, 48),
    haloMaterial
  );
  haloMesh.renderOrder = 1;
  scene.add(haloMesh);

  const fullScreenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  fullScreenQuad.frustumCulled = false;
  fullScreenQuad.renderOrder = 0;
  scene.add(fullScreenQuad);

  let pulseValue = 0;
  const phaseTracker = createPhaseTracker();

  function applyParams(nw) {
    Object.assign(currentParams, nw);
    if (nw.radius !== undefined) {
      material.uniforms.uRadius.value = nw.radius;
      haloMesh.scale.setScalar(nw.radius / BASE_RADIUS);
    }
    if (nw.edgeFade !== undefined) material.uniforms.uEdgeFade.value = nw.edgeFade;
    if (nw.filamentSharp !== undefined) material.uniforms.uFilamentSharp.value = nw.filamentSharp;
    if (nw.waterScale !== undefined) material.uniforms.uWaterScale.value = nw.waterScale;
    if (nw.warpAmp !== undefined) material.uniforms.uWarpAmp.value = nw.warpAmp;
    if (nw.gain !== undefined) material.uniforms.uGain.value = nw.gain;
    if (nw.contrast !== undefined) material.uniforms.uContrast.value = nw.contrast;
    if (nw.light !== undefined) material.uniforms.uLight.value = nw.light;
    if (nw.rim !== undefined) material.uniforms.uRim.value = nw.rim;
    if (nw.breatheAmp !== undefined) material.uniforms.uBreatheAmp.value = nw.breatheAmp;
    if (nw.colorShallow) {
      material.uniforms.uColorShallow.value.set(nw.colorShallow);
      haloMaterial.uniforms.glowColor.value.set(nw.colorShallow);
    }
    if (nw.colorDeep) material.uniforms.uColorDeep.value.set(nw.colorDeep);
    if (nw.colorFilament) material.uniforms.uColorFilament.value.set(nw.colorFilament);
    if (nw.haloStrength !== undefined) haloMaterial.uniforms.glowStrength.value = nw.haloStrength;
  }

  return {
    frame: { radius: 2.5 },

    update({ time, delta, pointer }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uFlowPhase.value = phaseTracker.phase('flow', currentParams.flowRate);
      material.uniforms.uDriftPhase.value = phaseTracker.phase('drift', currentParams.driftSpin);
      material.uniforms.uCounterPhase.value = phaseTracker.phase('counter', currentParams.counterSpin);
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
      scene.remove(haloMesh);
      material.dispose();
      haloMaterial.dispose();
      fullScreenQuad.geometry.dispose();
      haloMesh.geometry.dispose();
    },
  };
}
