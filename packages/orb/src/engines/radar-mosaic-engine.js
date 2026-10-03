import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Radar Mosaic — a weather-radar readout wrapped over the orb: a grid of
// rounded pixels, each showing a quantized precipitation-intensity class
// swept out by a swirling front, twinkling like returning echoes.
//
// The tangent-frame sphere domain (same construction Silk Warp uses) is
// scaled into a cell lattice, bent by a vortex term (front curvature) and
// domain-warped by two value-noise lookups, then gridded. Each cell hashes
// to a presence bit (uSparse drops cells) and reads its intensity off the
// sweeping front; the intensity is gamma'd and classified into four colours.
// Sparse-empty and quiet cells fall back to a paper/quiet mix, so the ball
// reads as a printed radar chart with live returns on it.
//
// Every time-dependent term is a wrapped phase accumulated against the
// engine clock — no raw `uTime` anywhere. The twinkle phase wraps at TAU
// and each cell multiplies it by an integer (2 + floor(hash * 5)), so the
// wrap stays exactly invisible per cell.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.15;

export function createRadarMosaicEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.18,
    colorPaper: '#efe9dc',
    colorQuiet: '#a9a9a6',
    colorLow: '#2e5df0',
    colorMid: '#22c35c',
    colorHigh: '#e8322a',
    colorPeak: '#f5d020',
    sweepRate: 0.3,
    spinRate: 0.15,
    twinkleRate: 3.0,
    cells: 34,
    dotSize: 0.36,
    vortex: 0.45,
    warpAmp: 0.3,
    loThresh: 0.12,
    hiThresh: 0.82,
    curve: 1.4,
    sparse: 0.16,
    grain: 0.1,
    light: 0.18,
    rim: 0.35,
    gain: 1.0,
    contrast: 1.0,
    haloStrength: 0.0,
    breatheRate: 0.35,
    breatheAmp: 0.05,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSpinPhase: { value: 0.0 },
      uSweepPhase: { value: 0.0 },
      uTwinklePhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: {
        value: camera.projectionMatrixInverse,
      },
      uColorPaper: { value: new THREE.Color(currentParams.colorPaper) },
      uColorQuiet: { value: new THREE.Color(currentParams.colorQuiet) },
      uColorLow: { value: new THREE.Color(currentParams.colorLow) },
      uColorMid: { value: new THREE.Color(currentParams.colorMid) },
      uColorHigh: { value: new THREE.Color(currentParams.colorHigh) },
      uColorPeak: { value: new THREE.Color(currentParams.colorPeak) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uCells: { value: currentParams.cells },
      uDot: { value: currentParams.dotSize },
      uVortex: { value: currentParams.vortex },
      uWarpAmp: { value: currentParams.warpAmp },
      uLoThresh: { value: currentParams.loThresh },
      uHiThresh: { value: currentParams.hiThresh },
      uCurve: { value: currentParams.curve },
      uSparse: { value: currentParams.sparse },
      uGrain: { value: currentParams.grain },
      uLight: { value: currentParams.light },
      uRim: { value: currentParams.rim },
      uGain: { value: currentParams.gain },
      uContrast: { value: currentParams.contrast },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uPointer: { value: new THREE.Vector2(0, 0) },
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
      uniform float uSweepPhase;
      uniform float uTwinklePhase;
      uniform float uBreathePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorPaper;
      uniform vec3 uColorQuiet;
      uniform vec3 uColorLow;
      uniform vec3 uColorMid;
      uniform vec3 uColorHigh;
      uniform vec3 uColorPeak;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uCells;
      uniform float uDot;
      uniform float uVortex;
      uniform float uWarpAmp;
      uniform float uLoThresh;
      uniform float uHiThresh;
      uniform float uCurve;
      uniform float uSparse;
      uniform float uGrain;
      uniform float uLight;
      uniform float uRim;
      uniform float uGain;
      uniform float uContrast;
      uniform float uBreatheAmp;
      uniform vec2 uPointer;

      uniform mat4 cameraWorldMatrix;
      uniform mat4 cameraProjectionMatrixInverse;

      varying vec2 vUv;

      // Hash without sine: a fract/dot construction that keeps its
      // distribution at large coordinates, which the warped cell
      // domain here does reach.
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

        vec3 tX = normalize(cross(pole, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
        vec3 tY = cross(pole, tX);

        // Tangent domain scaled into the cell lattice, then slowly spun.
        vec2 domain2 = vec2(dot(p, tX), dot(p, tY)) * (uCells * 0.35);
        float cs = cos(uSpinPhase), ss = sin(uSpinPhase);
        domain2 = vec2(
          domain2.x * cs - domain2.y * ss,
          domain2.x * ss + domain2.y * cs);

        // Vortex: the sweep front curves as it travels out from the pole,
        // so the mosaic reads as a swirling weather system, not a clock face.
        float ang = uVortex * 0.8 * sin(length(domain2) * 1.2 - uSweepPhase);
        float vc = cos(ang), vs = sin(ang);
        domain2 = vec2(
          domain2.x * vc - domain2.y * vs,
          domain2.x * vs + domain2.y * vc);

        // Domain warp: two value-noise lookups bend the lattice so the
        // cell edges wobble like a chart drawn on a living surface.
        domain2 += uWarpAmp * vec2(
          vnoise(vec3(domain2 * 0.8, uSweepPhase * 0.1)),
          vnoise(vec3(domain2 * 0.8 + 5.2, uSweepPhase * 0.1)));

        vec2 id = floor(domain2);
        vec2 cellCenter = id + 0.5;
        vec2 gv = fract(domain2);
        float cellRand = hash13(vec3(id, 1.17));
        float cellRand2 = hash13(vec3(id, 7.77));

        // Rounded-pixel dot: the cell's return renders as a soft disc.
        float d = length(gv - 0.5);
        float dotMask = 1.0 - smoothstep(uDot, uDot + 0.08, d);

        // Sparse: uSparse drops the quietest fraction of cells entirely.
        float present = step(uSparse, cellRand);

        // Precipitation intensity: a front sweeps the ball (the sine) with
        // value noise roughening it, then gamma shapes the class spread.
        float intensity = 0.5 + 0.5 * sin(uSweepPhase * 1.5 + cellCenter.x * 0.35 + cellCenter.y * 0.55);
        intensity = intensity * 0.6 + 0.4 * vnoise(vec3(cellCenter * 0.5, uSweepPhase * 0.05));
        intensity = pow(clamp(intensity, 0.0, 1.0), uCurve);

        // Twinkle: per-cell echoes flicker. The phase wraps at TAU, so the
        // per-cell multiplier must be an integer for the wrap to vanish —
        // hence floor(cellRand * 5.0), not the raw hash.
        float tw = 1.0 + 0.15 * sin(uTwinklePhase * (2.0 + floor(cellRand * 5.0)) + cellRand * 6.2831853);

        // Classify: four intensity bands step up to the peak colour, and
        // anything past uHiThresh is forced to peak regardless of band.
        float q = clamp(floor(intensity * 4.0), 0.0, 3.0);
        vec3 classCol = uColorLow;
        classCol = mix(classCol, uColorMid, step(0.5, q));
        classCol = mix(classCol, uColorHigh, step(1.5, q));
        classCol = mix(classCol, uColorPeak, step(2.5, q));
        classCol = mix(classCol, uColorPeak, step(uHiThresh, intensity));
        classCol *= tw;

        // Quiet cells (below lo, or dropped by sparse) fall back to the
        // printed chart: a per-cell paper/quiet mix, slightly dimmed.
        vec3 bgCol = mix(uColorPaper, uColorQuiet, cellRand2) * 0.8;
        classCol = mix(bgCol, classCol, step(uLoThresh, intensity));

        vec3 col = mix(uColorPaper, classCol, dotMask * present);

        // Dome shading: sphere Lambert plus fresnel rim, uLight kept low —
        // the chart stays flat, the ball just catches a hint of key light.
        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambert = clamp(dot(p, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - clamp(dot(p, -rd), 0.0, 1.0), 2.6);
        col *= mix(1.0, 0.35 + 0.65 * lambert, uLight);
        col += vec3(1.0) * fresnel * uRim;
        col += oklabMix(uColorLow, uColorPeak, 0.5) * uPulse * 0.12;

        // Contrast around the midpoint, then gain.
        col = (col - 0.5) * uContrast + 0.5;
        col *= uGain;

        // Film grain, animated on the dither phase — this is both the grain
        // and the ordered dither: one hash serves the two names.
        float grain = hash13(vec3(gl_FragCoord.xy, uDitherPhase * 371.0));
        col += (grain - 0.5) * uGrain * 0.3;

        // Soften the silhouette so the sphere edge reads as glass, not clip.
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
      glowColor: { value: new THREE.Color(currentParams.colorPeak) },
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
    if (newParams.dotSize !== undefined) {
      material.uniforms.uDot.value = newParams.dotSize;
    }
    if (newParams.vortex !== undefined) {
      material.uniforms.uVortex.value = newParams.vortex;
    }
    if (newParams.warpAmp !== undefined) {
      material.uniforms.uWarpAmp.value = newParams.warpAmp;
    }
    if (newParams.loThresh !== undefined) {
      material.uniforms.uLoThresh.value = newParams.loThresh;
    }
    if (newParams.hiThresh !== undefined) {
      material.uniforms.uHiThresh.value = newParams.hiThresh;
    }
    if (newParams.curve !== undefined) {
      material.uniforms.uCurve.value = newParams.curve;
    }
    if (newParams.sparse !== undefined) {
      material.uniforms.uSparse.value = newParams.sparse;
    }
    if (newParams.grain !== undefined) {
      material.uniforms.uGrain.value = newParams.grain;
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
    if (newParams.colorPaper) {
      material.uniforms.uColorPaper.value.set(newParams.colorPaper);
    }
    if (newParams.colorQuiet) {
      material.uniforms.uColorQuiet.value.set(newParams.colorQuiet);
    }
    if (newParams.colorLow) {
      material.uniforms.uColorLow.value.set(newParams.colorLow);
    }
    if (newParams.colorMid) {
      material.uniforms.uColorMid.value.set(newParams.colorMid);
    }
    if (newParams.colorHigh) {
      material.uniforms.uColorHigh.value.set(newParams.colorHigh);
    }
    if (newParams.colorPeak) {
      material.uniforms.uColorPeak.value.set(newParams.colorPeak);
      haloMaterial.uniforms.glowColor.value.set(newParams.colorPeak);
    }
    if (newParams.haloStrength !== undefined) {
      haloMaterial.uniforms.glowStrength.value = newParams.haloStrength;
    }
  }

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta, pointer }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uSpinPhase.value = phaseTracker.phase('spin', currentParams.spinRate);
      material.uniforms.uSweepPhase.value = phaseTracker.phase('sweep', currentParams.sweepRate);
      material.uniforms.uTwinklePhase.value = phaseTracker.phase('twinkle', currentParams.twinkleRate);
      material.uniforms.uBreathePhase.value = phaseTracker.phase('breathe', currentParams.breatheRate);
      material.uniforms.uDitherPhase.value = phaseTracker.phase('dither', 9.7);
      material.uniforms.uPulse.value = pulseValue;
      material.uniforms.uPointer.value.copy(pointer);

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
