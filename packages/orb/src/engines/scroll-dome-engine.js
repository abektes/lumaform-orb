import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Scroll Dome — ornate scrollwork curling over a rolling sphere.
//
// Two sine grids warp each other into interlocking scroll curves; the
// absolute value of the interference picks out the ink lines. The plate
// rolls slowly (drift + counter-drift, as everywhere in this family) and
// swells on the breathe phase like a held breath.
//
// Inspired by the shadercn/XorDev "scrollwork dome" orbs; original code.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.15;

export function createScrollDomeEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.18,
    color1: '#ffd166',
    color2: '#0b1026',
    rimColor: '#fef3c7',
    patternScale: 5.2,
    patternZoom: 2.4,
    swirlAmp: 2.3,
    warpFreq: 2.1,
    lineClamp: 0.09,
    gain: 1.0,
    rim: 0.35,
    light: 0.9,
    haloStrength: 0.15,
    swirlRate: 0.16,
    counterSpin: -0.1,
    swell: 0.05,
    breatheRate: 0.4,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDriftPhase: { value: 0.0 },
      uCounterPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse },
      uColor1: { value: new THREE.Color(currentParams.color1) },
      uColor2: { value: new THREE.Color(currentParams.color2) },
      uRimColor: { value: new THREE.Color(currentParams.rimColor) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uScale: { value: currentParams.patternScale },
      uZoom: { value: currentParams.patternZoom },
      uSwirl: { value: currentParams.swirlAmp },
      uWarpFreq: { value: currentParams.warpFreq },
      uLineClamp: { value: currentParams.lineClamp },
      uGain: { value: currentParams.gain },
      uRim: { value: currentParams.rim },
      uLight: { value: currentParams.light },
      uSwell: { value: currentParams.swell },
      uPointer: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float uDriftPhase;
      uniform float uCounterPhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uScale;
      uniform float uZoom;
      uniform float uSwirl;
      uniform float uWarpFreq;
      uniform float uLineClamp;
      uniform float uGain;
      uniform float uRim;
      uniform float uLight;
      uniform float uSwell;
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

        float breathe = 1.0 + uSwell * cos(uBreathePhase) + uPulse * 0.05;
        float radius = uRadius * breathe;

        vec2 hit = intersectSphere(ro, rd, radius);
        if (hit.y <= 0.0) { gl_FragColor = vec4(0.0); return; }

        vec3 p = normalize(ro + rd * hit.x);
        vec3 pole = normalize(vec3(uPointer.x * 0.35, uPointer.y * 0.35, 1.0));
        vec3 tX = normalize(cross(pole, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
        vec3 tY = cross(pole, tX);
        vec3 domain = vec3(dot(p, tX), dot(p, tY), dot(p, pole)) * uScale;

        float ca = cos(uDriftPhase), sa = sin(uDriftPhase);
        vec3 layerA = vec3(domain.x * ca - domain.y * sa, domain.x * sa + domain.y * ca, domain.z);
        float cb = cos(uCounterPhase), sb = sin(uCounterPhase);
        vec3 layerB = vec3(domain.x * cb + domain.z * sb, domain.y, -domain.x * sb + domain.z * cb);
        vec2 q = mix(layerA, layerB, 0.5).xy;

        // Interlocked scroll curves: each axis warps the other; the uZoom
        // fold sharpens the interference into filigree.
        float s1 = sin(q.x * uWarpFreq + uSwirl * sin(q.y * uWarpFreq * 0.8 + uDriftPhase));
        float s2 = sin(q.y * uWarpFreq + uSwirl * sin(q.x * uWarpFreq * 0.8 - uCounterPhase));
        float line = abs(sin((s1 + s2) * uZoom));

        // Ink lines at the zero crossings; a whisper of gold between them.
        float ink = 1.0 - smoothstep(uLineClamp, uLineClamp + 0.14, line);
        float inner = smoothstep(uLineClamp + 0.3, uLineClamp + 0.9, line);

        vec3 lin1 = max(uColor1, vec3(0.0));
        vec3 lin2 = max(uColor2, vec3(0.0));
        vec3 col = oklabMix(lin2, lin1, ink);
        col += lin1 * inner * 0.12 * uGain;

        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(p, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - clamp(dot(p, -rd), 0.0, 1.0), 2.6);
        float terminator = 0.35 + 0.65 * lambert;
        col *= terminator * uLight;
        col += uRimColor * fresnel * uRim;
        col += lin1 * uPulse * 0.15;

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

  const fullScreenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  fullScreenQuad.frustumCulled = false;
  fullScreenQuad.renderOrder = 0;
  scene.add(fullScreenQuad);

  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(currentParams.color1) },
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

  let pulseValue = 0;
  const phaseTracker = createPhaseTracker();

  function applyParams(n) {
    Object.assign(currentParams, n);
    if (n.radius !== undefined) {
      material.uniforms.uRadius.value = n.radius;
      haloMesh.scale.setScalar(n.radius / BASE_RADIUS);
    }
    if (n.edgeFade !== undefined) material.uniforms.uEdgeFade.value = n.edgeFade;
    if (n.patternScale !== undefined) material.uniforms.uScale.value = n.patternScale;
    if (n.patternZoom !== undefined) material.uniforms.uZoom.value = n.patternZoom;
    if (n.swirlAmp !== undefined) material.uniforms.uSwirl.value = n.swirlAmp;
    if (n.warpFreq !== undefined) material.uniforms.uWarpFreq.value = n.warpFreq;
    if (n.lineClamp !== undefined) material.uniforms.uLineClamp.value = n.lineClamp;
    if (n.gain !== undefined) material.uniforms.uGain.value = n.gain;
    if (n.rim !== undefined) material.uniforms.uRim.value = n.rim;
    if (n.light !== undefined) material.uniforms.uLight.value = n.light;
    if (n.swell !== undefined) material.uniforms.uSwell.value = n.swell;
    if (n.color1) {
      material.uniforms.uColor1.value.set(n.color1);
      haloMaterial.uniforms.glowColor.value.set(n.color1);
    }
    if (n.color2) material.uniforms.uColor2.value.set(n.color2);
    if (n.rimColor) material.uniforms.uRimColor.value.set(n.rimColor);
    if (n.haloStrength !== undefined) haloMaterial.uniforms.glowStrength.value = n.haloStrength;
  }

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta, pointer }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uDriftPhase.value = phaseTracker.phase('drift', currentParams.swirlRate);
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
