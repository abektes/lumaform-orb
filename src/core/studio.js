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
import { createVariationGrid } from './variation-grid.js';
import { isSweepable, sweepValues } from './sweep.js';

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
    this.onGridPromote = null;
    this.sweepInfo = null;

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
      this.grid.populate(this.gridRadius, this.gridSections);
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

  // Modulation lives in app state so it round-trips through export and presets.
  // Called from both setEngine and updateParameters so the rack always reflects
  // whatever the Motion Lab last wrote.
  syncModulation(state) {
    if (state?.modulation) this.modulation.setConfig(state.modulation);
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

    // Modulation is evaluated against the *previous* virtualTime, then its tempo
    // multiplier is integrated into the next step. Integrating (rather than
    // assigning a rate) is what lets tempo hesitate and accelerate without the
    // geometry jumping — engines compute angle as `time * rate`, so a rate that
    // changes mid-flight would retroactively rewrite the accumulated angle.
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

  enterGridMode(state, { cols = 3, rows = 3, radius = 0.25, sections = null } = {}) {
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
    this.grid.populate(radius, sections);
    return this.grid;
  }

  // A sweep is the variation grid with a deterministic ramp instead of mutation:
  // one row, N cells, one parameter walked from min to max. It reuses this.grid
  // so grid mode's render branch, exit path and pointer handling all apply.
  enterSweepMode(state, { paramKey, steps = 5 } = {}) {
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

  reseedGrid({ radius, sections } = {}) {
    if (!this.grid) return;
    if (radius !== undefined) this.gridRadius = radius;
    if (sections !== undefined) this.gridSections = sections;
    this.grid.populate(this.gridRadius, this.gridSections);
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

  captureSnapshot({ transparent = false, multiplier = 1 } = {}) {
    const origWidth = window.innerWidth;
    const origHeight = window.innerHeight;
    const targetWidth = Math.round(origWidth * multiplier);
    const targetHeight = Math.round(origHeight * multiplier);

    const prevClearColor = new THREE.Color();
    this.renderer.getClearColor(prevClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();
    const prevBg = this.scene.background;

    if (transparent) {
      this.renderer.setClearColor(0x000000, 0);
      this.scene.background = null;
    }

    // Temporarily resize
    this.renderer.setSize(targetWidth, targetHeight, false);
    this.composer.setSize(targetWidth, targetHeight);
    this.camera.aspect = targetWidth / targetHeight;
    this.camera.updateProjectionMatrix();

    if (this.activeEngine?.resize) {
      this.activeEngine.resize(targetWidth, targetHeight);
    }

    // Render snapshot
    this.composer.render();
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    // Restore
    this.renderer.setClearColor(prevClearColor, prevClearAlpha);
    this.scene.background = prevBg;
    this.renderer.setSize(origWidth, origHeight, false);
    this.composer.setSize(origWidth, origHeight);
    this.camera.aspect = origWidth / origHeight;
    this.camera.updateProjectionMatrix();

    if (this.activeEngine?.resize) {
      this.activeEngine.resize(origWidth, origHeight);
    }

    // Trigger download
    const link = document.createElement('a');
    link.download = `orb-${this.activeEngineType}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();

    return dataUrl;
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.clickPulseTracker?.dispose();
    this.pointerTracker?.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.handleGridPointer);
    this.exitGridMode();
    this.controls.dispose();
    this.activeEngine?.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
    this.container.innerHTML = '';
  }
}
