import * as THREE from 'three';

const FRAME_RADIUS = 2.25;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

const CYMATICS_VERTEX_SHADER = /* glsl */ `
  attribute float aSeed;

  uniform float uRadius;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uChladniFocus;
  uniform float uVibrationAmp;
  uniform float uMotionPhase;
  uniform float uPulseDecay;
  uniform int uL;
  uniform int uM;
  uniform vec3 uNodalColor;
  uniform vec3 uAntinodalColor;
  uniform float uGlowIntensity;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vNodalProximity;

  // Associated Legendre Polynomials P_l^m(cosTheta)
  float legendre(int l, int m, float x) {
    float sintheta = sqrt(max(0.0, 1.0 - x * x));

    if (l == 2) {
      if (m == 0) return 0.5 * (3.0 * x * x - 1.0);
      if (m == 1) return -3.0 * x * sintheta;
      if (m == 2) return 3.0 * (1.0 - x * x);
    } else if (l == 3) {
      if (m == 0) return 0.5 * x * (5.0 * x * x - 3.0);
      if (m == 1) return -1.5 * (5.0 * x * x - 1.0) * sintheta;
      if (m == 2) return 15.0 * x * (1.0 - x * x);
      if (m == 3) return -15.0 * pow(sintheta, 3.0);
    } else if (l == 4) {
      if (m == 0) return 0.125 * (35.0 * pow(x, 4.0) - 30.0 * x * x + 3.0);
      if (m == 1) return -2.5 * x * (7.0 * x * x - 3.0) * sintheta;
      if (m == 2) return 7.5 * (7.0 * x * x - 1.0) * (1.0 - x * x);
      if (m == 3) return -105.0 * x * pow(sintheta, 3.0);
      if (m == 4) return 105.0 * pow(1.0 - x * x, 2.0);
    } else if (l == 5) {
      if (m == 0) return 0.125 * x * (63.0 * pow(x, 4.0) - 70.0 * x * x + 15.0);
      if (m == 1) return -1.875 * (21.0 * pow(x, 4.0) - 14.0 * x * x + 1.0) * sintheta;
      if (m == 2) return 52.5 * x * (3.0 * x * x - 1.0) * (1.0 - x * x);
      if (m == 3) return -52.5 * (9.0 * x * x - 1.0) * pow(sintheta, 3.0);
      if (m == 4) return 945.0 * x * pow(1.0 - x * x, 2.0);
    } else if (l == 6) {
      if (m == 0) return 0.0625 * (231.0 * pow(x, 6.0) - 315.0 * pow(x, 4.0) + 105.0 * x * x - 5.0);
      if (m == 1) return -2.625 * x * (33.0 * pow(x, 4.0) - 30.0 * x * x + 5.0) * sintheta;
      if (m == 2) return 13.125 * (33.0 * pow(x, 4.0) - 18.0 * x * x + 1.0) * (1.0 - x * x);
      if (m == 3) return -315.0 * x * (11.0 * x * x - 3.0) * pow(sintheta, 3.0);
      if (m == 4) return 472.5 * (11.0 * x * x - 1.0) * pow(1.0 - x * x, 2.0);
    }
    return x;
  }

  void main() {
    vec3 nPos = normalize(position);
    float cosTheta = clamp(nPos.y, -0.999, 0.999);
    float phi = atan(nPos.z, nPos.x);

    // Compute spherical harmonic amplitude
    float leg = legendre(uL, uM, cosTheta);
    float harmonicVal = leg * cos(float(uM) * phi);

    // Normalization factor approximation
    float normPsi = clamp(harmonicVal * 0.4, -2.0, 2.0);
    float absPsi = abs(normPsi);

    // Nodal line proximity (1.0 at nodal lines where harmonicVal == 0)
    float nodalProx = exp(-absPsi * absPsi * uChladniFocus * 5.0);
    vNodalProximity = nodalProx;

    // Chladni force displacement: particles drift toward nodes (away from antinodes)
    // Approximate surface gradient
    float deltaAngle = 0.02;
    float legPlus = legendre(uL, uM, clamp(cosTheta + deltaAngle, -0.999, 0.999));
    float dTheta = (abs(legPlus) - abs(leg)) / deltaAngle;
    vec3 tangentY = vec3(0.0, 1.0, 0.0) - nPos * nPos.y;
    vec3 driftDir = -tangentY * dTheta * 0.15;

    // Vibration: antinodes oscillate radially with frequency
    float vibration = sin(uMotionPhase + aSeed * 6.28) * uVibrationAmp * (1.0 - nodalProx * 0.85);

    // Pulse shock: radial burst with stochastic scatter
    float pulseScatter = uPulseDecay * (sin(aSeed * 25.0 + uMotionPhase * 2.0) * 0.35 + 0.65);

    vec3 displaced = nPos * (uRadius + vibration + pulseScatter * 0.5) + driftDir * uChladniFocus * (1.0 - uPulseDecay * 0.8);

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Distance attenuation and point size
    float depthScale = clamp(8.0 / max(0.5, -mvPosition.z), 0.6, 2.5);
    gl_PointSize = max(1.0, uPointSize * uPixelRatio * depthScale * (0.8 + nodalProx * 0.4));

    // Color: crisp nodal color on nodes, antinodal color on vibrating regions
    vec3 col = mix(uAntinodalColor, uNodalColor, nodalProx);
    col = mix(col, vec3(1.0, 1.0, 1.0), uPulseDecay * 0.6); // Flash on pulse
    vColor = col * uGlowIntensity;

    // Depth cue and alpha
    float nearMix = 1.0 - smoothstep(2.5, 8.5, -mvPosition.z);
    vAlpha = mix(0.45, 0.95, nearMix) * (0.7 + nodalProx * 0.3);
  }
`;

const CYMATICS_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vNodalProximity;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float distSq = dot(coord, coord);
    if (distSq > 0.25) discard;

    float core = exp(-distSq * 50.0);
    float halo = exp(-distSq * 12.0);
    float alpha = (core * 0.9 + halo * 0.35) * vAlpha;

    vec3 light = vColor * (core * 1.6 + halo * 0.5);
    gl_FragColor = vec4(light, alpha);
  }
`;

export function createCymaticsEngine({ scene, renderer, params }) {
  const currentParams = {
    particleCount: 8192,
    shellRadius: 1.6,
    coreRadius: 1.25,
    harmonicL: 4,
    harmonicM: 2,
    pointSize: 2.6,
    chladniFocus: 1.35,
    vibrationAmp: 0.08,
    vibrationRate: 1.2,
    pulseShock: 1.1,
    nodalColor: '#00f0ff',
    antinodalColor: '#7c3aed',
    coreColor: '#030712',
    particleGlow: 1.8,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let points = null;
  let pointsGeometry = null;
  let pointsMaterial = null;
  let coreSphere = null;
  let coreGeometry = null;
  let coreMaterial = null;

  let pulseTimer = 0;
  let motionPhase = 0;

  const nodalRGB = new THREE.Color(currentParams.nodalColor);
  const antinodalRGB = new THREE.Color(currentParams.antinodalColor);
  const coreRGB = new THREE.Color(currentParams.coreColor);

  function buildParticles() {
    if (points) {
      group.remove(points);
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      points = null;
    }
    if (coreSphere) {
      group.remove(coreSphere);
      coreGeometry.dispose();
      coreMaterial.dispose();
      coreSphere = null;
    }

    const count = Number(currentParams.particleCount) || 8192;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);

    // Uniform spherical Fibonacci distribution
    for (let i = 0; i < count; i++) {
      const theta = 2 * Math.PI * i / GOLDEN_RATIO;
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.cos(phi);
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);
      seeds[i] = (i * 0.61803398875) % 1.0;
    }

    pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointsGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const pixelRatio = renderer?.getPixelRatio ? renderer.getPixelRatio() : 1.0;

    pointsMaterial = new THREE.ShaderMaterial({
      vertexShader: CYMATICS_VERTEX_SHADER,
      fragmentShader: CYMATICS_FRAGMENT_SHADER,
      uniforms: {
        uRadius: { value: Number(currentParams.shellRadius) || 1.6 },
        uPointSize: { value: Number(currentParams.pointSize) || 2.6 },
        uPixelRatio: { value: pixelRatio },
        uChladniFocus: { value: Number(currentParams.chladniFocus) || 1.35 },
        uVibrationAmp: { value: Number(currentParams.vibrationAmp) || 0.08 },
        uMotionPhase: { value: 0.0 },
        uPulseDecay: { value: 0.0 },
        uL: { value: Math.max(2, Math.min(6, parseInt(currentParams.harmonicL, 10) || 4)) },
        uM: { value: Math.max(0, Math.min(4, parseInt(currentParams.harmonicM, 10) || 2)) },
        uNodalColor: { value: nodalRGB },
        uAntinodalColor: { value: antinodalRGB },
        uGlowIntensity: { value: Number(currentParams.particleGlow) || 1.8 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    points = new THREE.Points(pointsGeometry, pointsMaterial);
    group.add(points);

    // Inner dark resonant core sphere for occlusion and contrast
    const coreR = Number(currentParams.coreRadius) || 1.25;
    coreGeometry = new THREE.SphereGeometry(coreR, 32, 24);
    coreMaterial = new THREE.MeshBasicMaterial({
      color: coreRGB,
      transparent: true,
      opacity: 0.88,
      depthWrite: true,
    });
    coreSphere = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(coreSphere);
  }

  buildParticles();

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      const dt = Math.min(delta || 0, 1 / 30);
      const rate = Number(currentParams.vibrationRate) || 1.2;
      motionPhase += dt * rate * 3.5;

      if (pulseTimer > 0) {
        pulseTimer = Math.max(0, pulseTimer - dt * 2.2);
      }

      // Group rotation
      group.rotation.y = time * 0.12;
      group.rotation.x = Math.sin(time * 0.08) * 0.14;

      if (pointsMaterial) {
        pointsMaterial.uniforms.uMotionPhase.value = motionPhase;
        pointsMaterial.uniforms.uPulseDecay.value = pulseTimer;
      }
    },

    setParams(patch) {
      let needsRebuild = false;
      if (patch.particleCount !== undefined && patch.particleCount !== currentParams.particleCount) {
        currentParams.particleCount = patch.particleCount;
        needsRebuild = true;
      }
      if (patch.shellRadius !== undefined && patch.shellRadius !== currentParams.shellRadius) {
        currentParams.shellRadius = patch.shellRadius;
        if (pointsMaterial) pointsMaterial.uniforms.uRadius.value = patch.shellRadius;
      }
      if (patch.coreRadius !== undefined && patch.coreRadius !== currentParams.coreRadius) {
        currentParams.coreRadius = patch.coreRadius;
        needsRebuild = true;
      }
      if (patch.harmonicL !== undefined && patch.harmonicL !== currentParams.harmonicL) {
        currentParams.harmonicL = patch.harmonicL;
        if (pointsMaterial) pointsMaterial.uniforms.uL.value = parseInt(patch.harmonicL, 10);
      }
      if (patch.harmonicM !== undefined && patch.harmonicM !== currentParams.harmonicM) {
        currentParams.harmonicM = patch.harmonicM;
        if (pointsMaterial) pointsMaterial.uniforms.uM.value = parseInt(patch.harmonicM, 10);
      }

      Object.assign(currentParams, patch);

      if (pointsMaterial) {
        if (patch.pointSize !== undefined) pointsMaterial.uniforms.uPointSize.value = patch.pointSize;
        if (patch.chladniFocus !== undefined) pointsMaterial.uniforms.uChladniFocus.value = patch.chladniFocus;
        if (patch.vibrationAmp !== undefined) pointsMaterial.uniforms.uVibrationAmp.value = patch.vibrationAmp;
        if (patch.particleGlow !== undefined) pointsMaterial.uniforms.uGlowIntensity.value = patch.particleGlow;
        if (patch.nodalColor !== undefined) {
          nodalRGB.set(patch.nodalColor);
          pointsMaterial.uniforms.uNodalColor.value = nodalRGB;
        }
        if (patch.antinodalColor !== undefined) {
          antinodalRGB.set(patch.antinodalColor);
          pointsMaterial.uniforms.uAntinodalColor.value = antinodalRGB;
        }
      }

      if (patch.coreColor !== undefined && coreMaterial) {
        coreRGB.set(patch.coreColor);
        coreMaterial.color = coreRGB;
      }

      if (needsRebuild) {
        buildParticles();
      }
    },

    onPulse() {
      pulseTimer = Number(currentParams.pulseShock) || 1.1;
    },

    onResize(width, height) {
      if (pointsMaterial && renderer?.getPixelRatio) {
        pointsMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      }
    },

    dispose() {
      scene.remove(group);
      if (points) {
        group.remove(points);
        pointsGeometry?.dispose();
        pointsMaterial?.dispose();
      }
      if (coreSphere) {
        group.remove(coreSphere);
        coreGeometry?.dispose();
        coreMaterial?.dispose();
      }
    },
  };
}
