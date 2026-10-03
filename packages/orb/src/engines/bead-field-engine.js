import * as THREE from 'three';
import { createPhaseTracker, decay } from '../core/phase.js';

// Bead Field — a grid of spherical beads packed over the orb, each swelling
// and shrinking on its own detuned clock.
//
// The tangent-frame sphere domain (same construction Silk Warp uses) is
// scaled into a square lattice. Each cell holds one bead-let: a shaded
// hemisphere whose radius breathes on a per-cell slice of the pulse phase,
// offset by a hash jitter plus a slow wander. Because the radius clocks are
// detuned per cell (rate skew + hash phase offsets), the packing never
// pulses in lockstep — it reads as a skin of beads breathing out of phase.
//
// Every time-dependent term is a wrapped phase accumulated against the
// engine clock — no raw `uTime` anywhere. The lattice slides on two
// counter-rotating drift layers averaged together, so the packing shears
// instead of rigidly spinning.

const FRAME_RADIUS = 2.5;
const BASE_RADIUS = 2.15;

export function createBeadFieldEngine({ scene, camera, params }) {
  const currentParams = {
    radius: BASE_RADIUS,
    edgeFade: 0.18,
    colorDot: '#ffffff',
    colorDotAccent: '#eef5ff',
    colorBody: '#05070c',
    colorSheen: '#9dbfe4',
    pulseRate: 0.5,
    driftSpin: 0.12,
    counterSpin: -0.08,
    packingScale: 10.0,
    grow: 0.185,
    vary: 0.13,
    skew: 0.62,
    jitter: 0.1,
    edgeHardness: 50.0,
    beadShade: 0.55,
    gain: 1.0,
    contrast: 1.0,
    floorLevel: 0.06,
    light: 0.5,
    rim: 0.35,
    haloStrength: 0.0,
    breatheRate: 0.35,
    breatheAmp: 0.05,
    ...params,
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDriftPhase: { value: 0.0 },
      uCounterPhase: { value: 0.0 },
      uBreathePhase: { value: 0.0 },
      uPulsePhase: { value: 0.0 },
      uDitherPhase: { value: 0.0 },
      uPulse: { value: 0.0 },
      cameraWorldMatrix: { value: camera.matrixWorld },
      cameraProjectionMatrixInverse: {
        value: camera.projectionMatrixInverse,
      },
      uColorDot: { value: new THREE.Color(currentParams.colorDot) },
      uColorDotAccent: { value: new THREE.Color(currentParams.colorDotAccent) },
      uColorBody: { value: new THREE.Color(currentParams.colorBody) },
      uColorSheen: { value: new THREE.Color(currentParams.colorSheen) },
      uRadius: { value: currentParams.radius },
      uEdgeFade: { value: currentParams.edgeFade },
      uPackingScale: { value: currentParams.packingScale },
      uGrow: { value: currentParams.grow },
      uVary: { value: currentParams.vary },
      uSkew: { value: currentParams.skew },
      uJitter: { value: currentParams.jitter },
      uEdge: { value: currentParams.edgeHardness },
      uBeadShade: { value: currentParams.beadShade },
      uGain: { value: currentParams.gain },
      uContrast: { value: currentParams.contrast },
      uFloorLevel: { value: currentParams.floorLevel },
      uLight: { value: currentParams.light },
      uRim: { value: currentParams.rim },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uPointer: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uDriftPhase;
      uniform float uCounterPhase;
      uniform float uBreathePhase;
      uniform float uPulsePhase;
      uniform float uDitherPhase;
      uniform float uPulse;
      uniform vec3 uColorDot;
      uniform vec3 uColorDotAccent;
      uniform vec3 uColorBody;
      uniform vec3 uColorSheen;
      uniform float uRadius;
      uniform float uEdgeFade;
      uniform float uPackingScale;
      uniform float uGrow;
      uniform float uVary;
      uniform float uSkew;
      uniform float uJitter;
      uniform float uEdge;
      uniform float uBeadShade;
      uniform float uGain;
      uniform float uContrast;
      uniform float uFloorLevel;
      uniform float uLight;
      uniform float uRim;
      uniform float uBreatheAmp;
      uniform vec2 uPointer;

      uniform mat4 cameraWorldMatrix;
      uniform mat4 cameraProjectionMatrixInverse;

      varying vec2 vUv;

      // Hash without sine: a fract/dot construction that keeps its
      // distribution at large coordinates, which the packed lattice
      // domain here does reach.
      float hash13(vec3 p3) {
        p3 = fract(p3 * 0.1131);
        p3 += dot(p3, p3.zyx + 19.19);
        return fract((p3.x + p3.y) * p3.z);
      }

      // OKLab (Ottosson) — mix colours where mid-blends stay on hue.
      vec3 toOklab(vec3 c) {
        c = max(c, vec3(0.0));
        float l = pow(dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929)), 1.0 / 3.0);
        float m = pow(dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566)), 1.0 / 3.0);
        float s = pow(dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005)), 1.0 / 3.0);
        return vec3(
          0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
      }

      vec3 fromOklab(vec3 lab) {
        float l3 = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
        float m3 = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
        float s3 = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
        float L = l3 * l3 * l3;
        float M = m3 * m3 * m3;
        float S = s3 * s3 * s3;
        return vec3(
          dot(vec3(L, M, S), vec3(4.0767416621, -3.3077115913, 0.2309699292)),
          dot(vec3(L, M, S), vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
          dot(vec3(L, M, S), vec3(-0.0041960863, -0.7034186147, 1.7076147010)));
      }

      vec3 oklabMix(vec3 a, vec3 b, float t) {
        vec3 la = toOklab(a);
        vec3 lb = toOklab(b);
        return fromOklab(mix(la, lb, clamp(t, 0.0, 1.0)));
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

        float breathe = 1.0 + uBreatheAmp * cos(uBreathePhase) + uPulse * 0.06;
        float radius = uRadius * breathe;

        vec2 hit = intersectSphere(ro, rd, radius);
        if (hit.y <= 0.0) {
          gl_FragColor = vec4(0.0);
          return;
        }

        vec3 p = normalize(ro + rd * hit.x);

        // Pointer leans the sampling pole; the stub is (0,0) in grid mode.
        vec3 pole = normalize(vec3(uPointer.x * 0.35, uPointer.y * 0.35, 1.0));

        vec3 tX = normalize(cross(pole, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
        vec3 tY = cross(pole, tX);

        // Tangent domain scaled into the packing lattice, then advected by
        // two counter-rotating drift layers averaged: the grid shears against
        // itself instead of rigidly rotating.
        vec2 domain2 = vec2(dot(p, tX), dot(p, tY)) * uPackingScale;
        float ca = cos(uDriftPhase), sa = sin(uDriftPhase);
        vec2 layerA = vec2(
          domain2.x * ca - domain2.y * sa,
          domain2.x * sa + domain2.y * ca);
        float cb = cos(uCounterPhase), sb = sin(uCounterPhase);
        vec2 layerB = vec2(
          domain2.x * cb + domain2.y * sb,
          -domain2.x * sb + domain2.y * cb);
        vec2 g = mix(layerA, layerB, 0.5) + 13.7;

        vec2 id = floor(g);
        vec2 gv = fract(g) - 0.5;
        float cellRand = hash13(vec3(id, 3.71));
        float cellRand2 = hash13(vec3(id, 9.14));

        // Bead centre: a stable per-cell jitter plus a slow wander traced on
        // the pulse clock, detuned per cell so nothing sloshes in lockstep.
        vec2 center = vec2((cellRand2 - 0.5) * uJitter * 0.6);
        center += 0.25 * uJitter * vec2(
          sin(uPulsePhase * (0.7 + cellRand) + cellRand * 6.28),
          cos(uPulsePhase * (0.9 + cellRand2) + cellRand2 * 6.28));

        float d = length(gv - center);

        // Bead radius: each bead swells and shrinks on its own slice of the
        // pulse phase — rate skew from uSkew, size spread from uVary. The
        // clamp keeps a pinprick alive at trough so cells never go empty.
        float base = uGrow * (0.5 + 0.5 * sin(uPulsePhase * (0.6 + cellRand * uSkew) + cellRand * 6.2831853));
        float r = clamp(base * (1.0 + (cellRand - 0.5) * uVary * 2.0), 0.05, 0.48);

        // Rim hardness: uEdge is 1..200; higher is a harder bead silhouette.
        float beadMask = smoothstep(r, r - clamp(2.0 / uEdge, 0.01, 0.2), d);

        // Sphere-let shading: treat each bead as a tiny dome bumped out of
        // the cell plane and light it with the same key light as the orb.
        float dn = clamp(d / max(r, 0.05), 0.0, 1.0);
        float nz = sqrt(max(1.0 - pow(dn, 2.0), 0.0));
        vec3 beadN = normalize(vec3(gv - center, nz));

        vec3 lightDir = normalize(vec3(0.55, 0.65, 0.55));
        float lambertBead = clamp(dot(beadN, lightDir), 0.0, 1.0);
        float shade = mix(uBeadShade, 1.0, 0.35 + 0.65 * lambertBead);
        vec3 beadCol = oklabMix(uColorDot, uColorDotAccent, lambertBead);

        // Dark body under the beads.
        vec3 body = uColorBody * uFloorLevel * 2.5;

        vec3 col = mix(body, beadCol * shade * uGain, beadMask);
        col = (col - 0.5) * uContrast + 0.5;

        // Dome shading: sphere Lambert from the key light plus a fresnel
        // rim, uLight gating how strongly the terminator shades the beads.
        float lambert = clamp(dot(p, lightDir), 0.0, 1.0);
        float fresnel = pow(1.0 - clamp(dot(p, -rd), 0.0, 1.0), 2.6);
        col *= mix(1.0, 0.5 + 0.5 * lambert, uLight);

        // Top-light sheen caught on the bead domes, and the family rim.
        col += uColorSheen * pow(lambertBead, 4.0) * beadMask * 0.25;
        col += uColorSheen * fresnel * uRim;
        col += oklabMix(uColorDot, uColorDotAccent, 0.5) * uPulse * 0.12;

        // Ordered dither on a wrapped phase: breaks up gradient banding
        // without the per-frame sparkle of white-noise dither.
        float dither = hash13(vec3(gl_FragCoord.xy, uDitherPhase * 371.0));
        col += (dither - 0.5) * (1.0 / 255.0) * 3.0;

        // Soften the silhouette so the sphere edge reads as skin, not clip.
        float rimDist = 1.0 - fresnel;
        float edge = smoothstep(0.0, uEdgeFade, rimDist);

        vec3 outCol = max(col, vec3(0.0));
        gl_FragColor = vec4(outCol, edge);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const fullScreenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  fullScreenQuad.frustumCulled = false;
  fullScreenQuad.renderOrder = 0;
  scene.add(fullScreenQuad);

  // Fresnel halo shell — the atmosphere cue every orb in this repo leans on.
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(currentParams.colorDot) },
      glowStrength: { value: currentParams.haloStrength },
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
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
        float innerFade = smoothstep(1.0, 0.82, max(dot(viewDir, normal), 0.0));
        gl_FragColor = vec4(glowColor, fresnel * innerFade * glowStrength);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const haloMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BASE_RADIUS * 1.03, 48, 48),
    haloMaterial
  );
  haloMesh.renderOrder = 1;
  scene.add(haloMesh);

  let pulseValue = 0;
  const phaseTracker = createPhaseTracker();

  function applyParams(newParams) {
    Object.assign(currentParams, newParams);

    if (newParams.radius !== undefined) {
      material.uniforms.uRadius.value = newParams.radius;
      haloMesh.scale.setScalar(newParams.radius / BASE_RADIUS);
    }
    if (newParams.edgeFade !== undefined) {
      material.uniforms.uEdgeFade.value = newParams.edgeFade;
    }
    if (newParams.packingScale !== undefined) {
      material.uniforms.uPackingScale.value = newParams.packingScale;
    }
    if (newParams.grow !== undefined) {
      material.uniforms.uGrow.value = newParams.grow;
    }
    if (newParams.vary !== undefined) {
      material.uniforms.uVary.value = newParams.vary;
    }
    if (newParams.skew !== undefined) {
      material.uniforms.uSkew.value = newParams.skew;
    }
    if (newParams.jitter !== undefined) {
      material.uniforms.uJitter.value = newParams.jitter;
    }
    if (newParams.edgeHardness !== undefined) {
      material.uniforms.uEdge.value = newParams.edgeHardness;
    }
    if (newParams.beadShade !== undefined) {
      material.uniforms.uBeadShade.value = newParams.beadShade;
    }
    if (newParams.gain !== undefined) {
      material.uniforms.uGain.value = newParams.gain;
    }
    if (newParams.contrast !== undefined) {
      material.uniforms.uContrast.value = newParams.contrast;
    }
    if (newParams.floorLevel !== undefined) {
      material.uniforms.uFloorLevel.value = newParams.floorLevel;
    }
    if (newParams.light !== undefined) {
      material.uniforms.uLight.value = newParams.light;
    }
    if (newParams.rim !== undefined) {
      material.uniforms.uRim.value = newParams.rim;
    }
    if (newParams.breatheAmp !== undefined) {
      material.uniforms.uBreatheAmp.value = newParams.breatheAmp;
    }
    if (newParams.colorDot) {
      material.uniforms.uColorDot.value.set(newParams.colorDot);
      haloMaterial.uniforms.glowColor.value.set(newParams.colorDot);
    }
    if (newParams.colorDotAccent) {
      material.uniforms.uColorDotAccent.value.set(newParams.colorDotAccent);
    }
    if (newParams.colorBody) {
      material.uniforms.uColorBody.value.set(newParams.colorBody);
    }
    if (newParams.colorSheen) {
      material.uniforms.uColorSheen.value.set(newParams.colorSheen);
    }
    if (newParams.haloStrength !== undefined) {
      haloMaterial.uniforms.glowStrength.value = newParams.haloStrength;
    }
  }

  return {
    frame: { radius: FRAME_RADIUS },

    update({ time, delta, pointer }) {
      pulseValue = decay(pulseValue, 5.0, delta);
      phaseTracker.advance(time);

      material.uniforms.uDriftPhase.value = phaseTracker.phase('drift', currentParams.driftSpin);
      material.uniforms.uCounterPhase.value = phaseTracker.phase('counter', currentParams.counterSpin);
      material.uniforms.uBreathePhase.value = phaseTracker.phase('breathe', currentParams.breatheRate);
      material.uniforms.uPulsePhase.value = phaseTracker.phase('pulse', currentParams.pulseRate);
      material.uniforms.uDitherPhase.value = phaseTracker.phase('dither', 9.7);
      material.uniforms.uPulse.value = pulseValue;
      material.uniforms.uPointer.value.copy(pointer);

      material.uniforms.cameraWorldMatrix.value.copy(camera.matrixWorld);
      material.uniforms.cameraProjectionMatrixInverse.value.copy(
        camera.projectionMatrixInverse
      );
    },

    setParams: applyParams,

    onPulse() {
      pulseValue = 1.0;
    },

    dispose() {
      scene.remove(fullScreenQuad);
      scene.remove(haloMesh);
      material.dispose();
      haloMaterial.dispose();
      fullScreenQuad.geometry.dispose();
      haloMesh.geometry.dispose();
    },
  };
}
