import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

function hexToVec3(hex) {
  const color = new THREE.Color(hex);
  return new THREE.Vector3(color.r, color.g, color.b);
}

const SHAPE_MAP = {
  sphere: 0,
  cube: 1,
  octahedron: 2,
};

export function createQuantumEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    autoRotate: true,
    rotSpeedX: 0.18,
    rotSpeedY: 0.28,
    fractalSpeed: 1.0,
    morphSpeed: 1.0,
    scaleFactor: 2.15,
    cubeSize: 1.25,
    edgeGlow: 1.2,
    shape: 'sphere',
    color1: '#0066ff',
    color2: '#a855f7',
    color3: '#00f2fe',
    orbitPathBrightness: 3.5,
    orbitPathWidth: 4.0,
    orbitPathFade: 0.985,
    ...params,
  };

  const MAX_ORBIT_POINTS = 160;
  const orbitNodes = [];
  let pulseTime = 0;

  const shapeInt = SHAPE_MAP[currentParams.shape] ?? 0;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uResolution: {
        value: new THREE.Vector2(
          window.innerWidth * (window.devicePixelRatio || 1),
          window.innerHeight * (window.devicePixelRatio || 1)
        ),
      },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: {
        value: camera.projectionMatrixInverse,
      },
      uAutoRotate: { value: currentParams.autoRotate },
      uRotX: { value: currentParams.rotSpeedX },
      uRotY: { value: currentParams.rotSpeedY },
      uFractalSpeed: { value: currentParams.fractalSpeed },
      uMorphSpeed: { value: currentParams.morphSpeed },
      uScaleFactor: { value: currentParams.scaleFactor },
      uCubeSize: { value: currentParams.cubeSize },
      uEdgeGlow: { value: currentParams.edgeGlow },
      uShape: { value: shapeInt },
      uColor1: { value: hexToVec3(currentParams.color1) },
      uColor2: { value: hexToVec3(currentParams.color2) },
      uColor3: { value: hexToVec3(currentParams.color3) },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPulse: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec2 uResolution;
      uniform float uTime;
      uniform mat4 cameraWorldMatrix;
      uniform mat4 cameraProjectionMatrixInverse;
      uniform bool uAutoRotate;
      uniform float uRotX;
      uniform float uRotY;
      uniform float uFractalSpeed;
      uniform float uMorphSpeed;
      uniform float uScaleFactor;
      uniform float uCubeSize;
      uniform float uEdgeGlow;
      uniform int uShape;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform vec2 uPointer;
      uniform float uPulse;

      varying vec2 vUv;

      mat2 rot2d(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      float sdBox(vec3 p, vec3 b) {
        vec3 q = abs(p) - b;
        return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
      }

      float sdSphere(vec3 p, float r) {
        return length(p) - r;
      }

      float sdOctahedron(vec3 p, float s) {
        p = abs(p);
        return (p.x + p.y + p.z - s) * 0.57735027;
      }

      float mapShape(vec3 p) {
        vec3 q = p;
        if (uAutoRotate) {
          q.xy *= rot2d(uTime * uRotX);
          q.yz *= rot2d(uTime * uRotY);
        }
        if (uShape == 0) {
          return sdSphere(q, uCubeSize);
        } else if (uShape == 1) {
          return sdBox(q, vec3(uCubeSize));
        } else {
          return sdOctahedron(q, uCubeSize * 1.3);
        }
      }

      vec3 calcNormal(vec3 p) {
        vec2 e = vec2(0.003, 0.0);
        return normalize(vec3(
          mapShape(p + e.xyy) - mapShape(p - e.xyy),
          mapShape(p + e.yxy) - mapShape(p - e.yxy),
          mapShape(p + e.yyx) - mapShape(p - e.yyx)
        ));
      }

      vec2 intersectSphere(vec3 ro, vec3 rd, float r) {
        float b = dot(ro, rd);
        float c = dot(ro, ro) - r * r;
        float h = b * b - c;
        if (h < 0.0) return vec2(-1.0);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      vec3 calcQuantumFilaments(vec3 p, vec3 normal) {
        // Normalize position relative to unit bounds
        vec3 q = (p / max(uCubeSize, 0.1)) * 0.08;

        if (uAutoRotate) {
          q.yz *= rot2d(-uTime * uRotY * 0.8);
          q.xy *= rot2d(-uTime * uRotX * 0.8);
        }

        q.xz *= rot2d(uTime * 0.12 * uFractalSpeed);
        q.yz *= rot2d(uTime * 0.08 * uFractalSpeed);

        float scaleAccum = 0.35;
        vec3 colorAccum = vec3(0.0);
        float morph = 1.0 + uPulse * 2.0;

        for (int i = 0; i < 7; i++) {
          vec3 offset = vec3(0.14, 0.20, 0.14) + sin(uTime * 0.35 * uMorphSpeed * morph + float(i) * 1.4) * 0.004;
          q = abs(q) - offset;

          if (q.x < q.y) q.xy = q.yx;
          if (q.x < q.z) q.xz = q.zx;
          if (q.y < q.z) q.yz = q.zy;

          float angleShiftXY = sin(uTime * 0.25 * uMorphSpeed + float(i)) * 0.02;
          float angleShiftXZ = cos(uTime * 0.20 * uMorphSpeed - float(i)) * 0.02;

          q.xy *= rot2d(0.785 + float(i) * 0.02 + angleShiftXY);
          q.xz *= rot2d(0.35 + angleShiftXZ);

          q.x = q.x * 1.82 - 0.02;
          q.y = q.y * 1.82 - 0.07;
          q.z = q.z * 1.62 - 0.04;
          scaleAccum *= uScaleFactor;

          // High-contrast narrow filament lines
          float dMax = abs(max(q.x, max(q.y, q.z))) - 0.008;
          float filament = smoothstep(0.022, 0.0, dMax);

          if (filament > 0.0) {
            vec3 pal = (i % 3 == 0) ? uColor1 : (i % 3 == 1) ? uColor2 : uColor3;
            float pulseSpark = smoothstep(0.7, 1.0, sin(q.y * -8.0 + uTime * 3.0));
            pal += uColor3 * pulseSpark * 1.2;
            colorAccum += (pal * filament) / scaleAccum;
          }
        }

        // Concentrated luminous core at center
        float coreR = length(p);
        float coreGlow = exp(-coreR * 3.5) * 0.35;
        vec3 coreColor = mix(uColor1, uColor3, 0.5) * coreGlow;

        // Subtle holographic quantum scanline interference
        float scanline = step(0.55, fract(p.y * 18.0 + uTime * 0.5)) * -0.3 + 1.0;

        return (colorAccum * 0.85 + coreColor) * scanline;
      }

      vec4 marchInternalVolume(vec3 ro, vec3 rd, vec3 normal) {
        vec3 col = vec3(0.0);
        float alpha = 0.0;
        float stepSize = 0.055;

        for (int j = 0; j < 18; j++) {
          vec3 p = ro + rd * (float(j) * stepSize);
          if (mapShape(p) > 0.02) break;

          vec3 fil = calcQuantumFilaments(p, normal);
          col += fil * 0.06;
          alpha += 0.045;
          if (alpha >= 0.75) break;
        }

        return vec4(col, alpha);
      }

      void main() {
        vec2 ndc = (vUv - 0.5) * 2.0;
        vec4 clipPos = vec4(ndc, -1.0, 1.0);
        vec4 viewPos = cameraProjectionMatrixInverse * clipPos;
        vec3 rd = normalize((cameraWorldMatrix * vec4(viewPos.xyz, 0.0)).xyz);
        vec3 ro = cameraPosition;

        float boundRadius = uCubeSize * 2.4;
        vec2 hit = intersectSphere(ro, rd, boundRadius);

        if (hit.y <= 0.0) {
          gl_FragColor = vec4(0.0);
          return;
        }

        float tNear = max(0.0, hit.x);
        float tFar = hit.y;
        float t = tNear;
        bool hitSurface = false;
        vec3 hitPos = ro;

        for (int i = 0; i < 90; i++) {
          if (t > tFar) break;
          hitPos = ro + rd * t;
          float d = mapShape(hitPos);
          if (d < 0.002) {
            hitSurface = true;
            break;
          }
          t += max(d * 0.8, 0.008);
        }

        vec3 finalColor = vec3(0.0);
        float finalAlpha = 0.0;

        if (hitSurface) {
          vec3 normal = calcNormal(hitPos);
          vec3 lightDir = normalize(vec3(2.5, 3.5, 3.0));

          // Specular and Fresnel reflection on glass facet
          vec3 reflectDir = reflect(rd, normal);
          float spec = pow(max(dot(reflectDir, lightDir), 0.0), 32.0) * 0.45;
          float fresnel = pow(1.0 - max(dot(normal, -rd), 0.0), 3.0);

          // Edge detection
          vec3 qRot = hitPos;
          if (uAutoRotate) {
            qRot.xy *= rot2d(uTime * uRotX);
            qRot.yz *= rot2d(uTime * uRotY);
          }

          float edgeLuma = 0.0;
          if (uShape == 1) {
            // Cube wireframe edge glow
            vec3 distToEdge = smoothstep(uCubeSize - 0.05, uCubeSize - 0.003, abs(qRot));
            edgeLuma = max(distToEdge.x * distToEdge.y, max(distToEdge.y * distToEdge.z, distToEdge.z * distToEdge.x));
          } else {
            // Curvature / rim edge glow
            edgeLuma = fresnel;
          }

          vec3 edgeGlow = uColor3 * edgeLuma * uEdgeGlow * (1.2 + uPulse * 1.5);

          // Dark obsidian glass cavity base
          vec3 glassCavity = mix(vec3(0.008, 0.015, 0.035), uColor1 * 0.08, 0.4);

          // Raymarch volumetric quantum interior
          vec4 internalVol = marchInternalVolume(hitPos + rd * 0.02, rd, normal);

          finalColor = glassCavity + internalVol.xyz + edgeGlow + vec3(spec);
          finalColor += uColor2 * fresnel * 0.5;
          finalAlpha = clamp(0.4 + internalVol.w * 0.6 + edgeLuma * 0.5, 0.0, 1.0);
        }

        // Reinhard tonemap with vibrant saturation retention
        finalColor = finalColor / (vec3(0.85) + finalColor);

        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const fullScreenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  fullScreenQuad.frustumCulled = false;
  fullScreenQuad.renderOrder = 0;
  scene.add(fullScreenQuad);

  // 3D Orbital Lines
  const orbitLineGeometry = new LineGeometry();
  const orbitLineMaterial = new LineMaterial({
    color: 0xffffff,
    vertexColors: true,
    linewidth: currentParams.orbitPathWidth,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  orbitLineMaterial.resolution.set(window.innerWidth, window.innerHeight);

  const orbitLine = new Line2(orbitLineGeometry, orbitLineMaterial);
  orbitLine.frustumCulled = false;
  orbitLine.renderOrder = 2;
  scene.add(orbitLine);

  function sampleOrbitPoint(time) {
    const r = currentParams.cubeSize * 1.55;
    const ax = time * (currentParams.rotSpeedX * 1.6) + 0.5;
    const ay = time * (currentParams.rotSpeedY * 1.6) + 0.3;

    let x = Math.cos(ay) * r;
    let y = Math.sin(ax * 1.4) * (r * 0.65);
    let z = Math.sin(ay) * r;

    // Harmonic quantum precession
    const p1 = Math.sin(time * 2.2) * 0.3;
    const p2 = Math.cos(time * 1.8) * 0.3;
    return {
      x: x + p1,
      y: y + p2,
      z: z + p1 * 0.5,
    };
  }

  function updateOrbitTrail(time) {
    const pt = sampleOrbitPoint(time);
    orbitNodes.unshift({ ...pt, alpha: 1.0 });

    if (orbitNodes.length > MAX_ORBIT_POINTS) {
      orbitNodes.pop();
    }

    if (orbitNodes.length < 8) {
      orbitLine.visible = false;
      return;
    }

    const pos = [];
    const colors = [];
    const c1 = new THREE.Color(currentParams.color3);
    const c2 = new THREE.Color(currentParams.color2);

    for (let i = 0; i < orbitNodes.length; i++) {
      const node = orbitNodes[i];
      node.alpha *= currentParams.orbitPathFade;
      pos.push(node.x, node.y, node.z);

      const ratio = i / orbitNodes.length;
      const col = c1.clone().lerp(c2, ratio);
      const intensity = node.alpha * (currentParams.orbitPathBrightness / 4.0);
      colors.push(col.r * intensity, col.g * intensity, col.b * intensity);
    }

    orbitLineGeometry.setPositions(pos);
    orbitLineGeometry.setColors(colors);
    orbitLine.visible = true;
    orbitLine.computeLineDistances();
  }

  return {
    update({ time, pointer }) {
      pulseTime *= 0.94;
      material.uniforms.uTime.value = time;
      material.uniforms.uPointer.value.copy(pointer);
      material.uniforms.uPulse.value = pulseTime;

      material.uniforms.cameraWorldMatrix.value.copy(camera.matrixWorld);
      material.uniforms.cameraProjectionMatrixInverse.value.copy(
        camera.projectionMatrixInverse
      );

      orbitLineMaterial.resolution.set(window.innerWidth, window.innerHeight);
      updateOrbitTrail(time);
    },

    setParams(newParams) {
      Object.assign(currentParams, newParams);

      if (newParams.shape) {
        material.uniforms.uShape.value = SHAPE_MAP[newParams.shape] ?? 0;
      }
      if (newParams.cubeSize !== undefined) {
        material.uniforms.uCubeSize.value = newParams.cubeSize;
      }
      if (newParams.edgeGlow !== undefined) {
        material.uniforms.uEdgeGlow.value = newParams.edgeGlow;
      }
      if (newParams.rotSpeedX !== undefined) {
        material.uniforms.uRotX.value = newParams.rotSpeedX;
      }
      if (newParams.rotSpeedY !== undefined) {
        material.uniforms.uRotY.value = newParams.rotSpeedY;
      }
      if (newParams.fractalSpeed !== undefined) {
        material.uniforms.uFractalSpeed.value = newParams.fractalSpeed;
      }
      if (newParams.morphSpeed !== undefined) {
        material.uniforms.uMorphSpeed.value = newParams.morphSpeed;
      }
      if (newParams.scaleFactor !== undefined) {
        material.uniforms.uScaleFactor.value = newParams.scaleFactor;
      }
      if (newParams.color1) {
        material.uniforms.uColor1.value = hexToVec3(newParams.color1);
      }
      if (newParams.color2) {
        material.uniforms.uColor2.value = hexToVec3(newParams.color2);
      }
      if (newParams.color3) {
        material.uniforms.uColor3.value = hexToVec3(newParams.color3);
      }
      if (newParams.orbitPathWidth !== undefined) {
        orbitLineMaterial.linewidth = newParams.orbitPathWidth;
      }
    },

    onPointerClick() {
      pulseTime = 1.0;
    },

    onResize(width, height) {
      material.uniforms.uResolution.value.set(
        width * (window.devicePixelRatio || 1),
        height * (window.devicePixelRatio || 1)
      );
      orbitLineMaterial.resolution.set(width, height);
    },

    dispose() {
      scene.remove(fullScreenQuad);
      scene.remove(orbitLine);
      material.dispose();
      fullScreenQuad.geometry.dispose();
      orbitLineGeometry.dispose();
      orbitLineMaterial.dispose();
    },
  };
}
