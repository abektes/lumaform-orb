import * as THREE from 'three';

const MAX_PETALS = 72;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FRAME_RADIUS = 2.36;

const PETAL_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aBarycentric;
  attribute float aPhase;
  attribute float aLatitude;
  attribute float aPetalIndex;

  uniform float uPetalLength;
  uniform float uPetalWidth;
  uniform float uCoreRadius;
  uniform float uBloom;
  uniform float uFold;
  uniform float uWaveStrength;
  uniform float uBreatheAmp;
  uniform float uMotionPhase;
  uniform float uPulseAge;

  varying vec3 vWorldPosition;
  varying vec3 vBarycentric;
  varying float vPetalU;
  varying float vPhase;
  varying float vOpening;

  float pulseEnvelope(float age, float latitude) {
    float localAge = age - latitude * 0.72;
    if (localAge <= 0.0 || localAge >= 1.55) return 0.0;

    float ring = exp(-pow((localAge - 0.12) / 0.105, 2.0));
    float settle = max(0.0, sin(localAge * 10.0)) * exp(-localAge * 4.4);
    return ring * 0.82 + settle * 0.18;
  }

  void main() {
    float petalU = position.y;
    float wave = sin(
      uMotionPhase * 1.28
      - aLatitude * 10.5
      + sin(aPhase) * 1.6
      + aPetalIndex * 0.7
    );
    float breath = sin(uMotionPhase + aPhase * 0.42) * uBreatheAmp;
    float pulse = pulseEnvelope(uPulseAge, aLatitude);
    float opening = clamp(
      uBloom
      + breath * (0.58 + petalU * 0.42)
      + wave * uWaveStrength * 0.18
      + pulse * 0.72,
      0.02,
      1.0
    );

    float lengthAlongPetal = petalU * uPetalLength;
    float radius = max(0.25, uCoreRadius);
    float theta = lengthAlongPetal / radius;

    // The closed curve follows the core instead of making a straight tangential
    // spike. Blooming interpolates that curve toward an almost radial blade.
    vec2 surfaceCurve = vec2(
      sin(theta) * radius,
      (cos(theta) - 1.0) * radius
    );
    vec2 tangentBlade = vec2(lengthAlongPetal, 0.0);
    float dynamicFold = clamp(
      uFold + wave * uWaveStrength * 0.22 - pulse * 0.28,
      0.0,
      1.0
    );
    vec2 folded = mix(tangentBlade, surfaceCurve, dynamicFold);
    vec2 lifted = vec2(
      lengthAlongPetal * 0.20,
      lengthAlongPetal * 0.98
    );
    vec2 petalPath = mix(folded, lifted, opening);

    vec3 transformed = vec3(
      position.x * uPetalWidth,
      petalPath.x,
      petalPath.y + position.z * uPetalWidth
    );

    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
    vWorldPosition = worldPosition.xyz;
    vBarycentric = aBarycentric;
    vPetalU = petalU;
    vPhase = aPhase;
    vOpening = opening;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const PETAL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  uniform vec3 uEdgeColor;
  uniform float uIridescence;
  uniform float uGlow;

  varying vec3 vWorldPosition;
  varying vec3 vBarycentric;
  varying float vPetalU;
  varying float vPhase;
  varying float vOpening;

  void main() {
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    if (!gl_FrontFacing) normal = -normal;

    float facing = abs(dot(normal, viewDirection));
    float fresnel = pow(1.0 - facing, 2.15);
    float facetLight = 0.46 + 0.54 * max(
      dot(normal, normalize(vec3(-0.38, 0.72, 0.58))),
      0.0
    );

    vec3 body = mix(uInnerColor, uOuterColor, smoothstep(0.04, 0.96, vPetalU));
    vec3 spectrum = 0.54 + 0.46 * cos(
      6.2831853 * (fresnel * 0.76 + vPetalU * 0.20 + vPhase * 0.035)
      + vec3(0.0, 2.1, 4.2)
    );
    body = mix(body, body * spectrum * 1.42, uIridescence * (0.18 + fresnel * 0.72));

    vec3 derivatives = fwidth(vBarycentric);
    vec3 edgeDistance = smoothstep(vec3(0.0), derivatives * 1.35, vBarycentric);
    float edge = 1.0 - min(min(edgeDistance.x, edgeDistance.y), edgeDistance.z);
    float tipLight = smoothstep(0.62, 1.0, vPetalU) * (0.3 + 0.7 * fresnel);

    vec3 color = body * (0.72 + facetLight * 0.52);
    color += uEdgeColor * (edge * 0.78 + fresnel * 0.19 + tipLight * 0.12);
    color *= 0.84 + uGlow * 0.24;

    // The fill stays substantial enough to read in grid mode, while edge-on
    // facets remain translucent and reveal the layered phyllotaxis beneath.
    float alpha = clamp(0.67 + facing * 0.20 + edge * 0.10 + vOpening * 0.035, 0.0, 0.97);
    gl_FragColor = vec4(color, alpha);
  }
`;

const CORE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const CORE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uInnerColor;
  uniform vec3 uEdgeColor;
  uniform float uGlow;
  uniform float uMotionPhase;

  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  void main() {
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    if (!gl_FrontFacing) normal = -normal;

    float facing = max(dot(normal, viewDirection), 0.0);
    float fresnel = pow(1.0 - facing, 2.4);
    float shimmer = 0.5 + 0.5 * sin(
      dot(normalize(vLocalPosition), vec3(4.1, 5.7, 3.3)) * 7.0
      + uMotionPhase * 0.42
    );
    vec3 color = mix(uInnerColor * 0.56, uInnerColor, 0.50 + facing * 0.50);
    color += uEdgeColor * (fresnel * 0.58 + shimmer * 0.09);
    color *= 0.92 + uGlow * 0.31;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const HALO_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const HALO_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uInnerColor;
  uniform vec3 uEdgeColor;
  uniform float uGlow;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDirection)), 2.7);
    vec3 color = mix(uInnerColor, uEdgeColor, fresnel);
    float alpha = (0.025 + fresnel * 0.24) * min(uGlow, 2.4);
    gl_FragColor = vec4(color * (0.74 + uGlow * 0.34), alpha);
  }
`;

function createPetalGeometry() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const barycentrics = [];
  const sections = [
    { u: 0.0, halfWidth: 0.09, ridge: 0.01 },
    { u: 0.24, halfWidth: 0.50, ridge: 0.13 },
    { u: 0.67, halfWidth: 0.34, ridge: 0.10 },
    { u: 1.0, halfWidth: 0.0, ridge: 0.0 },
  ];

  function addTriangle(a, b, c) {
    positions.push(...a, ...b, ...c);
    barycentrics.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
  }

  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    const leftA = [-a.halfWidth, a.u, -a.ridge * 0.30];
    const leftB = [-b.halfWidth, b.u, -b.ridge * 0.30];
    const centerA = [0, a.u, a.ridge];
    const centerB = [0, b.u, b.ridge];
    const rightA = [a.halfWidth, a.u, -a.ridge * 0.30];
    const rightB = [b.halfWidth, b.u, -b.ridge * 0.30];

    addTriangle(leftA, leftB, centerB);
    addTriangle(leftA, centerB, centerA);
    addTriangle(centerA, centerB, rightB);
    addTriangle(centerA, rightB, rightA);
  }

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute(
    'aBarycentric',
    new THREE.Float32BufferAttribute(barycentrics, 3)
  );
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPrismBloomEngine({ scene, pointerTracker, params }) {
  const currentParams = {
    petalCount: 48,
    petalLength: 1.32,
    petalWidth: 0.52,
    coreRadius: 0.83,
    bloom: 0.58,
    fold: 0.78,
    waveStrength: 0.42,
    breatheAmp: 0.14,
    breatheSpeed: 0.72,
    innerColor: '#f8c8ff',
    outerColor: '#58c9ff',
    edgeColor: '#fff4cb',
    iridescence: 0.72,
    glow: 1.28,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const petalGeometry = createPetalGeometry();
  const phaseValues = new Float32Array(MAX_PETALS);
  const latitudeValues = new Float32Array(MAX_PETALS);
  const indexValues = new Float32Array(MAX_PETALS);
  const phaseAttribute = new THREE.InstancedBufferAttribute(phaseValues, 1);
  const latitudeAttribute = new THREE.InstancedBufferAttribute(latitudeValues, 1);
  const indexAttribute = new THREE.InstancedBufferAttribute(indexValues, 1);
  petalGeometry.setAttribute('aPhase', phaseAttribute);
  petalGeometry.setAttribute('aLatitude', latitudeAttribute);
  petalGeometry.setAttribute('aPetalIndex', indexAttribute);

  const petalMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPetalLength: { value: currentParams.petalLength },
      uPetalWidth: { value: currentParams.petalWidth },
      uCoreRadius: { value: currentParams.coreRadius },
      uBloom: { value: currentParams.bloom },
      uFold: { value: currentParams.fold },
      uWaveStrength: { value: currentParams.waveStrength },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uMotionPhase: { value: 0 },
      uPulseAge: { value: 99 },
      uInnerColor: { value: new THREE.Color(currentParams.innerColor) },
      uOuterColor: { value: new THREE.Color(currentParams.outerColor) },
      uEdgeColor: { value: new THREE.Color(currentParams.edgeColor) },
      uIridescence: { value: currentParams.iridescence },
      uGlow: { value: currentParams.glow },
    },
    vertexShader: PETAL_VERTEX_SHADER,
    fragmentShader: PETAL_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
  });

  const petals = new THREE.InstancedMesh(petalGeometry, petalMaterial, MAX_PETALS);
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  petals.frustumCulled = false;
  petals.renderOrder = 2;
  group.add(petals);

  const coreGeometry = new THREE.IcosahedronGeometry(1, 3);
  const coreMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uInnerColor: { value: new THREE.Color(currentParams.innerColor) },
      uEdgeColor: { value: new THREE.Color(currentParams.edgeColor) },
      uGlow: { value: currentParams.glow },
      uMotionPhase: { value: 0 },
    },
    vertexShader: CORE_VERTEX_SHADER,
    fragmentShader: CORE_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.renderOrder = 0;
  group.add(core);

  const haloGeometry = new THREE.SphereGeometry(1, 24, 16);
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uInnerColor: { value: new THREE.Color(currentParams.innerColor) },
      uEdgeColor: { value: new THREE.Color(currentParams.edgeColor) },
      uGlow: { value: currentParams.glow },
    },
    vertexShader: HALO_VERTEX_SHADER,
    fragmentShader: HALO_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.renderOrder = 1;
  group.add(halo);

  const matrix = new THREE.Matrix4();
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  const meridian = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const position = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const fallbackAxis = new THREE.Vector3(1, 0, 0);

  function updateCoreScale() {
    core.scale.setScalar(currentParams.coreRadius * 0.94);
    halo.scale.setScalar(currentParams.coreRadius * 1.11);
  }

  function updatePetalPlacement() {
    const count = THREE.MathUtils.clamp(
      Math.round(currentParams.petalCount),
      1,
      MAX_PETALS
    );
    petals.count = count;

    for (let i = 0; i < count; i++) {
      const latitude = (i + 0.5) / count;
      const y = 1 - latitude * 2;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const azimuth = i * GOLDEN_ANGLE;
      zAxis.set(
        Math.cos(azimuth) * radial,
        y,
        Math.sin(azimuth) * radial
      ).normalize();

      meridian.copy(worldUp).addScaledVector(zAxis, -worldUp.dot(zAxis));
      if (meridian.lengthSq() < 0.0001) {
        meridian.copy(fallbackAxis).addScaledVector(zAxis, -fallbackAxis.dot(zAxis));
      }
      meridian.normalize();
      bitangent.crossVectors(zAxis, meridian).normalize();

      const spiral = azimuth * 0.38;
      yAxis.copy(meridian).multiplyScalar(Math.cos(spiral))
        .addScaledVector(bitangent, Math.sin(spiral))
        .normalize();
      xAxis.crossVectors(yAxis, zAxis).normalize();
      position.copy(zAxis).multiplyScalar(currentParams.coreRadius * 0.96);

      matrix.makeBasis(xAxis, yAxis, zAxis);
      matrix.setPosition(position);
      petals.setMatrixAt(i, matrix);
      phaseValues[i] = azimuth % (Math.PI * 2);
      latitudeValues[i] = latitude;
      indexValues[i] = i / Math.max(1, count - 1);
    }

    petals.instanceMatrix.needsUpdate = true;
    phaseAttribute.needsUpdate = true;
    latitudeAttribute.needsUpdate = true;
    indexAttribute.needsUpdate = true;
  }

  updateCoreScale();
  updatePetalPlacement();

  let motionPhase = 0;
  let pulseAge = 99;
  let lastTime = null;

  function setColorUniform(uniformName, value) {
    petalMaterial.uniforms[uniformName].value.set(value);
    if (coreMaterial.uniforms[uniformName]) {
      coreMaterial.uniforms[uniformName].value.set(value);
    }
    if (haloMaterial.uniforms[uniformName]) {
      haloMaterial.uniforms[uniformName].value.set(value);
    }
  }

  function triggerPulse() {
    pulseAge = 0;
    petalMaterial.uniforms.uPulseAge.value = 0;
  }

  return {
    frame: { radius: FRAME_RADIUS },

    update(args = {}) {
      const now = typeof args.time === 'number' ? args.time : null;
      let virtualDelta = 0;
      if (now !== null) {
        if (lastTime !== null) virtualDelta = Math.max(0, now - lastTime);
        lastTime = now;
      } else if (typeof args.delta === 'number') {
        virtualDelta = Math.max(0, args.delta);
      }

      motionPhase += virtualDelta * currentParams.breatheSpeed;
      if (pulseAge < 2) pulseAge += virtualDelta;
      petalMaterial.uniforms.uMotionPhase.value = motionPhase;
      petalMaterial.uniforms.uPulseAge.value = pulseAge;
      coreMaterial.uniforms.uMotionPhase.value = motionPhase;

      const pointer = args.pointer ?? pointerTracker?.pointer;
      if (pointer && virtualDelta > 0) {
        const ease = Math.min(1, virtualDelta * 3.2);
        group.rotation.x += ((-pointer.y * 0.16) - group.rotation.x) * ease;
        group.rotation.y += ((pointer.x * 0.20) - group.rotation.y) * ease;
      }
    },

    setParams(patch = {}) {
      const placementChanged =
        patch.petalCount !== undefined && patch.petalCount !== currentParams.petalCount ||
        patch.coreRadius !== undefined && patch.coreRadius !== currentParams.coreRadius;
      Object.assign(currentParams, patch);

      if (patch.petalLength !== undefined) {
        petalMaterial.uniforms.uPetalLength.value = currentParams.petalLength;
      }
      if (patch.petalWidth !== undefined) {
        petalMaterial.uniforms.uPetalWidth.value = currentParams.petalWidth;
      }
      if (patch.coreRadius !== undefined) {
        petalMaterial.uniforms.uCoreRadius.value = currentParams.coreRadius;
        updateCoreScale();
      }
      if (patch.bloom !== undefined) {
        petalMaterial.uniforms.uBloom.value = currentParams.bloom;
      }
      if (patch.fold !== undefined) {
        petalMaterial.uniforms.uFold.value = currentParams.fold;
      }
      if (patch.waveStrength !== undefined) {
        petalMaterial.uniforms.uWaveStrength.value = currentParams.waveStrength;
      }
      if (patch.breatheAmp !== undefined) {
        petalMaterial.uniforms.uBreatheAmp.value = currentParams.breatheAmp;
      }
      if (patch.iridescence !== undefined) {
        petalMaterial.uniforms.uIridescence.value = currentParams.iridescence;
      }
      if (patch.glow !== undefined) {
        petalMaterial.uniforms.uGlow.value = currentParams.glow;
        coreMaterial.uniforms.uGlow.value = currentParams.glow;
        haloMaterial.uniforms.uGlow.value = currentParams.glow;
      }
      if (patch.innerColor !== undefined) {
        setColorUniform('uInnerColor', currentParams.innerColor);
      }
      if (patch.outerColor !== undefined) {
        setColorUniform('uOuterColor', currentParams.outerColor);
      }
      if (patch.edgeColor !== undefined) {
        setColorUniform('uEdgeColor', currentParams.edgeColor);
      }
      if (placementChanged) updatePetalPlacement();
    },

    onPulse() {
      triggerPulse();
    },

    dispose() {
      scene.remove(group);
      petalGeometry.dispose();
      petalMaterial.dispose();
      petals.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
    },
  };
}
