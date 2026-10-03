import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Quant Plasma — a lit plasma dome quantized to chunky two-tone pixels.
//
// The classic four-term plasma field is sampled at pixel-cell centres on
// the sphere's tangent frame, so posterization lands on a stable world-
// space lattice instead of crawling with the field. The field posterizes
// to a handful of levels and ramps ink -> paper in OKLab, giving a
// print-like dome: flat inks, one soft terminator, no gradients to band.
//
// Every time term is a wrapped phase — no raw uTime uniform. The plasma
// phase drives the sine terms directly (TAU-periodic, so the wrap is
// invisible) and drifts the noise term slowly enough to read as weather.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.15;

export function createQuantPlasmaEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.18,
    colorInk: '#101426',
    colorPaper: '#cfe6ff',
    plasmaRate: 0.5,
    spinRate: 0.15,
    cells: 140,
    levels: 3,
    patternScale: 1.5,
    plasmaAmp: 0.9,
    light: 0.9,
    rim: 0.35,
    gain: 1.0,
    contrast: 1.1,
    haloStrength: 0.0,
    breatheRate: 0.35,
    breatheAmp: 0.05,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSpinPhase: { value: 0.0 },
      uPlasmaPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: {
        value: camera.projectionMatrixInverse,
      },
      uColorInk: { value: new THREE.Color(currentParams.colorInk) },
      uColorPaper: { value: new THREE.Color(currentParams.colorPaper) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uCells: { value: currentParams.cells },
      uLevels: { value: currentParams.levels },
      uPatternScale: { value: currentParams.patternScale },
      uPlasmaAmp: { value: currentParams.plasmaAmp },
      uLight: { value: currentParams.light },
      uRim: { value: currentParams.rim },
      uGain: { value: currentParams.gain },
      uContrast: { value: currentParams.contrast },
      uBreatheAmp: { value: currentParams.breatheAmp },
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
      uniform float uPlasmaPhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorInk;
      uniform vec3 uColorPaper;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uCells;
      uniform float uLevels;
      uniform float uPatternScale;
      uniform float uPlasmaAmp;
      uniform float uLight;
      uniform float uRim;
      uniform float uGain;
      uniform float uContrast;
      uniform float uBreatheAmp;

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

      // OKLab (Ottosson) — mix ink and paper where mid-blends stay on hue.
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

        // Tangent frame on a fixed pole: the pixel lattice lives on the
        // sphere, so cells hold still under camera orbits and only the
        // wrapped spin phase turns the field.
        vec3 pole = vec3(0.0, 0.0, 1.0);
        vec3 tX = normalize(cross(pole, vec3(0.0, 1.0, 0.0)));
        vec3 tY = cross(pole, tX);
        vec2 domain2 = vec2(dot(p, tX), dot(p, tY)) * 2.6;
        float cs = cos(uSpinPhase), sn = sin(uSpinPhase);
        domain2 = vec2(
          domain2.x * cs - domain2.y * sn,
          domain2.x * sn + domain2.y * cs);

        // Pixelate: quantize the domain to a lattice, then sample at the
        // cell centre so posterized regions land on stable, chunky cells.
        // uCells counts pixels across the whole dome span (5.2 domain units),
        // matching the original orb spec — not per domain unit.
        vec2 cellSize = vec2(5.2 / uCells);
        vec2 q = floor(domain2 / cellSize) * cellSize + cellSize * 0.5;

        // Classic four-term plasma; the noise term keeps the bands organic
        // instead of pure interference moire.
        float val = sin(q.x * 5.5 + uPlasmaPhase)
          + sin(q.y * 4.6 - uPlasmaPhase * 0.8)
          + sin((q.x + q.y) * 3.4 + uPlasmaPhase * 0.6)
          + uPlasmaAmp * vnoise(vec3(q * uPatternScale * 2.2, uPlasmaPhase * 0.15));
        val = val / (3.0 + uPlasmaAmp) * 0.5 + 0.5;

        // Posterize to uLevels steps, then ramp ink -> paper in OKLab. The
        // top level gets a small lift so highlights read as printed white.
        float v = floor(val * uLevels) / (uLevels - 1.0);
        v = clamp(v, 0.0, 1.0);

        vec3 linInk = max(uColorInk, vec3(0.0));
        vec3 linPaper = max(uColorPaper, vec3(0.0));
        vec3 col = oklabMix(linInk, linPaper, v);
        col *= 0.8 + 0.4 * v;

        // Dome shading: Lambert terminator plus a fresnel rim — the usual
        // template, kept soft so the flat inks stay flat. Gains are
        // linear-light conservative: the studio's bloom + output pass lift
        // the whole frame.
        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(p, lightDir), 0.0, 1.0);
        float terminator = 0.28 + 0.72 * lambert;
        col *= terminator * uLight;

        col = col * uGain;
        col = (col - 0.5) * uContrast + 0.5;

        float fresnel = pow(1.0 - clamp(dot(p, -rd), 0.0, 1.0), 2.6);
        col += linPaper * fresnel * uRim;
        col += oklabMix(linInk, linPaper, 0.5) * uPulse * 0.12;

        // Ordered dither on a wrapped phase: the only texture noise on an
        // otherwise posterized dome, breaking up banding at cell borders.
        float dither = hash13(vec3(gl_FragCoord.xy, uDitherPhase * 371.0));
        col += (dither - 0.5) * (1.0 / 255.0) * 3.0;

        // Soften the silhouette so the dome edge reads as paper, not clip.
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
      glowColor: { value: new THREE.Color(currentParams.colorPaper) },
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
    if (newParams.cells !== undefined) {
      material.uniforms.uCells.value = newParams.cells;
    }
    if (newParams.levels !== undefined) {
      material.uniforms.uLevels.value = newParams.levels;
    }
    if (newParams.patternScale !== undefined) {
      material.uniforms.uPatternScale.value = newParams.patternScale;
    }
    if (newParams.plasmaAmp !== undefined) {
      material.uniforms.uPlasmaAmp.value = newParams.plasmaAmp;
    }
    if (newParams.light !== undefined) {
      material.uniforms.uLight.value = newParams.light;
    }
    if (newParams.rim !== undefined) {
      material.uniforms.uRim.value = newParams.rim;
    }
    if (newParams.gain !== undefined) {
      material.uniforms.uGain.value = newParams.gain;
    }
    if (newParams.contrast !== undefined) {
      material.uniforms.uContrast.value = newParams.contrast;
    }
    if (newParams.breatheAmp !== undefined) {
      material.uniforms.uBreatheAmp.value = newParams.breatheAmp;
    }
    if (newParams.colorInk) {
      material.uniforms.uColorInk.value.set(newParams.colorInk);
    }
    if (newParams.colorPaper) {
      material.uniforms.uColorPaper.value.set(newParams.colorPaper);
      haloMaterial.uniforms.glowColor.value.set(newParams.colorPaper);
    }
    if (newParams.haloStrength !== undefined) {
      haloMaterial.uniforms.glowStrength.value = newParams.haloStrength;
    }
  }

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uPlasmaPhase.value = phaseTracker.phase(
        'plasma',
        currentParams.plasmaRate
      );
      material.uniforms.uSpinPhase.value = phaseTracker.phase('spin', currentParams.spinRate);
      material.uniforms.uBreathePhase.value = phaseTracker.phase(
        'breathe',
        currentParams.breatheRate
      );
      material.uniforms.uDitherPhase.value = phaseTracker.phase('dither', 9.7);
      material.uniforms.uPulse.value = pulseValue;

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
