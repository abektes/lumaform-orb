// Async lifecycles that could not tell "ended" or "superseded" from "failed".
// See docs/STATE-MACHINES.md, issue C.
import { createClipRecorder } from '../src/core/clip-recorder.js';
import { OrbStudio } from '../src/core/studio.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

// A MediaRecorder that follows the spec on the point that matters here:
// stop() on an inactive recorder does nothing and fires no event.
class FakeRecorder {
  static isTypeSupported() { return true; }
  constructor() {
    this.state = 'inactive';
    FakeRecorder.instances.push(this);
  }
  start() { this.state = 'recording'; }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    queueMicrotask(() => this.onstop?.());
  }
  // The browser ending the recording on its own, as on an encoder error:
  // error, then the final chunk, then stop.
  failOnItsOwn() {
    this.state = 'inactive';
    this.onerror?.({ error: new Error('encoder') });
    this.ondataavailable?.({ data: new Blob(['frames']) });
    this.onstop?.();
  }
  // An ending whose stop event never arrives.
  vanish() { this.state = 'inactive'; }
}
FakeRecorder.instances = [];
globalThis.window = { MediaRecorder: FakeRecorder };
const canvas = { captureStream: () => ({ getTracks: () => [] }) };
const quiet = (fn) => {
  const warn = console.warn;
  console.warn = () => {};
  try { return fn(); } finally { console.warn = warn; }
};

// --- C1: a recorder that ends on its own hands over its footage and frees the session ---
{
  const recorder = createClipRecorder({ canvas, getEngineName: () => 'nebula' });
  const handed = [];
  recorder.onAutoStop = (result) => handed.push(result);
  ok('recording starts', recorder.start());
  quiet(() => FakeRecorder.instances.at(-1).failOnItsOwn());
  ok('the self-ended recording is handed over', handed.length === 1 && handed[0]?.blob?.size > 0,
    JSON.stringify(handed.map((r) => r?.blob?.size)));
  ok('it is no longer recording', recorder.isRecording === false);
  // Was refused for the rest of the page: "a previous recording is flushing".
  ok('a new recording can start', recorder.start());
  recorder.dispose();
}

// --- C1: a recorder that ends with no stop event does not strand the session ---
{
  const recorder = createClipRecorder({ canvas });
  recorder.start();
  FakeRecorder.instances.at(-1).vanish();
  let settled = false;
  recorder.stop().then(() => { settled = true; });
  await settle();
  // The 30 s guard takes this same path; its promise used to hang forever.
  ok('stopping an already-ended recorder settles', settled);
  ok('and the session is free again', recorder.start());
  recorder.dispose();
}
{
  const recorder = createClipRecorder({ canvas });
  recorder.start();
  FakeRecorder.instances.at(-1).vanish();
  ok('start() recovers a recorder that ended silently', recorder.start());
  recorder.dispose();
}

// --- C1: the ordinary paths are unchanged ---
{
  const recorder = createClipRecorder({ canvas });
  let autoStops = 0;
  recorder.onAutoStop = () => autoStops++;
  recorder.start();
  ok('a second start while recording is refused', recorder.start() === false);
  const result = await recorder.stop();
  ok('a manual stop resolves with a result', !!result?.filename);
  ok('a manual stop does not also fire the auto-stop callback', autoStops === 0);
  recorder.dispose();
}

// --- C2: a superseded audio request reports null, not failure ---
function audioStudio() {
  const pending = {};
  const audioInput = {
    setOptions() {},
    stop() {},
    // The real input resolves a superseded start as false.
    startMic: () => new Promise((resolve) => { pending.mic = resolve; }),
    startTestTone: async () => true,
  };
  const studio = Object.assign(Object.create(OrbStudio.prototype), {
    audioInput,
    audioRequest: 0,
    grid: null,
    modulation: { config: { sources: {} }, levels: [], setAudioLevel(v) { this.levels.push(v); } },
  });
  return { studio, pending };
}
{
  const { studio, pending } = audioStudio();
  const mic = studio.enableAudio('mic');
  const tone = await studio.enableAudio('tone');
  pending.mic(false);
  ok('the later request reports its own result', tone === true);
  // The UI alerted "Could not access the microphone" over a running tone.
  ok('the superseded request reports null', (await mic) === null);
  ok('and does not zero the running source', studio.modulation.levels.length === 0);
}
{
  const { studio, pending } = audioStudio();
  const mic = studio.enableAudio('mic');
  studio.disableAudio();
  pending.mic(false);
  ok('Off during the permission prompt supersedes it', (await mic) === null);
}
{
  const { studio, pending } = audioStudio();
  const mic = studio.enableAudio('mic');
  pending.mic(false);
  ok('a refusal nobody superseded is still reported', (await mic) === false);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
