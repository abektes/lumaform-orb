// Web Audio wiring for the `audio` modulation source.
//
// Kept apart from audio-level.js so the maths stays testable in Node; everything
// here needs a browser. Failure is always soft — the orb must keep running when
// a microphone is denied or unavailable.

import { createLevelFollower, rmsFromTimeDomain } from './audio-level.js';
import { gainForMode, isSupportedAudioFile } from './audio-transport.js';

const FFT_SIZE = 1024;

export function createAudioInput(options = {}) {
  let context = null;
  let analyser = null;
  let outputGain = null;
  let buffer = null;
  let stream = null;
  let streamSource = null;
  let oscillator = null;
  let mode = null;
  let requestGeneration = 0;
  let mediaEl = null;
  let mediaSource = null;
  let objectUrl = null;
  let fileName = '';
  // Loop and mute are user preferences, so they survive loading a new file.
  // Everything else about a file session is cleared by stop().
  let loop = false;
  let muted = false;
  const follower = createLevelFollower(options);

  function ensureContext() {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    }
    if (!analyser) {
      analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      // Byte time-domain silence centres on 128, but a fresh Uint8Array is all
      // zeros — which this encoding reads as full negative deflection, i.e. rms
      // 1.0. Every read before the analyser has written once therefore reported
      // *maximum* level rather than silence, and with attack 0.5 the follower
      // reached ~1.0 within two frames. Enabling audio slammed every routed
      // parameter to its extreme and then decayed back over ~20 frames.
      buffer = new Uint8Array(analyser.fftSize).fill(128);

      // Was hardcoded to 0 so the test tone stayed inaudible. It is now resolved
      // per mode: a file the user chose should be heard, a microphone must never
      // be, and mute lowers this rather than pausing so the analyser stays fed
      // and the orb keeps reacting silently.
      outputGain = context.createGain();
      outputGain.gain.value = gainForMode(mode, { muted });
      analyser.connect(outputGain).connect(context.destination);
    }
    return context;
  }

  function applyOutputGain() {
    if (outputGain) outputGain.gain.value = gainForMode(mode, { muted });
  }

  async function startMic() {
    stop();
    const generation = requestGeneration;
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('Microphone capture is not available in this browser.');
      return false;
    }
    if (!ensureContext()) {
      console.warn('Web Audio is not available in this browser.');
      return false;
    }

    let nextStream = null;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({
        // Browser processing fights the follower and makes the response depend
        // on the browser's guesses rather than on the actual signal.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (generation !== requestGeneration || !context || context.state === 'closed') {
        nextStream.getTracks().forEach((track) => track.stop());
        return false;
      }
      if (context.state === 'suspended') await context.resume();
      if (generation !== requestGeneration) {
        nextStream.getTracks().forEach((track) => track.stop());
        return false;
      }
      stream = nextStream;
      streamSource = context.createMediaStreamSource(stream);
      streamSource.connect(analyser);
      mode = 'mic';
      return true;
    } catch (error) {
      nextStream?.getTracks().forEach((track) => track.stop());
      if (generation !== requestGeneration) return false;
      console.warn('Microphone access was refused or failed.', error);
      stop();
      return false;
    }
  }

  async function startTestTone(frequency = 220) {
    stop();
    const generation = requestGeneration;
    if (!ensureContext()) {
      console.warn('Web Audio is not available in this browser.');
      return false;
    }

    // Was fire-and-forget with the rejection swallowed, and `true` was returned
    // regardless. Under an autoplay policy the context stays suspended, the
    // oscillator never advances, the analyser reports silence forever — and the
    // UI still lit the button as though the tone were running. startMic already
    // awaited its resume; this path did not.
    try {
      if (context.state === 'suspended') await context.resume();
    } catch (error) {
      console.warn('Could not start the audio context for the test tone.', error);
      stop();
      return false;
    }
    if (generation !== requestGeneration || !context || context.state === 'closed') return false;
    if (context.state !== 'running') {
      console.warn('Audio context did not start; a user gesture may be required.');
      stop();
      return false;
    }

    oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.connect(analyser);
    oscillator.start();
    mode = 'tone';
    return true;
  }

  async function startFile(file) {
    stop();
    const generation = requestGeneration;
    if (!file) return false;
    if (!isSupportedAudioFile(file.name, file.type)) {
      console.warn('Unsupported audio file:', file?.name);
      return false;
    }
    if (!ensureContext()) {
      console.warn('Web Audio is not available in this browser.');
      return false;
    }

    objectUrl = URL.createObjectURL(file);
    mediaEl = new Audio();
    mediaEl.src = objectUrl;
    mediaEl.loop = loop;

    // A file the browser cannot decode reports through the error event rather
    // than by throwing, so both outcomes are awaited as one.
    const ready = await new Promise((resolve) => {
      mediaEl.addEventListener('loadedmetadata', () => resolve(true), { once: true });
      mediaEl.addEventListener('error', () => resolve(false), { once: true });
      mediaEl.load();
    });

    if (!ready || generation !== requestGeneration || !context || context.state === 'closed') {
      if (generation === requestGeneration) stop();
      return false;
    }

    mediaSource = context.createMediaElementSource(mediaEl);
    mediaSource.connect(analyser);
    fileName = file.name;
    mode = 'file';
    applyOutputGain();
    return true;
  }

  // Separate from startFile because a file picker can outlive the gesture that
  // opened it; resuming the context here keeps it inside a fresh click.
  async function playFile() {
    if (mode !== 'file' || !mediaEl || !context) return false;
    try {
      if (context.state === 'suspended') await context.resume();
    } catch (error) {
      console.warn('Could not start the audio context for playback.', error);
      return false;
    }
    if (context.state !== 'running') {
      console.warn('Audio context did not start; a user gesture may be required.');
      return false;
    }
    try {
      await mediaEl.play();
    } catch (error) {
      console.warn('Playback was refused by the browser.', error);
      return false;
    }
    return true;
  }

  // Transport stop, not teardown: the graph stays built and mode stays 'file',
  // so the level decays to 0 on its own because silence reads as rms 0.
  function stopFilePlayback() {
    if (!mediaEl) return;
    mediaEl.pause();
    mediaEl.currentTime = 0;
  }

  function setLoop(value) {
    loop = !!value;
    if (mediaEl) mediaEl.loop = loop;
  }

  function setMuted(value) {
    muted = !!value;
    applyOutputGain();
  }

  function read() {
    if (!analyser || !mode) return 0;
    analyser.getByteTimeDomainData(buffer);
    return follower.push(rmsFromTimeDomain(buffer));
  }

  function stop() {
    requestGeneration += 1;
    if (mediaEl) {
      mediaEl.pause();
      mediaEl.removeAttribute('src');
      mediaEl.load();
    }
    mediaSource?.disconnect();
    mediaSource = null;
    mediaEl = null;
    if (objectUrl) {
      // Without this the blob is pinned for the lifetime of the page.
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    fileName = '';
    streamSource?.disconnect();
    streamSource = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (oscillator) {
      try {
        oscillator.stop();
      } catch {
        // Stopping an already-ended oscillator is harmless.
      }
      oscillator.disconnect();
      oscillator = null;
    }
    analyser?.disconnect();
    outputGain?.disconnect();
    analyser = null;
    outputGain = null;
    buffer = null;
    if (context) {
      context.close().catch(() => {});
      context = null;
    }
    mode = null;
    follower.reset();
  }

  return {
    startMic,
    startTestTone,
    startFile,
    playFile,
    stopFilePlayback,
    setLoop,
    setMuted,
    read,
    stop,
    setOptions(partial) {
      follower.setOptions(partial);
    },
    get isActive() {
      return mode !== null;
    },
    get mode() {
      return mode;
    },
    get isPlaying() {
      return mode === 'file' && !!mediaEl && !mediaEl.paused;
    },
    get fileName() {
      return fileName;
    },
    get loop() {
      return loop;
    },
    get muted() {
      return muted;
    },
    // The gain actually applied to the speakers, read from the live node rather
    // than recomputed. Makes the one safety-critical property — a microphone is
    // never audible — observable at runtime instead of inferred.
    get outputLevel() {
      return outputGain ? outputGain.gain.value : 0;
    },
    get level() {
      return follower.value;
    },
    dispose() {
      stop();
    },
  };
}
