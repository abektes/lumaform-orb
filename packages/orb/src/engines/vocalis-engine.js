import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { resolveRingLayout, ringRest, sampleRingPoint, syllableOpening } from './vocalis-layout.js';

const FRAME_RADIUS = 2.25;
const SEGMENTS_PER_RING = 128;
// Syllables per second at articulationRate 1 — conversational speech runs at
// roughly three to five.
const SYLLABLES_PER_RATE = 2.5;
// A plosive holds the slit shut this long before it bursts.
const PLOSIVE_CLOSURE = 0.06;
const GLOBE_LEAN = 0.42;

// `Number(x) || fallback` turns a legitimate 0 into the fallback, which made
// zero ripple and zero breath unreachable from their own sliders.
function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// The glottal slit: a lens-shaped opening drawn per pixel on a card that lies
// in the innermost ring's plane, so it tilts with the diaphragm. It replaced a
// nucleus sphere that sat *inside* its own "occluder" — the occluder's front
// face was nearer the camera than the nucleus, so the centre rendered black.
const SLIT_VERTEX_SHADER = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SLIT_FRAGMENT_SHADER = /* glsl */ `
  uniform float uLength;
  uniform float uWidth;
  uniform float uAngle;
  uniform float uRim;
  uniform float uDark;
  uniform float uGlow;
  uniform float uFlash;
  uniform vec3 uRimColor;
  uniform vec3 uHaloColor;
  uniform vec3 uDepthColor;
  varying vec2 vLocal;

  void main() {
    float c = cos(uAngle);
    float s = sin(uAngle);
    vec2 p = vec2(c * vLocal.x + s * vLocal.y, -s * vLocal.x + c * vLocal.y);

    // Parabolic lens: pointed where the folds meet, widest in the middle. At
    // zero width it collapses to a glowing line, which is the closed glottis.
    float u = clamp(p.x / uLength, -1.0, 1.0);
    float halfWidth = uWidth * (1.0 - u * u);
    float edge = abs(p.y) - halfWidth;
    float along = 1.0 - smoothstep(0.82, 1.0, abs(p.x) / uLength);

    float rim = exp(-pow(edge / uRim, 2.0)) * along;
    float halo = exp(-pow(edge / (uRim * 5.0), 2.0)) * along;
    float inside = (1.0 - smoothstep(-uRim * 0.5, uRim * 0.5, edge)) * along;

    // Depth contrast without a depth-writing sphere: a soft dark pool around
    // the slit that the rings, drawn afterwards, sit on top of.
    float pool = exp(-dot(p, p) / (uLength * uLength) * 1.6) * uDark * 0.6;

    vec3 light = uRimColor * rim * (0.9 + uFlash) * uGlow
      + uHaloColor * halo * 0.5 * uGlow
      + uDepthColor * inside * 0.25 * (1.0 - uDark);
    float alpha = max(pool, inside * uDark);
    alpha = max(alpha, clamp(rim + halo * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(light, clamp(alpha, 0.0, 1.0));
  }
`;

export function createVocalisEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    ringCount: 6,
    ringLayout: 'circle',
    baseRadius: 1.45,
    lineWidth: 2.4,
    diaphragmDepth: 0.6,
    apertureSize: 0.35,
    vocalRipple: 0.14,
    formantHarmonics: 3,
    formantGain: 1.2,
    breatheAmp: 0.04,
    articulationRate: 1.2,
    plosiveSurge: 1.4,
    coreColor: '#ffffff',
    diaphragmColor: '#00f2fe',
    formantColor: '#a855f7',
    glowIntensity: 1.8,
    glottisDarkness: 0.8,
    slitAngle: 0,
    slitLength: 0.7,
    mouth: 'on',
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let rings = []; // array of { line, geometry, material, posArr, colArr, baseR, zOffset }
  let plosiveTimer = 0;
  let plosiveAge = Infinity;
  let articulationPhase = 0;
  let syllableClock = 0;

  const coreRGB = new THREE.Color(currentParams.coreColor);
  const diaphragmRGB = new THREE.Color(currentParams.diaphragmColor);
  const formantRGB = new THREE.Color(currentParams.formantColor);
  const tempColor = new THREE.Color();

  const slitUniforms = {
    uLength: { value: 0.3 },
    uWidth: { value: 0 },
    uAngle: { value: 0 },
    uRim: { value: 0.01 },
    uDark: { value: Number(currentParams.glottisDarkness) || 0.8 },
    uGlow: { value: 1 },
    uFlash: { value: 0 },
    uRimColor: { value: new THREE.Color() },
    uHaloColor: { value: new THREE.Color() },
    uDepthColor: { value: new THREE.Color() },
  };
  // Unit card, scaled per layout in buildRings; built once, never rebuilt.
  const slitGeometry = new THREE.PlaneGeometry(2, 2);
  const slitMaterial = new THREE.ShaderMaterial({
    uniforms: slitUniforms,
    vertexShader: SLIT_VERTEX_SHADER,
    fragmentShader: SLIT_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const slit = new THREE.Mesh(slitGeometry, slitMaterial);
  // First among the transparent objects, so the rings draw over its dark pool.
  slit.renderOrder = -1;
  group.add(slit);
  // Card-space radius the slit is measured against: the innermost ring.
  let slitReference = 0.5;

  // The whole mouth is this one card, so hiding it removes the lens, its rim
  // and glow, and the dark pool together, leaving the rings over an empty centre.
  function applyMouth() {
    slit.visible = currentParams.mouth !== 'off';
  }
  applyMouth();

  function buildRings() {
    for (const r of rings) {
      group.remove(r.line);
      r.geometry.dispose();
      r.material.dispose();
    }
    rings = [];

    const count = parseInt(currentParams.ringCount, 10) || 6;
    const baseR = Number(currentParams.baseRadius) || 1.45;
    const depth = Number(currentParams.diaphragmDepth) || 0.6;
    const layout = resolveRingLayout(currentParams.ringLayout);
    const size = renderer?.getSize ? renderer.getSize(new THREE.Vector2()) : new THREE.Vector2(1024, 768);

    for (let i = 0; i < count; i++) {
      const ringNorm = i / Math.max(1, count - 1);
      const rest = ringRest(layout, ringNorm, baseR, depth);

      const posArr = new Float32Array((SEGMENTS_PER_RING + 1) * 3);
      const colArr = new Float32Array((SEGMENTS_PER_RING + 1) * 3);

      const geometry = new LineGeometry();
      geometry.setPositions(posArr);
      geometry.setColors(colArr);

      const material = new LineMaterial({
        color: 0xffffff,
        vertexColors: true,
        linewidth: Number(currentParams.lineWidth) || 2.4,
        resolution: size,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });

      const line = new Line2(geometry, material);
      line.computeLineDistances();
      group.add(line);

      rings.push({
        line,
        geometry,
        material,
        posArr,
        colArr,
        rest,
        baseR: rest.radius,
        zOffset: rest.zOffset,
        index: i,
        norm: ringNorm,
      });
    }

    // The slit lies in the innermost ring's plane. The globe has no such
    // plane, so it sits at the centre, measured against the same fraction of
    // the radius the flat layouts use for their inner ring.
    const inner = ringRest(layout, 0, baseR, depth);
    slitReference = layout === 'globe' ? baseR * 0.35 : inner.radius;
    slit.position.z = layout === 'globe' ? 0 : inner.zOffset;
    slit.scale.setScalar(slitReference * 1.25);
  }

  buildRings();

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      const dt = Math.min(delta || 0, 1 / 30);
      const rate = Number(currentParams.articulationRate) || 1.2;
      articulationPhase += dt * rate * 3.2;
      syllableClock += dt * rate * SYLLABLES_PER_RATE;
      plosiveAge += Math.abs(dt);

      if (plosiveTimer > 0) {
        plosiveTimer = Math.max(0, plosiveTimer - dt * 2.0);
      }

      const layout = resolveRingLayout(currentParams.ringLayout);

      // Gentle orientation sway. The globe also leans toward the camera: seen
      // from the equator its latitudes collapse into horizontal lines and it
      // stops reading as a sphere at all.
      const globeLean = layout === 'globe' ? GLOBE_LEAN : 0;
      group.rotation.y = Math.sin(time * 0.2) * 0.18;
      group.rotation.x = globeLean + Math.cos(time * 0.16) * 0.12;

      const aperture = Number(currentParams.apertureSize) || 0.35;
      const rippleAmp = numberOr(currentParams.vocalRipple, 0.14);
      const harmonics = parseInt(currentParams.formantHarmonics, 10) || 3;
      const formantGain = Number(currentParams.formantGain) || 1.2;
      const breathe = 1.0 + Math.sin(time * 1.5) * numberOr(currentParams.breatheAmp, 0.04);
      const glow = Number(currentParams.glowIntensity) || 1.8;

      // Update concentric vocal diaphragm rings
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        const geom = ring.geometry;
        const posArr = ring.posArr;
        const colArr = ring.colArr;
        const ringNorm = ring.norm;

        // Aperture dilation: inner rings dilate most with speech volume
        const dilation = aperture * (1.0 - ringNorm * 0.6) * 0.6;
        const plosiveDilation = plosiveTimer * (1.0 - ringNorm * 0.4) * 0.4;
        const currentR = (ring.baseR + dilation + plosiveDilation) * breathe;
        ring.material.opacity = Math.min(0.95, 0.4 + glow * 0.22);

        for (let p = 0; p <= SEGMENTS_PER_RING; p++) {
          const theta = (p / SEGMENTS_PER_RING) * Math.PI * 2.0;

          const primaryWave = Math.sin(theta * harmonics - articulationPhase + ringNorm * 2.0);
          const combinedRipple = primaryWave * rippleAmp * ring.baseR;

          const rEff = currentR + combinedRipple;
          const radiusScale = ring.rest.radius > 1e-8 ? rEff / ring.rest.radius : 1;
          const point = sampleRingPoint(layout, theta, ring.rest, radiusScale);

          posArr[p * 3] = point[0];
          posArr[p * 3 + 1] = point[1];
          posArr[p * 3 + 2] = point[2];

          const formantMix = Math.pow(ringNorm, 0.8);
          tempColor.copy(diaphragmRGB).lerp(formantRGB, formantMix);
          const waveGaze = Math.max(0, primaryWave);
          tempColor.multiplyScalar(0.7 + waveGaze * 0.12 * formantGain + plosiveTimer * 0.1);

          colArr[p * 3] = tempColor.r;
          colArr[p * 3 + 1] = tempColor.g;
          colArr[p * 3 + 2] = tempColor.b;
        }

        geom.setPositions(posArr);
        geom.setColors(colArr);
      }

      // Glottal slit. A plosive shuts it completely, then bursts it past its
      // normal maximum; otherwise it follows the syllable envelope.
      let opening = syllableOpening(syllableClock);
      if (plosiveAge < PLOSIVE_CLOSURE) {
        opening = 0;
      } else if (plosiveTimer > 0) {
        opening = Math.max(opening, Math.min(1.5, 0.9 + plosiveTimer * 0.4));
      }
      // Slit geometry is card-local: the card is scaled by slitReference·1.25,
      // so lengths here are fractions of that.
      const slitLength = Math.min(0.78, (Number(currentParams.slitLength) || 0.7) / 1.25);
      slitUniforms.uLength.value = slitLength;
      // A floor under aperture so even a small setting opens visibly: at
      // 0.6·aperture the default opened to a fifth of its length and read as a dash.
      slitUniforms.uWidth.value = slitLength * (0.12 + aperture * 0.95) * opening * breathe;
      slitUniforms.uAngle.value = THREE.MathUtils.degToRad(Number(currentParams.slitAngle) || 0);
      slitUniforms.uRim.value = 0.022 * ((Number(currentParams.lineWidth) || 2.4) / 2.4);
      slitUniforms.uGlow.value = glow / 1.8;
      slitUniforms.uFlash.value = plosiveTimer * 0.5;
      slitUniforms.uRimColor.value.copy(coreRGB).lerp(diaphragmRGB, 0.3);
      slitUniforms.uHaloColor.value.copy(diaphragmRGB);
      slitUniforms.uDepthColor.value.copy(formantRGB);
    },

    setParams(patch) {
      let needsRebuild = false;
      if (patch.ringCount !== undefined && patch.ringCount !== currentParams.ringCount) {
        currentParams.ringCount = patch.ringCount;
        needsRebuild = true;
      }
      if (patch.ringLayout !== undefined && patch.ringLayout !== currentParams.ringLayout) {
        currentParams.ringLayout = patch.ringLayout;
        needsRebuild = true;
      }
      if (patch.baseRadius !== undefined && patch.baseRadius !== currentParams.baseRadius) {
        currentParams.baseRadius = patch.baseRadius;
        needsRebuild = true;
      }
      if (patch.diaphragmDepth !== undefined && patch.diaphragmDepth !== currentParams.diaphragmDepth) {
        currentParams.diaphragmDepth = patch.diaphragmDepth;
        needsRebuild = true;
      }
      if (patch.lineWidth !== undefined && patch.lineWidth !== currentParams.lineWidth) {
        currentParams.lineWidth = patch.lineWidth;
        for (const ring of rings) {
          if (ring.material) ring.material.linewidth = patch.lineWidth;
        }
      }

      Object.assign(currentParams, patch);

      if (patch.coreColor !== undefined) coreRGB.set(patch.coreColor);
      if (patch.diaphragmColor !== undefined) diaphragmRGB.set(patch.diaphragmColor);
      if (patch.formantColor !== undefined) formantRGB.set(patch.formantColor);

      if (patch.glottisDarkness !== undefined) {
        slitUniforms.uDark.value = Number(patch.glottisDarkness);
      }
      if (patch.mouth !== undefined) applyMouth();

      if (needsRebuild) {
        buildRings();
      }
    },

    onPulse() {
      plosiveTimer = Number(currentParams.plosiveSurge) || 1.4;
      plosiveAge = 0;
    },

    onResize(width, height) {
      for (const ring of rings) {
        if (ring.material) {
          ring.material.resolution.set(width, height);
        }
      }
    },

    dispose() {
      scene.remove(group);
      for (const ring of rings) {
        group.remove(ring.line);
        ring.geometry?.dispose();
        ring.material?.dispose();
      }
      rings = [];
      slitGeometry.dispose();
      slitMaterial.dispose();
    },
  };
}
