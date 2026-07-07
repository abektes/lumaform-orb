import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const PARTICLE_COUNT = 30000;
const SPHERE_RADIUS = 8;

export function createLiquidParticles({ renderer, gui }) {
  const params = {
    dpr: Math.min(window.devicePixelRatio, 2),
    particleColor: '#3dd8ff',
    particleSize: 1.1221,
    glowColor: '#061c2d',
    glowStrength: 0.8,
    bloomStrength: 1.14,
    bloomRadius: 0.393,
    bloomThreshold: 0.1,
    particleSpeed: 0.3,
    gravity: 0.00425,
    turbulence: 0.0301,
    sloshForce: 0.0393,
    pressure: 0.01767,
    targetDensity: 27,
    viscosity: 0.886,
    timeScale: 0.6,
    sphereRotationSpeed: 0.01728,
  };

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

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    params.bloomStrength,
    params.bloomRadius,
    params.bloomThreshold
  );

  const composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 64);
  const sphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(params.glowColor) },
      glowStrength: { value: params.glowStrength },
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
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
        fresnel = pow(fresnel, 2.5);
        gl_FragColor = vec4(glowColor, fresnel * glowStrength);
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
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);

  let count = 0;
  while (count < PARTICLE_COUNT) {
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
        gl_PointSize = size * sizeMultiplier * (150.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 color;

      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.1, d);
        gl_FragColor = vec4(color, alpha * 0.6);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const particleSystem = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(particleSystem);

  const GRID_SIZE = 1.0;
  const GRID_DIM = Math.ceil((SPHERE_RADIUS * 2) / GRID_SIZE);
  const GRID_DIM2 = GRID_DIM * GRID_DIM;
  const cellDensity = new Int32Array(GRID_DIM * GRID_DIM * GRID_DIM);

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

  const folderBloom = gui.addFolder('Bloom Effect');
  folderBloom
    .add(params, 'bloomStrength', 0.0, 3.0)
    .name('Strength')
    .onChange((val) => {
      bloomPass.strength = val;
    });
  folderBloom
    .add(params, 'bloomRadius', 0.0, 1.0)
    .name('Radius')
    .onChange((val) => {
      bloomPass.radius = val;
    });
  folderBloom
    .add(params, 'bloomThreshold', 0.0, 1.0)
    .name('Threshold')
    .onChange((val) => {
      bloomPass.threshold = val;
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
  gui.add(
    {
      shake: () => {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          velocities[i * 3] += (Math.random() - 0.5) * 3.0;
          velocities[i * 3 + 1] += Math.random() * 3.0;
          velocities[i * 3 + 2] += (Math.random() - 0.5) * 3.0;
        }
      },
    },
    'shake'
  ).name('Shake Liquid!');

  const simClock = new THREE.Clock();

  return {
    update() {
      const time = simClock.getElapsedTime() * params.timeScale;
      const posAttr = particlesGeometry.attributes.position;
      const posArray = posAttr.array;

      cellDensity.fill(0);

      for (let i = 0; i < PARTICLE_COUNT; i++) {
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

      for (let i = 0; i < PARTICLE_COUNT; i++) {
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
          const force = ((density - params.targetDensity) * params.pressure) / dist;

          fx += dx * force;
          fy += dy * force;
          fz += dz * force;
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

        const distFromCenter = Math.sqrt(x * x + y * y + z * z);

        if (distFromCenter > SPHERE_RADIUS) {
          const nx = x / distFromCenter;
          const ny = y / distFromCenter;
          const nz = z / distFromCenter;
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
      controls.update();
      composer.render();
    },

    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    },

    dispose() {
      controls.dispose();
      composer.dispose();
      bloomPass.dispose();
      sphereMaterial.dispose();
      sphereGeometry.dispose();
      particlesMaterial.dispose();
      particlesGeometry.dispose();
      scene.clear();
    },
  };
}
