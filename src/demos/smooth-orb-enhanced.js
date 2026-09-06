import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  applyAcesToneMapping,
  createBloomPipeline,
  createFpsTracker,
  resetToneMapping,
} from '../shared/postprocessing.js';
import { createPointerTracker } from '../shared/pointer.js';

const CINEMATIC_PRESETS = {
  Aurora: {
    color1: '#00ffc8',
    color2: '#4466ff',
    aberration: 0.85,
    glowIntensity: 0.016,
  },
  Ember: {
    color1: '#ff6600',
    color2: '#ff2244',
    aberration: 0.55,
    glowIntensity: 0.018,
  },
  Void: {
    color1: '#8844ff',
    color2: '#110033',
    aberration: 1.1,
    glowIntensity: 0.012,
  },
};

export function createSmoothOrbEnhanced({ renderer, gui }) {
  const params = {
    preset: 'Aurora',
    dpr: 1.3,
    rotationSpeed: 1.0,
    sphereSpinSpeed: -0.65,
    fractalWarpSpeed: 0.0262,
    color1: '#00ffc8',
    color2: '#4466ff',
    aberration: 0.85,
    particleDensity: 0.021,
    sphereRadius: 2.15,
    edgeFade: 0.381,
    fractalScale: 0.7602,
    fractalMult: 2.196,
    glowIntensity: 0.016,
    atmosphereStrength: 0.35,
    bloomStrength: 0.65,
    bloomRadius: 0.4,
    bloomThreshold: 0.15,
  };

  Object.assign(params, CINEMATIC_PRESETS.Aurora);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 9.0);

  renderer.setPixelRatio(params.dpr);
  renderer.setClearColor(0x030304, 1);
  applyAcesToneMapping(renderer);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enableZoom = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = params.rotationSpeed;

  const pointerTracker = createPointerTracker(renderer.domElement);
  const fpsTracker = createFpsTracker();
  const smoothedPointer = new THREE.Vector2(0, 0);
  const smoothedWarp = { value: params.fractalWarpSpeed };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uResolution: {
        value: new THREE.Vector2(
          window.innerWidth * params.dpr,
          window.innerHeight * params.dpr
        ),
      },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: {
        value: camera.projectionMatrixInverse,
      },
      uColor1: { value: new THREE.Color(params.color1) },
      uColor2: { value: new THREE.Color(params.color2) },
      uSphereRadius: { value: params.sphereRadius },
      uEdgeFade: { value: params.edgeFade },
      uFractalScale: { value: params.fractalScale },
      uFractalMult: { value: params.fractalMult },
      uGlowIntensity: { value: params.glowIntensity },
      uFractalWarpSpeed: { value: params.fractalWarpSpeed },
      uSphereSpin: { value: 0.0 },
      uAberration: { value: params.aberration },
      uParticleDensity: { value: params.particleDensity },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uMarchQuality: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform float uSphereRadius;
      uniform float uEdgeFade;
      uniform float uFractalScale;
      uniform float uFractalMult;
      uniform float uGlowIntensity;
      uniform float uFractalWarpSpeed;
      uniform float uSphereSpin;
      uniform float uAberration;
      uniform float uParticleDensity;
      uniform vec2 uPointer;
      uniform float uMarchQuality;

      uniform mat4 cameraWorldMatrix;
      uniform mat4 cameraProjectionMatrixInverse;

      varying vec2 vUv;

      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float hash31(vec3 p3) {
        p3 = fract(p3 * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.12 - h);
      }

      vec3 palette(float t) {
        float blend = sin(t * 1.4) * 0.5 + 0.5;
        return mix(uColor1, uColor2, blend);
      }

      float map(vec3 p) {
        float d = 100.2;
        float scale = 0.4;
        p += vec3(12.600, 4.400, 5.569);

        for (int i = 1; i < 4; i++) {
          p.xy *= rot(uTime * uFractalWarpSpeed + 0.2);
          p.yz *= rot(uTime * (uFractalWarpSpeed * 1.5) - 0.1);
          float dotp = dot(sin(p), cos(p.zxy));
          float gyroid = sqrt(dotp * dotp + 0.055) - 0.137;
          d = smin(d, gyroid / abs(scale), 0.15);
          p *= uFractalScale;
          scale *= uFractalMult;
          p += vec3(-1.7, 1.2, 3.5);
        }
        return d;
      }

      vec2 intersectSphere(vec3 ro, vec3 rd, float r) {
        float b = dot(ro, rd);
        float c = dot(ro, ro) - r * r;
        float h = b * b - c;
        if (h < 0.0) return vec2(0.0);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      void main() {
        vec2 ndc = (vUv - 0.5) * 2.0;
        vec4 clipPos = vec4(ndc, -1.0, 1.0);
        vec4 viewPos = cameraProjectionMatrixInverse * clipPos;
        vec3 rd = normalize((cameraWorldMatrix * vec4(viewPos.xyz, 0.0)).xyz);
        vec3 ro = cameraPosition;

        mat2 spinRot = rot(uSphereSpin);
        ro.xz *= spinRot;
        rd.xz *= spinRot;

        vec2 hit = intersectSphere(ro, rd, uSphereRadius);

        if (hit.y <= 0.0) {
          gl_FragColor = vec4(-0.01, 0.01, 0.015, 1.0);
          return;
        }

        float pointerAberration = uAberration + length(uPointer) * 0.25;
        float phaseOffset = dot(uPointer, ndc.xy) * pointerAberration * 0.08;

        float tNear = max(0.0, hit.x);
        float tFar = hit.y;
        float t = tNear + hash(gl_FragCoord.xy) * 0.20;
        vec3 accumulatedGlow = vec3(0.0);
        int maxSteps = int(90.0 * uMarchQuality);

        for (int i = 0; i < 90; i++) {
          if (i >= maxSteps || t > tFar) break;

          vec3 p = ro + rd * t;
          float d = map(p);
          float distFromCenter = length(p);
          float fade = smoothstep(uSphereRadius, uSphereRadius - uEdgeFade, distFromCenter);
          float intensity = (uGlowIntensity / (abs(d) + 0.029)) * fade;

          float phase = length(p) * -0.4 - uTime * -0.1 + phaseOffset;
          vec3 holoColor;
          holoColor.r = palette(phase + pointerAberration * 0.1).r;
          holoColor.g = palette(phase).g;
          holoColor.b = palette(phase - pointerAberration * 0.1).b;

          accumulatedGlow += holoColor * intensity;

          vec3 pPos = p * 25.0 + vec3(uTime * 1.5, uTime * -2.0, uTime * 0.5);
          vec3 pCell = floor(pPos);
          vec3 pFract = fract(pPos) - 0.5;
          float isParticle = step(1.0 - uParticleDensity, hash31(pCell));
          float pDist = length(pFract);
          float pIntensity = 0.0015 / (pDist + 0.005);
          vec3 pColor = vec3(1.0) * pIntensity * isParticle * (intensity * 25.0);
          accumulatedGlow += pColor + (accumulatedGlow * pColor * 2.5);

          t += max(abs(d) * 0.7, 0.02);
        }

        if (hit.x > 0.0) {
          vec3 shellNormal = normalize(ro + rd * hit.x);
          float rimLight = 0.5 - max(0.0, dot(-rd, shellNormal));
          accumulatedGlow += vec3(0.2, 0.0, 0.6) * pow(rimLight, 4.0) * 0.3;
        }

        accumulatedGlow = accumulatedGlow / (1.3 + accumulatedGlow);
        accumulatedGlow = pow(accumulatedGlow, vec3(0.4545));
        gl_FragColor = vec4(accumulatedGlow, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  scene.add(mesh);

  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(params.color1) },
      glowStrength: { value: params.atmosphereStrength },
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
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.8);
        float innerFade = smoothstep(1.0, 0.82, max(dot(viewDir, normal), 0.0));
        gl_FragColor = vec4(glowColor, fresnel * innerFade * glowStrength);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const atmosphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(params.sphereRadius * 1.04, 64, 64),
    atmosphereMaterial
  );
  atmosphereMesh.renderOrder = 1;
  scene.add(atmosphereMesh);

  const bloom = createBloomPipeline(renderer, scene, camera, {
    strength: params.bloomStrength,
    radius: params.bloomRadius,
    threshold: params.bloomThreshold,
  });

  function applyPreset(name) {
    const preset = CINEMATIC_PRESETS[name];
    if (!preset) return;
    Object.assign(params, preset);
    material.uniforms.uColor1.value.set(params.color1);
    material.uniforms.uColor2.value.set(params.color2);
    material.uniforms.uAberration.value = params.aberration;
    material.uniforms.uGlowIntensity.value = params.glowIntensity;
    atmosphereMaterial.uniforms.glowColor.value.set(params.color1);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  const presetFolder = gui.addFolder('Cinematic Presets');
  presetFolder
    .add(params, 'preset', Object.keys(CINEMATIC_PRESETS))
    .name('Preset')
    .onChange(applyPreset);

  const sysFolder = gui.addFolder('System & Interaction');
  sysFolder
    .add(params, 'dpr', 0.5, 2.0, 0.1)
    .name('DPR (Pixel Ratio)')
    .onChange((val) => {
      renderer.setPixelRatio(val);
      material.uniforms.uResolution.value.set(
        window.innerWidth * val,
        window.innerHeight * val
      );
    });
  sysFolder
    .add(params, 'rotationSpeed', 0.0, 10.0)
    .name('Camera Orbit Speed')
    .onChange((val) => {
      controls.autoRotateSpeed = val;
    });
  sysFolder.add(params, 'sphereSpinSpeed', -5.0, 5.0).name('Fractal Spin Speed');

  const visFolder = gui.addFolder('Visuals');
  visFolder
    .addColor(params, 'color1')
    .name('Core Color')
    .onChange((val) => {
      material.uniforms.uColor1.value.set(val);
      atmosphereMaterial.uniforms.glowColor.value.set(val);
    });
  visFolder
    .addColor(params, 'color2')
    .name('Glow Color')
    .onChange((val) => {
      material.uniforms.uColor2.value.set(val);
    });
  visFolder
    .add(params, 'glowIntensity', 0.001, 0.02, 0.001)
    .name('Glow Intensity')
    .onChange((val) => {
      material.uniforms.uGlowIntensity.value = val;
    });
  visFolder
    .add(params, 'aberration', 0.0, 2.0)
    .name('Holo Aberration')
    .onChange((val) => {
      material.uniforms.uAberration.value = val;
    });
  visFolder
    .add(params, 'atmosphereStrength', 0.0, 1.0, 0.01)
    .name('Atmosphere Shell')
    .onChange((val) => {
      atmosphereMaterial.uniforms.glowStrength.value = val;
    });
  visFolder
    .add(params, 'particleDensity', 0.0, 0.1, 0.001)
    .name('Particle Density')
    .onChange((val) => {
      material.uniforms.uParticleDensity.value = val;
    });

  const bloomFolder = gui.addFolder('Bloom');
  bloomFolder
    .add(params, 'bloomStrength', 0.0, 2.0, 0.01)
    .name('Strength')
    .onChange((val) => {
      bloom.bloomPass.strength = val;
    });
  bloomFolder
    .add(params, 'bloomRadius', 0.0, 1.0, 0.01)
    .name('Radius')
    .onChange((val) => {
      bloom.bloomPass.radius = val;
    });
  bloomFolder
    .add(params, 'bloomThreshold', 0.0, 1.0, 0.01)
    .name('Threshold')
    .onChange((val) => {
      bloom.bloomPass.threshold = val;
    });

  const shapeFolder = gui.addFolder('Fractal Architecture');
  shapeFolder
    .add(params, 'sphereRadius', 0.5, 8.0)
    .name('Sphere Bounds')
    .onChange((val) => {
      material.uniforms.uSphereRadius.value = val;
      atmosphereMesh.geometry.dispose();
      atmosphereMesh.geometry = new THREE.SphereGeometry(val * 1.04, 64, 64);
    });
  shapeFolder
    .add(params, 'edgeFade', 0.0, 3.0)
    .name('Edge Transparency')
    .onChange((val) => {
      material.uniforms.uEdgeFade.value = val;
    });
  shapeFolder
    .add(params, 'fractalWarpSpeed', 0.0, 0.1)
    .name('Warp Speed')
    .onChange((val) => {
      params.fractalWarpSpeed = val;
    });
  shapeFolder
    .add(params, 'fractalScale', 0.1, 1.5)
    .name('Domain Scale')
    .onChange((val) => {
      material.uniforms.uFractalScale.value = val;
    });
  shapeFolder
    .add(params, 'fractalMult', 1.0, 5.0)
    .name('Iteration Multiplier')
    .onChange((val) => {
      material.uniforms.uFractalMult.value = val;
    });

  return {
    update(elapsed) {
      fpsTracker.tick();
      material.uniforms.uMarchQuality.value = fpsTracker.getMarchQuality(params.dpr);

      smoothedPointer.lerp(pointerTracker.pointer, 0.08);
      material.uniforms.uPointer.value.copy(smoothedPointer);

      const targetWarp =
        params.fractalWarpSpeed + smoothedPointer.length() * 0.012;
      smoothedWarp.value += (targetWarp - smoothedWarp.value) * 0.05;
      material.uniforms.uFractalWarpSpeed.value = smoothedWarp.value;

      material.uniforms.uTime.value = elapsed;
      material.uniforms.uSphereSpin.value = elapsed * params.sphereSpinSpeed;

      controls.update();
      material.uniforms.cameraWorldMatrix.value.copy(camera.matrixWorld);
      material.uniforms.cameraProjectionMatrixInverse.value.copy(
        camera.projectionMatrixInverse
      );

      bloom.render();
    },

    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      bloom.resize(window.innerWidth, window.innerHeight);

      const dpr = renderer.getPixelRatio();
      material.uniforms.uResolution.value.set(
        window.innerWidth * dpr,
        window.innerHeight * dpr
      );
    },

    dispose() {
      pointerTracker.dispose();
      controls.dispose();
      bloom.dispose();
      resetToneMapping(renderer);
      material.dispose();
      atmosphereMaterial.dispose();
      mesh.geometry.dispose();
      atmosphereMesh.geometry.dispose();
      scene.clear();
    },
  };
}
