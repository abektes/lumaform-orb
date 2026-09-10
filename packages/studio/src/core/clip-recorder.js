// Recording the live canvas to a video file.
//
// Capture, not export: this records the scene already being painted without
// resizing, re-rendering or pausing it.

import { MAX_CLIP_MS, formatClipFilename, pickMimeType } from './clip-format.js';

export function createClipRecorder({ canvas, fps = 60, getEngineName = () => 'orb' } = {}) {
  let session = null;
  let autoStopId = null;
  let lastMimeType = null;
  let disposed = false;

  const mediaRecorderClass = () =>
    typeof window !== 'undefined' ? window.MediaRecorder : undefined;

  const stopTracks = (stream) => {
    for (const track of stream?.getTracks?.() || []) {
      try {
        track.stop();
      } catch {
        // A track may already have ended while the recorder was flushing.
      }
    }
  };

  const clearAutoStop = () => {
    clearTimeout(autoStopId);
    autoStopId = null;
  };

  const supported = () =>
    !disposed &&
    typeof mediaRecorderClass() !== 'undefined' &&
    typeof canvas?.captureStream === 'function';

  function finish(current, result) {
    if (current.settled) return;
    current.settled = true;
    clearAutoStop();
    stopTracks(current.stream);
    current.recorder.ondataavailable = null;
    current.recorder.onstop = null;
    current.recorder.onerror = null;
    if (session === current) session = null;
    current.resolveStop?.(result);
  }

  function requestStop(reason) {
    if (!session) return Promise.resolve(null);
    const current = session;

    if (current.stopPromise) {
      // If the user asks to stop while the 30s guard is flushing, the manual
      // caller owns the result so the auto callback cannot download it twice.
      if (reason === 'manual') current.notifyAutoStop = false;
      return current.stopPromise;
    }

    current.notifyAutoStop = reason === 'auto';
    clearAutoStop();
    const durationMs = Date.now() - current.startedAt;
    current.stopPromise = new Promise((resolve) => {
      current.resolveStop = resolve;
    });

    current.recorder.onstop = () => {
      const blob = new Blob(current.chunks, { type: current.mimeType });
      const result = {
        blob,
        filename: formatClipFilename(getEngineName(), current.mimeType),
        mimeType: current.mimeType,
        durationMs,
      };
      const notifyAutoStop = current.notifyAutoStop;
      finish(current, result);
      if (notifyAutoStop && !disposed) api.onAutoStop?.(result);
    };
    current.recorder.onerror = (event) => {
      console.warn('Clip recording failed while encoding.', event.error || event);
      const notifyAutoStop = current.notifyAutoStop;
      finish(current, null);
      if (notifyAutoStop && !disposed) api.onAutoStop?.(null);
    };

    try {
      current.recorder.stop();
    } catch (err) {
      console.warn('Could not stop clip recording.', err);
      finish(current, null);
    }
    return current.stopPromise;
  }

  const api = {
    onAutoStop: null,

    get isSupported() {
      return supported();
    },
    get isRecording() {
      return session?.recorder.state === 'recording';
    },
    get elapsedMs() {
      return session ? Date.now() - session.startedAt : 0;
    },
    get mimeType() {
      return session?.mimeType || lastMimeType;
    },

    start() {
      if (!supported()) {
        console.warn('Clip recording is not available in this browser.');
        return false;
      }
      // Keep refusing while a previous recording is flushing; otherwise its
      // late events could tear down the new stream.
      if (session) return false;

      const MediaRecorderClass = mediaRecorderClass();
      const mimeType = pickMimeType((type) => MediaRecorderClass.isTypeSupported(type));
      if (!mimeType) {
        console.warn('No supported video codec found for recording.');
        return false;
      }

      let stream = null;
      let recorder = null;
      try {
        stream = canvas.captureStream(fps);
        recorder = new MediaRecorderClass(stream, { mimeType });
        const current = {
          recorder,
          stream,
          mimeType,
          chunks: [],
          startedAt: Date.now(),
          stopPromise: null,
          resolveStop: null,
          notifyAutoStop: false,
          settled: false,
        };
        recorder.ondataavailable = (event) => {
          if (event.data?.size > 0) current.chunks.push(event.data);
        };
        recorder.start(250);
        session = current;
        lastMimeType = mimeType;
      } catch (err) {
        if (recorder && recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch {
            // Constructor/start failure cleanup is best-effort.
          }
        }
        stopTracks(stream);
        console.warn('Could not start clip recording.', err);
        return false;
      }

      autoStopId = setTimeout(() => {
        requestStop('auto');
      }, MAX_CLIP_MS);
      return true;
    },

    stop() {
      return requestStop('manual');
    },

    dispose() {
      disposed = true;
      clearAutoStop();
      if (!session) return;

      const current = session;
      current.notifyAutoStop = false;
      current.recorder.ondataavailable = null;
      current.recorder.onstop = null;
      current.recorder.onerror = null;
      if (current.recorder.state !== 'inactive') {
        try {
          current.recorder.stop();
        } catch {
          // The recorder may already be stopping.
        }
      }
      finish(current, null);
    },
  };

  return api;
}
