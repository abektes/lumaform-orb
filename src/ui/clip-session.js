export function createClipSession({ studio, host }) {
  let timerId = null;
  let togglePending = false;

  function refresh() {
    if (!studio.isRecordingClip) {
      host.classList.add('hidden');
      clearInterval(timerId);
      timerId = null;
      return;
    }
    host.classList.remove('hidden');
    const seconds = (studio.clipRecorder.elapsedMs / 1000).toFixed(1);
    host.innerHTML =
      `<span class="clip-dot"></span>REC ${seconds}s <span class="clip-hint">V to stop</span>`;
  }

  function download(result) {
    if (!result?.blob || result.blob.size === 0) {
      console.warn('Recording produced no data — was the page visible while recording?');
      return;
    }
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Some browsers begin consuming the object URL after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function toggle() {
    if (togglePending) return;
    togglePending = true;
    try {
      if (studio.isRecordingClip) {
        const result = await studio.stopClip();
        refresh();
        download(result);
        return;
      }
      if (!studio.startClip()) return;
      studio.clipRecorder.onAutoStop = (result) => {
        refresh();
        download(result);
      };
      refresh();
      timerId = setInterval(refresh, 100);
    } finally {
      togglePending = false;
    }
  }

  return {
    mount() {},
    bind() {
      return {
        toggle,
        onKey(e) {
          if (e.code === 'KeyV') {
            e.preventDefault();
            toggle();
            return true;
          }
          return false;
        },
      };
    },
    dispose() {
      clearInterval(timerId);
      timerId = null;
    },
  };
}
