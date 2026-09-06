// Frame-rate tracker + adaptive raymarch quality.
//
// This was the only live export left in shared/postprocessing.js once the demos
// were archived — the studio builds its own composer in core/studio.js — so the
// file was renamed to match what it actually is. The bloom/tone-mapping helpers
// that used to live alongside it are in archive/shared/postprocessing.js.
export function createFpsTracker() {
  let frames = 0;
  let lastTime = performance.now();
  let fps = 60;

  return {
    get fps() {
      return fps;
    },
    tick() {
      frames += 1;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        fps = frames;
        frames = 0;
        lastTime = now;
      }
    },
    getMarchQuality(dpr) {
      if (fps < 40) return 0.55;
      if (fps < 50) return 0.72;
      if (dpr > 1.5) return 0.78;
      return 1.0;
    },
  };
}
