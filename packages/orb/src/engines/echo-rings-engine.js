import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { canvasSize } from '../core/canvas-size.js';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const ECHO_DURATION = 2.7;
const MAX_ECHOES = 6;
// How long a resting ring takes to swing onto a remembered wavefront.
const SETTLE_IN = 0.6;

// Pulse origins deliberately use a fixed sequence. Replaying the same clicks
// should produce the same composition in every variation-grid cell.
const ECHO_DIRECTIONS = [
  [0.31, 0.82, 0.48],
  [-0.73, 0.28, 0.62],
  [0.58, -0.54, 0.61],
  [-0.24, -0.86, 0.45],
  [0.88, 0.19, -0.43],
  [-0.52, 0.67, -0.53],
].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

export function createEchoRingsEngine({ scene, renderer, params }) {
  const currentParams = {
    ringCount: 7,
    segments: 128,
    radius: 1.72,

    lineWidth: 2.4,
    tiltSpread: 0.92,
    ringSpacing: 0.82,
    idleWave: 0.42,
    pulseStrength: 1.35,
    driftSpeed: 0.14,
    propagationSpeed: 1,
    pingRate: 0.18,
    memoryHold: 10,

    baseColor: '#123039',
    echoColor: '#42d9ff',
    coreColor: '#e8fdff',
    glow: 1.65,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let orbGeometry = null;
  let orbMaterial = null;
  let orbMesh = null;
  let idleRings = [];
  let echoes = [];
  let echoCursor = 0;
  let pulseSerial = 0;
  let driftPhase = 0;
  let idlePhase = 0;
  // Spontaneous pings accumulate on a clock rather than a random draw, so every
  // grid cell with the same settings pings at the same moments.
  let pingClock = 0;

  // The memory: each resting ring can hold one remembered wavefront. An echo
  // at its widest is a great circle; the ring it lands on swings round to lie
  // along it, holds, and eases back into the drift, so the stack of rings is a
  // record of the recent pulses rather than decoration.
  let memories = [];
  let memoryCursor = 0;

  // CSS pixels, as onResize gives them; the drawing buffer is larger by the
  // pixel ratio and would halve every line on a 2× display until a resize.
  const resolution = canvasSize(renderer);

  const zAxis = new THREE.Vector3(0, 0, 1);
  const ringNormal = new THREE.Vector3();
  const ringQuaternion = new THREE.Quaternion();
  const basisU = new THREE.Vector3();
  const basisV = new THREE.Vector3();
  const echoPoint = new THREE.Vector3();
  const referenceAxis = new THREE.Vector3();
  const rememberedNormal = new THREE.Vector3();
  const rememberedQuaternion = new THREE.Quaternion();

  function makeMaterial(width, opacity) {
    const material = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      linewidth: width,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });
    material.resolution.copy(resolution);
    return material;
  }

  function makeLayeredRing() {
    const geometry = new LineGeometry();
    const haloMaterial = makeMaterial(currentParams.lineWidth * 3.8, 0.12);
    const coreMaterial = makeMaterial(currentParams.lineWidth, 0.72);
    const halo = new Line2(geometry, haloMaterial);
    const core = new Line2(geometry, coreMaterial);

    // Echo positions move without recomputing a bounding sphere. Disabling
    // frustum culling avoids a stale bound making a wave disappear mid-flight.
    halo.frustumCulled = false;
    core.frustumCulled = false;
    halo.renderOrder = 1;
    core.renderOrder = 2;

    const container = new THREE.Group();
    container.add(halo, core);
    group.add(container);

    return {
      container,
      geometry,
      haloMaterial,
      coreMaterial,
      halo,
      core,
      positions: new Float32Array((currentParams.segments + 1) * 3),
    };
  }

  function setCirclePositions(ring, radius) {
    const { positions } = ring;
    for (let i = 0; i <= currentParams.segments; i++) {
      const angle = (i / currentParams.segments) * TAU;
      const offset = i * 3;
      positions[offset] = Math.cos(angle) * radius;
      positions[offset + 1] = Math.sin(angle) * radius;
      positions[offset + 2] = 0;
    }
    ring.geometry.setPositions(positions);
  }

  function uploadMovingPositions(ring) {
    // LineGeometry.setPositions allocates a paired segment array. Echoes update
    // every frame, so mutate that existing interleaved array instead of making
    // up to six new arrays per instance (and nine instances in grid mode).
    const interleaved = ring.geometry.attributes.instanceStart.data;
    const paired = interleaved.array;
    const { positions } = ring;
    for (let i = 0; i < currentParams.segments; i++) {
      const source = i * 3;
      const target = i * 6;
      paired[target] = positions[source];
      paired[target + 1] = positions[source + 1];
      paired[target + 2] = positions[source + 2];
      paired[target + 3] = positions[source + 3];
      paired[target + 4] = positions[source + 4];
      paired[target + 5] = positions[source + 5];
    }
    interleaved.needsUpdate = true;
  }

  function setRingColors(ring, ringIndex, isEcho) {
    const base = new THREE.Color(currentParams.baseColor);
    const echo = new THREE.Color(currentParams.echoColor);
    const core = new THREE.Color(currentParams.coreColor);
    const mixed = new THREE.Color();
    const colors = new Float32Array((currentParams.segments + 1) * 3);
    const intensity = currentParams.glow * (isEcho ? 1.2 : 0.72);

    for (let i = 0; i <= currentParams.segments; i++) {
      const angle = (i / currentParams.segments) * TAU;
      const broadWave = 0.5 + 0.5 * Math.sin(angle * 2 + ringIndex * 1.37);
      const hotCore = Math.pow(
        0.5 + 0.5 * Math.sin(angle * 3 - ringIndex * 0.91),
        8
      );
      mixed.copy(isEcho ? echo : base)
        .lerp(echo, isEcho ? 0.18 * broadWave : 0.42 * broadWave)
        .lerp(core, hotCore * (isEcho ? 0.62 : 0.24));

      const offset = i * 3;
      colors[offset] = mixed.r * intensity;
      colors[offset + 1] = mixed.g * intensity;
      colors[offset + 2] = mixed.b * intensity;
    }
    ring.geometry.setColors(colors);
  }

  function disposeRing(ring) {
    group.remove(ring.container);
    ring.geometry.dispose();
    ring.haloMaterial.dispose();
    ring.coreMaterial.dispose();
  }

  function disposeGeometry() {
    idleRings.forEach(disposeRing);
    echoes.forEach(disposeRing);
    idleRings = [];
    echoes = [];

    if (orbMesh) group.remove(orbMesh);
    orbGeometry?.dispose();
    orbMaterial?.dispose();
    orbGeometry = null;
    orbMaterial = null;
    orbMesh = null;
  }

  function buildGeometry() {
    disposeGeometry();

    const sphereSegments = Math.max(32, Math.floor(currentParams.segments / 2));
    orbGeometry = new THREE.SphereGeometry(
      currentParams.radius * 0.985,
      sphereSegments,
      Math.max(20, Math.floor(sphereSegments / 2))
    );
    orbMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uBaseColor: { value: new THREE.Color(currentParams.baseColor) },
        uCoreColor: { value: new THREE.Color(currentParams.coreColor) },
        uGlow: { value: currentParams.glow },
        uIdle: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewPosition = viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;

        uniform vec3 uBaseColor;
        uniform vec3 uCoreColor;
        uniform float uGlow;
        uniform float uIdle;

        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
          vec3 viewDir = normalize(-vViewPosition);
          float rim = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 3.2);
          float inner = 0.035 + 0.018 * sin(uIdle);
          vec3 darkBody = uBaseColor * inner;
          vec3 edge = mix(uBaseColor, uCoreColor, 0.62) * rim * uGlow * 0.19;
          gl_FragColor = vec4(darkBody + edge, 1.0);
        }
      `,
      depthTest: true,
      depthWrite: true,
    });
    orbMesh = new THREE.Mesh(orbGeometry, orbMaterial);
    orbMesh.renderOrder = 0;
    group.add(orbMesh);

    for (let i = 0; i < currentParams.ringCount; i++) {
      const ring = makeLayeredRing();
      ring.index = i;
      setCirclePositions(ring, currentParams.radius * 1.012);
      setRingColors(ring, i, false);
      idleRings.push(ring);
    }

    for (let i = 0; i < MAX_ECHOES; i++) {
      const ring = makeLayeredRing();
      ring.active = false;
      ring.age = 0;
      ring.phase = 0;
      ring.axis = new THREE.Vector3();
      ring.container.visible = false;
      setCirclePositions(ring, 0.001);
      setRingColors(ring, i, true);
      echoes.push(ring);
    }

    echoCursor = 0;
    memories = idleRings.map(() => ({ axis: new THREE.Vector3(0, 1, 0), age: Infinity }));
    memoryCursor = 0;
  }

  // 0 before a memory lands, rising to 1 as the ring swings onto it, and back
  // to 0 across the last part of the hold.
  function memoryWeight(age) {
    const hold = Number(currentParams.memoryHold) || 0;
    if (!(hold > 0) || !Number.isFinite(age)) return 0;
    return THREE.MathUtils.smoothstep(age, 0, SETTLE_IN)
      * (1 - THREE.MathUtils.smoothstep(age, hold * 0.6, hold + SETTLE_IN));
  }

  function remember(axis) {
    if (!memories.length) return;
    const slot = memories[memoryCursor];
    slot.axis.copy(axis);
    slot.age = 0;
    memoryCursor = (memoryCursor + 1) % memories.length;
  }

  function emitEcho() {
    const ring = echoes[echoCursor];
    ring.active = true;
    ring.settled = false;
    ring.age = 0;
    ring.phase = 0;
    ring.axis.copy(ECHO_DIRECTIONS[pulseSerial % ECHO_DIRECTIONS.length]);
    ring.container.visible = true;
    ring.container.scale.setScalar(1);
    echoCursor = (echoCursor + 1) % echoes.length;
    pulseSerial++;
  }

  function refreshColors() {
    orbMaterial?.uniforms.uBaseColor.value.set(currentParams.baseColor);
    orbMaterial?.uniforms.uCoreColor.value.set(currentParams.coreColor);
    if (orbMaterial) orbMaterial.uniforms.uGlow.value = currentParams.glow;
    idleRings.forEach((ring, i) => setRingColors(ring, i, false));
    echoes.forEach((ring, i) => setRingColors(ring, i, true));
  }

  function refreshWidths() {
    for (const ring of [...idleRings, ...echoes]) {
      ring.haloMaterial.linewidth = currentParams.lineWidth * 3.8;
      ring.coreMaterial.linewidth = currentParams.lineWidth;
    }
  }

  function updateIdleRings() {
    const countDenominator = Math.max(1, idleRings.length - 1);

    for (let i = 0; i < idleRings.length; i++) {
      const ring = idleRings[i];
      const centered = (i / countDenominator) * 2 - 1;
      const inclination = 0.12
        + Math.abs(centered) * currentParams.tiltSpread
        + Math.sin(driftPhase * 0.37 + i * 1.7) * 0.045;
      const azimuth = i * GOLDEN_ANGLE * currentParams.ringSpacing
        + driftPhase * (0.72 + i * 0.017);

      ringNormal.set(
        Math.sin(inclination) * Math.cos(azimuth),
        Math.cos(inclination),
        Math.sin(inclination) * Math.sin(azimuth)
      ).normalize();
      ringQuaternion.setFromUnitVectors(zAxis, ringNormal);

      // A ring holding a memory lies along that wavefront instead. Either face
      // of the circle is the same ring, so turn to whichever is nearer.
      const memory = memories[i];
      const weight = memory ? memoryWeight(memory.age) : 0;
      if (weight > 0) {
        rememberedNormal.copy(memory.axis);
        if (rememberedNormal.dot(ringNormal) < 0) rememberedNormal.negate();
        rememberedQuaternion.setFromUnitVectors(zAxis, rememberedNormal);
        ringQuaternion.slerp(rememberedQuaternion, weight);
      }
      ring.container.quaternion.copy(ringQuaternion);

      const wave = Math.sin(
        idlePhase * 1.35 - i * currentParams.ringSpacing * 1.8
      );
      const breathing = 1 + wave * currentParams.idleWave * 0.018;
      ring.container.scale.setScalar(breathing);
      // A ring catching a wavefront flares, then keeps a little extra light
      // for as long as it remembers.
      const flare = memory && Number.isFinite(memory.age) ? Math.exp(-memory.age * 1.2) : 0;
      ring.haloMaterial.opacity = 0.045
        + currentParams.idleWave * (0.035 + 0.035 * (wave * 0.5 + 0.5))
        + weight * (0.08 + 0.25 * flare);
      ring.coreMaterial.opacity = 0.24
        + currentParams.idleWave * (0.13 + 0.12 * (wave * 0.5 + 0.5))
        + weight * (0.3 + 0.6 * flare);
    }
  }

  function updateEchoGeometry(ring, theta, lift) {
    const axis = ring.axis;
    referenceAxis.set(0, 1, 0);
    if (Math.abs(axis.y) > 0.9) referenceAxis.set(1, 0, 0);
    basisU.crossVectors(referenceAxis, axis).normalize();
    basisV.crossVectors(axis, basisU).normalize();

    const sphereRadius = currentParams.radius + lift;
    const circleRadius = Math.sin(theta) * sphereRadius;
    const centreDistance = Math.cos(theta) * sphereRadius;
    const { positions } = ring;

    for (let i = 0; i <= currentParams.segments; i++) {
      const angle = (i / currentParams.segments) * TAU;
      echoPoint.copy(axis).multiplyScalar(centreDistance)
        .addScaledVector(basisU, Math.cos(angle) * circleRadius)
        .addScaledVector(basisV, Math.sin(angle) * circleRadius);
      const offset = i * 3;
      positions[offset] = echoPoint.x;
      positions[offset + 1] = echoPoint.y;
      positions[offset + 2] = echoPoint.z;
    }
    uploadMovingPositions(ring);
  }

  function updateEchoes(dt) {
    for (const ring of echoes) {
      if (!ring.active) continue;

      ring.age += dt;
      ring.phase += dt * currentParams.propagationSpeed * (Math.PI / ECHO_DURATION);
      const life = ring.age / ECHO_DURATION;
      if (life >= 1) {
        ring.active = false;
        ring.container.visible = false;
        continue;
      }

      // Speeds above 1 carry the front just past the antipode before it dies.
      // That small geometric overshoot plus the damped brightness overshoot
      // keeps a pulse from feeling like a linear scale animation.
      const theta = Math.min(Math.PI * 1.08, ring.phase);
      // At a quarter turn the front is a great circle, its widest: that is the
      // shape a resting ring takes on to remember it.
      if (!ring.settled && ring.phase >= Math.PI / 2) {
        ring.settled = true;
        remember(ring.axis);
      }
      const spring = Math.exp(-5.5 * life) * Math.sin(life * 24);
      const lift = 0.018
        + currentParams.pulseStrength * (0.045 + 0.025 * spring)
          * Math.sin(Math.PI * life);
      updateEchoGeometry(ring, theta, lift);

      const attack = THREE.MathUtils.smoothstep(life, 0, 0.09);
      const fade = 1 - THREE.MathUtils.smoothstep(life, 0.24, 1);
      const brightnessOvershoot = 1 + Math.exp(-7 * life) * Math.sin(life * 25) * 0.42;
      const intensity = Math.max(
        0,
        attack * fade * fade * brightnessOvershoot * currentParams.pulseStrength
      );
      ring.haloMaterial.opacity = Math.min(0.42, intensity * 0.22);
      ring.coreMaterial.opacity = Math.min(1, intensity * 0.78);
    }
  }

  const GEOMETRY_KEYS = ['ringCount', 'segments', 'radius'];
  buildGeometry();

  return {
    // At defaults the furthest point is radius + pulse lift:
    // 1.72 + (0.018 + 1.35 * 0.07) = 1.8325 world units.
    frame: { radius: 1.84 },

    update({ delta } = {}) {
      // Clamping prevents a hidden-tab resume from aging every remembered wave
      // out in one frame. A paused studio passes zero, so every integrated phase
      // remains exactly still.
      const dt = Number.isFinite(delta)
        ? THREE.MathUtils.clamp(delta, 0, 0.05)
        : 0;
      driftPhase += dt * currentParams.driftSpeed;
      idlePhase += dt;
      for (const memory of memories) memory.age += dt;

      pingClock += dt * Math.max(0, Number(currentParams.pingRate) || 0);
      if (pingClock >= 1) {
        pingClock %= 1;
        emitEcho();
      }

      if (orbMaterial) orbMaterial.uniforms.uIdle.value = idlePhase;
      updateIdleRings();
      updateEchoes(dt);
    },

    setParams(patch) {
      const needsRebuild = GEOMETRY_KEYS.some(
        (key) => patch[key] !== undefined && patch[key] !== currentParams[key]
      );
      Object.assign(currentParams, patch);

      if (needsRebuild) {
        buildGeometry();
        return;
      }

      if (patch.lineWidth !== undefined) refreshWidths();
      if (
        patch.baseColor !== undefined
        || patch.echoColor !== undefined
        || patch.coreColor !== undefined
        || patch.glow !== undefined
      ) {
        refreshColors();
      }
    },

    onPulse() {
      emitEcho();
    },

    onResize(width, height) {
      resolution.set(Math.max(1, width), Math.max(1, height));
      for (const ring of [...idleRings, ...echoes]) {
        ring.haloMaterial.resolution.copy(resolution);
        ring.coreMaterial.resolution.copy(resolution);
      }
    },

    dispose() {
      disposeGeometry();
      scene.remove(group);
    },
  };
}
