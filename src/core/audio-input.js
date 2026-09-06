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
      buffer = new Uint8Array(analyser.fftSize);

      // Keep the graph pullable while making the test oscillator inaudible.
      silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      analyser.connect(silentOutput).connect(context.destination);
    }
    return context;
  }

  async function startMic() {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('Microphone capture is not available in this browser.');
      return false;
    }
    if (!ensureContext()) {
      console.warn('Web Audio is not available in this browser.');
      return false;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Browser processing fights the follower and makes the response depend
        // on the browser's guesses rather than on the actual signal.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (context.state === 'suspended') await context.resume();
      streamSource = context.createMediaStreamSource(stream);
      streamSource.connect(analyser);
      mode = 'mic';
      return true;
    } catch (error) {
      console.warn('Microphone access was refused or failed.', error);
      stop();
      return false;
    }
  }

  function startTestTone(frequency = 220) {
    stop();
    if (!ensureContext()) {
      console.warn('Web Audio is not available in this browser.');
      return false;
    }
    context.resume().catch(() => {});
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
