import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  applyAcesToneMapping,
  createBloomPipeline,
  resetToneMapping,
} from '../shared/postprocessing.js';
import {
  createDoubleClickHandler,
  createPointerTracker,
} from '../shared/pointer.js';

const SPHERE_RADIUS = 8;
const MAX_PARTICLES = 30000;

const QUALITY_COUNTS = {
  High: 30000,
  Medium: 15000,
};

const MAX_ORBIT_POINTS = 256;

export function createLiquidParticlesEnhanced({ renderer, gui }) {
  const params = {
    quality: 'High',
    dpr: Math.min(window.devicePixelRatio, 2),
    particleColor: '#3dd8ff',
    particleSize: 1.1221,
    glowColor: '#061c2d',
    glowStrength: 1.1,
    bloomStrength: 1.25,
    bloomRadius: 0.48,
    bloomThreshold: 0.08,
    particleSpeed: 0.3,
    gravity: 0.00425,
    turbulence: 0.0301,
    sloshForce: 0.0393,
    pressure: 0.01767,
    targetDensity: 27,
    viscosity: 0.886,
    timeScale: 0.6,
    sphereRotationSpeed: 0.01728,
    pointerSloshStrength: 0.08,
    orbitPathBrightness: 4.0,
    orbitPathFade: 0.988,
    orbitPathWidth: 5.0,
    orbitMinDensity: 22,
  };

  const orbitNodes = Array.from({ length: MAX_ORBIT_POINTS }, () => ({
    x: 0,
    y: 0,
    z: 0,
    alpha: 0,
  }));
  let orbitWrite = 0;
  let orbitCount = 0;

  let activeParticleCount = QUALITY_COUNTS.High;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 24);

  renderer.setPixelRatio(params.dpr);
  renderer.setClearColor(0x000000, 1);
  applyAcesToneMapping(renderer);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const pointerTracker = createPointerTracker(renderer.domElement);
  const pointerWorld = new THREE.Vector3();
  const pointerDir = new THREE.Vector3();

  const bloom = createBloomPipeline(renderer, scene, camera, {
    strength: params.bloomStrength,
    radius: params.bloomRadius,
    threshold: params.bloomThreshold,
  });

  const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 64);
  const sphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(params.glowColor) },
      glowStrength: { value: params.glowStrength },
      uTime: { value: 0.0 },
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
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
        fresnel = pow(fresnel, 2.2);
        float pulse = 0.85 + sin(uTime * 2.4) * 0.15;
        gl_FragColor = vec4(glowColor, fresnel * glowStrength * pulse);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const boundarySphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  scene.add(boundarySphere);

  const particlesGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);

  let count = 0;
  while (count < MAX_PARTICLES) {
    const x = (Math.random() - 0.5) * 2 * (SPHERE_RADIUS - 0.5);
    const y = (Math.random() - 0.5) * 2 * (SPHERE_RADIUS - 0.5);
    const z = (Math.random() - 0.5) * 2 * (SPHERE_RADIUS - 0.5);

    if (x * x + y * y + z * z < (SPHERE_RADIUS - 0.5) ** 2 && y < 1.0) {
      positions[count * 3] = x;
      positions[count * 3 + 1] = y;
      positions[count * 3 + 2] = z;
      velocities[count * 3] = 0;
      velocities[count * 3 + 1] = 0;
      velocities[count * 3 + 2] = 0;
      sizes[count] = Math.random() * 0.8 + 0.3;
      count++;
    }
  }

  particlesGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3)
  );
  particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  particlesGeometry.setDrawRange(0, activeParticleCount);

  const particlesMaterial = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(params.particleColor) },
      sizeMultiplier: { value: params.particleSize },
    },
    vertexShader: `
      uniform float sizeMultiplier;
      attribute float size;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float depthScale = clamp(150.0 / -mvPosition.z, 0.4, 2.5);
        gl_PointSize = size * sizeMultiplier * depthScale;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 color;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float alpha = exp(-d * d * 12.0);
        gl_FragColor = vec4(color, alpha * 0.75);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const particleSystem = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(particleSystem);

  const orbitLineGeometry = new LineGeometry();
  const orbitLineMaterial = new LineMaterial({
    color: 0x00eeff,
    linewidth: params.orbitPathWidth,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  orbitLineMaterial.resolution.set(window.innerWidth, window.innerHeight);

  const orbitLine = new Line2(orbitLineGeometry, orbitLineMaterial);
  orbitLine.frustumCulled = false;
  orbitLine.visible = false;
  orbitLine.renderOrder = 10;
  particleSystem.add(orbitLine);

  function sampleOrbitPoint(x, y, z) {
    for (let i = 0; i < orbitCount; i++) {
      const idx = (orbitWrite - orbitCount + i + MAX_ORBIT_POINTS) % MAX_ORBIT_POINTS;
      orbitNodes[idx].alpha *= params.orbitPathFade;
    }

    orbitNodes[orbitWrite] = { x, y, z, alpha: 1.0 };
    orbitWrite = (orbitWrite + 1) % MAX_ORBIT_POINTS;
    orbitCount = Math.min(orbitCount + 1, MAX_ORBIT_POINTS);
  }

  function rebuildOrbitLine() {
    const positions = [];
    const colors = [];

    for (let i = 0; i < orbitCount; i++) {
      const idx = (orbitWrite - orbitCount + i + MAX_ORBIT_POINTS) % MAX_ORBIT_POINTS;
      const node = orbitNodes[idx];
      if (node.alpha < 0.02) continue;

      positions.push(node.x, node.y, node.z);

      const fade =
        node.alpha * (0.25 + (i / Math.max(orbitCount - 1, 1)) * 0.75);
      const b = params.orbitPathBrightness;
      colors.push(0.1 * fade * b, 0.85 * fade * b, 1.0 * fade * b);
    }

    if (positions.length >= 6) {
      orbitLineGeometry.setPositions(positions);
      orbitLineGeometry.setColors(colors);
      orbitLine.visible = true;
      orbitLine.computeLineDistances();
    } else {
      orbitLine.visible = false;
    }
  }

  function fadeOrbitPath(fade) {
    for (let i = 0; i < orbitCount; i++) {
      const idx = (orbitWrite - orbitCount + i + MAX_ORBIT_POINTS) % MAX_ORBIT_POINTS;
      orbitNodes[idx].alpha *= fade;
    }
    rebuildOrbitLine();
  }

  const GRID_SIZE = 1.0;
  const GRID_DIM = Math.ceil((SPHERE_RADIUS * 2) / GRID_SIZE);
  const GRID_DIM2 = GRID_DIM * GRID_DIM;
  const cellDensity = new Int32Array(GRID_DIM * GRID_DIM * GRID_DIM);

  function shakeLiquid(strength = 3.0) {
    for (let i = 0; i < activeParticleCount; i++) {
      velocities[i * 3] += (Math.random() - 0.5) * strength;
      velocities[i * 3 + 1] += Math.random() * strength;
      velocities[i * 3 + 2] += (Math.random() - 0.5) * strength;
    }
  }

  const doubleClick = createDoubleClickHandler(renderer.domElement, () => {
    shakeLiquid(6.0);
  });

  const sysFolder = gui.addFolder('System');
  sysFolder
    .add(params, 'quality', Object.keys(QUALITY_COUNTS))
    .name('Quality')
    .onChange((val) => {
      activeParticleCount = QUALITY_COUNTS[val];
      particlesGeometry.setDrawRange(0, activeParticleCount);
    });
  sysFolder
    .add(params, 'dpr', 0.5, 2.0, 0.1)
    .name('DPR')
    .onChange((val) => {
      renderer.setPixelRatio(val);
    });

  const folderVisuals = gui.addFolder('Visuals & Colors');
  folderVisuals
    .addColor(params, 'particleColor')
    .name('Particle Color')
    .onChange((val) => {
      particlesMaterial.uniforms.color.value.set(val);
    });
  folderVisuals
    .add(params, 'particleSize', 0.1, 5.0)
    .name('Particle Size')
    .onChange((val) => {
      particlesMaterial.uniforms.sizeMultiplier.value = val;
    });
  folderVisuals
    .addColor(params, 'glowColor')
    .name('Sphere Glow Color')
    .onChange((val) => {
      sphereMaterial.uniforms.glowColor.value.set(val);
    });
  folderVisuals
    .add(params, 'glowStrength', 0.0, 3.0)
    .name('Glow Strength')
    .onChange((val) => {
      sphereMaterial.uniforms.glowStrength.value = val;
    });
  folderVisuals
    .add(params, 'pointerSloshStrength', 0.0, 0.2, 0.005)
    .name('Pointer Slosh');

  const folderOrbit = gui.addFolder('Orbit Path');
  folderOrbit
    .add(params, 'orbitPathBrightness', 0.0, 10.0, 0.1)
    .name('Line Brightness');
  folderOrbit
    .add(params, 'orbitPathWidth', 1.0, 10.0, 0.5)
    .name('Line Width')
    .onChange((val) => {
      orbitLineMaterial.linewidth = val;
    });
  folderOrbit
    .add(params, 'orbitPathFade', 0.95, 0.999, 0.001)
    .name('Fade Speed');
  folderOrbit
    .add(params, 'orbitMinDensity', 10, 120, 1)
    .name('Min Blob Density');

  const folderBloom = gui.addFolder('Bloom Effect');
  folderBloom
    .add(params, 'bloomStrength', 0.0, 3.0)
    .name('Strength')
    .onChange((val) => {
      bloom.bloomPass.strength = val;
    });
  folderBloom
    .add(params, 'bloomRadius', 0.0, 1.0)
    .name('Radius')
    .onChange((val) => {
      bloom.bloomPass.radius = val;
    });
  folderBloom
    .add(params, 'bloomThreshold', 0.0, 1.0)
    .name('Threshold')
    .onChange((val) => {
      bloom.bloomPass.threshold = val;
    });

  const folderForces = gui.addFolder('Forces & Motion');
  folderForces.add(params, 'particleSpeed', 0.0, 1.0).name('Movement Speed');
  folderForces.add(params, 'gravity', 0, 0.05).name('Gravity');
  folderForces.add(params, 'turbulence', 0, 0.05).name('Turbulence');
  folderForces.add(params, 'sloshForce', 0, 0.1).name('Slosh Force');

  const folderLiquid = gui.addFolder('Liquid Volume');
  folderLiquid.add(params, 'pressure', 0, 0.03).name('Repulsion Pressure');
  folderLiquid.add(params, 'targetDensity', 1, 40, 1).name('Target Density');
  folderLiquid.add(params, 'viscosity', 0.8, 1.0).name('Viscosity');

  gui.add(params, 'sphereRotationSpeed', -0.01, 0.05).name('Rotation Speed');
  gui.add(params, 'timeScale', 0.1, 3.0).name('Time Scale');
  gui.add({ shake: () => shakeLiquid(3.0) }, 'shake').name('Shake Liquid!');

  const simClock = new THREE.Clock();
  const pressureSkipRadius = SPHERE_RADIUS * 0.55;
  const blobCentroid = new THREE.Vector3();

  function computeBlobCenter(posArray) {
    let maxDensity = 0;
    let bestCx = 0;
    let bestCy = 0;
    let bestCz = 0;

    for (let cz = 0; cz < GRID_DIM; cz++) {
      for (let cy = 0; cy < GRID_DIM; cy++) {
        for (let cx = 0; cx < GRID_DIM; cx++) {
          const density = cellDensity[cx + cy * GRID_DIM + cz * GRID_DIM2];
          if (density > maxDensity) {
            maxDensity = density;
            bestCx = cx;
            bestCy = cy;
            bestCz = cz;
          }
        }
      }
    }

    if (maxDensity < params.orbitMinDensity) {
      return null;
    }

    blobCentroid.set(0, 0, 0);
    let blobParticleCount = 0;

    for (let i = 0; i < activeParticleCount; i++) {
      const i3 = i * 3;
      const x = posArray[i3];
      const y = posArray[i3 + 1];
      const z = posArray[i3 + 2];

      let cx = Math.floor((x + SPHERE_RADIUS) / GRID_SIZE);
      let cy = Math.floor((y + SPHERE_RADIUS) / GRID_SIZE);
      let cz = Math.floor((z + SPHERE_RADIUS) / GRID_SIZE);

      if (
        Math.abs(cx - bestCx) <= 1 &&
        Math.abs(cy - bestCy) <= 1 &&
        Math.abs(cz - bestCz) <= 1
      ) {
        blobCentroid.x += x;
        blobCentroid.y += y;
        blobCentroid.z += z;
        blobParticleCount++;
      }
    }

    if (blobParticleCount < 8) {
      return null;
    }

    blobCentroid.multiplyScalar(1 / blobParticleCount);
    return blobCentroid;
  }

  return {
    update() {
      const time = simClock.getElapsedTime() * params.timeScale;
      sphereMaterial.uniforms.uTime.value = time;

      pointerDir.set(pointerTracker.pointer.x, pointerTracker.pointer.y, 0.5);
      pointerDir.unproject(camera);
      pointerDir.sub(camera.position).normalize();
      pointerWorld.copy(camera.position).addScaledVector(pointerDir, 18);

      const posAttr = particlesGeometry.attributes.position;
      const posArray = posAttr.array;

      cellDensity.fill(0);

      for (let i = 0; i < activeParticleCount; i++) {
        const i3 = i * 3;
        let cx = Math.floor((posArray[i3] + SPHERE_RADIUS) / GRID_SIZE);
        let cy = Math.floor((posArray[i3 + 1] + SPHERE_RADIUS) / GRID_SIZE);
        let cz = Math.floor((posArray[i3 + 2] + SPHERE_RADIUS) / GRID_SIZE);

        cx = Math.max(0, Math.min(GRID_DIM - 1, cx));
        cy = Math.max(0, Math.min(GRID_DIM - 1, cy));
        cz = Math.max(0, Math.min(GRID_DIM - 1, cz));

        cellDensity[cx + cy * GRID_DIM + cz * GRID_DIM2]++;
      }

      particleSystem.rotation.y += params.sphereRotationSpeed;
      boundarySphere.rotation.y += params.sphereRotationSpeed;

      const globalSloshX = Math.sin(time * 2.1) * params.sloshForce;
      const globalSloshY = Math.cos(time * 1.5) * (params.sloshForce * 0.3);
      const globalSloshZ = Math.sin(time * 1.8) * params.sloshForce;

      const pointerActive = pointerTracker.pointer.length() > 0.05;
      const sloshStrength = params.pointerSloshStrength;

      for (let i = 0; i < activeParticleCount; i++) {
        const i3 = i * 3;

        let x = posArray[i3];
        let y = posArray[i3 + 1];
        let z = posArray[i3 + 2];

        let vx = velocities[i3];
        let vy = velocities[i3 + 1];
        let vz = velocities[i3 + 2];

        let fx = 0;
        let fy = 0;
        let fz = 0;

        fy -= params.gravity;
        fx += globalSloshX;
        fy += globalSloshY;
        fz += globalSloshZ;
        fx += Math.sin(y * 0.5 + time) * params.turbulence;
        fy += Math.cos(z * 0.5 + time) * params.turbulence;
        fz += Math.sin(x * 0.5 + time) * params.turbulence;

        if (pointerActive) {
          const pdx = pointerWorld.x - x;
          const pdy = pointerWorld.y - y;
          const pdz = pointerWorld.z - z;
          const pdist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz) + 0.01;
          const pull = sloshStrength / pdist;
          fx += pdx * pull;
          fy += pdy * pull;
          fz += pdz * pull;
        }

        const distFromCenter = Math.sqrt(x * x + y * y + z * z);

        if (distFromCenter < pressureSkipRadius) {
          let cx = Math.floor((x + SPHERE_RADIUS) / GRID_SIZE);
          let cy = Math.floor((y + SPHERE_RADIUS) / GRID_SIZE);
          let cz = Math.floor((z + SPHERE_RADIUS) / GRID_SIZE);

          cx = Math.max(0, Math.min(GRID_DIM - 1, cx));
          cy = Math.max(0, Math.min(GRID_DIM - 1, cy));
          cz = Math.max(0, Math.min(GRID_DIM - 1, cz));

          const density = cellDensity[cx + cy * GRID_DIM + cz * GRID_DIM2];

          if (density > params.targetDensity) {
            const jitter = GRID_SIZE * 6.0;
            const cellX =
              cx * GRID_SIZE -
              SPHERE_RADIUS +
              GRID_SIZE * 0.5 +
              (Math.random() - 0.5) * jitter;
            const cellY =
              cy * GRID_SIZE -
              SPHERE_RADIUS +
              GRID_SIZE * 0.5 +
              (Math.random() - 0.5) * jitter;
            const cellZ =
              cz * GRID_SIZE -
              SPHERE_RADIUS +
              GRID_SIZE * 0.5 +
              (Math.random() - 0.5) * jitter;

            let dx = x - cellX;
            let dy = y - cellY;
            let dz = z - cellZ;

            if (dx === 0 && dy === 0 && dz === 0) {
              dx = (Math.random() - 0.5) * 0.01;
              dy = (Math.random() - 0.5) * 0.01;
              dz = (Math.random() - 0.5) * 0.01;
            }

            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
            const force =
              ((density - params.targetDensity) * params.pressure) / dist;

            fx += dx * force;
            fy += dy * force;
            fz += dz * force;
          }
        }

        vx += fx * params.particleSpeed;
        vy += fy * params.particleSpeed;
        vz += fz * params.particleSpeed;

        vx *= params.viscosity;
        vy *= params.viscosity;
        vz *= params.viscosity;

        x += vx;
        y += vy;
        z += vz;

        const newDist = Math.sqrt(x * x + y * y + z * z);

        if (newDist > SPHERE_RADIUS) {
          const nx = x / newDist;
          const ny = y / newDist;
          const nz = z / newDist;
          const dot = vx * nx + vy * ny + vz * nz;

          vx = vx - 1.5 * dot * nx;
          vy = vy - 1.5 * dot * ny;
          vz = vz - 1.5 * dot * nz;

          const clampRadius = SPHERE_RADIUS - 0.01;
          x = nx * clampRadius;
          y = ny * clampRadius;
          z = nz * clampRadius;
        }

        posArray[i3] = x;
        posArray[i3 + 1] = y;
        posArray[i3 + 2] = z;
        velocities[i3] = vx;
        velocities[i3 + 1] = vy;
        velocities[i3 + 2] = vz;
      }

      posAttr.needsUpdate = true;

      const blobCenter = computeBlobCenter(posArray);
      if (blobCenter) {
        sampleOrbitPoint(blobCenter.x, blobCenter.y, blobCenter.z);
        rebuildOrbitLine();
      } else {
        fadeOrbitPath(0.92);
      }

      controls.update();
      bloom.render();
    },

    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      bloom.resize(window.innerWidth, window.innerHeight);
      orbitLineMaterial.resolution.set(window.innerWidth, window.innerHeight);
    },

    dispose() {
      pointerTracker.dispose();
      doubleClick.dispose();
      controls.dispose();
      bloom.dispose();
      resetToneMapping(renderer);
      sphereMaterial.dispose();
      sphereGeometry.dispose();
      particlesMaterial.dispose();
      particlesGeometry.dispose();
      orbitLineGeometry.dispose();
      orbitLineMaterial.dispose();
      scene.clear();
    },
  };
}
