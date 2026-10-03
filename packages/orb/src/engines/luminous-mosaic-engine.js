import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Luminous Mosaic — a drifting voronoi tessellation of glowing glass cells.
//
// 3D voronoi over the same tangent-frame sphere domain Silk Warp uses: each
// cell carries a stable random identity that sets its tint (a bounded walk
// between the two engine colours, so the mosaic stays harmonious) and its
// place in a slow breathing wave that crosses the orb like light through
// stained glass. F2−F1 drives the luminous seams.
//
// Two counter-rotating drift layers slide the lattice, so cells continuously
// renegotiate their borders — the glass is alive without any cell ever
// popping. Same all-phase clock discipline: no raw uTime anywhere.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.15;

export function createLuminousMosaicEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.18,
    color1: '#1d4ed8',
    color2: '#22d3ee',
    rimColor: '#e0f2fe',
    borderColor: '#ffd166',
    borderGlow: 1.3,
    borderSoft: 0.07,
    cellScale: 3.2,
    tintSpread: 0.55,
    cellBreath: 0.6,
    glow: 1.0,
    haloStrength: 0.2,
    driftSpin: 0.14,
    counterSpin: -0.09,
    breatheRate: 0.35,
    breatheAmp: 0.06,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDriftPhase: { value: 0.0 },
      uCounterPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uCellPhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: {
        value: camera.projectionMatrixInverse,
      },
      uColor1: { value: new THREE.Color(currentParams.color1) },
      uColor2: { value: new THREE.Color(currentParams.color2) },
      uRimColor: { value: new THREE.Color(currentParams.rimColor) },
      uBorderColor: { value: new THREE.Color(currentParams.borderColor) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uBorderGlow: { value: currentParams.borderGlow },
      uBorderSoft: { value: currentParams.borderSoft },
      uCellScale: { value: currentParams.cellScale },
      uTintSpread: { value: currentParams.tintSpread },
      uCellBreath: { value: currentParams.cellBreath },
      uGlow: { value: currentParams.glow },
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
      uniform float uCellPhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uRimColor;
      uniform vec3 uBorderColor;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uBorderGlow;
      uniform float uBorderSoft;
      uniform float uCellScale;
      uniform float uTintSpread;
      uniform float uCellBreath;
      uniform float uGlow;
      uniform float uBreatheAmp;
      uniform vec2 uPointer;
      uniform float uMarchQuality;

      uniform mat4 cameraWorldMatrix;
      uniform mat4 cameraProjectionMatrixInverse;

      varying vec2 vUv;

      vec3 hash33(vec3 p3) {
        p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yxz + 33.33);
        return fract((p3.xxy + p3.yxx) * p3.zyx);
      }

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

      // F1, F2 and the winning cell's random in one 27-cell search.
      vec4 voronoi(vec3 x, float jitter) {
        vec3 n = floor(x);
        vec3 f = fract(x);
        float f1 = 8.0;
        float f2 = 8.0;
        float id = 0.0;
        for (int k = -1; k <= 1; k++)
        for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
          vec3 g = vec3(float(i), float(j), float(k));
          vec3 o = hash33(n + g) * jitter;
          vec3 r = g + o - f;
          float d = dot(r, r);
          if (d < f1) {
            f2 = f1;
            f1 = d;
            id = hash13(n + g);
          } else if (d < f2) {
            f2 = d;
          }
        }
        return vec4(sqrt(f1), sqrt(f2), id, 0.0);
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
        vec3 domain = vec3(dot(p, tX), dot(p, tY), dot(p, pole)) * uCellScale;

        // Two drift layers, averaged: cells shear against each other, so the
        // tessellation keeps renegotiating instead of rigidly rotating.
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
        vec3 cellDomain = mix(layerA, layerB, 0.5) + 13.7;

        // marchQuality trims the jitter search cost in the nine-cell grid.
        float jitter = mix(0.75, 1.0, clamp(uMarchQuality, 0.0, 1.0));
        vec4 vor = voronoi(cellDomain, jitter);
        float f1 = vor.x;
        float f2 = vor.y;
        float id = vor.z;

        // Seams: the F2-F1 trough, widened by uBorderSoft.
        float seam = f2 - f1;
        float line = 1.0 - smoothstep(0.0, uBorderSoft, seam);

        // Per-cell tint: a bounded walk between the two engine colours.
        float tint = clamp(0.5 + (id - 0.5) * uTintSpread * 2.0, 0.0, 1.0);
        vec3 lin1 = max(uColor1, vec3(0.0));
        vec3 lin2 = max(uColor2, vec3(0.0));
        vec3 glass = oklabMix(lin1, lin2, tint);

        // Breathing wave: each cell pulses on its own slice of the phase,
        // so a slow wave of light crosses the mosaic.
        float cellWave = 0.5 + 0.5 * sin(uCellPhase + id * 6.2831853);
        float lum = 1.0 - uCellBreath * (1.0 - cellWave);
        lum *= 0.6 + 0.4 * smoothstep(0.0, 0.7, seam);

        // Dome shading: sphere lambert plus fresnel rim, as the family does.
        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(p, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - clamp(dot(p, -rd), 0.0, 1.0), 2.6);
        float terminator = 0.3 + 0.7 * lambert;

        vec3 col = glass * terminator * lum * uGlow * 0.55;
        col += uBorderColor * line * uBorderGlow * 0.45;
        col += uBorderColor * line * terminator * 0.2;
        col += uRimColor * fresnel * 0.22;
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
      glowColor: { value: new THREE.Color(currentParams.borderColor) },
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
    if (newParams.borderGlow !== undefined) {
      material.uniforms.uBorderGlow.value = newParams.borderGlow;
    }
    if (newParams.borderSoft !== undefined) {
      material.uniforms.uBorderSoft.value = newParams.borderSoft;
    }
    if (newParams.cellScale !== undefined) {
      material.uniforms.uCellScale.value = newParams.cellScale;
    }
    if (newParams.tintSpread !== undefined) {
      material.uniforms.uTintSpread.value = newParams.tintSpread;
    }
    if (newParams.cellBreath !== undefined) {
      material.uniforms.uCellBreath.value = newParams.cellBreath;
    }
    if (newParams.glow !== undefined) {
      material.uniforms.uGlow.value = newParams.glow;
    }
    if (newParams.breatheAmp !== undefined) {
      material.uniforms.uBreatheAmp.value = newParams.breatheAmp;
    }
    if (newParams.color1) {
      material.uniforms.uColor1.value.set(newParams.color1);
    }
    if (newParams.color2) {
      material.uniforms.uColor2.value.set(newParams.color2);
    }
    if (newParams.rimColor) {
      material.uniforms.uRimColor.value.set(newParams.rimColor);
    }
    if (newParams.borderColor) {
      material.uniforms.uBorderColor.value.set(newParams.borderColor);
      haloMaterial.uniforms.glowColor.value.set(newParams.borderColor);
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
      material.uniforms.uCellPhase.value = phaseTracker.phase('cell', 0.9);
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
