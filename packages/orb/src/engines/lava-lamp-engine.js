import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Lava Lamp — soft metaballs merging and splitting over the sphere.
//
// Five blobs ride slow Lissajous orbits (stable per-blob phases from a
// hash); their inverse-square field is thresholded with a soft edge, so
// blobs stretch toward each other, kiss, and part — the whole vocabulary of
// goo. Shading is field-depth (deeper inside is denser) plus a white glint
// where the field crests.
//
// Original code; the field is Hirota & ... — no, it is simply the classic
// metaball field of Blinn (1982).

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.15;

export function createLavaLampEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.18,
    colorGel: '#fb7185',
    colorGelDeep: '#7c2d4e',
    colorSpec: '#ffe4e6',
    blobCount: 5,
    blobSpread: 0.55,
    blobSize: 0.45,
    fieldSharp: 0.08,
    gooRate: 0.35,
    gain: 1.0,
    contrast: 1.05,
    light: 0.9,
    rim: 0.3,
    haloStrength: 0.2,
    driftSpin: 0.08,
    counterSpin: -0.06,
    breatheRate: 0.35,
    breatheAmp: 0.06,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uGooPhase: { value: 0.0 },
      uDriftPhase: { value: 0.0 },
      uCounterPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse },
      uColorGel: { value: new THREE.Color(currentParams.colorGel) },
      uColorGelDeep: { value: new THREE.Color(currentParams.colorGelDeep) },
      uColorSpec: { value: new THREE.Color(currentParams.colorSpec) },
      uRimColor: { value: new THREE.Color(currentParams.colorSpec) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uBlobCount: { value: currentParams.blobCount },
      uBlobSpread: { value: currentParams.blobSpread },
      uBlobSize: { value: currentParams.blobSize },
      uFieldSharp: { value: currentParams.fieldSharp },
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
      uniform float uGooPhase;
      uniform float uDriftPhase;
      uniform float uCounterPhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorGel;
      uniform vec3 uColorGelDeep;
      uniform vec3 uColorSpec;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uBlobCount;
      uniform float uBlobSpread;
      uniform float uBlobSize;
      uniform float uFieldSharp;
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
        vec2 q = mix(layerA, layerB, 0.5).xy;

        // Five blobs on hash-seeded Lissajous orbits — stable, no popping.
        float field = 0.0;
        for (int i = 0; i < 7; i++) {
          if (float(i) >= uBlobCount) break;
          float fi = float(i);
          float h1 = hash13(vec3(fi, 1.7, 9.1));
          float h2 = hash13(vec3(fi, 4.3, 2.9));
          vec2 c = uBlobSpread * 1.0 * vec2(
            sin(uGooPhase * (0.55 + h1 * 0.5) + h1 * 6.2831853),
            sin(uGooPhase * (0.45 + h2 * 0.5) + h2 * 6.2831853));
          // Bias the cluster into the visible dome (the studio frames the
          // upper hemisphere; the equator sits at the panel crop line).
          c.y += 0.38;
          float rad = uBlobSize * (0.55 + 0.5 * h2);
          vec2 dv = q - c;
          field += (rad * rad) / (dot(dv, dv) + 0.02);
        }

        // Gel body: denser deeper in; crest glint where the field crests.
        // Threshold above 1 so five simultaneous blobs stay distinct: a lone
        // blob crests well past it, a scattered pair does not.
        float inside = 1.0 - smoothstep(1.5 - uFieldSharp, 1.5 + uFieldSharp, field);
        float depth = clamp((field - 1.5) * 0.5, 0.0, 1.0);
        vec3 lin1 = max(uColorGel, vec3(0.0));
        vec3 lin2 = max(uColorGelDeep, vec3(0.0));
        vec3 gel = oklabMix(lin1, lin2, depth * 0.6) * 1.25;

        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(p, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - clamp(dot(p, -rd), 0.0, 1.0), 2.6);
        float terminator = 0.3 + 0.7 * lambert;

        vec3 col = oklabMix(uColorGelDeep * 0.12, gel * terminator, inside);
        col += uColorSpec * pow(clamp(field - 2.0, 0.0, 2.0) * 0.6, 2.0) * inside * 0.8;
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

  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(currentParams.colorGel) },
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
    if (nw.blobCount !== undefined) material.uniforms.uBlobCount.value = nw.blobCount;
    if (nw.blobSpread !== undefined) material.uniforms.uBlobSpread.value = nw.blobSpread;
    if (nw.blobSize !== undefined) material.uniforms.uBlobSize.value = nw.blobSize;
    if (nw.fieldSharp !== undefined) material.uniforms.uFieldSharp.value = nw.fieldSharp;
    if (nw.gain !== undefined) material.uniforms.uGain.value = nw.gain;
    if (nw.contrast !== undefined) material.uniforms.uContrast.value = nw.contrast;
    if (nw.light !== undefined) material.uniforms.uLight.value = nw.light;
    if (nw.rim !== undefined) material.uniforms.uRim.value = nw.rim;
    if (nw.breatheAmp !== undefined) material.uniforms.uBreatheAmp.value = nw.breatheAmp;
    if (nw.colorGel) {
      material.uniforms.uColorGel.value.set(nw.colorGel);
      haloMaterial.uniforms.glowColor.value.set(nw.colorGel);
    }
    if (nw.colorGelDeep) material.uniforms.uColorGelDeep.value.set(nw.colorGelDeep);
    if (nw.colorSpec) material.uniforms.uColorSpec.value.set(nw.colorSpec);
    if (nw.haloStrength !== undefined) haloMaterial.uniforms.glowStrength.value = nw.haloStrength;
  }

  return {
    frame: { radius: 2.5 },

    update({ time, delta, pointer }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uGooPhase.value = phaseTracker.phase('goo', currentParams.gooRate);
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
