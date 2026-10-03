import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Nacre — mother-of-pearl contour bands, each layer its own hue.
//
// A heightfield h = fbm over a warped tangent domain is cut into contour
// bands by bc = h * uBandScale - flowPhase; every band seam lights up as a
// bright line (chromatically split into R/G/B for a subtle prismatic edge),
// and floor(bc) assigns each layer its own cosine-palette hue so adjacent
// bands tint differently like stacked shell layer. A specular sheen and the
// standard terminator keep the dome reading as wet nacre.
//
// Every time term is a wrapped phase accumulated against the engine clock —
// no raw `uTime`. The band flow wraps at 1.0 (fract/floor lattice), the hue
// iris wraps at 50 because it is consumed as ph * 0.02 inside fract()
// (50 * 0.02 = 1 keeps that wrap invisible), and the wobble/breathe terms
// are plain TAU-phase sin/cos.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.15;

export function createNacreEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.18,
    octaves: 4,
    colorDeep: '#0d1430',
    colorLow: '#2fb8c6',
    colorCrest: '#fff1de',
    colorSheen: '#bfe4ff',
    boilRate: 0.25,
    flowRate: 0.3,
    bandScale: 5.5,
    bandWidth: 0.2,
    warpAmp: 1.0,
    beat: 0.0,
    irid: 0.7,
    irisScale: 0.32,
    viewShift: 1.34,
    split: 0.1,
    gain: 1.1,
    contrast: 1.15,
    light: 0.75,
    rim: 0.5,
    haloStrength: 0.0,
    breatheRate: 0.35,
    breatheAmp: 0.05,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDriftPhase: { value: 0.0 },
      uCounterPhase: { value: 0.0 },
      uBoilPhase: { value: 0.0 },
      uFlowPhase: { value: 0.0 },
      uIrisPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: {
        value: camera.projectionMatrixInverse,
      },
      uColorDeep: { value: new THREE.Color(currentParams.colorDeep) },
      uColorLow: { value: new THREE.Color(currentParams.colorLow) },
      uColorCrest: { value: new THREE.Color(currentParams.colorCrest) },
      uColorSheen: { value: new THREE.Color(currentParams.colorSheen) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uOctaves: { value: currentParams.octaves },
      uBandScale: { value: currentParams.bandScale },
      uBandWidth: { value: currentParams.bandWidth },
      uWarpAmp: { value: currentParams.warpAmp },
      uBeat: { value: currentParams.beat },
      uIrid: { value: currentParams.irid },
      uIrisScale: { value: currentParams.irisScale },
      uViewShift: { value: currentParams.viewShift },
      uSplit: { value: currentParams.split },
      uGain: { value: currentParams.gain },
      uContrast: { value: currentParams.contrast },
      uLight: { value: currentParams.light },
      uRim: { value: currentParams.rim },
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
      uniform float uBoilPhase;
      uniform float uFlowPhase;
      uniform float uIrisPhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorDeep;
      uniform vec3 uColorLow;
      uniform vec3 uColorCrest;
      uniform vec3 uColorSheen;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uOctaves;
      uniform float uBandScale;
      uniform float uBandWidth;
      uniform float uWarpAmp;
      uniform float uBeat;
      uniform float uIrid;
      uniform float uIrisScale;
      uniform float uViewShift;
      uniform float uSplit;
      uniform float uGain;
      uniform float uContrast;
      uniform float uLight;
      uniform float uRim;
      uniform float uBreatheAmp;
      uniform vec2 uPointer;
      uniform float uMarchQuality;

      uniform mat4 cameraWorldMatrix;
      uniform mat4 cameraProjectionMatrixInverse;

      varying vec2 vUv;

      // Hash without sine: a fract/dot construction. Keeps its distribution
      // at the large coordinates the warped domain does reach.
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

      // Bright seam between contour bands: 1 at the integer boundary of the
      // band coordinate, fading out over the given width in lattice units.
      float bandSeam(float coord, float width) {
        float f = fract(coord);
        float edgeDist = min(f, 1.0 - f);
        return 1.0 - smoothstep(0.0, width, edgeDist);
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

        // Tangent frame around the (tilted) pole, then the two
        // counter-rotating drift layers from the house template.
        vec3 tX = normalize(cross(pole, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
        vec3 tY = cross(pole, tX);
        vec3 domain = vec3(dot(p, tX), dot(p, tY), dot(p, pole));

        float ca = cos(uDriftPhase), sa = sin(uDriftPhase);
        vec3 layerA = vec3(
          domain.x * ca - domain.y * sa,
          domain.x * sa + domain.y * ca,
          domain.z);
        float cb = cos(uCounterPhase), sb = sin(uCounterPhase);
        vec3 layerB = vec3(
          layerA.x * cb + layerA.z * sb,
          layerA.y,
          -layerA.x * sb + layerA.z * cb);

        // Slow boil: a tiny two-axis wobble of the whole domain.
        layerB += 0.15 * vec3(sin(uBoilPhase), cos(uBoilPhase * 1.3), 0.0);

        // Warp-beat: the warp amplitude swells on the breathe phase.
        float warpAmp = uWarpAmp * (1.0 + uBeat * sin(uBreathePhase));
        vec3 warp = warpAmp * vec3(
          vnoise(layerB * 1.3),
          vnoise(layerB * 1.3 + vec3(4.7)),
          0.0);

        // One fbm evaluation total — the warp feeds straight into h.
        float octaves = clamp(uOctaves * mix(0.7, 1.0, uMarchQuality), 2.0, 6.0);
        float h = fbm(layerB * 0.9 + warp, octaves);

        // Fresnel early: the band hue shifts with grazing view angles.
        float fresnel = pow(1.0 - clamp(dot(p, -rd), 0.0, 1.0), 2.6);

        // Contour bands sliding along the heightfield. uFlowPhase wraps at
        // 1.0 to match the fract/floor lattice it feeds.
        float bc = h * uBandScale - uFlowPhase;

        // Chromatic split: the seam sampled at three offsets, one per channel.
        float bandR = bandSeam(bc + uSplit * 0.02, uBandWidth);
        float bandG = bandSeam(bc, uBandWidth);
        float bandB = bandSeam(bc - uSplit * 0.02, uBandWidth);
        vec3 bandVec = vec3(bandR, bandG, bandB);
        float bandLine = bandG;

        // Per-layer hue: each band index picks its own cosine-palette colour,
        // drifted slowly by the iris phase and pushed by grazing angles.
        float bandId = floor(bc);
        float layerHue = fract(bandId * 0.61803 + uIrisPhase * 0.02 + fresnel * uViewShift);
        vec3 hue = vec3(0.5) + vec3(0.5) * cos(6.2831853 * (
          layerHue * uIrisScale + vec3(0.0, 0.33, 0.67)));

        // Composite: deep-to-crest base by seam proximity, with the layered
        // hue riding the bright seams only.
        vec3 colorDeep = max(uColorDeep, vec3(0.0));
        vec3 colorLow = max(uColorLow, vec3(0.0));
        vec3 colorCrest = max(uColorCrest, vec3(0.0));
        vec3 base = oklabMix(colorLow, colorCrest, bandLine * 0.8 + 0.1);
        vec3 layeredHue = hue * (0.35 + 0.65 * bandVec);
        vec3 col = oklabMix(colorDeep, base, 0.45) * 0.6 + layeredHue * uIrid * bandLine;

        // Dome shading: fixed key light, terminator scaled by uLight, and a
        // specular sheen off the shell surface.
        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(p, lightDir), 0.0, 1.0);
        float terminator = 0.28 + 0.72 * lambert;
        float spec = pow(max(dot(reflect(-lightDir, p), -rd), 0.0), 40.0);

        col *= terminator * (0.4 + 0.6 * uLight);
        col += uColorSheen * spec * 0.5 * uGain;
        col += uColorSheen * fresnel * uRim * 0.5;
        col += oklabMix(colorLow, colorCrest, 0.5) * uPulse * 0.12;

        // Contrast around the midpoint after assembly.
        col = (col - 0.5) * uContrast + 0.5;

        // Ordered dither on a wrapped phase: breaks up gradient banding
        // without the per-frame sparkle of white-noise dither.
        float dither = hash13(vec3(gl_FragCoord.xy, uDitherPhase * 371.0));
        col += (dither - 0.5) * (1.0 / 255.0) * 3.0;

        // Soften the silhouette so the sphere edge reads as shell, not clip.
        float rimDist = 1.0 - fresnel;
        float edge = smoothstep(0.0, uEdgeFade, rimDist);

        vec3 outCol = max(col, vec3(0.0));
        gl_FragColor = vec4(outCol, edge);
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
      glowColor: { value: new THREE.Color(currentParams.colorSheen) },
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
    if (newParams.bandScale !== undefined) {
      material.uniforms.uBandScale.value = newParams.bandScale;
    }
    if (newParams.bandWidth !== undefined) {
      material.uniforms.uBandWidth.value = newParams.bandWidth;
    }
    if (newParams.warpAmp !== undefined) {
      material.uniforms.uWarpAmp.value = newParams.warpAmp;
    }
    if (newParams.beat !== undefined) {
      material.uniforms.uBeat.value = newParams.beat;
    }
    if (newParams.irid !== undefined) {
      material.uniforms.uIrid.value = newParams.irid;
    }
    if (newParams.irisScale !== undefined) {
      material.uniforms.uIrisScale.value = newParams.irisScale;
    }
    if (newParams.viewShift !== undefined) {
      material.uniforms.uViewShift.value = newParams.viewShift;
    }
    if (newParams.split !== undefined) {
      material.uniforms.uSplit.value = newParams.split;
    }
    if (newParams.gain !== undefined) {
      material.uniforms.uGain.value = newParams.gain;
    }
    if (newParams.contrast !== undefined) {
      material.uniforms.uContrast.value = newParams.contrast;
    }
    if (newParams.light !== undefined) {
      material.uniforms.uLight.value = newParams.light;
    }
    if (newParams.rim !== undefined) {
      material.uniforms.uRim.value = newParams.rim;
    }
    if (newParams.breatheAmp !== undefined) {
      material.uniforms.uBreatheAmp.value = newParams.breatheAmp;
    }
    if (newParams.colorDeep) {
      material.uniforms.uColorDeep.value.set(newParams.colorDeep);
    }
    if (newParams.colorLow) {
      material.uniforms.uColorLow.value.set(newParams.colorLow);
    }
    if (newParams.colorCrest) {
      material.uniforms.uColorCrest.value.set(newParams.colorCrest);
    }
    if (newParams.colorSheen) {
      material.uniforms.uColorSheen.value.set(newParams.colorSheen);
      haloMaterial.uniforms.glowColor.value.set(newParams.colorSheen);
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

      material.uniforms.uDriftPhase.value = phaseTracker.phase('drift', 0.15);
      material.uniforms.uCounterPhase.value = phaseTracker.phase('counter', -0.1);
      material.uniforms.uBoilPhase.value = phaseTracker.phase(
        'boil',
        currentParams.boilRate
      );
      // fract/floor lattice consumer -> period 1.0, never TAU.
      material.uniforms.uFlowPhase.value = phaseTracker.phase(
        'flow',
        currentParams.flowRate,
        1.0
      );
      // Consumed as ph * 0.02 inside fract() -> period 1 / 0.02 keeps the
      // wrap invisible.
      material.uniforms.uIrisPhase.value = phaseTracker.phase('iris', 0.1, 50.0);
      material.uniforms.uBreathePhase.value = phaseTracker.phase(
        'breathe',
        currentParams.breatheRate
      );
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
