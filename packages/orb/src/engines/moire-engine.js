import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { buildShell, resolveShells } from '../core/moire-sphere.js';
import { decay } from '../core/phase.js';
import { canvasSize } from '../core/canvas-size.js';

// Chiral Moiré — two nested spherical line grids of slightly different pitch.
//
// Where the two grids overlap they interfere, and because one carries a few more
// meridians than the other the interference forms fringes. Counter-rotating the
// shells makes those fringes travel around the orb: the pattern animates without
// a single vertex moving.
//
// That last point matters. The previous engine drew one square rim ruled to a
// recessed aperture — flat head-on, and not really a moiré, since the pattern
// was ruled string art rather than interference. It also rebuilt its entire
// vertex buffer on the CPU every frame in update(). Here geometry is rebuilt
// only when a geometry parameter changes, and motion is two group rotations.
export function createMoireEngine({ studio, scene, camera, renderer, pointerTracker, params, global }) {
  const currentParams = {
    archetype: 'meridian_beat', // 'meridian_beat' | 'lattice_beat' | 'helix_beat'
    scale: 2.2,
    lineDensity: 28,   // meridians on the outer shell
    beatOffset: 2,     // extra meridians on the inner shell — the beat frequency
    latBands: 8,       // latitude rings, used by lattice_beat
    shellGap: 0.9,     // inner shell radius as a fraction of the outer
    twistAngle: 0.72,  // shear that turns meridians into helices
    lineWidth: 1.6,
    lineColor: '#7fe9ff',
    innerLineColor: null, // optional; inner shell otherwise uses lineColor at 0.65
    lineGlow: 1.0,

    motionMode: 'counter_spin', // 'counter_spin' | 'orbit_3d' | 'wave_pulse' | 'interactive_tilt'
    rotSpeedX: 0.06,
    rotSpeedY: 0.18,
    rotSpeedZ: 0.0,
    counterSpin: 0.55, // relative rate between the shells — drives the fringes
    breatheSpeed: 0.6,
    breatheAmp: 0.05,
    twistSpeed: 0.15,
    tiltStrength: 0.35,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  // One group per shell so counter-rotation is a transform rather than a rebuild.
  const outerGroup = new THREE.Group();
  const innerGroup = new THREE.Group();
  group.add(outerGroup, innerGroup);

  let outerMesh = null;
  let innerMesh = null;
  let outerGeometry = null;
  let innerGeometry = null;
  let outerMaterial = null;
  let innerMaterial = null;

  let targetRotX = 0;
  let targetRotY = 0;
  let elapsedTotal = 0;
  let pulse = 0;

  function makeMaterial(colorHex, glow, dim) {
    const color = new THREE.Color(colorHex);
    // The inner shell is dimmed so the two grids stay distinguishable; at equal
    // intensity the fringes read as noise rather than as depth.
    color.multiplyScalar(glow * dim);
    const material = new LineMaterial({
      color: color.getHex(),
      linewidth: currentParams.lineWidth,
      transparent: true,
      opacity: 0.95,
      // No depth test, so the far side of each shell shows through. Seeing both
      // sides at once is what makes the interference visible at all.
      depthTest: false,
      depthWrite: false,
      // Normal, not additive: nine presets switch the canvas to near-white paper
      // and draw the shells in black ink, and additive blending is invisible on
      // white. The interference comes from where the two grids overlap, not from
      // the blend mode, so nothing is lost by staying compatible with both.
      blending: THREE.NormalBlending,
    });
    material.resolution.copy(canvasSize(renderer));
    return material;
  }

  function applyShellColors() {
    const glow = currentParams.lineGlow;
    if (outerMaterial) {
      outerMaterial.color.copy(new THREE.Color(currentParams.lineColor)).multiplyScalar(glow);
    }
    if (innerMaterial) {
      const innerHex = currentParams.innerLineColor || currentParams.lineColor;
      const dim = currentParams.innerLineColor ? 1.0 : 0.65;
      innerMaterial.color.copy(new THREE.Color(innerHex)).multiplyScalar(glow * dim);
    }
  }

  function disposeMeshes() {
    if (outerMesh) outerGroup.remove(outerMesh);
    if (innerMesh) innerGroup.remove(innerMesh);
    if (outerGeometry) outerGeometry.dispose();
    if (innerGeometry) innerGeometry.dispose();
    if (outerMaterial) outerMaterial.dispose();
    if (innerMaterial) innerMaterial.dispose();
    outerGeometry = innerGeometry = null;
    outerMaterial = innerMaterial = null;
    outerMesh = innerMesh = null;
  }

  function buildMeshes() {
    disposeMeshes();

    const { outer, inner } = resolveShells({
      meridians: currentParams.lineDensity,
      beatOffset: currentParams.beatOffset,
      latitudes: currentParams.latBands,
      archetype: currentParams.archetype,
    });

    const twist = currentParams.archetype === 'helix_beat'
      ? currentParams.twistAngle * 2.0
      : currentParams.twistAngle;

    // Shells are built at unit radius; scale and gap are applied as transforms so
    // both can be animated — and modulated — without regenerating vertices.
    const outerPos = buildShell({ ...outer, radius: 1, twist });
    // The inner shell twists the other way. Counter-chirality doubles the rate at
    // which the fringes sweep and stops the pair reading as one solid object.
    const innerPos = buildShell({ ...inner, radius: 1, twist: -twist });

    outerGeometry = new LineSegmentsGeometry();
    outerGeometry.setPositions(outerPos);
    outerMaterial = makeMaterial(currentParams.lineColor, currentParams.lineGlow, 1.0);
    outerMesh = new LineSegments2(outerGeometry, outerMaterial);
    outerMesh.computeLineDistances();
    outerMesh.renderOrder = 2;
    outerGroup.add(outerMesh);

    innerGeometry = new LineSegmentsGeometry();
    innerGeometry.setPositions(innerPos);
    innerMaterial = makeMaterial(
      currentParams.innerLineColor || currentParams.lineColor,
      currentParams.lineGlow,
      currentParams.innerLineColor ? 1.0 : 0.65,
    );
    innerMesh = new LineSegments2(innerGeometry, innerMaterial);
    innerMesh.computeLineDistances();
    innerMesh.renderOrder = 2;
    innerGroup.add(innerMesh);
  }

  // Which parameters require new vertices. Everything else is a transform or a
  // material property, so it can change every frame for free.
  const GEOMETRY_KEYS = ['archetype', 'lineDensity', 'beatOffset', 'latBands', 'twistAngle'];

  // The flat-panel archetypes this engine used to have. Configs and presets
  // exported before the redesign still name them, and an unrecognised select
  // value would otherwise silently fall back to the default and lose the
  // character the saved config was chosen for.
  const LEGACY_ARCHETYPES = {
    square_vortex: 'meridian_beat',
    hex_vortex: 'meridian_beat',
    pentagon_envelope: 'lattice_beat',
    stellated_rosette: 'lattice_beat',
    astroid_quad: 'helix_beat',
    guilloche_rosette: 'lattice_beat',
    triangle_vortex: 'meridian_beat',
    triangle_tunnel: 'helix_beat',
    winged_moire: 'helix_beat',
  };

  if (LEGACY_ARCHETYPES[currentParams.archetype]) {
    currentParams.archetype = LEGACY_ARCHETYPES[currentParams.archetype];
  }

  buildMeshes();

  return {
    // Unit shells scaled by `scale`, so this is the world radius occupied.
    frame: { radius: 2.28 },

    update(args = {}) {
      const dt = typeof args.delta === 'number' ? args.delta : 0.016;
      const elapsed = typeof args.time === 'number' ? args.time : elapsedTotal + dt;
      elapsedTotal = elapsed;
      const pointer = args.pointer;

      pulse = decay(pulse, 5.0, dt);

      if (currentParams.motionMode === 'interactive_tilt') {
        if (pointer) {
          targetRotX = -pointer.y * currentParams.tiltStrength * 0.6;
          targetRotY = pointer.x * currentParams.tiltStrength * 0.6;
        }
        group.rotation.x += (targetRotX - group.rotation.x) * 0.08;
        group.rotation.y += (targetRotY - group.rotation.y) * 0.08;
      } else {
        group.rotation.x += dt * currentParams.rotSpeedX;
        group.rotation.y += dt * currentParams.rotSpeedY;
        group.rotation.z += dt * currentParams.rotSpeedZ;
        if (pointer) {
          group.rotation.x += pointer.y * dt * 0.06;
          group.rotation.y += pointer.x * dt * 0.09;
        }
      }

      // The fringes. Equal and opposite, so the orb as a whole does not appear to
      // spin while its surface pattern travels.
      const spin = dt * currentParams.counterSpin;
      outerGroup.rotation.y += spin;
      innerGroup.rotation.y -= spin;

      if (currentParams.motionMode === 'wave_pulse' || currentParams.archetype === 'helix_beat') {
        const t = elapsed * currentParams.twistSpeed;
        outerGroup.rotation.z = Math.sin(t) * 0.25;
        innerGroup.rotation.z = -Math.sin(t) * 0.25;
      }

      // Breathing the gap between the shells changes the interference itself, not
      // just the size — the fringe spacing widens and narrows.
      const breathe = 1 + currentParams.breatheAmp * Math.sin(elapsed * currentParams.breatheSpeed * Math.PI);
      const s = currentParams.scale * (1 + pulse * 0.18);
      outerGroup.scale.setScalar(s);
      innerGroup.scale.setScalar(s * currentParams.shellGap * breathe);
    },

    setParams(newParams) {
      if (newParams.archetype !== undefined && LEGACY_ARCHETYPES[newParams.archetype]) {
        newParams = { ...newParams, archetype: LEGACY_ARCHETYPES[newParams.archetype] };
      }
      const needsRebuild = GEOMETRY_KEYS.some(
        (k) => newParams[k] !== undefined && newParams[k] !== currentParams[k]
      );
      Object.assign(currentParams, newParams);

      if (needsRebuild) {
        buildMeshes();
        return;
      }
      if (newParams.lineWidth !== undefined) {
        if (outerMaterial) outerMaterial.linewidth = newParams.lineWidth;
        if (innerMaterial) innerMaterial.linewidth = newParams.lineWidth;
      }
      if (
        newParams.lineColor !== undefined
        || newParams.innerLineColor !== undefined
        || newParams.lineGlow !== undefined
      ) {
        applyShellColors();
      }
    },

    onPointerMove(nx, ny) {
      targetRotX = -ny * currentParams.tiltStrength * 0.6;
      targetRotY = nx * currentParams.tiltStrength * 0.6;
    },

    // Was mutating zDepth and restoring it from the *initial* params on a timer,
    // which silently discarded any edit made since. A decaying value needs no
    // restore and so cannot fight the user.
    onPulse() {
      pulse = 1;
    },

    onResize(width, height) {
      if (outerMaterial) outerMaterial.resolution.set(width, height);
      if (innerMaterial) innerMaterial.resolution.set(width, height);
    },

    dispose() {
      disposeMeshes();
      scene.remove(group);
    },
  };
}
