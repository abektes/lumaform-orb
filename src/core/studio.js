import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createPointerTracker, createClickPulse } from '../shared/pointer.js';
import { createFpsTracker } from '../shared/fps.js';
import { ENGINE_TYPES, ENGINE_PARAM_DEFINITIONS } from './state.js';
import { createModulationRack, createDefaultModulation } from './modulation.js';
import { createVariationGrid, DEFAULT_BREADTH } from './variation-grid.js';
import { isSweepable, sweepValues } from './sweep.js';
import { createParamTween } from './param-tween.js';
import { createAudioInput } from './audio-input.js';
import { createClipRecorder } from './clip-recorder.js';
import { createSequencePlayer } from './sequence.js';

export class OrbStudio {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 9.0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.0;

    // Interaction & Performance
    this.pointerTracker = createPointerTracker(this.renderer.domElement);
    this.fpsTracker = createFpsTracker();
    this.smoothedPointer = new THREE.Vector2(0, 0);

    this.clickPulseTracker = createClickPulse(this.renderer.domElement, () => {
      this.activeEngine?.onPulse?.();
      this.activeEngine?.onPointerClick?.();
      this.modulation.trigger(this.virtualTime);
    });

    // Modulation rack — shapes params and tempo per frame. `baseParams` is the
    // unmodulated truth the UI edits; the engine only ever sees base + modulation.
    this.modulation = createModulationRack(createDefaultModulation());
    this.baseParams = {};
    this.paramDefs = {};
    this.lastModulated = {};

    // Variation grid. Click promotes a cell to parent and re-breeds; shift-click
    // marks it for export instead.
    this.grid = null;
    this.gridRadius = 0.25;
    this.gridSections = null;
    this.gridBreadth = DEFAULT_BREADTH;
    // null = follow the section lock: locking mutation to colours also holds the
    // motion character still, which is what made a colour comparison readable.
    // The HUD sends an explicit boolean once the user touches the Patch chip.
    this.gridBreedPatch = null;
    this.onGridPromote = null;
    this.sweepInfo = null;
    // Created lazily: constructing an AudioContext before a user gesture is
    // wasteful and some browsers start it suspended anyway.
    this.audioInput = null;
    // Sessions that never record should never create a canvas capture stream.
    this.clipRecorder = null;
    // Tweens move baseParams, so the modulation rack keeps layering on top of a
    // moving base rather than fighting it.
    this.paramTween = createParamTween();
    this.sequencePlayer = createSequencePlayer();
    this.sequenceState = null;
    this.currentSequence = null;
    this.onSequenceStep = null;
    this.onSequenceStop = null;
    this.applyingSequenceStep = false;

    this.handleGridPointer = (event) => {
      if (!this.grid) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      const index = this.grid.hitTest(
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height
      );
      if (index < 0) return;

      if (event.shiftKey) {
        this.grid.toggleSelect(index);
        return;
      }
      const promoted = this.grid.promote(index);
      this.grid.populate(this.gridRadius, this.gridSections, {
        breadth: this.gridBreadth,
        breedPatch: this.gridBreedPatch,
      });
      if (promoted) this.onGridPromote?.(promoted);
    };
    this.renderer.domElement.addEventListener('pointerdown', this.handleGridPointer);

    // Post-Processing
    this.initPostProcessing();

    // Engines Registry
    this.engineConstructors = new Map();
    this.activeEngine = null;
    this.activeEngineType = null;

    // Time & Playback
    this.clock = new THREE.Clock();
    this.virtualTime = 0;
    this.timeScale = 1.0;
    this.isPaused = false;

    // Listeners
    this.handleResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.handleResize);

    this.animate = this.renderFrame.bind(this);
    this.rafId = requestAnimationFrame(this.animate);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55, // strength
      0.38, // radius
      0.15  // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Ensure proper color management in the composer pipeline
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  registerEngine(type, constructorFn) {
    this.engineConstructors.set(type, constructorFn);
  }

  setEngine(type, state) {
    if (this.currentSequence && !this.applyingSequenceStep) {
      // The caller already wrote the requested engine into state.
      this.stopSequence({ reconcile: false });
    }

    if (this.activeEngineType === type && this.activeEngine) {
      this.updateParameters(state);
      return;
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

    // Camera distance & angle
    this.camera.position.set(0, 0, 7.5);
    this.camera.fov = 45.0;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.enablePan = true;
    this.controls.update();

    // Instantiate new engine
    this.activeEngine = constructorFn({
      studio: this,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      composer: this.composer,
      pointerTracker: this.pointerTracker,
      params: state.engines[type],
      global: state.global,
    });

    this.baseParams = { ...state.engines[type] };
    this.paramDefs = ENGINE_PARAM_DEFINITIONS[type] || {};
    this.lastModulated = {};
    // A tween in flight targets the previous engine's parameters.
    this.paramTween.cancel();

    this.syncModulation(state);
    this.updateGlobalSettings(state.global);
    if (this.activeEngine) {
      if (typeof this.activeEngine.onParamsChange === 'function') {
        this.activeEngine.onParamsChange(state.engines[type]);
      } else if (typeof this.activeEngine.setParams === 'function') {
        this.activeEngine.setParams(state.engines[type]);
      }
    }
    this.onWindowResize();
  }

  updateParameters(state) {
    // A direct edit, import or preset selection supersedes an in-flight A/B
    // transition. Otherwise the old target would overwrite the edit next frame.
    if (this.currentSequence && !this.applyingSequenceStep) {
      // A slider, preset or import has already written its desired value into
      // state, so stopping rehearsal must not replace that edit with the
      // intermediate visual value.
      this.stopSequence({ reconcile: false });
    }
    this.paramTween.cancel();
    this.syncModulation(state);
    this.updateGlobalSettings(state.global);
    if (this.activeEngine && this.activeEngineType) {
      const p = state.engines[this.activeEngineType];
      this.baseParams = { ...p };
      this.paramDefs = ENGINE_PARAM_DEFINITIONS[this.activeEngineType] || {};
      this.lastModulated = {};
      if (typeof this.activeEngine.onParamsChange === 'function') {
        this.activeEngine.onParamsChange(p);
      } else if (typeof this.activeEngine.setParams === 'function') {
        this.activeEngine.setParams(p);
      }
    }
  }

  get isPlayingSequence() {
    return this.sequencePlayer.isPlaying;
  }

  playSequence(sequence, state, { loop = true } = {}) {
    if (!sequence?.length || !state) return false;
    if (this.currentSequence) this.stopSequence();
    this.sequenceState = state;
    // Editing is disabled during playback, but a shallow copy also keeps a
    // caller replacing its array from changing index lookup mid-frame.
    this.currentSequence = [...sequence];
    this.sequencePlayer.load(this.currentSequence, { loop });
    this.sequencePlayer.play();
    return this.sequencePlayer.isPlaying;
  }

  pauseSequence() {
    this.sequencePlayer.pause();
  }

  resumeSequence() {
    if (!this.currentSequence) return;
    this.sequencePlayer.play();
  }

  stopSequence({ reconcile = true } = {}) {
    const hadSequence = !!this.currentSequence;
    if (
      reconcile &&
      hadSequence &&
      this.sequenceState?.engines?.[this.activeEngineType] &&
      this.paramTween.isRunning
    ) {
      // Sequence steps put their target in state before the visual tween starts.
      // Stopping halfway must make the durable config match the frame on screen,
      // or an immediate finding/export captures a target it never displayed.
      Object.assign(this.sequenceState.engines[this.activeEngineType], this.baseParams);
    }
    this.sequencePlayer.stop();
    this.sequenceState = null;
    this.currentSequence = null;
    this.paramTween.cancel();
    if (hadSequence) this.onSequenceStop?.();
  }

  // Apply globals and modulation without updateParameters(): that method
  // deliberately treats a direct edit as cancellation of the rehearsal.
  applySequenceStep(step) {
    const state = this.sequenceState;
    if (!state || !step || !state.engines?.[step.engine]) return false;

    this.applyingSequenceStep = true;
    try {
      if (step.global) Object.assign(state.global, structuredClone(step.global));
      if (step.modulation) state.modulation = structuredClone(step.modulation);
      Object.assign(state.engines[step.engine], structuredClone(step.params));

      if (step.engine !== state.engine) {
        // Disposing one engine and constructing another cannot be interpolated.
        state.engine = step.engine;
        this.setEngine(step.engine, state);
        return true;
      }

      this.syncModulation(state);
      this.updateGlobalSettings(state.global);
      this.tweenTo(step.params, {
        durationMs: step.transitionMs,
        easing: step.easing,
      });
      return true;
    } finally {
      this.applyingSequenceStep = false;
    }
  }

  // Travel from the current base to `targetParams`. Passing durationMs 0 is a
  // hard cut, which is what A/B did before transitions existed.
  tweenTo(targetParams, { durationMs = 400, easing = 'easeOut' } = {}) {
    if (this.currentSequence && !this.applyingSequenceStep) {
      // A/B applied its target to state before asking for this tween.
      this.stopSequence({ reconcile: false });
    }
    if (durationMs <= 0) {
      Object.assign(this.baseParams, targetParams);
      this.paramTween.cancel();
      return;
    }
    this.paramTween.start({ ...this.baseParams }, targetParams, this.paramDefs, { durationMs, easing });
  }

  // Modulation lives in app state so it round-trips through export and presets.
  // Called from both setEngine and updateParameters so the rack always reflects
  // whatever the Motion Lab last wrote.
  syncModulation(state) {
    if (state?.modulation) {
      this.modulation.setConfig(state.modulation);
      const audio = state.modulation.sources?.audio1;
      if (audio && this.audioInput) {
        this.audioInput.setOptions({ attack: audio.attack, release: audio.release });
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
      this.controls.autoRotate = global.autoRotate;
    }
    if (global.autoRotateSpeed !== undefined) {
      this.controls.autoRotateSpeed = global.autoRotateSpeed;
    }

    if (global.timeScale !== undefined) {
      this.timeScale = global.timeScale;
    }
    if (global.paused !== undefined) {
      this.isPaused = global.paused;
    }

    if (global.transparentBg) {
      this.renderer.setClearColor(0x000000, 0);
      this.scene.background = null;
    } else if (global.background) {
      const bgColor = new THREE.Color(global.background);
      this.renderer.setClearColor(bgColor, 1);
      this.scene.background = bgColor;
    }
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

    if (typeof this.activeEngine.onParamsChange === 'function') {
      this.activeEngine.onParamsChange(patch);
    } else if (typeof this.activeEngine.setParams === 'function') {
      this.activeEngine.setParams(patch);
    }
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);

    if (this.activeEngine?.resize) {
      this.activeEngine.resize(width, height);
    } else if (this.activeEngine?.onResize) {
      this.activeEngine.onResize(width, height);
    }
  }

  resetCamera() {
    this.camera.position.set(0, 0, 7.5);
    this.camera.fov = 45.0;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  togglePlayPause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  renderFrame() {
    this.rafId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    this.fpsTracker.tick();

    let tweenDeltaMs = delta * 1000;
    let sequenceCompleted = false;
    if (this.sequencePlayer.isPlaying) {
      const at = this.sequencePlayer.advance(tweenDeltaMs);
      sequenceCompleted = !!at?.completed;
      if (at?.entered) {
        const step = this.currentSequence?.[at.index];
        if (step && this.applySequenceStep(step)) {
          // A throttled frame can skip boundaries. Advance a newly started
          // tween only by the elapsed portion of its own step, not by the whole
          // frame delta that may include earlier steps.
          tweenDeltaMs = at.phase === 'transition'
            ? at.stepElapsedMs
            : Math.max(0, Number(step.transitionMs) || 0);
          this.onSequenceStep?.({ index: at.index, step });
        }
      }
    }

    // Advance before evaluating the rack so modulation reads this frame's base.
    // Real milliseconds, not virtualTime: a transition's duration should not
    // change when playback speed does.
    // Pausing a rehearsal freezes both its clock and the transition already in
    // flight; stop instead cancels that transition and resets the clock.
    const sequencePaused = this.currentSequence
      && !this.sequencePlayer.isPlaying
      && !sequenceCompleted;
    if (this.paramTween.isRunning && !sequencePaused) {
      const tweened = this.paramTween.advance(tweenDeltaMs);
      if (tweened) {
        const patch = {};
        for (const [key, value] of Object.entries(tweened)) {
          if (!Object.is(this.baseParams[key], value)) patch[key] = value;
        }
        Object.assign(this.baseParams, tweened);
        this.applyModulatedParams({});
        if (Object.keys(patch).length && typeof this.activeEngine?.setParams === 'function') {
          this.activeEngine.setParams(patch);
        } else if (Object.keys(patch).length && typeof this.activeEngine?.onParamsChange === 'function') {
          this.activeEngine.onParamsChange(patch);
        }
      }
    }
    if (sequenceCompleted) this.stopSequence();

    // Modulation is evaluated against the *previous* virtualTime, then its tempo
    // multiplier is integrated into the next step. Integrating (rather than
    // assigning a rate) is what lets tempo hesitate and accelerate without the
    // geometry jumping — engines compute angle as `time * rate`, so a rate that
    // changes mid-flight would retroactively rewrite the accumulated angle.
    // Sample first so audio routes see this frame's level, not the previous one.
    if (this.audioInput?.isActive) {
      const audioLevel = this.audioInput.read();
      this.modulation.setAudioLevel(audioLevel);
      this.grid?.setAudioLevel(audioLevel);
    }
    const mod = this.modulation.apply(this.baseParams, this.paramDefs, this.virtualTime);

    if (!this.isPaused) {
      this.virtualTime += delta * this.timeScale * mod.timeScale;
    }

    this.applyModulatedParams(mod.params);

    // Grid mode bypasses the composer: bloom is a full-screen pass and would
    // bleed across cell boundaries, so cells render straight to the framebuffer.
    if (this.grid) {
      this.grid.render(this.virtualTime, this.isPaused ? 0 : delta * this.timeScale, window.innerWidth, window.innerHeight);
      return;
    }

    // Smooth pointer motion
    this.smoothedPointer.lerp(this.pointerTracker.pointer, 0.08);

    this.controls.update();
    this.camera.updateMatrixWorld();

    if (this.activeEngine) {
      const dpr = this.renderer.getPixelRatio();
      const marchQuality = this.fpsTracker.getMarchQuality(dpr);

      this.activeEngine.update({
        time: this.virtualTime,
        delta: this.isPaused ? 0 : delta * this.timeScale,
        pointer: this.smoothedPointer,
        marchQuality,
        fps: this.fpsTracker.fps,
      });
    }

    // Postprocessing Composer Render
    this.composer.render();
  }

  // --- variation grid ------------------------------------------------------

  // A refused microphone is a normal outcome, not an error.
  async enableAudio(mode = 'mic') {
    const audio = this.modulation.config.sources?.audio1 || {};
    if (!this.audioInput) {
      this.audioInput = createAudioInput({
        attack: audio.attack ?? 0.5,
        release: audio.release ?? 0.12,
      });
    } else {
      this.audioInput.setOptions({
        attack: audio.attack ?? 0.5,
        release: audio.release ?? 0.12,
      });
    }
    const started = mode === 'tone'
      ? this.audioInput.startTestTone()
      : await this.audioInput.startMic();
    if (!started) {
      this.modulation.setAudioLevel(0);
      this.grid?.setAudioLevel(0);
    }
    return started;
  }

  disableAudio() {
    this.audioInput?.stop();
    // Otherwise every audio route freezes at its last value.
    this.modulation.setAudioLevel(0);
    this.grid?.setAudioLevel(0);
  }

  ensureClipRecorder() {
    if (!this.clipRecorder) {
      this.clipRecorder = createClipRecorder({
        canvas: this.renderer.domElement,
        fps: 60,
        getEngineName: () => this.activeEngineType,
      });
    }
    return this.clipRecorder;
  }

  get isRecordingClip() {
    return !!this.clipRecorder?.isRecording;
  }

  startClip() {
    return this.ensureClipRecorder().start();
  }

  stopClip() {
    return this.clipRecorder ? this.clipRecorder.stop() : Promise.resolve(null);
  }

  enterGridMode(state, options = {}) {
    if (this.currentSequence) this.stopSequence();
    const {
      cols = 3,
      rows = 3,
      radius = this.gridRadius,
      sections = this.gridSections,
      breadth = this.gridBreadth,
      breedPatch = this.gridBreedPatch,
    } = options;
    const type = state.engine;
    const factory = this.engineConstructors.get(type);
    if (!factory) {
      console.error(`Engine type "${type}" not registered.`);
      return null;
    }

    this.exitGridMode();
    this.controls.enabled = false;

    this.grid = createVariationGrid({
      renderer: this.renderer,
      engineFactory: factory,
      engineType: type,
      baseParams: state.engines[type],
      globalSettings: state.global,
      modulation: state.modulation,
      defs: ENGINE_PARAM_DEFINITIONS[type] || {},
      cols,
      rows,
    });
    this.gridRadius = radius;
    this.gridSections = sections;
    this.gridBreadth = breadth;
    this.gridBreedPatch = breedPatch;
    this.grid.populate(radius, sections, { breadth, breedPatch });
    return this.grid;
  }

  // A sweep is the variation grid with a deterministic ramp instead of mutation:
  // one row, N cells, one parameter walked from min to max. It reuses this.grid
  // so grid mode's render branch, exit path and pointer handling all apply.
  enterSweepMode(state, { paramKey, steps = 5 } = {}) {
    if (this.currentSequence) this.stopSequence();
    const type = state.engine;
    const factory = this.engineConstructors.get(type);
    if (!factory) {
      console.error(`Engine type "${type}" not registered.`);
      return null;
    }

    const defs = ENGINE_PARAM_DEFINITIONS[type] || {};
    const def = defs[paramKey];
    if (!isSweepable(def)) {
      console.warn(`Parameter "${paramKey}" is not sweepable on engine "${type}".`);
      return null;
    }

    const values = sweepValues(def, steps);
    const base = state.engines[type];

    this.exitGridMode();
    this.controls.enabled = false;

    this.grid = createVariationGrid({
      renderer: this.renderer,
      engineFactory: factory,
      engineType: type,
      baseParams: base,
      globalSettings: state.global,
      modulation: state.modulation,
      defs,
      cols: values.length,
      rows: 1,
      cellFactory: (index) => ({ params: { ...base, [paramKey]: values[index] } }),
    });
    this.grid.populate();

    this.sweepInfo = { key: paramKey, label: def.label, values };
    return this.sweepInfo;
  }

  reseedGrid({ radius, sections, breadth, breedPatch } = {}) {
    if (!this.grid) return;
    if (radius !== undefined) this.gridRadius = radius;
    if (sections !== undefined) this.gridSections = sections;
    if (breadth !== undefined) this.gridBreadth = breadth;
    if (breedPatch !== undefined) this.gridBreedPatch = breedPatch;
    this.grid.populate(this.gridRadius, this.gridSections, {
      breadth: this.gridBreadth,
      breedPatch: this.gridBreedPatch,
    });
  }

  exitGridMode() {
    if (!this.grid) return;
    this.grid.dispose();
    this.grid = null;
    this.sweepInfo = null;
    this.controls.enabled = true;
    this.renderer.setScissorTest(false);
    this.onWindowResize();
  }

  get isGridMode() {
    return !!this.grid;
  }

  // Fixed-size renders use DPR 1 by default, which makes a 240x150 thumbnail
  // exactly that size. Snapshots opt back into the live DPR below.
  renderToDataURL({
    width,
    height,
    transparent = false,
    mimeType = 'image/png',
    quality,
    pixelRatio = 1,
  } = {}) {
    const rendererSize = this.renderer.getSize(new THREE.Vector2());
    const rendererPixelRatio = this.renderer.getPixelRatio();
    const composerWidth = this.composer._width;
    const composerHeight = this.composer._height;
    const composerPixelRatio = this.composer._pixelRatio;
    const cameraAspect = this.camera.aspect;
    const targetWidth = Math.max(1, Math.round(width ?? rendererSize.x));
    const targetHeight = Math.max(1, Math.round(height ?? rendererSize.y));
    const prevClearColor = new THREE.Color();
    this.renderer.getClearColor(prevClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();
    const prevBg = this.scene.background;
    let dataUrl;

    if (this.isRecordingClip) {
      // captureStream() watches the live canvas. Resizing or rendering a
      // thumbnail into it would put that frame into the recording, so scale the
      // already-painted frame through a temporary 2D canvas instead.
      if (transparent) {
        // The painted frame already has the background composited into it;
        // there is no alpha left to recover by scaling it.
        throw new Error('Transparent captures are unavailable while recording a clip.');
      }

      const maxWidth = this.renderer.domElement.width;
      const maxHeight = this.renderer.domElement.height;
      let outWidth = Math.max(1, Math.round(targetWidth * pixelRatio));
      let outHeight = Math.max(1, Math.round(targetHeight * pixelRatio));

      // Clamp rather than refuse. Three sizes the canvas with Math.floor while
      // this rounds, so an exact 1:1 capture can land one pixel past the canvas
      // and would otherwise throw for roughly 40% of window widths at the
      // default 1.2 device pixel ratio. Scaling both axes by the same factor
      // also keeps a genuinely upscaled request (2x, 3x) producing a correctly
      // proportioned image at the resolution actually available.
      if (outWidth > maxWidth || outHeight > maxHeight) {
        const scale = Math.min(maxWidth / outWidth, maxHeight / outHeight);
        outWidth = Math.max(1, Math.floor(outWidth * scale));
        outHeight = Math.max(1, Math.floor(outHeight * scale));
      }

      const output = document.createElement('canvas');
      output.width = outWidth;
      output.height = outHeight;
      output.getContext('2d')?.drawImage(this.renderer.domElement, 0, 0, outWidth, outHeight);
      return output.toDataURL(mimeType, quality);
    }

    try {
      if (transparent) {
        this.renderer.setClearColor(0x000000, 0);
        this.scene.background = null;
      }

      this.renderer.setPixelRatio(pixelRatio);
      this.composer.setPixelRatio(pixelRatio);
      this.renderer.setSize(targetWidth, targetHeight, false);
      this.composer.setSize(targetWidth, targetHeight);
      this.camera.aspect = targetWidth / targetHeight;
      this.camera.updateProjectionMatrix();
      if (this.activeEngine?.resize) {
        this.activeEngine.resize(targetWidth, targetHeight);
      } else {
        this.activeEngine?.onResize?.(targetWidth, targetHeight);
      }

      this.composer.render();
      dataUrl = this.renderer.domElement.toDataURL(mimeType, quality);
    } finally {
      // Canvas encoding can fail (for example after a cross-origin texture).
      // Restoration still has to happen or the live studio remains thumbnail-sized.
      this.renderer.setClearColor(prevClearColor, prevClearAlpha);
      this.scene.background = prevBg;
      this.renderer.setPixelRatio(rendererPixelRatio);
      this.composer.setPixelRatio(composerPixelRatio);
      this.renderer.setSize(rendererSize.x, rendererSize.y, false);
      this.composer.setSize(composerWidth, composerHeight);
      this.camera.aspect = cameraAspect;
      this.camera.updateProjectionMatrix();
      if (this.activeEngine?.resize) {
        this.activeEngine.resize(rendererSize.x, rendererSize.y);
      } else {
        this.activeEngine?.onResize?.(rendererSize.x, rendererSize.y);
      }
    }

    return dataUrl;
  }

  captureThumbnail() {
    return this.renderToDataURL({
      width: 240,
      height: 150,
      mimeType: 'image/jpeg',
      quality: 0.72,
    });
  }

  // Why a snapshot would be refused right now, or null if it would succeed.
  // Exposed so callers can tell the user — a button that silently does nothing
  // is worse than one that explains itself.
  snapshotBlockedReason({ transparent = false, multiplier = 1 } = {}) {
    if (!this.isRecordingClip) return null;
    if (transparent) {
      return 'Stop clip recording before taking a transparent snapshot — the recorded frame has no alpha.';
    }
    if (multiplier > 1) {
      return 'Stop clip recording before taking an upscaled snapshot — while recording, captures are limited to the on-screen resolution.';
    }
    return null;
  }

  captureSnapshot({ transparent = false, multiplier = 1 } = {}) {
    const blocked = this.snapshotBlockedReason({ transparent, multiplier });
    if (blocked) {
      console.warn(blocked);
      return null;
    }
    const dataUrl = this.renderToDataURL({
      width: window.innerWidth * multiplier,
      height: window.innerHeight * multiplier,
      transparent,
      pixelRatio: this.renderer.getPixelRatio(),
    });

    const link = document.createElement('a');
    link.download = `orb-${this.activeEngineType}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();

    return dataUrl;
  }

  dispose() {
    this.stopSequence();
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.clickPulseTracker?.dispose();
    this.pointerTracker?.dispose();
    this.audioInput?.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.handleGridPointer);
    this.clipRecorder?.dispose();
    this.exitGridMode();
    this.controls.dispose();
    this.activeEngine?.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
    this.container.innerHTML = '';
  }
}
