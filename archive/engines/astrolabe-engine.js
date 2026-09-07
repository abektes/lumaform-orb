import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const FRAME_RADIUS = 2.35;
const RING_SEGMENTS = 128;
const TICKS_PER_RING = 24;

export function createAstrolabeEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    ringCount: 4,
    armillaryRadius: 1.55,
    lineWidth: 2.2,
    tickLength: 0.12,
    ringSpread: 0.28,
    nutationAmp: 0.08,
    gearRatio: 1.5,
    breatheAmp: 0.035,
    precessionRate: 0.8,
    transitSurge: 1.5,
    ringColor: '#38bdf8',
    vernierColor: '#ffed00',
    coreColor: '#0c4a6e',
    glowIntensity: 1.7,
    datumCoreRadius: 0.65,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let rings = []; // array of { group, hoopLine, hoopGeom, hoopMat, tickLine, tickGeom, tickMat, vernierMesh, axis, speedMult, baseTilt }
  let coreSphere = null;
  let coreGeom = null;
  let coreMat = null;

  let transitTimer = 0;
  let precessionAngle = 0;

  const ringRGB = new THREE.Color(currentParams.ringColor);
  const vernierRGB = new THREE.Color(currentParams.vernierColor);
  const coreRGB = new THREE.Color(currentParams.coreColor);
  const tempColor = new THREE.Color();

  function buildAstrolabe() {
    for (const r of rings) {
      group.remove(r.group);
      r.hoopGeom.dispose();
      r.hoopMat.dispose();
      r.tickGeom.dispose();
      r.tickMat.dispose();
      r.vernierGeom.dispose();
      r.vernierMat.dispose();
    }
    rings = [];

    if (coreSphere) {
      group.remove(coreSphere);
      coreGeom.dispose();
      coreMat.dispose();
      coreSphere = null;
    }

    const count = parseInt(currentParams.ringCount, 10) || 4;
    const baseR = Number(currentParams.armillaryRadius) || 1.55;
    const tickLen = Number(currentParams.tickLength) || 0.12;
    const size = renderer?.getSize ? renderer.getSize(new THREE.Vector2()) : new THREE.Vector2(1024, 768);

    // Ring definitions based on classical armillary coordinates
    const ringConfigs = [
      { name: 'Meridian', axis: new THREE.Vector3(0, 1, 0), tilt: 0.0, speed: 1.0 },
      { name: 'Equator', axis: new THREE.Vector3(1, 0, 0), tilt: Math.PI / 2, speed: -0.75 },
      { name: 'Ecliptic', axis: new THREE.Vector3(0, 0, 1), tilt: 23.5 * Math.PI / 180, speed: 1.35 },
      { name: 'Colure', axis: new THREE.Vector3(1, 1, 0).normalize(), tilt: Math.PI / 4, speed: -1.1 },
      { name: 'Horizon', axis: new THREE.Vector3(0, 1, 1).normalize(), tilt: 66.5 * Math.PI / 180, speed: 0.9 },
    ];

    for (let i = 0; i < count; i++) {
      const cfg = ringConfigs[i % ringConfigs.length];
      const ringGroup = new THREE.Group();
      group.add(ringGroup);

      const rRadius = baseR * (0.85 + (i / count) * 0.3);

      // 1. Hoop polyline (Line2)
      const hoopPositions = new Float32Array((RING_SEGMENTS + 1) * 3);
      const hoopColors = new Float32Array((RING_SEGMENTS + 1) * 3);

      for (let s = 0; s <= RING_SEGMENTS; s++) {
        const theta = (s / RING_SEGMENTS) * Math.PI * 2.0;
        hoopPositions[s * 3] = Math.cos(theta) * rRadius;
        hoopPositions[s * 3 + 1] = 0;
        hoopPositions[s * 3 + 2] = Math.sin(theta) * rRadius;

        hoopColors[s * 3] = ringRGB.r;
        hoopColors[s * 3 + 1] = ringRGB.g;
        hoopColors[s * 3 + 2] = ringRGB.b;
      }

      const hoopGeom = new LineGeometry();
      hoopGeom.setPositions(hoopPositions);
      hoopGeom.setColors(hoopColors);

      const hoopMat = new LineMaterial({
        color: 0xffffff,
        vertexColors: true,
        linewidth: Number(currentParams.lineWidth) || 2.2,
        resolution: size,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const hoopLine = new Line2(hoopGeom, hoopMat);
      hoopLine.computeLineDistances();
      ringGroup.add(hoopLine);

      // 2. Graduation tick marks
      const tickPositions = new Float32Array(TICKS_PER_RING * 2 * 3);
      const tickColors = new Float32Array(TICKS_PER_RING * 2 * 3);

      for (let t = 0; t < TICKS_PER_RING; t++) {
        const theta = (t / TICKS_PER_RING) * Math.PI * 2.0;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const innerR = rRadius - tickLen * 0.5;
        const outerR = rRadius + tickLen * 0.5;

        const idx = t * 6;
        tickPositions[idx] = cosT * innerR;
        tickPositions[idx + 1] = 0;
        tickPositions[idx + 2] = sinT * innerR;

        tickPositions[idx + 3] = cosT * outerR;
        tickPositions[idx + 4] = 0;
        tickPositions[idx + 5] = sinT * outerR;

        tickColors[idx] = vernierRGB.r;
        tickColors[idx + 1] = vernierRGB.g;
        tickColors[idx + 2] = vernierRGB.b;

        tickColors[idx + 3] = vernierRGB.r;
        tickColors[idx + 4] = vernierRGB.g;
        tickColors[idx + 5] = vernierRGB.b;
      }

      const tickGeom = new LineGeometry();
      tickGeom.setPositions(tickPositions);
      tickGeom.setColors(tickColors);

      const tickMat = new LineMaterial({
        color: 0xffffff,
        vertexColors: true,
        linewidth: (Number(currentParams.lineWidth) || 2.2) * 0.8,
        resolution: size,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const tickLine = new Line2(tickGeom, tickMat);
      tickLine.computeLineDistances();
      ringGroup.add(tickLine);

      // 3. Floating Vernier Indicator Caliper
      const vernierGeom = new THREE.SphereGeometry(0.045, 12, 12);
      const vernierMat = new THREE.MeshBasicMaterial({
        color: vernierRGB,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const vernierMesh = new THREE.Mesh(vernierGeom, vernierMat);
      vernierMesh.position.set(rRadius, 0, 0);
      ringGroup.add(vernierMesh);

      rings.push({
        group: ringGroup,
        hoopLine,
        hoopGeom,
        hoopMat,
        hoopPositions,
        hoopColors,
        tickLine,
        tickGeom,
        tickMat,
        vernierMesh,
        vernierGeom,
        vernierMat,
        axis: cfg.axis,
        baseTilt: cfg.tilt,
        speedMult: cfg.speed,
        rRadius,
      });
    }

    // Central datum globe
    const coreR = Number(currentParams.datumCoreRadius) || 0.65;
    coreGeom = new THREE.SphereGeometry(coreR, 32, 24);
    coreMat = new THREE.MeshBasicMaterial({
      color: coreRGB,
      transparent: true,
      opacity: 0.85,
      depthWrite: true,
    });
    coreSphere = new THREE.Mesh(coreGeom, coreMat);
    group.add(coreSphere);
  }

  buildAstrolabe();

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      const dt = Math.min(delta || 0, 1 / 30);
      const rate = Number(currentParams.precessionRate) || 0.8;
      precessionAngle += dt * rate * 1.5;

      if (transitTimer > 0) {
        transitTimer = Math.max(0, transitTimer - dt * 1.8);
      }

      // Gyroscopic whole-body precession
      group.rotation.y = time * 0.12;
      group.rotation.z = Math.sin(time * 0.08) * 0.15;

      const spread = Number(currentParams.ringSpread) || 0.28;
      const nutation = Number(currentParams.nutationAmp) || 0.08;
      const gear = Number(currentParams.gearRatio) || 1.5;
      const glow = Number(currentParams.glowIntensity) || 1.7;
      const breathe = 1.0 + Math.sin(time * 1.6) * (Number(currentParams.breatheAmp) || 0.035);

      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        const rGroup = ring.group;

        // Alignment snap during transit event
        const alignmentSnap = 1.0 - transitTimer * 0.85;

        // Differential rotation angle
        const ringAngle = (precessionAngle * ring.speedMult * gear) * alignmentSnap;
        const nutationWobble = Math.sin(precessionAngle * 2.0 + i * 1.5) * nutation;

        rGroup.rotation.x = ring.baseTilt + (nutationWobble + (i - rings.length / 2) * spread) * alignmentSnap;
        rGroup.rotation.y = ringAngle;
        rGroup.rotation.z = Math.cos(precessionAngle * 1.5 + i) * nutation * alignmentSnap;

        // Scale with breath and transit surge
        const rScale = breathe * (1.0 + transitTimer * 0.15);
        rGroup.scale.set(rScale, rScale, rScale);

        // Advance floating vernier indicator along the ring circumference
        const vernierAngle = time * (0.8 + i * 0.4);
        ring.vernierMesh.position.x = Math.cos(vernierAngle) * ring.rRadius;
        ring.vernierMesh.position.z = Math.sin(vernierAngle) * ring.rRadius;

        // Vernier flash on alignment / pulse
        const vernierPulse = transitTimer * 1.8 + Math.pow(Math.max(0, Math.sin(vernierAngle)), 8.0) * 0.6;
        tempColor.copy(vernierRGB).lerp(ringRGB, 0.2);
        tempColor.multiplyScalar(glow * (1.0 + vernierPulse));
        ring.vernierMat.color.copy(tempColor);
      }

      if (coreSphere) {
        coreSphere.rotation.y = -time * 0.25;
        const coreScale = breathe * (1.0 + transitTimer * 0.1);
        coreSphere.scale.set(coreScale, coreScale, coreScale);
      }
    },

    setParams(patch) {
      let needsRebuild = false;
      if (patch.ringCount !== undefined && patch.ringCount !== currentParams.ringCount) {
        currentParams.ringCount = patch.ringCount;
        needsRebuild = true;
      }
      if (patch.armillaryRadius !== undefined && patch.armillaryRadius !== currentParams.armillaryRadius) {
        currentParams.armillaryRadius = patch.armillaryRadius;
        needsRebuild = true;
      }
      if (patch.datumCoreRadius !== undefined && patch.datumCoreRadius !== currentParams.datumCoreRadius) {
        currentParams.datumCoreRadius = patch.datumCoreRadius;
        needsRebuild = true;
      }
      if (patch.tickLength !== undefined && patch.tickLength !== currentParams.tickLength) {
        currentParams.tickLength = patch.tickLength;
        needsRebuild = true;
      }
      if (patch.lineWidth !== undefined && patch.lineWidth !== currentParams.lineWidth) {
        currentParams.lineWidth = patch.lineWidth;
        for (const ring of rings) {
          if (ring.hoopMat) ring.hoopMat.linewidth = patch.lineWidth;
          if (ring.tickMat) ring.tickMat.linewidth = patch.lineWidth * 0.8;
        }
      }

      Object.assign(currentParams, patch);

      if (patch.ringColor !== undefined) {
        ringRGB.set(patch.ringColor);
        for (const ring of rings) {
          const colors = ring.hoopColors;
          for (let s = 0; s <= RING_SEGMENTS; s++) {
            colors[s * 3] = ringRGB.r;
            colors[s * 3 + 1] = ringRGB.g;
            colors[s * 3 + 2] = ringRGB.b;
          }
          ring.hoopGeom.setColors(colors);
        }
      }

      if (patch.vernierColor !== undefined) {
        vernierRGB.set(patch.vernierColor);
        for (const ring of rings) {
          ring.vernierMat.color.copy(vernierRGB);
        }
      }

      if (patch.coreColor !== undefined && coreMat) {
        coreRGB.set(patch.coreColor);
        coreMat.color.copy(coreRGB);
      }

      if (needsRebuild) {
        buildAstrolabe();
      }
    },

    onPulse() {
      transitTimer = Number(currentParams.transitSurge) || 1.5;
    },

    onResize(width, height) {
      for (const ring of rings) {
        if (ring.hoopMat) ring.hoopMat.resolution.set(width, height);
        if (ring.tickMat) ring.tickMat.resolution.set(width, height);
      }
    },

    dispose() {
      scene.remove(group);
      for (const ring of rings) {
        group.remove(ring.group);
        ring.hoopGeom?.dispose();
        ring.hoopMat?.dispose();
        ring.tickGeom?.dispose();
        ring.tickMat?.dispose();
        ring.vernierGeom?.dispose();
        ring.vernierMat?.dispose();
      }
      rings = [];
      if (coreSphere) {
        group.remove(coreSphere);
        coreGeom?.dispose();
        coreMat?.dispose();
      }
    },
  };
}
