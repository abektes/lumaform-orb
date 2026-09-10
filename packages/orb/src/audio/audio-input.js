// Web Audio wiring for the `audio` modulation source.
//
// Kept apart from audio-level.js so the maths stays testable in Node; everything
// here needs a browser. Failure is always soft — the orb must keep running when
// a microphone is denied or unavailable.

import { createLevelFollower, rmsFromTimeDomain } from './audio-level.js';

const FFT_SIZE = 1024;

export function createAudioInput(options = {}) {
  let context = null;
  let analyser = null;
  let silentOutput = null;
  let buffer = null;
  let stream = null;
  let streamSource = null;
  let oscillator = null;
  let mode = null;
  let requestGeneration = 0;
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

      // Keep the graph pullable while making the test oscillator inaudible.
      silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      analyser.connect(silentOutput).connect(context.destination);
    }
    return context;
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

  function read() {
    if (!analyser || !mode) return 0;
    analyser.getByteTimeDomainData(buffer);
    return follower.push(rmsFromTimeDomain(buffer));
  }

  function stop() {
    requestGeneration += 1;
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
    silentOutput?.disconnect();
    analyser = null;
    silentOutput = null;
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
    get level() {
      return follower.value;
    },
    dispose() {
      stop();
    },
  };
}
