import { notifyParams } from '@lumaform/orb/internal';

export const sequenceMethods = {
  get isPlayingSequence() {
    return this.sequencePlayer.isPlaying;
  },

  // Real milliseconds, not virtualTime: a transition's duration should not
  // change when playback speed does.
  advanceTimeline(delta) {
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
    return tweenDeltaMs;
  },

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
  },

  pauseSequence() {
    this.sequencePlayer.pause();
  },

  resumeSequence() {
    if (!this.currentSequence) return;
    this.sequencePlayer.play();
  },

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
  },

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
  },
};
