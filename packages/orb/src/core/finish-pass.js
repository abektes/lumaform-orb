import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// The last grade before the backdrop: what makes a look read as finished
// rather than as a raw shader. Runs after OutputPass, so it works on
// display-referred sRGB — contrast around a mid-grey that means mid-grey on
// screen — and before the background pass, so the backdrop stays the exact
// colour picked.
//
// The buffer holds premultiplied light, and glow carries colour with little or
// no coverage (see background-pass.js). So every grade is weighted by
// `presence` — coverage, or light — and empty background is never touched: a
// contrast below 1 would otherwise lift black into a grey veil over the frame.

export const FINISH_DEFAULTS = Object.freeze({
  contrast: 1, saturation: 1, grain: 0, edgeFade: 0, lightCoverage: 0,
});

export const FINISH_RANGES = Object.freeze({
  contrast: [0.5, 2], saturation: [0, 2], grain: [0, 0.15], edgeFade: [0, 1], lightCoverage: [0, 1],
});

export function resolveFinish(current, patch) {
  const out = { ...current };
  for (const key of Object.keys(FINISH_DEFAULTS)) {
    const value = patch?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const [lo, hi] = FINISH_RANGES[key];
    out[key] = Math.min(hi, Math.max(lo, value));
  }
  return out;
}

// The contrast curve the shader applies per channel, x^k / (x^k + (1-x)^k).
// It keeps 0 and 1 fixed, passes through 0.5, is the identity at k = 1 and
// steepens around mid-grey for k > 1. A linear stretch about 0.5 would crush
// the low end and clip the high end at contrast 2, posterizing soft glows.
// Lives here as plain maths so Node can check what the GLSL cannot.
const CURVE_EPSILON = 1e-6;
export function contrastCurve(x, k) {
  const c = Math.min(1 - CURVE_EPSILON, Math.max(CURVE_EPSILON, x));
  const xk = Math.pow(c, k);
  return xk / (xk + Math.pow(1 - c, k));
}

// lightCoverage only means something over a transparent background: on an
// opaque one, raising alpha under glow would darken the backdrop behind it.
export function isIdentityFinish(finish, { transparent }) {
  return Object.keys(FINISH_DEFAULTS).every((key) =>
    key === 'lightCoverage' && !transparent ? true : finish[key] === FINISH_DEFAULTS[key]);
}

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uGrain: { value: 0 },
    uEdgeFade: { value: 0 },
    uLightCoverage: { value: 0 },
    uSeed: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRadius: { value: 0.8 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uGrain;
    uniform float uEdgeFade;
    uniform float uLightCoverage;
    uniform float uSeed;
    uniform vec2 uCenter;
    uniform float uRadius;
    uniform float uAspect;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 rgb = src.rgb;
      float a = src.a;
      float peak = max(rgb.r, max(rgb.g, rgb.b));
      float presence = clamp(max(a, peak * 4.0), 0.0, 1.0);

      float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(vec3(luma), rgb, uSaturation);
      // An S-curve, not a linear stretch: it keeps 0 and 1 fixed, so soft
      // glow edges steepen instead of clipping or crushing. Mirrors
      // contrastCurve() in this file.
      // Kept off exactly 0 and 1: some mobile drivers lower pow() to
      // exp2(k * log2(x)), which is NaN at 0 and would poison empty pixels.
      vec3 x = clamp(rgb, 1e-6, 1.0 - 1e-6);
      vec3 xk = pow(x, vec3(uContrast));
      vec3 yk = pow(1.0 - x, vec3(uContrast));
      vec3 graded = xk / (xk + yk);
      rgb = mix(rgb, graded, presence);

      // Seeded from virtual time, so a paused orb holds still instead of
      // crawling with static.
      float n = hash(gl_FragCoord.xy + uSeed) - 0.5;
      rgb += n * uGrain * presence;

      if (uEdgeFade > 0.0) {
        // Distance from the orb's centre in viewport half-heights, the unit
        // uRadius is measured in.
        float d = length((vUv - uCenter) * vec2(uAspect, 1.0)) * 2.0;
        float inner = uRadius * (1.0 - 0.6 * uEdgeFade);
        float outer = uRadius * (1.0 + 0.25 * uEdgeFade);
        float mask = 1.0 - smoothstep(inner, outer, d);
        rgb *= mask;
        a *= mask;
      }

      // Glow carries colour with little coverage. Scaling by 4, as presence
      // does, lets a bright halo reach full coverage at lightCoverage 1, so
      // over a light page it shows as its own colour rather than a pale tint.
      // rgb is untouched, so over black nothing changes.
      a = max(a, clamp(max(rgb.r, max(rgb.g, rgb.b)) * 4.0 * uLightCoverage, 0.0, 1.0));
      gl_FragColor = vec4(max(rgb, 0.0), a);
    }
  `,
};

export function createFinishPass() {
  const pass = new ShaderPass(FinishShader);
  pass.enabled = false;
  const u = pass.material.uniforms;
  let settings = { ...FINISH_DEFAULTS };
  let transparent = false;

  return {
    pass,
    get settings() {
      return settings;
    },
    // Takes the whole global bag; only the five finish keys are read.
    set(globalPatch, { transparent: nextTransparent } = {}) {
      settings = resolveFinish(settings, globalPatch);
      if (nextTransparent !== undefined) transparent = !!nextTransparent;
      u.uContrast.value = settings.contrast;
      u.uSaturation.value = settings.saturation;
      u.uGrain.value = settings.grain;
      u.uEdgeFade.value = settings.edgeFade;
      u.uLightCoverage.value = transparent ? settings.lightCoverage : 0;
      pass.enabled = !isIdentityFinish(settings, { transparent });
    },
    frame({ center, radius, aspect, seed }) {
      u.uCenter.value.set(center[0], center[1]);
      u.uRadius.value = radius;
      u.uAspect.value = aspect;
      u.uSeed.value = seed;
    },
  };
}
