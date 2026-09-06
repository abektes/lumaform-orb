// Codec preference and filenames for recorded clips.
//
// Pure — the capability check is injected rather than reaching for
// MediaRecorder.isTypeSupported, so this can be tested in Node.

// VP9 first for quality per byte; plain webm covers browsers that support the
// container but report codec strings differently; mp4 last because support is
// patchy and inconsistent across platforms.
export const MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

// A recording nobody remembers to stop turns into a several-hundred-megabyte
// blob held in memory. This is a capture aid; 30 seconds is more than enough to
// judge a motion candidate.
export const MAX_CLIP_MS = 30_000;

export function pickMimeType(isSupported, candidates = MIME_CANDIDATES) {
  for (const type of candidates) {
    try {
      if (isSupported(type)) return type;
    } catch {
      // A capability check that throws is a capability that is not there.
      return null;
    }
  }
  return null;
}

export function extensionFor(mimeType) {
  return typeof mimeType === 'string' && mimeType.includes('mp4') ? 'mp4' : 'webm';
}

export function formatClipFilename(engine, mimeType, date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `orb-${engine || 'unknown'}-${stamp}.${extensionFor(mimeType)}`;
}
