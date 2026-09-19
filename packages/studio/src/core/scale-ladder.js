// Scale ladder — the same orb at five true pixel sizes, side by side.
//
// Framing normalises every engine to the same fraction of the viewport, which
// answers "how much of the frame does it fill" and says nothing about "does it
// still read at 20px". Those are different questions and only the second one
// decides whether a finding can ship as an inline indicator.
//
// Pure maths, no DOM and no Three.js, so it can be tested in Node.

// 256 is the reference most designs are tuned at; 64 is chat-avatar scale and
// 20 is inline-text scale. The two intermediate steps exist so the failure is
// visible as a gradient rather than as a cliff between two extremes.
export const DEFAULT_SCALE_SIZES = [256, 128, 64, 32, 20];

// Equal slots, a square viewport of the requested edge centred in each. Square
// matters: it holds the camera aspect at 1 for every cell, so the only variable
// across the ladder is pixel resolution. Change the aspect too and you are
// comparing two things at once.
export function scaleRects(sizes, width, height) {
  const cols = sizes.length;
  if (!cols) return [];
  const slot = width / cols;

  return sizes.map((size, index) => {
    // Clamped to the slot and to the window: an unclamped 256px cell on a narrow
    // window would render over its neighbour, and you would be judging the wrong
    // orb without any sign that it had happened.
    const edge = Math.max(1, Math.min(Math.floor(size), Math.floor(slot), Math.floor(height)));
    return {
      x: Math.round(index * slot + (slot - edge) / 2),
      // Square and centred, so the bottom-left WebGL origin needs no flip here.
      y: Math.round((height - edge) / 2),
      w: edge,
      h: edge,
    };
  });
}

// Rec.709 luma over sRGB bytes. Strictly this should linearise first, but the
// number is only ever compared against another number produced the same way,
// and skipping it keeps the loop cheap enough to run over five viewports.
function luma(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Two numbers, because there are two distinct ways a small orb fails.
//
// `coverage` catches disappearance: an orb whose marks fall below the visible
// threshold trends to 0 even though the config is unchanged.
// `rms` catches mush: an orb that keeps every pixel lit but loses all internal
// structure trends to 0 contrast at high coverage. Coverage alone would call
// that a success.
export function frameMetrics(pixels, { threshold = 0.06 } = {}) {
  const n = Math.floor(pixels.length / 4);
  if (!n) return { coverage: 0, mean: 0, rms: 0 };

  let lit = 0;
  let sum = 0;
  for (let i = 0; i < n * 4; i += 4) {
    const value = luma(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (value > threshold) lit++;
    sum += value;
  }

  const mean = sum / n;

  // Summed squared deviations, not the algebraic E[x²] - E[x]². On a flat frame
  // those two terms agree to the last bit, so their difference is pure rounding
  // (~1e-16) and Math.sqrt amplifies it to ~1e-8: a frame with no contrast would
  // report contrast. Deviations from the mean cancel exactly instead, and a sum
  // of squares cannot go negative, so sqrt needs no guard.
  let sumSqDev = 0;
  for (let i = 0; i < n * 4; i += 4) {
    const value = luma(pixels[i], pixels[i + 1], pixels[i + 2]);
    sumSqDev += (value - mean) * (value - mean);
  }

  return { coverage: lit / n, mean, rms: Math.sqrt(sumSqDev / n) };
}

export function formatMetric(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '–';
}
