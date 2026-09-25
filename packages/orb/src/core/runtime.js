// The runtime: a renderer, a scene, one engine, a modulation rack. Everything
// an orb needs to animate and nothing an instrument needs to explore.
//
// It does not own the frame loop and has no hooks. The host calls advance() and
// render(), or tick() for both, and interleaves whatever it likes between them.
//
// This replaced five template-method hooks with inert defaults. That shape
// inverted the dependency: the runtime called down into a subclass it was not
// supposed to know about, one hook's default return value was dead code that
// only the studio's override used, and two studio mixins ended up talking to
// each other through the parent via a { wasGridMode, wasSweep } context object.
// A host-driven loop deletes all of it — the studio simply does its own work
// before calling advance(), and renders the grid instead of calling render().

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createPointerTracker, createClickPulse } from '../shared/pointer.js';
import { createFpsTracker } from '../shared/fps.js';
import { ENGINE_PARAM_DEFINITIONS } from '../engine-catalog.js';
import { createModulationRack, createDefaultModulation } from './modulation.js';
import { cameraDistanceForRadius, engineFrameRadius } from './framing.js';
import { notifyParams, notifyPulse, notifyResize } from './engine-notify.js';
import { resolveRuntimeOptions, resolvePixelRatio } from './runtime-options.js';
import { createBackgroundPass, preserveBloomAlpha, lightCarriesNoCoverage } from './background-pass.js';

export class OrbRuntime {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;

    // Defaults are the embed's, not the studio's. A host dropping an orb into a
    // 400px div should get a 400px orb that sits still: no drag-to-rotate, no
    // spin, and no capture buffer it never asked to pay for. The studio wants
    // all three and opts in, which is the right way round — a consumer can
    // discover an option, but cannot discover that a default was chosen for
    // somebody else's use case.
    const { controls, autoRotate, enableZoom, preserveDrawingBuffer } =
      resolveRuntimeOptions(options);

    this.scene = new THREE.Scene();
    const { width, height } = this.measureContainer();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 9.0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      // Forces the GPU to keep the frame around after compositing. Only a
      // consumer calling toDataURL needs it; everyone else paid for it.
      preserveDrawingBuffer,
      powerPreference: 'high-performance',
    });
    // Before setSize, which sizes the drawing buffer by it.
    this.renderer.setPixelRatio(resolvePixelRatio(options.pixelRatio, globalThis.devicePixelRatio));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Camera target, whether or not anything is steering it. Framing reads this
    // so it works identically with controls off.
    this.controlsTarget = new THREE.Vector3(0, 0, 0);

    this.controls = null;
    if (controls) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.enableZoom = enableZoom;
      this.controls.autoRotate = autoRotate;
      this.controls.autoRotateSpeed = 1.0;
      // Share one vector so `target` is the same object either way.
      this.controls.target = this.controlsTarget;
    }

    // Interaction & Performance
    this.pointerTracker = createPointerTracker(this.renderer.domElement);
    this.fpsTracker = createFpsTracker();
    this.smoothedPointer = new THREE.Vector2(0, 0);

    this.clickPulseTracker = createClickPulse(this.renderer.domElement, () => {
      notifyPulse(this.activeEngine);
      this.modulation.trigger(this.virtualTime);
    });

    // Modulation rack — shapes params and tempo per frame. `baseParams` is the
    // unmodulated truth the UI edits; the engine only ever sees base + modulation.
    this.modulation = createModulationRack(createDefaultModulation());
    this.baseParams = {};
    this.paramDefs = {};
    this.lastModulated = {};

    // Anything with .read() → 0..1 and .isActive. The studio points this at a
    // microphone input from @lumaform/orb/audio; a consumer can supply their
    // own analyser, or nothing, in which case audio routes stay inert rather
    // than broken. The runtime deliberately knows nothing about microphones —
    // see the note in ../audio/index.js.
    this.audioSource = options.audioSource ?? null;

    // Post-Processing
    this.initPostProcessing();

    // Engines Registry
    this.engineConstructors = new Map();
    this.activeEngine = null;
    this.activeEngineType = null;

    // Time & Playback
    this.clock = new THREE.Clock();
    this.virtualTime = 0;
    // The virtualTime advance() added this frame — what render() hands engines
    // as `delta`, so the two clocks an engine sees can never disagree.
    this.frameStep = 0;
    this.timeScale = 1.0;
    this.isPaused = false;

    // Listeners
    this.handleResize = this.onWindowResize.bind(this);
    // Observes the element we render into. A window listener sees only one of
    // the reasons a container changes size — a split pane, a collapsing
    // sidebar or a CSS transition moves it without the window moving at all.
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // No requestAnimationFrame here. The host drives the loop and calls
    // tick(delta), which is what lets the studio interleave its own work —
    // rehearsal, param tweening, grid rendering — without the runtime needing
    // to know any of it exists.
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      // Overwritten by updateGlobalSettings on the first state sync; kept in step
      // with DEFAULT_GLOBAL_SETTINGS so the very first frame is not brighter than
      // every frame after it.
      0.25, // strength
      0.25, // radius
      0.35  // threshold
    );
    this.composer.addPass(this.bloomPass);
    preserveBloomAlpha(this.bloomPass);

    // Ensure proper color management in the composer pipeline
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    // Last, so the backdrop is laid behind an already tone-mapped orb and
    // reaches the screen exactly as picked. See background-pass.js.
    this.background = createBackgroundPass();
    this.composer.addPass(this.background.pass);
    // The scene itself always renders over transparent black; the colour
    // lives only in the pass.
    this.renderer.setClearColor(0x000000, 0);
    this.scene.background = null;
  }

  registerEngine(type, constructorFn) {
    this.engineConstructors.set(type, constructorFn);
  }

  // Mounts an engine. Takes that engine's own params, not a store keyed by
  // every engine type: the runtime has no opinion about how a host organises
  // state, and asking for `state.engines[type]` made the studio's store shape
  // part of the published API.
  //
  // Returns true when an engine was actually constructed, so a caller that
  // needs to rebuild something on a real swap can tell that from a no-op.
  mountEngine(type, { params = {}, global = {}, modulation } = {}) {
    if (this.activeEngineType === type && this.activeEngine) {
      this.applyParams({ params, global, modulation });
      return false;
    }

    // Cleanup existing engine
    if (this.activeEngine) {
      this.activeEngine.dispose();
      this.activeEngine = null;
    }

    const constructorFn = this.engineConstructors.get(type);
    if (!constructorFn) {
      console.error(`Engine type "${type}" not registered.`);
      return;
    }

    this.activeEngineType = type;

    this.camera.fov = 45.0;
    this.camera.updateProjectionMatrix();
    if (this.controls) this.controls.enablePan = true;

    // Instantiate new engine
    this.activeEngine = constructorFn({
      studio: this,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      composer: this.composer,
      pointerTracker: this.pointerTracker,
      params,
      global,
    });

    // After construction, not before: the distance comes from the engine's own
    // `frame` hint, which does not exist until the factory has returned.
    this.frameActiveEngine();

    this.baseParams = { ...params };
    this.paramDefs = ENGINE_PARAM_DEFINITIONS[type] || {};
    this.lastModulated = {};

    if (modulation) this.syncModulation({ modulation });
    this.updateGlobalSettings(global);
    notifyParams(this.activeEngine, params);
    this.onWindowResize();

    return true;
  }

  // Applies params to the already-mounted engine. Cancelling an in-flight tween
  // because a direct edit supersedes it is a *host* policy, so it no longer
  // happens here — the studio does it before calling this.
  applyParams({ params = {}, global = {}, modulation } = {}) {
    if (modulation) this.syncModulation({ modulation });
    this.updateGlobalSettings(global);
    if (this.activeEngine && this.activeEngineType) {
      const p = params;
      this.baseParams = { ...p };
      this.paramDefs = ENGINE_PARAM_DEFINITIONS[this.activeEngineType] || {};
      this.lastModulated = {};
      notifyParams(this.activeEngine, p);
      // After the engine has seen the params, so a size change it reports is read
      // from the updated frame hint rather than the stale one.
      this.reframeForRadiusChange();
    }
  }

  // Modulation lives in app state so it round-trips through export and presets.
  // Called from both setEngine and updateParameters so the rack always reflects
  // whatever the Motion Lab last wrote.
  syncModulation(state) {
    if (state?.modulation) {
      this.modulation.setConfig(state.modulation);
      const audio = state.modulation.sources?.audio1;
      // The source shapes its own follower if it has one; a plain number feed
      // has nothing to configure.
      if (audio && this.audioSource?.setOptions) {
        this.audioSource.setOptions({ attack: audio.attack, release: audio.release });
      }
    }
  }

  updateGlobalSettings(global) {
    if (!global) return;

    if (global.dpr !== undefined) {
      this.renderer.setPixelRatio(global.dpr);
      this.composer.setPixelRatio(global.dpr);
    }

    if (global.exposure !== undefined) {
      this.renderer.toneMappingExposure = global.exposure;
    }

    if (global.bloomStrength !== undefined) {
      this.bloomPass.strength = global.bloomStrength;
    }
    if (global.bloomRadius !== undefined) {
      this.bloomPass.radius = global.bloomRadius;
    }
    if (global.bloomThreshold !== undefined) {
      this.bloomPass.threshold = global.bloomThreshold;
    }

    if (global.autoRotate !== undefined) {
      if (this.controls) this.controls.autoRotate = global.autoRotate;
    }
    if (global.autoRotateSpeed !== undefined) {
      if (this.controls) this.controls.autoRotateSpeed = global.autoRotateSpeed;
    }

    if (global.timeScale !== undefined) {
      this.timeScale = global.timeScale;
    }
    if (global.paused !== undefined) {
      this.isPaused = global.paused;
    }

    // Never scene.background or a clear colour: both are tone-mapped (and a
    // clear colour set here is sRGB-encoded for the screen, which grid cells
    // then misread as linear). The background pass composites it exactly.
    this.background.set({ background: global.background, transparent: global.transparentBg });
  }

  // Push only what actually changed. Engines fan params out to uniforms on every
  // setParams call, so sending all ~20 keys at 60fps would be wasteful — and when
  // a route is removed the engine is still holding the last modulated value, so
  // those keys have to be explicitly restored to base exactly once.
  applyModulatedParams(modulated) {
    if (!this.activeEngine) return;

    const patch = {};
    let dirty = false;

    for (const [key, value] of Object.entries(modulated)) {
      if (this.lastModulated[key] === undefined || Math.abs(this.lastModulated[key] - value) > 1e-4) {
        patch[key] = value;
        dirty = true;
      }
    }

    for (const key of Object.keys(this.lastModulated)) {
      if (modulated[key] === undefined && this.baseParams[key] !== undefined) {
        patch[key] = this.baseParams[key];
        dirty = true;
      }
    }

    this.lastModulated = { ...modulated };
    if (!dirty) return;

    notifyParams(this.activeEngine, patch);
  }

  // Falls back to the viewport when the container has no layout yet — a common
  // case when the orb is constructed before its parent is shown. The observer
  // corrects it the moment real dimensions exist.
  measureContainer() {
    const width = this.container?.clientWidth || window.innerWidth;
    const height = this.container?.clientHeight || window.innerHeight;
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  onWindowResize() {
    const { width, height } = this.measureContainer();

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);

    notifyResize(this.activeEngine, width, height);
  }

  // Frames the active engine at a consistent fraction of the viewport. Engines
  // declare the world radius they occupy; a fixed distance for all eight is what
  // left Hopf cropped at 1.34 of the visible half-height and Singularity at 0.46.
  frameActiveEngine() {
    const radius = engineFrameRadius(this.activeEngine);
    this.framedRadius = radius;
    this.camera.position.set(0, 0, cameraDistanceForRadius(radius, this.camera.fov));
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);
    this.controlsTarget.set(0, 0, 0);
    this.controls?.update();
  }

  // Engines whose size parameters change how much space they occupy report a new
  // frame.radius from setParams. Nothing consumed it: frameActiveEngine only ran on
  // engine switch and resize, so dragging a size slider grew the orb past the frame
  // edge and left it there. Re-framing wholesale is not the fix — it snaps the camera
  // back to the front and resets the orbit target, discarding whatever view the user
  // had set up. Only the distance is rescaled, along the direction they are already
  // looking from.
  reframeForRadiusChange() {
    if (!this.activeEngine) return;
    const radius = engineFrameRadius(this.activeEngine);
    if (Math.abs(radius - (this.framedRadius ?? radius)) < 1e-3) return;
    this.framedRadius = radius;

    const offset = this.camera.position.clone().sub(this.controlsTarget);
    const current = offset.length();
    if (current < 1e-6) return;
    offset.multiplyScalar(cameraDistanceForRadius(radius, this.camera.fov) / current);
    this.camera.position.copy(this.controlsTarget.clone().add(offset));
    this.controls?.update();
  }

  resetCamera() {
    this.camera.fov = 45.0;
    this.frameActiveEngine();
  }

  togglePlayPause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }


  // Advances time and parameters by one step. Separate from render() because a
  // host may advance state and then draw something else entirely — the studio's
  // variation grid renders N scissored viewports and never touches the composer.
  advance(delta) {
    // Modulation is evaluated against the *previous* virtualTime, then its tempo
    // multiplier is integrated into the next step. Integrating (rather than
    // assigning a rate) is what lets tempo hesitate and accelerate without the
    // geometry jumping — engines compute angle as `time * rate`, so a rate that
    // changes mid-flight would retroactively rewrite the accumulated angle.
    // Sample first so audio routes see this frame's level, not the previous one.
    if (this.audioSource?.isActive) {
      this.modulation.setAudioLevel(this.audioSource.read());
    }
    const mod = this.modulation.apply(this.baseParams, this.paramDefs, this.virtualTime);

    // virtualTime stays the runtime's. A host passing raw delta still gets the
    // rack's _timeScale folded in here, which is the only place it is applied.
    // The same step is what engines later receive as `delta`: it used to be
    // `delta * timeScale` without the rack's multiplier, so every engine that
    // integrates delta — most of them — ignored tempo routes in the main view
    // while grid cells, which fold the multiplier in themselves, obeyed them.
    // A hesitation found in the grid then vanished on promotion.
    this.frameStep = this.isPaused ? 0 : delta * this.timeScale * mod.timeScale;
    this.virtualTime += this.frameStep;

    this.applyModulatedParams(mod.params);
    return mod;
  }

  // Draws the active engine through the composer. Time comes from the last
  // advance(), never from an argument, so drawing cannot disagree with it.
  render() {
    this.smoothedPointer.lerp(this.pointerTracker.pointer, 0.08);

    this.controls?.update();
    this.camera.updateMatrixWorld();

    if (this.activeEngine) {
      const dpr = this.renderer.getPixelRatio();
      const marchQuality = this.fpsTracker.getMarchQuality(dpr);

      this.activeEngine.update({
        time: this.virtualTime,
        delta: this.frameStep,
        pointer: this.smoothedPointer,
        marchQuality,
        fps: this.fpsTracker.fps,
      });
    }

    lightCarriesNoCoverage(this.scene);
    this.composer.render();
  }

  // One frame, for a host with nothing to interleave.
  tick(delta) {
    this.fpsTracker.tick();
    this.advance(delta);
    this.render();
  }

  // A refused microphone is a normal outcome, not an error.
  // Attach or replace the level source driving `audio1`. Pass null to detach —
  // routes then read 0 and go inert rather than freezing at their last value,
  // which is what made a stopped microphone look like a stuck orb.
  setAudioSource(source) {
    this.audioSource = source ?? null;
    if (!this.audioSource) this.modulation.setAudioLevel(0);
  }

  // The host stops its own loop; a runtime that never started one cannot end it.
  dispose() {
    this.resizeObserver?.disconnect();
    this.clickPulseTracker?.dispose();
    this.pointerTracker?.dispose();
    this.controls?.dispose();
    this.activeEngine?.dispose();
    this.background?.pass.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
    // Was `container.innerHTML = ''`, which removed every sibling the host had
    // put there — overlays, captions, its own markup. Remove only what we added.
    this.renderer?.domElement?.remove();
  }
}
