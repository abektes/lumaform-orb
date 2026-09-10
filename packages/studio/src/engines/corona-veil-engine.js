import * as THREE from 'three';

// Corona Veil — translucent, softly twisted membranes around a dark core.
//
// Each membrane is an instance of one narrow parameter-space ribbon. The
// vertex shader wraps it onto a differently oriented great circle, so detail
// costs one shared geometry rather than one mesh per veil. Motion stays inside
// the membranes: interference rolls along them and their radii breathe, while
// the shell as a whole never rotates.

const MAX_VEILS = 12;
const WIDTH_SEGMENTS = 5;

const VEIL_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute float aVeilIndex;
  attribute float aVeilSeed;
  attribute float aVeilTilt;
  attribute float aVeilRoll;

  uniform float uCoreRadius;
  uniform float uVeilSpread;
  uniform float uTwist;
  uniform float uWaveAmp;
  uniform float uBreatheAmp;
  uniform float uDriftPhase;
  uniform float uWavePhase;
  uniform float uPulse;
  uniform float uPulsePhase;

  varying float vAcross;
  varying float vTheta;
  varying float vLayer;
  varying float vSeed;
  varying float vRipple;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  const float PI = 3.14159265359;
  const float TWO_PI = 6.28318530718;

  mat3 rotateX(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(
      1.0, 0.0, 0.0,
      0.0, c, s,
      0.0, -s, c
    );
  }

  mat3 rotateZ(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(
      c, s, 0.0,
      -s, c, 0.0,
      0.0, 0.0, 1.0
    );
  }

  float angularDistance(float a, float b) {
    return abs(mod(a - b + PI, TWO_PI) - PI);
  }

  void main() {
    float across = position.y;
    float theta = uv.x * TWO_PI;
    float seedPhase = aVeilSeed * TWO_PI;

    // The centreline wanders in latitude while the cross-section alternates
    // between latitudinal width and radial lift. That is the soft membrane
    // twist; unlike rotating the mesh, it changes shape locally along the loop.
    float twistPhase = theta * (1.0 + uTwist * 0.42)
      + seedPhase
      - uDriftPhase * (0.34 + aVeilSeed * 0.13);
    float centreSway = 0.036 * sin(
      theta * 2.0 - uDriftPhase * (0.72 + aVeilSeed * 0.16) + seedPhase
    );
    float latitude = centreSway + across * 0.115 * cos(twistPhase);
    float radialTwist = across * 0.034 * uTwist * sin(twistPhase);

    // Two restrained harmonics produce broad folds rather than a noisy surface.
    float travellingWave =
      sin(theta * 3.0 - uWavePhase + seedPhase * 1.3)
      + 0.42 * sin(theta * 7.0 + uWavePhase * 0.63 - seedPhase);
    float breathe = sin(
      uDriftPhase * 0.61 + uWavePhase * 0.12 + seedPhase * 0.38
    ) * uBreatheAmp;

    // A click launches one narrow crest around every loop. Static per-instance
    // orientations make those crests read as a ripple travelling over a shell.
    float pulseDistance = angularDistance(theta, uPulsePhase);
    float ripple = exp(-pulseDistance * pulseDistance * 22.0) * uPulse;

    float radius = uCoreRadius
      + 0.055
      + aVeilIndex * uVeilSpread
      + radialTwist
      + travellingWave * uWaveAmp
      + breathe
      + ripple * 0.045;

    float cosLat = cos(latitude);
    vec3 p = vec3(
      cos(theta) * cosLat,
      sin(latitude),
      sin(theta) * cosLat
    ) * radius;

    // The orientations are deterministic attributes, not animated transforms.
    mat3 orientation = rotateZ(aVeilRoll) * rotateX(aVeilTilt);
    p = orientation * p;
    vec3 surfaceNormal = normalize(p);

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vViewNormal = normalize(normalMatrix * surfaceNormal);
    vViewDirection = normalize(-viewPosition.xyz);
    vAcross = across;
    vTheta = theta;
    vLayer = aVeilIndex;
    vSeed = aVeilSeed;
    vRipple = ripple;

    gl_Position = projectionMatrix * viewPosition;
  }
`;

const VEIL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uVeilColor;
  uniform vec3 uAccentColor;
  uniform float uOpacity;
  uniform float uEdgeGlow;
  uniform float uDriftPhase;
  uniform float uWavePhase;

  varying float vAcross;
  varying float vTheta;
  varying float vLayer;
  varying float vSeed;
  varying float vRipple;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  void main() {
    float edgeCoordinate = abs(vAcross);
    float softEdge = 1.0 - smoothstep(0.82, 1.0, edgeCoordinate);
    if (softEdge <= 0.001) discard;

    vec3 normal = normalize(vViewNormal);
    if (!gl_FrontFacing) normal = -normal;
    float facing = abs(dot(normal, normalize(vViewDirection)));
    float silhouette = pow(1.0 - clamp(facing, 0.0, 1.0), 2.35);
    float ribbonEdge = smoothstep(0.54, 0.88, edgeCoordinate) * softEdge;

    // Crossing harmonics drift at different rates. Their product creates broad
    // interference islands that flow without making the entire veil translate.
    float interferenceA = sin(
      vTheta * 5.0 - uDriftPhase * 1.13 + vAcross * 7.0 + vSeed * 4.0
    );
    float interferenceB = cos(
      vTheta * 8.0 + uWavePhase * 0.71 - vAcross * 5.0 - vLayer * 3.0
    );
    float interference = 0.5 + 0.5 * interferenceA * interferenceB;
    interference = smoothstep(0.12, 0.94, interference);

    vec3 membraneColor = mix(
      uVeilColor,
      uAccentColor,
      0.12 + interference * 0.42 + vLayer * 0.08
    );
    float emission = uEdgeGlow * (
      silhouette * 0.72 + ribbonEdge * 0.58 + vRipple * 1.25
    );
    vec3 color = membraneColor * (0.42 + interference * 0.72);
    color += mix(uVeilColor, uAccentColor, 0.72) * emission;

    float alpha = uOpacity * softEdge * (
      0.28
      + interference * 0.42
      + silhouette * 0.72
      + ribbonEdge * 0.46
      + vRipple * 0.82
    );

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.92));
  }
`;

const CORE_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  varying vec3 vObjectNormal;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    vObjectNormal = normal;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const CORE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uCoreColor;
  uniform vec3 uVeilColor;
  uniform vec3 uAccentColor;

  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  varying vec3 vObjectNormal;

  void main() {
    float facing = clamp(
      dot(normalize(vViewNormal), normalize(vViewDirection)),
      0.0,
      1.0
    );
    float rim = pow(1.0 - facing, 3.2);
    float vertical = vObjectNormal.y * 0.5 + 0.5;

    // The core is intentionally almost black. Its faint cool rim separates it
    // from a black canvas even when bloom is absent in variation-grid cells.
    vec3 color = uCoreColor * (0.58 + vertical * 0.24);
    color += uVeilColor * rim * 0.045;
    color += uAccentColor * pow(rim, 4.5) * 0.022;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function buildRibbonGeometry(detail, veilCount) {
  const longitudeSegments = Math.max(24, Math.round(detail));
  const rowSize = WIDTH_SEGMENTS + 1;
  const vertexCount = (longitudeSegments + 1) * rowSize;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(longitudeSegments * WIDTH_SEGMENTS * 6);

  let vertex = 0;
  for (let longitude = 0; longitude <= longitudeSegments; longitude++) {
    const u = longitude / longitudeSegments;
    for (let width = 0; width <= WIDTH_SEGMENTS; width++) {
      const across = width / WIDTH_SEGMENTS * 2 - 1;
      positions[vertex * 3] = u;
      positions[vertex * 3 + 1] = across;
      positions[vertex * 3 + 2] = 0;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = width / WIDTH_SEGMENTS;
      vertex++;
    }
  }

  let index = 0;
  for (let longitude = 0; longitude < longitudeSegments; longitude++) {
    for (let width = 0; width < WIDTH_SEGMENTS; width++) {
      const a = longitude * rowSize + width;
      const b = a + rowSize;
      indices[index++] = a;
      indices[index++] = b;
      indices[index++] = a + 1;
      indices[index++] = b;
      indices[index++] = b + 1;
      indices[index++] = a + 1;
    }
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const layers = new Float32Array(MAX_VEILS);
  const seeds = new Float32Array(MAX_VEILS);
  const tilts = new Float32Array(MAX_VEILS);
  const rolls = new Float32Array(MAX_VEILS);
  for (let i = 0; i < MAX_VEILS; i++) {
    const seed = ((i + 1) * 0.61803398875) % 1;
    seeds[i] = seed;
    tilts[i] = ((((i + 1) * 0.754877666) % 1) - 0.5) * 1.5;
    rolls[i] = ((((i + 1) * 0.569840296) % 1) - 0.5) * 1.25;
  }

  geometry.setAttribute(
    'aVeilIndex',
    new THREE.InstancedBufferAttribute(layers, 1)
  );
  geometry.setAttribute(
    'aVeilSeed',
    new THREE.InstancedBufferAttribute(seeds, 1)
  );
  geometry.setAttribute(
    'aVeilTilt',
    new THREE.InstancedBufferAttribute(tilts, 1)
  );
  geometry.setAttribute(
    'aVeilRoll',
    new THREE.InstancedBufferAttribute(rolls, 1)
  );
  geometry.instanceCount = Math.min(MAX_VEILS, Math.max(1, Math.round(veilCount)));
  return geometry;
}

function updateVeilLayers(geometry, veilCount) {
  const count = Math.min(MAX_VEILS, Math.max(1, Math.round(veilCount)));
  const layers = geometry.getAttribute('aVeilIndex');
  for (let i = 0; i < MAX_VEILS; i++) {
    layers.setX(i, count > 1 ? i / (count - 1) : 0);
  }
  layers.needsUpdate = true;
  geometry.instanceCount = count;
}

export function createCoronaVeilEngine({ scene, params }) {
  const currentParams = {
    veilCount: 8,
    detail: 80,
    coreRadius: 1.62,

    veilSpread: 0.24,
    twist: 0.68,
    waveAmp: 0.055,
    breatheAmp: 0.025,
    driftSpeed: 0.16,
    waveSpeed: 0.48,

    coreColor: '#02040a',
    veilColor: '#62d8d2',
    accentColor: '#b9a7ff',
    opacity: 0.25,
    edgeGlow: 1.25,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const veilMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uCoreRadius: { value: currentParams.coreRadius },
      uVeilSpread: { value: currentParams.veilSpread },
      uTwist: { value: currentParams.twist },
      uWaveAmp: { value: currentParams.waveAmp },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uDriftPhase: { value: 0 },
      uWavePhase: { value: 0 },
      uPulse: { value: 0 },
      uPulsePhase: { value: 0 },
      uVeilColor: { value: new THREE.Color(currentParams.veilColor) },
      uAccentColor: { value: new THREE.Color(currentParams.accentColor) },
      uOpacity: { value: currentParams.opacity },
      uEdgeGlow: { value: currentParams.edgeGlow },
    },
    vertexShader: VEIL_VERTEX_SHADER,
    fragmentShader: VEIL_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const coreMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uCoreColor: { value: new THREE.Color(currentParams.coreColor) },
      uVeilColor: { value: new THREE.Color(currentParams.veilColor) },
      uAccentColor: { value: new THREE.Color(currentParams.accentColor) },
    },
    vertexShader: CORE_VERTEX_SHADER,
    fragmentShader: CORE_FRAGMENT_SHADER,
    depthTest: true,
    depthWrite: true,
  });

  const coreGeometry = new THREE.SphereGeometry(1, 48, 32);
  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  coreMesh.scale.setScalar(currentParams.coreRadius);
  coreMesh.renderOrder = 0;
  group.add(coreMesh);

  let veilGeometry = null;
  let veilMesh = null;
  let driftPhase = 0;
  let wavePhase = 0;
  let previousTime = null;
  let pulseAge = 0;
  let pulseStrength = 0;

  function disposeVeils() {
    if (veilMesh) group.remove(veilMesh);
    veilGeometry?.dispose();
    veilGeometry = null;
    veilMesh = null;
  }

  function buildVeils() {
    disposeVeils();
    veilGeometry = buildRibbonGeometry(
      currentParams.detail,
      currentParams.veilCount
    );
    updateVeilLayers(veilGeometry, currentParams.veilCount);
    veilMesh = new THREE.Mesh(veilGeometry, veilMaterial);
    // CPU bounds describe the flat parameter ribbon, not its shader-wrapped
    // sphere, so renderer culling would intermittently discard a valid shell.
    veilMesh.frustumCulled = false;
    veilMesh.renderOrder = 1;
    group.add(veilMesh);
  }

  buildVeils();

  function setVeilUniform(name, value) {
    veilMaterial.uniforms[name].value = value;
  }

  return {
    // Default outer radius, including the two wave harmonics, twist lift,
    // breathing, and pulse crest, is ~2.09. The small remainder keeps the
    // silhouette clear while letting the orb occupy the intended 80% frame.
    frame: { radius: 2.12 },

    update(args = {}) {
      const fallbackDelta = typeof args.delta === 'number' ? args.delta : 0.016;
      let virtualDelta = fallbackDelta;
      if (typeof args.time === 'number') {
        virtualDelta = previousTime === null
          ? 0
          : Math.max(0, args.time - previousTime);
        previousTime = args.time;
      }

      // Integrated phases keep live edits to rate parameters from rewriting the
      // accumulated angle. virtualDelta also carries the modulation rack's
      // _timeScale destination, unlike multiplying an absolute time by a rate.
      driftPhase += virtualDelta * currentParams.driftSpeed;
      wavePhase += virtualDelta * currentParams.waveSpeed;

      if (pulseStrength > 0) {
        pulseAge += virtualDelta;
        pulseStrength = pulseAge < 2.35 ? Math.exp(-pulseAge * 0.58) : 0;
      }

      setVeilUniform('uDriftPhase', driftPhase);
      setVeilUniform('uWavePhase', wavePhase);
      setVeilUniform('uPulse', pulseStrength);
      setVeilUniform('uPulsePhase', pulseAge * 3.05);
    },

    setParams(patch) {
      const needsRebuild = patch.detail !== undefined
        && patch.detail !== currentParams.detail;
      Object.assign(currentParams, patch);

      // Detail is the sole topology key. Count only changes the instance draw
      // range and radius is a scale/uniform, so all three geometry controls stay
      // cheap except when tessellation genuinely changes.
      if (needsRebuild) buildVeils();
      if (patch.veilCount !== undefined && veilGeometry) {
        updateVeilLayers(veilGeometry, currentParams.veilCount);
      }
      if (patch.coreRadius !== undefined) {
        coreMesh.scale.setScalar(currentParams.coreRadius);
        setVeilUniform('uCoreRadius', currentParams.coreRadius);
      }

      if (patch.veilSpread !== undefined) {
        setVeilUniform('uVeilSpread', currentParams.veilSpread);
      }
      if (patch.twist !== undefined) {
        setVeilUniform('uTwist', currentParams.twist);
      }
      if (patch.waveAmp !== undefined) {
        setVeilUniform('uWaveAmp', currentParams.waveAmp);
      }
      if (patch.breatheAmp !== undefined) {
        setVeilUniform('uBreatheAmp', currentParams.breatheAmp);
      }
      if (patch.opacity !== undefined) {
        setVeilUniform('uOpacity', currentParams.opacity);
      }
      if (patch.edgeGlow !== undefined) {
        setVeilUniform('uEdgeGlow', currentParams.edgeGlow);
      }

      if (patch.coreColor !== undefined) {
        coreMaterial.uniforms.uCoreColor.value.set(currentParams.coreColor);
      }
      if (patch.veilColor !== undefined) {
        veilMaterial.uniforms.uVeilColor.value.set(currentParams.veilColor);
        coreMaterial.uniforms.uVeilColor.value.set(currentParams.veilColor);
      }
      if (patch.accentColor !== undefined) {
        veilMaterial.uniforms.uAccentColor.value.set(currentParams.accentColor);
        coreMaterial.uniforms.uAccentColor.value.set(currentParams.accentColor);
      }
    },

    onPulse() {
      pulseAge = 0;
      pulseStrength = 1;
    },

    dispose() {
      disposeVeils();
      group.remove(coreMesh);
      coreGeometry.dispose();
      coreMaterial.dispose();
      veilMaterial.dispose();
      scene.remove(group);
    },
  };
}
