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
    //
    // Tension: at window widths under ~5px, slot < 1px so Math.max(1, ...) makes
    // adjacent rungs overlap. The floor is required so degenerate size requests
    // (such as scaleRects([0])) still produce drawable rects. Sub-5px windows do
    // not occur in practice (responsive breakpoints are 1280/900px and canvas
    // fills the window), so the floor stands.
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
//
// Alpha is intentionally omitted because the renderer currently clears to an
// opaque background colour. If transparent canvas backgrounds are introduced,
// luma should pre-multiply by (a / 255) so transparent white does not read as ink.
function luma(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Helper: resolve plausible (w, h) dimensions for a buffer of length bytes.
// Ladder cells are square in CSS pixels, but at fractional DPR subpixel rounding
// can make device pixel width and height differ by at most 1 (pw * ph * 4).
function bufferDimensions(length) {
  const p = Math.floor(length / 4);
  if (!p) return [];
  const s = Math.round(Math.sqrt(p));
  if (s * s === p) return [{ w: s, h: s }];
  const k = Math.floor(Math.sqrt(p));
  if (k * (k + 1) === p) {
    return [{ w: k, h: k + 1 }, { w: k + 1, h: k }];
  }
  return [];
}

// Area-average downscale of the luma channel. `pixels` is RGBA bytes for an
// image of `size` device pixels (number for square, or { w, h }); returns
// targetSize luma values in 0..1, row-major, same orientation as the input.
export function downscaleLuma(pixels, size, targetSize) {
  const srcW = typeof size === 'number' ? size : size?.w;
  const srcH = typeof size === 'number' ? size : size?.h;
  const dstW = typeof targetSize === 'number' ? targetSize : targetSize?.w;
  const dstH = typeof targetSize === 'number' ? targetSize : targetSize?.h;

  if (!srcW || !srcH || !dstW || !dstH || dstW > srcW || dstH > srcH || pixels.length < srcW * srcH * 4) {
    // Upscaling is unsupported: the ladder only downscales the reference to
    // compare against smaller rungs. Upscaling would synthesize detail.
    return new Float64Array(0);
  }

  const out = new Float64Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  const area = scaleX * scaleY;

  for (let ty = 0; ty < dstH; ty++) {
    const sy0 = ty * scaleY;
    const sy1 = (ty + 1) * scaleY;
    const iyMin = Math.floor(sy0);
    const iyMax = Math.min(srcH, Math.ceil(sy1));

    for (let tx = 0; tx < dstW; tx++) {
      const sx0 = tx * scaleX;
      const sx1 = (tx + 1) * scaleX;
      const ixMin = Math.floor(sx0);
      const ixMax = Math.min(srcW, Math.ceil(sx1));

      let sum = 0;
      for (let iy = iyMin; iy < iyMax; iy++) {
        const yWeight = Math.min(sy1, iy + 1) - Math.max(sy0, iy);
        const rowOffset = iy * srcW * 4;
        for (let ix = ixMin; ix < ixMax; ix++) {
          const xWeight = Math.min(sx1, ix + 1) - Math.max(sx0, ix);
          const idx = rowOffset + ix * 4;
          const val = luma(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
          sum += val * (xWeight * yWeight);
        }
      }
      out[ty * dstW + tx] = sum / area;
    }
  }

  return out;
}

// Mean luma of the rung over mean luma of the reference. 1 = ink scaling
// cleanly, <1 = marks dropping out, >1 = marks crowding. NaN if the reference
// is blank or either input is empty.
export function inkRetention(rungPixels, referencePixels) {
  if (!rungPixels?.length || !referencePixels?.length) return NaN;
  const refMean = frameMetrics(referencePixels).mean;
  if (refMean === 0 || !Number.isFinite(refMean)) return NaN;
  const rungMean = frameMetrics(rungPixels).mean;
  return rungMean / refMean;
}

// Normalised RMS difference between a rung and the ideal downscale of the
// reference. Returns 0 for a perfect scale, higher for lost structure, NaN when
// either input is empty or the reference is smaller than the rung.
//
// A perfect 0.0 divergence is unattainable in practice because antialiasing
// differs across resolutions; the number is comparative across rungs and
// configs, never absolute.
export function structuralDivergence(referencePixels, rungPixels) {
  if (!referencePixels?.length || !rungPixels?.length) return NaN;

  const refCandidates = bufferDimensions(referencePixels.length);
  const rungCandidates = bufferDimensions(rungPixels.length);
  if (!refCandidates.length || !rungCandidates.length) return NaN;

  let bestDiv = Infinity;

  for (const refDim of refCandidates) {
    for (const rungDim of rungCandidates) {
      if (refDim.w < rungDim.w || refDim.h < rungDim.h) continue;

      const ideal = downscaleLuma(referencePixels, refDim, rungDim);
      if (!ideal.length) continue;

      const n = rungDim.w * rungDim.h;
      let sumSqDiff = 0;
      for (let i = 0; i < n; i++) {
        const idx = i * 4;
        const actual = luma(rungPixels[idx], rungPixels[idx + 1], rungPixels[idx + 2]);
        const diff = actual - ideal[i];
        sumSqDiff += diff * diff;
      }

      const div = Math.sqrt(sumSqDiff / n);
      if (div < bestDiv) bestDiv = div;
    }
  }

  return Number.isFinite(bestDiv) ? bestDiv : NaN;
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
