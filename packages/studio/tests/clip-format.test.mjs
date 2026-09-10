import {
  MIME_CANDIDATES,
  MAX_CLIP_MS,
  pickMimeType,
  extensionFor,
  formatClipFilename,
} from '../src/core/clip-format.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// --- candidates ---
ok('vp9 is preferred first', MIME_CANDIDATES[0] === 'video/webm;codecs=vp9');
ok('webm appears before mp4',
  MIME_CANDIDATES.findIndex((m) => m.startsWith('video/webm')) < MIME_CANDIDATES.findIndex((m) => m.startsWith('video/mp4')));
ok('max clip length is 30s', MAX_CLIP_MS === 30_000);

// --- pickMimeType ---
ok('picks the best supported', pickMimeType(() => true) === 'video/webm;codecs=vp9');
ok('falls back down the list',
  pickMimeType((t) => t === 'video/webm;codecs=vp8') === 'video/webm;codecs=vp8');
ok('falls back to plain webm',
  pickMimeType((t) => t === 'video/webm') === 'video/webm');
ok('falls back to mp4 when that is all there is',
  pickMimeType((t) => t === 'video/mp4') === 'video/mp4');
ok('returns null when nothing is supported', pickMimeType(() => false) === null);
ok('tolerates a throwing capability check', (() => {
  try { return pickMimeType(() => { throw new Error('nope'); }) === null; } catch { return false; }
})());
ok('honours a custom candidate list',
  pickMimeType((t) => t === 'video/x-test', ['video/x-test']) === 'video/x-test');

// --- extensionFor ---
ok('webm extension', extensionFor('video/webm;codecs=vp9') === 'webm');
ok('mp4 extension', extensionFor('video/mp4') === 'mp4');
ok('null defaults to webm', extensionFor(null) === 'webm');
ok('unknown defaults to webm', extensionFor('video/ogg') === 'webm');

// --- formatClipFilename ---
const d = new Date(Date.UTC(2026, 8, 6, 14, 5, 9));
const name = formatClipFilename('quantum', 'video/webm;codecs=vp9', d);
ok('starts with the engine', name.startsWith('orb-quantum-'), name);
ok('ends with the extension', name.endsWith('.webm'), name);
ok('has no spaces or colons', !/[\s:]/.test(name), name);
ok('embeds a sortable timestamp', /orb-quantum-\d{8}-\d{6}\.webm/.test(name), name);
ok('mp4 gets an mp4 name', formatClipFilename('hopf', 'video/mp4', d).endsWith('.mp4'));
ok('missing engine falls back', formatClipFilename(undefined, 'video/webm', d).startsWith('orb-unknown-'));
ok('two clips a second apart differ',
  formatClipFilename('q', 'video/webm', new Date(Date.UTC(2026, 8, 6, 14, 5, 9))) !==
  formatClipFilename('q', 'video/webm', new Date(Date.UTC(2026, 8, 6, 14, 5, 10))));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
