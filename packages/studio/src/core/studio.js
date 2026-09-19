// The exploration instrument: a runtime, plus the four things only an
// instrument needs — the variation grid, clip capture, rehearsal playback and
// param tweening.
//
// Nothing here overrides a runtime method. The studio owns the frame loop and
// calls the runtime's primitives — advance(), render(), mountEngine() — with
// its own work interleaved. That direction matters: the runtime must never
// reach into the grid or the rehearsal player, because no other consumer has
// them, and a hook that only one subclass implements is not an extension point.

import { OrbRuntime } from '@lumaform/orb';
import { createAudioInput } from '@lumaform/orb/audio';
import { createParamTween } from './param-tween.js';
import { createSequencePlayer } from './sequence.js';
import { DEFAULT_BREADTH } from './variation-grid.js';
import { bindGridPointer, gridMethods } from './studio-grid.js';
import { captureMethods } from './studio-capture.js';
import { sequenceMethods } from './studio-sequence.js';

export class OrbStudio extends OrbRuntime {
  constructor(containerElement, options = {}) {
    super(containerElement, options);

    // Variation grid. Click promotes a cell to parent and re-breeds;
    // shift-click marks it for export instead.
    this.grid = null;
    this.gridRadius = 0.25;
    this.gridSections = null;
    this.gridBreadth = DEFAULT_BREADTH;
    // null = follow the section lock: locking mutation to colours also holds
    // the motion character still, which is what made a colour comparison
    // readable. The HUD sends an explicit boolean once the user touches the
    // Patch chip.
    this.gridBreedPatch = null;
    this.onGridPromote = null;
    this.sweepInfo = null;
    this.scaleInfo = null;

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

    // Created lazily: constructing an AudioContext before a user gesture is
    // wasteful and some browsers start it suspended anyway.
    this.audioInput = null;

    bindGridPointer(this);

    // The studio drives the loop; the runtime no longer owns one.
    this.animate = this.renderFrame.bind(this);
    this.rafId = requestAnimationFrame(this.animate);
  }

  // One studio frame. The order is load-bearing: rehearsal and tweening move
  // baseParams first so the rack evaluates against this frame's base, then the
  // runtime advances time and modulation, and only then does anything draw.
  renderFrame() {
    this.rafId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    this.fpsTracker.tick();

    this.advanceTimeline(delta);
    this.advance(delta);

    // Grid mode bypasses the composer: bloom is a full-screen pass and would
    // bleed across cell boundaries, so cells render straight to the framebuffer.
    if (this.grid) {
      if (this.audioSource?.isActive) this.grid.setAudioLevel(this.modulation.audioLevel);
      this.grid.render(
        this.virtualTime,
        this.isPaused ? 0 : delta * this.timeScale,
        window.innerWidth,
        window.innerHeight
      );
      return;
    }

    this.render(delta);
  }

  // The studio's own engine swap, in terms of its store. This is not an
  // override — the runtime has no setEngine — so the policy that a direct edit
  // supersedes an in-flight rehearsal lives here, where it belongs, instead of
  // firing on every runtime parameter write.
  setEngine(type, state) {
    // Captured before anything is torn down: exitGridMode clears all three.
    const wasGridMode = !!this.grid;
    const wasSweep = this.sweepInfo ? { ...this.sweepInfo } : null;
    const wasScale = this.scaleInfo ? { ...this.scaleInfo } : null;
    this.supersedeTransition();

    const swapped = this.mountEngine(type, {
      params: state.engines[type],
      global: state.global,
      modulation: state.modulation,
    });

    // Only on a real swap. The grid holds engine instances built from whichever
    // factory was active when it was created, so re-entering it after a no-op
    // would rebuild cells that were never invalidated.
    if (swapped && wasGridMode) this.rebuildGridForEngine(state, wasSweep, wasScale);
  }

  updateParameters(state) {
    this.supersedeTransition();
    this.applyParams({
      params: state.engines[this.activeEngineType],
      global: state.global,
      modulation: state.modulation,
    });
  }

  // Stops the studio's loop, tears down what only the studio has, then lets the
  // runtime release the renderer. The order matters: the grid disposes cells
  // through a context the runtime is about to drop.
  dispose() {
    cancelAnimationFrame(this.rafId);
    this.disposeStudio();
    super.dispose();
  }

  // A direct edit, import or preset selection supersedes an in-flight rehearsal
  // or tween. The caller has already written its desired value into state, so
  // stopping the rehearsal must not replace that edit with the intermediate
  // visual value — hence reconcile: false.
  supersedeTransition() {
    if (this.currentSequence && !this.applyingSequenceStep) {
      this.stopSequence({ reconcile: false });
    }
    this.paramTween.cancel();
  }

  // Travel from the current base to `targetParams`. Passing durationMs 0 is a
  // hard cut, which is what A/B did before transitions existed.
  tweenTo(targetParams, { durationMs = 400, easing = 'easeOut' } = {}) {
    // A/B applied its target to state before asking for this tween, so the
    // rehearsal it supersedes must not reconcile over that edit.
    this.supersedeTransition();

    if (durationMs <= 0) {
      Object.assign(this.baseParams, targetParams);
      this.paramTween.cancel();
      return;
    }
    this.paramTween.start({ ...this.baseParams }, targetParams, this.paramDefs, { durationMs, easing });
  }

  // A refused microphone is a normal outcome, not an error.
  async enableAudio(mode = 'mic', file = null) {
    const audio = this.modulation.config.sources?.audio1 || {};
    const options = { attack: audio.attack ?? 0.5, release: audio.release ?? 0.12 };

    if (!this.audioInput) {
      this.audioInput = createAudioInput(options);
      // The frame loop reads audioSource. The runtime accepts any level source
      // and knows nothing about microphones.
      this.setAudioSource(this.audioInput);
    } else {
      this.audioInput.setOptions(options);
    }

    // Both branches are awaited: startTestTone resolves the context before
    // reporting success, and an un-awaited promise is truthy, which would
    // report every failure as a success.
    const started = mode === 'tone'
      ? await this.audioInput.startTestTone()
      : mode === 'file'
        ? await this.audioInput.startFile(file)
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
}

function installMethods(ctor, ...bags) {
  for (const bag of bags) {
    Object.defineProperties(ctor.prototype, Object.getOwnPropertyDescriptors(bag));
  }
}

installMethods(OrbStudio, gridMethods, captureMethods, sequenceMethods);
