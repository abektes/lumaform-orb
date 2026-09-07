import * as THREE from 'three';
import { buildLattice, mapPoint, pickSparkles } from '../core/flow-field.js';

// Flux — a bundle of glowing strands streaming in a travelling wave.
//
// Many thin strands share one flow, but each is given a phase offset, so they
// fan apart and converge again. Where they converge their additive overlaps
// stack into the bright lens-shaped knots that give the look its character; the
// sparkle nodes ride on top of that.
//
// The wave runs in the vertex shader. Displacing ~4,500 points on the CPU every
// frame would cost nine times over in grid mode, where each cell owns its own
// engine instance — the same reason the moiré rewrite moved to transforms.
//
// The flow phase is *integrated* (`phase += dt * flowSpeed`) rather than computed
// as `time * flowSpeed`. Multiplying would mean any change to flowSpeed
// retroactively rewrote the whole accumulated phase and jumped the wave, which is
// exactly what the _timeScale destination exists to prevent (VISION.md §5).

const VERTEX_SHADER = /* glsl */ `
  attribute float aU;
  attribute float aS;
  attribute float aSeed;

  uniform float uPhase;
  uniform float uAmplitude;
  uniform float uWavelength;
  uniform float uPhaseSpread;
  uniform float uTurbulence;
  uniform float uDepth;
  uniform float uIsOrb;
  uniform float uPulse;

  varying float vU;
  varying float vS;
  varying float vCrest;

  // Sum of three harmonics travelling along u. The per-strand phase offset is
  // what makes neighbouring strands drift in and out of step.
  float wave(float u, float s, out float crest) {
    float k = 6.2831853 / max(0.08, uWavelength);
    float off = s * uPhaseSpread + aSeed * 1.7;
    float w1 = sin(k * u - uPhase + off);
    float w2 = 0.5 * sin(2.0 * k * u - 1.7 * uPhase + off * 1.3);
    // Kept close to the second harmonic: a much higher one packed too many
    // cycles into the right-hand end and read as noise rather than flow.
    float w3 = 0.18 * sin(2.3 * k * u - 0.6 * uPhase + off * 2.1);
    float sum = w1 + w2 + w3;
    // Each strand swings a little differently, so neighbours cross instead of
    // staying parallel. Those crossings are the lens-shaped bright knots.
    float strandGain = 0.72 + 0.56 * fract(aSeed * 7.31);
    // Fade to zero at both ends so a ribbon does not terminate on a hard step.
    float envelope = uIsOrb > 0.5
      ? sin(u * 3.14159265)
      : smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.88, u);
    crest = w1;
    return sum * strandGain * envelope;
  }

  void main() {
    vU = aU;
    vS = aS;

    float crest;
    float w = wave(aU, aS, crest);
    vCrest = crest;

    vec3 p = position;
    float amp = uAmplitude * (1.0 + uPulse * 0.6);

    if (uIsOrb > 0.5) {
      // Displace along the surface normal: on a sphere centred at the origin the
      // normal is the normalised position, so the wave reads as a swell.
      vec3 n = normalize(p);
      p += n * w * amp * 0.20;
      // A little tangential drift so strands slide past each other rather than
      // only breathing in and out.
      p.xz += vec2(-n.z, n.x) * w * uTurbulence * 0.16;
    } else {
      p.y += w * amp;
      p.z += sin(aU * 3.1 - uPhase * 0.6 + aS * 4.0) * uDepth * 0.18;
      p.x += w * uTurbulence * 0.15;
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uGlow;

  varying float vU;
  varying float vS;
  varying float vCrest;

  void main() {
    // Two-segment ramp across the flow, so the bundle runs A -> B -> C.
    vec3 ramp = vU < 0.5
      ? mix(uColorA, uColorB, vU * 2.0)
      : mix(uColorB, uColorC, (vU - 0.5) * 2.0);

    // Strands near a wave crest burn toward white, which is what makes the
    // convergences read as hot cores rather than merely denser colour.
    float hot = smoothstep(0.45, 1.0, abs(vCrest));
    vec3 col = mix(ramp, vec3(1.0), hot * 0.34);

    // Edge strands sit slightly darker so the bundle has a discernible body.
    float body = 0.55 + 0.45 * (1.0 - abs(vS - 0.5) * 2.0);

    gl_FragColor = vec4(col * uGlow * body, 1.0);
  }
`;

const SPARKLE_VERTEX = /* glsl */ `
  attribute float aU;
  attribute float aS;
  attribute float aSeed;

  uniform float uPhase;
  uniform float uAmplitude;
  uniform float uWavelength;
  uniform float uPhaseSpread;
  uniform float uTurbulence;
  uniform float uDepth;
  uniform float uIsOrb;
  uniform float uPulse;
  uniform float uSize;
  uniform float uPixelRatio;

  varying float vTwinkle;

  void main() {
    float k = 6.2831853 / max(0.08, uWavelength);
    float off = aS * uPhaseSpread + aSeed * 1.7;
    float w1 = sin(k * aU - uPhase + off);
    float w2 = 0.5 * sin(2.0 * k * aU - 1.7 * uPhase + off * 1.3);
    float w3 = 0.18 * sin(2.3 * k * aU - 0.6 * uPhase + off * 2.1);
    float sum = w1 + w2 + w3;
    float strandGain = 0.72 + 0.56 * fract(aSeed * 7.31);
    float envelope = uIsOrb > 0.5
      ? sin(aU * 3.14159265)
      : smoothstep(0.0, 0.12, aU) * smoothstep(1.0, 0.88, aU);
    float w = sum * strandGain * envelope;

    vec3 p = position;
    float amp = uAmplitude * (1.0 + uPulse * 0.6);
    if (uIsOrb > 0.5) {
      vec3 n = normalize(p);
      p += n * w * amp * 0.20;
      p.xz += vec2(-n.z, n.x) * w * uTurbulence * 0.16;
    } else {
      p.y += w * amp;
      p.z += sin(aU * 3.1 - uPhase * 0.6 + aS * 4.0) * uDepth * 0.18;
      p.x += w * uTurbulence * 0.15;
    }

    // Nodes brighten as their strand passes a crest, so the sparkle follows the
    // same rhythm as the bundle instead of blinking independently of it.
    vTwinkle = 0.35 + 0.65 * smoothstep(0.3, 1.0, abs(w1));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * uPixelRatio * (8.0 / max(0.5, -mv.z)) * (0.6 + vTwinkle);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPARKLE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uBrightness;
  varying float vTwinkle;

  void main() {
    // Round, soft-edged point with a hot centre.
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float core = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(uColor * uBrightness * vTwinkle * core * core, 1.0);
  }
`;

export function createFluxEngine({ studio, scene, camera, renderer, pointerTracker, params, global }) {
  const currentParams = {
    layout: 'ribbon',     // 'ribbon' | 'orb'
    strands: 28,
    segments: 160,
    bandSpread: 1.1,
    ribbonWidth: 14,
    sparkleDensity: 0.03,

    amplitude: 0.85,
    wavelength: 0.42,
    phaseSpread: 2.4,
    depth: 2.2,
    twist: 0.6,
    turbulence: 0.35,
    flowSpeed: 0.9,

    colorA: '#ff4fd8',
    colorB: '#a86bff',
    colorC: '#4fd0ff',
    glow: 2.1,
    sparkleSize: 2.2,
    sparkleBrightness: 2.4,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  let lineMesh = null;
  let lineGeometry = null;
  let lineMaterial = null;
  let pointMesh = null;
  let pointGeometry = null;
  let pointMaterial = null;

  let phase = 0;
  let pulse = 0;
  let elapsedTotal = 0;

  const isOrb = () => (currentParams.layout === 'orb' ? 1 : 0);

  // Peak of the harmonic sum (1 + 0.5 + 0.18) times the largest per-strand gain.
  // The displacement happens in the shader, so the CPU-side vertex positions do
  // not include it — framing has to account for it analytically or the wave
  // crests clip off the top and bottom of frame.
  const WAVE_PEAK = 1.68 * 1.28;
  const ORB_RADIUS = 2.3;
  // One radius for both layouts. They differ slightly in extent — the orb reaches
  // ORB_RADIUS plus its radial swell, the ribbon reaches half its band plus the
  // full wave — but taking the larger of the two for both means switching layout
  // needs no re-framing. ENGINE-AUTHORING.md §1 says an engine should never touch
  // `studio`, and asking it to re-frame would have been the only reason to.
  const FRAME_RADIUS = Math.max(
    ORB_RADIUS + 0.85 * 0.20 * WAVE_PEAK,
    1.1 / 2 + 0.85 * WAVE_PEAK
  );

  function sharedUniforms() {
    return {
      uPhase: { value: phase },
      uAmplitude: { value: currentParams.amplitude },
      uWavelength: { value: currentParams.wavelength },
      uPhaseSpread: { value: currentParams.phaseSpread },
      uTurbulence: { value: currentParams.turbulence },
      uDepth: { value: currentParams.depth },
      uIsOrb: { value: isOrb() },
      uPulse: { value: pulse },
    };
  }

  function disposeMeshes() {
    if (lineMesh) group.remove(lineMesh);
    if (pointMesh) group.remove(pointMesh);
    lineGeometry?.dispose();
    lineMaterial?.dispose();
    pointGeometry?.dispose();
    pointMaterial?.dispose();
    lineGeometry = lineMaterial = null;
    pointGeometry = pointMaterial = null;
    lineMesh = pointMesh = null;
  }

  function buildMeshes() {
    disposeMeshes();

    const lattice = buildLattice({
      strands: currentParams.strands,
      segments: currentParams.segments,
    });

    const opts = {
      width: currentParams.ribbonWidth,
      bandSpread: currentParams.bandSpread,
      depth: currentParams.depth,
      radius: ORB_RADIUS,
      twist: currentParams.twist,
    };

    const positions = new Float32Array(lattice.pointCount * 3);
    for (let i = 0; i < lattice.pointCount; i++) {
      const p = mapPoint(currentParams.layout, lattice.u[i], lattice.s[i], opts);
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
    }

    lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    lineGeometry.setAttribute('aU', new THREE.BufferAttribute(lattice.u, 1));
    lineGeometry.setAttribute('aS', new THREE.BufferAttribute(lattice.s, 1));
    lineGeometry.setAttribute('aSeed', new THREE.BufferAttribute(lattice.seed, 1));
    lineGeometry.setIndex(new THREE.BufferAttribute(lattice.indices, 1));

    lineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...sharedUniforms(),
        uColorA: { value: new THREE.Color(currentParams.colorA) },
        uColorB: { value: new THREE.Color(currentParams.colorB) },
        uColorC: { value: new THREE.Color(currentParams.colorC) },
        uGlow: { value: currentParams.glow },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      // Additive is the whole effect: where strands cross, the overlap stacks
      // into the bright knots. Depth writes off so no strand occludes another.
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });

    lineMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
    lineMesh.frustumCulled = false;
    group.add(lineMesh);

    // --- sparkle nodes ---
    const picked = pickSparkles(lattice.pointCount, currentParams.sparkleDensity);
    if (picked.length) {
      const sp = new Float32Array(picked.length * 3);
      const su = new Float32Array(picked.length);
      const ss = new Float32Array(picked.length);
      const sd = new Float32Array(picked.length);
      for (let i = 0; i < picked.length; i++) {
        const idx = picked[i];
        sp[i * 3] = positions[idx * 3];
        sp[i * 3 + 1] = positions[idx * 3 + 1];
        sp[i * 3 + 2] = positions[idx * 3 + 2];
        su[i] = lattice.u[idx];
        ss[i] = lattice.s[idx];
        sd[i] = lattice.seed[idx];
      }

      pointGeometry = new THREE.BufferGeometry();
      pointGeometry.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      pointGeometry.setAttribute('aU', new THREE.BufferAttribute(su, 1));
      pointGeometry.setAttribute('aS', new THREE.BufferAttribute(ss, 1));
      pointGeometry.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));

      pointMaterial = new THREE.ShaderMaterial({
        uniforms: {
          ...sharedUniforms(),
          uColor: { value: new THREE.Color('#ffffff') },
          uBrightness: { value: currentParams.sparkleBrightness },
          uSize: { value: currentParams.sparkleSize },
          uPixelRatio: { value: renderer?.getPixelRatio?.() ?? 1 },
        },
        vertexShader: SPARKLE_VERTEX,
        fragmentShader: SPARKLE_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      });

      pointMesh = new THREE.Points(pointGeometry, pointMaterial);
      pointMesh.frustumCulled = false;
      group.add(pointMesh);
    }
  }

  // Only these need new vertices. Everything else is a uniform, so it is free to
  // change every frame — which is what lets amplitude be a modulation target.
  const GEOMETRY_KEYS = ['layout', 'strands', 'segments', 'bandSpread', 'ribbonWidth', 'sparkleDensity', 'twist'];

  buildMeshes();

  function setUniform(name, value) {
    if (lineMaterial?.uniforms[name]) lineMaterial.uniforms[name].value = value;
    if (pointMaterial?.uniforms[name]) pointMaterial.uniforms[name].value = value;
  }

  return {
    frame: { radius: FRAME_RADIUS },

    update(args = {}) {
      const dt = typeof args.delta === 'number' ? args.delta : 0.016;
      const now = typeof args.time === 'number' ? args.time : elapsedTotal + dt;
      // Integrate the change in virtualTime rather than `delta`: delta carries
      // timeScale and pause, but the modulation rack's tempo route is folded
      // into virtualTime only, so integrating delta would ignore _timeScale.
      const vdt = Math.max(0, now - elapsedTotal);
      elapsedTotal = now;
      const pointer = args.pointer;

      // Integrated, never time * rate — see the note at the top of this file.
      phase += vdt * currentParams.flowSpeed;
      pulse *= 0.93;

      setUniform('uPhase', phase);
      setUniform('uPulse', pulse);

      if (currentParams.layout === 'orb') {
        group.rotation.y += dt * 0.12;
      } else if (pointer && dt > 0) {
        // Gentle parallax only: the ribbon's own flow is the motion. Gated on dt
        // because delta is 0 while paused — an ungated lerp keeps easing toward
        // its target and the "paused" orb carries on drifting.
        const ease = Math.min(1, dt * 3);
        group.rotation.x += ((-pointer.y * 0.18) - group.rotation.x) * ease;
        group.rotation.y += ((pointer.x * 0.22) - group.rotation.y) * ease;
      }
    },

    setParams(newParams) {
      const needsRebuild = GEOMETRY_KEYS.some(
        (k) => newParams[k] !== undefined && newParams[k] !== currentParams[k]
      );
      Object.assign(currentParams, newParams);

      if (needsRebuild) {
        buildMeshes();
        return;
      }

      if (newParams.amplitude !== undefined) setUniform('uAmplitude', currentParams.amplitude);
      if (newParams.wavelength !== undefined) setUniform('uWavelength', currentParams.wavelength);
      if (newParams.phaseSpread !== undefined) setUniform('uPhaseSpread', currentParams.phaseSpread);
      if (newParams.turbulence !== undefined) setUniform('uTurbulence', currentParams.turbulence);
      if (newParams.depth !== undefined) setUniform('uDepth', currentParams.depth);
      if (newParams.glow !== undefined && lineMaterial) lineMaterial.uniforms.uGlow.value = currentParams.glow;
      if (newParams.sparkleSize !== undefined && pointMaterial) pointMaterial.uniforms.uSize.value = currentParams.sparkleSize;
      if (newParams.sparkleBrightness !== undefined && pointMaterial) pointMaterial.uniforms.uBrightness.value = currentParams.sparkleBrightness;
      for (const [key, uniform] of [['colorA', 'uColorA'], ['colorB', 'uColorB'], ['colorC', 'uColorC']]) {
        if (newParams[key] !== undefined && lineMaterial) {
          lineMaterial.uniforms[uniform].value.set(currentParams[key]);
        }
      }
    },

    onPulse() {
      pulse = 1;
    },

    onResize() {
      if (pointMaterial) pointMaterial.uniforms.uPixelRatio.value = renderer?.getPixelRatio?.() ?? 1;
    },

    dispose() {
      disposeMeshes();
      scene.remove(group);
    },
  };
}
