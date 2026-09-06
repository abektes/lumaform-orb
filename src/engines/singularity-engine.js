import * as THREE from 'three';

function hexToVec3(hex) {
  const color = new THREE.Color(hex);
  return new THREE.Vector3(color.r, color.g, color.b);
}

export function createSingularityEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    horizonRadius: 1.05,
    diskInner: 1.45,
    diskOuter: 3.5,
    accretionDensity: 1.6,
    warpStrength: 1.35,
    diskSpeed: 0.85,
    dopplerShift: 0.75,
    diskTilt: 0.28,
    color1: '#f59e0b', // Burning gold
    color2: '#ef4444', // Collapsar red
    color3: '#38bdf8', // Relativistic blue
    ...params,
  };

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
      uHorizonRadius: { value: currentParams.horizonRadius },
      uDiskInner: { value: currentParams.diskInner },
      uDiskOuter: { value: currentParams.diskOuter },
      uAccretionDensity: { value: currentParams.accretionDensity },
      uWarpStrength: { value: currentParams.warpStrength },
      uDiskSpeed: { value: currentParams.diskSpeed },
      uDopplerShift: { value: currentParams.dopplerShift },
      uDiskTilt: { value: currentParams.diskTilt },
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
      uniform float uHorizonRadius;
      uniform float uDiskInner;
      uniform float uDiskOuter;
      uniform float uAccretionDensity;
      uniform float uWarpStrength;
      uniform float uDiskSpeed;
      uniform float uDopplerShift;
      uniform float uDiskTilt;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform vec2 uPointer;
      uniform float uPulse;

      varying vec2 vUv;

      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.1 + vec2(1.3, 2.7);
          a *= 0.5;
        }
        return v;
      }

      vec2 intersectSphere(vec3 ro, vec3 rd, float r) {
        float b = dot(ro, rd);
        float c = dot(ro, ro) - r * r;
        float h = b * b - c;
        if (h < 0.0) return vec2(-1.0);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      void main() {
        vec2 ndc = (vUv - 0.5) * 2.0;
        vec4 clipPos = vec4(ndc, -1.0, 1.0);
        vec4 viewPos = cameraProjectionMatrixInverse * clipPos;
        vec3 rd = normalize((cameraWorldMatrix * vec4(viewPos.xyz, 0.0)).xyz);
        vec3 ro = cameraPosition;

        float boundRadius = uDiskOuter * 1.45;
        vec2 hit = intersectSphere(ro, rd, boundRadius);

        if (hit.y <= 0.0) {
          gl_FragColor = vec4(0.0);
          return;
        }

        float tNear = max(0.0, hit.x);
        float tFar = hit.y;
        vec3 p = ro + rd * tNear;
        vec3 dir = rd;
        vec3 accumulatedColor = vec3(0.0);
        float accumulatedAlpha = 0.0;

        float totalDist = tFar - tNear;
        float stepSize = clamp(totalDist / 95.0, 0.04, 0.12);

        float rs = uHorizonRadius;
        bool fellIn = false;

        // Gravitational Curved Raymarch
        for (int i = 0; i < 95; i++) {
          float r = length(p);

          // Event horizon boundary
          if (r < rs) {
            fellIn = true;
            break;
          }

          if (r > boundRadius * 1.05) break;

          // Relativistic light deflection: d2x/ds2 ~ -1.5 * rs * x / r^3
          vec3 gravityDir = -p / (r + 0.001);
          float deflection = (1.5 * rs * uWarpStrength) / (r * r + 0.04);
          dir = normalize(dir + gravityDir * deflection * stepSize);

          // Accretion Disk coordinate frame with plane tilt
          vec3 diskP = p;
          diskP.yz *= rot(uDiskTilt);

          float diskR = length(diskP.xz);
          float diskThickness = 0.12 * (1.0 + diskR * 0.06);

          // Continuous Gaussian vertical density profile (never misses thin disk)
          float diskDistY = abs(diskP.y);
          float verticalDensity = exp(-(diskDistY * diskDistY) / (2.0 * diskThickness * diskThickness));

          if (verticalDensity > 0.01 && diskR >= uDiskInner * 0.95 && diskR <= uDiskOuter) {
            float radialFade = smoothstep(uDiskInner * 0.95, uDiskInner + 0.35, diskR) *
                               smoothstep(uDiskOuter, uDiskOuter - 0.5, diskR);

            float phi = atan(diskP.z, diskP.x);
            float orbitalVelocity = uDiskSpeed * (2.4 / sqrt(max(diskR, 0.5)));
            float swirlAngle = phi + uTime * orbitalVelocity;
            float turbulence = fbm(vec2(diskR * 3.8 - uTime * 0.4, swirlAngle * 3.0));

            // Relativistic Doppler Beaming
            vec3 tangent = vec3(-sin(phi), 0.0, cos(phi));
            float beaming = 1.0 + dot(tangent, -dir) * uDopplerShift * 0.7;
            beaming = clamp(beaming, 0.25, 2.4);

            float density = verticalDensity * radialFade * (0.35 + turbulence * 0.85) * uAccretionDensity * beaming;
            float tempGradient = smoothstep(uDiskOuter, uDiskInner, diskR);

            vec3 plasmaColor = mix(uColor2, uColor1, pow(tempGradient, 1.8));
            // Doppler shift color tinting (approaching side blue shifts, receding red shifts)
            plasmaColor = mix(plasmaColor, uColor3, clamp(beaming - 1.0, 0.0, 1.0) * 0.5);

            float stepAlpha = density * 0.22;
            accumulatedColor += plasmaColor * stepAlpha * (1.0 - accumulatedAlpha);
            accumulatedAlpha += stepAlpha;

            if (accumulatedAlpha >= 0.96) break;
          }

          // Luminous Einstein Photon Sphere Ring (at r ~ 1.5 * rs)
          float photonDist = abs(r - rs * 1.52);
          if (photonDist < 0.22) {
            float photonGlow = exp(-photonDist * 16.0) * 0.07;
            accumulatedColor += mix(uColor1, uColor3, 0.3) * photonGlow * (1.0 - accumulatedAlpha);
          }

          p += dir * stepSize;
        }

        if (fellIn) {
          // Event Horizon consumes light behind it
          accumulatedColor *= (1.0 - accumulatedAlpha);
        }

        // Reinhard tonemapping
        accumulatedColor = accumulatedColor / (vec3(0.85) + accumulatedColor);

        float alpha = fellIn ? 1.0 : clamp(accumulatedAlpha * 1.4 + length(accumulatedColor), 0.0, 1.0);
        gl_FragColor = vec4(accumulatedColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  let pulseValue = 0;

  return {
    update({ time, pointer }) {
      pulseValue *= 0.92;
      material.uniforms.uTime.value = time;
      material.uniforms.uPointer.value.copy(pointer);
      material.uniforms.uPulse.value = pulseValue;

      material.uniforms.cameraWorldMatrix.value.copy(camera.matrixWorld);
      material.uniforms.cameraProjectionMatrixInverse.value.copy(
        camera.projectionMatrixInverse
      );
    },

    setParams(newParams) {
      Object.assign(currentParams, newParams);

      if (newParams.horizonRadius !== undefined) {
        material.uniforms.uHorizonRadius.value = newParams.horizonRadius;
      }
      if (newParams.diskInner !== undefined) {
        material.uniforms.uDiskInner.value = newParams.diskInner;
      }
      if (newParams.diskOuter !== undefined) {
        material.uniforms.uDiskOuter.value = newParams.diskOuter;
      }
      if (newParams.accretionDensity !== undefined) {
        material.uniforms.uAccretionDensity.value = newParams.accretionDensity;
      }
      if (newParams.warpStrength !== undefined) {
        material.uniforms.uWarpStrength.value = newParams.warpStrength;
      }
      if (newParams.diskSpeed !== undefined) {
        material.uniforms.uDiskSpeed.value = newParams.diskSpeed;
      }
      if (newParams.dopplerShift !== undefined) {
        material.uniforms.uDopplerShift.value = newParams.dopplerShift;
      }
      if (newParams.diskTilt !== undefined) {
        material.uniforms.uDiskTilt.value = newParams.diskTilt;
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
    },

    onPointerClick() {
      pulseValue = 1.0;
    },

    onResize(width, height) {
      material.uniforms.uResolution.value.set(
        width * (window.devicePixelRatio || 1),
        height * (window.devicePixelRatio || 1)
      );
    },

    dispose() {
      scene.remove(quad);
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
