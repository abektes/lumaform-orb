import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createPhaseTracker } from '../core/phase.js';

export function createHopfEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    color1: '#ffed00', // Electric canary core fiber
    color2: '#a855f7', // Violet outer toroidal shell
    accentColor: '#00f2fe', // Streamline cyan highlight
    glowIntensity: 1.5,
    fiberCount: 32,
    torusRadius: 1.75,
    tubeRadius: 0.85,
    lineWidth: 2.8,
    cliffordSpeed: 0.70,
    flowSpeed: 1.2,
    twistHarmonics: 2.0,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const SAMPLES_PER_FIBER = 72;
  const activeFiberCount = currentParams.fiberCount;

  // Fiber Line2 Objects
  const fiberMeshes = [];
  const fiberGeometries = [];
  const fiberMaterials = [];

  for (let f = 0; f < activeFiberCount; f++) {
    const geom = new LineGeometry();
    const pos = new Float32Array(SAMPLES_PER_FIBER * 3);
    const col = new Float32Array(SAMPLES_PER_FIBER * 3);
    geom.setPositions(pos);
    geom.setColors(col);

    const mat = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      linewidth: currentParams.lineWidth,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mat.resolution.set(window.innerWidth, window.innerHeight);

    const mesh = new Line2(geom, mat);
    mesh.renderOrder = 1;
    group.add(mesh);

    fiberMeshes.push(mesh);
    fiberGeometries.push(geom);
    fiberMaterials.push(mat);
  }

  // Streaming Photon Particles along the fibers
  const TOTAL_PARTICLES = activeFiberCount * 8;
  const particleGeom = new THREE.BufferGeometry();
  const particlePos = new Float32Array(TOTAL_PARTICLES * 3);
  const particleCol = new Float32Array(TOTAL_PARTICLES * 3);
  const particleSizes = new Float32Array(TOTAL_PARTICLES);

  for (let i = 0; i < TOTAL_PARTICLES; i++) {
    particleSizes[i] = Math.random() * 0.8 + 0.6;
  }
  particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  particleGeom.setAttribute('color', new THREE.BufferAttribute(particleCol, 3));
  particleGeom.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

  const particleMat = new THREE.ShaderMaterial({
    uniforms: {
      sizeMultiplier: { value: 1.8 },
    },
    vertexShader: `
      uniform float sizeMultiplier;
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float depthScale = clamp(260.0 / -mvPosition.z, 0.5, 3.0);
        gl_PointSize = size * sizeMultiplier * depthScale;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d2 = dot(uv, uv);
        if (d2 > 0.25) discard;
        float a = exp(-d2 * 18.0);
        gl_FragColor = vec4(vColor, a * 0.9);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const particleSystem = new THREE.Points(particleGeom, particleMat);
  particleSystem.renderOrder = 2;
  group.add(particleSystem);

  // Central Core Halo
  const coreGeom = new THREE.SphereGeometry(0.4, 32, 32);
  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(currentParams.color1) },
      // Accumulated, not `time * 2.5` — see the note in src/core/phase.js.
      uPulsePhase: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float uPulsePhase;
      varying vec3 vNormal;
      void main() {
        float f = pow(1.0 - abs(vNormal.z), 2.5);
        float pulse = 0.85 + 0.15 * sin(uPulsePhase);
        gl_FragColor = vec4(color, f * 0.55 * pulse);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreMesh = new THREE.Mesh(coreGeom, coreMat);
  coreMesh.renderOrder = 0;
  group.add(coreMesh);

  let clickBoost = 0;
  const phaseTracker = createPhaseTracker();

  // Compute a point on the Hopf fibration stereographic projection
  // eta: toroidal parameter [0, pi/2]
  // xi1, xi2: fiber angle parameters
  function computeHopfPoint(eta, xi1, xi2, R, r) {
    // Coordinates in S^3
    const q0 = Math.cos(eta) * Math.cos(xi1);
    const q1 = Math.cos(eta) * Math.sin(xi1);
    const q2 = Math.sin(eta) * Math.cos(xi2);
    const q3 = Math.sin(eta) * Math.sin(xi2);

    // Stereographic projection S^3 -> R^3: (q0, q1, q2) / (1 - q3)
    const denom = Math.max(1.0 - q3 * 0.65, 0.25);
    const scale = R / denom;

    const x = q0 * scale;
    const y = q1 * scale;
    const z = q2 * (scale * 0.85);

    return { x, y, z };
  }

  return {
    // World radius this engine occupies, so OrbStudio can frame every engine at
    // the same fraction of the viewport instead of a shared fixed distance.
    // Villarceau fibre bundle at default fibre count.
    frame: { radius: 2.3 },
    update({ time }) {
      clickBoost *= 0.94;
      phaseTracker.advance(time);
      coreMat.uniforms.uPulsePhase.value = phaseTracker.phase('pulse', 2.5);

      const R = currentParams.torusRadius;
      const r = currentParams.tubeRadius;
      const cliffordPhase = time * currentParams.cliffordSpeed + clickBoost * 1.5;
      const streamVelocity = time * currentParams.flowSpeed;

      const c1 = new THREE.Color(currentParams.color1);
      const c2 = new THREE.Color(currentParams.color2);
      const cAccent = new THREE.Color(currentParams.accentColor);
      const glow = currentParams.glowIntensity;

      let particleIdx = 0;
      const pPosArr = particlePos;
      const pColArr = particleCol;

      // Update each Villarceau fiber circle
      for (let f = 0; f < activeFiberCount; f++) {
        const fiberRatio = f / activeFiberCount;
        // Clifford 4D translation shifts eta and xi
        const eta = (Math.PI / 4) + Math.sin(cliffordPhase * 0.8 + fiberRatio * Math.PI * 2) * 0.25;
        const xi2Base = fiberRatio * Math.PI * 2 + cliffordPhase;

        const geom = fiberGeometries[f];
        const posArr = geom.attributes.instanceStart ? geom.attributes.instanceStart.data.array : null;

        const fiberPts = [];
        const fiberCols = [];

        // Sample circle along parameter t
        for (let s = 0; s < SAMPLES_PER_FIBER; s++) {
          const t = (s / (SAMPLES_PER_FIBER - 1)) * Math.PI * 2;
          const xi1 = t;
          const xi2 = xi2Base + t * currentParams.twistHarmonics;

          const pt = computeHopfPoint(eta, xi1, xi2, R, r);
          fiberPts.push(pt.x, pt.y, pt.z);

          // Color gradient along the fiber and across tori
          const radialDist = Math.sqrt(pt.x * pt.x + pt.z * pt.z);
          const tRatio = Math.min(1.0, radialDist / (R * 1.4));
          const col = c1.clone().lerp(c2, tRatio).lerp(cAccent, Math.sin(t * 3.0 + time) * 0.2 + 0.2);

          fiberCols.push(col.r * glow, col.g * glow, col.b * glow);

          // Spawn stream particles on every 9th sample
          if (s % 9 === 0 && particleIdx < TOTAL_PARTICLES) {
            const pFlowT = (t + streamVelocity) % (Math.PI * 2);
            const streamPt = computeHopfPoint(eta, pFlowT, xi2Base + pFlowT * currentParams.twistHarmonics, R, r);

            const pIdx3 = particleIdx * 3;
            pPosArr[pIdx3] = streamPt.x;
            pPosArr[pIdx3 + 1] = streamPt.y;
            pPosArr[pIdx3 + 2] = streamPt.z;

            pColArr[pIdx3] = cAccent.r * 2.0;
            pColArr[pIdx3 + 1] = cAccent.g * 2.0;
            pColArr[pIdx3 + 2] = cAccent.b * 2.0;
            particleIdx++;
          }
        }

        geom.setPositions(fiberPts);
        geom.setColors(fiberCols);
        fiberMeshes[f].computeLineDistances();
      }

      particleGeom.attributes.position.needsUpdate = true;
      particleGeom.attributes.color.needsUpdate = true;

      // Group precession
      group.rotation.y = time * 0.15;
      group.rotation.x = Math.sin(time * 0.1) * 0.18;
    },

    setParams(newParams) {
      Object.assign(currentParams, newParams);

      if (newParams.lineWidth !== undefined) {
        fiberMaterials.forEach(m => m.linewidth = newParams.lineWidth);
      }
      if (newParams.color1) {
        coreMat.uniforms.color.value.set(newParams.color1);
      }
    },

    onPulse() {
      clickBoost = 1.0;
    },

    onResize(width, height) {
      fiberMaterials.forEach(m => m.resolution.set(width, height));
    },

    dispose() {
      scene.remove(group);
      fiberGeometries.forEach(g => g.dispose());
      fiberMaterials.forEach(m => m.dispose());
      particleGeom.dispose();
      particleMat.dispose();
      coreGeom.dispose();
      coreMat.dispose();
    },
  };
}
