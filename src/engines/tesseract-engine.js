import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createTesseractEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    color1: '#ffed00', // Outer Cube Edges
    color2: '#00f0ff', // Inner Cube Edges
    colorStrut: '#ffffff', // Corner Struts
    nodeColor: '#ffffff', // Corner Vertex Nodes
    cellColor: '#ffed00', // Glass Facet Tint
    edgeGlow: 1.2,

    edgeMode: 'sketch', // 'sketch' (32 edges) | 'cubes' (24) | 'outer_struts' (20) | 'inner_struts' (20) | 'struts' (8)
    innerScale: 0.48, // Exactly matches the hand-drawn sketch ratio
    cubeSize: 1.35,
    edgeWidth: 2.6, // Bold confident sketch lines
    nodeSize: 0.038,
    cellOpacity: 0.0, // Clean lines by default matching sketch

    motionMode: 'sketch3d', // 'sketch3d' | 'hyperfold' | 'pulse' | 'true4d'
    rotSpeedX: 0.25,
    rotSpeedY: 0.50,
    pulseSpeed: 1.2,
    rotSpeedXW: 0.35,
    rotSpeedYW: 0.45,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  // Canonical 16 Vertices Base Unit Coordinates (±1, ±1, ±1)
  // Indices 0..7: Outer Cube
  // Indices 8..15: Inner Cube (parallel corresponding corners)
  const baseOuterCoords = [
    [-1, -1, -1], // 0: Bottom-Back-Left
    [ 1, -1, -1], // 1: Bottom-Back-Right
    [ 1,  1, -1], // 2: Top-Back-Right
    [-1,  1, -1], // 3: Top-Back-Left
    [-1, -1,  1], // 4: Bottom-Front-Left
    [ 1, -1,  1], // 5: Bottom-Front-Right
    [ 1,  1,  1], // 6: Top-Front-Right
    [-1,  1,  1], // 7: Top-Front-Left
  ];

  // 32 Canonical Edges (12 Outer + 12 Inner + 8 Struts)
  // Exactly as drawn in the user's sketch!
  const allEdges = [
    // 12 Outer Cube Edges
    { v1: 0, v2: 1, type: 'outer' },
    { v1: 1, v2: 2, type: 'outer' },
    { v1: 2, v2: 3, type: 'outer' },
    { v1: 3, v2: 0, type: 'outer' },
    { v1: 4, v2: 5, type: 'outer' },
    { v1: 5, v2: 6, type: 'outer' },
    { v1: 6, v2: 7, type: 'outer' },
    { v1: 7, v2: 4, type: 'outer' },
    { v1: 0, v2: 4, type: 'outer' },
    { v1: 1, v2: 5, type: 'outer' },
    { v1: 2, v2: 6, type: 'outer' },
    { v1: 3, v2: 7, type: 'outer' },

    // 12 Inner Cube Edges (offset by 8)
    { v1: 8,  v2: 9,  type: 'inner' },
    { v1: 9,  v2: 10, type: 'inner' },
    { v1: 10, v2: 11, type: 'inner' },
    { v1: 11, v2: 8,  type: 'inner' },
    { v1: 12, v2: 13, type: 'inner' },
    { v1: 13, v2: 14, type: 'inner' },
    { v1: 14, v2: 15, type: 'inner' },
    { v1: 15, v2: 12, type: 'inner' },
    { v1: 8,  v2: 12, type: 'inner' },
    { v1: 9,  v2: 13, type: 'inner' },
    { v1: 10, v2: 14, type: 'inner' },
    { v1: 11, v2: 15, type: 'inner' },

    // 8 Corner Connecting Struts (connect outer vertex k to inner vertex k+8)
    { v1: 0, v2: 8,  type: 'strut' },
    { v1: 1, v2: 9,  type: 'strut' },
    { v1: 2, v2: 10, type: 'strut' },
    { v1: 3, v2: 11, type: 'strut' },
    { v1: 4, v2: 12, type: 'strut' },
    { v1: 5, v2: 13, type: 'strut' },
    { v1: 6, v2: 14, type: 'strut' },
    { v1: 7, v2: 15, type: 'strut' },
  ];

  function getActiveEdges(mode) {
    if (mode === 'cubes') {
      return allEdges.filter(e => e.type === 'outer' || e.type === 'inner');
    } else if (mode === 'outer_struts') {
      return allEdges.filter(e => e.type === 'outer' || e.type === 'strut');
    } else if (mode === 'inner_struts') {
      return allEdges.filter(e => e.type === 'inner' || e.type === 'strut');
    } else if (mode === 'struts') {
      return allEdges.filter(e => e.type === 'strut');
    }
    return allEdges; // 'sketch' (all 32 edges)
  }

  let activeEdges = getActiveEdges(currentParams.edgeMode);

  // 1. High-Precision Glowing Edges (Line2)
  let linePositions = new Float32Array(activeEdges.length * 6);
  let lineColors = new Float32Array(activeEdges.length * 6);
  let lineGeometry = new LineGeometry();
  lineGeometry.setPositions(linePositions);
  lineGeometry.setColors(lineColors);

  const lineMaterial = new LineMaterial({
    color: 0xffffff,
    vertexColors: true,
    linewidth: currentParams.edgeWidth,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  lineMaterial.resolution.set(window.innerWidth, window.innerHeight);

  const lineMesh = new Line2(lineGeometry, lineMaterial);
  lineMesh.renderOrder = 2;
  group.add(lineMesh);

  // 2. Corner Vertex Beads (16 Sleek Instanced Spheres)
  const nodeSphereGeom = new THREE.SphereGeometry(1, 20, 20);
  const nodeMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(currentParams.nodeColor),
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const nodeInstancedMesh = new THREE.InstancedMesh(nodeSphereGeom, nodeMaterial, 16);
  nodeInstancedMesh.renderOrder = 3;
  group.add(nodeInstancedMesh);

  // 3. Traveling Quantum Photon Packets Along the 8 Corner Struts
  const photonGeom = new THREE.SphereGeometry(1, 16, 16);
  const photonMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff'),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const photonInstancedMesh = new THREE.InstancedMesh(photonGeom, photonMaterial, 8);
  photonInstancedMesh.renderOrder = 4;
  group.add(photonInstancedMesh);

  // 4. Translucent Hypercube Cell Facets (12 outer/inner faces + 6 connecting prism faces)
  const quadFaces = [
    // Outer cube 6 faces
    [0, 1, 2, 3], [4, 5, 6, 7], [0, 4, 7, 3], [1, 5, 6, 2], [3, 2, 6, 7], [0, 1, 5, 4],
    // Inner cube 6 faces
    [8, 9, 10, 11], [12, 13, 14, 15], [8, 12, 15, 11], [9, 13, 14, 10], [11, 10, 14, 15], [8, 9, 13, 12],
    // 6 Connecting trapezoid prism faces
    [0, 1, 9, 8], [2, 3, 11, 10], [4, 5, 13, 12], [6, 7, 15, 14], [0, 4, 12, 8], [1, 5, 13, 9]
  ];

  const cellGeom = new THREE.BufferGeometry();
  const cellPosArray = new Float32Array(quadFaces.length * 6 * 3);
  const cellColorArray = new Float32Array(quadFaces.length * 6 * 3);
  cellGeom.setAttribute('position', new THREE.BufferAttribute(cellPosArray, 3));
  cellGeom.setAttribute('color', new THREE.BufferAttribute(cellColorArray, 3));

  const cellMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: currentParams.cellOpacity,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const cellMesh = new THREE.Mesh(cellGeom, cellMaterial);
  cellMesh.renderOrder = 1;
  group.add(cellMesh);

  // 3D Vertex Position Buffers
  const vertices3D = [];
  for (let i = 0; i < 16; i++) {
    vertices3D.push(new THREE.Vector3());
  }

  const dummyMatrix = new THREE.Matrix4();
  let clickPulse = 0;

  return {
    update({ time, delta }) {
      clickPulse *= 0.92;

      // Base scale factors
      const S = currentParams.cubeSize * (1.0 + clickPulse * 0.25);
      const ratio = currentParams.innerScale;

      let outerScale = S;
      let innerScale = S * ratio;

      // Motion Dynamic evaluation
      if (currentParams.motionMode === 'sketch3d') {
        // Rigid, pristine 3D rotation preserving sketch proportions exactly
        group.rotation.x += delta * currentParams.rotSpeedX;
        group.rotation.y += delta * currentParams.rotSpeedY;
      } else if (currentParams.motionMode === 'hyperfold') {
        // Harmonic 4D Inversion Fold (Inner & Outer smoothly exchange places)
        group.rotation.x += delta * currentParams.rotSpeedX * 0.6;
        group.rotation.y += delta * currentParams.rotSpeedY * 0.6;

        const foldCycle = Math.sin(time * currentParams.pulseSpeed);
        // Breathing oscillation between outer and inner boundaries
        outerScale = S * (1.0 - 0.25 * (foldCycle * 0.5 + 0.5));
        innerScale = S * (ratio + 0.25 * (foldCycle * 0.5 + 0.5));
      } else if (currentParams.motionMode === 'pulse') {
        // Concentric Breathing along the 8 Struts
        group.rotation.x += delta * currentParams.rotSpeedX;
        group.rotation.y += delta * currentParams.rotSpeedY;

        const pulseWave = Math.sin(time * currentParams.pulseSpeed * 2.5);
        innerScale = S * (ratio + 0.12 * pulseWave);
      } else if (currentParams.motionMode === 'true4d') {
        // Continuous 4D Hyperspace Rotation (damped projection)
        const aXW = time * currentParams.rotSpeedXW + clickPulse;
        const aYW = time * currentParams.rotSpeedYW;
        const cosXW = Math.cos(aXW), sinXW = Math.sin(aXW);
        const cosYW = Math.cos(aYW), sinYW = Math.sin(aYW);
        const D = 2.5;

        for (let i = 0; i < 16; i++) {
          const isInner = i >= 8;
          const base = baseOuterCoords[i % 8];
          const w0 = isInner ? -1 : 1;
          const x0 = base[0];
          const y0 = base[1];
          const z0 = base[2];

          // 4D XW rotation
          const x1 = x0 * cosXW - w0 * sinXW;
          const w1 = x0 * sinXW + w0 * cosXW;

          // 4D YW rotation
          const y2 = y0 * cosYW - w1 * sinYW;
          const w2 = y0 * sinYW + w1 * cosYW;

          const factor = S / Math.max(D - w2 * 0.6, 0.4);
          vertices3D[i].set(x1 * factor, y2 * factor, z0 * factor);
        }
      }

      // Compute 3D Positions for non-true4d modes
      if (currentParams.motionMode !== 'true4d') {
        for (let i = 0; i < 8; i++) {
          const b = baseOuterCoords[i];
          // Outer cube vertex
          vertices3D[i].set(b[0] * outerScale, b[1] * outerScale, b[2] * outerScale);
          // Inner cube vertex
          vertices3D[i + 8].set(b[0] * innerScale, b[1] * innerScale, b[2] * innerScale);
        }
      }

      // 1. Update Corner Vertex Nodes
      const nScale = currentParams.nodeSize * (1.0 + clickPulse * 0.5);
      for (let i = 0; i < 16; i++) {
        const v = vertices3D[i];
        dummyMatrix.makeScale(nScale, nScale, nScale);
        dummyMatrix.setPosition(v.x, v.y, v.z);
        nodeInstancedMesh.setMatrixAt(i, dummyMatrix);
      }
      nodeInstancedMesh.instanceMatrix.needsUpdate = true;

      // 2. Update Traveling Photon Packets Along Struts
      for (let k = 0; k < 8; k++) {
        const pInner = vertices3D[k + 8];
        const pOuter = vertices3D[k];
        // Ping-pong pulse wave along the strut ray
        const progress = (Math.sin(time * currentParams.pulseSpeed * 2.0 + k * 0.785) * 0.5 + 0.5);
        const photonPos = pInner.clone().lerp(pOuter, progress);

        const pScale = currentParams.nodeSize * 0.85;
        dummyMatrix.makeScale(pScale, pScale, pScale);
        dummyMatrix.setPosition(photonPos.x, photonPos.y, photonPos.z);
        photonInstancedMesh.setMatrixAt(k, dummyMatrix);
      }
      photonInstancedMesh.instanceMatrix.needsUpdate = true;

      // 3. Update Edges
      const posArr = linePositions;
      const colArr = lineColors;
      const glowMul = currentParams.edgeGlow;
      const cOuter = new THREE.Color(currentParams.color1);
      const cInner = new THREE.Color(currentParams.color2);
      const cStrut = new THREE.Color(currentParams.colorStrut || '#ffffff');

      for (let e = 0; e < activeEdges.length; e++) {
        const edge = activeEdges[e];
        const p1 = vertices3D[edge.v1];
        const p2 = vertices3D[edge.v2];
        const baseIdx = e * 6;

        posArr[baseIdx]     = p1.x;
        posArr[baseIdx + 1] = p1.y;
        posArr[baseIdx + 2] = p1.z;
        posArr[baseIdx + 3] = p2.x;
        posArr[baseIdx + 4] = p2.y;
        posArr[baseIdx + 5] = p2.z;

        // Color coding by structural category
        let col1 = cOuter;
        let col2 = cOuter;

        if (edge.type === 'inner') {
          col1 = cInner;
          col2 = cInner;
        } else if (edge.type === 'strut') {
          col1 = cOuter.clone().lerp(cStrut, 0.4);
          col2 = cInner.clone().lerp(cStrut, 0.4);
        }

        colArr[baseIdx]     = col1.r * glowMul;
        colArr[baseIdx + 1] = col1.g * glowMul;
        colArr[baseIdx + 2] = col1.b * glowMul;
        colArr[baseIdx + 3] = col2.r * glowMul;
        colArr[baseIdx + 4] = col2.g * glowMul;
        colArr[baseIdx + 5] = col2.b * glowMul;
      }

      lineGeometry.setPositions(posArr);
      lineGeometry.setColors(colArr);
      lineMesh.computeLineDistances();

      // 4. Update Translucent Cell Facets (if visible)
      if (currentParams.cellOpacity > 0.001) {
        const cellPos = cellGeom.attributes.position.array;
        const cellCol = cellGeom.attributes.color.array;
        const cCell = new THREE.Color(currentParams.cellColor);
        let triIdx = 0;

        for (let f = 0; f < quadFaces.length; f++) {
          const [i0, i1, i2, i3] = quadFaces[f];
          const p0 = vertices3D[i0];
          const p1 = vertices3D[i1];
          const p2 = vertices3D[i2];
          const p3 = vertices3D[i3];

          const triVerts = [p0, p1, p2, p0, p2, p3];
          for (let tv = 0; tv < 6; tv++) {
            const pt = triVerts[tv];
            const cIdx = triIdx * 3;
            cellPos[cIdx]     = pt.x;
            cellPos[cIdx + 1] = pt.y;
            cellPos[cIdx + 2] = pt.z;

            cellCol[cIdx]     = cCell.r;
            cellCol[cIdx + 1] = cCell.g;
            cellCol[cIdx + 2] = cCell.b;
            triIdx++;
          }
        }

        cellGeom.attributes.position.needsUpdate = true;
        cellGeom.attributes.color.needsUpdate = true;
      }
    },

    setParams(newParams) {
      Object.assign(currentParams, newParams);

      if (newParams.edgeMode !== undefined) {
        activeEdges = getActiveEdges(newParams.edgeMode);
        linePositions = new Float32Array(activeEdges.length * 6);
        lineColors = new Float32Array(activeEdges.length * 6);
        lineGeometry.dispose();
        lineGeometry = new LineGeometry();
        lineGeometry.setPositions(linePositions);
        lineGeometry.setColors(lineColors);
        lineMesh.geometry = lineGeometry;
      }
      if (newParams.edgeWidth !== undefined) {
        lineMaterial.linewidth = newParams.edgeWidth;
      }
      if (newParams.cellOpacity !== undefined) {
        cellMaterial.opacity = newParams.cellOpacity;
      }
      if (newParams.nodeColor) {
        nodeMaterial.color.set(newParams.nodeColor);
      }
    },

    onPointerClick() {
      clickPulse = 1.0;
    },
    onPulse() {
      clickPulse = 1.0;
    },

    onResize(width, height) {
      lineMaterial.resolution.set(width, height);
    },

    dispose() {
      scene.remove(group);
      lineGeometry.dispose();
      lineMaterial.dispose();
      nodeSphereGeom.dispose();
      nodeMaterial.dispose();
      nodeInstancedMesh.dispose();
      photonGeom.dispose();
      photonMaterial.dispose();
      photonInstancedMesh.dispose();
      cellGeom.dispose();
      cellMaterial.dispose();
    },
  };
}
