import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { backgroundComponents } from './background-color.js';

// The background, composited last.
//
// It used to be the scene's own background, which put it through the same
// ACES tone mapping and exposure as the orb: #336699 came out (31,105,165),
// every near-black preset tint collapsed to pure black, white was out of
// reach, and the exposure slider moved the backdrop. Grid cells were worse —
// they had no scene background, so their linear render targets were cleared
// with the renderer's clear colour, which three had already encoded to sRGB
// for the screen; the tone mapper then read those sRGB numbers as linear light.
//
// Now the scene renders over transparent black, OutputPass tone-maps and
// encodes the orb alone, and this pass lays the exact picked colour behind it.
// The composer's buffer holds premultiplied light — additive glow has colour
// with little or no coverage — so "over" is `light + backdrop · (1 − coverage)`:
// glow adds onto the colour, opaque bodies hide it.
const BackgroundShader = {
  uniforms: {
    tDiffuse: { value: null },
    uColor: { value: new THREE.Vector3() },
    uOpaque: { value: 1 },
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
    uniform vec3 uColor;
    uniform float uOpaque;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      float coverage = clamp(src.a, 0.0, 1.0);
      vec3 rgb = src.rgb + uColor * (1.0 - coverage) * uOpaque;
      // Transparent mode keeps the orb's own coverage so the host page shows
      // through; opaque mode is fully covered by the backdrop.
      gl_FragColor = vec4(rgb, mix(coverage, 1.0, uOpaque));
    }
  `,
};

export function createBackgroundPass() {
  const pass = new ShaderPass(BackgroundShader);
  const { uColor, uOpaque } = pass.material.uniforms;
  return {
    pass,
    // `transparent` wins over `background`, matching the global settings.
    // An unparseable colour leaves the current one in place.
    set({ background, transparent } = {}) {
      if (transparent !== undefined) uOpaque.value = transparent ? 0 : 1;
      const rgb = backgroundComponents(background);
      if (rgb) uColor.value.set(...rgb);
    },
  };
}

// Light adds colour; it never covers what is behind it. Stock AdditiveBlending
// adds alpha along with colour, which was invisible while the backdrop was
// drawn into the same buffer and became a hole once the backdrop moved behind
// the composite. Same colour factors three would use, so the look is
// unchanged, but alpha is left exactly as it was.
function addWithoutCoverage(material) {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = material.premultipliedAlpha ? THREE.OneFactor : THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  material.needsUpdate = true;
}

// UnrealBloomPass adds its blurred result additively, and its blur reaches the
// whole frame, so empty background read 43% opaque — a dark veil over the
// host page in transparent mode. Measured pixel-identical in colour after.
export function preserveBloomAlpha(bloomPass) {
  if (bloomPass?.blendMaterial) addWithoutCoverage(bloomPass.blendMaterial);
}

// Every additive material an engine puts in its scene, including ones it
// creates later on a rebuild — so this runs each frame. A converted material
// is CustomBlending and is skipped, so steady state is a traversal with no
// writes and no recompiles. Regard's halo punched a near-black ring (luma
// 2–11 on a 128 grey backdrop) into its own background before this.
export function lightCarriesNoCoverage(root) {
  root?.traverse((object) => {
    const { material } = object;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) {
      if (m.blending === THREE.AdditiveBlending) addWithoutCoverage(m);
    }
  });
}
