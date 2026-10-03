import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Silk Warp — layered domain-warped noise flowing over a sphere.
//
// The field is the classic warp-of-a-warp: q = fbm(p), r = fbm(p + q),
// field = fbm(p + r). Colour happens in OKLab so mid-blends keep their hue
// instead of collapsing toward grey the way RGB mixing does.
//
// Every time-dependent term is a wrapped phase accumulated against the
// engine clock — there is no raw `uTime` here at all. The motion is two
// counter-rotating warp layers: each is individually TAU-periodic (so the
// wrap is invisible), but their rate ratio is irrational, so the
// interference never visibly repeats.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.15;

export function createSilkWarpEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.18,
    octaves: 5,
    color1: '#5eead4',
    color2: '#818cf8',
    rimColor: '#e0f2fe',
    contrast: 1.15,
    glow: 1.1,
    sheen: 0.35,
    haloStrength: 0.25,
    warpDepth: 1.25,
    warpScale: 2.4,
    driftSpin: 0.22,
    counterSpin: -0.13,
    breatheRate: 0.45,
    breatheAmp: 0.08,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDriftPhase: { value: 0.0 },
      uCounterPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uPalettePhase: { value: 0.0 },
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
      uContrast: { value: currentParams.contrast },
      uGlow: { value: currentParams.glow },
      uSheen: { value: currentParams.sheen },
      uWarpDepth: { value: currentParams.warpDepth },
      uWarpScale: { value: currentParams.warpScale },
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
      uniform float uPalettePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uOctaves;
      uniform float uContrast;
      uniform float uGlow;
      uniform float uSheen;
      uniform float uWarpDepth;
      uniform float uWarpScale;
      uniform float uBreatheAmp;
      uniform vec2 uPointer;
      uniform float uMarchQuality;

      uniform mat4 cameraWorldMatrix;
      uniform mat4 cameraProjectionMatrixInverse;

      varying vec2 vUv;

      // Hash without sine: a fract/dot construction. The repo's sin-based
      // hash (nebula) is fine, but this one keeps its distribution at large
      // coordinates, which the warp domain here does reach.
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

      // Fixed axis rotation between octaves so lattice axes decorrelate.
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

      // OKLab (Ottosson) — mix colours where mid-blends stay on hue.
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
        vec3 la = toOklab(a);
        vec3 lb = toOklab(b);
        return fromOklab(mix(la, lb, clamp(t, 0.0, 1.0)));
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

        float breathe = 1.0 + uBreatheAmp * cos(uBreathePhase) + uPulse * 0.06;
        float radius = uRadius * breathe;

        vec2 hit = intersectSphere(ro, rd, radius);
        if (hit.y <= 0.0) {
          gl_FragColor = vec4(0.0);
          return;
        }

        vec3 p = normalize(ro + rd * hit.x);

        // Pointer leans the sampling pole; the stub is (0,0) in grid mode.
        vec3 pole = normalize(vec3(uPointer.x * 0.35, uPointer.y * 0.35, 1.0));

        // Build tangent coordinates around the (tilted) pole so the field
        // wraps smoothly over the whole sphere with no seam. The anisotropic
        // stretch (tY long, pole short) is what makes the noise read as
        // currents rather than clouds: features elongate along the flow and
        // thin across it, and the frame swirls around the pole.
        vec3 tX = normalize(cross(pole, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
        vec3 tY = cross(pole, tX);
        vec3 domain = vec3(dot(p, tX), dot(p, tY) * 1.7, dot(p, pole) * 0.62) * uWarpScale;

        // Two warp layers, each rotated by its own wrapped phase. Equal and
        // opposite tilts would cancel; near-opposite rates interfere forever.
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
        vec3 q = vec3(fbm(layerA, octaves), fbm(layerA + vec3(5.2, 1.3, 8.4), octaves), fbm(layerA + vec3(9.1, 4.7, 2.6), octaves));
        vec3 r = vec3(fbm(layerB + uWarpDepth * q, octaves), fbm(layerB + uWarpDepth * q + vec3(3.7, 7.4, 1.1), octaves), fbm(layerB + uWarpDepth * q + vec3(6.2, 2.9, 5.5), octaves));
        float field = fbm(layerB + uWarpDepth * 0.75 * r, octaves);

        // Contrast around the midpoint, then a luminance mask driven by the
        // same value — colour alone (teal↔indigo) reads as a pastel ball, so
        // the field must also decide where the silk is dark and where the
        // currents catch the light.
        float v = field * 1.1 + 0.5;
        v = clamp((v - 0.5) * uContrast * 1.25 + 0.5, 0.0, 1.0);

        vec3 lin1 = max(uColor1, vec3(0.0));
        vec3 lin2 = max(uColor2, vec3(0.0));
        vec3 silk = oklabMix(lin1, lin2, v);

        // Iridescent sheen band: a cosine ripple in blend space, phase-locked
        // to the palette clock so it drifts rather than flickers. Gated to
        // the bright currents — sheen is a highlight, not a wash.
        float band = 0.5 + 0.5 * cos(6.2831853 * (v * 2.0 + uPalettePhase / 6.2831853));
        silk = oklabMix(silk, vec3(0.45), band * uSheen * 0.5 * smoothstep(0.35, 0.85, v));

        // Dome shading: Lambert from a fixed key light plus a fresnel rim.
        // Gains are linear-light conservative: the studio's bloom and output
        // pass lift the whole frame, and hot linear values clip to white.
        vec3 n = p;
        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(n, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.6);
        float terminator = 0.28 + 0.72 * lambert;

        float lum = 0.16 + 0.84 * smoothstep(0.2, 0.82, v);
        vec3 col = silk * terminator * lum * uGlow * 0.38;
        col += uRimColor * fresnel * 0.22;
        col += oklabMix(lin1, lin2, 0.5) * uPulse * 0.12;

        // Ordered dither on a wrapped phase: breaks up gradient banding
        // without the per-frame sparkle of white-noise dither.
        float dither = hash13(vec3(gl_FragCoord.xy, uDitherPhase * 371.0));
        col += (dither - 0.5) * (1.0 / 255.0) * 3.0;

        // Soften the silhouette so the sphere edge reads as fabric, not clip.
        float rimDist = 1.0 - fresnel;
        float edge = smoothstep(0.0, uEdgeFade, rimDist);

        vec3 outCol = max(col, vec3(0.0));
        float alpha = edge;
        gl_FragColor = vec4(outCol, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const fullScreenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  fullScreenQuad.frustumCulled = false;
  fullScreenQuad.renderOrder = 0;
  scene.add(fullScreenQuad);

  // Fresnel halo shell — the atmosphere cue every orb in this repo leans on.
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
    if (newParams.contrast !== undefined) {
      material.uniforms.uContrast.value = newParams.contrast;
    }
    if (newParams.glow !== undefined) {
      material.uniforms.uGlow.value = newParams.glow;
    }
    if (newParams.sheen !== undefined) {
      material.uniforms.uSheen.value = newParams.sheen;
    }
    if (newParams.warpDepth !== undefined) {
      material.uniforms.uWarpDepth.value = newParams.warpDepth;
    }
    if (newParams.warpScale !== undefined) {
      material.uniforms.uWarpScale.value = newParams.warpScale;
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
      material.uniforms.uPalettePhase.value = phaseTracker.phase('palette', 0.12);
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
