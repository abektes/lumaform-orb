import * as THREE from 'three';
import { decay } from '../core/phase.js';

// Regard: an orb with a front.
//
// Every other engine is radially symmetric, so none of them can say *where*
// its attention is — and "what is the assistant doing" is mostly a question
// about attention. People avert their gaze while retrieving or computing and
// return it to hand the turn back; that is the most practised "thinking" read
// humans have, and the one thing a symmetric orb cannot express.
//
// The motion is also a shape no other engine produces: ballistic saccades
// separated by still fixations, rather than continuous oscillation. Saccades
// follow a minimum-jerk profile whose duration grows with amplitude (the
// oculomotor "main sequence"), large ones carry a blink, and fixations are
// not perfectly still — a small Ornstein–Uhlenbeck drift keeps them alive.
//
// `attention` is the one axis that matters: 0 regards the viewer, 1 looks up
// and away and searches a wider cone. It is latched at each saccade, so a
// change is expressed as a glance after the current fixation — the hesitation
// before looking away is emergent, not animated.

// Where "away" is, in the viewer's frame: up and to the left, the most common
// direction of thinking-aversion. Radians from the line of sight at attention 1.
const AVERT_ANGLE = 1.2;
const AVERT_DIR = new THREE.Vector2(-0.6, 0.8);
const MAX_CONE = 0.85;
const BODY_RADIUS = 1;
const MAX_LEAN = 0.07;
const HALO_GAIN = 0.3;

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BODY_FRAGMENT = /* glsl */ `
  uniform vec3 uGaze;
  uniform vec3 uRight;
  uniform vec3 uCamPos;
  uniform float uFocusSize;
  uniform float uFocusGlow;
  uniform float uRimGlow;
  uniform float uLid;
  uniform float uFibres;
  uniform vec3 uFocusColor;
  uniform vec3 uHaloColor;
  uniform vec3 uRimColor;
  uniform vec3 uBodyColor;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 V = normalize(uCamPos - vPosW);
    float ndv = clamp(dot(n, V), 0.0, 1.0);

    // A tangent frame at the gaze point, oriented to the camera so the lid
    // closes vertically on screen however the gaze is turned.
    vec3 g = normalize(uGaze);
    vec3 t = normalize(uRight - g * dot(uRight, g));
    vec3 b = cross(g, t);
    float c = dot(n, g);
    vec2 q = vec2(dot(n, t), dot(n, b));
    vec2 qLid = vec2(q.x, q.y / max(uLid, 0.04));
    float r = length(qLid) / sin(uFocusSize);
    float front = smoothstep(0.0, 0.3, c);

    float iris = (1.0 - smoothstep(0.8, 1.0, r)) * front;
    float limbus = exp(-pow((r - 0.8) / 0.1, 2.0)) * front;
    float core = exp(-r * r * 12.0) * front;
    float striae = uFibres > 0.5 ? 0.72 + 0.28 * sin(atan(q.y, q.x) * uFibres + r * 7.0) : 1.0;
    // Light from the focus bleeding across the body: what still says "it is
    // looking over there" when the orb is 20 px wide and the iris is a pixel.
    // Kept dim and tight: a body that glows all over reads as a sun, and
    // then there is no "where" left for the focus to point at.
    float spill = exp(-(1.0 - c) * 5.5);

    vec3 col = uBodyColor;
    col += uRimColor * pow(1.0 - ndv, 3.0) * uRimGlow;
    col += uHaloColor * spill * 0.14 * uFocusGlow;
    // The iris is added light, not a painted disc: an opaque amber disc read
    // as a literal eyeball.
    col += uFocusColor * iris * striae * 0.3 * uFocusGlow;
    col += uFocusColor * limbus * 0.45 * uFocusGlow;
    col += mix(uFocusColor, vec3(1.0), 0.55) * core * 1.3 * uFocusGlow * uLid;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Back faces of a slightly larger shell, added over the scene: a glow built
// into the material, because grid cells render without bloom. It leans toward
// the gaze, so the silhouette alone shows which way the orb is looking.
const HALO_FRAGMENT = /* glsl */ `
  uniform vec3 uGaze;
  uniform vec3 uCamPos;
  uniform vec3 uHaloColor;
  uniform float uHaloGlow;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 V = normalize(uCamPos - vPosW);
    float ndv = abs(dot(n, V));
    float shell = pow(ndv, 1.6) * smoothstep(0.0, 0.35, ndv);
    float toward = 0.4 + 0.6 * smoothstep(-0.2, 0.8, dot(n, normalize(uGaze)));
    gl_FragColor = vec4(uHaloColor * shell * toward * uHaloGlow, 1.0);
  }
`;

// Seeded so identical parameters produce identical glances: the grid and A/B
// then compare parameters, not dice.
function createRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Position along a minimum-jerk trajectory: zero velocity and acceleration at
// both ends, which is what makes a jump read as an eye movement, not a cut.
function minimumJerk(t) {
  return t * t * t * (10 + t * (-15 + 6 * t));
}

export function createRegardEngine({ scene, camera, params }) {
  const currentParams = {
    attention: 0.3,
    searchSpread: 0.55,
    dwell: 0.9,
    saccadeSpeed: 1,
    jitter: 0.35,
    blinks: 0.35,
    focusSize: 0.38,
    haloSize: 1.18,
    irisFibres: 23,
    lean: 0.5,
    focusGlow: 1.2,
    rimGlow: 0.6,
    focusColor: '#ffc978',
    haloColor: '#ff8a4c',
    rimColor: '#4f63ff',
    bodyColor: '#05070c',
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const gaze = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3(1, 0, 0);
  const camPos = new THREE.Vector3();

  const bodyUniforms = {
    uGaze: { value: gaze },
    uRight: { value: right },
    uCamPos: { value: camPos },
    uFocusSize: { value: currentParams.focusSize },
    uFocusGlow: { value: currentParams.focusGlow },
    uRimGlow: { value: currentParams.rimGlow },
    uLid: { value: 1 },
    uFibres: { value: Number(currentParams.irisFibres) },
    uFocusColor: { value: new THREE.Color(currentParams.focusColor) },
    uHaloColor: { value: new THREE.Color(currentParams.haloColor) },
    uRimColor: { value: new THREE.Color(currentParams.rimColor) },
    uBodyColor: { value: new THREE.Color(currentParams.bodyColor) },
  };
  const haloUniforms = {
    uGaze: bodyUniforms.uGaze,
    uCamPos: bodyUniforms.uCamPos,
    uHaloColor: bodyUniforms.uHaloColor,
    uHaloGlow: { value: currentParams.focusGlow * HALO_GAIN },
  };

  const bodyGeometry = new THREE.SphereGeometry(BODY_RADIUS, 96, 64);
  const bodyMaterial = new THREE.ShaderMaterial({
    uniforms: bodyUniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: BODY_FRAGMENT,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

  // Unit radius, scaled to haloSize: resizing it never rebuilds anything.
  const haloGeometry = new THREE.SphereGeometry(1, 64, 48);
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: haloUniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: HALO_FRAGMENT,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.scale.setScalar(currentParams.haloSize);
  group.add(halo, body);

  // --- Gaze state -----------------------------------------------------------
  // Offsets are angular (radians) in a frame centred on the regard axis, so a
  // fixation on the viewer keeps tracking the camera as it orbits — pursuit
  // for free — while a saccade only ever interpolates two small 2D points.
  const random = createRandom(0x5eed);
  const offsetFrom = new THREE.Vector2();
  const offsetTo = new THREE.Vector2();
  const offset = new THREE.Vector2();
  const drift = new THREE.Vector2();
  let anchorFrom = currentParams.attention;
  let anchorTo = currentParams.attention;
  let anchor = currentParams.attention;
  let saccadeElapsed = 0;
  let saccadeDuration = 0;
  let fixationLeft = 0.4;
  // True while holding the look a click asked for; nothing interrupts it.
  let noticing = false;
  let blinkAge = Infinity;
  let pulse = 0;
  const leanPos = new THREE.Vector3();
  const leanVel = new THREE.Vector3();

  const gaussian = () => {
    const u = Math.max(random(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  };

  function startBlink() {
    if (blinkAge > 0.3) blinkAge = 0;
  }

  function startSaccade(targetAnchor, target) {
    offsetFrom.copy(offset);
    anchorFrom = anchor;
    offsetTo.copy(target);
    anchorTo = targetAnchor;
    const amplitude = offsetFrom.distanceTo(offsetTo) + Math.abs(anchorTo - anchorFrom) * AVERT_ANGLE;
    saccadeDuration = (0.07 + 0.22 * amplitude) / Math.max(0.05, currentParams.saccadeSpeed);
    saccadeElapsed = 0;
    // Large gaze shifts carry a blink in people; small refixations rarely do.
    if (random() < currentParams.blinks * (0.25 + 0.75 * Math.min(1, amplitude / 0.9))) startBlink();
  }

  function pickTarget(targetAnchor) {
    const cone = MAX_CONE * currentParams.searchSpread * (0.2 + 0.8 * targetAnchor);
    const next = new THREE.Vector2();
    // Two tries at a glance worth making: a refixation onto nearly the same
    // point reads as a tremor, not a look.
    for (let attempt = 0; attempt < 2; attempt++) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * cone;
      next.set(Math.cos(a) * r, Math.sin(a) * r);
      if (next.distanceTo(offset) > cone * 0.35) break;
    }
    return next;
  }

  function scheduleFixation() {
    fixationLeft = currentParams.dwell * (0.45 + random() * 1.1);
  }

  function stepGaze(dt) {
    if (saccadeDuration > 0) {
      saccadeElapsed += dt;
      const s = minimumJerk(Math.min(1, saccadeElapsed / saccadeDuration));
      offset.lerpVectors(offsetFrom, offsetTo, s);
      anchor = anchorFrom + (anchorTo - anchorFrom) * s;
      if (saccadeElapsed >= saccadeDuration) {
        saccadeDuration = 0;
        if (fixationLeft <= 0) scheduleFixation();
      }
    } else {
      fixationLeft -= dt;
      // A modulated or tweened attention that has moved a long way ends the
      // fixation early: the orb reacts, rather than finishing its thought.
      const pending = noticing ? 0 : Math.abs(currentParams.attention - anchor);
      if (fixationLeft <= 0 || pending > 0.3) {
        noticing = false;
        const targetAnchor = currentParams.attention;
        startSaccade(targetAnchor, pickTarget(targetAnchor));
        fixationLeft = 0;
      } else if (random() < dt * currentParams.blinks * 0.12) {
        startBlink();
      }
    }

    // Fixational drift: mean-reverting, so it wanders without walking away.
    const sigma = currentParams.jitter * 0.07;
    drift.x += -3 * drift.x * dt + sigma * Math.sqrt(dt) * gaussian();
    drift.y += -3 * drift.y * dt + sigma * Math.sqrt(dt) * gaussian();
  }

  // Scratch vectors for the per-frame frame-building.
  const viewDir = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const regard = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const avert = new THREE.Vector3();
  const leanTarget = new THREE.Vector3();
  const springForce = new THREE.Vector3();

  function composeGaze(pointer) {
    camPos.copy(camera.position);
    viewDir.copy(camPos).sub(group.position).normalize();
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);

    // While attending, follow the pointer — smooth pursuit of the one moving
    // thing in the room. The grid's stub pointer is the origin, so cells just
    // look straight out.
    const follow = 0.45 * (1 - anchor);
    const px = pointer ? pointer.x : 0;
    const py = pointer ? pointer.y : 0;
    regard.copy(viewDir)
      .addScaledVector(right, px * follow)
      .addScaledVector(camUp, py * follow)
      .normalize();

    const theta = anchor * AVERT_ANGLE;
    avert.set(0, 0, 0).addScaledVector(right, AVERT_DIR.x).addScaledVector(camUp, AVERT_DIR.y);
    avert.addScaledVector(regard, -avert.dot(regard)).normalize();
    regard.multiplyScalar(Math.cos(theta)).addScaledVector(avert, Math.sin(theta)).normalize();

    tangent.copy(right).addScaledVector(regard, -right.dot(regard)).normalize();
    bitangent.crossVectors(regard, tangent);

    // Exponential map from the 2D offset onto the sphere of directions.
    const ox = offset.x + drift.x;
    const oy = offset.y + drift.y;
    const len = Math.hypot(ox, oy);
    const k = len > 1e-6 ? Math.sin(len) / len : 1;
    gaze.copy(regard).multiplyScalar(Math.cos(len))
      .addScaledVector(tangent, ox * k)
      .addScaledVector(bitangent, oy * k)
      .normalize();
  }

  function lidOpenness() {
    // Closes in 70 ms, reopens in 150 ms — lids fall faster than they lift.
    if (blinkAge < 0.07) return 1 - blinkAge / 0.07;
    if (blinkAge < 0.22) return (blinkAge - 0.07) / 0.15;
    return 1;
  }

  const frame = { radius: currentParams.haloSize + MAX_LEAN };

  return {
    frame,

    update({ delta = 0, pointer } = {}) {
      // Reverse playback hands a negative step; a gaze has no meaningful
      // reverse, so it keeps living forward at the same pace. Clamped so a
      // hitch cannot skip a whole fixation.
      const dt = Number.isFinite(delta) ? Math.min(Math.abs(delta), 1 / 20) : 0;

      if (dt > 0) {
        stepGaze(dt);
        blinkAge += dt;
        pulse = decay(pulse, 1.6, dt);
      }

      composeGaze(pointer);

      // Head follows eyes: a critically damped spring toward the gaze, so the
      // body arrives after the look, never with it.
      if (dt > 0) {
        const omega = 7;
        leanTarget.copy(gaze).multiplyScalar(MAX_LEAN * currentParams.lean);
        springForce.copy(leanTarget).sub(leanPos).multiplyScalar(omega * omega)
          .addScaledVector(leanVel, -2 * omega);
        leanVel.addScaledVector(springForce, dt);
        leanPos.addScaledVector(leanVel, dt);
        group.position.copy(leanPos);
      }

      bodyUniforms.uLid.value = lidOpenness();
      bodyUniforms.uFocusSize.value = currentParams.focusSize * (1 + 0.35 * pulse);
      bodyUniforms.uFocusGlow.value = currentParams.focusGlow * (1 + 0.8 * pulse);
      haloUniforms.uHaloGlow.value = currentParams.focusGlow * HALO_GAIN * (1 + 0.8 * pulse);
    },

    setParams(patch) {
      Object.assign(currentParams, patch);
      if (patch.focusSize !== undefined) bodyUniforms.uFocusSize.value = patch.focusSize;
      if (patch.focusGlow !== undefined) {
        bodyUniforms.uFocusGlow.value = patch.focusGlow;
        haloUniforms.uHaloGlow.value = patch.focusGlow * HALO_GAIN;
      }
      if (patch.rimGlow !== undefined) bodyUniforms.uRimGlow.value = patch.rimGlow;
      if (patch.irisFibres !== undefined) bodyUniforms.uFibres.value = Number(patch.irisFibres);
      if (patch.haloSize !== undefined) {
        halo.scale.setScalar(patch.haloSize);
        frame.radius = patch.haloSize + MAX_LEAN;
      }
      if (patch.focusColor !== undefined) bodyUniforms.uFocusColor.value.set(patch.focusColor);
      if (patch.haloColor !== undefined) bodyUniforms.uHaloColor.value.set(patch.haloColor);
      if (patch.rimColor !== undefined) bodyUniforms.uRimColor.value.set(patch.rimColor);
      if (patch.bodyColor !== undefined) bodyUniforms.uBodyColor.value.set(patch.bodyColor);
    },

    // A click is being addressed: look straight back, widen, and hold the look
    // long enough to be read as noticing before resuming whatever it was doing.
    onPulse() {
      pulse = 1;
      startSaccade(0, new THREE.Vector2(0, 0));
      fixationLeft = 1.4;
      noticing = true;
    },

    dispose() {
      scene.remove(group);
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
    },
  };
}
