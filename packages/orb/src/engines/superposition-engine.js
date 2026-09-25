import * as THREE from 'three';
import { createSoftDotTexture } from '../core/soft-dot.js';
import { densityPeak, modeIndex, sampleMeasurement } from './superposition-orbitals.js';

// A probability cloud: two orbital states held in superposition, beating as
// their relative phase turns, and collapsing to one place on a click. Every
// sample used to sit on one of two fixed Fibonacci shells, so whatever the
// state the orb read as a dotted sphere with a wireframe ball inside. Samples
// now fill the lobes, so the cloud is the orbital's shape.

// Frame radius per unit of orbital scale: the default lobe reach with room for
// the widest excursion, which is 2.25 at the default scale, as before.
const FRAME_PER_SCALE = 1.55;

// Timing of a measurement, in seconds of virtual time: a quick fall onto the
// measured spot, a beat held there, then decoherence back into the cloud over
// a span that collapseStrength stretches.
const COLLAPSE_IN = 0.14;
const COLLAPSE_HOLD = 0.12;

const SUPERPOSITION_VERTEX_SHADER = /* glsl */ `
  attribute float aRadial;
  attribute float aSeed;

  uniform float uScale;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uCoherence;
  uniform float uWaveExcursion;
  uniform float uPhaseAngle;
  uniform float uDensityPeak;
  uniform float uCollapse;
  uniform vec3 uCollapseDir;
  uniform int uMode; // 0 hybrid_sp, 1 d_orbital, 2 f_orbital, 3 chiral_vortex
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uNodalColor;
  uniform float uGlowIntensity;

  varying vec3 vColor;
  varying float vAlpha;

  // The two eigenstates, ψ1 and ψ2, with ψ2 carrying the phase. Mirrors
  // eigenstates() in superposition-orbitals.js.
  void eigenstates(vec3 n, out vec2 p1, out vec2 p2) {
    float c = clamp(n.y, -0.999, 0.999);
    float s = sqrt(max(0.0, 1.0 - c * c));
    float phi = atan(n.z, n.x);
    vec2 turn = vec2(cos(uPhaseAngle), sin(uPhaseAngle));
    if (uMode == 0) {
      float pz = c * 1.2;
      p1 = vec2(0.6 + pz, 0.0);
      p2 = (0.6 - pz) * turn;
    } else if (uMode == 1) {
      p1 = vec2((3.0 * c * c - 1.0) * 0.7, 0.0);
      p2 = s * s * cos(2.0 * phi) * 1.1 * turn;
    } else if (uMode == 2) {
      p1 = vec2(c * (5.0 * c * c - 3.0) * 0.6, 0.0);
      p2 = s * s * c * sin(2.0 * phi) * 1.5 * turn;
    } else {
      float ring = s * 0.9;
      p1 = ring * vec2(cos(2.0 * phi), sin(2.0 * phi));
      p2 = ring * vec2(cos(3.0 * phi + uPhaseAngle), sin(3.0 * phi + uPhaseAngle));
    }
  }

  void main() {
    vec3 n = normalize(position);
    vec2 p1;
    vec2 p2;
    eigenstates(n, p1, p2);

    // |ψ1 + ψ2|² / 4 with the interference term scaled by coherence: at 0 the
    // two states just add and stop beating.
    float density = max(0.0, (dot(p1, p1) + dot(p2, p2) + 2.0 * uCoherence * dot(p1, p2)) * 0.25);
    float amp = sqrt(clamp(density / uDensityPeak, 0.0, 1.0));

    // How far the cloud reaches in this direction. The cube root spreads the
    // samples evenly through that volume, so a lobe reads as a filled body.
    float reach = uScale * (0.25 + amp * (0.75 + 0.8 * uWaveExcursion));
    vec3 pos = n * reach * (0.2 + 0.8 * pow(aRadial, 0.3333));

    // A measurement draws every sample onto the spot it found.
    vec3 scatter = vec3(fract(aSeed * 17.13), fract(aSeed * 31.71), fract(aSeed * 47.37)) - 0.5;
    vec3 spot = uCollapseDir * uScale * (0.9 + 0.35 * uWaveExcursion) + scatter * uScale * 0.35 * pow(aRadial, 0.3333);
    pos = mix(pos, spot, uCollapse);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float depthScale = clamp(8.0 / max(0.5, -mvPosition.z), 0.6, 2.2);
    gl_PointSize = max(1.0, uPointSize * uPixelRatio * depthScale * (0.7 + 0.9 * amp));

    // Colour by the sign of the wave, as orbital plots do: arg 0 is one colour,
    // π the other. The cosine keeps the blend seamless all the way round.
    vec2 psi = p1 + p2;
    float sign = 0.5 - 0.5 * cos(atan(psi.y, psi.x));
    vec3 color = mix(uColorA, uColorB, sign);
    color = mix(color, uNodalColor, smoothstep(0.75, 1.0, amp) * 0.6);
    color = mix(color, uNodalColor, uCollapse * 0.5);
    vColor = color * uGlowIntensity;

    // Nodes are empty and lobes full. The shimmer rides the phase, so it stops
    // with everything else when the orb is paused.
    float shimmer = 0.8 + 0.2 * sin(uPhaseAngle * 2.0 + aSeed * 6.2831853);
    vAlpha = mix(pow(amp, 1.2), 1.0, uCollapse) * shimmer;
  }
`;

const SUPERPOSITION_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float distSq = dot(coord, coord);
    if (distSq > 0.25) discard;

    float core = exp(-distSq * 55.0);
    float halo = exp(-distSq * 12.0);
    float alpha = (core * 0.95 + halo * 0.35) * vAlpha;

    vec3 light = vColor * (core * 1.7 + halo * 0.5);
    gl_FragColor = vec4(light, alpha);
  }
`;

// Samples are placed from a fixed seed, so a rebuild or a grid cell with the
// same settings shows the same cloud.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function createSuperpositionEngine({ scene, renderer, params }) {
  const currentParams = {
    sampleDensity: 6144,
    orbitalScale: 1.45,
    stateMode: 'd_orbital',
    pointSize: 2.8,
    coherence: 0.85,
    waveExcursion: 0.45,
    breatheAmp: 0.04,
    phaseRate: 1.1,
    collapseStrength: 1.4,
    psiColorA: '#38bdf8',
    psiColorB: '#f43f5e',
    nodalColor: '#e0f2fe',
    glowIntensity: 1.8,
    nucleusRadius: 0.38,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const frame = { radius: (Number(currentParams.orbitalScale) || 1.45) * FRAME_PER_SCALE };
  const glowTexture = createSoftDotTexture();

  let points = null;
  let pointsGeometry = null;
  let pointsMaterial = null;
  let nucleus = null;
  let nucleusMaterial = null;

  let phaseAngle = 0;
  let breathPhase = 0;
  // A measurement in progress: seconds since the click, and how hard it pulls.
  let collapseAge = Infinity;
  let collapsePull = 0;
  const collapseDir = new THREE.Vector3(0, 1, 0);

  const colorA = new THREE.Color(currentParams.psiColorA);
  const colorB = new THREE.Color(currentParams.psiColorB);
  const nodalRGB = new THREE.Color(currentParams.nodalColor);

  function currentMode() {
    return modeIndex(currentParams.stateMode);
  }

  function buildOrbital() {
    if (points) {
      group.remove(points);
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      points = null;
    }
    if (nucleus) {
      group.remove(nucleus);
      nucleusMaterial.dispose();
      nucleus = null;
    }

    const count = parseInt(currentParams.sampleDensity, 10) || 6144;
    const directions = new Float32Array(count * 3);
    const radials = new Float32Array(count);
    const seeds = new Float32Array(count);
    const random = seededRandom(0x5eed);
    for (let i = 0; i < count; i++) {
      const y = random() * 2 - 1;
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      directions[i * 3] = r * Math.cos(a);
      directions[i * 3 + 1] = y;
      directions[i * 3 + 2] = r * Math.sin(a);
      radials[i] = random();
      seeds[i] = random();
    }

    pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(directions, 3));
    pointsGeometry.setAttribute('aRadial', new THREE.BufferAttribute(radials, 1));
    pointsGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    pointsMaterial = new THREE.ShaderMaterial({
      vertexShader: SUPERPOSITION_VERTEX_SHADER,
      fragmentShader: SUPERPOSITION_FRAGMENT_SHADER,
      uniforms: {
        uScale: { value: Number(currentParams.orbitalScale) || 1.45 },
        uPointSize: { value: Number(currentParams.pointSize) || 2.8 },
        uPixelRatio: { value: renderer?.getPixelRatio ? renderer.getPixelRatio() : 1 },
        uCoherence: { value: Number(currentParams.coherence) },
        uWaveExcursion: { value: Number(currentParams.waveExcursion) || 0.45 },
        uPhaseAngle: { value: phaseAngle },
        uDensityPeak: { value: densityPeak(currentMode()) },
        uCollapse: { value: 0 },
        uCollapseDir: { value: collapseDir },
        uMode: { value: currentMode() },
        uColorA: { value: colorA },
        uColorB: { value: colorB },
        uNodalColor: { value: nodalRGB },
        uGlowIntensity: { value: Number(currentParams.glowIntensity) || 1.8 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    points = new THREE.Points(pointsGeometry, pointsMaterial);
    // The geometry holds unit directions; the shader moves them out to the
    // lobes, so the bounding sphere three.js computes would be wrong.
    points.frustumCulled = false;
    group.add(points);

    // The nucleus is a soft glow, not a mesh: the cloud is the subject.
    nucleusMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: nodalRGB,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    nucleus = new THREE.Sprite(nucleusMaterial);
    group.add(nucleus);
  }

  buildOrbital();

  return {
    frame,

    update({ time, delta }) {
      const dt = Math.min(Math.max(0, delta || 0), 1 / 30);
      phaseAngle = (phaseAngle + dt * (Number(currentParams.phaseRate) || 1.1) * 2.6) % (Math.PI * 2);
      breathPhase = (breathPhase + dt * 1.8) % (Math.PI * 2);

      let collapse = 0;
      if (collapseAge < Infinity) {
        collapseAge += dt;
        const out = 0.35 + 0.55 * (Number(currentParams.collapseStrength) || 1.4);
        const release = COLLAPSE_IN + COLLAPSE_HOLD;
        collapse = collapsePull * smoothstep(0, COLLAPSE_IN, collapseAge) * (1 - smoothstep(release, release + out, collapseAge));
        if (collapseAge > release + out) collapseAge = Infinity;
      }

      // Precession of the whole cloud.
      group.rotation.y = time * 0.16;
      group.rotation.z = Math.sin(time * 0.1) * 0.15;

      if (pointsMaterial) {
        pointsMaterial.uniforms.uPhaseAngle.value = phaseAngle;
        pointsMaterial.uniforms.uCollapse.value = collapse;
      }

      if (nucleus) {
        const breathe = 1 + Math.sin(breathPhase) * (Number(currentParams.breatheAmp) || 0.04);
        // Sized so the bright part of the soft falloff matches nucleusRadius;
        // bloom widens it further.
        const size = (Number(currentParams.nucleusRadius) || 0.38) * 1.6 * breathe;
        nucleus.scale.set(size, size, 1);
        // The cloud leaves the nucleus when it collapses onto the measured spot.
        nucleusMaterial.opacity = 0.5 * (1 - collapse * 0.6);
      }
    },

    setParams(patch) {
      let needsRebuild = false;
      if (patch.sampleDensity !== undefined && patch.sampleDensity !== currentParams.sampleDensity) needsRebuild = true;

      Object.assign(currentParams, patch);

      if (patch.orbitalScale !== undefined) {
        frame.radius = (Number(currentParams.orbitalScale) || 1.45) * FRAME_PER_SCALE;
      }
      if (patch.nodalColor !== undefined) nodalRGB.set(patch.nodalColor);
      if (patch.psiColorA !== undefined) colorA.set(patch.psiColorA);
      if (patch.psiColorB !== undefined) colorB.set(patch.psiColorB);

      if (needsRebuild) {
        buildOrbital();
        return;
      }
      if (!pointsMaterial) return;
      const u = pointsMaterial.uniforms;
      if (patch.orbitalScale !== undefined) u.uScale.value = Number(patch.orbitalScale) || 1.45;
      if (patch.stateMode !== undefined) {
        u.uMode.value = currentMode();
        u.uDensityPeak.value = densityPeak(currentMode());
      }
      if (patch.pointSize !== undefined) u.uPointSize.value = Number(patch.pointSize);
      if (patch.coherence !== undefined) u.uCoherence.value = Number(patch.coherence);
      if (patch.waveExcursion !== undefined) u.uWaveExcursion.value = Number(patch.waveExcursion);
      if (patch.glowIntensity !== undefined) u.uGlowIntensity.value = Number(patch.glowIntensity);
    },

    // A click measures the state: the cloud falls onto one place, chosen with
    // the probabilities the cloud shows, and then decoheres back out.
    onPulse() {
      const [x, y, z] = sampleMeasurement(currentMode(), phaseAngle, Number(currentParams.coherence));
      collapseDir.set(x, y, z);
      collapsePull = Math.min(1, 0.55 + 0.25 * (Number(currentParams.collapseStrength) || 1.4));
      collapseAge = 0;
    },

    onResize() {
      if (pointsMaterial && renderer?.getPixelRatio) {
        pointsMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      }
    },

    dispose() {
      scene.remove(group);
      pointsGeometry?.dispose();
      pointsMaterial?.dispose();
      nucleusMaterial?.dispose();
      glowTexture.dispose();
    },
  };
}
