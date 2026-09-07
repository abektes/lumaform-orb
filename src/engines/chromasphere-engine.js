import * as THREE from 'three';

// Chromasphere — a solid, opaque, liquid-metal orb.
//
// Every other engine in this library is additive glow on black: light emitted from
// wireframes, particles or volumetrics, with nothing that occludes and no real
// silhouette. This one is the opposite and exists for that contrast. It reflects
// rather than emits, it is fully opaque, and its edge is a hard boundary.
//
// Chrome is entirely a story about normals — the surface itself carries almost no
// colour, and everything you read is the environment bent across it. So the ripple is
// displaced in the vertex shader and the normal is rebuilt analytically from three
// samples of the same displacement function, rather than trusting the interpolated
// normals that came with the icosphere. Using those would give a smooth ball with a
// wobbly outline instead of a rippling metal one.
//
// The environment is procedural. An HDR probe would mean a runtime asset and a loader,
// and baking one into a WebGLCubeRenderTarget would mean owning render targets — which
// the nine-cell variation grid, sharing one renderer across nine engine instances with
// scissored viewports, makes genuinely risky. An analytic studio (gradient + horizon +
// N vertical light bars) costs nothing, needs no assets, and behaves identically in a
// cell and in the main view.

const MAX_LIGHT_BARS = 8;

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform float uRippleAmount;
  uniform float uRippleScale;
  uniform int   uRippleOctaves;
  uniform float uBreathe;
  uniform float uPulse;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vRipple;

  // Hash-based value noise. Deterministic and seedless on purpose: nine grid cells
  // must differ because their parameters differ, never because of hidden entropy.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float valueNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z) * 2.0 - 1.0;
  }

  // Radial displacement as a function of direction. The whole surface is defined by
  // this one function, which is what makes an analytic normal possible below.
  float displacement(vec3 dir) {
    vec3 p = dir * uRippleScale + vec3(0.0, 0.0, uTime);
    float sum = 0.0;
    float amp = 1.0;
    float norm = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= uRippleOctaves) break;
      sum += valueNoise(p) * amp;
      norm += amp;
      p *= 2.02;
      amp *= 0.5;
    }
    return norm > 0.0 ? (sum / norm) : 0.0;
  }

  vec3 surfacePoint(vec3 dir) {
    float h = displacement(dir);
    return dir * (uRadius * uBreathe + h * uRippleAmount * (1.0 + uPulse));
  }

  void main() {
    vec3 dir = normalize(position);

    // An arbitrary but stable tangent basis; only used for the finite difference.
    vec3 up = abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t1 = normalize(cross(up, dir));
    vec3 t2 = cross(dir, t1);

    const float EPS = 0.02;
    vec3 p0 = surfacePoint(dir);
    vec3 p1 = surfacePoint(normalize(dir + t1 * EPS));
    vec3 p2 = surfacePoint(normalize(dir + t2 * EPS));

    vec3 n = normalize(cross(p1 - p0, p2 - p0));
    if (dot(n, dir) < 0.0) n = -n;

    vRipple = displacement(dir);
    vec4 world = modelMatrix * vec4(p0, 1.0);
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * n);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3  uMetalTint;
  uniform vec3  uEnvTop;
  uniform vec3  uEnvBottom;
  uniform vec3  uBarColor;
  uniform float uEnvIntensity;
  uniform float uRoughness;
  uniform float uFresnelPower;
  uniform float uFresnelGain;
  uniform int   uBarCount;
  uniform float uBarWidth;
  uniform float uSpin;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vRipple;

  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;

  // The analytic studio: a vertical gradient, a bright horizon, and N softbox strips.
  // Chrome reads as chrome because of the hard bright/dark boundaries, so the bars are
  // deliberately high-contrast rather than a smooth environment.
  vec3 environment(vec3 dir, float blur) {
    float t = dir.y * 0.5 + 0.5;
    vec3 base = mix(uEnvBottom, uEnvTop, smoothstep(0.0, 1.0, t));

    // A tight bright band at eye level, softened as roughness rises.
    float horizon = exp(-abs(dir.y) * mix(14.0, 2.5, blur));
    base += uEnvTop * horizon * 0.25;

    float a = atan(dir.z, dir.x) + uSpin;
    float elevation = 1.0 - smoothstep(0.15, 0.95, abs(dir.y));
    float bars = 0.0;
    for (int i = 0; i < ${MAX_LIGHT_BARS}; i++) {
      if (i >= uBarCount) break;
      float centre = (float(i) / float(uBarCount)) * TAU;
      float d = abs(mod(a - centre + PI, TAU) - PI);
      bars += smoothstep(uBarWidth * mix(1.0, 3.0, blur), 0.0, d);
    }
    base += uBarColor * bars * elevation * uEnvIntensity * mix(1.0, 0.35, blur);
    return base;
  }

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 v = normalize(cameraPosition - vWorldPosition);
    vec3 r = reflect(-v, n);

    vec3 env = environment(r, uRoughness);

    // A metal has no diffuse term; its colour is a tint on the reflection.
    vec3 colour = env * uMetalTint;

    // Grazing angles approach total reflection, which is what gives a chrome ball its
    // bright rim and reads as "solid object" rather than "glowing shell".
    float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), uFresnelPower);
    colour += environment(r, uRoughness * 0.4) * fresnel * uFresnelGain;

    // A whisper of the displacement field, so deep troughs read as shadowed metal
    // rather than as flat reflection.
    colour *= 0.85 + 0.15 * (vRipple * 0.5 + 0.5);

    gl_FragColor = vec4(colour, 1.0);
  }
`;

export function createChromasphereEngine({ scene, params }) {
  const currentParams = {
    detail: 5,
    radius: 1.45,
    rippleOctaves: 3,
    barCount: 4,
    rippleAmount: 0.14,
    rippleScale: 1.9,
    flowSpeed: 0.30,
    spinSpeed: 0.12,
    breatheSpeed: 0.35,
    breatheAmp: 0.03,
    pulseRipple: 0.30,
    metalTint: '#dfe7ef',
    envTop: '#8ea6c8',
    envBottom: '#0a0d14',
    barColor: '#fff6e0',
    envIntensity: 1.5,
    roughness: 0.14,
    fresnelPower: 3.2,
    fresnelGain: 0.55,
    barWidth: 0.30,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const uniforms = {
    uTime: { value: 0 },
    uRadius: { value: currentParams.radius },
    uRippleAmount: { value: currentParams.rippleAmount },
    uRippleScale: { value: currentParams.rippleScale },
    uRippleOctaves: { value: currentParams.rippleOctaves },
    uBreathe: { value: 1 },
    uPulse: { value: 0 },
    uMetalTint: { value: new THREE.Color(currentParams.metalTint) },
    uEnvTop: { value: new THREE.Color(currentParams.envTop) },
    uEnvBottom: { value: new THREE.Color(currentParams.envBottom) },
    uBarColor: { value: new THREE.Color(currentParams.barColor) },
    uEnvIntensity: { value: currentParams.envIntensity },
    uRoughness: { value: currentParams.roughness },
    uFresnelPower: { value: currentParams.fresnelPower },
    uFresnelGain: { value: currentParams.fresnelGain },
    uBarCount: { value: currentParams.barCount },
    uBarWidth: { value: currentParams.barWidth },
    uSpin: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    // Opaque and depth-writing, unlike every other engine here. That is the point:
    // this one has a silhouette and occludes itself.
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
  });

  let geometry = null;
  let mesh = null;

  function buildGeometry() {
    if (mesh) {
      group.remove(mesh);
      mesh = null;
    }
    geometry?.dispose();
    // Radius 1: the shader places every vertex from the normalized direction, so the
    // real size lives in uRadius and changing it never rebuilds anything.
    geometry = new THREE.IcosahedronGeometry(1, currentParams.detail);
    mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
  }

  buildGeometry();

  // Ripple crests sit outside the nominal radius, and the breathe scales it further.
  const frameRadiusFor = (p) =>
    (p.radius * (1 + p.breatheAmp) + p.rippleAmount * (1 + p.pulseRipple)) * 1.12;
  const frame = { radius: frameRadiusFor(currentParams) };

  // Integrated rather than `time * rate`: multiplying would let a change to flowSpeed
  // retroactively rewrite the accumulated phase and jump the surface. See VISION.md §5.
  let flowPhase = 0;
  let spinPhase = 0;
  let pulse = 0;

  return {
    frame,

    update({ time, delta = 0 }) {
      const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 1 / 30)) : 0;
      flowPhase += dt * currentParams.flowSpeed;
      spinPhase += dt * currentParams.spinSpeed;
      pulse *= Math.exp(-3.2 * dt);

      uniforms.uTime.value = flowPhase;
      uniforms.uSpin.value = spinPhase;
      uniforms.uPulse.value = pulse * currentParams.pulseRipple;
      uniforms.uBreathe.value =
        1 + Math.sin(time * currentParams.breatheSpeed * Math.PI * 2) * currentParams.breatheAmp;
    },

    setParams(newParams) {
      Object.assign(currentParams, newParams);

      // Only these rebuild; everything else is a uniform write, which is what keeps
      // the modulation rack able to drive the expressive parameters at 60fps.
      if (newParams.detail !== undefined) buildGeometry();

      if (newParams.radius !== undefined) uniforms.uRadius.value = newParams.radius;
      if (newParams.rippleAmount !== undefined) uniforms.uRippleAmount.value = newParams.rippleAmount;
      if (newParams.rippleScale !== undefined) uniforms.uRippleScale.value = newParams.rippleScale;
      if (newParams.rippleOctaves !== undefined) uniforms.uRippleOctaves.value = newParams.rippleOctaves;
      if (newParams.envIntensity !== undefined) uniforms.uEnvIntensity.value = newParams.envIntensity;
      if (newParams.roughness !== undefined) uniforms.uRoughness.value = newParams.roughness;
      if (newParams.fresnelPower !== undefined) uniforms.uFresnelPower.value = newParams.fresnelPower;
      if (newParams.fresnelGain !== undefined) uniforms.uFresnelGain.value = newParams.fresnelGain;
      if (newParams.barCount !== undefined) uniforms.uBarCount.value = newParams.barCount;
      if (newParams.barWidth !== undefined) uniforms.uBarWidth.value = newParams.barWidth;
      if (newParams.metalTint !== undefined) uniforms.uMetalTint.value.set(newParams.metalTint);
      if (newParams.envTop !== undefined) uniforms.uEnvTop.value.set(newParams.envTop);
      if (newParams.envBottom !== undefined) uniforms.uEnvBottom.value.set(newParams.envBottom);
      if (newParams.barColor !== undefined) uniforms.uBarColor.value.set(newParams.barColor);

      if (
        newParams.radius !== undefined
        || newParams.rippleAmount !== undefined
        || newParams.breatheAmp !== undefined
        || newParams.pulseRipple !== undefined
      ) {
        frame.radius = frameRadiusFor(currentParams);
      }
    },

    onPulse() {
      pulse = 1;
    },

    dispose() {
      if (mesh) group.remove(mesh);
      geometry?.dispose();
      material.dispose();
      scene.remove(group);
    },
  };
}
