import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createPointerTracker, createClickPulse } from '@lumaform/orb';
import { createFpsTracker } from '@lumaform/orb';
import { ENGINE_PARAM_DEFINITIONS } from './state.js';
import { createModulationRack, createDefaultModulation } from '@lumaform/orb';
import { DEFAULT_BREADTH } from './variation-grid.js';
import { cameraDistanceForRadius, engineFrameRadius } from '@lumaform/orb';
import { createParamTween } from './param-tween.js';
import { createAudioInput } from './audio-input.js';
import { createSequencePlayer } from './sequence.js';
import { notifyParams, notifyPulse, notifyResize } from '@lumaform/orb';
import { bindGridPointer, gridMethods } from './studio-grid.js';
import { captureMethods } from './studio-capture.js';
import { sequenceMethods } from './studio-sequence.js';

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
      notifyPulse(this.activeEngine);
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

    bindGridPointer(this);

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
      // Overwritten by updateGlobalSettings on the first state sync; kept in step
      // with DEFAULT_GLOBAL_SETTINGS so the very first frame is not brighter than
      // every frame after it.
      0.25, // strength
      0.25, // radius
      0.35  // threshold
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

    // Captured before anything is torn down: exitGridMode clears both.
    const wasGridMode = !!this.grid;
    const wasSweep = this.sweepInfo ? { ...this.sweepInfo } : null;

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
    this.controls.enablePan = true;

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

    // After construction, not before: the distance comes from the engine's own
    // `frame` hint, which does not exist until the factory has returned.
    this.frameActiveEngine();

    this.baseParams = { ...state.engines[type] };
    this.paramDefs = ENGINE_PARAM_DEFINITIONS[type] || {};
    this.lastModulated = {};
    // A tween in flight targets the previous engine's parameters.
    this.paramTween.cancel();

    this.syncModulation(state);
    this.updateGlobalSettings(state.global);
    notifyParams(this.activeEngine, state.engines[type]);
    this.onWindowResize();

    // The grid owns its own engine instances, built from the factory that was
    // active when it was created, and renderFrame returns early whenever a grid
    // exists. Switching engine without rebuilding it therefore left nine stale
    // cells of the previous engine on screen while the new one rendered
    // nowhere — the change looked like it had simply not happened.
    if (wasGridMode) this.rebuildGridForEngine(state, wasSweep);
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
      notifyParams(this.activeEngine, p);
      // After the engine has seen the params, so a size change it reports is read
      // from the updated frame hint rather than the stale one.
      this.reframeForRadiusChange();
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

    notifyParams(this.activeEngine, patch);
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

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
    this.controls.target.set(0, 0, 0);
    this.controls.update();
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

    const offset = this.camera.position.clone().sub(this.controls.target);
    const current = offset.length();
    if (current < 1e-6) return;
    offset.multiplyScalar(cameraDistanceForRadius(radius, this.camera.fov) / current);
    this.camera.position.copy(this.controls.target.clone().add(offset));
    this.controls.update();
  }

  resetCamera() {
    this.camera.fov = 45.0;
    this.frameActiveEngine();
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
        if (Object.keys(patch).length) notifyParams(this.activeEngine, patch);
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
    // Both branches are awaited: startTestTone now resolves the context before
    // reporting success, and an un-awaited promise is truthy, which would report
    // every failure as a success.
    const started = mode === 'tone'
      ? await this.audioInput.startTestTone()
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

function installMethods(ctor, ...bags) {
  for (const bag of bags) {
    Object.defineProperties(ctor.prototype, Object.getOwnPropertyDescriptors(bag));
  }
}

installMethods(OrbStudio, gridMethods, captureMethods, sequenceMethods);
