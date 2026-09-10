import * as THREE from 'three';

const FRAME_RADIUS = 2.28;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

const SUPERPOSITION_VERTEX_SHADER = /* glsl */ `
  attribute float aShellIndex;
  attribute float aPhaseOffset;

  uniform float uScale;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uCoherence;
  uniform float uWaveExcursion;
  uniform float uPhaseAngle;
  uniform float uCollapse;
  uniform int uMode; // 0: hybrid_sp, 1: d_orbital, 2: f_orbital, 3: chiral_vortex
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uNodalColor;
  uniform float uGlowIntensity;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vDensity;

  void main() {
    vec3 nPos = normalize(position);
    float cosTheta = clamp(nPos.y, -0.999, 0.999);
    float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    float phi = atan(nPos.z, nPos.x);

    // Evaluate complex quantum orbital harmonics
    vec2 psi1 = vec2(0.0);
    vec2 psi2 = vec2(0.0);

    if (uMode == 0) {
      // SP Hybrid: s-orbital + p_z directional lobe
      float s = 0.6;
      float pz = cosTheta * 1.2;
      psi1 = vec2(s + pz, 0.0);
      psi2 = vec2(s - pz * cos(uPhaseAngle), -pz * sin(uPhaseAngle));
    } else if (uMode == 1) {
      // D-Orbital: d_{z^2} (torus collar + polar lobes) + d_{x^2-y^2} (4-leaf clover)
      float dz2 = (3.0 * cosTheta * cosTheta - 1.0) * 0.7;
      float dx2y2 = (sinTheta * sinTheta) * cos(2.0 * phi) * 1.1;
      psi1 = vec2(dz2, 0.0);
      psi2 = vec2(dx2y2 * cos(uPhaseAngle), dx2y2 * sin(uPhaseAngle));
    } else if (uMode == 2) {
      // F-Orbital: cubic octupole 8-lobed symmetry
      float f1 = cosTheta * (5.0 * cosTheta * cosTheta - 3.0) * 0.6;
      float f2 = (sinTheta * sinTheta * cosTheta) * sin(2.0 * phi) * 1.5;
      psi1 = vec2(f1, 0.0);
      psi2 = vec2(f2 * cos(uPhaseAngle), f2 * sin(uPhaseAngle));
    } else {
      // Chiral vortex: azimuthal angular momentum winding
      float ring = sinTheta * 0.9;
      psi1 = vec2(ring * cos(2.0 * phi), ring * sin(2.0 * phi));
      psi2 = vec2(ring * cos(3.0 * phi + uPhaseAngle), ring * sin(3.0 * phi + uPhaseAngle));
    }

    // Coherent superposition state
    vec2 psi = mix(psi1, psi2, 0.5);

    // Wavefunction collapse: concentrates onto positive detector lobe
    if (uCollapse > 0.0) {
      float detector = max(0.0, nPos.y);
      float collapsed = pow(detector, 4.0) * 2.5;
      psi = mix(psi, vec2(collapsed, 0.0), uCollapse * 0.9);
    }

    // Probability density |Psi|^2
    float density = dot(psi, psi);
    vDensity = density;

    // Complex phase angle arg(Psi)
    float phase = atan(psi.y, psi.x); // [-pi, pi]
    float phaseNorm = phase / 3.14159265;

    // Structured orbital deformation: surface expands into physical probability lobes!
    float baseR = 1.0 + aShellIndex * 0.35;
    float lobeDisplacement = sqrt(density) * uWaveExcursion * 0.9;
    vec3 displaced = nPos * (baseR + lobeDisplacement) * uScale;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Point size scaled by probability density
    float depthScale = clamp(8.0 / max(0.5, -mvPosition.z), 0.6, 2.5);
    float pointFactor = clamp(density * 1.6 + 0.4, 0.5, 3.2);
    gl_PointSize = max(1.0, uPointSize * uPixelRatio * depthScale * pointFactor);

    // Color gradient mapped to quantum phase
    float phaseT = clamp(phaseNorm * 0.5 + 0.5, 0.0, 1.0);
    vec3 phaseColor = mix(uColorA, uColorB, phaseT);

    // Nodal sparkle at highest probability peaks
    float peakGlow = smoothstep(0.8, 2.2, density);
    vec3 finalColor = mix(phaseColor, uNodalColor, peakGlow);

    // Flash on collapse
    finalColor = mix(finalColor, vec3(1.0, 1.0, 1.0), uCollapse * 0.6);

    vColor = finalColor * uGlowIntensity;

    float nearMix = 1.0 - smoothstep(2.5, 8.5, -mvPosition.z);
    vAlpha = clamp(0.35 + density * 0.8, 0.2, 0.95) * mix(0.55, 1.0, nearMix);
  }
`;

const SUPERPOSITION_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vDensity;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float distSq = dot(coord, coord);
    if (distSq > 0.25) discard;

    float core = exp(-distSq * 55.0);
    float halo = exp(-distSq * 12.0);
    float alpha = (core * 0.95 + halo * 0.35) * vAlpha;

    vec3 light = vColor * (core * 1.7 + halo * 0.5);
    gl_FragColor = vec4(light, alpha);
  }
`;

export function createSuperpositionEngine({ scene, renderer, params }) {
  const currentParams = {
    sampleDensity: 6144,
    orbitalScale: 1.45,
    stateMode: 'd_orbital',
    pointSize: 2.8,
    coherence: 0.85,
    waveExcursion: 0.45,
    breatheAmp: 0.04,
    phaseRate: 1.1,
    collapseStrength: 1.4,
    psiColorA: '#38bdf8',
    psiColorB: '#f43f5e',
    nodalColor: '#e0f2fe',
    glowIntensity: 1.8,
    nucleusRadius: 0.38,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let points = null;
  let pointsGeometry = null;
  let pointsMaterial = null;
  let nucleus = null;
  let nucleusGeometry = null;
  let nucleusMaterial = null;

  let phaseAngle = 0;
  let collapseTimer = 0;

  const colorA = new THREE.Color(currentParams.psiColorA);
  const colorB = new THREE.Color(currentParams.psiColorB);
  const nodalRGB = new THREE.Color(currentParams.nodalColor);

  function getModeIndex(modeStr) {
    if (modeStr === 'hybrid_sp') return 0;
    if (modeStr === 'd_orbital') return 1;
    if (modeStr === 'f_orbital') return 2;
    if (modeStr === 'chiral_vortex') return 3;
    return 1;
  }

  function buildOrbital() {
    if (points) {
      group.remove(points);
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      points = null;
    }
    if (nucleus) {
      group.remove(nucleus);
      nucleusGeometry.dispose();
      nucleusMaterial.dispose();
      nucleus = null;
    }

    const count = parseInt(currentParams.sampleDensity, 10) || 6144;
    const positions = new Float32Array(count * 3);
    const shellIndices = new Float32Array(count);
    const phaseOffsets = new Float32Array(count);

    // Two nested coherent shells structured on Fibonacci spheres
    const halfCount = Math.floor(count / 2);
    for (let i = 0; i < count; i++) {
      const shell = i < halfCount ? 0 : 1;
      const idx = shell === 0 ? i : i - halfCount;
      const total = shell === 0 ? halfCount : count - halfCount;

      const theta = 2 * Math.PI * idx / GOLDEN_RATIO;
      const phi = Math.acos(1 - 2 * (idx + 0.5) / total);

      positions[i * 3] = Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.cos(phi);
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);

      shellIndices[i] = shell;
      phaseOffsets[i] = (idx / total) * Math.PI * 2.0;
    }

    pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointsGeometry.setAttribute('aShellIndex', new THREE.BufferAttribute(shellIndices, 1));
    pointsGeometry.setAttribute('aPhaseOffset', new THREE.BufferAttribute(phaseOffsets, 1));

    const pixelRatio = renderer?.getPixelRatio ? renderer.getPixelRatio() : 1.0;

    pointsMaterial = new THREE.ShaderMaterial({
      vertexShader: SUPERPOSITION_VERTEX_SHADER,
      fragmentShader: SUPERPOSITION_FRAGMENT_SHADER,
      uniforms: {
        uScale: { value: Number(currentParams.orbitalScale) || 1.45 },
        uPointSize: { value: Number(currentParams.pointSize) || 2.8 },
        uPixelRatio: { value: pixelRatio },
        uCoherence: { value: Number(currentParams.coherence) || 0.85 },
        uWaveExcursion: { value: Number(currentParams.waveExcursion) || 0.45 },
        uPhaseAngle: { value: 0.0 },
        uCollapse: { value: 0.0 },
        uMode: { value: getModeIndex(currentParams.stateMode) },
        uColorA: { value: colorA },
        uColorB: { value: colorB },
        uNodalColor: { value: nodalRGB },
        uGlowIntensity: { value: Number(currentParams.glowIntensity) || 1.8 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    points = new THREE.Points(pointsGeometry, pointsMaterial);
    group.add(points);

    // Glowing quantum nucleus at origin
    const nucleusR = Number(currentParams.nucleusRadius) || 0.38;
    nucleusGeometry = new THREE.IcosahedronGeometry(nucleusR, 2);
    nucleusMaterial = new THREE.MeshBasicMaterial({
      color: nodalRGB,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: true,
    });
    nucleus = new THREE.Mesh(nucleusGeometry, nucleusMaterial);
    group.add(nucleus);
  }

  buildOrbital();

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta }) {
      const dt = Math.min(delta || 0, 1 / 30);
      const rate = Number(currentParams.phaseRate) || 1.1;
      phaseAngle += dt * rate * 2.6;

      if (collapseTimer > 0) {
        collapseTimer = Math.max(0, collapseTimer - dt * 1.8);
      }

      // Precession & rotation
      group.rotation.y = time * 0.16;
      group.rotation.z = Math.sin(time * 0.1) * 0.15;

      const breathe = 1.0 + Math.sin(time * 1.8) * (Number(currentParams.breatheAmp) || 0.04);

      if (pointsMaterial) {
        pointsMaterial.uniforms.uPhaseAngle.value = phaseAngle;
        pointsMaterial.uniforms.uCollapse.value = collapseTimer;
      }

      if (nucleus) {
        nucleus.rotation.x = -time * 0.4;
        nucleus.rotation.y = time * 0.6;
        const nScale = breathe * (1.0 + collapseTimer * 0.3);
        nucleus.scale.set(nScale, nScale, nScale);
      }
    },

    setParams(patch) {
      let needsRebuild = false;
      if (patch.sampleDensity !== undefined && patch.sampleDensity !== currentParams.sampleDensity) {
        currentParams.sampleDensity = patch.sampleDensity;
        needsRebuild = true;
      }
      if (patch.orbitalScale !== undefined && patch.orbitalScale !== currentParams.orbitalScale) {
        currentParams.orbitalScale = patch.orbitalScale;
        if (pointsMaterial) pointsMaterial.uniforms.uScale.value = patch.orbitalScale;
      }
      if (patch.nucleusRadius !== undefined && patch.nucleusRadius !== currentParams.nucleusRadius) {
        currentParams.nucleusRadius = patch.nucleusRadius;
        needsRebuild = true;
      }
      if (patch.stateMode !== undefined && patch.stateMode !== currentParams.stateMode) {
        currentParams.stateMode = patch.stateMode;
        if (pointsMaterial) pointsMaterial.uniforms.uMode.value = getModeIndex(patch.stateMode);
      }

      Object.assign(currentParams, patch);

      if (pointsMaterial) {
        if (patch.pointSize !== undefined) pointsMaterial.uniforms.uPointSize.value = patch.pointSize;
        if (patch.coherence !== undefined) pointsMaterial.uniforms.uCoherence.value = patch.coherence;
        if (patch.waveExcursion !== undefined) pointsMaterial.uniforms.uWaveExcursion.value = patch.waveExcursion;
        if (patch.glowIntensity !== undefined) pointsMaterial.uniforms.uGlowIntensity.value = patch.glowIntensity;
        if (patch.psiColorA !== undefined) {
          colorA.set(patch.psiColorA);
          pointsMaterial.uniforms.uColorA.value = colorA;
        }
        if (patch.psiColorB !== undefined) {
          colorB.set(patch.psiColorB);
          pointsMaterial.uniforms.uColorB.value = colorB;
        }
        if (patch.nodalColor !== undefined) {
          nodalRGB.set(patch.nodalColor);
          pointsMaterial.uniforms.uNodalColor.value = nodalRGB;
        }
      }

      if (patch.nodalColor !== undefined && nucleusMaterial) {
        nucleusMaterial.color = nodalRGB;
      }

      if (needsRebuild) {
        buildOrbital();
      }
    },

    onPulse() {
      collapseTimer = Number(currentParams.collapseStrength) || 1.4;
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
      if (nucleus) {
        group.remove(nucleus);
        nucleusGeometry?.dispose();
        nucleusMaterial?.dispose();
      }
    },
  };
}
