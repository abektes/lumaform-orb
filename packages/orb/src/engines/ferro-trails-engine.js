import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createSoftDotTexture } from '../core/soft-dot.js';

const FRAME_RADIUS = 2.30;

// 3D Simplex noise in GLSL
const NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

// Ferrofluid Vertex Shader
const FERRO_VERTEX_SHADER = /* glsl */ `
  ${NOISE_GLSL}

  uniform float uTime;
  uniform float uCoreRadius;
  uniform float uOvalRatio;
  uniform float uMagneticSpikes;
  uniform float uSpikeFrequency;
  uniform float uFluidViscosity;
  uniform float uBreatheAmp;
  uniform float uPulse;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying float vDisplacement;

  float getFerroDisp(vec3 n) {
    vec3 coord1 = n * uSpikeFrequency + vec3(0.0, uTime * uFluidViscosity * 0.45, 0.0);
    float n1 = snoise(coord1);

    vec3 coord2 = n * (uSpikeFrequency * 1.85) - vec3(uTime * uFluidViscosity * 0.65, 0.0, n1 * 0.35);
    float n2 = snoise(coord2);

    // Power sharpening creates characteristic liquid magnetic ferrofluid spikes
    float raw = n1 * 0.65 + n2 * 0.35 + 0.22;
    float peak = pow(max(0.0, raw), 2.2) * (uMagneticSpikes + uPulse * 0.25);
    float breath = sin(uTime * 1.8) * uBreatheAmp;
    return peak + breath;
  }

  void main() {
    vec3 norm = normalize(position);
    float disp = getFerroDisp(norm);

    // Shape into prolate oval or spherical shell
    vec3 baseShape = vec3(norm.x, norm.y * uOvalRatio, norm.z);
    vec3 displacedPosition = baseShape * (uCoreRadius * (1.0 + disp));

    // Analytical normal via finite differences along tangent plane
    float eps = 0.014;
    vec3 tangent1 = normalize(cross(norm, vec3(0.0, 1.0, 0.001)));
    vec3 tangent2 = cross(norm, tangent1);

    vec3 normA = normalize(norm + tangent1 * eps);
    vec3 normB = normalize(norm + tangent2 * eps);

    float dispA = getFerroDisp(normA);
    float dispB = getFerroDisp(normB);

    vec3 posA = vec3(normA.x, normA.y * uOvalRatio, normA.z) * (uCoreRadius * (1.0 + dispA));
    vec3 posB = vec3(normB.x, normB.y * uOvalRatio, normB.z) * (uCoreRadius * (1.0 + dispB));

    vec3 calcNormal = normalize(cross(posA - displacedPosition, posB - displacedPosition));
    if (dot(calcNormal, norm) < 0.0) calcNormal = -calcNormal;

    vNormal = normalMatrix * calcNormal;
    vDisplacement = disp;

    vec4 worldPos = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPosition = worldPos.xyz;

    vec4 mvPosition = viewMatrix * worldPos;
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Ferrofluid Fragment Shader
const FERRO_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColorLiquid;
  uniform vec3 uColorCrest;
  uniform vec3 uColorCore;
  uniform float uGlowIntensity;
  uniform float uPulse;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying float vDisplacement;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);

    float NdotV = clamp(dot(N, V), 0.0, 1.0);

    // Multi-light specular highlights (viscous metallic sheen)
    vec3 L1 = normalize(vec3(0.7, 0.9, 1.0));
    vec3 H1 = normalize(L1 + V);
    float spec1 = pow(max(0.0, dot(N, H1)), 40.0);

    vec3 L2 = normalize(vec3(-0.8, -0.5, 0.7));
    vec3 H2 = normalize(L2 + V);
    float spec2 = pow(max(0.0, dot(N, H2)), 24.0);

    // Fresnel rim reflection
    float fresnel = pow(1.0 - NdotV, 2.6);

    // Magnetic crest glow concentration
    float crestFactor = smoothstep(0.03, 0.28, vDisplacement);

    // Subsurface glow through thin crest regions
    vec3 liquidBody = mix(uColorLiquid, uColorCrest, crestFactor * 0.75 + uPulse * 0.15);
    vec3 crestEmission = uColorCrest * (crestFactor * 1.6 + uPulse * 0.8);
    vec3 specularLight = (uColorCrest * spec1 * 1.8 + vec3(spec2 * 0.5));
    vec3 rimLight = mix(uColorCrest, uColorCore, 0.3) * fresnel * 1.4;

    vec3 finalColor = (liquidBody + crestEmission + specularLight + rimLight) * uGlowIntensity;
    float alpha = clamp(0.78 + fresnel * 0.22 + crestFactor * 0.25, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// Circular particle texture helper (guarded for Node.js test environment)
// World units, as PointsMaterial reads `size` with its default attenuation.
// These were 7 (pulsing to 12) and 4.5 as if they were pixels, which drew each
// head wider than the whole orb; point-size.test.mjs measures them against it.
const HEAD_SIZE = 0.16;
const HEAD_PULSE = 0.12;
const MOTE_SIZE = 0.1;

export function createFerroTrailsEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    ovalRatio: 1.25,
    coreRadius: 1.35,
    trailCount: 12,
    trailDetail: 90,
    particleMotes: 64,

    arcCurvature: 0.85,
    trailSweepSpeed: 0.65,
    magneticSpikes: 0.16,
    spikeFrequency: 3.2,
    fluidViscosity: 0.9,
    breatheAmp: 0.035,
    pulseSurge: 1.5,

    colorLiquid: '#0b1021',
    colorCrest: '#00f0ff',
    colorTrail1: '#38bdf8',
    colorTrail2: '#a855f7',
    colorCore: '#ffffff',
    glowIntensity: 1.8,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let ferroMesh = null;
  let ferroGeometry = null;
  let ferroMaterial = null;

  let sparkMesh = null;
  let sparkGeometry = null;
  let sparkMaterial = null;

  let trails = []; // Array of { line, geom, mat, posArr, colArr, inclination, azimuth, dir, tilt, phase }
  let headsPoints = null;
  let headsGeometry = null;
  let headsMaterial = null;

  let motesPoints = null;
  let motesGeometry = null;
  let motesMaterial = null;
  let motesSeeds = [];

  let circleTexture = null;

  let virtualTime = 0;
  let pulseTimer = 0;

  const colorLiquidRGB = new THREE.Color(currentParams.colorLiquid);
  const colorCrestRGB = new THREE.Color(currentParams.colorCrest);
  const colorTrail1RGB = new THREE.Color(currentParams.colorTrail1);
  const colorTrail2RGB = new THREE.Color(currentParams.colorTrail2);
  const colorCoreRGB = new THREE.Color(currentParams.colorCore);

  function buildEngine() {
    // 1. Clean up existing objects
    if (ferroMesh) {
      group.remove(ferroMesh);
      ferroGeometry?.dispose();
      ferroMaterial?.dispose();
      ferroMesh = null;
    }
    if (sparkMesh) {
      group.remove(sparkMesh);
      sparkGeometry?.dispose();
      sparkMaterial?.dispose();
      sparkMesh = null;
    }
    for (const t of trails) {
      group.remove(t.line);
      t.geom?.dispose();
      t.mat?.dispose();
    }
    trails = [];

    if (headsPoints) {
      group.remove(headsPoints);
      headsGeometry?.dispose();
      headsMaterial?.dispose();
      headsPoints = null;
    }
    if (motesPoints) {
      group.remove(motesPoints);
      motesGeometry?.dispose();
      motesMaterial?.dispose();
      motesPoints = null;
    }

    const radius = Number(currentParams.coreRadius) || 1.35;
    const oval = Number(currentParams.ovalRatio) || 1.25;
    const trailCount = parseInt(currentParams.trailCount, 10) || 12;
    const trailDetail = parseInt(currentParams.trailDetail, 10) || 90;
    const moteCount = parseInt(currentParams.particleMotes, 10) || 64;
    const size = renderer?.getSize ? renderer.getSize(new THREE.Vector2()) : new THREE.Vector2(1024, 768);

    if (!circleTexture) {
      circleTexture = createSoftDotTexture();
    }

    // 2. Build Ferrofluid Ellipsoid
    ferroGeometry = new THREE.SphereGeometry(1.0, 80, 80);
    ferroMaterial = new THREE.ShaderMaterial({
      vertexShader: FERRO_VERTEX_SHADER,
      fragmentShader: FERRO_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0.0 },
        uCoreRadius: { value: radius },
        uOvalRatio: { value: oval },
        uMagneticSpikes: { value: Number(currentParams.magneticSpikes) || 0.16 },
        uSpikeFrequency: { value: Number(currentParams.spikeFrequency) || 3.2 },
        uFluidViscosity: { value: Number(currentParams.fluidViscosity) || 0.9 },
        uBreatheAmp: { value: Number(currentParams.breatheAmp) || 0.035 },
        uPulse: { value: 0.0 },
        uColorLiquid: { value: colorLiquidRGB },
        uColorCrest: { value: colorCrestRGB },
        uColorCore: { value: colorCoreRGB },
        uGlowIntensity: { value: Number(currentParams.glowIntensity) || 1.8 },
      },
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: true,
      side: THREE.FrontSide,
    });
    ferroMesh = new THREE.Mesh(ferroGeometry, ferroMaterial);
    group.add(ferroMesh);

    // 3. Build Inner Spark Core
    sparkGeometry = new THREE.SphereGeometry(radius * 0.32, 24, 24);
    sparkMaterial = new THREE.MeshBasicMaterial({
      color: colorCoreRGB,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    sparkMesh = new THREE.Mesh(sparkGeometry, sparkMaterial);
    sparkMesh.scale.set(1.0, oval, 1.0);
    group.add(sparkMesh);

    // 4. Build Sweeping Arc Trails (Sabo Sugi "Trails" style)
    for (let i = 0; i < trailCount; i++) {
      const posArr = new Float32Array((trailDetail + 1) * 3);
      const colArr = new Float32Array((trailDetail + 1) * 3);

      // Pre-populate initial colors with smooth gradient and tail alpha fade
      for (let s = 0; s <= trailDetail; s++) {
        const t = s / trailDetail; // 0 = head, 1 = tail
        const color = colorTrail1RGB.clone().lerp(colorTrail2RGB, t);
        const fade = (1.0 - t * 0.85); // Bright at head, fades toward tail
        colArr[s * 3] = color.r * fade;
        colArr[s * 3 + 1] = color.g * fade;
        colArr[s * 3 + 2] = color.b * fade;
      }

      const geom = new LineGeometry();
      geom.setPositions(posArr);
      geom.setColors(colArr);

      const mat = new LineMaterial({
        vertexColors: true,
        linewidth: 2.6,
        resolution: size,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const line = new Line2(geom, mat);
      line.computeLineDistances();
      group.add(line);

      // Distribute orbits gracefully across the sphere/oval
      const phi = (i / trailCount) * Math.PI * 2;
      const inclination = ((i % 5) - 2) * 0.35 + 0.1;
      const dir = i % 2 === 0 ? 1 : -1;
      const tilt = 0.45 + (i % 3) * 0.2;
      const phase = (i * 1.618) % (Math.PI * 2);

      trails.push({
        line,
        geom,
        mat,
        posArr,
        colArr,
        inclination,
        azimuth: phi,
        dir,
        tilt,
        phase,
      });
    }

    // 5. Build Leading Particle Heads
    const headPositions = new Float32Array(trailCount * 3);
    headsGeometry = new THREE.BufferGeometry();
    headsGeometry.setAttribute('position', new THREE.BufferAttribute(headPositions, 3));
    const headsMatOptions = {
      color: colorTrail1RGB,
      size: HEAD_SIZE,
      map: circleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    };
    headsMaterial = new THREE.PointsMaterial(headsMatOptions);
    headsPoints = new THREE.Points(headsGeometry, headsMaterial);
    group.add(headsPoints);

    // 6. Build Ambient Magnetic Motes
    const motesPositions = new Float32Array(moteCount * 3);
    motesSeeds = [];
    for (let m = 0; m < moteCount; m++) {
      const u = Math.random() * Math.PI * 2;
      const v = (Math.random() - 0.5) * Math.PI;
      const dist = radius * (1.12 + Math.random() * 0.35);
      motesPositions[m * 3] = dist * Math.cos(v) * Math.cos(u);
      motesPositions[m * 3 + 1] = dist * Math.sin(v) * oval;
      motesPositions[m * 3 + 2] = dist * Math.cos(v) * Math.sin(u);
      motesSeeds.push({ u, v, dist, speed: 0.2 + Math.random() * 0.4 });
    }
    motesGeometry = new THREE.BufferGeometry();
    motesGeometry.setAttribute('position', new THREE.BufferAttribute(motesPositions, 3));
    const motesMatOptions = {
      color: colorCrestRGB,
      size: MOTE_SIZE,
      map: circleTexture,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    };
    motesMaterial = new THREE.PointsMaterial(motesMatOptions);
    motesPoints = new THREE.Points(motesGeometry, motesMaterial);
    group.add(motesPoints);
  }

  buildEngine();

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      const sweepRate = Number(currentParams.trailSweepSpeed) || 0.65;

      // Handle pulse surge decay
      if (pulseTimer > 0) {
        pulseTimer = Math.max(0, pulseTimer - delta * 2.0);
      }
      const maxPulse = Math.max(0.1, Number(currentParams.pulseSurge) || 1.5);
      const pulseNormalized = pulseTimer / maxPulse;

      // Advance virtual time with momentary pulse acceleration
      virtualTime += delta * (sweepRate + pulseNormalized * 0.4);

      // Update ferrofluid uniforms
      if (ferroMaterial) {
        ferroMaterial.uniforms.uTime.value = virtualTime;
        ferroMaterial.uniforms.uPulse.value = pulseNormalized;
      }

      // Update inner spark core breathing
      if (sparkMesh) {
        const oval = Number(currentParams.ovalRatio) || 1.25;
        const breath = 1.0 + Math.sin(virtualTime * 2.2) * 0.08 + pulseNormalized * 0.35;
        sparkMesh.scale.set(breath, breath * oval, breath);
      }

      // Update sweeping 3D arc trails
      const radius = Number(currentParams.coreRadius) || 1.35;
      const oval = Number(currentParams.ovalRatio) || 1.25;
      const curvature = Number(currentParams.arcCurvature) || 0.85;
      const trailDetail = parseInt(currentParams.trailDetail, 10) || 90;

      const headPosAttr = headsGeometry?.attributes.position;

      for (let i = 0; i < trails.length; i++) {
        const t = trails[i];
        const posArr = t.posArr;
        const sweepAngle = virtualTime * t.dir + t.azimuth;

        // Trace arc curve backwards from head (s=0) to tail (s=trailDetail)
        for (let s = 0; s <= trailDetail; s++) {
          const frac = s / trailDetail;
          // Arc angle extends behind the head
          const theta = sweepAngle - frac * (1.8 * curvature);
          const phi = t.inclination + Math.sin(theta * 2.0 + t.phase) * t.tilt * 0.45;

          // Arc radial lift: curves outward over the ferrofluid peaks
          const arcLift = Math.sin(frac * Math.PI) * (0.35 * curvature + pulseNormalized * 0.15);
          const r = radius * (1.08 + arcLift);

          // Sabo Sugi Z-bend undulation
          const zBend = Math.sin(theta * 3.0 + virtualTime) * (0.12 * curvature);

          const x = r * Math.cos(phi) * Math.cos(theta);
          const y = r * Math.sin(phi) * oval;
          const z = r * Math.cos(phi) * Math.sin(theta) + zBend;

          posArr[s * 3] = x;
          posArr[s * 3 + 1] = y;
          posArr[s * 3 + 2] = z;

          // If head, update head points
          if (s === 0 && headPosAttr) {
            headPosAttr.setXYZ(i, x, y, z);
          }
        }

        t.geom.setPositions(posArr);
      }

      if (headPosAttr) {
        headPosAttr.needsUpdate = true;
      }

      // Pulse head particle size
      if (headsMaterial) {
        headsMaterial.size = HEAD_SIZE + pulseNormalized * HEAD_PULSE;
      }

      // Update magnetic motes
      if (motesGeometry && motesSeeds.length > 0) {
        const posAttr = motesGeometry.attributes.position;
        for (let m = 0; m < motesSeeds.length; m++) {
          const seed = motesSeeds[m];
          seed.u += delta * seed.speed * 0.6;
          const x = seed.dist * Math.cos(seed.v) * Math.cos(seed.u);
          const y = seed.dist * Math.sin(seed.v) * oval;
          const z = seed.dist * Math.cos(seed.v) * Math.sin(seed.u);
          posAttr.setXYZ(m, x, y, z);
        }
        posAttr.needsUpdate = true;
      }
    },

    setParams(patch) {
      const needsRebuild =
        (patch.ovalRatio !== undefined && patch.ovalRatio !== currentParams.ovalRatio) ||
        (patch.coreRadius !== undefined && patch.coreRadius !== currentParams.coreRadius) ||
        (patch.trailCount !== undefined && patch.trailCount !== currentParams.trailCount) ||
        (patch.trailDetail !== undefined && patch.trailDetail !== currentParams.trailDetail) ||
        (patch.particleMotes !== undefined && patch.particleMotes !== currentParams.particleMotes);

      Object.assign(currentParams, patch);

      if (patch.colorLiquid !== undefined) colorLiquidRGB.set(patch.colorLiquid);
      if (patch.colorCrest !== undefined) {
        colorCrestRGB.set(patch.colorCrest);
        if (motesMaterial) motesMaterial.color.copy(colorCrestRGB);
      }
      if (patch.colorTrail1 !== undefined) {
        colorTrail1RGB.set(patch.colorTrail1);
        if (headsMaterial) headsMaterial.color.copy(colorTrail1RGB);
      }
      if (patch.colorTrail2 !== undefined) colorTrail2RGB.set(patch.colorTrail2);
      if (patch.colorCore !== undefined) {
        colorCoreRGB.set(patch.colorCore);
        if (sparkMaterial) sparkMaterial.color.copy(colorCoreRGB);
      }

      // Refresh trail vertex colors if colors changed
      if (patch.colorTrail1 !== undefined || patch.colorTrail2 !== undefined) {
        const trailDetail = parseInt(currentParams.trailDetail, 10) || 90;
        for (const t of trails) {
          for (let s = 0; s <= trailDetail; s++) {
            const frac = s / trailDetail;
            const col = colorTrail1RGB.clone().lerp(colorTrail2RGB, frac);
            const fade = (1.0 - frac * 0.85);
            t.colArr[s * 3] = col.r * fade;
            t.colArr[s * 3 + 1] = col.g * fade;
            t.colArr[s * 3 + 2] = col.b * fade;
          }
          t.geom.setColors(t.colArr);
        }
      }

      if (!needsRebuild && ferroMaterial) {
        if (patch.magneticSpikes !== undefined) ferroMaterial.uniforms.uMagneticSpikes.value = patch.magneticSpikes;
        if (patch.spikeFrequency !== undefined) ferroMaterial.uniforms.uSpikeFrequency.value = patch.spikeFrequency;
        if (patch.fluidViscosity !== undefined) ferroMaterial.uniforms.uFluidViscosity.value = patch.fluidViscosity;
        if (patch.breatheAmp !== undefined) ferroMaterial.uniforms.uBreatheAmp.value = patch.breatheAmp;
        if (patch.glowIntensity !== undefined) ferroMaterial.uniforms.uGlowIntensity.value = patch.glowIntensity;
      }

      if (needsRebuild) {
        buildEngine();
      }
    },

    onPulse() {
      pulseTimer = Number(currentParams.pulseSurge) || 1.5;
    },

    onResize(width, height) {
      for (const t of trails) {
        if (t.mat) t.mat.resolution.set(width, height);
      }
    },

    dispose() {
      scene.remove(group);

      if (ferroMesh) {
        group.remove(ferroMesh);
        ferroGeometry?.dispose();
        ferroMaterial?.dispose();
        ferroMesh = null;
      }

      if (sparkMesh) {
        group.remove(sparkMesh);
        sparkGeometry?.dispose();
        sparkMaterial?.dispose();
        sparkMesh = null;
      }

      for (const t of trails) {
        group.remove(t.line);
        t.geom?.dispose();
        t.mat?.dispose();
      }
      trails = [];

      if (headsPoints) {
        group.remove(headsPoints);
        headsGeometry?.dispose();
        headsMaterial?.dispose();
        headsPoints = null;
      }

      if (motesPoints) {
        group.remove(motesPoints);
        motesGeometry?.dispose();
        motesMaterial?.dispose();
        motesPoints = null;
      }

      if (circleTexture) {
        circleTexture.dispose();
        circleTexture = null;
      }
    },
  };
}
