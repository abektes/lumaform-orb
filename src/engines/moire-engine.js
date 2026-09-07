import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createMoireEngine({ studio, scene, camera, renderer, pointerTracker, params, global }) {
  const currentParams = {
    archetype: 'square_vortex', // 'square_vortex' | 'hex_vortex' | 'pentagon_envelope' | 'stellated_rosette' | 'astroid_quad' | 'guilloche_rosette' | 'triangle_vortex' | 'triangle_tunnel' | 'winged_moire'
    scale: 2.1, // Overall pattern scale
    zDepth: 1.35, // 3D Volumetric Depth / Extrusion
    lineDensity: 28, // String art resolution
    innerScale: 0.28, // Central aperture ratio
    twistAngle: 0.72, // Chiral rotation angle (radians)
    lineWidth: 2.0, // Crisp stroke width in pixels
    lineColor: '#0a0a0d', // Ink color
    lineGlow: 1.0,

    motionMode: 'orbit_3d', // 'orbit_3d' | 'wave_pulse' | 'hyper_twist' | 'interactive_tilt'
    rotSpeedX: 0.18, // 3D Pitch velocity
    rotSpeedY: 0.38, // 3D Yaw velocity
    rotSpeedZ: 0.10, // 3D Roll velocity
    breatheSpeed: 0.60, // Aperture breathing rate
    breatheAmp: 0.08, // Breathing amplitude
    waveSpeed: 1.20, // 3D axial wave oscillation frequency
    waveAmp: 0.22, // 3D axial wave amplitude
    twistSpeed: 0.40, // Chiral continuous winding speed
    tiltStrength: 0.35, // Interactive mouse parallax depth
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let lineMesh = null;
  let lineGeometry = null;
  let lineMaterial = null;

  // Smoothing targets for pointer interaction
  let targetRotX = 0;
  let targetRotY = 0;

  function buildGeometryData(tAnim = 0) {
    const arch = currentParams.archetype;
    const S = currentParams.scale;
    const N = Math.max(8, Math.min(64, Math.round(currentParams.lineDensity)));

    // Volumetric 3D Depth with dynamic wave modulation
    let Z = currentParams.zDepth;
    if (currentParams.motionMode === 'wave_pulse') {
      Z *= 1.0 + currentParams.waveAmp * Math.sin(tAnim * currentParams.waveSpeed * Math.PI);
    }

    // Aperture dynamic breathing
    const breathe = currentParams.breatheAmp * Math.sin(tAnim * currentParams.breatheSpeed * Math.PI);
    const innerRatio = Math.max(0.06, Math.min(0.88, currentParams.innerScale + breathe));

    // Chiral twist with continuous winding support
    let twist = currentParams.twistAngle + breathe * 0.5;
    if (currentParams.motionMode === 'hyper_twist') {
      twist += tAnim * currentParams.twistSpeed;
    }

    const segments = []; // Array of x1, y1, z1, x2, y2, z2

    function addSegment(x1, y1, z1, x2, y2, z2) {
      segments.push(x1, y1, z1, x2, y2, z2);
    }

    if (arch === 'square_vortex') {
      // 1. Top-Left: 3D Chiral Hyperboloid Funnel & Ruled Trumpet
      // Outer diamond rim at +Z, inner rotated aperture deeply recessed into -Z
      const zOuter = Z * 0.65;
      const zInner = -Z * (0.95 + currentParams.waveAmp * Math.sin(tAnim * currentParams.waveSpeed));

      const outer = [];
      const inner = [];
      for (let k = 0; k < 4; k++) {
        const aOuter = Math.PI / 2 + (k * Math.PI) / 2;
        outer.push({
          x: S * Math.cos(aOuter),
          y: S * Math.sin(aOuter),
          z: zOuter,
        });
        const aInner = Math.PI / 2 + twist + (k * Math.PI) / 2;
        inner.push({
          x: S * innerRatio * Math.cos(aInner),
          y: S * innerRatio * Math.sin(aInner),
          z: zInner,
        });
      }

      for (let k = 0; k < 4; k++) {
        const o1 = outer[k];
        const o2 = outer[(k + 1) % 4];
        const i1 = inner[(k + 1) % 4];
        const i2 = inner[(k + 2) % 4];

        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const px = (1 - u) * o1.x + u * o2.x;
          const py = (1 - u) * o1.y + u * o2.y;
          const pz = (1 - u) * o1.z + u * o2.z;

          const qx = (1 - u) * i1.x + u * i2.x;
          const qy = (1 - u) * i1.y + u * i2.y;
          const qz = (1 - u) * i1.z + u * i2.z;
          addSegment(px, py, pz, qx, qy, qz);
        }
        // Outer rim perimeter
        addSegment(o1.x, o1.y, o1.z, o2.x, o2.y, o2.z);
        // Inner aperture perimeter
        addSegment(inner[k].x, inner[k].y, inner[k].z, inner[(k + 1) % 4].x, inner[(k + 1) % 4].y, inner[(k + 1) % 4].z);
      }

    } else if (arch === 'hex_vortex') {
      // 2. Top-Center: 3D Hexagonal Hyperbolic Vortex Tower
      const zOuter = Z * 0.75;
      const zInner = -Z * (1.1 + currentParams.waveAmp * Math.sin(tAnim * currentParams.waveSpeed));

      const outer = [];
      const inner = [];
      for (let k = 0; k < 6; k++) {
        const aOuter = Math.PI / 2 + (k * Math.PI) / 3;
        outer.push({
          x: S * Math.cos(aOuter),
          y: S * Math.sin(aOuter),
          z: zOuter,
        });
        const aInner = Math.PI / 2 + twist + (k * Math.PI) / 3;
        inner.push({
          x: S * innerRatio * Math.cos(aInner),
          y: S * innerRatio * Math.sin(aInner),
          z: zInner,
        });
      }

      for (let k = 0; k < 6; k++) {
        const o1 = outer[k];
        const o2 = outer[(k + 1) % 6];
        const i1 = inner[(k + 1) % 6];
        const i2 = inner[(k + 2) % 6];

        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const px = (1 - u) * o1.x + u * o2.x;
          const py = (1 - u) * o1.y + u * o2.y;
          const pz = (1 - u) * o1.z + u * o2.z;

          const qx = (1 - u) * i1.x + u * i2.x;
          const qy = (1 - u) * i1.y + u * i2.y;
          const qz = (1 - u) * i1.z + u * i2.z;
          addSegment(px, py, pz, qx, qy, qz);
        }
        addSegment(o1.x, o1.y, o1.z, o2.x, o2.y, o2.z);
        addSegment(inner[k].x, inner[k].y, inner[k].z, inner[(k + 1) % 6].x, inner[(k + 1) % 6].y, inner[(k + 1) % 6].z);
      }

    } else if (arch === 'pentagon_envelope') {
      // 3. Top-Right: 3D Pentagonal Hypar Dome (Hyperbolic Paraboloid Vault)
      // 5 corners non-coplanar in 3D: alternating apexes and troughs
      const verts = [];
      for (let k = 0; k < 5; k++) {
        const a = Math.PI / 2 + (k * 2 * Math.PI) / 5;
        const zk = Z * Math.cos((k * 4 * Math.PI) / 5 + tAnim * currentParams.waveSpeed * 0.8) * 0.9;
        verts.push({
          x: S * Math.cos(a),
          y: S * Math.sin(a),
          z: zk,
        });
      }

      for (let k = 0; k < 5; k++) {
        const v0 = verts[k];
        const v1 = verts[(k + 1) % 5];
        const v2 = verts[(k + 2) % 5];

        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const px = (1 - u) * v0.x + u * v1.x;
          const py = (1 - u) * v0.y + u * v1.y;
          const pz = (1 - u) * v0.z + u * v1.z;

          const qx = (1 - u) * v1.x + u * v2.x;
          const qy = (1 - u) * v1.y + u * v2.y;
          const qz = (1 - u) * v1.z + u * v2.z;
          addSegment(px, py, pz, qx, qy, qz);
        }
        addSegment(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
      }

    } else if (arch === 'stellated_rosette') {
      // 4. Middle-Left: 3D 16-Point Toroidal Star Cage
      // Rotating square tiers distributed along a 3D spherical shell
      const numRotations = 8;
      const tiers = [1.0, 0.94, 0.88];

      for (let t = 0; t < tiers.length; t++) {
        const tierScale = tiers[t];
        const tierRadius = S * tierScale;
        const zTier = Z * (0.8 - t * 0.7) * Math.cos(tAnim * currentParams.waveSpeed * 0.6 + t);

        for (let j = 0; j < numRotations; j++) {
          const theta = (j / numRotations) * (Math.PI / 2) + twist * 0.2;
          const corners = [];
          for (let c = 0; c < 4; c++) {
            const a = theta + (c * Math.PI) / 2;
            const zC = zTier + Z * 0.3 * Math.sin(a * 2 + tAnim);
            corners.push({
              x: tierRadius * Math.cos(a),
              y: tierRadius * Math.sin(a),
              z: zC,
            });
          }
          for (let c = 0; c < 4; c++) {
            const c1 = corners[c];
            const c2 = corners[(c + 1) % 4];
            addSegment(c1.x, c1.y, c1.z, c2.x, c2.y, c2.z);
          }
        }
      }

    } else if (arch === 'astroid_quad') {
      // 5. Middle-Center: 3D Astroid Saddle Vault (Hypar Quadrilateral)
      // Corners alternate in Z: 0 & 2 at +Z, 1 & 3 at -Z
      const corners = [];
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const zC = (k % 2 === 0 ? 1 : -1) * Z * 0.95;
        corners.push({
          x: S * 1.05 * Math.cos(a),
          y: S * 1.05 * Math.sin(a),
          z: zC,
        });
      }

      for (let k = 0; k < 4; k++) {
        const cPrev = corners[(k + 3) % 4];
        const cCurr = corners[k];
        const cNext = corners[(k + 1) % 4];

        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const px = (1 - u) * cPrev.x + u * cCurr.x;
          const py = (1 - u) * cPrev.y + u * cCurr.y;
          const pz = (1 - u) * cPrev.z + u * cCurr.z;

          const qx = (1 - u) * cCurr.x + u * cNext.x;
          const qy = (1 - u) * cCurr.y + u * cNext.y;
          const qz = (1 - u) * cCurr.z + u * cNext.z;
          addSegment(px, py, pz, qx, qy, qz);
        }
      }

    } else if (arch === 'guilloche_rosette') {
      // 6. Middle-Right: 3D Toroidal Spirograph Orb
      // The 16 lobes undulate along Z, creating a volumetric toroidal cage
      const lobes = 16;
      const steps = 360;
      const rBase = S * 0.72;
      const amp = S * 0.28;

      const pts1 = [];
      const pts2 = [];
      const phase2 = Math.PI / lobes;

      for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * Math.PI * 2;
        const r1 = rBase + amp * Math.cos(lobes * th);
        const r2 = rBase + amp * Math.cos(lobes * (th + phase2));
        const z1 = Z * 0.75 * Math.sin(8 * th + tAnim * currentParams.waveSpeed);
        const z2 = -z1;

        pts1.push({ x: r1 * Math.cos(th), y: r1 * Math.sin(th), z: z1 });
        pts2.push({ x: r2 * Math.cos(th), y: r2 * Math.sin(th), z: z2 });
      }

      for (let i = 0; i < steps; i++) {
        addSegment(pts1[i].x, pts1[i].y, pts1[i].z, pts1[i + 1].x, pts1[i + 1].y, pts1[i + 1].z);
        addSegment(pts2[i].x, pts2[i].y, pts2[i].z, pts2[i + 1].x, pts2[i + 1].y, pts2[i + 1].z);

        if (i % 2 === 0) {
          const target = (i + 45) % steps;
          addSegment(pts1[i].x, pts1[i].y, pts1[i].z, pts1[target].x, pts1[target].y, pts1[target].z);
        }
      }

    } else if (arch === 'triangle_vortex') {
      // 7. Bottom-Left: 3D Tetrahedral Chiral Vortex
      // Outer inverted triangle rim at +Z, central aperture deep in -Z
      const zOuter = Z * 0.70;
      const zInner = -Z * (1.15 + currentParams.waveAmp * Math.sin(tAnim * currentParams.waveSpeed));

      const outer = [];
      const inner = [];
      for (let k = 0; k < 3; k++) {
        const aOuter = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
        outer.push({
          x: S * Math.cos(aOuter),
          y: S * Math.sin(aOuter),
          z: zOuter,
        });
        const aInner = -Math.PI / 2 + twist + (k * 2 * Math.PI) / 3;
        inner.push({
          x: S * innerRatio * Math.cos(aInner),
          y: S * innerRatio * Math.sin(aInner),
          z: zInner,
        });
      }

      for (let k = 0; k < 3; k++) {
        const o1 = outer[k];
        const o2 = outer[(k + 1) % 3];
        const i1 = inner[(k + 1) % 3];
        const i2 = inner[(k + 2) % 3];

        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const px = (1 - u) * o1.x + u * o2.x;
          const py = (1 - u) * o1.y + u * o2.y;
          const pz = (1 - u) * o1.z + u * o2.z;

          const qx = (1 - u) * i1.x + u * i2.x;
          const qy = (1 - u) * i1.y + u * i2.y;
          const qz = (1 - u) * i1.z + u * i2.z;
          addSegment(px, py, pz, qx, qy, qz);
        }
        addSegment(o1.x, o1.y, o1.z, o2.x, o2.y, o2.z);
        addSegment(inner[k].x, inner[k].y, inner[k].z, inner[(k + 1) % 3].x, inner[(k + 1) % 3].y, inner[(k + 1) % 3].z);
      }

    } else if (arch === 'triangle_tunnel') {
      // 8. Bottom-Center: Authentic 3D Perspective Triangle Corridor (Direct fix for user's screenshot!)
      // Tiers step back deeply along Z, creating a true 3D infinite gateway
      const tiers = Math.max(16, N);
      const apexY = S * 1.15;
      const bLeftX = -S * 1.0;
      const bLeftY = -S * 0.95;
      const bRightX = S * 1.0;
      const bRightY = -S * 0.95;

      const zFront = Z * 0.75;
      const zBack = -Z * 2.2;

      for (let t = 0; t < tiers; t++) {
        const u = t / (tiers - 1);
        const zTier = (1 - u) * zFront + u * zBack;

        const curApexY = apexY * (1.0 - u * 0.52);
        const curLeftX = bLeftX * (1.0 - u * 0.88);
        const curLeftY = bLeftY + u * S * 0.92;
        const curRightX = bRightX * (1.0 - u * 0.88);
        const curRightY = bRightY + u * S * 0.92;

        // Base horizontal rung in 3D
        addSegment(curLeftX, curLeftY, zTier, curRightX, curRightY, zTier);
        // Slanted left strut
        addSegment(curLeftX, curLeftY, zTier, 0, curApexY, zTier);
        // Slanted right strut
        addSegment(curRightX, curRightY, zTier, 0, curApexY, zTier);

        // Longitudinal connecting depth rails linking tiers
        if (t < tiers - 1) {
          const uNext = (t + 1) / (tiers - 1);
          const zNext = (1 - uNext) * zFront + uNext * zBack;
          const nextLeftX = bLeftX * (1.0 - uNext * 0.88);
          const nextLeftY = bLeftY + uNext * S * 0.92;
          const nextRightX = bRightX * (1.0 - uNext * 0.88);
          const nextRightY = bRightY + uNext * S * 0.92;
          const nextApexY = apexY * (1.0 - uNext * 0.52);

          addSegment(curLeftX, curLeftY, zTier, nextLeftX, nextLeftY, zNext);
          addSegment(curRightX, curRightY, zTier, nextRightX, nextRightY, zNext);
          addSegment(0, curApexY, zTier, 0, nextApexY, zNext);
        }
      }

    } else if (arch === 'winged_moire') {
      // 9. Bottom-Right: 3D Bilateral Winged Saddle
      // Wingtips arch forward in +Z, spine dips back in -Z, bottom fan curls in 3D
      const fanLines = N * 2;
      for (let i = 0; i <= fanLines; i++) {
        const u = i / fanLines;
        // Left wing fan in 3D
        const px = -S * 0.92 + u * S * 0.48;
        const py = S * 0.12 + u * S * 0.88;
        const pz = Z * (0.85 - u * 1.5) * Math.cos(u * Math.PI);

        const qx = -S * 0.72 + u * S * 1.45;
        const qy = -S * 0.88;
        const qz = -Z * 0.6 + Z * 0.8 * Math.sin(u * Math.PI);

        addSegment(px, py, pz, qx, qy, qz);
        // Right wing fan (mirror X and keep 3D depth)
        addSegment(-px, py, pz, -qx, qy, qz);
      }
    }

    const posArray = new Float32Array(segments);
    const colArray = new Float32Array(segments.length);
    const baseCol = new THREE.Color(currentParams.lineColor);
    const glow = currentParams.lineGlow;

    for (let c = 0; c < segments.length; c += 3) {
      colArray[c] = baseCol.r * glow;
      colArray[c + 1] = baseCol.g * glow;
      colArray[c + 2] = baseCol.b * glow;
    }

    return { posArray, colArray };
  }

  function initMesh() {
    if (lineMesh) {
      group.remove(lineMesh);
      lineGeometry.dispose();
      lineMaterial.dispose();
    }

    const { posArray, colArray } = buildGeometryData(0);
    lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(posArray);
    lineGeometry.setColors(colArray);

    lineMaterial = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      linewidth: currentParams.lineWidth,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    lineMaterial.resolution.set(window.innerWidth || 1440, window.innerHeight || 900);

    lineMesh = new LineSegments2(lineGeometry, lineMaterial);
    lineMesh.computeLineDistances();
    lineMesh.renderOrder = 2;
    group.add(lineMesh);
  }

  initMesh();

  let elapsedTotal = 0;

  return {
    // World radius this engine occupies, so OrbStudio can frame every engine at
    // the same fraction of the viewport instead of a shared fixed distance.
    // Sphere-grid outer radius at default scale.
    frame: { radius: 2.28 },
    update(args = {}) {
      const dt = typeof args.delta === 'number' ? args.delta : 0.016;
      const elapsed = typeof args.time === 'number' ? args.time : elapsedTotal + dt;
      elapsedTotal = elapsed;
      const pointer = args.pointer;

      // --- DYNAMIC 3D MOTION SYSTEM ---
      if (currentParams.motionMode === 'interactive_tilt') {
        // Interactive tilt with mouse parallax momentum
        if (pointer) {
          targetRotX = -pointer.y * currentParams.tiltStrength * 0.6;
          targetRotY = pointer.x * currentParams.tiltStrength * 0.6;
        }
        group.rotation.x += (targetRotX - group.rotation.x) * 0.08;
        group.rotation.y += (targetRotY - group.rotation.y) * 0.08;
        group.rotation.z += dt * currentParams.rotSpeedZ;
      } else {
        // Continuous 3D spatial rotation across X (Pitch), Y (Yaw), Z (Roll)
        group.rotation.x += dt * currentParams.rotSpeedX;
        group.rotation.y += dt * currentParams.rotSpeedY;
        group.rotation.z += dt * currentParams.rotSpeedZ;

        // Subtle pointer bias on top of 3D tumbling
        if (pointer) {
          group.rotation.x += pointer.y * dt * 0.08;
          group.rotation.y += pointer.x * dt * 0.12;
        }
      }

      // Dynamic in-place 3D deformation & harmonic wave breathing
      const { posArray, colArray } = buildGeometryData(elapsed);
      const startAttr = lineGeometry.attributes.instanceStart;
      if (startAttr && posArray.length === startAttr.count * 6) {
        startAttr.data.array.set(posArray);
        startAttr.data.needsUpdate = true;
        const colAttr = lineGeometry.attributes.instanceColorStart;
        if (colAttr) {
          colAttr.data.array.set(colArray);
          colAttr.data.needsUpdate = true;
        }
        lineMesh.computeLineDistances();
      } else {
        lineGeometry.dispose();
        lineGeometry = new LineSegmentsGeometry();
        lineGeometry.setPositions(posArray);
        lineGeometry.setColors(colArray);
        lineMesh.geometry = lineGeometry;
        lineMesh.computeLineDistances();
      }
    },

    setParams(newParams) {
      Object.assign(currentParams, newParams);

      if (newParams.lineWidth !== undefined && lineMaterial) {
        lineMaterial.linewidth = newParams.lineWidth;
      }

      const { posArray, colArray } = buildGeometryData(elapsedTotal);
      lineGeometry.dispose();
      lineGeometry = new LineSegmentsGeometry();
      lineGeometry.setPositions(posArray);
      lineGeometry.setColors(colArray);
      lineMesh.geometry = lineGeometry;
      lineMesh.computeLineDistances();
    },

    onPointerMove(nx, ny) {
      targetRotX = -ny * currentParams.tiltStrength * 0.6;
      targetRotY = nx * currentParams.tiltStrength * 0.6;
    },

    onPointerClick() {
      // Dynamic 3D depth punch on click
      currentParams.zDepth *= 1.25;
      setTimeout(() => {
        currentParams.zDepth = params?.zDepth || 1.35;
      }, 350);
    },

    onPulse() {
      currentParams.zDepth *= 1.25;
      setTimeout(() => {
        currentParams.zDepth = params?.zDepth || 1.35;
      }, 350);
    },

    onResize(width, height) {
      if (lineMaterial) {
        lineMaterial.resolution.set(width, height);
      }
    },

    dispose() {
      scene.remove(group);
      if (lineGeometry) lineGeometry.dispose();
      if (lineMaterial) lineMaterial.dispose();
    },
  };
}
