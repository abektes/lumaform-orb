import * as THREE from 'three';
import { coronaLoopFrames } from './corona-veil-loops.js';

// Corona Veil — translucent, softly twisted membranes around a dark core.
//
// Each membrane is an instance of one narrow parameter-space ribbon. The
// vertex shader wraps it onto a differently oriented great circle, so detail
// costs one shared geometry rather than one mesh per veil. Motion stays inside
// the membranes: interference rolls along them and their radii breathe, while
// the shell as a whole never rotates.

const MAX_VEILS = 12;
const WIDTH_SEGMENTS = 5;
// Uniform index order in the fragment shader's surface() switch.
const VEIL_SURFACES = ['aurora', 'silk', 'lace', 'frost'];
const LOOP_HEIGHT = 0.55;
// Shape morph and surface cross-fade: ~0.6 s, so A/B and rehearsal swaps
// between shapes or surfaces never cut.
const MORPH_RATE = 5;
const CROSSFADE_SECONDS = 0.6;

function surfaceIndex(name) {
  const i = VEIL_SURFACES.indexOf(name);
  return i < 0 ? 0 : i;
}

const VEIL_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute float aVeilIndex;
  attribute float aVeilSeed;
  attribute float aVeilTilt;
  attribute float aVeilRoll;
  attribute vec3 aLoopPlace;
  attribute vec2 aLoopShape;

  uniform float uCoreRadius;
  uniform float uVeilSpread;
  uniform float uTwist;
  uniform float uWaveAmp;
  uniform float uBreatheAmp;
  uniform float uDriftPhase;
  uniform float uWavePhase;
  uniform float uPulse;
  uniform float uPulsePhase;
  uniform float uShapeMix;
  uniform float uLoopHeight;
  uniform vec3 uViewAxis;

  varying float vAcross;
  varying float vAlong;
  varying float vLoopU;
  varying float vLayer;
  varying float vSeed;
  varying float vRipple;
  varying vec3 vViewNormal;
  varying vec3 vRibbonNormal;
  varying vec3 vViewDirection;

  const float PI = 3.14159265359;
  const float TWO_PI = 6.28318530718;

  mat3 rotateX(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(
      1.0, 0.0, 0.0,
      0.0, c, s,
      0.0, -s, c
    );
  }

  mat3 rotateZ(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(
      c, s, 0.0,
      -s, c, 0.0,
      0.0, 0.0, 1.0
    );
  }

  float angularDistance(float a, float b) {
    return abs(mod(a - b + PI, TWO_PI) - PI);
  }

  // A click launches one narrow crest around every loop.
  float rippleAt(float u) {
    float d = angularDistance(u * TWO_PI, uPulsePhase);
    return exp(-d * d * 22.0) * uPulse;
  }

  // The original shape: a ribbon wrapped onto a tilted great circle.
  vec3 bandPosition(float u, float across) {
    float theta = u * TWO_PI;
    float seedPhase = aVeilSeed * TWO_PI;

    // The centreline wanders in latitude while the cross-section alternates
    // between latitudinal width and radial lift. That is the soft membrane
    // twist; unlike rotating the mesh, it changes shape locally along the loop.
    float twistPhase = theta * (1.0 + uTwist * 0.42)
      + seedPhase
      - uDriftPhase * (0.34 + aVeilSeed * 0.13);
    float centreSway = 0.036 * sin(
      theta * 2.0 - uDriftPhase * (0.72 + aVeilSeed * 0.16) + seedPhase
    );
    float latitude = centreSway + across * 0.115 * cos(twistPhase);
    float radialTwist = across * 0.034 * uTwist * sin(twistPhase);

    // Two restrained harmonics produce broad folds rather than a noisy surface.
    float travellingWave =
      sin(theta * 3.0 - uWavePhase + seedPhase * 1.3)
      + 0.42 * sin(theta * 7.0 + uWavePhase * 0.63 - seedPhase);
    float breathe = sin(
      uDriftPhase * 0.61 + uWavePhase * 0.12 + seedPhase * 0.38
    ) * uBreatheAmp;

    float radius = uCoreRadius
      + 0.055
      + aVeilIndex * uVeilSpread
      + radialTwist
      + travellingWave * uWaveAmp
      + breathe
      + rippleAt(u) * 0.045;

    float cosLat = cos(latitude);
    vec3 p = vec3(
      cos(theta) * cosLat,
      sin(latitude),
      sin(theta) * cosLat
    ) * radius;

    // The orientations are deterministic attributes, not animated transforms.
    return rotateZ(aVeilRoll) * rotateX(aVeilTilt) * p;
  }

  // A coronal loop: an arc between two footpoints on the core, rising and
  // leaning, with the ribbon twisting about its own axis like a flux tube.
  // Loops stand in a crown around the silhouette, built in the viewer's frame
  // so they stay at the limb as the camera orbits.
  vec3 loopPosition(float u, float across) {
    float seedPhase = aVeilSeed * TWO_PI;
    vec3 axis = uViewAxis;
    vec3 reference = abs(axis.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 e1 = normalize(cross(reference, axis));
    vec3 e2 = cross(axis, e1);
    // The crown turns slowly, so loops pass in and out of profile.
    float crown = aLoopPlace.x + uDriftPhase * 0.05;
    vec3 limb = e1 * cos(crown) + e2 * sin(crown);
    vec3 c = normalize(limb + axis * aLoopPlace.y);
    vec3 t0 = normalize(-e1 * sin(crown) + e2 * cos(crown));
    t0 = normalize(t0 - c * dot(t0, c));
    vec3 b0 = cross(c, t0);
    vec3 t = t0 * cos(aLoopPlace.z) + b0 * sin(aLoopPlace.z);
    vec3 b = cross(c, t);
    float arch = sin(PI * u);
    float a = (u * 2.0 - 1.0) * aLoopShape.x;

    // Tops sway more than footpoints, which stay anchored.
    float lean = 0.22 * sin(uDriftPhase * (0.6 + aVeilSeed * 0.3) + seedPhase) * arch;
    vec3 dir = normalize(c * cos(a) + t * sin(a) + b * lean);
    vec3 alongArc = normalize(-c * sin(a) + t * cos(a));

    float breathe = sin(uDriftPhase * 0.61 + seedPhase * 0.38) * uBreatheAmp;
    float wave = sin(u * PI * 3.0 - uWavePhase + seedPhase) * uWaveAmp * arch;
    // Footpoints sit just under the surface so the core's depth roots them.
    // veilSpread staggers loop heights, so it still means something here.
    float lift = uLoopHeight * aLoopShape.y + aVeilIndex * uVeilSpread * 0.4;
    float radius = uCoreRadius - 0.02
      + lift * pow(arch, 0.85) * (1.0 + breathe * 4.0)
      + wave
      + rippleAt(u) * 0.06 * arch;

    float twist = uTwist * PI * (u - 0.5) * 1.6 + seedPhase * 0.25;
    vec3 side = normalize(cross(dir, alongArc));
    side = side * cos(twist) + dir * sin(twist);
    // Wide enough to read as a sheet of plasma, narrowing into the footpoints.
    float width = 0.19 * (0.5 + 0.5 * arch);
    return dir * radius + side * across * width;
  }

  vec3 shapedPosition(float u, float across) {
    vec3 band = uShapeMix < 0.999 ? bandPosition(u, across) : vec3(0.0);
    vec3 loop = uShapeMix > 0.001 ? loopPosition(u, across) : vec3(0.0);
    return mix(band, loop, uShapeMix);
  }

  void main() {
    float across = position.y;
    float u = uv.x;
    vec3 p = shapedPosition(u, across);

    // The ribbon's own normal, by finite differences along both of its axes.
    // Shading used to take the sphere's normal, so folds never caught light.
    vec3 dU = shapedPosition(u + 0.002, across) - p;
    vec3 dA = shapedPosition(u, across + 0.02) - p;
    vec3 ribbonNormal = normalize(cross(dU, dA));

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vViewNormal = normalize(normalMatrix * normalize(p));
    vRibbonNormal = normalize(normalMatrix * ribbonNormal);
    vViewDirection = normalize(-viewPosition.xyz);
    vAcross = across;
    // Closed bands keep theta, so integer pattern frequencies wrap seamlessly;
    // an open loop is about a third of a turn long.
    vAlong = mix(u * TWO_PI, u * TWO_PI * 0.35, uShapeMix);
    vLoopU = u;
    vLayer = aVeilIndex;
    vSeed = aVeilSeed;
    vRipple = rippleAt(u);

    gl_Position = projectionMatrix * viewPosition;
  }
`;

const VEIL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uVeilColor;
  uniform vec3 uAccentColor;
  uniform float uOpacity;
  uniform float uEdgeGlow;
  uniform float uDriftPhase;
  uniform float uWavePhase;
  uniform float uShapeMix;
  uniform float uSurfaceFrom;
  uniform float uSurfaceTo;
  uniform float uSurfaceMix;

  varying float vAcross;
  varying float vAlong;
  varying float vLoopU;
  varying float vLayer;
  varying float vSeed;
  varying float vRipple;
  varying vec3 vViewNormal;
  varying vec3 vRibbonNormal;
  varying vec3 vViewDirection;

  const float TWO_PI = 6.28318530718;

  // Shared by every surface; set once in main().
  float gSoft;
  float gSilhouette;
  float gRibbonEdge;
  float gHeight;
  vec3 gView;

  // Today's look, unchanged: frosted bands with interference islands.
  vec4 frostSurface() {
    float interferenceA = sin(
      vAlong * 5.0 - uDriftPhase * 1.13 + vAcross * 7.0 + vSeed * 4.0
    );
    float interferenceB = cos(
      vAlong * 8.0 + uWavePhase * 0.71 - vAcross * 5.0 - vLayer * 3.0
    );
    float interference = 0.5 + 0.5 * interferenceA * interferenceB;
    interference = smoothstep(0.12, 0.94, interference);

    vec3 membraneColor = mix(
      uVeilColor,
      uAccentColor,
      0.12 + interference * 0.42 + vLayer * 0.08
    );
    float emission = uEdgeGlow * (
      gSilhouette * 0.72 + gRibbonEdge * 0.58 + vRipple * 1.25
    );
    vec3 color = membraneColor * (0.42 + interference * 0.72);
    color += mix(uVeilColor, uAccentColor, 0.72) * emission;

    float alpha = uOpacity * gSoft * (
      0.28
      + interference * 0.42
      + gSilhouette * 0.72
      + gRibbonEdge * 0.46
      + vRipple * 0.82
    );
    return vec4(color, clamp(alpha, 0.0, 0.92));
  }

  // Aurora anatomy: a sharp bright hem, rays rising from it and fading with
  // altitude, colour shifting from the hem colour to the high colour.
  vec4 auroraSurface() {
    float h = gHeight;
    float hem = exp(-pow((h - 0.1) / 0.075, 2.0));
    float below = smoothstep(0.02, 0.1, h);
    float curtain = 0.55 + 0.45 * sin(vAlong * 5.0 + uWavePhase * 0.8 + vSeed * 6.0);
    float rayA = pow(0.5 + 0.5 * sin(vAlong * 37.0 + vSeed * 20.0 - uDriftPhase * 1.7), 3.0);
    float rayB = pow(0.5 + 0.5 * sin(vAlong * 61.0 - uDriftPhase * 1.1 + vSeed * 9.0), 5.0);
    float rays = (rayA * 0.65 + rayB * 0.5) * pow(1.0 - h, 1.4);
    float intensity = (hem * 1.3 + rays * 1.2) * curtain * below
      + gSilhouette * 0.18
      + vRipple * 1.1;
    vec3 color = mix(uVeilColor, uAccentColor, smoothstep(0.15, 0.85, h)) * intensity * uEdgeGlow;
    float alpha = uOpacity * gSoft * (0.2 + intensity * 1.6);
    return vec4(color, clamp(alpha, 0.0, 0.92));
  }

  // Silk: thin-film colour that shifts with the viewing angle, a sheen that
  // slides along the real folds, and a smooth translucent fill.
  vec4 silkSurface() {
    vec3 n = normalize(vRibbonNormal);
    n = dot(n, gView) < 0.0 ? -n : n;
    vec3 light = normalize(vec3(-0.45, 0.75, 0.5));
    float nDotH = max(dot(n, normalize(light + gView)), 0.0);
    float sheen = pow(nDotH, 40.0) * 1.1 + pow(nDotH, 8.0) * 0.18;
    float diffuse = 0.3 + 0.7 * abs(dot(n, light));
    float nDotV = abs(dot(n, gView));
    vec3 film = 0.5 + 0.5 * cos(TWO_PI * (nDotV * 1.15 + vSeed * 0.5 + vec3(0.0, 0.33, 0.67)));
    vec3 base = mix(uVeilColor, uAccentColor, 0.5 + 0.5 * sin(TWO_PI * (nDotV * 0.8 + vSeed)));
    float grazing = pow(1.0 - nDotV, 2.0);
    vec3 color = mix(base, base * film * 1.7, 0.5) * diffuse;
    color += vec3(1.0) * sheen * uEdgeGlow * 0.8;
    color += uAccentColor * grazing * 0.35 * uEdgeGlow;
    color += mix(uVeilColor, uAccentColor, 0.5) * vRipple * 1.1;
    float alpha = uOpacity * gSoft * (0.55 + grazing * 0.5 + sheen * 0.8 + vRipple * 0.8);
    return vec4(color, clamp(alpha, 0.0, 0.92));
  }

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }

  // Lace: drifting cells with see-through centres and bright threads along
  // their borders. Cell ids wrap around the band, so closed bands stay seamless.
  vec4 laceSurface() {
    const float CELLS = 34.0;
    vec2 q = vec2(vAlong / TWO_PI * CELLS, vAcross * 1.8 + vSeed * 3.0);
    vec2 cell = floor(q);
    vec2 f = fract(q);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 id = cell + g;
        id.x = mod(id.x, CELLS);
        vec2 o = hash2(id + floor(vSeed * 50.0));
        o = 0.5 + 0.42 * sin(uDriftPhase * 0.9 + TWO_PI * o);
        float d = length(g + o - f);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    float thread = 1.0 - smoothstep(0.03, 0.11, f2 - f1);
    // Small holes in a mostly whole membrane: larger ones read as a web.
    float fill = smoothstep(0.16, 0.34, f1);
    float lace = max(fill * 0.75, thread);
    vec3 color = mix(uVeilColor, uAccentColor, thread * 0.55 + gHeight * 0.3)
      * (0.45 + thread * 1.5) * uEdgeGlow;
    color += uAccentColor * gSilhouette * 0.3 + uVeilColor * vRipple * 1.1;
    float alpha = uOpacity * gSoft * (lace * 1.6 + gSilhouette * 0.25 * lace + vRipple * 0.8);
    return vec4(color, clamp(alpha, 0.0, 0.92));
  }

  // 0 aurora · 1 silk · 2 lace · 3 frost — the order of VEIL_SURFACES.
  vec4 surface(float id) {
    if (id < 0.5) return auroraSurface();
    if (id < 1.5) return silkSurface();
    if (id < 2.5) return laceSurface();
    return frostSurface();
  }

  void main() {
    float edgeCoordinate = abs(vAcross);
    gSoft = 1.0 - smoothstep(0.82, 1.0, edgeCoordinate);
    if (gSoft <= 0.001) discard;

    vec3 normal = normalize(vViewNormal);
    if (!gl_FrontFacing) normal = -normal;
    gView = normalize(vViewDirection);
    float facing = abs(dot(normal, gView));
    gSilhouette = pow(1.0 - clamp(facing, 0.0, 1.0), 2.35);
    gRibbonEdge = smoothstep(0.54, 0.88, edgeCoordinate) * gSoft;
    gHeight = vAcross * 0.5 + 0.5;

    vec4 color = surface(uSurfaceFrom);
    if (uSurfaceMix > 0.001) color = mix(color, surface(uSurfaceTo), uSurfaceMix);

    // Loops carry plasma: bright knots flowing along the arc, and footpoints
    // glowing where the loop is rooted in the core.
    if (uShapeMix > 0.001) {
      float flow = pow(0.5 + 0.5 * sin(vLoopU * TWO_PI * 2.0 - uWavePhase * 1.6 + vSeed * 6.0), 6.0);
      float foot = exp(-pow(min(vLoopU, 1.0 - vLoopU) / 0.07, 2.0));
      float plasma = uShapeMix * (flow * 0.55 + foot * 0.7) * gSoft;
      color.rgb += mix(uVeilColor, uAccentColor, 0.35) * plasma * uEdgeGlow;
      color.a = clamp(color.a + plasma * uOpacity, 0.0, 0.92);
    }

    gl_FragColor = color;
  }
`;

const CORE_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  varying vec3 vObjectNormal;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    vObjectNormal = normal;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const CORE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uCoreColor;
  uniform vec3 uVeilColor;
  uniform vec3 uAccentColor;

  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  varying vec3 vObjectNormal;

  void main() {
    float facing = clamp(
      dot(normalize(vViewNormal), normalize(vViewDirection)),
      0.0,
      1.0
    );
    float rim = pow(1.0 - facing, 3.2);
    float vertical = vObjectNormal.y * 0.5 + 0.5;

    // The core is intentionally almost black. Its faint cool rim separates it
    // from a black canvas even when bloom is absent in variation-grid cells.
    vec3 color = uCoreColor * (0.58 + vertical * 0.24);
    color += uVeilColor * rim * 0.045;
    color += uAccentColor * pow(rim, 4.5) * 0.022;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function buildRibbonGeometry(detail, veilCount) {
  const longitudeSegments = Math.max(24, Math.round(detail));
  const rowSize = WIDTH_SEGMENTS + 1;
  const vertexCount = (longitudeSegments + 1) * rowSize;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(longitudeSegments * WIDTH_SEGMENTS * 6);

  let vertex = 0;
  for (let longitude = 0; longitude <= longitudeSegments; longitude++) {
    const u = longitude / longitudeSegments;
    for (let width = 0; width <= WIDTH_SEGMENTS; width++) {
      const across = width / WIDTH_SEGMENTS * 2 - 1;
      positions[vertex * 3] = u;
      positions[vertex * 3 + 1] = across;
      positions[vertex * 3 + 2] = 0;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = width / WIDTH_SEGMENTS;
      vertex++;
    }
  }

  let index = 0;
  for (let longitude = 0; longitude < longitudeSegments; longitude++) {
    for (let width = 0; width < WIDTH_SEGMENTS; width++) {
      const a = longitude * rowSize + width;
      const b = a + rowSize;
      indices[index++] = a;
      indices[index++] = b;
      indices[index++] = a + 1;
      indices[index++] = b;
      indices[index++] = b + 1;
      indices[index++] = a + 1;
    }
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const layers = new Float32Array(MAX_VEILS);
  const seeds = new Float32Array(MAX_VEILS);
  const tilts = new Float32Array(MAX_VEILS);
  const rolls = new Float32Array(MAX_VEILS);
  for (let i = 0; i < MAX_VEILS; i++) {
    const seed = ((i + 1) * 0.61803398875) % 1;
    seeds[i] = seed;
    tilts[i] = ((((i + 1) * 0.754877666) % 1) - 0.5) * 1.5;
    rolls[i] = ((((i + 1) * 0.569840296) % 1) - 0.5) * 1.25;
  }

  geometry.setAttribute(
    'aVeilIndex',
    new THREE.InstancedBufferAttribute(layers, 1)
  );
  geometry.setAttribute(
    'aVeilSeed',
    new THREE.InstancedBufferAttribute(seeds, 1)
  );
  geometry.setAttribute(
    'aVeilTilt',
    new THREE.InstancedBufferAttribute(tilts, 1)
  );
  geometry.setAttribute(
    'aVeilRoll',
    new THREE.InstancedBufferAttribute(rolls, 1)
  );
  // Filled by updateVeilLayers: the loop arrangement depends on the count.
  geometry.setAttribute('aLoopPlace', new THREE.InstancedBufferAttribute(new Float32Array(MAX_VEILS * 3), 3));
  geometry.setAttribute('aLoopShape', new THREE.InstancedBufferAttribute(new Float32Array(MAX_VEILS * 2), 2));
  geometry.instanceCount = Math.min(MAX_VEILS, Math.max(1, Math.round(veilCount)));
  return geometry;
}

function updateVeilLayers(geometry, veilCount) {
  const count = Math.min(MAX_VEILS, Math.max(1, Math.round(veilCount)));
  const layers = geometry.getAttribute('aVeilIndex');
  for (let i = 0; i < MAX_VEILS; i++) {
    layers.setX(i, count > 1 ? i / (count - 1) : 0);
  }
  layers.needsUpdate = true;

  // Loops are laid out for the visible count, so five spread as evenly as
  // twelve instead of being the first five of a twelve-loop corona.
  const places = geometry.getAttribute('aLoopPlace');
  const shapes = geometry.getAttribute('aLoopShape');
  coronaLoopFrames(count).forEach((frame, i) => {
    places.setXYZ(i, frame.angle, frame.depth, frame.lean);
    shapes.setXY(i, frame.span, frame.height);
  });
  places.needsUpdate = true;
  shapes.needsUpdate = true;
  geometry.instanceCount = count;
}

export function createCoronaVeilEngine({ scene, camera, params }) {
  const currentParams = {
    veilCount: 8,
    detail: 80,
    coreRadius: 1.62,

    veilSpread: 0.24,
    twist: 0.68,
    waveAmp: 0.055,
    breatheAmp: 0.025,
    driftSpeed: 0.16,
    waveSpeed: 0.48,

    coreColor: '#02040a',
    veilColor: '#62d8d2',
    accentColor: '#b9a7ff',
    opacity: 0.25,
    edgeGlow: 1.25,
    veilShape: 'bands',
    veilSurface: 'aurora',
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const veilMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uCoreRadius: { value: currentParams.coreRadius },
      uVeilSpread: { value: currentParams.veilSpread },
      uTwist: { value: currentParams.twist },
      uWaveAmp: { value: currentParams.waveAmp },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uDriftPhase: { value: 0 },
      uWavePhase: { value: 0 },
      uPulse: { value: 0 },
      uPulsePhase: { value: 0 },
      uVeilColor: { value: new THREE.Color(currentParams.veilColor) },
      uAccentColor: { value: new THREE.Color(currentParams.accentColor) },
      uOpacity: { value: currentParams.opacity },
      uEdgeGlow: { value: currentParams.edgeGlow },
      uShapeMix: { value: currentParams.veilShape === 'loops' ? 1 : 0 },
      uLoopHeight: { value: LOOP_HEIGHT },
      uViewAxis: { value: new THREE.Vector3(0, 0, 1) },
      uSurfaceFrom: { value: surfaceIndex(currentParams.veilSurface) },
      uSurfaceTo: { value: surfaceIndex(currentParams.veilSurface) },
      uSurfaceMix: { value: 0 },
    },
    vertexShader: VEIL_VERTEX_SHADER,
    fragmentShader: VEIL_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const coreMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uCoreColor: { value: new THREE.Color(currentParams.coreColor) },
      uVeilColor: { value: new THREE.Color(currentParams.veilColor) },
      uAccentColor: { value: new THREE.Color(currentParams.accentColor) },
    },
    vertexShader: CORE_VERTEX_SHADER,
    fragmentShader: CORE_FRAGMENT_SHADER,
    depthTest: true,
    depthWrite: true,
  });

  const coreGeometry = new THREE.SphereGeometry(1, 48, 32);
  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  coreMesh.scale.setScalar(currentParams.coreRadius);
  coreMesh.renderOrder = 0;
  group.add(coreMesh);

  let veilGeometry = null;
  let veilMesh = null;
  let driftPhase = 0;
  let wavePhase = 0;
  let previousTime = null;
  let pulseAge = 0;
  let pulseStrength = 0;
  // Shape morphs toward its target; surface cross-fades from one index to the
  // next. Both start settled, so construction never animates.
  let shapeMix = currentParams.veilShape === 'loops' ? 1 : 0;
  let surfaceFrom = surfaceIndex(currentParams.veilSurface);
  let surfaceTo = surfaceFrom;
  let surfaceProgress = 1;
  // Two blend slots cannot hold three surfaces, so a change that arrives
  // mid-fade waits here and starts when the current fade lands. Retargeting
  // immediately dropped the half-visible surface in a single frame.
  let surfaceQueued = null;

  function disposeVeils() {
    if (veilMesh) group.remove(veilMesh);
    veilGeometry?.dispose();
    veilGeometry = null;
    veilMesh = null;
  }

  function buildVeils() {
    disposeVeils();
    veilGeometry = buildRibbonGeometry(
      currentParams.detail,
      currentParams.veilCount
    );
    updateVeilLayers(veilGeometry, currentParams.veilCount);
    veilMesh = new THREE.Mesh(veilGeometry, veilMaterial);
    // CPU bounds describe the flat parameter ribbon, not its shader-wrapped
    // sphere, so renderer culling would intermittently discard a valid shell.
    veilMesh.frustumCulled = false;
    veilMesh.renderOrder = 1;
    group.add(veilMesh);
  }

  buildVeils();

  // Bands keep the measured 2.12. Loops rise higher than bands reach, so their
  // frame is derived from the same terms the vertex shader sums.
  const frameRadiusFor = (p) => (p.veilShape === 'loops'
    ? p.coreRadius + LOOP_HEIGHT + p.veilSpread * 0.4 + p.waveAmp + 0.06
    : 2.12);
  const frame = { radius: frameRadiusFor(currentParams) };

  function setVeilUniform(name, value) {
    veilMaterial.uniforms[name].value = value;
  }

  return {
    // Bands: default outer radius, including the two wave harmonics, twist
    // lift, breathing and pulse crest, is ~2.09; 2.12 keeps the silhouette
    // clear at the intended 80% frame. Loops: see frameRadiusFor.
    frame,

    update(args = {}) {
      const fallbackDelta = typeof args.delta === 'number' ? args.delta : 0.016;
      let virtualDelta = fallbackDelta;
      if (typeof args.time === 'number') {
        virtualDelta = previousTime === null
          ? 0
          : Math.max(0, args.time - previousTime);
        previousTime = args.time;
      }

      // Integrated phases keep live edits to rate parameters from rewriting the
      // accumulated angle. virtualDelta also carries the modulation rack's
      // _timeScale destination, unlike multiplying an absolute time by a rate.
      driftPhase += virtualDelta * currentParams.driftSpeed;
      wavePhase += virtualDelta * currentParams.waveSpeed;

      if (pulseStrength > 0) {
        pulseAge += virtualDelta;
        pulseStrength = pulseAge < 2.35 ? Math.exp(-pulseAge * 0.58) : 0;
      }

      // Paused (no virtual time passing) means a change should show at once,
      // not wait for playback to resume.
      const shapeTarget = currentParams.veilShape === 'loops' ? 1 : 0;
      shapeMix = virtualDelta > 0
        ? shapeMix + (shapeTarget - shapeMix) * (1 - Math.exp(-virtualDelta * MORPH_RATE))
        : shapeTarget;
      if (Math.abs(shapeTarget - shapeMix) < 1e-3) shapeMix = shapeTarget;
      surfaceProgress = virtualDelta > 0
        ? Math.min(1, surfaceProgress + virtualDelta / CROSSFADE_SECONDS)
        : 1;
      if (surfaceProgress >= 1) {
        surfaceFrom = surfaceTo;
        if (surfaceQueued !== null && surfaceQueued !== surfaceTo) {
          surfaceTo = surfaceQueued;
          surfaceProgress = virtualDelta > 0 ? 0 : 1;
          if (surfaceProgress >= 1) surfaceFrom = surfaceTo;
        }
        surfaceQueued = null;
      }
      const fade = surfaceProgress * surfaceProgress * (3 - 2 * surfaceProgress);
      setVeilUniform('uShapeMix', shapeMix);
      // The group never rotates, so world direction to the camera is the
      // object-space axis the crown is built around.
      if (camera && shapeMix > 0) {
        const axis = veilMaterial.uniforms.uViewAxis.value.copy(camera.position);
        if (axis.lengthSq() > 1e-8) axis.normalize();
      }
      setVeilUniform('uSurfaceFrom', surfaceFrom);
      setVeilUniform('uSurfaceTo', surfaceTo);
      setVeilUniform('uSurfaceMix', surfaceProgress >= 1 ? 0 : fade);

      setVeilUniform('uDriftPhase', driftPhase);
      setVeilUniform('uWavePhase', wavePhase);
      setVeilUniform('uPulse', pulseStrength);
      setVeilUniform('uPulsePhase', pulseAge * 3.05);
    },

    setParams(patch) {
      const needsRebuild = patch.detail !== undefined
        && patch.detail !== currentParams.detail;
      Object.assign(currentParams, patch);

      // Detail is the sole topology key. Count only changes the instance draw
      // range and radius is a scale/uniform, so all three geometry controls stay
      // cheap except when tessellation genuinely changes.
      if (needsRebuild) buildVeils();
      if (patch.veilCount !== undefined && veilGeometry) {
        updateVeilLayers(veilGeometry, currentParams.veilCount);
      }
      if (patch.coreRadius !== undefined) {
        coreMesh.scale.setScalar(currentParams.coreRadius);
        setVeilUniform('uCoreRadius', currentParams.coreRadius);
      }

      if (patch.veilSpread !== undefined) {
        setVeilUniform('uVeilSpread', currentParams.veilSpread);
      }
      if (patch.twist !== undefined) {
        setVeilUniform('uTwist', currentParams.twist);
      }
      if (patch.waveAmp !== undefined) {
        setVeilUniform('uWaveAmp', currentParams.waveAmp);
      }
      if (patch.breatheAmp !== undefined) {
        setVeilUniform('uBreatheAmp', currentParams.breatheAmp);
      }
      if (patch.opacity !== undefined) {
        setVeilUniform('uOpacity', currentParams.opacity);
      }
      if (patch.edgeGlow !== undefined) {
        setVeilUniform('uEdgeGlow', currentParams.edgeGlow);
      }

      if (['veilShape', 'coreRadius', 'veilSpread', 'waveAmp'].some((k) => patch[k] !== undefined)) {
        frame.radius = frameRadiusFor(currentParams);
      }

      if (patch.veilSurface !== undefined) {
        const next = surfaceIndex(currentParams.veilSurface);
        if (surfaceProgress < 1) {
          surfaceQueued = next;
        } else if (next !== surfaceTo) {
          surfaceFrom = surfaceTo;
          surfaceTo = next;
          surfaceProgress = 0;
        }
      }

      if (patch.coreColor !== undefined) {
        coreMaterial.uniforms.uCoreColor.value.set(currentParams.coreColor);
      }
      if (patch.veilColor !== undefined) {
        veilMaterial.uniforms.uVeilColor.value.set(currentParams.veilColor);
        coreMaterial.uniforms.uVeilColor.value.set(currentParams.veilColor);
      }
      if (patch.accentColor !== undefined) {
        veilMaterial.uniforms.uAccentColor.value.set(currentParams.accentColor);
        coreMaterial.uniforms.uAccentColor.value.set(currentParams.accentColor);
      }
    },

    onPulse() {
      pulseAge = 0;
      pulseStrength = 1;
    },

    dispose() {
      disposeVeils();
      group.remove(coreMesh);
      coreGeometry.dispose();
      coreMaterial.dispose();
      veilMaterial.dispose();
      scene.remove(group);
    },
  };
}
