import * as THREE from 'three';
import {
  resolveShellShape,
  shellBoundRadius,
} from './murmuration-shell.js';
import {
  createMurmurationSimulation,
  scatterMurmuration,
  stepMurmuration,
} from './murmuration-simulation.js';

const TRAIL_SAMPLE_INTERVAL = 1 / 20;

const POINT_VERTEX_SHADER = /* glsl */ `
  attribute float aRadiusMix;
  attribute float aAge;

  uniform vec3 uCoreColor;
  uniform vec3 uEdgeColor;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uTrail;
  uniform float uTrailFade;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vRadiance;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float nearMix = 1.0 - smoothstep(4.2, 9.4, -mvPosition.z);
    // The settled band (0.72-0.82 of the shell) is too narrow for a radial
    // ramp alone to reach the edge colour, so depth carries it: the far side
    // of the sphere cools toward uEdgeColor while the near side stays warm,
    // which doubles as a depth cue. Radius still separates true outliers.
    float edgeMix = smoothstep(0.62, 0.95, aRadiusMix) * 0.55;
    edgeMix = clamp(edgeMix + (1.0 - nearMix) * 0.62, 0.0, 1.0);
    vColor = mix(uCoreColor, uEdgeColor, edgeMix);
    vColor = mix(vColor, vec3(0.92, 0.97, 1.0), nearMix * 0.1);

    float ageFade = pow(max(0.0, 1.0 - aAge), 0.7);
    float trailAlpha = uTrailFade * (0.14 + ageFade * 0.86);
    vAlpha = mix(0.98, trailAlpha, uTrail) * mix(0.34, 1.0, nearMix);
    vRadiance = mix(0.55, 1.35, nearMix) * mix(1.0, 0.95, uTrail);

    float depthScale = clamp(11.0 / max(0.5, -mvPosition.z), 0.7, 2.8);
    float trailScale = mix(1.0, mix(0.82, 0.38, aAge), uTrail);
    float spriteScale = mix(2.95, 2.15, uTrail);
    gl_PointSize = max(1.0, uPointSize * uPixelRatio * depthScale * trailScale * spriteScale);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const POINT_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uGlowIntensity;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vRadiance;

  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float distanceSquared = dot(offset, offset);
    if (distanceSquared > 0.25) discard;

    float edgeMask = smoothstep(0.25, 0.15, distanceSquared);
    float core = exp(-distanceSquared * 72.0);
    float body = exp(-distanceSquared * 22.0);
    float halo = exp(-distanceSquared * 6.5);
    float alpha = (core * 0.92 + body * 0.44 + halo * 0.2) * edgeMask * vAlpha;
    vec3 light = vColor * uGlowIntensity
      * (core * 1.45 + body * 0.62 + halo * 0.28) * vRadiance;
    gl_FragColor = vec4(light, alpha);
  }
`;

const AURA_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 worldScale = vec2(
      length(vec3(modelMatrix[0])),
      length(vec3(modelMatrix[1]))
    );
    mvPosition.xy += position.xy * worldScale;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const AURA_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uCoreColor;
  uniform vec3 uEdgeColor;
  uniform float uGlowIntensity;

  varying vec2 vUv;

  void main() {
    float radius = length(vUv - vec2(0.5)) * 2.0;
    if (radius > 1.0) discard;

    float falloff = exp(-radius * radius * 3.4) * (1.0 - smoothstep(0.72, 1.0, radius));
    vec3 color = mix(uCoreColor, uEdgeColor, smoothstep(0.18, 0.92, radius));
    color = mix(color, vec3(0.3, 0.7, 0.76), 0.42);
    gl_FragColor = vec4(color * uGlowIntensity * 0.24, falloff * 0.15);
  }
`;

function numeric(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function createMurmurationEngine({ scene, renderer, params }) {
  const currentParams = {
    agentCount: 256,
    shellRadius: 1.7,
    shellShape: 'sphere',
    pointSize: 2,
    trailLength: 8,
    cohesion: 0.4,
    separation: 0.55,
    alignment: 0.35,
    neighbourRadius: 0.55,
    attractorPull: 0.5,
    gathering: 0.45,
    shellBinding: 0.8,
    agentSpeed: 1,
    damping: 0.96,
    coreColor: '#ffed00',
    edgeColor: '#00f2fe',
    glowIntensity: 1.4,
    trailFade: 0.6,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const materialUniforms = (trail) => ({
    uCoreColor: { value: new THREE.Color(currentParams.coreColor) },
    uEdgeColor: { value: new THREE.Color(currentParams.edgeColor) },
    uPointSize: { value: numeric(currentParams.pointSize, 2) },
    uPixelRatio: { value: renderer?.getPixelRatio?.() ?? 1 },
    uGlowIntensity: { value: numeric(currentParams.glowIntensity, 1.4) },
    uTrail: { value: trail ? 1 : 0 },
    uTrailFade: { value: numeric(currentParams.trailFade, 0.6) },
  });

  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: materialUniforms(false),
    vertexShader: POINT_VERTEX_SHADER,
    fragmentShader: POINT_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const trailMaterial = new THREE.ShaderMaterial({
    uniforms: materialUniforms(true),
    vertexShader: POINT_VERTEX_SHADER,
    fragmentShader: POINT_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const auraMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uCoreColor: { value: new THREE.Color(currentParams.coreColor) },
      uEdgeColor: { value: new THREE.Color(currentParams.edgeColor) },
      uGlowIntensity: { value: numeric(currentParams.glowIntensity, 1.4) },
    },
    vertexShader: AURA_VERTEX_SHADER,
    fragmentShader: AURA_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const aura = new THREE.Sprite(auraMaterial);
  aura.renderOrder = 0;
  group.add(aura);

  const frame = { radius: numeric(currentParams.shellRadius, 1.7) * 1.4 };
  let simulation;
  let pointGeometry;
  let pointCloud;
  let radiusMixes;
  let trailGeometry;
  let trailCloud;
  let trailPositions;
  let trailRadiusMixes;
  let trailHistory;
  let historyCursor = 0;
  let trailSampleElapsed = 0;

  function disposeBuffers() {
    if (pointCloud) group.remove(pointCloud);
    if (trailCloud) group.remove(trailCloud);
    pointGeometry?.dispose();
    trailGeometry?.dispose();
    pointGeometry = null;
    pointCloud = null;
    trailGeometry = null;
    trailCloud = null;
    trailPositions = null;
    trailRadiusMixes = null;
    trailHistory = null;
    trailSampleElapsed = 0;
  }

  function updateRadiusMixes() {
    const shellRadius = Math.max(0.001, numeric(currentParams.shellRadius, 1.7));
    const positions = simulation.positions;
    for (let i = 0; i < radiusMixes.length; i++) {
      const p = i * 3;
      radiusMixes[i] = Math.min(1.2, Math.hypot(
        positions[p],
        positions[p + 1],
        positions[p + 2]
      ) / shellRadius);
    }
    pointGeometry.attributes.aRadiusMix.needsUpdate = true;
  }

  function recordTrails() {
    const length = Math.max(0, Math.floor(numeric(currentParams.trailLength, 8)));
    if (!trailGeometry || length === 0) return;
    const positions = simulation.positions;
    const count = positions.length / 3;
    historyCursor = (historyCursor + 1) % length;
    trailHistory.set(positions, historyCursor * positions.length);

    let output = 0;
    const shellRadius = Math.max(0.001, numeric(currentParams.shellRadius, 1.7));
    for (let age = 1; age <= length; age++) {
      const slot = (historyCursor - age + length) % length;
      const historyOffset = slot * positions.length;
      for (let i = 0; i < count; i++) {
        const source = historyOffset + i * 3;
        const target = output * 3;
        const x = trailHistory[source];
        const y = trailHistory[source + 1];
        const z = trailHistory[source + 2];
        trailPositions[target] = x;
        trailPositions[target + 1] = y;
        trailPositions[target + 2] = z;
        trailRadiusMixes[output] = Math.min(1.2, Math.hypot(x, y, z) / shellRadius);
        output++;
      }
    }
    trailGeometry.attributes.position.needsUpdate = true;
    trailGeometry.attributes.aRadiusMix.needsUpdate = true;
  }

  function buildSwarm() {
    disposeBuffers();
    const count = Math.max(1, Math.floor(numeric(currentParams.agentCount, 256)));
    const trailLength = Math.max(0, Math.floor(numeric(currentParams.trailLength, 8)));
    const shellRadius = Math.max(0.1, numeric(currentParams.shellRadius, 1.7));
    const shellShape = resolveShellShape(currentParams.shellShape);
    simulation = createMurmurationSimulation({
      agentCount: count,
      shellRadius,
      agentSpeed: currentParams.agentSpeed,
      shellShape,
    });
    frame.radius = shellBoundRadius(shellShape, shellRadius) * 1.4;
    const auraScale = shellRadius * 2.22;
    aura.scale.set(
      auraScale,
      auraScale * (shellShape === 'disk' ? 0.42 : shellShape === 'torus' ? 0.62 : 1),
      1
    );

    radiusMixes = new Float32Array(count);
    pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(simulation.positions, 3)
    );
    pointGeometry.setAttribute('aRadiusMix', new THREE.BufferAttribute(radiusMixes, 1));
    pointGeometry.setAttribute('aAge', new THREE.BufferAttribute(new Float32Array(count), 1));
    pointCloud = new THREE.Points(pointGeometry, pointMaterial);
    pointCloud.frustumCulled = false;
    pointCloud.renderOrder = 2;
    group.add(pointCloud);
    updateRadiusMixes();

    if (trailLength > 0) {
      const ghostCount = count * trailLength;
      trailPositions = new Float32Array(ghostCount * 3);
      trailRadiusMixes = new Float32Array(ghostCount);
      trailHistory = new Float32Array(simulation.positions.length * trailLength);
      const trailAges = new Float32Array(ghostCount);
      for (let slot = 0; slot < trailLength; slot++) {
        trailHistory.set(simulation.positions, slot * simulation.positions.length);
      }
      for (let age = 1; age <= trailLength; age++) {
        trailAges.fill(age / (trailLength + 1), (age - 1) * count, age * count);
      }

      trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      trailGeometry.setAttribute(
        'aRadiusMix',
        new THREE.BufferAttribute(trailRadiusMixes, 1)
      );
      trailGeometry.setAttribute('aAge', new THREE.BufferAttribute(trailAges, 1));
      trailCloud = new THREE.Points(trailGeometry, trailMaterial);
      trailCloud.frustumCulled = false;
      trailCloud.renderOrder = 1;
      group.add(trailCloud);
      historyCursor = 0;
      trailSampleElapsed = 0;
      recordTrails();
    }
  }

  function forEachMaterial(callback) {
    callback(pointMaterial);
    callback(trailMaterial);
    callback(auraMaterial);
  }

  buildSwarm();

  return {
    frame,

    update({ delta = 0 } = {}) {
      const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
      if (dt === 0) return;
      stepMurmuration(simulation, currentParams, dt);
      pointGeometry.attributes.position.needsUpdate = true;
      updateRadiusMixes();
      trailSampleElapsed += Math.min(dt, 1 / 30);
      if (trailSampleElapsed >= TRAIL_SAMPLE_INTERVAL) {
        trailSampleElapsed %= TRAIL_SAMPLE_INTERVAL;
        recordTrails();
      }
    },

    setParams(patch = {}) {
      const needsRebuild = ['agentCount', 'trailLength', 'shellRadius', 'shellShape'].some(
        (key) => patch[key] !== undefined && patch[key] !== currentParams[key]
      );
      Object.assign(currentParams, patch);
      if (needsRebuild) {
        buildSwarm();
        return;
      }

      if (patch.pointSize !== undefined) {
        [pointMaterial, trailMaterial].forEach((material) => {
          material.uniforms.uPointSize.value = numeric(currentParams.pointSize, 2);
        });
      }
      if (patch.glowIntensity !== undefined) {
        forEachMaterial((material) => {
          material.uniforms.uGlowIntensity.value = numeric(
            currentParams.glowIntensity,
            1.4
          );
        });
      }
      if (patch.trailFade !== undefined) {
        trailMaterial.uniforms.uTrailFade.value = numeric(currentParams.trailFade, 0.6);
      }
      if (patch.coreColor !== undefined) {
        forEachMaterial((material) => {
          material.uniforms.uCoreColor.value.set(currentParams.coreColor);
        });
      }
      if (patch.edgeColor !== undefined) {
        forEachMaterial((material) => {
          material.uniforms.uEdgeColor.value.set(currentParams.edgeColor);
        });
      }
    },

    onPulse() {
      scatterMurmuration(simulation, currentParams.agentSpeed);
    },

    onResize() {
      const pixelRatio = renderer?.getPixelRatio?.() ?? 1;
      [pointMaterial, trailMaterial].forEach((material) => {
        material.uniforms.uPixelRatio.value = pixelRatio;
      });
    },

    dispose() {
      disposeBuffers();
      pointMaterial.dispose();
      trailMaterial.dispose();
      auraMaterial.dispose();
      scene.remove(group);
    },
  };
}
