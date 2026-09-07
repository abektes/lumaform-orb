import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const FRAME_RADIUS = 2.35;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

// Build Euler tour over doubled edges so Line2 can draw the graph in one polyline
function buildEulerTour(nodeCount, edges) {
  const adjacency = Array.from({ length: nodeCount }, () => []);
  const edgeCount = edges.length;
  for (let i = 0; i < edgeCount; i += 2) {
    const a = edges[i];
    const b = edges[i + 1];
    const edgeIdx = i / 2;
    for (let c = 0; c < 2; c++) {
      const copyIdx = edgeIdx * 2 + c;
      adjacency[a].push([copyIdx, b]);
      adjacency[b].push([copyIdx, a]);
    }
  }

  const used = new Uint8Array(edgeCount);
  const cursors = new Uint32Array(nodeCount);
  const stack = [0];
  const reversed = [];

  while (stack.length > 0) {
    const node = stack[stack.length - 1];
    const neighbours = adjacency[node];
    while (cursors[node] < neighbours.length && used[neighbours[cursors[node]][0]]) {
      cursors[node]++;
    }

    if (cursors[node] >= neighbours.length) {
      reversed.push(stack.pop());
      continue;
    }

    const [copyIdx, neighbour] = neighbours[cursors[node]++];
    if (used[copyIdx]) continue;
    used[copyIdx] = 1;
    stack.push(neighbour);
  }

  return Uint32Array.from(reversed.reverse());
}

// Generates a connected branching hyphal network anchored on a sphere shell
function generateMyceliumNetwork(targetBranches, radius, spread) {
  const rootCount = Math.max(4, Math.round(targetBranches / 14));
  const nodes = [];
  const edges = [];
  const edgeList = []; // [nodeA, nodeB]

  // Roots distributed via spherical Fibonacci
  for (let i = 0; i < rootCount; i++) {
    const theta = 2 * Math.PI * i / GOLDEN_RATIO;
    const phi = Math.acos(1 - 2 * (i + 0.5) / rootCount);
    const x = Math.sin(phi) * Math.cos(theta) * radius;
    const y = Math.sin(phi) * Math.sin(theta) * radius;
    const z = Math.cos(phi) * radius;
    nodes.push(new THREE.Vector3(x, y, z));
  }

  // Connect adjacent roots into a base backbone loop to ensure graph connectivity
  for (let i = 0; i < rootCount; i++) {
    const next = (i + 1) % rootCount;
    edgeList.push([i, next]);
  }

  // Dendritic growth with stochastic branching
  const activeTips = [...Array(rootCount).keys()];
  let branchesCreated = 0;
  let safety = 0;

  // Simple deterministic hash for procedural consistency
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  while (branchesCreated < targetBranches && activeTips.length > 0 && safety++ < 1000) {
    const tipIdx = activeTips[Math.floor(rnd() * activeTips.length)];
    const tipPos = nodes[tipIdx];
    const tipNormal = tipPos.clone().normalize();

    // Growth direction tangential to sphere with some radial fluctuation
    const randDir = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const tangent = randDir.sub(tipNormal.clone().multiplyScalar(randDir.dot(tipNormal))).normalize();
    const stepLength = (0.28 + rnd() * 0.22) * (radius / 1.6);
    const radialOffset = (rnd() - 0.48) * spread * 0.25;

    const newPos = tipPos.clone()
      .addScaledVector(tangent, stepLength)
      .normalize()
      .multiplyScalar(radius + radialOffset);

    const newIdx = nodes.length;
    nodes.push(newPos);
    edgeList.push([tipIdx, newIdx]);
    branchesCreated++;

    // Anastomosis: occasionally reconnect to a nearby existing node
    if (rnd() < 0.22 && nodes.length > 8) {
      let closestIdx = -1;
      let closestDistSq = 0.5 * 0.5;
      for (let j = 0; j < nodes.length - 1; j++) {
        if (j === tipIdx) continue;
        const dSq = newPos.distanceToSquared(nodes[j]);
        if (dSq < closestDistSq) {
          closestDistSq = dSq;
          closestIdx = j;
        }
      }
      if (closestIdx !== -1) {
        edgeList.push([newIdx, closestIdx]);
      }
    }

    // Branching: either advance tip or split
    if (rnd() < 0.35) {
      activeTips.push(newIdx); // split: both old tip and new node stay active
    } else {
      const idxInTips = activeTips.indexOf(tipIdx);
      activeTips[idxInTips] = newIdx; // advance
    }
  }

  for (const [a, b] of edgeList) {
    edges.push(a, b);
  }

  return { nodes, edges: Uint32Array.from(edges) };
}

export function createMyceliumEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    branchCount: 96,
    networkRadius: 1.65,
    nodeScale: 0.045,
    lineWidth: 2.2,
    signalFrequency: 1.2,
    conductionRate: 1.8,
    branchSpread: 0.55,
    pulseCascade: 1.5,
    breatheAmp: 0.035,
    hyphaColor: '#00f2fe',
    signalColor: '#ffed00',
    nodeColor: '#a855f7',
    glowIntensity: 1.5,
    coreDarkness: 0.75,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let network = null;
  let eulerTour = null;
  let tourColors = null;
  let line = null;
  let lineGeometry = null;
  let lineMaterial = null;
  let nodeMesh = null;
  let nodeGeometry = null;
  let nodeMaterial = null;
  let coreMesh = null;
  let coreGeometry = null;
  let coreMaterial = null;

  // Signal state
  const activeSignals = []; // [{ fromNode, toNode, progress, speed, intensity }]
  let nodeCharges = new Float32Array(0);
  let pulseTimer = 0;
  let pulseWave = 0;
  let motionTime = 0;

  const tempColor = new THREE.Color();
  const hyphaRGB = new THREE.Color(currentParams.hyphaColor);
  const signalRGB = new THREE.Color(currentParams.signalColor);
  const nodeRGB = new THREE.Color(currentParams.nodeColor);
  const tempMatrix = new THREE.Matrix4();
  const tempPos = new THREE.Vector3();

  function buildGraph() {
    if (line) {
      group.remove(line);
      lineGeometry.dispose();
      lineMaterial.dispose();
      line = null;
    }
    if (nodeMesh) {
      group.remove(nodeMesh);
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      nodeMesh = null;
    }
    if (coreMesh) {
      group.remove(coreMesh);
      coreGeometry.dispose();
      coreMaterial.dispose();
      coreMesh = null;
    }

    const branchCount = Number(currentParams.branchCount) || 96;
    const radius = Number(currentParams.networkRadius) || 1.65;
    const spread = Number(currentParams.branchSpread) || 0.55;

    network = generateMyceliumNetwork(branchCount, radius, spread);
    const nodeCount = network.nodes.length;
    nodeCharges = new Float32Array(nodeCount);

    eulerTour = buildEulerTour(nodeCount, network.edges);
    const tourLen = eulerTour.length;

    // Line2 geometry along Euler tour
    const positions = new Float32Array(tourLen * 3);
    tourColors = new Float32Array(tourLen * 3);

    for (let i = 0; i < tourLen; i++) {
      const nodeIdx = eulerTour[i];
      const pos = network.nodes[nodeIdx];
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      tourColors[i * 3] = hyphaRGB.r;
      tourColors[i * 3 + 1] = hyphaRGB.g;
      tourColors[i * 3 + 2] = hyphaRGB.b;
    }

    lineGeometry = new LineGeometry();
    lineGeometry.setPositions(positions);
    lineGeometry.setColors(tourColors);

    const size = renderer?.getSize ? renderer.getSize(new THREE.Vector2()) : new THREE.Vector2(1024, 768);
    lineMaterial = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      linewidth: Number(currentParams.lineWidth) || 2.2,
      resolution: size,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    line = new Line2(lineGeometry, lineMaterial);
    line.computeLineDistances();
    group.add(line);

    // Instanced nodes at junctions
    nodeGeometry = new THREE.SphereGeometry(1, 10, 10);
    nodeMaterial = new THREE.MeshBasicMaterial({
      color: nodeRGB,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    nodeMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, nodeCount);

    const baseScale = Number(currentParams.nodeScale) || 0.045;
    for (let i = 0; i < nodeCount; i++) {
      const pos = network.nodes[i];
      tempMatrix.makeTranslation(pos.x, pos.y, pos.z);
      tempMatrix.scale(new THREE.Vector3(baseScale, baseScale, baseScale));
      nodeMesh.setMatrixAt(i, tempMatrix);
      nodeMesh.setColorAt(i, nodeRGB);
    }
    nodeMesh.instanceMatrix.needsUpdate = true;
    if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;
    group.add(nodeMesh);

    // Dark core sphere for occlusion & depth contrast
    const coreR = radius * 0.91;
    coreGeometry = new THREE.SphereGeometry(coreR, 32, 24);
    coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x020408,
      transparent: true,
      opacity: Number(currentParams.coreDarkness) || 0.75,
      depthWrite: true,
    });
    coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(coreMesh);
  }

  buildGraph();

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      const dt = Math.min(delta || 0, 1 / 30);
      motionTime = time;

      // Decay pulse wave
      if (pulseWave > 0) {
        pulseWave = Math.max(0, pulseWave - dt * 1.8);
      }

      // Conduction rate
      const conductionSpeed = Number(currentParams.conductionRate) || 1.8;
      const freq = Number(currentParams.signalFrequency) || 1.2;

      // Periodic background signal injection
      pulseTimer += dt * freq;
      if (pulseTimer > 1.0 && network && network.nodes.length > 0) {
        pulseTimer -= 1.0;
        const rootIdx = Math.floor(Math.random() * Math.min(8, network.nodes.length));
        // Find outgoing edge
        const edgeCopies = network.edges;
        for (let i = 0; i < edgeCopies.length; i += 2) {
          if (edgeCopies[i] === rootIdx) {
            activeSignals.push({
              fromNode: rootIdx,
              toNode: edgeCopies[i + 1],
              progress: 0,
              speed: conductionSpeed * (0.8 + Math.random() * 0.4),
              intensity: 1.0,
            });
            break;
          }
        }
      }

      // Advance active signals
      for (let i = activeSignals.length - 1; i >= 0; i--) {
        const sig = activeSignals[i];
        sig.progress += dt * sig.speed;
        if (sig.progress >= 1.0) {
          // Reached destination node
          const toNode = sig.toNode;
          if (toNode < nodeCharges.length) {
            nodeCharges[toNode] = Math.min(2.5, nodeCharges[toNode] + sig.intensity * 1.2);
            // Chance to branch to child edge
            if (activeSignals.length < 32 && Math.random() < 0.65) {
              const edgeCopies = network.edges;
              for (let e = 0; e < edgeCopies.length; e += 2) {
                if (edgeCopies[e] === toNode && edgeCopies[e + 1] !== sig.fromNode) {
                  activeSignals.push({
                    fromNode: toNode,
                    toNode: edgeCopies[e + 1],
                    progress: 0,
                    speed: conductionSpeed * (0.8 + Math.random() * 0.4),
                    intensity: sig.intensity * 0.75,
                  });
                  break;
                }
              }
            }
          }
          activeSignals.splice(i, 1);
        }
      }

      // Decay node charges
      const decay = Math.exp(-dt * 5.0);
      for (let i = 0; i < nodeCharges.length; i++) {
        nodeCharges[i] *= decay;
      }

      // Dynamic breathing
      const breathe = 1.0 + Math.sin(time * 1.4) * (Number(currentParams.breatheAmp) || 0.035);
      group.scale.set(breathe, breathe, breathe);

      // Subtle rotation for 3D presence
      group.rotation.y = time * 0.08;
      group.rotation.x = Math.sin(time * 0.05) * 0.12;

      // Update node instance transforms and colors
      if (nodeMesh && network) {
        const baseScale = Number(currentParams.nodeScale) || 0.045;
        const glow = Number(currentParams.glowIntensity) || 1.5;
        for (let i = 0; i < network.nodes.length; i++) {
          const pos = network.nodes[i];
          const charge = nodeCharges[i] + pulseWave * (0.4 + 0.6 * Math.sin(i * 1.7 + time * 3.0));
          const scale = baseScale * (1.0 + charge * 2.2);

          tempMatrix.makeTranslation(pos.x, pos.y, pos.z);
          tempMatrix.scale(tempPos.set(scale, scale, scale));
          nodeMesh.setMatrixAt(i, tempMatrix);

          tempColor.copy(nodeRGB).lerp(signalRGB, Math.min(1.0, charge));
          tempColor.multiplyScalar(glow * (1.0 + charge * 1.5));
          nodeMesh.setColorAt(i, tempColor);
        }
        nodeMesh.instanceMatrix.needsUpdate = true;
        if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;
      }

      // Update line vertex colors along Euler tour
      if (lineGeometry && eulerTour && tourColors) {
        const tourLen = eulerTour.length;
        const glow = Number(currentParams.glowIntensity) || 1.5;

        // Base color with pulse wave lighting
        for (let i = 0; i < tourLen; i++) {
          const nodeIdx = eulerTour[i];
          const charge = nodeCharges[nodeIdx] + pulseWave * 0.7;

          tempColor.copy(hyphaRGB).lerp(signalRGB, Math.min(1.0, charge * 0.8));
          tempColor.multiplyScalar(glow * (0.6 + charge * 1.2));

          tourColors[i * 3] = tempColor.r;
          tourColors[i * 3 + 1] = tempColor.g;
          tourColors[i * 3 + 2] = tempColor.b;
        }

        // Highlight active signals along their edges
        for (let s = 0; s < activeSignals.length; s++) {
          const sig = activeSignals[s];
          const from = sig.fromNode;
          const to = sig.toNode;
          const progress = sig.progress;

          // Find occurrences of this edge in Euler tour
          for (let i = 0; i < tourLen - 1; i++) {
            if ((eulerTour[i] === from && eulerTour[i + 1] === to) ||
                (eulerTour[i] === to && eulerTour[i + 1] === from)) {
              const boostA = Math.max(0, 1.0 - Math.abs(progress - 0.0) * 2.5);
              const boostB = Math.max(0, 1.0 - Math.abs(progress - 1.0) * 2.5);

              tourColors[i * 3] += signalRGB.r * boostA * glow * 1.5;
              tourColors[i * 3 + 1] += signalRGB.g * boostA * glow * 1.5;
              tourColors[i * 3 + 2] += signalRGB.b * boostA * glow * 1.5;

              tourColors[(i + 1) * 3] += signalRGB.r * boostB * glow * 1.5;
              tourColors[(i + 1) * 3 + 1] += signalRGB.g * boostB * glow * 1.5;
              tourColors[(i + 1) * 3 + 2] += signalRGB.b * boostB * glow * 1.5;
            }
          }
        }

        lineGeometry.setColors(tourColors);
      }
    },

    setParams(patch) {
      let needsRebuild = false;
      if (patch.branchCount !== undefined && patch.branchCount !== currentParams.branchCount) {
        currentParams.branchCount = patch.branchCount;
        needsRebuild = true;
      }
      if (patch.networkRadius !== undefined && patch.networkRadius !== currentParams.networkRadius) {
        currentParams.networkRadius = patch.networkRadius;
        needsRebuild = true;
      }
      if (patch.nodeScale !== undefined && patch.nodeScale !== currentParams.nodeScale) {
        currentParams.nodeScale = patch.nodeScale;
        needsRebuild = true;
      }
      if (patch.lineWidth !== undefined && patch.lineWidth !== currentParams.lineWidth) {
        currentParams.lineWidth = patch.lineWidth;
        if (lineMaterial) lineMaterial.linewidth = patch.lineWidth;
      }

      Object.assign(currentParams, patch);

      if (patch.hyphaColor !== undefined) hyphaRGB.set(patch.hyphaColor);
      if (patch.signalColor !== undefined) signalRGB.set(patch.signalColor);
      if (patch.nodeColor !== undefined) nodeRGB.set(patch.nodeColor);

      if (patch.coreDarkness !== undefined && coreMaterial) {
        coreMaterial.opacity = patch.coreDarkness;
      }

      if (needsRebuild) {
        buildGraph();
      }
    },

    onPulse() {
      pulseWave = Number(currentParams.pulseCascade) || 1.5;
      if (network && network.nodes.length > 0) {
        // Scatter a burst of active signals across multiple nodes
        const count = Math.min(12, network.nodes.length);
        const conductionSpeed = Number(currentParams.conductionRate) || 1.8;
        for (let i = 0; i < count; i++) {
          const rootIdx = Math.floor(Math.random() * network.nodes.length);
          nodeCharges[rootIdx] = 2.0;
          const edgeCopies = network.edges;
          for (let e = 0; e < edgeCopies.length; e += 2) {
            if (edgeCopies[e] === rootIdx) {
              activeSignals.push({
                fromNode: rootIdx,
                toNode: edgeCopies[e + 1],
                progress: 0,
                speed: conductionSpeed * 1.5,
                intensity: 1.8,
              });
              break;
            }
          }
        }
      }
    },

    onResize(width, height) {
      if (lineMaterial) {
        lineMaterial.resolution.set(width, height);
      }
    },

    dispose() {
      scene.remove(group);
      if (line) {
        group.remove(line);
        lineGeometry?.dispose();
        lineMaterial?.dispose();
      }
      if (nodeMesh) {
        group.remove(nodeMesh);
        nodeGeometry?.dispose();
        nodeMaterial?.dispose();
      }
      if (coreMesh) {
        group.remove(coreMesh);
        coreGeometry?.dispose();
        coreMaterial?.dispose();
      }
      activeSignals.length = 0;
      nodeCharges = new Float32Array(0);
    },
  };
}
