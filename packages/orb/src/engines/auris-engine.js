import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createAurisEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    archetype: 'geodesic', // 'geodesic' | 'cubic_compound' | 'nested_square' | 'nested_hex' | 'nested_pentagon' | 'nested_triangle'
    lightYaw: 45,
    lightPitch: 35,
    lightIntensity: 1.6,
    lightColor: '#ffea79',
    facetColor: '#1e293b',
    wireColor: '#fef08a',
    shadowColor: '#090d16',
    wireWidth: 2.4,
    wireGlow: 1.3,
    hatchDensity: 60.0,
    hatchStrength: 0.55,
    stellaHeight: 0.45,
    twistAngle: 0.14,   // Per-layer rotation increment for nested polygons
    twistSpeed: 0.6,
    scale: 1.4,
    rotSpeedX: 0.20,
    rotSpeedY: 0.45,
    rotSpeedZ: 0.10,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  // Accumulated rotation state (only driven by time, not pointer)
  let accumRotX = 0;
  let accumRotY = 0;
  let accumRotZ = 0;

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

  // Directional Light Indicator
  const lightMarkerGeo = new THREE.SphereGeometry(0.08, 16, 16);
  const lightMarkerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(currentParams.lightColor),
    transparent: true,
    opacity: 0.85,
  });
  const lightMarker = new THREE.Mesh(lightMarkerGeo, lightMarkerMat);
  scene.add(lightMarker);

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
          vec3 fdx = dFdx(vWorldPosition);
          vec3 fdy = dFdy(vWorldPosition);
          vec3 N = normalize(cross(fdx, fdy));
          vec3 V = normalize(cameraPosition - vWorldPosition);
          if (dot(N, V) < 0.0) N = -N;

          vec3 L = normalize(uLightDir);
          float NdotL = dot(N, L);

          float p1 = (vLocalPos.x * 0.707 + vLocalPos.y * 0.707 + vLocalPos.z * 0.35) * uHatchDensity;
          float p2 = (vLocalPos.x * 0.707 - vLocalPos.y * 0.707 + vLocalPos.z * 0.35) * uHatchDensity;

          float d1 = abs(fract(p1) - 0.5);
          float d2 = abs(fract(p2) - 0.5);
          float hatch1 = smoothstep(0.05, 0.20, d1);
          float hatch2 = smoothstep(0.05, 0.20, d2);

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

          float diff = clamp(NdotL * 0.5 + 0.5, 0.0, 1.0);
          vec3 tone = mix(uShadowColor, uFacetColor, diff);
          tone = mix(tone, uLightColor, clamp(NdotL * 0.65 * uLightIntensity, 0.0, 1.0));
          tone *= hatchFactor;

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

  // ────────────────────────────────────────────────────────────────────────
  // HELPER: Generate a regular polygon's vertices (2D, returns [x,y] pairs)
  // ────────────────────────────────────────────────────────────────────────
  function regularPolygon(sides, radius, angleOffset = 0) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = angleOffset + (i / sides) * Math.PI * 2;
      pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
    return pts;
  }

  // ────────────────────────────────────────────────────────────────────────
  // BUILD GEOMETRY ARCHETYPES
  // ────────────────────────────────────────────────────────────────────────
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
    let edgeSegments = []; // array of [Vector3, Vector3]

    if (arch === 'geodesic') {
      // ── Multifaceted Geodesic Stellated Polyhedron ──
      const baseIco = new THREE.IcosahedronGeometry(S * 1.2, 1);
      const posAttr = baseIco.attributes.position;
      const count = posAttr.count;

      const positions = [];
      const normals = [];

      for (let i = 0; i < count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(posAttr, i);
        const b = new THREE.Vector3().fromBufferAttribute(posAttr, i + 1);
        const c = new THREE.Vector3().fromBufferAttribute(posAttr, i + 2);

        const center = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
        const faceNorm = new THREE.Vector3().crossVectors(
          new THREE.Vector3().subVectors(b, a),
          new THREE.Vector3().subVectors(c, a)
        ).normalize();

        const apex = center.clone().addScaledVector(faceNorm, stella * S * 0.85);

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

        edgeSegments.push([a, b], [b, c], [c, a]);
        edgeSegments.push([a, apex], [b, apex], [c, apex]);
      }

      baseIco.dispose();
      facetGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      facetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    } else if (arch === 'cubic_compound') {
      // ── Interlocking Stellated Cubic Cluster ──
      const positions = [];
      const normals = [];

      const baseCubeHalf = S * 0.65;
      const armLength = S * (1.0 + stella * 0.6);
      const capHeight = S * (1.3 + stella * 0.8);

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

    } else if (arch === 'nested_square' || arch === 'nested_hex' || arch === 'nested_pentagon' || arch === 'nested_triangle') {
      // ── Nested Rotated Polygons, wrapped onto a sphere ──
      // The rings used to shrink across a flat disc — z varied by only
      // S * 0.4 * stella, so 36 layers of string art piled into a plane and read
      // as a smeared spiral rather than an object. Each ring now sits at its own
      // latitude, which keeps the chiral twist that gave the archetype its
      // character while giving it an orb silhouette and real depth.
      const sidesMap = {
        nested_square: 4,
        nested_hex: 6,
        nested_pentagon: 5,
        nested_triangle: 3,
      };
      const sides = sidesMap[arch];

      // 36 flat layers were illegible once bloom touched them; at 20 the
      // individual polygons stay distinguishable on a sphere.
      const layers = 20;
      // Matched to the geodesic archetype's extent so switching archetype does
      // not visibly change the orb's size — the camera frames the engine once,
      // from a single radius, and cannot follow a per-archetype scale.
      const R = S * 1.65;
      // Stops the rings collapsing to a point at each pole, the same reason the
      // moire shells inset their meridians.
      const POLE_INSET = 0.08;

      // Twist is measured in fractions of the polygon's own edge spacing rather
      // than in absolute radians. A fixed radian step spirals a triangle (120°
      // period) more than twice as far per layer as a hexagon, which is why the
      // low-sided archetypes came out as lopsided shells instead of orbs.
      const twistPerLayer = currentParams.twistAngle * ((Math.PI * 2) / sides) * 0.5;
      const allLayerVerts = [];

      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        const theta = (POLE_INSET + t * (1 - 2 * POLE_INSET)) * Math.PI;
        // stella now bulges or flattens the sphere rather than nudging a flat
        // stack, so the parameter still does something visible.
        const ringRadius = R * Math.sin(theta) * (1 + (stella - 0.5) * 0.25);
        const y = R * Math.cos(theta);
        const angle = twistPerLayer * i;

        const onRing = (a) => new THREE.Vector3(
          Math.cos(a) * ringRadius,
          y,
          Math.sin(a) * ringRadius
        );

        // The polygon corners, which the string art connects between layers.
        const verts = [];
        for (let s = 0; s < sides; s++) {
          verts.push(onRing(angle + (s / sides) * Math.PI * 2));
        }
        allLayerVerts.push(verts);

        // The ring itself is drawn as a circle rather than as `sides` straight
        // chords. A triangle or square inscribed at the equator cuts so far
        // inside the latitude circle that the silhouette stops being spherical —
        // which is why the low-sided archetypes read as conch shells. The
        // polygon still shows, in the symmetry of the string art spiralling
        // between corners.
        const RING_SUB = 8;
        const steps = sides * RING_SUB;
        for (let k = 0; k < steps; k++) {
          const a0 = angle + (k / steps) * Math.PI * 2;
          const a1 = angle + ((k + 1) / steps) * Math.PI * 2;
          edgeSegments.push([onRing(a0), onRing(a1)]);
        }
      }

      // The cross-layer string art becomes the sphere's ruled surface: because
      // each ring is rotated a little further, the connecting lines spiral.
      for (let i = 0; i < layers - 1; i++) {
        for (let s = 0; s < sides; s++) {
          edgeSegments.push([allLayerVerts[i][s], allLayerVerts[i + 1][s]]);
        }
      }

      // Minimal facet geometry placeholder (wireframe-only archetype)
      const positions = [0, 0, 0, 0.001, 0, 0, 0, 0.001, 0];
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
    const maxEdges = Math.min(edgeSegments.length, 2400);
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
    // World radius this engine occupies, so OrbStudio can frame every engine at
    // the same fraction of the viewport instead of a shared fixed distance.
    // Stellated geodesic including spike apexes.
    frame: { radius: 2.35 },
    update({ time, delta, pointer }) {
      clickPulse *= 0.92;

      // Only accumulate rotation from delta (NOT from pointer)
      // This ensures no movement when paused (delta=0)
      accumRotX += delta * currentParams.rotSpeedX;
      accumRotY += delta * currentParams.rotSpeedY;
      accumRotZ += delta * currentParams.rotSpeedZ;

      // Apply accumulated rotation + gentle pointer influence (non-accumulating)
      group.rotation.x = accumRotX + pointer.y * 0.15;
      group.rotation.y = accumRotY + pointer.x * 0.15;
      group.rotation.z = accumRotZ;

      // Update Light Marker position
      updateLightVector();
      lightMarker.position.copy(lightDir).multiplyScalar(currentParams.scale * 2.5);

      // Update Facet Shader Uniforms
      if (facetMaterial) {
        facetMaterial.uniforms.uTime.value = time;
        facetMaterial.uniforms.uLightDir.value.copy(lightDir);
      }
    },

    setParams(newParams) {
      // Map legacy archetype names to new clean versions
      if (newParams.archetype !== undefined) {
        const legacyMap = {
          vortex_square: 'nested_square',
          vortex_hex: 'nested_hex',
          vortex_triangle: 'nested_triangle',
          sacred_rosette: 'nested_hex', // Closest equivalent
        };
        if (legacyMap[newParams.archetype]) {
          newParams.archetype = legacyMap[newParams.archetype];
        }
      }

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
