// The exploration instrument: a runtime, plus the four things only an
// instrument needs — the variation grid, clip capture, rehearsal playback and
// param tweening.
//
// Everything here either overrides a hook OrbRuntime declares or adds a method
// the runtime does not have. If you find yourself wanting the runtime to know
// about something in this file, add a hook instead — a runtime that reaches
// into the grid breaks for every consumer who is not this studio.

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
  }

  // Travel from the current base to `targetParams`. Passing durationMs 0 is a
  // hard cut, which is what A/B did before transitions existed.
  tweenTo(targetParams, { durationMs = 400, easing = 'easeOut' } = {}) {
    // A/B applied its target to state before asking for this tween, so the
    // rehearsal it supersedes must not reconcile over that edit.
    this.onEngineWillChange();

    if (durationMs <= 0) {
      Object.assign(this.baseParams, targetParams);
      this.paramTween.cancel();
      return;
    }
    this.paramTween.start({ ...this.baseParams }, targetParams, this.paramDefs, { durationMs, easing });
  }

  // A refused microphone is a normal outcome, not an error.
  async enableAudio(mode = 'mic') {
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
