import * as THREE from 'three';

export function createNebulaEngine({ scene, camera, renderer, params }) {
  const currentParams = {
    sphereRadius: 2.15,
    edgeFade: 0.381,
    sphereSpinSpeed: -0.65,
    fractalScale: 0.7602,
    fractalMult: 2.196,
    fractalWarpSpeed: 0.0262,
    aberration: 0.85,
    glowIntensity: 0.016,
    atmosphereStrength: 0.35,
    particleDensity: 0.021,
    color1: '#00ffc8',
    color2: '#4466ff',
    colorShell: '#00ffc8',
    marchQuality: 1.0,
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
      uColor1: { value: new THREE.Color(currentParams.color1) },
      uColor2: { value: new THREE.Color(currentParams.color2) },
      uSphereRadius: { value: currentParams.sphereRadius },
      uEdgeFade: { value: currentParams.edgeFade },
      uFractalScale: { value: currentParams.fractalScale },
      uFractalMult: { value: currentParams.fractalMult },
      uGlowIntensity: { value: currentParams.glowIntensity },
      uFractalWarpSpeed: { value: currentParams.fractalWarpSpeed },
      uSphereSpin: { value: 0.0 },
      uAberration: { value: currentParams.aberration },
      uParticleDensity: { value: currentParams.particleDensity },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPulse: { value: 0.0 },
      uMarchQuality: { value: currentParams.marchQuality },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform float uSphereRadius;
      uniform float uEdgeFade;
      uniform float uFractalScale;
      uniform float uFractalMult;
      uniform float uGlowIntensity;
      uniform float uFractalWarpSpeed;
      uniform float uSphereSpin;
      uniform float uAberration;
      uniform float uParticleDensity;
      uniform vec2 uPointer;
      uniform float uPulse;
      uniform float uMarchQuality;

      uniform mat4 cameraWorldMatrix;
      uniform mat4 cameraProjectionMatrixInverse;

      varying vec2 vUv;

      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float hash31(vec3 p3) {
        p3 = fract(p3 * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.12 - h);
      }

      vec3 palette(float t) {
        float blend = sin(t * 1.4) * 0.5 + 0.5;
        return mix(uColor1, uColor2, blend);
      }

      float map(vec3 p) {
        float d = 100.2;
        float scale = 0.4;
        p += vec3(12.600, 4.400, 5.569);

        for (int i = 1; i < 4; i++) {
          p.xy *= rot(uTime * uFractalWarpSpeed + 0.2);
          p.yz *= rot(uTime * (uFractalWarpSpeed * 1.5) - 0.1);
          float dotp = dot(sin(p), cos(p.zxy));
          float gyroid = sqrt(dotp * dotp + 0.055) - 0.137;
          d = smin(d, gyroid / abs(scale), 0.15);
          p *= uFractalScale;
          scale *= uFractalMult;
          p += vec3(-1.7, 1.2, 3.5);
        }
        return d;
      }

      vec2 intersectSphere(vec3 ro, vec3 rd, float r) {
        float b = dot(ro, rd);
        float c = dot(ro, ro) - r * r;
        float h = b * b - c;
        if (h < 0.0) return vec2(0.0);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      void main() {
        vec2 ndc = (vUv - 0.5) * 2.0;
        vec4 clipPos = vec4(ndc, -1.0, 1.0);
        vec4 viewPos = cameraProjectionMatrixInverse * clipPos;
        vec3 rd = normalize((cameraWorldMatrix * vec4(viewPos.xyz, 0.0)).xyz);
        vec3 ro = cameraPosition;

        mat2 spinRot = rot(uSphereSpin);
        ro.xz *= spinRot;
        rd.xz *= spinRot;

        vec2 hit = intersectSphere(ro, rd, uSphereRadius);

        if (hit.y <= 0.0) {
          gl_FragColor = vec4(0.0);
          return;
        }

        float pointerAberration = uAberration + length(uPointer) * 0.25;
        float phaseOffset = dot(uPointer, ndc.xy) * pointerAberration * 0.08 + uPulse * 0.15;

        float tNear = max(0.0, hit.x);
        float tFar = hit.y;
        float t = tNear + hash(gl_FragCoord.xy) * 0.15;
        vec3 accumulatedGlow = vec3(0.0);
        int maxSteps = int(90.0 * uMarchQuality);

        for (int i = 0; i < 90; i++) {
          if (i >= maxSteps || t > tFar) break;

          vec3 p = ro + rd * t;
          float d = map(p);
          float distFromCenter = length(p);
          float fade = smoothstep(uSphereRadius, uSphereRadius - uEdgeFade, distFromCenter);

          // Exponential falloff creates crisp, glowing ribbons with deep dark cavities between folds
          float foldGlow = exp(-abs(d) * 6.5);
          float intensity = (uGlowIntensity * 28.0 * foldGlow + 0.004) * fade;

          float phase = length(p) * -0.4 - uTime * -0.1 + phaseOffset;
          vec3 holoColor;
          holoColor.r = palette(phase + pointerAberration * 0.1).r;
          holoColor.g = palette(phase).g;
          holoColor.b = palette(phase - pointerAberration * 0.1).b;

          accumulatedGlow += holoColor * intensity;

          vec3 pPos = p * 25.0 + vec3(uTime * 1.5, uTime * -2.0, uTime * 0.5);
          vec3 pCell = floor(pPos);
          vec3 pFract = fract(pPos) - 0.5;
          float isParticle = step(1.0 - uParticleDensity, hash31(pCell));
          float pDist = length(pFract);
          float pIntensity = 0.0015 / (pDist + 0.005);
          vec3 pColor = vec3(1.0) * pIntensity * isParticle * (intensity * 25.0);
          accumulatedGlow += pColor + (accumulatedGlow * pColor * 2.5);

          t += max(abs(d) * 0.7, 0.022);
        }

        if (hit.x > 0.0) {
          vec3 shellNormal = normalize(ro + rd * hit.x);
          float rimLight = 0.5 - max(0.0, dot(-rd, shellNormal));
          accumulatedGlow += vec3(0.2, 0.0, 0.6) * pow(max(rimLight, 0.0), 4.0) * 0.3;
        }

        accumulatedGlow = accumulatedGlow / (1.35 + accumulatedGlow);
        float alpha = clamp(dot(accumulatedGlow, vec3(0.333)) * 2.0, 0.0, 1.0);
        gl_FragColor = vec4(accumulatedGlow, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const fullScreenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  fullScreenQuad.frustumCulled = false;
  fullScreenQuad.renderOrder = 0;
  scene.add(fullScreenQuad);

  // Atmosphere Corona Mesh
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(currentParams.colorShell || currentParams.color1) },
      glowStrength: { value: currentParams.atmosphereStrength },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float glowStrength;
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.8);
        float innerFade = smoothstep(1.0, 0.82, max(dot(viewDir, normal), 0.0));
        gl_FragColor = vec4(glowColor, fresnel * innerFade * glowStrength);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const coronaMesh = new THREE.Mesh(
    new THREE.SphereGeometry(currentParams.sphereRadius * 1.04, 48, 48),
    atmosphereMaterial
  );
  coronaMesh.renderOrder = 1;
  scene.add(coronaMesh);

  let pulseValue = 0;
  let currentSpin = 0;

  function applyParams(newParams) {
    Object.assign(currentParams, newParams);

    if (newParams.sphereRadius !== undefined) {
      material.uniforms.uSphereRadius.value = newParams.sphereRadius;
      coronaMesh.scale.setScalar(newParams.sphereRadius / 2.15);
    }
    if (newParams.edgeFade !== undefined) {
      material.uniforms.uEdgeFade.value = newParams.edgeFade;
    }
    if (newParams.fractalScale !== undefined) {
      material.uniforms.uFractalScale.value = newParams.fractalScale;
    }
    if (newParams.fractalMult !== undefined) {
      material.uniforms.uFractalMult.value = newParams.fractalMult;
    }
    if (newParams.fractalWarpSpeed !== undefined) {
      material.uniforms.uFractalWarpSpeed.value = newParams.fractalWarpSpeed;
    }
    if (newParams.aberration !== undefined) {
      material.uniforms.uAberration.value = newParams.aberration;
    }
    if (newParams.glowIntensity !== undefined) {
      material.uniforms.uGlowIntensity.value = newParams.glowIntensity;
    }
    if (newParams.particleDensity !== undefined) {
      material.uniforms.uParticleDensity.value = newParams.particleDensity;
    }
    if (newParams.marchQuality !== undefined) {
      material.uniforms.uMarchQuality.value = newParams.marchQuality;
    }
    if (newParams.color1) {
      material.uniforms.uColor1.value.set(newParams.color1);
    }
    if (newParams.color2) {
      material.uniforms.uColor2.value.set(newParams.color2);
    }
    if (newParams.colorShell) {
      atmosphereMaterial.uniforms.glowColor.value.set(newParams.colorShell);
    }
    if (newParams.atmosphereStrength !== undefined) {
      atmosphereMaterial.uniforms.glowStrength.value = newParams.atmosphereStrength;
    }
  }

  return {
    update({ time, delta, pointer, marchQuality }) {
      pulseValue *= 0.92;
      currentSpin += delta * currentParams.sphereSpinSpeed;

      material.uniforms.uTime.value = time;
      material.uniforms.uSphereSpin.value = currentSpin;
      material.uniforms.uPointer.value.copy(pointer);
      material.uniforms.uPulse.value = pulseValue;
      if (marchQuality !== undefined) {
        material.uniforms.uMarchQuality.value = marchQuality;
      }

      material.uniforms.cameraWorldMatrix.value.copy(camera.matrixWorld);
      material.uniforms.cameraProjectionMatrixInverse.value.copy(
        camera.projectionMatrixInverse
      );
    },

    setParams: applyParams,
    onParamsChange: applyParams,

    onPointerClick() {
      pulseValue = 1.0;
    },
    onPulse() {
      pulseValue = 1.0;
    },

    onResize(width, height) {
      material.uniforms.uResolution.value.set(
        width * (window.devicePixelRatio || 1),
        height * (window.devicePixelRatio || 1)
      );
    },
    resize(width, height) {
      this.onResize(width, height);
    },

    dispose() {
      scene.remove(fullScreenQuad);
      scene.remove(coronaMesh);
      material.dispose();
      atmosphereMaterial.dispose();
      fullScreenQuad.geometry.dispose();
      coronaMesh.geometry.dispose();
    },
  };
}
