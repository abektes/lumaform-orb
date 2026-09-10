import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { resolveRingLayout, ringRest, sampleRingPoint } from './vocalis-layout.js';

const FRAME_RADIUS = 2.25;
const SEGMENTS_PER_RING = 128;

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
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let rings = []; // array of { line, geometry, material, posArr, colArr, baseR, zOffset }
  let glottisMesh = null;
  let glottisGeometry = null;
  let glottisMaterial = null;
  let coreOccluder = null;
  let occluderGeometry = null;
  let occluderMaterial = null;

  let plosiveTimer = 0;
  let articulationPhase = 0;

  const coreRGB = new THREE.Color(currentParams.coreColor);
  const diaphragmRGB = new THREE.Color(currentParams.diaphragmColor);
  const formantRGB = new THREE.Color(currentParams.formantColor);
  const tempColor = new THREE.Color();

  function buildRings() {
    for (const r of rings) {
      group.remove(r.line);
      r.geometry.dispose();
      r.material.dispose();
    }
    rings = [];

    if (glottisMesh) {
      group.remove(glottisMesh);
      glottisGeometry.dispose();
      glottisMaterial.dispose();
      glottisMesh = null;
    }
    if (coreOccluder) {
      group.remove(coreOccluder);
      occluderGeometry.dispose();
      occluderMaterial.dispose();
      coreOccluder = null;
    }

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

    // Inner glowing glottal nucleus (the vocal core that flashes on syllables)
    const nucleusR = baseR * 0.28;
    glottisGeometry = new THREE.SphereGeometry(nucleusR, 32, 24);
    glottisMaterial = new THREE.MeshBasicMaterial({
      color: coreRGB,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    glottisMesh = new THREE.Mesh(glottisGeometry, glottisMaterial);
    group.add(glottisMesh);

    // Occluder sphere behind glottis for depth contrast
    const occluderR = baseR * 0.55;
    occluderGeometry = new THREE.SphereGeometry(occluderR, 32, 24);
    occluderMaterial = new THREE.MeshBasicMaterial({
      color: 0x020408,
      transparent: true,
      opacity: Number(currentParams.glottisDarkness) || 0.8,
      depthWrite: true,
    });
    coreOccluder = new THREE.Mesh(occluderGeometry, occluderMaterial);
    coreOccluder.position.z = -depth * 0.4;
    group.add(coreOccluder);
  }

  buildRings();

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      const dt = Math.min(delta || 0, 1 / 30);
      const rate = Number(currentParams.articulationRate) || 1.2;
      articulationPhase += dt * rate * 3.2;

      if (plosiveTimer > 0) {
        plosiveTimer = Math.max(0, plosiveTimer - dt * 2.0);
      }

      // Gentle orientation sway
      group.rotation.y = Math.sin(time * 0.2) * 0.18;
      group.rotation.x = Math.cos(time * 0.16) * 0.12;

      const aperture = Number(currentParams.apertureSize) || 0.35;
      const rippleAmp = Number(currentParams.vocalRipple) || 0.14;
      const harmonics = parseInt(currentParams.formantHarmonics, 10) || 3;
      const formantGain = Number(currentParams.formantGain) || 1.2;
      const breathe = 1.0 + Math.sin(time * 1.5) * (Number(currentParams.breatheAmp) || 0.04);
      const glow = Number(currentParams.glowIntensity) || 1.8;
      const layout = resolveRingLayout(currentParams.ringLayout);

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

      // Glottal nucleus flare on articulation & plosive surge
      if (glottisMesh && glottisMaterial) {
        const nucleusPulse = (1.0 + aperture * 0.5 + plosiveTimer * 0.8) * breathe;
        glottisMesh.scale.set(nucleusPulse, nucleusPulse, nucleusPulse);

        tempColor.copy(coreRGB).lerp(diaphragmRGB, 0.4);
        tempColor.multiplyScalar(0.45 + plosiveTimer * 0.35 + aperture * 0.15);
        glottisMaterial.color.copy(tempColor);
      }
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

      if (patch.glottisDarkness !== undefined && occluderMaterial) {
        occluderMaterial.opacity = patch.glottisDarkness;
      }

      if (needsRebuild) {
        buildRings();
      }
    },

    onPulse() {
      plosiveTimer = Number(currentParams.plosiveSurge) || 1.4;
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
      if (glottisMesh) {
        group.remove(glottisMesh);
        glottisGeometry?.dispose();
        glottisMaterial?.dispose();
      }
      if (coreOccluder) {
        group.remove(coreOccluder);
        occluderGeometry?.dispose();
        occluderMaterial?.dispose();
      }
    },
  };
}
