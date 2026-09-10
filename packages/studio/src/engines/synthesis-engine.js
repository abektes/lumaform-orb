import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const FRAME_RADIUS = 2.30;
const FILAMENT_SEGMENTS = 24;

const CORE_VERTEX_SHADER = /* glsl */ `
  uniform float uRadius;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vNormal = normalMatrix * normal;
    vec4 mvPosition = modelViewMatrix * vec4(position * uRadius, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const CORE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGlow;
  uniform float uPulse;

  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);

    float NdotV = clamp(dot(N, V), 0.0, 1.0);
    float rim = pow(1.0 - NdotV, 2.0);
    float core = pow(NdotV, 1.6);

    vec3 light = (uColor * (0.6 + core * 0.8) + vec3(1.0) * (rim * 0.75 + uPulse * 0.6)) * uGlow;
    float alpha = clamp(0.45 + rim * 0.5 + uPulse * 0.3, 0.0, 0.95);

    gl_FragColor = vec4(light, alpha);
  }
`;

const VEIL_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vNormal = normalMatrix * normal;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const VEIL_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uVeilColor;
  uniform float uGlow;
  uniform float uBreathe;

  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);

    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 light = uVeilColor * (rim * 1.8 + uBreathe * 0.4) * uGlow;
    float alpha = clamp(rim * 0.65, 0.0, 0.8);

    gl_FragColor = vec4(light, alpha);
  }
`;

export function createSynthesisEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    envelopeRadius: 1.60,
    coreRadius: 0.38,
    filamentCount: 6,
    stardustDensity: 64,
    orbitSpread: 0.75,
    orbitSpeed: 0.55,
    fusionTension: 0.65,
    breatheAmp: 0.035,
    coalesceSurge: 1.40,
    color1: '#4285f4', // Google Blue
    color2: '#ea4335', // Google Red
    color3: '#fbbc05', // Google Yellow
    color4: '#34a853', // Google Green
    veilColor: '#1e1b4b',
    glowIntensity: 1.80,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let cores = []; // array of { mesh, geometry, material, phase, tilt }
  let filaments = []; // array of { line, geom, mat, idxA, idxB, posArr, colArr }
  let stardust = null;
  let stardustGeom = null;
  let stardustMat = null;
  let stardustVelocities = null;

  let atmosphere = null;
  let atmosphereGeom = null;
  let atmosphereMat = null;

  let virtualTime = 0;
  let coalesceTimer = 0;

  const color1RGB = new THREE.Color(currentParams.color1);
  const color2RGB = new THREE.Color(currentParams.color2);
  const color3RGB = new THREE.Color(currentParams.color3);
  const color4RGB = new THREE.Color(currentParams.color4);
  const veilRGB = new THREE.Color(currentParams.veilColor);
  const coreColors = [color1RGB, color2RGB, color3RGB, color4RGB];

  function buildSynthesis() {
    // 1. Dispose previous objects
    for (const c of cores) {
      group.remove(c.mesh);
      c.geometry.dispose();
      c.material.dispose();
    }
    cores = [];

    for (const f of filaments) {
      group.remove(f.line);
      f.geom.dispose();
      f.mat.dispose();
    }
    filaments = [];

    if (stardust) {
      group.remove(stardust);
      stardustGeom.dispose();
      stardustMat.dispose();
      stardust = null;
    }

    if (atmosphere) {
      group.remove(atmosphere);
      atmosphereGeom.dispose();
      atmosphereMat.dispose();
      atmosphere = null;
    }

    const envR = Number(currentParams.envelopeRadius) || 1.60;
    const coreR = Number(currentParams.coreRadius) || 0.38;
    const filamentLimit = parseInt(currentParams.filamentCount, 10) || 6;
    const dustCount = parseInt(currentParams.stardustDensity, 10) || 64;
    const size = renderer?.getSize ? renderer.getSize(new THREE.Vector2()) : new THREE.Vector2(1024, 768);

    // 2. Build 4 Luminous Fluid Cores
    const sphereGeom = new THREE.SphereGeometry(1.0, 32, 32);
    const tilts = [0.25, -0.35, 0.45, -0.15];
    const phases = [0.0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: CORE_VERTEX_SHADER,
        fragmentShader: CORE_FRAGMENT_SHADER,
        uniforms: {
          uRadius: { value: coreR },
          uColor: { value: coreColors[i] },
          uGlow: { value: Number(currentParams.glowIntensity) || 1.8 },
          uPulse: { value: 0.0 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(sphereGeom, mat);
      group.add(mesh);

      cores.push({
        mesh,
        geometry: sphereGeom,
        material: mat,
        phase: phases[i],
        tilt: tilts[i],
        position: new THREE.Vector3(),
      });
    }

    // 3. Build Gravitational Connection Filaments between pairs
    const pairs = [
      [0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3],
    ];

    const activePairs = pairs.slice(0, Math.min(pairs.length, filamentLimit));
    for (const [a, b] of activePairs) {
      const posArr = new Float32Array((FILAMENT_SEGMENTS + 1) * 3);
      const colArr = new Float32Array((FILAMENT_SEGMENTS + 1) * 3);

      const geom = new LineGeometry();
      geom.setPositions(posArr);
      geom.setColors(colArr);

      const mat = new LineMaterial({
        vertexColors: true,
        linewidth: 1.8,
        resolution: size,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const line = new Line2(geom, mat);
      line.computeLineDistances();
      group.add(line);

      filaments.push({
        line,
        geom,
        mat,
        idxA: a,
        idxB: b,
        posArr,
        colArr,
      });
    }

    // 4. Build Ethereal Stardust Particle Cloud
    const dustPositions = new Float32Array(dustCount * 3);
    const dustColors = new Float32Array(dustCount * 3);
    stardustVelocities = new Float32Array(dustCount * 3);

    for (let i = 0; i < dustCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = envR * (0.4 + 0.55 * Math.cbrt(Math.random()));

      dustPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      dustPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      dustPositions[i * 3 + 2] = r * Math.cos(phi);

      stardustVelocities[i * 3] = (Math.random() - 0.5) * 0.2;
      stardustVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
      stardustVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.2;

      const c = coreColors[i % 4];
      dustColors[i * 3] = c.r;
      dustColors[i * 3 + 1] = c.g;
      dustColors[i * 3 + 2] = c.b;
    }

    stardustGeom = new THREE.BufferGeometry();
    stardustGeom.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    stardustGeom.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));

    stardustMat = new THREE.PointsMaterial({
      size: 2.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    stardust = new THREE.Points(stardustGeom, stardustMat);
    group.add(stardust);

    // 5. Build Celestial Envelope Shell
    atmosphereGeom = new THREE.SphereGeometry(envR, 48, 48);
    atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: VEIL_VERTEX_SHADER,
      fragmentShader: VEIL_FRAGMENT_SHADER,
      uniforms: {
        uVeilColor: { value: veilRGB },
        uGlow: { value: Number(currentParams.glowIntensity) || 1.8 },
        uBreathe: { value: 0.0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    atmosphere = new THREE.Mesh(atmosphereGeom, atmosphereMat);
    group.add(atmosphere);
  }

  buildSynthesis();

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      const speed = Number(currentParams.orbitSpeed) || 0.55;
      virtualTime += delta * speed;

      // Handle coalesce decay on pulse
      if (coalesceTimer > 0) {
        coalesceTimer = Math.max(0, coalesceTimer - delta * 1.5);
      }
      const coalesceNorm = coalesceTimer / Math.max(0.1, Number(currentParams.coalesceSurge) || 1.4);

      // Coalescence collapses separation toward center, then pulses
      const baseSpread = Number(currentParams.orbitSpread) || 0.75;
      const breathe = Math.sin(virtualTime * 2.0) * (Number(currentParams.breatheAmp) || 0.035);
      const effectiveSpread = baseSpread * (1.0 - coalesceNorm * 0.85) * (1.0 + breathe);

      // 1. Calculate and update 4-core orbital positions (harmonious figure-8 rosette)
      for (let i = 0; i < cores.length; i++) {
        const c = cores[i];
        const angle = virtualTime + c.phase;

        const x = effectiveSpread * Math.cos(angle);
        const y = effectiveSpread * Math.sin(angle * 1.5 + c.tilt) * 0.85;
        const z = effectiveSpread * Math.sin(angle) * Math.cos(c.tilt);

        c.position.set(x, y, z);
        c.mesh.position.copy(c.position);

        if (c.material) {
          c.material.uniforms.uPulse.value = coalesceNorm;
        }
      }

      // 2. Update dynamic gravitational filaments between cores
      const tension = Number(currentParams.fusionTension) || 0.65;
      const tempP = new THREE.Vector3();

      for (const f of filaments) {
        const posA = cores[f.idxA].position;
        const posB = cores[f.idxB].position;
        const dist = posA.distanceTo(posB);

        // Midpoint slightly drawn toward center of mass (gravitational curve)
        const midPoint = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
        midPoint.multiplyScalar(Math.max(0.2, 1.0 - tension * 0.25));

        const colA = coreColors[f.idxA];
        const colB = coreColors[f.idxB];

        for (let s = 0; s <= FILAMENT_SEGMENTS; s++) {
          const t = s / FILAMENT_SEGMENTS;
          // Quadratic bezier interpolation between posA, midPoint, posB
          tempP.copy(posA).multiplyScalar((1 - t) * (1 - t))
            .addScaledVector(midPoint, 2 * (1 - t) * t)
            .addScaledVector(posB, t * t);

          f.posArr[s * 3] = tempP.x;
          f.posArr[s * 3 + 1] = tempP.y;
          f.posArr[s * 3 + 2] = tempP.z;

          // Color transition along filament
          const cr = colA.r * (1 - t) + colB.r * t;
          const cg = colA.g * (1 - t) + colB.g * t;
          const cb = colA.b * (1 - t) + colB.b * t;

          // Brighten near midpoint to simulate liquid bridge
          const bridgeBoost = (1.0 - Math.abs(t - 0.5) * 2.0) * (1.2 / Math.max(0.4, dist));
          f.colArr[s * 3] = cr * bridgeBoost;
          f.colArr[s * 3 + 1] = cg * bridgeBoost;
          f.colArr[s * 3 + 2] = cb * bridgeBoost;
        }

        f.geom.setPositions(f.posArr);
        f.geom.setColors(f.colArr);
        f.line.computeLineDistances();
      }

      // 3. Update stardust particles
      if (stardustGeom) {
        const positions = stardustGeom.attributes.position.array;
        for (let i = 0; i < positions.length / 3; i++) {
          positions[i * 3] += stardustVelocities[i * 3] * delta;
          positions[i * 3 + 1] += stardustVelocities[i * 3 + 1] * delta;
          positions[i * 3 + 2] += stardustVelocities[i * 3 + 2] * delta;

          // Re-contain particles inside atmosphere
          const pDist = Math.sqrt(
            positions[i * 3] ** 2 + positions[i * 3 + 1] ** 2 + positions[i * 3 + 2] ** 2
          );
          if (pDist > Number(currentParams.envelopeRadius) * 0.95) {
            positions[i * 3] *= 0.5;
            positions[i * 3 + 1] *= 0.5;
            positions[i * 3 + 2] *= 0.5;
          }
        }
        stardustGeom.attributes.position.needsUpdate = true;
      }

      // 4. Update atmosphere envelope
      if (atmosphereMat) {
        atmosphereMat.uniforms.uBreathe.value = breathe + coalesceNorm * 0.5;
      }
    },

    setParams(patch) {
      const needsRebuild =
        (patch.envelopeRadius !== undefined && patch.envelopeRadius !== currentParams.envelopeRadius) ||
        (patch.coreRadius !== undefined && patch.coreRadius !== currentParams.coreRadius) ||
        (patch.filamentCount !== undefined && patch.filamentCount !== currentParams.filamentCount) ||
        (patch.stardustDensity !== undefined && patch.stardustDensity !== currentParams.stardustDensity);

      Object.assign(currentParams, patch);

      if (patch.color1 !== undefined) color1RGB.set(patch.color1);
      if (patch.color2 !== undefined) color2RGB.set(patch.color2);
      if (patch.color3 !== undefined) color3RGB.set(patch.color3);
      if (patch.color4 !== undefined) color4RGB.set(patch.color4);
      if (patch.veilColor !== undefined) {
        veilRGB.set(patch.veilColor);
        if (atmosphereMat) atmosphereMat.uniforms.uVeilColor.value.copy(veilRGB);
      }

      if (patch.glowIntensity !== undefined) {
        for (const c of cores) {
          if (c.material) c.material.uniforms.uGlow.value = patch.glowIntensity;
        }
        if (atmosphereMat) atmosphereMat.uniforms.uGlow.value = patch.glowIntensity;
      }

      if (needsRebuild) {
        buildSynthesis();
      }
    },

    onPulse() {
      coalesceTimer = Number(currentParams.coalesceSurge) || 1.4;
    },

    onResize(width, height) {
      for (const f of filaments) {
        if (f.mat) f.mat.resolution.set(width, height);
      }
    },

    dispose() {
      scene.remove(group);
      for (const c of cores) {
        group.remove(c.mesh);
        c.geometry?.dispose();
        c.material?.dispose();
      }
      cores = [];
      for (const f of filaments) {
        group.remove(f.line);
        f.geom?.dispose();
        f.mat?.dispose();
      }
      filaments = [];
      if (stardust) {
        group.remove(stardust);
        stardustGeom?.dispose();
        stardustMat?.dispose();
        stardust = null;
      }
      if (atmosphere) {
        group.remove(atmosphere);
        atmosphereGeom?.dispose();
        atmosphereMat?.dispose();
        atmosphere = null;
      }
    },
  };
}
