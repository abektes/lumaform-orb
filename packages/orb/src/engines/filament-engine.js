import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { canvasSize } from '../core/canvas-size.js';

const MAX_FRAME_DELTA = 1 / 60;
const MAX_SUBSTEP = 1 / 120;
const MAX_DISPLACEMENT_RATIO = 0.22;
const MAX_VELOCITY_RATIO = 3;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function vertexKey(x, y, z) {
  const clean = (value) => Math.abs(value) < 5e-7 ? 0 : value;
  return `${clean(x).toFixed(6)},${clean(y).toFixed(6)},${clean(z).toFixed(6)}`;
}

function buildRenderRoute(nodeCount, edges) {
  // A Line2 is one continuous polyline. Doubling each spring makes every node
  // even-degree, so an Euler tour can draw the whole graph without introducing
  // false chords between otherwise unrelated edges.
  const adjacency = Array.from({ length: nodeCount }, () => []);
  const edgeCopies = edges.length;
  for (let edge = 0; edge < edgeCopies; edge += 2) {
    const a = edges[edge];
    const b = edges[edge + 1];
    const springIndex = edge / 2;
    for (let copy = 0; copy < 2; copy++) {
      const copyIndex = springIndex * 2 + copy;
      adjacency[a].push([copyIndex, b]);
      adjacency[b].push([copyIndex, a]);
    }
  }

  const used = new Uint8Array(edgeCopies);
  const cursors = new Uint32Array(nodeCount);
  const stack = [0];
  const reversed = [];

  while (stack.length) {
    const node = stack[stack.length - 1];
    const neighbours = adjacency[node];
    while (cursors[node] < neighbours.length && used[neighbours[cursors[node]][0]]) {
      cursors[node]++;
    }

    if (cursors[node] >= neighbours.length) {
      reversed.push(stack.pop());
      continue;
    }

    const [copyIndex, neighbour] = neighbours[cursors[node]++];
    if (used[copyIndex]) continue;
    used[copyIndex] = 1;
    stack.push(neighbour);
  }

  return Uint32Array.from(reversed.reverse());
}

function buildTopology(subdivision, radius) {
  // Three's detail is a triangle frequency rather than the customary geodesic
  // subdivision level. 1, 3 and 7 produce the expected 42, 162 and 642 nodes.
  const detail = (2 ** subdivision) - 1;
  const source = new THREE.IcosahedronGeometry(1, detail);
  const sourcePositions = source.attributes.position.array;
  const verticesByKey = new Map();
  const triangleKeys = [];

  for (let i = 0; i < sourcePositions.length; i += 9) {
    const triangle = [];
    for (let corner = 0; corner < 3; corner++) {
      const offset = i + corner * 3;
      const x = sourcePositions[offset];
      const y = sourcePositions[offset + 1];
      const z = sourcePositions[offset + 2];
      const key = vertexKey(x, y, z);
      if (!verticesByKey.has(key)) verticesByKey.set(key, [x, y, z]);
      triangle.push(key);
    }
    triangleKeys.push(triangle);
  }
  source.dispose();

  const keys = [...verticesByKey.keys()].sort();
  const indexByKey = new Map(keys.map((key, index) => [key, index]));
  const nodeCount = keys.length;
  const restPositions = new Float32Array(nodeCount * 3);
  const idlePhases = new Float32Array(nodeCount);

  for (let i = 0; i < nodeCount; i++) {
    const vertex = verticesByKey.get(keys[i]);
    const offset = i * 3;
    restPositions[offset] = vertex[0] * radius;
    restPositions[offset + 1] = vertex[1] * radius;
    restPositions[offset + 2] = vertex[2] * radius;
    idlePhases[i] = (vertex[0] * 0.72 + vertex[1] * 0.43 - vertex[2] * 0.54) * Math.PI * 2.2;
  }

  const uniqueEdges = new Set();
  for (const triangle of triangleKeys) {
    const indices = triangle.map((key) => indexByKey.get(key));
    for (let edge = 0; edge < 3; edge++) {
      const a = indices[edge];
      const b = indices[(edge + 1) % 3];
      uniqueEdges.add(a < b ? `${a}:${b}` : `${b}:${a}`);
    }
  }

  const edgePairs = [...uniqueEdges]
    .map((key) => key.split(':').map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const edges = new Uint32Array(edgePairs.length * 2);
  const restLengths = new Float32Array(edgePairs.length);

  for (let i = 0; i < edgePairs.length; i++) {
    const [a, b] = edgePairs[i];
    edges[i * 2] = a;
    edges[i * 2 + 1] = b;
    const ai = a * 3;
    const bi = b * 3;
    const dx = restPositions[bi] - restPositions[ai];
    const dy = restPositions[bi + 1] - restPositions[ai + 1];
    const dz = restPositions[bi + 2] - restPositions[ai + 2];
    restLengths[i] = Math.hypot(dx, dy, dz);
  }

  return {
    nodeCount,
    edges,
    restLengths,
    restPositions,
    idlePhases,
    renderRoute: buildRenderRoute(nodeCount, edges),
  };
}

export function createFilamentEngine({ scene, renderer, params }) {
  const currentParams = {
    subdivision: 2,
    radius: 1.6,
    nodeSize: 0.03,
    lineWidth: 1.8,
    stiffness: 0.35,
    damping: 0.94,
    tether: 0.06,
    pulseStrength: 0.5,
    idleExcitation: 0.05,
    waveSpeed: 0.4,
    displacementGlow: 1.5,
    restColor: '#1e293b',
    activeColor: '#ffed00',
    nodeColor: '#ffffff',
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const lineMaterial = new LineMaterial({
    color: 0xffffff,
    vertexColors: true,
    linewidth: currentParams.lineWidth,
    transparent: true,
    opacity: 0.58,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // CSS pixels, as onResize gives them; the drawing buffer is larger by the
  // pixel ratio and would halve every line on a 2× display until a resize.
  lineMaterial.resolution.copy(canvasSize(renderer));

  const nodeGeometry = new THREE.SphereGeometry(1, 10, 8);
  const nodeMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(currentParams.nodeColor),
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

  const restColor = new THREE.Color(currentParams.restColor);
  const activeColor = new THREE.Color(currentParams.activeColor);
  const instanceMatrix = new THREE.Matrix4();
  const frame = { radius: 0 };

  let topology = null;
  let positions = null;
  let velocities = null;
  let accelerations = null;
  let nextAccelerations = null;
  let nodeColors = null;
  let linePositions = null;
  let lineColors = null;
  let lineGeometry = null;
  let lineMesh = null;
  let nodeMesh = null;
  let pulseIndex = 0;
  let fallbackTime = 0;

  function updateFrameRadius() {
    frame.radius = Math.max(0.01, currentParams.radius) * (1 + MAX_DISPLACEMENT_RATIO)
      + Math.max(0, currentParams.nodeSize);
  }

  function disposeTopologyMeshes() {
    if (lineMesh) group.remove(lineMesh);
    if (nodeMesh) group.remove(nodeMesh);
    lineGeometry?.dispose();
    nodeMesh?.dispose();
    lineGeometry = null;
    lineMesh = null;
    nodeMesh = null;
  }

  function rebuildTopology() {
    disposeTopologyMeshes();

    const subdivision = Math.min(3, Math.max(1, Math.round(currentParams.subdivision)));
    const radius = Math.max(0.01, currentParams.radius);
    topology = buildTopology(subdivision, radius);
    positions = new Float32Array(topology.restPositions);
    velocities = new Float32Array(topology.nodeCount * 3);
    accelerations = new Float32Array(topology.nodeCount * 3);
    nextAccelerations = new Float32Array(topology.nodeCount * 3);
    nodeColors = new Float32Array(topology.nodeCount * 3);
    linePositions = new Float32Array(topology.renderRoute.length * 3);
    lineColors = new Float32Array(topology.renderRoute.length * 3);

    lineGeometry = new LineGeometry();
    lineGeometry.setPositions(linePositions);
    lineGeometry.setColors(lineColors);
    lineMesh = new Line2(lineGeometry, lineMaterial);
    lineMesh.frustumCulled = false;
    lineMesh.renderOrder = 1;
    group.add(lineMesh);

    nodeMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, topology.nodeCount);
    nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    nodeMesh.frustumCulled = false;
    nodeMesh.renderOrder = 2;
    group.add(nodeMesh);
    updateFrameRadius();
  }

  function computeAccelerations(target, time) {
    target.fill(0);
    const springStrength = 18 + Math.max(0, currentParams.stiffness) * 150;

    for (let spring = 0; spring < topology.restLengths.length; spring++) {
      const a = topology.edges[spring * 2];
      const b = topology.edges[spring * 2 + 1];
      const ai = a * 3;
      const bi = b * 3;
      const dx = positions[bi] - positions[ai];
      const dy = positions[bi + 1] - positions[ai + 1];
      const dz = positions[bi + 2] - positions[ai + 2];
      const length = Math.max(1e-6, Math.hypot(dx, dy, dz));
      const force = springStrength * (length - topology.restLengths[spring]) / length;
      const fx = dx * force;
      const fy = dy * force;
      const fz = dz * force;
      target[ai] += fx;
      target[ai + 1] += fy;
      target[ai + 2] += fz;
      target[bi] -= fx;
      target[bi + 1] -= fy;
      target[bi + 2] -= fz;
    }

    const radius = Math.max(0.01, currentParams.radius);
    const tetherStrength = Math.max(0, currentParams.tether) * 24;
    const idleStrength = Math.max(0, currentParams.idleExcitation) * radius * 0.6;
    const idleTime = time * Math.max(0, currentParams.waveSpeed) * Math.PI * 2;

    for (let node = 0; node < topology.nodeCount; node++) {
      const offset = node * 3;
      const rx = topology.restPositions[offset];
      const ry = topology.restPositions[offset + 1];
      const rz = topology.restPositions[offset + 2];
      const wave = Math.sin(idleTime - topology.idlePhases[node]);
      target[offset] += (rx - positions[offset]) * tetherStrength + (rx / radius) * wave * idleStrength;
      target[offset + 1] += (ry - positions[offset + 1]) * tetherStrength + (ry / radius) * wave * idleStrength;
      target[offset + 2] += (rz - positions[offset + 2]) * tetherStrength + (rz / radius) * wave * idleStrength;
    }
  }

  function constrainNode(node) {
    const offset = node * 3;
    const radius = Math.max(0.01, currentParams.radius);
    const maxDisplacement = radius * MAX_DISPLACEMENT_RATIO;
    let dx = positions[offset] - topology.restPositions[offset];
    let dy = positions[offset + 1] - topology.restPositions[offset + 1];
    let dz = positions[offset + 2] - topology.restPositions[offset + 2];
    const displacement = Math.hypot(dx, dy, dz);

    if (!Number.isFinite(displacement)) {
      positions[offset] = topology.restPositions[offset];
      positions[offset + 1] = topology.restPositions[offset + 1];
      positions[offset + 2] = topology.restPositions[offset + 2];
      velocities[offset] = 0;
      velocities[offset + 1] = 0;
      velocities[offset + 2] = 0;
      return;
    }

    if (displacement > maxDisplacement) {
      const scale = maxDisplacement / displacement;
      dx *= scale;
      dy *= scale;
      dz *= scale;
      positions[offset] = topology.restPositions[offset] + dx;
      positions[offset + 1] = topology.restPositions[offset + 1] + dy;
      positions[offset + 2] = topology.restPositions[offset + 2] + dz;

      const outwardVelocity = (velocities[offset] * dx + velocities[offset + 1] * dy
        + velocities[offset + 2] * dz) / (maxDisplacement * maxDisplacement);
      if (outwardVelocity > 0) {
        velocities[offset] -= dx * outwardVelocity;
        velocities[offset + 1] -= dy * outwardVelocity;
        velocities[offset + 2] -= dz * outwardVelocity;
      }
    }

    const maxVelocity = radius * MAX_VELOCITY_RATIO;
    const speed = Math.hypot(velocities[offset], velocities[offset + 1], velocities[offset + 2]);
    if (!Number.isFinite(speed)) {
      velocities[offset] = 0;
      velocities[offset + 1] = 0;
      velocities[offset + 2] = 0;
    } else if (speed > maxVelocity) {
      const scale = maxVelocity / speed;
      velocities[offset] *= scale;
      velocities[offset + 1] *= scale;
      velocities[offset + 2] *= scale;
    }
  }

  function simulateStep(dt, time) {
    computeAccelerations(accelerations, time);
    const halfDtSquared = 0.5 * dt * dt;

    for (let node = 0; node < topology.nodeCount; node++) {
      const offset = node * 3;
      positions[offset] += velocities[offset] * dt + accelerations[offset] * halfDtSquared;
      positions[offset + 1] += velocities[offset + 1] * dt + accelerations[offset + 1] * halfDtSquared;
      positions[offset + 2] += velocities[offset + 2] * dt + accelerations[offset + 2] * halfDtSquared;
      constrainNode(node);
    }

    computeAccelerations(nextAccelerations, time + dt);
    const damping = Math.min(0.9999, Math.max(0, currentParams.damping));
    const dampingFactor = Math.exp(-(1 - damping) * 10 * dt);

    for (let node = 0; node < topology.nodeCount; node++) {
      const offset = node * 3;
      velocities[offset] = (velocities[offset]
        + (accelerations[offset] + nextAccelerations[offset]) * 0.5 * dt) * dampingFactor;
      velocities[offset + 1] = (velocities[offset + 1]
        + (accelerations[offset + 1] + nextAccelerations[offset + 1]) * 0.5 * dt) * dampingFactor;
      velocities[offset + 2] = (velocities[offset + 2]
        + (accelerations[offset + 2] + nextAccelerations[offset + 2]) * 0.5 * dt) * dampingFactor;
      constrainNode(node);
    }
  }

  function updateVisuals() {
    const radius = Math.max(0.01, currentParams.radius);
    const glow = Math.max(0, currentParams.displacementGlow);
    const displacementRange = radius * 0.12;
    const nodeSize = Math.max(0, currentParams.nodeSize);

    for (let node = 0; node < topology.nodeCount; node++) {
      const offset = node * 3;
      const dx = positions[offset] - topology.restPositions[offset];
      const dy = positions[offset + 1] - topology.restPositions[offset + 1];
      const dz = positions[offset + 2] - topology.restPositions[offset + 2];
      const displacement = Math.hypot(dx, dy, dz);
      const mix = Math.min(1, displacement / displacementRange * glow);
      const brightness = 0.72 + mix * (0.55 + glow * 0.18);
      nodeColors[offset] = (restColor.r + (activeColor.r - restColor.r) * mix) * brightness;
      nodeColors[offset + 1] = (restColor.g + (activeColor.g - restColor.g) * mix) * brightness;
      nodeColors[offset + 2] = (restColor.b + (activeColor.b - restColor.b) * mix) * brightness;

      const nodeScale = nodeSize * (1 + mix * 0.45);
      instanceMatrix.makeScale(nodeScale, nodeScale, nodeScale);
      instanceMatrix.setPosition(positions[offset], positions[offset + 1], positions[offset + 2]);
      nodeMesh.setMatrixAt(node, instanceMatrix);
    }
    nodeMesh.instanceMatrix.needsUpdate = true;

    for (let point = 0; point < topology.renderRoute.length; point++) {
      const node = topology.renderRoute[point];
      const source = node * 3;
      const target = point * 3;
      linePositions[target] = positions[source];
      linePositions[target + 1] = positions[source + 1];
      linePositions[target + 2] = positions[source + 2];
      lineColors[target] = nodeColors[source];
      lineColors[target + 1] = nodeColors[source + 1];
      lineColors[target + 2] = nodeColors[source + 2];
    }
    lineGeometry.setPositions(linePositions);
    lineGeometry.setColors(lineColors);
  }

  function applyPulse() {
    const y = Math.sin(pulseIndex * 1.13) * 0.42;
    const horizontal = Math.sqrt(1 - y * y);
    const angle = pulseIndex * GOLDEN_ANGLE;
    const entryX = Math.cos(angle) * horizontal;
    const entryY = y;
    const entryZ = Math.sin(angle) * horizontal;
    pulseIndex++;

    const radius = Math.max(0.01, currentParams.radius);
    const impulse = Math.max(0, currentParams.pulseStrength) * radius * 1.4;
    let strongestNode = 0;
    let strongestDot = -Infinity;

    for (let node = 0; node < topology.nodeCount; node++) {
      const offset = node * 3;
      const nx = topology.restPositions[offset] / radius;
      const ny = topology.restPositions[offset + 1] / radius;
      const nz = topology.restPositions[offset + 2] / radius;
      const dot = nx * entryX + ny * entryY + nz * entryZ;
      if (dot > strongestDot) {
        strongestDot = dot;
        strongestNode = node;
      }
      if (dot <= 0.86) continue;
      const weight = ((dot - 0.86) / 0.14) ** 2;
      velocities[offset] += nx * impulse * weight;
      velocities[offset + 1] += ny * impulse * weight;
      velocities[offset + 2] += nz * impulse * weight;
      constrainNode(node);
    }

    if (strongestDot <= 0.86) {
      const offset = strongestNode * 3;
      velocities[offset] += topology.restPositions[offset] / radius * impulse;
      velocities[offset + 1] += topology.restPositions[offset + 1] / radius * impulse;
      velocities[offset + 2] += topology.restPositions[offset + 2] / radius * impulse;
      constrainNode(strongestNode);
    }
  }

  rebuildTopology();
  updateVisuals();

  return {
    frame,

    update({ time, delta } = {}) {
      const rawDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
      const frameDelta = Math.min(rawDelta, MAX_FRAME_DELTA);
      const now = Number.isFinite(time) ? time : fallbackTime + frameDelta;
      fallbackTime = now;

      if (frameDelta > 0) {
        const substeps = Math.ceil(frameDelta / MAX_SUBSTEP);
        const stepDelta = frameDelta / substeps;
        const startTime = now - frameDelta;
        for (let step = 0; step < substeps; step++) {
          simulateStep(stepDelta, startTime + step * stepDelta);
        }
      }
      updateVisuals();
    },

    setParams(patch) {
      const needsRebuild = (
        patch.subdivision !== undefined && patch.subdivision !== currentParams.subdivision
      ) || (
        patch.radius !== undefined && patch.radius !== currentParams.radius
      );
      Object.assign(currentParams, patch);

      if (patch.restColor !== undefined) restColor.set(currentParams.restColor);
      if (patch.activeColor !== undefined) activeColor.set(currentParams.activeColor);
      if (patch.nodeColor !== undefined) nodeMaterial.color.set(currentParams.nodeColor);
      if (patch.lineWidth !== undefined) lineMaterial.linewidth = currentParams.lineWidth;
      if (patch.nodeSize !== undefined) updateFrameRadius();

      if (needsRebuild) rebuildTopology();
    },

    onPulse() {
      applyPulse();
    },

    onResize(width, height) {
      lineMaterial.resolution.set(Math.max(1, width), Math.max(1, height));
    },

    dispose() {
      disposeTopologyMeshes();
      lineMaterial.dispose();
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      scene.remove(group);
    },
  };
}
