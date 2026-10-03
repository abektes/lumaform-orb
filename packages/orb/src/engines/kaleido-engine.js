import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Kaleido Sigil — a kaleidoscopic fold fractal on a camera-facing disc.
//
// The plane through the origin perpendicular to the view direction is folded
// into N mirrored wedges, then an iterated similarity (contract, invert,
// offset) is applied with orbit traps recording the closest approach. The
// traps drive both an OKLab two-colour blend and glowing contour lines; a
// dome-normal fake shade gives the flat disc spherical volume.
//
// Like Silk Warp, every time term is a wrapped phase — no raw uTime uniform.
// The seed offset orbits on its own accumulator so the mandala's character
// evolves without the fold ever jumping.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.2;

export function createKaleidoEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    symmetry: 8,
    iterations: 6,
    contraction: 0.82,
    color1: '#ffd166',
    color2: '#e879f9',
    rimColor: '#fff7ed',
    edgeGlow: 1.35,
    lineWidth: 1.1,
    grain: 0.035,
    warpTwist: 0.35,
    spinRate: 0.16,
    counterRate: -0.11,
    seedRadius: 0.62,
    zoomRate: 0.4,
    zoomDepth: 0.05,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSpinPhase: { value: 0.0 },
      uSeedPhase: { value: 0.0 },
      uTwistPhase: { value: 0.0 },
      uZoomPhase: { value: 0.0 },
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
      uSymmetry: { value: currentParams.symmetry },
      uIterations: { value: currentParams.iterations },
      uContraction: { value: currentParams.contraction },
      uEdgeGlow: { value: currentParams.edgeGlow },
      uLineWidth: { value: currentParams.lineWidth },
      uGrain: { value: currentParams.grain },
      uWarpTwist: { value: currentParams.warpTwist },
      uSeedRadius: { value: currentParams.seedRadius },
      uZoomDepth: { value: currentParams.zoomDepth },
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
      uniform float uSpinPhase;
      uniform float uSeedPhase;
      uniform float uTwistPhase;
      uniform float uZoomPhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uRimColor;
      uniform float uRadius;
      uniform float uSymmetry;
      uniform float uIterations;
      uniform float uContraction;
      uniform float uEdgeGlow;
      uniform float uLineWidth;
      uniform float uGrain;
      uniform float uWarpTwist;
      uniform float uSeedRadius;
      uniform float uZoomDepth;
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

        // Billboard plane through the origin, normal to the view direction,
        // so the sigil stays frontal however the studio camera orbits. A ray
        // toward the origin has dot(rd, planeN) < 0 — the sign that matters
        // is t's, not the denominator's.
        vec3 planeN = normalize(ro);
        float denom = dot(rd, planeN);
        if (abs(denom) < 1e-4) {
          gl_FragColor = vec4(0.0);
          return;
        }
        float t = dot(-ro, planeN) / denom;
        if (t <= 0.0) {
          gl_FragColor = vec4(0.0);
          return;
        }
        vec3 hit = ro + rd * t;

        float zoom = 1.0 + uZoomDepth * cos(uZoomPhase) + uPulse * 0.05;
        float radius = uRadius * zoom;
        float r = length(hit.xy);
        if (r >= radius) {
          gl_FragColor = vec4(0.0);
          return;
        }

        // Slight pointer parallax on the fold centre; (0,0) stub in grid.
        vec2 p = hit.xy * (1.45 / radius) - uPointer * 0.06;

        // N-fold mirror fold in polar coordinates.
        float segment = 6.2831853 / uSymmetry;
        float angle = atan(p.y, p.x) + uSpinPhase;
        angle = mod(angle, segment);
        angle = abs(angle - segment * 0.5);
        p = vec2(cos(angle), sin(angle)) * length(p);

        // Iterated similarity fold with orbit traps.
        vec2 seed = vec2(cos(uSeedPhase), sin(uSeedPhase)) * uSeedRadius;
        float twist = uWarpTwist + 0.35 * sin(uTwistPhase);
        float ct = cos(twist), st = sin(twist);

        float trap1 = 1e9;
        float trap2 = 1e9;
        int iterations = int(clamp(uIterations * mix(0.75, 1.0, uMarchQuality), 3.0, 8.0));
        for (int i = 0; i < 8; i++) {
          if (i >= iterations) break;
          p = abs(p);
          p = mat2(ct, -st, st, ct) * p;
          float inv = uContraction / max(dot(p, p), 1e-4);
          p = p * inv - seed;
          trap1 = min(trap1, length(p));
          trap2 = min(trap2, abs(p.x * p.y));
        }

        trap1 = clamp(trap1 * 2.4, 0.0, 1.0);
        trap2 = clamp(trap2 * 3.2, 0.0, 1.0);

        vec3 lin1 = max(uColor1, vec3(0.0));
        vec3 lin2 = max(uColor2, vec3(0.0));
        vec3 body = oklabMix(lin1, lin2, trap1);
        body = oklabMix(body, oklabMix(lin1, lin2, 0.5), trap2 * 0.45);

        // Glowing contour lines from the trap field. Linear-light headroom:
        // the studio's bloom + output pass lift everything, so gains stay
        // conservative or the filaments clip to white.
        float contour = abs(fract(trap1 * 9.0) - 0.5) * 2.0;
        float line = pow(1.0 - contour, 1.0 / max(uLineWidth, 0.05));
        vec3 col = body * (0.22 + 0.62 * line) * 0.85;
        col += oklabMix(lin1, vec3(0.4), 0.5) * line * uEdgeGlow * 0.3;
        col += uRimColor * uPulse * 0.15;

        // Dome shading — a fake spherical normal over the disc.
        float q = clamp(r / radius, 0.0, 1.0);
        float domeZ = sqrt(max(1.0 - q * q, 0.0));
        vec3 domeN = vec3(hit.xy / radius, domeZ);
        vec3 lightDir = normalize(vec3(0.4, 0.55, 0.73));
        float lambert = 0.35 + 0.65 * clamp(dot(domeN, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - domeZ, 2.4);
        col *= lambert;
        col += uRimColor * fresnel * 0.3;

        float dither = hash13(vec3(gl_FragCoord.xy, uDitherPhase * 371.0));
        col += (dither - 0.5) * uGrain;

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

  function applyParams(newParams) {
    Object.assign(currentParams, newParams);

    if (newParams.radius !== undefined) {
      material.uniforms.uRadius.value = newParams.radius;
    }
    if (newParams.symmetry !== undefined) {
      material.uniforms.uSymmetry.value = newParams.symmetry;
    }
    if (newParams.iterations !== undefined) {
      material.uniforms.uIterations.value = newParams.iterations;
    }
    if (newParams.contraction !== undefined) {
      material.uniforms.uContraction.value = newParams.contraction;
    }
    if (newParams.edgeGlow !== undefined) {
      material.uniforms.uEdgeGlow.value = newParams.edgeGlow;
    }
    if (newParams.lineWidth !== undefined) {
      material.uniforms.uLineWidth.value = newParams.lineWidth;
    }
    if (newParams.grain !== undefined) {
      material.uniforms.uGrain.value = newParams.grain;
    }
    if (newParams.warpTwist !== undefined) {
      material.uniforms.uWarpTwist.value = newParams.warpTwist;
    }
    if (newParams.seedRadius !== undefined) {
      material.uniforms.uSeedRadius.value = newParams.seedRadius;
    }
    if (newParams.zoomDepth !== undefined) {
      material.uniforms.uZoomDepth.value = newParams.zoomDepth;
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
  }

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta, pointer, marchQuality }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uSpinPhase.value = phaseTracker.phase('spin', currentParams.spinRate);
      material.uniforms.uSeedPhase.value = phaseTracker.phase('seed', currentParams.counterRate);
      material.uniforms.uTwistPhase.value = phaseTracker.phase('twist', 0.5);
      material.uniforms.uZoomPhase.value = phaseTracker.phase('zoom', currentParams.zoomRate);
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
      material.dispose();
      fullScreenQuad.geometry.dispose();
    },
  };
}
