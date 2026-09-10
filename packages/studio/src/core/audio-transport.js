// Pure decisions for the file audio source.
//
// Split from audio-input.js for the same reason audio-level.js is: everything
// here runs in Node, so the rules that carry real risk can be tested without a
// browser. audio-input.js keeps the parts that need Web Audio.

// Containers the <audio> element can decode. mp4 and m4a are video/audio
// containers whose audio track we use; any picture they carry is ignored.
const SUPPORTED_EXTENSIONS = [
  '.wav', '.mp3', '.m4a', '.mp4', '.ogg', '.oga', '.opus', '.webm', '.flac', '.aac',
];

export function isSupportedAudioFile(name = '', type = '') {
  const mime = String(type ?? '');
  // A browser may supply a correct MIME type alongside a name like "blob".
  if (mime.startsWith('audio/') || mime === 'video/mp4') return true;
  const lower = String(name ?? '').toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// The output gain for a mode.
//
// Everything that is not 'file' returns 0. That is deliberately a default-deny:
// routing a microphone into the speakers is a feedback howl, and a future mode
// added without thinking about output should be silent rather than loud.
export function gainForMode(mode, { muted = false } = {}) {
  if (mode !== 'file') return 0;
  return muted ? 0 : 1;
}

// Truncate for the panel, keeping the extension visible so the user can still
// tell a .wav from the .mp4 they meant to pick.
export function displayFileName(name = '', max = 28) {
  const s = String(name ?? '');
  if (s.length <= max) return s;
  const dot = s.lastIndexOf('.');
  const ext = dot > 0 && s.length - dot <= 6 ? s.slice(dot) : '';
  const head = Math.max(1, max - ext.length - 1);
  return `${s.slice(0, head)}…${ext}`;
}
