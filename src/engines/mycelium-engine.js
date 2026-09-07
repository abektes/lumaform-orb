import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const TAU = Math.PI * 2;
const SEGMENTS_PER_BRANCH = 7;
const MAX_PACKETS = 12;
const TOPOLOGY_SEED = 0x6d796365;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const PACKET_VERTEX_SHADER = /* glsl */ `
  attribute float aAlpha;
  attribute float aScale;

  uniform float uPacketSize;
  uniform float uPixelRatio;

  varying float vAlpha;

  void main() {
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float depthScale = clamp(12.0 / max(0.5, -mvPosition.z), 0.8, 4.0);
    gl_PointSize = uPacketSize * aScale * uPixelRatio * depthScale * 1.45;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PACKET_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSignalColor;
  uniform float uGlow;

  varying float vAlpha;

  void main() {
    vec2 p = gl_PointCoord - vec2(0.5);
    float radius = length(p);
    if (radius > 0.5 || vAlpha <= 0.0) discard;

    float halo = smoothstep(0.5, 0.08, radius);
    float core = smoothstep(0.19, 0.0, radius);
    vec3 color = uSignalColor * (0.8 + uGlow * 0.45 + core * 1.5);
    gl_FragColor = vec4(color, vAlpha * halo);
  }
`;

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rotateInTangentPlane(out, tangent, normal, angle, scratch) {
  scratch.crossVectors(normal, tangent).normalize();
  out.copy(tangent)
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(scratch, Math.sin(angle))
    .normalize();
  return out;
}

function stepAlongSphere(out, normal, tangent, angle) {
  out.copy(normal)
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(tangent, Math.sin(angle))
    .normalize();
  return out;
}

function slerpUnit(out, from, to, t) {
  const dot = THREE.MathUtils.clamp(from.dot(to), -1, 1);
  const angle = Math.acos(dot);
  if (angle < 0.00001) return out.copy(from);
  const sinAngle = Math.sin(angle);
  return out.copy(from)
    .multiplyScalar(Math.sin((1 - t) * angle) / sinAngle)
    .addScaledVector(to, Math.sin(t * angle) / sinAngle)
    .normalize();
}

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createMyceliumEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    branchDepth: 5,
    branching: 2,
    radius: 2.1,

    lineWidth: 1.35,
    curl: 0.42,
    growth: 1,
    reach: 0.45,
    pulseStrength: 0.8,
    crawlSpeed: 0.32,
    pulseSpeed: 1.35,

    rootColor: '#b7ffe1',
    tipColor: '#287d78',
    signalColor: '#f4ffd2',
    glow: 1.55,
    packetSize: 2.4,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const frame = { radius: 2.32 };
  const rootColor = new THREE.Color(currentParams.rootColor);
  const tipColor = new THREE.Color(currentParams.tipColor);
  const scratchResolution = new THREE.Vector2(1, 1);

  let lineMesh = null;
  let lineGeometry = null;
  let lineMaterial = null;
  let lineGlowMaterial = null;
  let lineGlowMesh = null;
  let linePositions = null;
  let lineColors = null;
  let vertexNormals = null;
  let vertexTangents = null;
  let vertexProgress = null;
  let vertexPhase = null;
  let routes = [];
  let networkPathLength = 1;

  let elapsedTime = null;
  let crawlPhase = 0;
  let clickEnergy = 0;
  let clickWaveDistance = 0;
  let launchIndex = 0;

  const packetPositions = new Float32Array(MAX_PACKETS * 3);
  const packetAlphas = new Float32Array(MAX_PACKETS);
  const packetScales = new Float32Array(MAX_PACKETS);
  const packets = Array.from({ length: MAX_PACKETS }, () => ({
    active: false,
    age: 0,
    distance: 0,
    arrivalAge: 0,
    routeIndex: 0,
  }));

  const packetGeometry = new THREE.BufferGeometry();
  const packetPositionAttribute = new THREE.BufferAttribute(packetPositions, 3);
  const packetAlphaAttribute = new THREE.BufferAttribute(packetAlphas, 1);
  const packetScaleAttribute = new THREE.BufferAttribute(packetScales, 1);
  packetPositionAttribute.setUsage(THREE.DynamicDrawUsage);
  packetAlphaAttribute.setUsage(THREE.DynamicDrawUsage);
  packetGeometry.setAttribute('position', packetPositionAttribute);
  packetGeometry.setAttribute('aAlpha', packetAlphaAttribute);
  packetGeometry.setAttribute('aScale', packetScaleAttribute);

  const packetMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSignalColor: { value: new THREE.Color(currentParams.signalColor) },
      uGlow: { value: currentParams.glow },
      uPacketSize: { value: currentParams.packetSize },
      uPixelRatio: { value: renderer?.getPixelRatio?.() ?? 1 },
    },
    vertexShader: PACKET_VERTEX_SHADER,
    fragmentShader: PACKET_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });

  const packetMesh = new THREE.Points(packetGeometry, packetMaterial);
  packetMesh.frustumCulled = false;
  packetMesh.renderOrder = 3;
  group.add(packetMesh);

  // A nearly black inner body gives the surface real front and back faces
  // without competing with the network itself.
  const coreGeometry = new THREE.SphereGeometry(1, 32, 20);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0x010806,
    depthTest: true,
    depthWrite: true,
  });
  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  coreMesh.renderOrder = 0;
  group.add(coreMesh);

  function setResolution(width, height) {
    if (lineMaterial) lineMaterial.resolution.set(width, height);
    if (lineGlowMaterial) lineGlowMaterial.resolution.set(width, height);
  }

  function setInitialResolution() {
    if (renderer?.getDrawingBufferSize) {
      renderer.getDrawingBufferSize(scratchResolution);
      setResolution(scratchResolution.x, scratchResolution.y);
    } else {
      setResolution(1, 1);
    }
  }

  function clearPackets() {
    for (let i = 0; i < packets.length; i++) {
      packets[i].active = false;
      packetAlphas[i] = 0;
      packetPositions[i * 3] = 0;
      packetPositions[i * 3 + 1] = 0;
      packetPositions[i * 3 + 2] = 0;
    }
    packetPositionAttribute.needsUpdate = true;
    packetAlphaAttribute.needsUpdate = true;
  }

  function disposeNetwork() {
    if (lineMesh) group.remove(lineMesh);
    if (lineGlowMesh) group.remove(lineGlowMesh);
    lineGeometry?.dispose();
    lineMaterial?.dispose();
    lineGlowMaterial?.dispose();
    lineMesh = null;
    lineGlowMesh = null;
    lineGeometry = null;
    lineMaterial = null;
    lineGlowMaterial = null;
  }

  function buildNetwork() {
    disposeNetwork();
    clearPackets();

    const random = mulberry32(TOPOLOGY_SEED);
    const depthLimit = Math.max(2, Math.round(currentParams.branchDepth));
    const branchCount = Math.max(1, Math.round(currentParams.branching));
    const radius = currentParams.radius;
    const nodes = [];
    const edges = [];
    const leaves = [];

    const nodeCount = 64 + depthLimit * 20 + (branchCount - 1) * 24;
    const normals = [];
    for (let i = 0; i < nodeCount; i++) {
      const y = 1 - 2 * ((i + 0.5) / nodeCount);
      const theta = i * GOLDEN_ANGLE + (random() - 0.5) * 0.22;
      const horizontal = Math.sqrt(Math.max(0, 1 - y * y));
      normals.push(new THREE.Vector3(
        Math.cos(theta) * horizontal,
        y,
        Math.sin(theta) * horizontal
      ).normalize());
    }

    let rootIndex = 0;
    for (let i = 1; i < normals.length; i++) {
      if (normals[i].y - normals[i].z * 0.08
        < normals[rootIndex].y - normals[rootIndex].z * 0.08) {
        rootIndex = i;
      }
    }
    [normals[0], normals[rootIndex]] = [normals[rootIndex], normals[0]];

    for (let i = 0; i < normals.length; i++) {
      nodes.push({
        normal: normals[i],
        heading: new THREE.Vector3(),
        pathDistance: i === 0 ? 0 : Infinity,
        parentEdge: -1,
        childLoad: 0,
      });
    }
    nodes[0].heading.set(0.24, 1, 0.18)
      .projectOnPlane(nodes[0].normal)
      .normalize();

    const connected = new Uint8Array(nodeCount);
    const edgePairs = new Set();
    connected[0] = 1;

    // Grow a nearest-neighbour tree across an even shell distribution. The
    // local arcs keep the silhouette cellular rather than producing a few
    // tree-sized polygons.
    for (let step = 1; step < nodeCount; step++) {
      let parentIndex = 0;
      let childIndex = 1;
      let bestDot = -2;
      for (let parent = 0; parent < nodeCount; parent++) {
        if (!connected[parent]) continue;
        for (let child = 1; child < nodeCount; child++) {
          if (connected[child]) continue;
          const dot = nodes[parent].normal.dot(nodes[child].normal);
          if (dot > bestDot) {
            bestDot = dot;
            parentIndex = parent;
            childIndex = child;
          }
        }
      }

      const parent = nodes[parentIndex];
      const child = nodes[childIndex];
      const edgeLength = Math.acos(THREE.MathUtils.clamp(bestDot, -1, 1))
        * radius;
      child.heading.copy(child.normal)
        .addScaledVector(parent.normal, -child.normal.dot(parent.normal))
        .normalize();
      child.pathDistance = parent.pathDistance + edgeLength;
      child.parentEdge = edges.length;
      parent.childLoad++;
      edges.push({
        parentIndex,
        childIndex,
        length: edgeLength,
        startDistance: parent.pathDistance,
        endDistance: child.pathDistance,
        phase: random() * TAU,
        bend: (random() - 0.5) * 0.16,
      });
      edgePairs.add(`${Math.min(parentIndex, childIndex)}:${Math.max(parentIndex, childIndex)}`);
      connected[childIndex] = 1;
    }

    // Nearby fusions turn the tree into one mycelial web. The branching
    // control adds a second round of lateral growth without changing the
    // fixed per-frame update shape.
    for (let round = 0; round < branchCount; round++) {
      for (let parentIndex = 1 + round; parentIndex < nodeCount; parentIndex += 2) {
        let childIndex = -1;
        let bestDot = Math.cos(0.72);
        for (let candidate = 1; candidate < nodeCount; candidate++) {
          if (candidate === parentIndex) continue;
          if (nodes[candidate].pathDistance <= nodes[parentIndex].pathDistance) continue;
          const key = `${Math.min(parentIndex, candidate)}:${Math.max(parentIndex, candidate)}`;
          if (edgePairs.has(key)) continue;
          const dot = nodes[parentIndex].normal.dot(nodes[candidate].normal);
          if (dot > bestDot) {
            bestDot = dot;
            childIndex = candidate;
          }
        }
        if (childIndex < 0) continue;

        const parent = nodes[parentIndex];
        const child = nodes[childIndex];
        edges.push({
          parentIndex,
          childIndex,
          length: Math.acos(THREE.MathUtils.clamp(bestDot, -1, 1)) * radius,
          startDistance: parent.pathDistance,
          endDistance: child.pathDistance,
          phase: random() * TAU,
          bend: (random() - 0.5) * 0.12,
        });
        edgePairs.add(`${Math.min(parentIndex, childIndex)}:${Math.max(parentIndex, childIndex)}`);
      }
    }

    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i].childLoad === 0) leaves.push(i);
    }
    networkPathLength = Math.max(
      0.0001,
      ...nodes.map((node) => node.pathDistance)
    );

    const segmentCount = edges.length * SEGMENTS_PER_BRANCH;
    linePositions = new Float32Array(segmentCount * 6);
    lineColors = new Float32Array(segmentCount * 6);
    vertexNormals = new Float32Array(segmentCount * 6);
    vertexTangents = new Float32Array(segmentCount * 6);
    vertexProgress = new Float32Array(segmentCount * 2);
    vertexPhase = new Float32Array(segmentCount * 2);

    const pointNormal = new THREE.Vector3();
    const pointTangent = new THREE.Vector3();
    const bendAxis = new THREE.Vector3();
    const routeSegmentsByEdge = [];
    let segmentIndex = 0;

    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
      const edge = edges[edgeIndex];
      const parent = nodes[edge.parentIndex];
      const child = nodes[edge.childIndex];
      const branchSegments = [];

      for (let sample = 0; sample < SEGMENTS_PER_BRANCH; sample++) {
        for (let endpoint = 0; endpoint < 2; endpoint++) {
          const t = (sample + endpoint) / SEGMENTS_PER_BRANCH;
          const vertexIndex = segmentIndex * 2 + endpoint;
          const offset = vertexIndex * 3;

          slerpUnit(pointNormal, parent.normal, child.normal, t);
          bendAxis.crossVectors(parent.normal, child.normal).normalize();
          pointNormal.addScaledVector(
            bendAxis,
            Math.sin(Math.PI * t) * edge.bend
          ).normalize();
          pointTangent.copy(parent.heading)
            .lerp(child.heading, t)
            .projectOnPlane(pointNormal)
            .normalize();

          linePositions[offset] = pointNormal.x * radius;
          linePositions[offset + 1] = pointNormal.y * radius;
          linePositions[offset + 2] = pointNormal.z * radius;
          vertexNormals[offset] = pointNormal.x;
          vertexNormals[offset + 1] = pointNormal.y;
          vertexNormals[offset + 2] = pointNormal.z;
          vertexTangents[offset] = pointTangent.x;
          vertexTangents[offset + 1] = pointTangent.y;
          vertexTangents[offset + 2] = pointTangent.z;

          const distance = THREE.MathUtils.lerp(
            edge.startDistance,
            edge.endDistance,
            t
          );
          vertexProgress[vertexIndex] = distance;
          vertexPhase[vertexIndex] = edge.phase + t * 2.1;
        }

        branchSegments.push({
          segmentIndex,
          startDistance: THREE.MathUtils.lerp(
            edge.startDistance,
            edge.endDistance,
            sample / SEGMENTS_PER_BRANCH
          ),
          endDistance: THREE.MathUtils.lerp(
            edge.startDistance,
            edge.endDistance,
            (sample + 1) / SEGMENTS_PER_BRANCH
          ),
        });
        segmentIndex++;
      }
      routeSegmentsByEdge.push(branchSegments);
    }

    const progressDenominator = networkPathLength;
    for (let i = 0; i < vertexProgress.length; i++) {
      vertexProgress[i] /= progressDenominator;
    }

    routes = leaves.map((leafIndex) => {
      const edgeIndices = [];
      let nodeIndex = leafIndex;
      while (nodes[nodeIndex].parentEdge >= 0) {
        const edgeIndex = nodes[nodeIndex].parentEdge;
        edgeIndices.push(edgeIndex);
        nodeIndex = edges[edgeIndex].parentIndex;
      }
      edgeIndices.reverse();

      const segments = [];
      for (const edgeIndex of edgeIndices) {
        segments.push(...routeSegmentsByEdge[edgeIndex]);
      }
      return {
        length: nodes[leafIndex].pathDistance,
        segments,
      };
    });

    lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(linePositions);
    lineGeometry.setColors(lineColors);
    lineGeometry.attributes.instanceStart.data.setUsage(THREE.DynamicDrawUsage);
    lineGeometry.attributes.instanceColorStart.data.setUsage(THREE.DynamicDrawUsage);

    lineMaterial = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      linewidth: currentParams.lineWidth,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    lineGlowMaterial = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      linewidth: currentParams.lineWidth * 3.4,
      transparent: true,
      opacity: 0.035 + currentParams.glow * 0.025,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    setInitialResolution();

    lineGlowMesh = new LineSegments2(lineGeometry, lineGlowMaterial);
    lineGlowMesh.frustumCulled = false;
    lineGlowMesh.renderOrder = 1;
    group.add(lineGlowMesh);

    lineMesh = new LineSegments2(lineGeometry, lineMaterial);
    lineMesh.frustumCulled = false;
    lineMesh.renderOrder = 2;
    group.add(lineMesh);
    coreMesh.scale.setScalar(radius * 0.97);

    // Default bounds include the restrained radial reach, curl, and click twitch.
    frame.radius = radius + currentParams.reach * 0.12
      + currentParams.curl * 0.1
      + currentParams.pulseStrength * 0.08;
  }

  function updateNetwork() {
    if (!lineGeometry) return;

    const radius = currentParams.radius;
    const curl = currentParams.curl;
    const reach = currentParams.reach;
    const pulseStrength = currentParams.pulseStrength;
    const growth = currentParams.growth;

    for (let vertexIndex = 0; vertexIndex < vertexProgress.length; vertexIndex++) {
      const offset = vertexIndex * 3;
      const progress = vertexProgress[vertexIndex];
      const phase = vertexPhase[vertexIndex];
      const breath = Math.sin(crawlPhase * 0.5 + phase * 0.35) * 0.012;
      const radialReach = reach * 0.12 * Math.pow(progress, 1.35);
      const clickRipple = clickEnergy * pulseStrength * 0.075
        * Math.sin(progress * 13 - clickWaveDistance * 8)
        * smoothstep(0.34, 0, Math.abs(progress * networkPathLength - clickWaveDistance));
      const tangentCurl = curl * (0.025 + progress * 0.065)
        * Math.sin(phase + crawlPhase * 0.24);
      const twitch = clickEnergy * pulseStrength * progress * 0.028
        * Math.sin(phase * 2.7 + clickWaveDistance * 11);
      const radial = radius + breath + radialReach + clickRipple;

      linePositions[offset] = vertexNormals[offset] * radial
        + vertexTangents[offset] * (tangentCurl + twitch);
      linePositions[offset + 1] = vertexNormals[offset + 1] * radial
        + vertexTangents[offset + 1] * (tangentCurl + twitch);
      linePositions[offset + 2] = vertexNormals[offset + 2] * radial
        + vertexTangents[offset + 2] * (tangentCurl + twitch);

      const growthMask = smoothstep(growth + 0.08, growth - 0.015, progress);
      const taper = 1 - progress * 0.36;
      const crawl = Math.pow(
        Math.max(0, Math.cos(progress * 20 - crawlPhase * 1.8)),
        12
      );
      const signalWave = clickEnergy * smoothstep(
        0.3,
        0,
        Math.abs(progress * networkPathLength - clickWaveDistance)
      );
      const intensity = currentParams.glow
        * growthMask
        * taper
        * (0.7 + crawl * 0.42 + signalWave * pulseStrength * 0.85);
      const mix = smoothstep(0.06, 0.92, progress);

      lineColors[offset] = (rootColor.r + (tipColor.r - rootColor.r) * mix) * intensity;
      lineColors[offset + 1] = (rootColor.g + (tipColor.g - rootColor.g) * mix) * intensity;
      lineColors[offset + 2] = (rootColor.b + (tipColor.b - rootColor.b) * mix) * intensity;
    }

    lineGeometry.attributes.instanceStart.data.needsUpdate = true;
    lineGeometry.attributes.instanceColorStart.data.needsUpdate = true;
  }

  function routePosition(route, distance, targetOffset) {
    const clampedDistance = THREE.MathUtils.clamp(distance, 0, route.length);
    let selected = route.segments[route.segments.length - 1];
    for (let i = 0; i < route.segments.length; i++) {
      if (clampedDistance <= route.segments[i].endDistance) {
        selected = route.segments[i];
        break;
      }
    }

    const span = Math.max(0.0001, selected.endDistance - selected.startDistance);
    const t = THREE.MathUtils.clamp(
      (clampedDistance - selected.startDistance) / span,
      0,
      1
    );
    const sourceOffset = selected.segmentIndex * 6;
    packetPositions[targetOffset] = linePositions[sourceOffset]
      + (linePositions[sourceOffset + 3] - linePositions[sourceOffset]) * t;
    packetPositions[targetOffset + 1] = linePositions[sourceOffset + 1]
      + (linePositions[sourceOffset + 4] - linePositions[sourceOffset + 1]) * t;
    packetPositions[targetOffset + 2] = linePositions[sourceOffset + 2]
      + (linePositions[sourceOffset + 5] - linePositions[sourceOffset + 2]) * t;
  }

  function updatePackets(delta) {
    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      if (!packet.active || !routes.length) {
        packetAlphas[i] = 0;
        continue;
      }

      const previousAge = packet.age;
      packet.age += delta;
      if (packet.age < 0) {
        packetAlphas[i] = 0;
        continue;
      }

      const route = routes[packet.routeIndex % routes.length];
      const activeDelta = previousAge < 0 ? packet.age : delta;
      packet.distance += activeDelta * currentParams.pulseSpeed;
      if (packet.distance >= route.length) packet.arrivalAge += activeDelta;
      if (packet.arrivalAge > 0.75) {
        packet.active = false;
        packetAlphas[i] = 0;
        continue;
      }

      routePosition(route, packet.distance, i * 3);
      const launchFade = smoothstep(0, 0.16, packet.age);
      const arrivalFade = 1 - packet.arrivalAge / 0.75;
      packetAlphas[i] = launchFade * arrivalFade * currentParams.pulseStrength;
      packetScales[i] = 0.82 + (i % 3) * 0.12;
    }

    packetPositionAttribute.needsUpdate = true;
    packetAlphaAttribute.needsUpdate = true;
    packetScaleAttribute.needsUpdate = true;
  }

  function launchSignals() {
    if (!routes.length) return;

    clickEnergy = 1;
    clickWaveDistance = 0;
    const count = Math.min(7, 4 + Math.round(currentParams.pulseStrength * 3));
    for (let i = 0; i < count; i++) {
      let slot = packets.findIndex((packet) => !packet.active);
      if (slot < 0) slot = (launchIndex + i) % packets.length;
      const packet = packets[slot];
      packet.active = true;
      packet.age = -i * 0.085;
      packet.distance = 0;
      packet.arrivalAge = 0;
      packet.routeIndex = (launchIndex * 3 + i * 5) % routes.length;
    }
    launchIndex = (launchIndex + 1) % Math.max(1, routes.length);
  }

  const GEOMETRY_KEYS = ['branchDepth', 'branching', 'radius'];

  buildNetwork();

  return {
    frame,

    update(args = {}) {
      const time = typeof args.time === 'number'
        ? args.time
        : (elapsedTime ?? 0) + (args.delta ?? 0);
      const virtualDelta = elapsedTime === null ? 0 : Math.max(0, time - elapsedTime);
      elapsedTime = time;

      crawlPhase += virtualDelta * currentParams.crawlSpeed;
      clickWaveDistance += virtualDelta * currentParams.pulseSpeed;
      clickEnergy *= Math.exp(-virtualDelta * 2.4);

      updateNetwork();
      updatePackets(virtualDelta);

      const pointer = args.pointer;
      const delta = typeof args.delta === 'number' ? args.delta : virtualDelta;
      if (pointer && delta > 0) {
        const ease = Math.min(1, delta * 2.6);
        group.rotation.x += ((-pointer.y * 0.09) - group.rotation.x) * ease;
        group.rotation.y += ((pointer.x * 0.12) - group.rotation.y) * ease;
      }
    },

    setParams(newParams) {
      const needsRebuild = GEOMETRY_KEYS.some(
        (key) => newParams[key] !== undefined && newParams[key] !== currentParams[key]
      );
      Object.assign(currentParams, newParams);

      if (needsRebuild) {
        buildNetwork();
        return;
      }

      if (newParams.lineWidth !== undefined && lineMaterial) {
        lineMaterial.linewidth = currentParams.lineWidth;
        lineGlowMaterial.linewidth = currentParams.lineWidth * 3.4;
      }
      if (newParams.rootColor !== undefined) rootColor.set(currentParams.rootColor);
      if (newParams.tipColor !== undefined) tipColor.set(currentParams.tipColor);
      if (newParams.signalColor !== undefined) {
        packetMaterial.uniforms.uSignalColor.value.set(currentParams.signalColor);
      }
      if (newParams.glow !== undefined) {
        packetMaterial.uniforms.uGlow.value = currentParams.glow;
        lineGlowMaterial.opacity = 0.035 + currentParams.glow * 0.025;
      }
      if (newParams.packetSize !== undefined) {
        packetMaterial.uniforms.uPacketSize.value = currentParams.packetSize;
      }
    },

    onPulse() {
      launchSignals();
    },

    onResize(width, height) {
      setResolution(width, height);
      packetMaterial.uniforms.uPixelRatio.value = renderer?.getPixelRatio?.() ?? 1;
    },

    dispose() {
      disposeNetwork();
      group.remove(packetMesh);
      group.remove(coreMesh);
      packetGeometry.dispose();
      packetMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      scene.remove(group);
    },
  };
}
