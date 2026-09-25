import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  advectShellPoint,
  bandLimits,
  constrainToBand,
  createTrailHistory,
  pushTrailTowards,
  resetTrailHistory,
  writeOrderedTrail,
} from './curl-drift-field.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const GLOW_VERTEX = /* glsl */ `
  varying float vFacing;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 viewNormal = normalize(normalMatrix * normal);
    vFacing = abs(dot(viewNormal, normalize(-mvPosition.xyz)));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGlow;
  uniform float uPulse;
  varying float vFacing;

  void main() {
    float core = pow(vFacing, 3.5);
    float alpha = core * (0.045 + uPulse * 0.018);
    gl_FragColor = vec4(uColor * uGlow, alpha);
  }
`;

const HEAD_VERTEX = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float depthScale = clamp(8.0 / max(1.0, -mvPosition.z), 0.7, 1.8);
    gl_PointSize = uSize * uPixelRatio * depthScale;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const HEAD_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGlow;
  uniform float uPulse;

  void main() {
    vec2 p = gl_PointCoord - vec2(0.5);
    float radius = length(p);
    if (radius > 0.5) discard;
    float halo = smoothstep(0.5, 0.0, radius);
    float core = smoothstep(0.22, 0.0, radius);
    float alpha = halo * 0.55 + core * 0.45;
    gl_FragColor = vec4(uColor * uGlow * (1.0 + core + uPulse * 0.4), alpha);
  }
`;

function hashUnit(a, b, c) {
  let h = Math.imul(a + 1, 0x9e3779b1)
    ^ Math.imul(b + 11, 0x85ebca77)
    ^ Math.imul(c + 37, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function createCurlDriftEngine({ scene, renderer, params }) {
  const currentParams = {
    streamCount: 64,
    trailLength: 96,
    shellRadius: 1.6,
    lineWidth: 1.3,
    fieldScale: 1.05,
    fieldEvolveSpeed: 0.08,
    flowSpeed: 1.05,
    shellBinding: 1.15,
    swirl: 0.55,
    lifetimeJitter: 0.3,
    coverage: 1,
    coverageCenter: 0,
    headColor: '#00f2fe',
    midColor: '#4f8cff',
    tailColor: '#a855f7',
    glowIntensity: 1.2,
    tailFade: 0.78,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const frame = { radius: currentParams.shellRadius * 1.5 };
  const resolution = new THREE.Vector2(1, 1);
  renderer?.getDrawingBufferSize?.(resolution);

  let streams = [];
  let lineMaterial = null;
  let headGeometry = null;
  let headMaterial = null;
  let headPoints = null;
  let glowGeometry = null;
  let glowMaterial = null;
  let glowMesh = null;
  let coreGeometry = null;
  let coreMaterial = null;
  let coreMesh = null;
  let fieldPhase = 0;
  let pulse = 0;

  const nextPosition = new Float64Array(3);
  const flowScratch = new Float64Array(6);
  const tailColor = new THREE.Color();
  const midColor = new THREE.Color();
  const headColor = new THREE.Color();
  const mixedColor = new THREE.Color();

  function pixelRatio() {
    return renderer?.getPixelRatio?.() ?? 1;
  }

  function spawnPosition(stream, generation) {
    // The configured count, not streams.length: the build spawns each stream as
    // it is pushed, so the array is still growing and stream i would see i + 1 —
    // every stream then landed at the bottom of its band, which for the default
    // full-coverage preset meant a single streak at the south pole.
    const count = Math.max(1, Math.floor(Number(currentParams.streamCount)) || streams.length || 1);
    const u = (stream.index + 0.5) / count;
    // Spawning across the whole sphere and then dragging the strays into the band
    // would leave the first seconds after a change looking like a collapse.
    const { lo, hi } = bandLimits(currentParams.coverage, currentParams.coverageCenter);
    const y = hi - (hi - lo) * u;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = stream.index * GOLDEN_ANGLE
      + generation * 1.937
      + (hashUnit(stream.index, generation, 0) - 0.5) * 0.55;
    const radius = currentParams.shellRadius
      * (0.96 + hashUnit(stream.index, generation, 1) * 0.08);

    stream.x = Math.cos(angle) * ring * radius;
    stream.y = y * radius;
    stream.z = Math.sin(angle) * ring * radius;
  }

  function resetStream(stream, initial = false) {
    if (!initial) stream.generation++;
    spawnPosition(stream, stream.generation);
    stream.lifeUnit = hashUnit(stream.index, stream.generation, 2);
    stream.radius = currentParams.shellRadius
      * (0.975 + hashUnit(stream.index, stream.generation, 4) * 0.05);
    resetTrailHistory(stream.history, stream.x, stream.y, stream.z);
    writeOrderedTrail(stream.history, stream.positions);
    stream.geometry.setPositions(stream.positions);
  }

  function updateTrailColors() {
    tailColor.set(currentParams.tailColor);
    midColor.set(currentParams.midColor ?? currentParams.headColor);
    headColor.set(currentParams.headColor);
    const fade = THREE.MathUtils.clamp(currentParams.tailFade, 0, 1);

    for (const stream of streams) {
      for (let i = 0; i < stream.history.length; i++) {
        const t = stream.history.length === 1 ? 1 : i / (stream.history.length - 1);
        const brightness = 1 - fade * (1 - Math.pow(t, 1.7));
        // Two segments rather than one. A single tail->head lerp could only ever
        // show two of a palette's three colours, so half the harmonies collapsed
        // to a near-copy of whatever the engine already looked like. It also just
        // reads better: a trail is a gradient, and a third stop lets it turn
        // through a hue on the way instead of sliding straight between two.
        const eased = Math.pow(t, 1.15);
        if (eased < 0.5) {
          mixedColor.copy(tailColor).lerp(midColor, eased * 2);
        } else {
          mixedColor.copy(midColor).lerp(headColor, (eased - 0.5) * 2);
        }
        const j = i * 3;
        stream.colors[j] = mixedColor.r * brightness;
        stream.colors[j + 1] = mixedColor.g * brightness;
        stream.colors[j + 2] = mixedColor.b * brightness;
      }
      stream.geometry.setColors(stream.colors);
    }
  }

  function disposeRenderables() {
    for (const stream of streams) {
      group.remove(stream.line);
      stream.geometry.dispose();
    }
    streams = [];

    if (headPoints) group.remove(headPoints);
    headGeometry?.dispose();
    headMaterial?.dispose();
    headGeometry = null;
    headMaterial = null;
    headPoints = null;

    if (glowMesh) group.remove(glowMesh);
    glowGeometry?.dispose();
    glowMaterial?.dispose();
    glowGeometry = null;
    glowMaterial = null;
    glowMesh = null;

    if (coreMesh) group.remove(coreMesh);
    coreGeometry?.dispose();
    coreMaterial?.dispose();
    coreGeometry = null;
    coreMaterial = null;
    coreMesh = null;

    lineMaterial?.dispose();
    lineMaterial = null;
  }

  function buildRenderables() {
    disposeRenderables();

    const streamCount = Math.max(1, Math.floor(Number(currentParams.streamCount)));
    const trailLength = Math.max(2, Math.floor(Number(currentParams.trailLength)));

    lineMaterial = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      linewidth: currentParams.lineWidth,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });
    lineMaterial.resolution.copy(resolution);
    lineMaterial.color.setRGB(
      currentParams.glowIntensity,
      currentParams.glowIntensity,
      currentParams.glowIntensity
    );

    for (let i = 0; i < streamCount; i++) {
      const history = createTrailHistory(trailLength);
      const geometry = new LineGeometry();
      const positions = new Float32Array(trailLength * 3);
      const colors = new Float32Array(trailLength * 3);
      geometry.setPositions(positions);
      geometry.setColors(colors);

      const line = new Line2(geometry, lineMaterial);
      line.frustumCulled = false;
      line.renderOrder = 2;
      group.add(line);

      const stream = {
        index: i,
        generation: 0,
        lifeUnit: 0,
        radius: currentParams.shellRadius,
        x: 0,
        y: 0,
        z: 0,
        history,
        geometry,
        positions,
        colors,
        line,
      };
      streams.push(stream);
      resetStream(stream, true);
    }

    updateTrailColors();

    headGeometry = new THREE.BufferGeometry();
    headGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(streamCount * 3), 3)
    );
    headMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(currentParams.headColor) },
        uGlow: { value: currentParams.glowIntensity },
        uPulse: { value: pulse },
        uSize: { value: currentParams.lineWidth * 2.2 },
        uPixelRatio: { value: pixelRatio() },
      },
      vertexShader: HEAD_VERTEX,
      fragmentShader: HEAD_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });
    headPoints = new THREE.Points(headGeometry, headMaterial);
    headPoints.frustumCulled = false;
    headPoints.renderOrder = 3;
    group.add(headPoints);

    glowGeometry = new THREE.SphereGeometry(currentParams.shellRadius * 0.9, 24, 16);
    glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: tailColor.clone().lerp(headColor, 0.45) },
        uGlow: { value: currentParams.glowIntensity },
        uPulse: { value: pulse },
      },
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.renderOrder = 1;
    group.add(glowMesh);

    coreGeometry = new THREE.SphereGeometry(currentParams.shellRadius * 0.91, 32, 24);
    coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x01030a,
      depthTest: true,
      depthWrite: true,
    });
    coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    coreMesh.renderOrder = 0;
    group.add(coreMesh);

    frame.radius = currentParams.shellRadius * 1.5;
  }

  function refreshColors() {
    updateTrailColors();
    lineMaterial?.color.setRGB(
      currentParams.glowIntensity,
      currentParams.glowIntensity,
      currentParams.glowIntensity
    );
    headMaterial?.uniforms.uColor.value.set(currentParams.headColor);
    headMaterial.uniforms.uGlow.value = currentParams.glowIntensity;
    tailColor.set(currentParams.tailColor);
    headColor.set(currentParams.headColor);
    glowMaterial?.uniforms.uColor.value.copy(midColor);
    glowMaterial.uniforms.uGlow.value = currentParams.glowIntensity;
  }

  buildRenderables();

  return {
    frame,

    update({ delta = 0 } = {}) {
      const dt = Math.min(Math.max(delta, 0), 1 / 30);
      if (dt <= 0) return;

      fieldPhase += dt * currentParams.fieldEvolveSpeed;
      pulse *= Math.exp(-dt * 2.8);
      const surge = 1 + pulse * 1.8;
      const step = dt * currentParams.flowSpeed * surge;
      const shellRadius = currentParams.shellRadius;
      const headPositions = headGeometry.attributes.position.array;
      // Recomputed every frame so the band can be modulated — the pull is applied
      // continuously rather than at spawn, so widening or narrowing it migrates the
      // existing streams instead of resetting their trails.
      const { lo: bandLo, hi: bandHi } = bandLimits(
        currentParams.coverage,
        currentParams.coverageCenter
      );
      const bandPull = Math.min(1, dt * 3.2);

      for (const stream of streams) {
        const speedVariation = 1 + (stream.lifeUnit - 0.5)
          * 0.35 * currentParams.lifetimeJitter;
        advectShellPoint(
          stream.x,
          stream.y,
          stream.z,
          stream.radius,
          step * speedVariation,
          fieldPhase,
          currentParams.fieldScale,
          currentParams.swirl,
          nextPosition,
          flowScratch
        );
        constrainToBand(
          nextPosition[0],
          nextPosition[1],
          nextPosition[2],
          stream.radius,
          bandLo,
          bandHi,
          bandPull,
          nextPosition
        );
        stream.x = nextPosition[0];
        stream.y = nextPosition[1];
        stream.z = nextPosition[2];

        if (!Number.isFinite(stream.x + stream.y + stream.z)) {
          resetStream(stream);
        } else {
          const spacing = 0.035 / Math.max(0.55, currentParams.shellBinding);
          if (pushTrailTowards(
            stream.history,
            stream.x,
            stream.y,
            stream.z,
            spacing
          )) {
            writeOrderedTrail(stream.history, stream.positions);
          }
          const tip = stream.positions.length - 3;
          stream.positions[tip] = stream.x;
          stream.positions[tip + 1] = stream.y;
          stream.positions[tip + 2] = stream.z;
          stream.geometry.setPositions(stream.positions);
        }

        const h = stream.index * 3;
        headPositions[h] = stream.x;
        headPositions[h + 1] = stream.y;
        headPositions[h + 2] = stream.z;
      }

      headGeometry.attributes.position.needsUpdate = true;
      headMaterial.uniforms.uPulse.value = pulse;
      glowMaterial.uniforms.uPulse.value = pulse;
      const brightness = currentParams.glowIntensity * (1 + pulse * 0.2);
      lineMaterial.color.setRGB(brightness, brightness, brightness);
    },

    setParams(patch) {
      const rebuild = ['streamCount', 'trailLength', 'shellRadius'].some(
        (key) => patch[key] !== undefined && patch[key] !== currentParams[key]
      );
      Object.assign(currentParams, patch);

      if (rebuild) {
        buildRenderables();
        return;
      }

      if (patch.lineWidth !== undefined) {
        lineMaterial.linewidth = currentParams.lineWidth;
        headMaterial.uniforms.uSize.value = currentParams.lineWidth * 2.2;
      }
      if (
        patch.headColor !== undefined
        || patch.midColor !== undefined
        || patch.tailColor !== undefined
        || patch.glowIntensity !== undefined
        || patch.tailFade !== undefined
      ) {
        refreshColors();
      }
    },

    onPulse() {
      pulse = 1;
    },

    onResize(width, height) {
      resolution.set(width, height);
      lineMaterial?.resolution.copy(resolution);
      if (headMaterial) headMaterial.uniforms.uPixelRatio.value = pixelRatio();
    },

    dispose() {
      disposeRenderables();
      scene.remove(group);
    },
  };
}
