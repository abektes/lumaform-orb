// The output gain rule is the reason this module exists as pure code.
// Routing a microphone to the speakers is a feedback howl, so `mic` must
// resolve to 0 under every combination of inputs — including a stale `muted`
// flag left over from a previous file session.
import { gainForMode, isSupportedAudioFile, displayFileName } from '../src/audio/audio-transport.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// --- gainForMode: mic is silent unconditionally ---

ok('mic is silent', gainForMode('mic') === 0);
ok('mic is silent when unmuted', gainForMode('mic', { muted: false }) === 0);
ok('mic is silent when muted', gainForMode('mic', { muted: true }) === 0);
ok('tone stays silent as before', gainForMode('tone') === 0);
ok('tone is silent when unmuted', gainForMode('tone', { muted: false }) === 0);
ok('no mode is silent', gainForMode(null) === 0);
ok('unknown mode is silent', gainForMode('wat') === 0);

ok('file is audible', gainForMode('file') === 1);
ok('file is audible when unmuted', gainForMode('file', { muted: false }) === 1);
ok('file is silent when muted', gainForMode('file', { muted: true }) === 0);

// --- isSupportedAudioFile ---

ok('accepts .wav', isSupportedAudioFile('track.wav'));
ok('accepts .mp3', isSupportedAudioFile('track.mp3'));
ok('accepts .m4a', isSupportedAudioFile('track.m4a'));
ok('accepts .mp4 (audio track only)', isSupportedAudioFile('clip.mp4'));
ok('accepts .ogg', isSupportedAudioFile('track.ogg'));
ok('accepts uppercase extensions', isSupportedAudioFile('TRACK.WAV'));
ok('accepts a name with dots', isSupportedAudioFile('my.best.take.wav'));
ok('rejects .txt', !isSupportedAudioFile('notes.txt'));
ok('rejects an empty name', !isSupportedAudioFile(''));
ok('rejects undefined', !isSupportedAudioFile());

// A browser may hand us a correct MIME type with a useless name.
ok('accepts by audio/* MIME', isSupportedAudioFile('blob', 'audio/wav'));
ok('accepts video/mp4 MIME for its audio track', isSupportedAudioFile('blob', 'video/mp4'));
ok('rejects other video MIME', !isSupportedAudioFile('blob', 'video/quicktime'));
ok('rejects unrelated MIME', !isSupportedAudioFile('blob', 'text/plain'));
// Extension wins when the MIME is empty or generic.
ok('falls back to extension when MIME is generic',
  isSupportedAudioFile('track.wav', 'application/octet-stream'));

// --- displayFileName ---

ok('short names pass through', displayFileName('track.wav', 28) === 'track.wav');
ok('exact-length names pass through', displayFileName('x'.repeat(28), 28).length === 28);
{
  const out = displayFileName('a-very-long-track-name-that-keeps-going.wav', 28);
  ok('long names are truncated to max', out.length <= 28, `got ${out.length}: ${out}`);
  ok('long names keep their extension', out.endsWith('.wav'), out);
  ok('long names show an ellipsis', out.includes('…'), out);
}
ok('handles a name with no extension', displayFileName('x'.repeat(40), 20).length <= 20);
ok('handles an empty name', displayFileName('', 28) === '');

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
