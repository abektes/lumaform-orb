import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createAurisEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    archetype: 'geodesic', // 'geodesic' | 'cubic_compound' | 'vortex_square' | 'vortex_hex' | 'sacred_rosette' | 'vortex_triangle'
    lightYaw: 45, // Azimuthal angle in degrees
    lightPitch: 35, // Altitude angle in degrees
    lightIntensity: 1.6,
    lightColor: '#ffea79', // Radiant auric gold light
    facetColor: '#1e293b', // Deep architectural slate
    wireColor: '#fef08a', // Crisp bright gold contour lines
    shadowColor: '#090d16',
    wireWidth: 2.4,
    wireGlow: 1.3,
    hatchDensity: 60.0, // Architectural hatching line frequency
    hatchStrength: 0.55,
    stellaHeight: 0.45, // Height of stellated pyramid peaks
    twistAngle: 0.14, // Chiral twist per tier for vortexes
    twistSpeed: 0.6,
    scale: 1.4,
    rotSpeedX: 0.20,
    rotSpeedY: 0.45,
    rotSpeedZ: 0.10,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  // Dedicated Directional Light Vector
  const lightDir = new THREE.Vector3();
  function updateLightVector() {
    const yawRad = THREE.MathUtils.degToRad(currentParams.lightYaw);
    const pitchRad = THREE.MathUtils.degToRad(currentParams.lightPitch);
    lightDir.set(
      Math.cos(pitchRad) * Math.sin(yawRad),
      Math.sin(pitchRad),
      Math.cos(pitchRad) * Math.cos(yawRad)
    ).normalize();
  }
  updateLightVector();

  // Directional Light Indicator Arrow in the background
  const lightMarkerGeo = new THREE.SphereGeometry(0.08, 16, 16);
  const lightMarkerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(currentParams.lightColor),
    transparent: true,
    opacity: 0.85,
  });
  const lightMarker = new THREE.Mesh(lightMarkerGeo, lightMarkerMat);
  scene.add(lightMarker);

  // Sub-groups for active meshes
  let facetMesh = null;
  let lineMesh = null;
  let lineGeometry = null;
  let lineMaterial = null;
  let facetMaterial = null;

  // Custom Architectural Hatched Facet Shader Material
  function createFacetMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uLightDir: { value: lightDir },
        uLightColor: { value: new THREE.Color(currentParams.lightColor) },
        uFacetColor: { value: new THREE.Color(currentParams.facetColor) },
        uShadowColor: { value: new THREE.Color(currentParams.shadowColor) },
        uLightIntensity: { value: currentParams.lightIntensity },
        uHatchDensity: { value: currentParams.hatchDensity },
        uHatchStrength: { value: currentParams.hatchStrength },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vLocalPos;

        void main() {
          vLocalPos = position;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uLightDir;
        uniform vec3 uLightColor;
        uniform vec3 uFacetColor;
        uniform vec3 uShadowColor;
        uniform float uLightIntensity;
        uniform float uHatchDensity;
        uniform float uHatchStrength;
        uniform float uTime;

        varying vec3 vWorldPosition;
        varying vec3 vLocalPos;

        void main() {
          // Flat geometric facet normal via screen-space derivatives
          vec3 fdx = dFdx(vWorldPosition);
          vec3 fdy = dFdy(vWorldPosition);
          vec3 N = normalize(cross(fdx, fdy));
          vec3 V = normalize(cameraPosition - vWorldPosition);
          if (dot(N, V) < 0.0) N = -N;

          vec3 L = normalize(uLightDir);
          float NdotL = dot(N, L);

          // Object-space architectural pen-and-ink hatching
          float p1 = (vLocalPos.x * 0.707 + vLocalPos.y * 0.707 + vLocalPos.z * 0.35) * uHatchDensity;
          float p2 = (vLocalPos.x * 0.707 - vLocalPos.y * 0.707 + vLocalPos.z * 0.35) * uHatchDensity;

          // Distinct, sharp pen strokes
          float d1 = abs(fract(p1) - 0.5);
          float d2 = abs(fract(p2) - 0.5);
          float hatch1 = smoothstep(0.05, 0.20, d1);
          float hatch2 = smoothstep(0.05, 0.20, d2);

          // Directional chiaroscuro ink distribution:
          float ink = 1.0;
          if (NdotL < 0.25) {
            float t1 = clamp((0.25 - NdotL) / 0.35, 0.0, 1.0);
            ink = mix(1.0, hatch1, t1);
          }
          if (NdotL < -0.10) {
            float t2 = clamp((-0.10 - NdotL) / 0.35, 0.0, 1.0);
            ink = mix(ink, min(hatch1, hatch2), t2);
          }

          float hatchFactor = mix(1.0, ink, uHatchStrength);

          // Base chiaroscuro tone
          float diff = clamp(NdotL * 0.5 + 0.5, 0.0, 1.0);
          vec3 tone = mix(uShadowColor, uFacetColor, diff);
          tone = mix(tone, uLightColor, clamp(NdotL * 0.65 * uLightIntensity, 0.0, 1.0));
          tone *= hatchFactor;

          // Specular sheen
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 32.0) * 0.35 * uLightIntensity;
          tone += uLightColor * spec * clamp(NdotL, 0.0, 1.0);

          gl_FragColor = vec4(tone, 1.0);
        }
      `,
      transparent: false,
      side: THREE.DoubleSide,
    });
  }

  // BUILD GEOMETRY ARCHETYPES
  function buildGeometry() {
    // Clean up previous
    if (facetMesh) {
      group.remove(facetMesh);
      facetMesh.geometry.dispose();
      facetMesh = null;
    }
    if (lineMesh) {
      group.remove(lineMesh);
      lineGeometry.dispose();
      lineMesh = null;
    }

    const arch = currentParams.archetype;
    const S = currentParams.scale;
    const stella = currentParams.stellaHeight;

    let facetGeo = new THREE.BufferGeometry();
    let edgeSegments = []; // array of [p1, p2]

    if (arch === 'geodesic') {
      // 1. Multifaceted Geodesic Stellated Polyhedron (Image 1, top)
      const baseIco = new THREE.IcosahedronGeometry(S * 1.2, 1);
      const posAttr = baseIco.attributes.position;
      const count = posAttr.count;

      const positions = [];
      const normals = [];

      for (let i = 0; i < count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(posAttr, i);
        const b = new THREE.Vector3().fromBufferAttribute(posAttr, i + 1);
        const c = new THREE.Vector3().fromBufferAttribute(posAttr, i + 2);

        // Center and normal of this triangular facet
        const center = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
        const faceNorm = new THREE.Vector3().crossVectors(
          new THREE.Vector3().subVectors(b, a),
          new THREE.Vector3().subVectors(c, a)
        ).normalize();

        // Extruded apex point for stellated pyramid
        const apex = center.clone().addScaledVector(faceNorm, stella * S * 0.85);

        // 3 sub-triangles: (a, b, apex), (b, c, apex), (c, a, apex)
        const subFaces = [
          [a, b, apex],
          [b, c, apex],
          [c, a, apex],
        ];

        for (const [p0, p1, p2] of subFaces) {
          positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          const fn = new THREE.Vector3().crossVectors(
            new THREE.Vector3().subVectors(p1, p0),
            new THREE.Vector3().subVectors(p2, p0)
          ).normalize();
          normals.push(fn.x, fn.y, fn.z, fn.x, fn.y, fn.z, fn.x, fn.y, fn.z);
        }

        // Add contour edges
        edgeSegments.push([a, b], [b, c], [c, a]);
        edgeSegments.push([a, apex], [b, apex], [c, apex]);
      }

      baseIco.dispose();
      facetGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      facetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    } else if (arch === 'cubic_compound') {
      // 2. Interlocking Stellated Cubic Cluster (Image 1, bottom)
      // Compound of orthogonal cubes with 6 stellated pyramidal caps
      const positions = [];
      const normals = [];

      const baseCubeHalf = S * 0.65;
      const armLength = S * (1.0 + stella * 0.6);
      const capHeight = S * (1.3 + stella * 0.8);

      // Function to add a quad face
      function addQuad(p0, p1, p2, p3) {
        positions.push(
          p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z,
          p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z
        );
        const fn = new THREE.Vector3().crossVectors(
          new THREE.Vector3().subVectors(p1, p0),
          new THREE.Vector3().subVectors(p2, p0)
        ).normalize();
        for (let k = 0; k < 6; k++) normals.push(fn.x, fn.y, fn.z);
        edgeSegments.push([p0, p1], [p1, p2], [p2, p3], [p3, p0]);
      }

      // Function to add a pyramid cap on face
      function addPyramid(b0, b1, b2, b3, apex) {
        const sides = [[b0, b1, apex], [b1, b2, apex], [b2, b3, apex], [b3, b0, apex]];
        for (const [p0, p1, p2] of sides) {
          positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          const fn = new THREE.Vector3().crossVectors(
            new THREE.Vector3().subVectors(p1, p0),
            new THREE.Vector3().subVectors(p2, p0)
          ).normalize();
          normals.push(fn.x, fn.y, fn.z, fn.x, fn.y, fn.z, fn.x, fn.y, fn.z);
        }
        edgeSegments.push([b0, apex], [b1, apex], [b2, apex], [b3, apex]);
      }

      // 6 Orthogonal arms along ±X, ±Y, ±Z
      const axes = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1),
      ];

      for (const axis of axes) {
        const u = new THREE.Vector3(axis.y, axis.z, axis.x).normalize();
        const v = new THREE.Vector3().crossVectors(axis, u).normalize();

        const pApex = axis.clone().multiplyScalar(capHeight);
        const pCapBase = axis.clone().multiplyScalar(armLength);

        const b0 = pCapBase.clone().addScaledVector(u, baseCubeHalf * 0.7).addScaledVector(v, baseCubeHalf * 0.7);
        const b1 = pCapBase.clone().addScaledVector(u, -baseCubeHalf * 0.7).addScaledVector(v, baseCubeHalf * 0.7);
        const b2 = pCapBase.clone().addScaledVector(u, -baseCubeHalf * 0.7).addScaledVector(v, -baseCubeHalf * 0.7);
        const b3 = pCapBase.clone().addScaledVector(u, baseCubeHalf * 0.7).addScaledVector(v, -baseCubeHalf * 0.7);

        addPyramid(b0, b1, b2, b3, pApex);

        // Arm side panels connecting to central cube
        const dist = armLength - baseCubeHalf;
        const root0 = b0.clone().addScaledVector(axis, -dist);
        const root1 = b1.clone().addScaledVector(axis, -dist);
        const root2 = b2.clone().addScaledVector(axis, -dist);
        const root3 = b3.clone().addScaledVector(axis, -dist);

        addQuad(root0, b0, b1, root1);
        addQuad(root1, b1, b2, root2);
        addQuad(root2, b2, b3, root3);
        addQuad(root3, b3, b0, root0);
      }

      facetGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      facetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    } else if (arch === 'vortex_square' || arch === 'vortex_hex' || arch === 'vortex_triangle') {
      // 3. Sacred Geometric Wireframe Vortex (Image 2)
      const sides = arch === 'vortex_hex' ? 6 : arch === 'vortex_triangle' ? 3 : 4;
      const tiers = 32;
      const positions = [];
      const normals = [];

      const ringVertices = [];

      for (let t = 0; t < tiers; t++) {
        const ratio = t / (tiers - 1);
        const radius = S * 1.5 * Math.pow(1.0 - ratio * 0.88, 1.15);
        const angleOffset = t * currentParams.twistAngle;
        const z = (ratio - 0.5) * S * 0.6;

        const verts = [];
        for (let s = 0; s < sides; s++) {
          const a = angleOffset + (s / sides) * Math.PI * 2;
          verts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, z));
        }
        ringVertices.push(verts);

        // Ring contour edges
        for (let s = 0; s < sides; s++) {
          edgeSegments.push([verts[s], verts[(s + 1) % sides]]);
        }
      }

      // Longitudinal asymptotic spiral lines
      for (let t = 0; t < tiers - 1; t++) {
        for (let s = 0; s < sides; s++) {
          const v0 = ringVertices[t][s];
          const v1 = ringVertices[t + 1][s];
          const vNext = ringVertices[t][(s + 1) % sides];
          edgeSegments.push([v0, v1]);

          // Subtle translucent facet panels between tiers
          positions.push(
            v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, vNext.x, vNext.y, vNext.z
          );
          normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
        }
      }

      facetGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      facetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    } else if (arch === 'sacred_rosette') {
      // 4. Sacred Hypotrochoid / Spirograph Rosette Envelope (Image 2 mid-right)
      const R = S * 1.25;
      const r = S * 0.42;
      const d = S * 0.72;
      const steps = 360;
      const curvePts = [];

      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 14; // 7 petal cycles
        const x = (R - r) * Math.cos(theta) + d * Math.cos(((R - r) * theta) / r);
        const y = (R - r) * Math.sin(theta) - d * Math.sin(((R - r) * theta) / r);
        const z = Math.sin(theta * 3.0) * S * 0.15;
        curvePts.push(new THREE.Vector3(x, y, z));
      }

      for (let i = 0; i < curvePts.length - 1; i++) {
        edgeSegments.push([curvePts[i], curvePts[i + 1]]);
      }

      // Cross-chords connecting symmetric lobes
      for (let i = 0; i < curvePts.length; i += 12) {
        const target = (i + 72) % curvePts.length;
        edgeSegments.push([curvePts[i], curvePts[target]]);
      }

      // Minimal facet backing
      const positions = [0, 0, 0, curvePts[0].x, curvePts[0].y, 0, curvePts[12].x, curvePts[12].y, 0];
      const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
      facetGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      facetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }

    const isSolid = arch === 'geodesic' || arch === 'cubic_compound';

    // Create Facet Mesh with Custom Shader
    facetMaterial = createFacetMaterial();
    facetMesh = new THREE.Mesh(facetGeo, facetMaterial);
    facetMesh.renderOrder = 1;
    facetMesh.visible = isSolid;
    group.add(facetMesh);

    // Create Line2 Antialiased Glowing Contours
    const maxEdges = Math.min(edgeSegments.length, 1200);
    const linePosArr = new Float32Array(maxEdges * 6);
    const lineColArr = new Float32Array(maxEdges * 6);
    const cWire = new THREE.Color(currentParams.wireColor);
    const glowMul = isSolid ? 1.0 : currentParams.wireGlow;

    for (let e = 0; e < maxEdges; e++) {
      const [p1, p2] = edgeSegments[e];
      const idx = e * 6;
      linePosArr[idx] = p1.x;
      linePosArr[idx + 1] = p1.y;
      linePosArr[idx + 2] = p1.z;
      linePosArr[idx + 3] = p2.x;
      linePosArr[idx + 4] = p2.y;
      linePosArr[idx + 5] = p2.z;

      for (let c = 0; c < 6; c += 3) {
        lineColArr[idx + c] = cWire.r * glowMul;
        lineColArr[idx + c + 1] = cWire.g * glowMul;
        lineColArr[idx + c + 2] = cWire.b * glowMul;
      }
    }

    lineGeometry = new LineGeometry();
    lineGeometry.setPositions(linePosArr);
    lineGeometry.setColors(lineColArr);

    lineMaterial = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      linewidth: isSolid ? Math.min(currentParams.wireWidth, 1.8) : currentParams.wireWidth,
      transparent: true,
      depthTest: isSolid,
      depthWrite: false,
      blending: isSolid ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    lineMaterial.resolution.set(window.innerWidth, window.innerHeight);

    lineMesh = new Line2(lineGeometry, lineMaterial);
    lineMesh.renderOrder = 2;
    group.add(lineMesh);
  }

  buildGeometry();

  let clickPulse = 0;

  return {
    update({ time, delta, pointer }) {
      clickPulse *= 0.92;

      // 3D Perspective Tumbling with mouse interaction
      group.rotation.x += delta * currentParams.rotSpeedX + pointer.y * 0.02;
      group.rotation.y += delta * currentParams.rotSpeedY + pointer.x * 0.03;
      group.rotation.z += delta * currentParams.rotSpeedZ;

      // Update Light Marker position in world space
      updateLightVector();
      lightMarker.position.copy(lightDir).multiplyScalar(currentParams.scale * 2.5);

      // Update Facet Shader Uniforms
      if (facetMaterial) {
        facetMaterial.uniforms.uTime.value = time;
        facetMaterial.uniforms.uLightDir.value.copy(lightDir);
      }
    },

    setParams(newParams) {
      const needsRebuild =
        newParams.archetype !== undefined && newParams.archetype !== currentParams.archetype ||
        newParams.scale !== undefined && newParams.scale !== currentParams.scale ||
        newParams.stellaHeight !== undefined && newParams.stellaHeight !== currentParams.stellaHeight ||
        newParams.twistAngle !== undefined && newParams.twistAngle !== currentParams.twistAngle;

      Object.assign(currentParams, newParams);

      if (needsRebuild) {
        buildGeometry();
      }

      if (newParams.lightYaw !== undefined || newParams.lightPitch !== undefined) {
        updateLightVector();
      }
      if (newParams.wireWidth !== undefined && lineMaterial) {
        lineMaterial.linewidth = newParams.wireWidth;
      }
      if (newParams.lightColor && facetMaterial) {
        facetMaterial.uniforms.uLightColor.value.set(newParams.lightColor);
        lightMarkerMat.color.set(newParams.lightColor);
      }
      if (newParams.facetColor && facetMaterial) {
        facetMaterial.uniforms.uFacetColor.value.set(newParams.facetColor);
      }
      if (newParams.shadowColor && facetMaterial) {
        facetMaterial.uniforms.uShadowColor.value.set(newParams.shadowColor);
      }
      if (newParams.lightIntensity !== undefined && facetMaterial) {
        facetMaterial.uniforms.uLightIntensity.value = newParams.lightIntensity;
      }
      if (newParams.hatchDensity !== undefined && facetMaterial) {
        facetMaterial.uniforms.uHatchDensity.value = newParams.hatchDensity;
      }
      if (newParams.hatchStrength !== undefined && facetMaterial) {
        facetMaterial.uniforms.uHatchStrength.value = newParams.hatchStrength;
      }
    },

    onPointerClick() {
      clickPulse = 1.0;
    },
    onPulse() {
      clickPulse = 1.0;
    },

    onResize(width, height) {
      if (lineMaterial) {
        lineMaterial.resolution.set(width, height);
      }
    },

    dispose() {
      scene.remove(group);
      scene.remove(lightMarker);
      lightMarkerGeo.dispose();
      lightMarkerMat.dispose();

      if (facetMesh) {
        facetMesh.geometry.dispose();
      }
      if (facetMaterial) {
        facetMaterial.dispose();
      }
      if (lineGeometry) {
        lineGeometry.dispose();
      }
      if (lineMaterial) {
        lineMaterial.dispose();
      }
    },
  };
}
