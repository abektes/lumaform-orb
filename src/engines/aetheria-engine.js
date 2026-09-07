import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const FRAME_RADIUS = 2.25;
const RIBBON_SEGMENTS = 120;

// GLSL 3D Simplex noise
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

const AETHERIA_VERTEX_SHADER = /* glsl */ `
  ${NOISE_GLSL}

  uniform float uTime;
  uniform float uRadius;
  uniform float uWaveAmp;
  uniform float uBreatheAmp;
  uniform float uPulse;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying float vDisplacement;

  void main() {
    vec3 norm = normalize(position);

    // Multi-octave domain-warped gentle fluid deformation
    vec3 p1 = norm * 1.6 + vec3(uTime * 0.35, uTime * 0.25, uTime * 0.15);
    float n1 = snoise(p1);

    vec3 p2 = norm * 3.2 - vec3(uTime * 0.2, uTime * 0.3, n1 * 0.5);
    float n2 = snoise(p2);

    float breathe = sin(uTime * 1.5) * uBreatheAmp;
    float wave = (n1 * 0.7 + n2 * 0.3) * (uWaveAmp + uPulse * 0.25);
    float disp = breathe + wave;

    vec3 displacedPosition = norm * (uRadius * (1.0 + disp));

    // Analytical normal approximation via neighboring points
    float eps = 0.015;
    vec3 tangent1 = normalize(cross(norm, vec3(0.0, 1.0, 0.001)));
    vec3 tangent2 = cross(norm, tangent1);

    vec3 pNeighbour1 = normalize(norm + tangent1 * eps);
    vec3 pNeighbour2 = normalize(norm + tangent2 * eps);

    float disp1 = breathe + (snoise(pNeighbour1 * 1.6 + vec3(uTime * 0.35, uTime * 0.25, uTime * 0.15)) * 0.7
                           + snoise(pNeighbour1 * 3.2 - vec3(uTime * 0.2, uTime * 0.3, 0.0)) * 0.3) * (uWaveAmp + uPulse * 0.25);
    float disp2 = breathe + (snoise(pNeighbour2 * 1.6 + vec3(uTime * 0.35, uTime * 0.25, uTime * 0.15)) * 0.7
                           + snoise(pNeighbour2 * 3.2 - vec3(uTime * 0.2, uTime * 0.3, 0.0)) * 0.3) * (uWaveAmp + uPulse * 0.25);

    vec3 pos1 = pNeighbour1 * (uRadius * (1.0 + disp1));
    vec3 pos2 = pNeighbour2 * (uRadius * (1.0 + disp2));

    vec3 calcNormal = normalize(cross(pos1 - displacedPosition, pos2 - displacedPosition));
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

const AETHERIA_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor1; // Primary cyan/azure
  uniform vec3 uColor2; // Secondary violet/purple
  uniform vec3 uColor3; // Ambient magenta
  uniform vec3 uRimColor; // Prismatic highlight
  uniform float uIridescence;
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

    // Deep subsurface scattering & translucent volume gradient
    float subSurface = pow(1.0 - NdotV, 1.8);
    float coreLight = pow(NdotV, 2.2);

    // Color gradient mapping: displacement & view curvature
    float blendVal = clamp(vDisplacement * 4.0 + 0.5 + subSurface * 0.4, 0.0, 1.0);
    vec3 fluidColor = mix(uColor1, uColor2, smoothstep(0.15, 0.85, blendVal));
    fluidColor = mix(fluidColor, uColor3, subSurface * 0.55);

    // Chromatic dispersion Fresnel rim (Siri spectral halo)
    float rimBase = 1.0 - NdotV;
    float rimR = pow(rimBase, max(0.5, 2.8 - 0.4 * uIridescence));
    float rimG = pow(rimBase, 2.8);
    float rimB = pow(rimBase, 2.8 + 0.4 * uIridescence);

    vec3 rimLight = vec3(
      uRimColor.r * rimR + uColor3.r * (1.0 - rimR) * 0.2,
      uRimColor.g * rimG + uColor1.g * (1.0 - rimG) * 0.2,
      uRimColor.b * rimB + uColor2.b * (1.0 - rimB) * 0.2
    ) * (1.8 + uPulse * 1.5);

    // Combine diffuse body, soft inner glow, and spectral edge
    vec3 finalColor = (fluidColor * (0.35 + coreLight * 0.45) + rimLight * 0.85) * uGlowIntensity;

    // Soft translucent alpha falloff (keeps edges glowing while body is translucent)
    float alpha = clamp(0.35 + subSurface * 0.55 + uPulse * 0.2, 0.0, 0.95);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export function createAetheriaEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    sphereRadius: 1.55,
    detail: 64,
    causticRibbons: 3,
    fluidSpeed: 0.45,
    fluidWaveAmp: 0.12,
    breatheAmp: 0.04,
    causticSwirl: 0.60,
    pulseGlow: 1.50,
    color1: '#00f2fe',
    color2: '#a855f7',
    color3: '#ff4fd8',
    rimColor: '#ffed00',
    iridescence: 0.85,
    glowIntensity: 1.80,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let fluidMesh = null;
  let fluidGeometry = null;
  let fluidMaterial = null;

  let nucleusMesh = null;
  let nucleusGeometry = null;
  let nucleusMaterial = null;

  let ribbons = []; // array of { line, geom, mat, speedX, speedY, speedZ, phase }

  let virtualFluidTime = 0;
  let pulseTimer = 0;

  const color1RGB = new THREE.Color(currentParams.color1);
  const color2RGB = new THREE.Color(currentParams.color2);
  const color3RGB = new THREE.Color(currentParams.color3);
  const rimRGB = new THREE.Color(currentParams.rimColor);

  function buildEngine() {
    // 1. Clean up existing objects
    if (fluidMesh) {
      group.remove(fluidMesh);
      fluidGeometry.dispose();
      fluidMaterial.dispose();
      fluidMesh = null;
    }
    if (nucleusMesh) {
      group.remove(nucleusMesh);
      nucleusGeometry.dispose();
      nucleusMaterial.dispose();
      nucleusMesh = null;
    }
    for (const r of ribbons) {
      group.remove(r.line);
      r.geom.dispose();
      r.mat.dispose();
    }
    ribbons = [];

    const radius = Number(currentParams.sphereRadius) || 1.55;
    const detail = parseInt(currentParams.detail, 10) || 64;
    const ribbonCount = parseInt(currentParams.causticRibbons, 10) || 3;
    const size = renderer?.getSize ? renderer.getSize(new THREE.Vector2()) : new THREE.Vector2(1024, 768);

    // 2. Build Fluid Sphere Mesh
    fluidGeometry = new THREE.SphereGeometry(radius, detail, detail);
    fluidMaterial = new THREE.ShaderMaterial({
      vertexShader: AETHERIA_VERTEX_SHADER,
      fragmentShader: AETHERIA_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0.0 },
        uRadius: { value: radius },
        uWaveAmp: { value: Number(currentParams.fluidWaveAmp) || 0.12 },
        uBreatheAmp: { value: Number(currentParams.breatheAmp) || 0.04 },
        uPulse: { value: 0.0 },
        uColor1: { value: color1RGB },
        uColor2: { value: color2RGB },
        uColor3: { value: color3RGB },
        uRimColor: { value: rimRGB },
        uIridescence: { value: Number(currentParams.iridescence) || 0.85 },
        uGlowIntensity: { value: Number(currentParams.glowIntensity) || 1.8 },
      },
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    fluidMesh = new THREE.Mesh(fluidGeometry, fluidMaterial);
    group.add(fluidMesh);

    // 3. Build Warm Breathing Nucleus Core
    nucleusGeometry = new THREE.SphereGeometry(radius * 0.38, 32, 32);
    nucleusMaterial = new THREE.MeshBasicMaterial({
      color: currentParams.color3,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    nucleusMesh = new THREE.Mesh(nucleusGeometry, nucleusMaterial);
    group.add(nucleusMesh);

    // 4. Build Floating Silk Caustic Ribbons
    for (let i = 0; i < ribbonCount; i++) {
      const ribbonR = radius * (0.55 + i * 0.14);
      const posArr = new Float32Array((RIBBON_SEGMENTS + 1) * 3);
      const colArr = new Float32Array((RIBBON_SEGMENTS + 1) * 3);

      const a = 2 + (i % 2);
      const b = 3 + (i % 3);
      const c = 1 + (i % 2);
      const phaseOffset = (i * Math.PI * 2) / ribbonCount;

      for (let s = 0; s <= RIBBON_SEGMENTS; s++) {
        const u = (s / RIBBON_SEGMENTS) * Math.PI * 2;
        const x = ribbonR * Math.sin(a * u + phaseOffset);
        const y = ribbonR * Math.cos(b * u);
        const z = ribbonR * Math.sin(c * u + phaseOffset);

        posArr[s * 3] = x;
        posArr[s * 3 + 1] = y;
        posArr[s * 3 + 2] = z;

        // Smooth color blend along ribbon
        const t = s / RIBBON_SEGMENTS;
        const col = t < 0.5
          ? color1RGB.clone().lerp(color2RGB, t * 2.0)
          : color2RGB.clone().lerp(color3RGB, (t - 0.5) * 2.0);

        colArr[s * 3] = col.r;
        colArr[s * 3 + 1] = col.g;
        colArr[s * 3 + 2] = col.b;
      }

      const geom = new LineGeometry();
      geom.setPositions(posArr);
      geom.setColors(colArr);

      const mat = new LineMaterial({
        vertexColors: true,
        linewidth: 2.2,
        resolution: size,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const line = new Line2(geom, mat);
      line.computeLineDistances();
      group.add(line);

      ribbons.push({
        line,
        geom,
        mat,
        rotSpeedX: 0.25 * (i % 2 === 0 ? 1 : -1),
        rotSpeedY: 0.45 * (i % 2 === 0 ? -1 : 1),
        rotSpeedZ: 0.15,
        baseR: ribbonR,
      });
    }
  }

  buildEngine();

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      const speed = Number(currentParams.fluidSpeed) || 0.45;
      virtualFluidTime += delta * speed;

      // Handle pulse decay
      if (pulseTimer > 0) {
        pulseTimer = Math.max(0, pulseTimer - delta * 1.8);
      }

      const pulseNormalized = pulseTimer / Math.max(0.1, Number(currentParams.pulseGlow) || 1.5);

      // Update fluid shader uniforms
      if (fluidMaterial) {
        fluidMaterial.uniforms.uTime.value = virtualFluidTime;
        fluidMaterial.uniforms.uPulse.value = pulseNormalized;
      }

      // Update nucleus breathing
      if (nucleusMesh) {
        const breathe = 1.0 + Math.sin(virtualFluidTime * 2.0) * 0.08 + pulseNormalized * 0.35;
        nucleusMesh.scale.set(breathe, breathe, breathe);
      }

      // Update internal silk ribbons rotation & swirl
      const swirl = Number(currentParams.causticSwirl) || 0.60;
      for (const r of ribbons) {
        r.line.rotation.x += delta * r.rotSpeedX * swirl;
        r.line.rotation.y += delta * r.rotSpeedY * swirl;
        r.line.rotation.z += delta * r.rotSpeedZ * swirl;

        const pulseScale = 1.0 + pulseNormalized * 0.18;
        r.line.scale.set(pulseScale, pulseScale, pulseScale);
      }
    },

    setParams(patch) {
      const needsRebuild =
        (patch.sphereRadius !== undefined && patch.sphereRadius !== currentParams.sphereRadius) ||
        (patch.detail !== undefined && patch.detail !== currentParams.detail) ||
        (patch.causticRibbons !== undefined && patch.causticRibbons !== currentParams.causticRibbons);

      Object.assign(currentParams, patch);

      if (patch.color1 !== undefined) color1RGB.set(patch.color1);
      if (patch.color2 !== undefined) color2RGB.set(patch.color2);
      if (patch.color3 !== undefined) {
        color3RGB.set(patch.color3);
        if (nucleusMaterial) nucleusMaterial.color.copy(color3RGB);
      }
      if (patch.rimColor !== undefined) rimRGB.set(patch.rimColor);

      if (!needsRebuild && fluidMaterial) {
        if (patch.fluidWaveAmp !== undefined) fluidMaterial.uniforms.uWaveAmp.value = patch.fluidWaveAmp;
        if (patch.breatheAmp !== undefined) fluidMaterial.uniforms.uBreatheAmp.value = patch.breatheAmp;
        if (patch.iridescence !== undefined) fluidMaterial.uniforms.uIridescence.value = patch.iridescence;
        if (patch.glowIntensity !== undefined) fluidMaterial.uniforms.uGlowIntensity.value = patch.glowIntensity;
      }

      if (needsRebuild) {
        buildEngine();
      }
    },

    onPulse() {
      pulseTimer = Number(currentParams.pulseGlow) || 1.5;
    },

    onResize(width, height) {
      for (const r of ribbons) {
        if (r.mat) r.mat.resolution.set(width, height);
      }
    },

    dispose() {
      scene.remove(group);
      if (fluidMesh) {
        group.remove(fluidMesh);
        fluidGeometry?.dispose();
        fluidMaterial?.dispose();
        fluidMesh = null;
      }
      if (nucleusMesh) {
        group.remove(nucleusMesh);
        nucleusGeometry?.dispose();
        nucleusMaterial?.dispose();
        nucleusMesh = null;
      }
      for (const r of ribbons) {
        group.remove(r.line);
        r.geom?.dispose();
        r.mat?.dispose();
      }
      ribbons = [];
    },
  };
}
