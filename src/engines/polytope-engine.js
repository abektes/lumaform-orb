import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const PHI = (1 + Math.sqrt(5)) / 2; // Golden ratio 1.6180339887

// Generate regular tetrahedron geometry
function createTetrahedronGeom(radius, inverted = false) {
  const s = radius / Math.sqrt(3);
  const sign = inverted ? -1 : 1;

  // 4 vertices of a regular tetrahedron inscribed in a cube
  const v = [
    new THREE.Vector3(s, s * sign, s),
    new THREE.Vector3(-s, -s * sign, s),
    new THREE.Vector3(-s, s * sign, -s),
    new THREE.Vector3(s, -s * sign, -s),
  ];

  const geom = new THREE.BufferGeometry();
  // 4 triangular faces
  const indices = [
    0, 1, 2,
    0, 2, 3,
    0, 3, 1,
    1, 3, 2,
  ];

  const pos = [];
  for (let i = 0; i < indices.length; i++) {
    const vert = v[indices[i]];
    pos.push(vert.x, vert.y, vert.z);
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}

// Generate wireframe edges array from geometry
function extractEdges(geom) {
  const pos = geom.attributes.position.array;
  const edgeSet = new Set();
  const edges = [];

  for (let i = 0; i < pos.length; i += 9) {
    const p1 = [pos[i], pos[i + 1], pos[i + 2]];
    const p2 = [pos[i + 3], pos[i + 4], pos[i + 5]];
    const p3 = [pos[i + 6], pos[i + 7], pos[i + 8]];

    const pairs = [[p1, p2], [p2, p3], [p3, p1]];
    for (const [a, b] of pairs) {
      const k1 = `${a[0].toFixed(3)},${a[1].toFixed(3)},${a[2].toFixed(3)}`;
      const k2 = `${b[0].toFixed(3)},${b[1].toFixed(3)},${b[2].toFixed(3)}`;
      const key = k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push(...a, ...b);
      }
    }
  }
  return edges;
}

// Generate Kepler-Poinsot Stellated Icosahedron
function createStellatedGeom(radius) {
  const baseIcosa = new THREE.IcosahedronGeometry(radius * 0.55, 0);
  const pos = baseIcosa.attributes.position.array;
  const stellatedPos = [];

  // For each face, add a golden pyramid point
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
    const bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5];
    const cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];

    // Face centroid
    const mx = (ax + bx + cx) / 3;
    const my = (ay + by + cy) / 3;
    const mz = (az + bz + cz) / 3;
    const len = Math.sqrt(mx * mx + my * my + mz * mz) || 1;

    // Apex pointing outwards scaled by golden ratio
    const apexDist = radius * 1.05;
    const px = (mx / len) * apexDist;
    const py = (my / len) * apexDist;
    const pz = (mz / len) * apexDist;

    // 3 triangular faces connecting base edges to apex
    stellatedPos.push(ax, ay, az, bx, by, bz, px, py, pz);
    stellatedPos.push(bx, by, bz, cx, cy, cz, px, py, pz);
    stellatedPos.push(cx, cy, cz, ax, ay, az, px, py, pz);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(stellatedPos, 3));
  geom.computeVertexNormals();
  baseIcosa.dispose();
  return geom;
}

export function createPolytopeEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    color1: '#ffed00', // Primary star (Yang canary yellow)
    color2: '#ec4899', // Counter star (Yin neon rose)
    coreColor: '#ffffff',
    wireColor: '#00f0ff', // Geodesic cyan
    wireGlow: 1.8,
    facetDispersion: 0.75,
    polytopeType: 'merkabah', // 'merkabah' | 'kepler_star' | 'icosa_stellation'
    scale: 1.65,
    coreRadius: 0.45,
    wireThickness: 3.0,
    rotRateA: 0.60,
    rotRateB: -0.60,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  // Sub-groups for counter-rotating components
  const groupStarA = new THREE.Group();
  const groupStarB = new THREE.Group();
  group.add(groupStarA);
  group.add(groupStarB);

  // Custom Chromatic Dispersion Facet Shader
  function createFacetMaterial(colorHex) {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(colorHex) },
        dispersion: { value: currentParams.facetDispersion },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform float dispersion;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;

        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(vViewPosition);

          float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          float spec = pow(max(dot(reflect(-v, n), vec3(0.577)), 0.0), 24.0) * 0.55;

          // Prismatic chromatic dispersion across facets
          float phi = dot(vWorldPosition, vec3(1.2, 2.1, 0.8)) + uTime * 0.5;
          vec3 prism = vec3(
            sin(phi + dispersion * 2.0) * 0.5 + 0.5,
            sin(phi) * 0.5 + 0.5,
            sin(phi - dispersion * 2.0) * 0.5 + 0.5
          );

          vec3 finalCol = mix(baseColor, prism, 0.45) * 0.9 + vec3(spec);
          finalCol += baseColor * fresnel * 0.7;

          gl_FragColor = vec4(finalCol, 0.45 + fresnel * 0.4);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  const matA = createFacetMaterial(currentParams.color1);
  const matB = createFacetMaterial(currentParams.color2);

  let meshA, meshB, lineA, lineB;
  let geomA, geomB, lineGeomA, lineGeomB;
  const lineMat = new LineMaterial({
    color: 0xffffff,
    vertexColors: false,
    linewidth: currentParams.wireThickness,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  lineMat.resolution.set(window.innerWidth, window.innerHeight);

  function buildMeshes() {
    // Clean up existing
    if (meshA) { groupStarA.remove(meshA); geomA?.dispose(); }
    if (meshB) { groupStarB.remove(meshB); geomB?.dispose(); }
    if (lineA) { groupStarA.remove(lineA); lineGeomA?.dispose(); }
    if (lineB) { groupStarB.remove(lineB); lineGeomB?.dispose(); }

    const r = currentParams.scale;
    const type = currentParams.polytopeType;

    if (type === 'merkabah') {
      // Star Tetrahedron (Stella Octangula): two interpenetrating regular tetrahedra
      geomA = createTetrahedronGeom(r, false);
      geomB = createTetrahedronGeom(r, true);
    } else if (type === 'kepler_star') {
      geomA = createStellatedGeom(r);
      geomB = new THREE.IcosahedronGeometry(r * 0.65, 0);
    } else {
      geomA = createStellatedGeom(r);
      geomB = createTetrahedronGeom(r * 0.9, true);
    }

    meshA = new THREE.Mesh(geomA, matA);
    meshB = new THREE.Mesh(geomB, matB);
    groupStarA.add(meshA);
    groupStarB.add(meshB);

    // Geodesic Wireframe lines
    const edgesA = extractEdges(geomA);
    lineGeomA = new LineGeometry();
    lineGeomA.setPositions(edgesA);
    lineA = new Line2(lineGeomA, lineMat);
    groupStarA.add(lineA);

    const edgesB = extractEdges(geomB);
    lineGeomB = new LineGeometry();
    lineGeomB.setPositions(edgesB);
    lineB = new Line2(lineGeomB, lineMat);
    groupStarB.add(lineB);

    lineMat.color.set(currentParams.wireColor);
  }

  buildMeshes();

  // Divine Core Orb
  const coreGeom = new THREE.SphereGeometry(currentParams.coreRadius, 32, 32);
  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(currentParams.coreColor) },
      uTime: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float uTime;
      varying vec3 vNormal;
      void main() {
        float f = pow(1.0 - abs(vNormal.z), 2.5);
        float pulse = 0.85 + 0.15 * sin(uTime * 3.5);
        gl_FragColor = vec4(color, f * 0.55 * pulse);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreMesh = new THREE.Mesh(coreGeom, coreMat);
  coreMesh.renderOrder = 3;
  group.add(coreMesh);

  let pulseVal = 0;

  return {
    update({ time, delta }) {
      pulseVal *= 0.93;
      matA.uniforms.uTime.value = time;
      matB.uniforms.uTime.value = time;
      coreMat.uniforms.uTime.value = time;

      // Dual counter-rotations
      groupStarA.rotation.y += delta * (currentParams.rotRateA + pulseVal * 2.0);
      groupStarA.rotation.x += delta * (currentParams.rotRateA * 0.4);

      groupStarB.rotation.y += delta * (currentParams.rotRateB - pulseVal * 2.0);
      groupStarB.rotation.z += delta * (currentParams.rotRateB * 0.4);

      // Core breathing pulse
      const coreScale = 1.0 + Math.sin(time * 3.5) * 0.08 + pulseVal * 0.4;
      coreMesh.scale.setScalar(coreScale);
    },

    setParams(newParams) {
      const typeChanged = newParams.polytopeType && newParams.polytopeType !== currentParams.polytopeType;
      const scaleChanged = newParams.scale !== undefined && newParams.scale !== currentParams.scale;

      Object.assign(currentParams, newParams);

      if (typeChanged || scaleChanged) {
        buildMeshes();
      }

      if (newParams.color1) {
        matA.uniforms.baseColor.value.set(newParams.color1);
      }
      if (newParams.color2) {
        matB.uniforms.baseColor.value.set(newParams.color2);
      }
      if (newParams.wireColor) {
        lineMat.color.set(newParams.wireColor);
      }
      if (newParams.coreColor) {
        coreMat.uniforms.color.value.set(newParams.coreColor);
      }
      if (newParams.facetDispersion !== undefined) {
        matA.uniforms.dispersion.value = newParams.facetDispersion;
        matB.uniforms.dispersion.value = newParams.facetDispersion;
      }
      if (newParams.wireThickness !== undefined) {
        lineMat.linewidth = newParams.wireThickness;
      }
      if (newParams.coreRadius !== undefined) {
        coreMesh.geometry.dispose();
        coreMesh.geometry = new THREE.SphereGeometry(newParams.coreRadius, 32, 32);
      }
    },

    onPointerClick() {
      pulseVal = 1.0;
    },

    onResize(width, height) {
      lineMat.resolution.set(width, height);
    },

    dispose() {
      scene.remove(group);
      geomA?.dispose();
      geomB?.dispose();
      lineGeomA?.dispose();
      lineGeomB?.dispose();
      matA.dispose();
      matB.dispose();
      lineMat.dispose();
      coreGeom.dispose();
      coreMat.dispose();
    },
  };
}
