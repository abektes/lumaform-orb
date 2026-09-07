import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const FRAME_RADIUS = 2.4;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const POINTS_PER_LOOP = 48;

export function createHeliosEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    loopCount: 16,
    photosphereRadius: 1.35,
    prominenceHeight: 1.85,
    lineWidth: 2.2,
    loopTwist: 0.45,
    plasmaActivity: 1.2,
    breatheAmp: 0.04,
    dynamoRate: 1.0,
    flareStrength: 1.5,
    photosphereColor: '#ff5500',
    plasmaColor: '#ffc400',
    flareColor: '#ff0055',
    glowIntensity: 1.8,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let loops = []; // array of { line, geometry, material, footA, footB, apexDist, phaseOffset }
  let photosphere = null;
  let photoGeometry = null;
  let photoMaterial = null;

  let flareTimer = 0;
  let plasmaClock = 0;

  const photoRGB = new THREE.Color(currentParams.photosphereColor);
  const plasmaRGB = new THREE.Color(currentParams.plasmaColor);
  const flareRGB = new THREE.Color(currentParams.flareColor);
  const tempColor = new THREE.Color();

  function buildArcade() {
    // Clean up existing loops
    for (const loop of loops) {
      group.remove(loop.line);
      loop.geometry.dispose();
      loop.material.dispose();
    }
    loops = [];

    if (photosphere) {
      group.remove(photosphere);
      photoGeometry.dispose();
      photoMaterial.dispose();
      photosphere = null;
    }

    const count = parseInt(currentParams.loopCount, 10) || 16;
    const photoR = Number(currentParams.photosphereRadius) || 1.35;
    const apexMax = Number(currentParams.prominenceHeight) || 1.85;
    const size = renderer?.getSize ? renderer.getSize(new THREE.Vector2()) : new THREE.Vector2(1024, 768);

    // Build magnetic loops
    for (let i = 0; i < count; i++) {
      // Footpoints distributed in bipolar pairs across the sphere
      const pairIdx = Math.floor(i / 2);
      const theta = 2 * Math.PI * pairIdx / (count / 2) * GOLDEN_RATIO;
      const phi = Math.acos(1 - 2 * (pairIdx + 0.5) / (count / 2));

      const centerDir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();

      // Tangent vector for bipolar separation
      const up = Math.abs(centerDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const tangent = new THREE.Vector3().crossVectors(centerDir, up).normalize();
      const bitangent = new THREE.Vector3().crossVectors(centerDir, tangent).normalize();

      const spanAngle = 0.45 + (i % 2) * 0.25;
      const footA = centerDir.clone().applyAxisAngle(bitangent, spanAngle).multiplyScalar(photoR);
      const footB = centerDir.clone().applyAxisAngle(bitangent, -spanAngle).multiplyScalar(photoR);

      const apexDist = photoR + (apexMax - photoR) * (0.6 + (i % 3) * 0.2);

      const positions = new Float32Array(POINTS_PER_LOOP * 3);
      const colors = new Float32Array(POINTS_PER_LOOP * 3);

      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);

      const material = new LineMaterial({
        color: 0xffffff,
        vertexColors: true,
        linewidth: Number(currentParams.lineWidth) || 2.2,
        resolution: size,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const line = new Line2(geometry, material);
      line.computeLineDistances();
      group.add(line);

      loops.push({
        line,
        geometry,
        material,
        footA,
        footB,
        centerDir,
        tangent,
        bitangent,
        apexDist,
        phaseOffset: i * 0.39,
        posArr: positions,
        colArr: colors,
      });
    }

    // Photosphere central glowing body
    photoGeometry = new THREE.SphereGeometry(photoR, 36, 28);
    photoMaterial = new THREE.MeshBasicMaterial({
      color: photoRGB,
      transparent: true,
      opacity: 0.85,
      depthWrite: true,
    });
    photosphere = new THREE.Mesh(photoGeometry, photoMaterial);
    group.add(photosphere);
  }

  buildArcade();

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      const dt = Math.min(delta || 0, 1 / 30);
      const rate = Number(currentParams.dynamoRate) || 1.0;
      plasmaClock += dt * rate * 2.5;

      if (flareTimer > 0) {
        flareTimer = Math.max(0, flareTimer - dt * 1.5);
      }

      // Dynamo differential rotation
      group.rotation.y = time * 0.14;
      group.rotation.x = Math.sin(time * 0.07) * 0.12;

      const photoR = Number(currentParams.photosphereRadius) || 1.35;
      const twist = Number(currentParams.loopTwist) || 0.45;
      const activity = Number(currentParams.plasmaActivity) || 1.2;
      const glow = Number(currentParams.glowIntensity) || 1.8;
      const breathe = 1.0 + Math.sin(time * 1.8) * (Number(currentParams.breatheAmp) || 0.04);

      // Recompute loop vertex coordinates and dynamic plasma colors
      for (let l = 0; l < loops.length; l++) {
        const loop = loops[l];
        const geom = loop.geometry;
        const posArr = loop.posArr;
        const colArr = loop.colArr;

        const dynamicApex = (loop.apexDist + flareTimer * 0.4) * breathe;

        for (let p = 0; p < POINTS_PER_LOOP; p++) {
          const t = p / (POINTS_PER_LOOP - 1); // 0 to 1 along loop
          const sinT = Math.sin(t * Math.PI);

          // Dipole parabolic arc from footA to footB via apex
          const basePos = new THREE.Vector3().lerpVectors(loop.footA, loop.footB, t);
          // Lift radially toward apex
          const radialLift = loop.centerDir.clone().multiplyScalar((dynamicApex - photoR) * sinT);
          // Add twist shear perpendicular to the loop plane
          const twistOffset = loop.tangent.clone().multiplyScalar(Math.sin(t * Math.PI * 2.0) * twist * 0.3 * sinT);

          const finalPos = basePos.add(radialLift).add(twistOffset);

          posArr[p * 3] = finalPos.x;
          posArr[p * 3 + 1] = finalPos.y;
          posArr[p * 3 + 2] = finalPos.z;

          // Plasma pulse packet travelling along the loop
          const wavePhase = (plasmaClock * activity + loop.phaseOffset + t * 3.0) % 1.0;
          const pulseIntensity = Math.exp(-Math.pow((wavePhase - 0.5) / 0.15, 2.0));

          // Base color: footpoints use photosphere tint, body uses plasma tint
          tempColor.copy(photoRGB).lerp(plasmaRGB, sinT);

          // Reconnection flare and pulse highlight
          const flareAmount = flareTimer * 0.8 + pulseIntensity * 0.6;
          tempColor.lerp(flareRGB, clamp01(flareAmount));
          tempColor.multiplyScalar(glow * (0.8 + flareAmount * 1.2));

          colArr[p * 3] = tempColor.r;
          colArr[p * 3 + 1] = tempColor.g;
          colArr[p * 3 + 2] = tempColor.b;
        }

        geom.setPositions(posArr);
        geom.setColors(colArr);
      }

      // Photosphere pulsing
      if (photosphere) {
        const photoScale = breathe * (1.0 + flareTimer * 0.06);
        photosphere.scale.set(photoScale, photoScale, photoScale);
        if (photoMaterial) {
          tempColor.copy(photoRGB).lerp(flareRGB, clamp01(flareTimer * 0.5));
          photoMaterial.color.copy(tempColor);
        }
      }
    },

    setParams(patch) {
      let needsRebuild = false;
      if (patch.loopCount !== undefined && patch.loopCount !== currentParams.loopCount) {
        currentParams.loopCount = patch.loopCount;
        needsRebuild = true;
      }
      if (patch.photosphereRadius !== undefined && patch.photosphereRadius !== currentParams.photosphereRadius) {
        currentParams.photosphereRadius = patch.photosphereRadius;
        needsRebuild = true;
      }
      if (patch.prominenceHeight !== undefined && patch.prominenceHeight !== currentParams.prominenceHeight) {
        currentParams.prominenceHeight = patch.prominenceHeight;
        needsRebuild = true;
      }
      if (patch.lineWidth !== undefined && patch.lineWidth !== currentParams.lineWidth) {
        currentParams.lineWidth = patch.lineWidth;
        for (const loop of loops) {
          if (loop.material) loop.material.linewidth = patch.lineWidth;
        }
      }

      Object.assign(currentParams, patch);

      if (patch.photosphereColor !== undefined) photoRGB.set(patch.photosphereColor);
      if (patch.plasmaColor !== undefined) plasmaRGB.set(patch.plasmaColor);
      if (patch.flareColor !== undefined) flareRGB.set(patch.flareColor);

      if (needsRebuild) {
        buildArcade();
      }
    },

    onPulse() {
      flareTimer = Number(currentParams.flareStrength) || 1.5;
    },

    onResize(width, height) {
      for (const loop of loops) {
        if (loop.material) {
          loop.material.resolution.set(width, height);
        }
      }
    },

    dispose() {
      scene.remove(group);
      for (const loop of loops) {
        group.remove(loop.line);
        loop.geometry?.dispose();
        loop.material?.dispose();
      }
      loops = [];
      if (photosphere) {
        group.remove(photosphere);
        photoGeometry?.dispose();
        photoMaterial?.dispose();
      }
    },
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
