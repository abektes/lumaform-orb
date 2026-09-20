// Which cells render, and what the measurement array should look like.
// Pure: no renderer, no GL, no DOM.

// A rect is drawable when both extents are positive and finite, and coordinates
// are finite numbers. Checking finiteness of x and y is deliberate: custom
// rect factories can return NaN/Infinity under edge-case geometry, which would
// cause WebGL viewport calls to raise INVALID_VALUE and paint over neighbours.
export function isDrawableRect(rect) {
  return (
    !!rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.w) &&
    Number.isFinite(rect.h) &&
    rect.w > 0 &&
    rect.h > 0
  );
}

// Device-pixel readback region for a CSS-pixel rect. Extents are derived from
// the rounded edges rather than rounding the size independently, because
// independent rounding can push the far edge one pixel past the drawing buffer
// and those bytes are undefined.
export function readbackRegion(rect, dpr) {
  const px = Math.round(rect.x * dpr);
  const py = Math.round(rect.y * dpr);
  const pw = Math.max(1, Math.round((rect.x + rect.w) * dpr) - px);
  const ph = Math.max(1, Math.round((rect.y + rect.h) * dpr) - py);
  return { px, py, pw, ph };
}

// The pending-callback state machine, lifted out so its lifecycle is testable.
// - request(cb) while one is pending settles the earlier cb with []
// - flush() delivers everything collected since the last flush and clears
// - settle() delivers [] and clears — this is what dispose() calls
export function createMeasureQueue() {
  let pendingCallback = null;
  let collected = [];

  return {
    request(callback) {
      const stale = pendingCallback;
      pendingCallback = callback;
      collected = [];
      if (stale) {
        stale([]);
      }
    },

    isPending() {
      return pendingCallback !== null;
    },

    collect(buffer) {
      if (pendingCallback) {
        collected.push(buffer);
      }
    },

    flush() {
      if (!pendingCallback) {
        collected = [];
        return;
      }
      const done = pendingCallback;
      const buffers = collected;
      pendingCallback = null;
      collected = [];
      done(buffers);
    },

    settle() {
      if (!pendingCallback) {
        collected = [];
        return;
      }
      const done = pendingCallback;
      pendingCallback = null;
      collected = [];
      done([]);
    },
  };
}
