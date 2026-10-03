import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Prism Veil — thin-film iridescence flowing over a warped heightfield.
//
// A domain-warped fbm field is treated as the thickness of an oil film on the
// sphere. The interference colour of that film — a cosine spectral palette
// over thickness — supplies the hue; the two engine colours tint it, so the
// studio's palette harmonies still land. The heightfield gradient also
// perturbs the sphere normal, which buys a moving specular glint: the orb
// reads as wet, not painted.
//
// Same clock discipline as Silk Warp: every time term is a wrapped phase.
// The spectral shift term is consumed inside cos(TAU * (t + shift)), so its
// wrap period is 1.0, not TAU.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.15;

export function createPrismVeilEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.18,
    octaves: 5,
    color1: '#2dd4bf',
    color2: '#7c3aed',
    rimColor: '#eef2ff',
    filmThickness: 1.6,
    filmFrequency: 1.0,
    iridStrength: 0.75,
    sheen: 0.6,
    contrast: 1.1,
    glow: 1.0,
    haloStrength: 0.22,
    warpDepth: 1.35,
    driftSpin: 0.18,
    counterSpin: -0.11,
    breatheRate: 0.4,
    breatheAmp: 0.07,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDriftPhase: { value: 0.0 },
      uCounterPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uShiftPhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: {
        value: camera.projectionMatrixInverse,
      },
      uColor1: { value: new THREE.Color(currentParams.color1) },
      uColor2: { value: new THREE.Color(currentParams.color2) },
      uRimColor: { value: new THREE.Color(currentParams.rimColor) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uOctaves: { value: currentParams.octaves },
      uThickness: { value: currentParams.filmThickness },
      uFrequency: { value: currentParams.filmFrequency },
      uIrid: { value: currentParams.iridStrength },
      uSheen: { value: currentParams.sheen },
      uContrast: { value: currentParams.contrast },
      uGlow: { value: currentParams.glow },
      uWarpDepth: { value: currentParams.warpDepth },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uMarchQuality: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uDriftPhase;
      uniform float uCounterPhase;
      uniform float uBreathePhase;
      uniform float uShiftPhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uOctaves;
      uniform float uThickness;
      uniform float uFrequency;
      uniform float uIrid;
      uniform float uSheen;
      uniform float uContrast;
      uniform float uGlow;
      uniform float uWarpDepth;
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

      mat3 octaveTwist() {
        return mat3(
          0.36, 0.48, -0.8,
          -0.8, 0.60, 0.0,
          0.48, 0.64, 0.6);
      }

      float fbm(vec3 p, float octaves) {
        float sum = 0.0;
        float amp = 0.5;
        mat3 twist = octaveTwist();
        for (int i = 0; i < 6; i++) {
          if (float(i) >= octaves) break;
          sum += amp * vnoise(p);
          p = twist * p * 2.03;
          amp *= 0.52;
        }
        return sum;
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
        if (hit.y <= 0.0) {
          gl_FragColor = vec4(0.0);
          return;
        }

        vec3 p = normalize(ro + rd * hit.x);
        vec3 pole = normalize(vec3(uPointer.x * 0.35, uPointer.y * 0.35, 1.0));

        vec3 tX = normalize(cross(pole, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
        vec3 tY = cross(pole, tX);
        vec3 domain = vec3(dot(p, tX), dot(p, tY), dot(p, pole)) * 2.1;

        float ca = cos(uDriftPhase), sa = sin(uDriftPhase);
        vec3 layerA = vec3(
          domain.x * ca - domain.y * sa,
          domain.x * sa + domain.y * ca,
          domain.z);
        float cb = cos(uCounterPhase), sb = sin(uCounterPhase);
        vec3 layerB = vec3(
          domain.x * cb + domain.z * sb,
          domain.y,
          -domain.x * sb + domain.z * cb);

        float octaves = clamp(uOctaves * mix(0.7, 1.0, uMarchQuality), 2.0, 6.0);
        vec3 q = vec3(
          fbm(layerA, octaves),
          fbm(layerA + vec3(5.2, 1.3, 8.4), octaves),
          fbm(layerA + vec3(9.1, 4.7, 2.6), octaves));
        vec3 filmDomain = layerB + uWarpDepth * q;

        // Film thickness field plus its tangent-space gradient (first-order
        // bump): three samples, epsilon tuned to the domain scale.
        float h0 = fbm(filmDomain, octaves);
        float eps = 0.09;
        float hx = fbm(filmDomain + tX * eps, octaves);
        float hy = fbm(filmDomain + tY * eps, octaves);

        float v = clamp((h0 * 0.75 + 0.5 - 0.5) * uContrast + 0.5, 0.0, 1.0);

        // Interference colour: a cosine spectral sweep over thickness. The
        // shift phase slides the spectrum; period 1 because of the TAU inside.
        float thickness = uThickness * (0.35 + 0.65 * v) + uShiftPhase;
        vec3 irid = 0.5 + 0.5 * cos(6.2831853 * (thickness * uFrequency * vec3(1.0, 0.85, 0.7) + vec3(0.0, 0.33, 0.67)));
        irid = pow(irid, vec3(1.25));

        vec3 lin1 = max(uColor1, vec3(0.0));
        vec3 lin2 = max(uColor2, vec3(0.0));
        vec3 base = oklabMix(lin1, lin2, v);

        // Tint the interference with the engine palette: the spectral sweep
        // supplies structure, the palette supplies identity.
        vec3 body = base * (1.0 - uIrid * 0.55) + irid * base * (0.9 + uIrid * 1.7);

        // Gradient-perturbed normal gives the film a wet specular glint.
        float bump = 0.85;
        vec3 n = normalize(p - (tX * (hx - h0) + tY * (hy - h0)) * bump * 2.2);
        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(n, lightDir), 0.0, 1.0);
        vec3 halfV = normalize(lightDir - rd);
        float spec = pow(clamp(dot(n, halfV), 0.0, 1.0), 64.0) * uSheen;
        float fresnel = pow(1.0 - clamp(dot(p, -rd), 0.0, 1.0), 2.6);
        float terminator = 0.3 + 0.7 * lambert;

        float lum = 0.22 + 0.78 * smoothstep(0.15, 0.85, v);
        vec3 col = body * terminator * lum * uGlow * 0.5;
        col += vec3(1.0, 0.97, 0.92) * spec * 0.6;
        col += uRimColor * fresnel * 0.24;
        col += oklabMix(lin1, lin2, 0.5) * uPulse * 0.12;

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

  function applyParams(newParams) {
    Object.assign(currentParams, newParams);

    if (newParams.radius !== undefined) {
      material.uniforms.uRadius.value = newParams.radius;
      haloMesh.scale.setScalar(newParams.radius / BASE_RADIUS);
    }
    if (newParams.edgeFade !== undefined) {
      material.uniforms.uEdgeFade.value = newParams.edgeFade;
    }
    if (newParams.octaves !== undefined) {
      material.uniforms.uOctaves.value = newParams.octaves;
    }
    if (newParams.filmThickness !== undefined) {
      material.uniforms.uThickness.value = newParams.filmThickness;
    }
    if (newParams.filmFrequency !== undefined) {
      material.uniforms.uFrequency.value = newParams.filmFrequency;
    }
    if (newParams.iridStrength !== undefined) {
      material.uniforms.uIrid.value = newParams.iridStrength;
    }
    if (newParams.sheen !== undefined) {
      material.uniforms.uSheen.value = newParams.sheen;
    }
    if (newParams.contrast !== undefined) {
      material.uniforms.uContrast.value = newParams.contrast;
    }
    if (newParams.glow !== undefined) {
      material.uniforms.uGlow.value = newParams.glow;
    }
    if (newParams.warpDepth !== undefined) {
      material.uniforms.uWarpDepth.value = newParams.warpDepth;
    }
    if (newParams.breatheAmp !== undefined) {
      material.uniforms.uBreatheAmp.value = newParams.breatheAmp;
    }
    if (newParams.color1) {
      material.uniforms.uColor1.value.set(newParams.color1);
      haloMaterial.uniforms.glowColor.value.set(newParams.color1);
    }
    if (newParams.color2) {
      material.uniforms.uColor2.value.set(newParams.color2);
    }
    if (newParams.rimColor) {
      material.uniforms.uRimColor.value.set(newParams.rimColor);
    }
    if (newParams.haloStrength !== undefined) {
      haloMaterial.uniforms.glowStrength.value = newParams.haloStrength;
    }
  }

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta, pointer, marchQuality }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uDriftPhase.value = phaseTracker.phase('drift', currentParams.driftSpin);
      material.uniforms.uCounterPhase.value = phaseTracker.phase('counter', currentParams.counterSpin);
      material.uniforms.uBreathePhase.value = phaseTracker.phase('breathe', currentParams.breatheRate);
      // cos(TAU * (t + shift)): the shift term is periodic in [0, 1).
      material.uniforms.uShiftPhase.value = phaseTracker.phase('shift', 0.05, 1.0);
      material.uniforms.uDitherPhase.value = phaseTracker.phase('dither', 9.7);
      material.uniforms.uPulse.value = pulseValue;
      material.uniforms.uPointer.value.copy(pointer);
      if (marchQuality !== undefined) {
        material.uniforms.uMarchQuality.value = marchQuality;
      }

      material.uniforms.cameraWorldMatrix.value.copy(camera.matrixWorld);
      material.uniforms.cameraProjectionMatrixInverse.value.copy(
        camera.projectionMatrixInverse
      );
    },

    setParams: applyParams,

    onPulse() {
      pulseValue = 1.0;
    },

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
