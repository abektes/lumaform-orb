# Audio File Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user load a local audio file and drive the orb's modulation rack with it, with play/stop/loop/mute controls in the Motion Lab panel.

**Architecture:** Add a third `'file'` mode to the existing `createAudioInput()` factory in `src/core/audio-input.js`, sourced from an `<audio>` element wired through `createMediaElementSource()` into the analyser that already exists. Pure decision logic (output gain per mode, file-type acceptance, filename truncation) lives in a new Node-testable module. The Motion Lab panel gains a `File` button and a conditional transport row.

**Tech Stack:** Vanilla JS ES modules, Web Audio API, Vite 5. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-11-audio-file-input-design.md`

## Global Constraints

- 2-space indent, single quotes, semicolons. Comments explain **why**, not what.
- No new runtime dependencies. Runtime deps stay `three` and `shiki`.
- Tests are plain Node scripts in `tests/`, no framework, using an `ok(name, condition, extra)` helper and `process.exit(failures ? 1 : 0)`.
- `npx vite build` must pass, and every `tests/*.test.mjs` must pass.
- No `src/` file may exceed **1000 lines** (`tests/file-size.test.mjs`). Current: `audio-input.js` 182, `studio-motion-lab.js` 349.
- **Every CSS class emitted in UI markup must have a matching CSS rule**, or `tests/css-hygiene.test.mjs` fails.
- Controls must declare their own `background` and `color`, disabled states included. `.btn-sm` already does this via the `:not()` chain at `src/styles/inspector.css:529` — reuse it rather than adding button CSS.
- Audio failures are always soft: log or alert, never throw, and the orb keeps running.
- The chosen file is never uploaded, never serialized, and does not survive a reload.

---

### Task 1: Pure transport helpers

**Files:**
- Create: `src/core/audio-transport.js`
- Test: `tests/audio-transport.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `gainForMode(mode: string|null, opts?: { muted?: boolean }) -> number` (0 or 1)
  - `isSupportedAudioFile(name?: string, type?: string) -> boolean`
  - `displayFileName(name?: string, max?: number) -> string`

- [ ] **Step 1: Write the failing test**

Create `tests/audio-transport.test.mjs`:

```js
// The output gain rule is the reason this module exists as pure code.
// Routing a microphone to the speakers is a feedback howl, so `mic` must
// resolve to 0 under every combination of inputs — including a stale `muted`
// flag left over from a previous file session.
import { gainForMode, isSupportedAudioFile, displayFileName } from '../src/core/audio-transport.js';

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/audio-transport.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/core/audio-transport.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/audio-transport.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/audio-transport.test.mjs`
Expected: every line `PASS`, final line `all passed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/audio-transport.js tests/audio-transport.test.mjs
git commit -m "Add pure transport helpers for the file audio source"
```

---

### Task 2: `'file'` mode in the audio input

**Files:**
- Modify: `src/core/audio-input.js` (imports at line 7; `silentOutput` at lines 14, 41-43, 149-151; `stop()`; the returned object at line 161)
- Modify: `src/core/studio.js` (`enableAudio`, around line 498)

**Interfaces:**
- Consumes: `gainForMode`, `isSupportedAudioFile` from Task 1.
- Produces, on the object returned by `createAudioInput()`:
  - `startFile(file: File) -> Promise<boolean>`
  - `playFile() -> Promise<boolean>`
  - `stopFilePlayback() -> void`
  - `setLoop(value: boolean) -> void`
  - `setMuted(value: boolean) -> void`
  - getters `isPlaying: boolean`, `fileName: string`, `loop: boolean`, `muted: boolean`
- Produces on `OrbStudio`: `enableAudio(mode?: string, file?: File|null) -> Promise<boolean>`

- [ ] **Step 1: Add the import and the new module state**

In `src/core/audio-input.js`, change the import block at the top:

```js
import { createLevelFollower, rmsFromTimeDomain } from './audio-level.js';
import { gainForMode, isSupportedAudioFile } from './audio-transport.js';
```

Then rename the `silentOutput` declaration (line 14) and add file state beside it:

```js
  let outputGain = null;
  let mediaEl = null;
  let mediaSource = null;
  let objectUrl = null;
  let fileName = '';
  // Loop and mute are user preferences, so they survive loading a new file.
  // Everything else about a file session is cleared by stop().
  let loop = false;
  let muted = false;
```

- [ ] **Step 2: Rewire the output node**

Replace the `silentOutput` block inside `ensureContext()` (lines 41-43) with:

```js
      // Was hardcoded to 0 so the test tone stayed inaudible. It is now resolved
      // per mode: a file the user chose should be heard, a microphone must never
      // be, and mute lowers this rather than pausing so the analyser stays fed
      // and the orb keeps reacting silently.
      outputGain = context.createGain();
      outputGain.gain.value = gainForMode(mode, { muted });
      analyser.connect(outputGain).connect(context.destination);
```

Add this helper immediately after `ensureContext()`:

```js
  function applyOutputGain() {
    if (outputGain) outputGain.gain.value = gainForMode(mode, { muted });
  }
```

- [ ] **Step 3: Add `startFile` and the transport functions**

Insert after `startTestTone()`:

```js
  async function startFile(file) {
    stop();
    const generation = requestGeneration;
    if (!file) return false;
    if (!isSupportedAudioFile(file.name, file.type)) {
      console.warn('Unsupported audio file:', file?.name);
      return false;
    }
    if (!ensureContext()) {
      console.warn('Web Audio is not available in this browser.');
      return false;
    }

    objectUrl = URL.createObjectURL(file);
    mediaEl = new Audio();
    mediaEl.src = objectUrl;
    mediaEl.loop = loop;

    // A file the browser cannot decode reports through the error event rather
    // than by throwing, so both outcomes are awaited as one.
    const ready = await new Promise((resolve) => {
      mediaEl.addEventListener('loadedmetadata', () => resolve(true), { once: true });
      mediaEl.addEventListener('error', () => resolve(false), { once: true });
      mediaEl.load();
    });

    if (!ready || generation !== requestGeneration || !context || context.state === 'closed') {
      if (generation === requestGeneration) stop();
      return false;
    }

    mediaSource = context.createMediaElementSource(mediaEl);
    mediaSource.connect(analyser);
    fileName = file.name;
    mode = 'file';
    applyOutputGain();
    return true;
  }

  // Separate from startFile because a file picker can outlive the gesture that
  // opened it; resuming the context here keeps it inside a fresh click.
  async function playFile() {
    if (mode !== 'file' || !mediaEl || !context) return false;
    try {
      if (context.state === 'suspended') await context.resume();
    } catch (error) {
      console.warn('Could not start the audio context for playback.', error);
      return false;
    }
    if (context.state !== 'running') {
      console.warn('Audio context did not start; a user gesture may be required.');
      return false;
    }
    try {
      await mediaEl.play();
    } catch (error) {
      console.warn('Playback was refused by the browser.', error);
      return false;
    }
    return true;
  }

  // Transport stop, not teardown: the graph stays built and mode stays 'file',
  // so the level decays to 0 on its own because silence reads as rms 0.
  function stopFilePlayback() {
    if (!mediaEl) return;
    mediaEl.pause();
    mediaEl.currentTime = 0;
  }

  function setLoop(value) {
    loop = !!value;
    if (mediaEl) mediaEl.loop = loop;
  }

  function setMuted(value) {
    muted = !!value;
    applyOutputGain();
  }
```

- [ ] **Step 4: Extend `stop()` to tear down the file source**

Inside `stop()`, immediately after `requestGeneration += 1;`, add:

```js
    if (mediaEl) {
      mediaEl.pause();
      mediaEl.removeAttribute('src');
      mediaEl.load();
    }
    mediaSource?.disconnect();
    mediaSource = null;
    mediaEl = null;
    if (objectUrl) {
      // Without this the blob is pinned for the lifetime of the page.
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    fileName = '';
```

Then replace the two existing `silentOutput` lines further down with:

```js
    outputGain?.disconnect();
    outputGain = null;
```

- [ ] **Step 5: Export the new surface**

In the returned object (starting line 161), add `startFile`, `playFile`, `stopFilePlayback`, `setLoop`, `setMuted` beside `startMic`, and add these getters beside the existing `mode` getter:

```js
    get isPlaying() {
      return mode === 'file' && !!mediaEl && !mediaEl.paused;
    },
    get fileName() {
      return fileName;
    },
    get loop() {
      return loop;
    },
    get muted() {
      return muted;
    },
```

- [ ] **Step 6: Route file mode through the studio**

In `src/core/studio.js`, change the `enableAudio` signature and its dispatch:

```js
  async enableAudio(mode = 'mic', file = null) {
```

and replace the `const started = ...` ternary with:

```js
    const started = mode === 'tone'
      ? await this.audioInput.startTestTone()
      : mode === 'file'
        ? await this.audioInput.startFile(file)
        : await this.audioInput.startMic();
```

- [ ] **Step 7: Verify nothing regressed**

Run: `npx vite build`
Expected: `✓ built in …`, no errors.

Run: `for t in tests/*.test.mjs; do node "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done`
Expected: only `done` — no `FAIL` lines.

- [ ] **Step 8: Commit**

```bash
git add src/core/audio-input.js src/core/studio.js
git commit -m "Add a file mode to the audio input"
```

---

### Task 3: Motion Lab controls

**Files:**
- Modify: `src/ui/studio-motion-lab.js` (imports at lines 1-9; the Audio Input markup at lines 117-123; listeners near lines 192-221)
- Modify: `src/styles/explore.css` (after the `.audio-meter-fill` rule, which ends around line 342)

**Interfaces:**
- Consumes: `displayFileName` from Task 1; `startFile`/`playFile`/`stopFilePlayback`/`setLoop`/`setMuted` and the `isPlaying`/`fileName`/`loop`/`muted` getters from Task 2; `studio.enableAudio(mode, file)` from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the imports**

In `src/ui/studio-motion-lab.js`, after the existing import of `param-format.js` (line 8):

```js
import { displayFileName } from '../core/audio-transport.js';
import { escapeHtml } from './studio-format.js';
```

- [ ] **Step 2: Add the File button and the transport row**

Replace the Audio Input `control-row` block (lines 117-123) with:

```js
        <div class="control-row">
          <label class="ctrl-label">Audio Input</label>
          <div class="audio-input-row">
            <button class="btn-sm ${this.studio.audioInput?.mode === 'mic' ? 'btn-accent' : ''}" id="btn-audio-mic">Mic</button>
            <button class="btn-sm ${this.studio.audioInput?.mode === 'tone' ? 'btn-accent' : ''}" id="btn-audio-tone">Test Tone</button>
            <button class="btn-sm ${this.studio.audioInput?.mode === 'file' ? 'btn-accent' : ''}" id="btn-audio-file">File</button>
            <button class="btn-sm" id="btn-audio-off">Off</button>
          </div>
        </div>
        ${this.studio.audioInput?.mode === 'file' && this.studio.audioInput?.fileName ? `
        <div class="control-row">
          <label class="ctrl-label audio-file-name" title="${escapeHtml(this.studio.audioInput.fileName)}">${escapeHtml(displayFileName(this.studio.audioInput.fileName))}</label>
          <div class="audio-input-row">
            <button class="btn-sm ${this.studio.audioInput.isPlaying ? 'btn-accent' : ''}" id="btn-audio-play">Play</button>
            <button class="btn-sm" id="btn-audio-stop">Stop</button>
            <button class="btn-sm ${this.studio.audioInput.loop ? 'btn-accent' : ''}" id="btn-audio-loop">Loop</button>
            <button class="btn-sm ${this.studio.audioInput.muted ? 'btn-accent' : ''}" id="btn-audio-mute">Mute</button>
          </div>
        </div>` : ''}
```

The filename is user-supplied text going into an HTML string, so it passes through `escapeHtml` in both the text and the `title` attribute. `escapeHtml` escapes quotes, so it is safe in attribute position.

- [ ] **Step 3: Add the listeners**

In `attachMotionLabListeners`, insert after the `#btn-audio-tone` handler block (which ends around line 221, just before the `#btn-audio-off` handler):

```js
  this.root.querySelector('#btn-audio-file')?.addEventListener('click', () => {
    // Created per click and discarded. render() rewrites the inspector's inner
    // HTML, which would destroy a persistent input and silently drop the
    // user's selection, so no file input lives in the markup.
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'audio/*,video/mp4,.wav,.mp3,.m4a,.mp4,.ogg,.flac,.aac';
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      if (!file) return;
      const started = await this.studio.enableAudio('file', file);
      if (!started) {
        alert('Could not load that audio file. The browser could not decode it.');
        this.render();
        return;
      }
      ensureAudibleRoute();
      mod.enabled = true;
      commit(true);
    });
    picker.click();
  });

  this.root.querySelector('#btn-audio-play')?.addEventListener('click', async () => {
    // The context is resumed inside this click rather than at file-select time,
    // because a file picker can outlive the gesture that opened it.
    const ok = await this.studio.audioInput?.playFile();
    if (!ok) {
      alert('The browser blocked playback. Click Play again to allow audio.');
    }
    this.render();
  });

  this.root.querySelector('#btn-audio-stop')?.addEventListener('click', () => {
    this.studio.audioInput?.stopFilePlayback();
    this.render();
  });

  this.root.querySelector('#btn-audio-loop')?.addEventListener('click', () => {
    const audio = this.studio.audioInput;
    if (!audio) return;
    audio.setLoop(!audio.loop);
    this.render();
  });

  this.root.querySelector('#btn-audio-mute')?.addEventListener('click', () => {
    const audio = this.studio.audioInput;
    if (!audio) return;
    audio.setMuted(!audio.muted);
    this.render();
  });
```

- [ ] **Step 4: Reconcile the Play button when a track ends on its own**

The meter already polls every 100 ms. Reuse it rather than adding an event chain: replace the body of the `setInterval` callback (the block around lines 226-235) with:

```js
    this._audioMeterId = setInterval(() => {
      const fill = this.root.querySelector('#audio-meter-fill');
      if (!fill) {
        clearInterval(this._audioMeterId);
        this._audioMeterId = null;
        return;
      }
      fill.style.width = `${Math.round((this.studio.modulation.audioLevel ?? 0) * 100)}%`;
      // A track that reaches its end with loop off leaves the Play button lit.
      // Re-render only on a transition, never on every tick.
      const playing = !!this.studio.audioInput?.isPlaying;
      if (this._audioWasPlaying !== undefined && this._audioWasPlaying !== playing) {
        this._audioWasPlaying = playing;
        this.render();
        return;
      }
      this._audioWasPlaying = playing;
    }, 100);
```

- [ ] **Step 5: Add the CSS for the one new class**

`tests/css-hygiene.test.mjs` fails any class emitted in UI markup without a rule. `.audio-file-name` is the only new class — the buttons reuse `.btn-sm` and the row reuses `.audio-input-row`. Append to `src/styles/explore.css` after the `.audio-meter-fill` rule:

```css
/* The loaded track's name. Truncates rather than wrapping, because a long
   filename would otherwise push the transport buttons onto a second line. */
.audio-file-name {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
```

- [ ] **Step 6: Verify**

Run: `node tests/css-hygiene.test.mjs`
Expected: all `PASS`, `all passed`.

Run: `npx vite build`
Expected: `✓ built in …`.

Run: `for t in tests/*.test.mjs; do node "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done`
Expected: only `done`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/studio-motion-lab.js src/styles/explore.css
git commit -m "Add file transport controls to the Motion Lab panel"
```

---

### Task 4: Browser verification

**Files:**
- Modify: whichever files the verification proves wrong. No new files expected.

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing.

The Web Audio graph, the autoplay gesture and the transport events cannot be exercised in Node. This task proves them in the real app.

- [ ] **Step 1: Start the dev server**

Use the Browser pane's `preview_start` with `{ name: "orb-animation" }`. Never run the dev server through Bash.

If port 5173 is held by another session, add `"autoPort": true` to the entry in `.claude/launch.json`, retry, and revert that edit before committing.

- [ ] **Step 2: Give the pane a viewport**

A hidden pane reports `window.innerWidth === 0` and freezes `requestAnimationFrame`, so the canvas never sizes. Front the tab and set a viewport (1024x768) before measuring anything. Reset it with the `desktop` preset when finished.

- [ ] **Step 3: Feed a synthesised WAV through the real load path**

No fixture file is needed. Run this in the page:

```js
// A 3-second 440 Hz tone as a 16-bit mono WAV, built in memory.
function makeWav(seconds = 3, freq = 440, rate = 44100) {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const ascii = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.sin(2 * Math.PI * freq * i / rate) * 0x4000, true);
  return new File([buf], 'verify-tone.wav', { type: 'audio/wav' });
}
const s = window.__orb.studio;
const started = await s.enableAudio('file', makeWav());
return { started, mode: s.audioInput.mode, fileName: s.audioInput.fileName };
```

Expected: `{ started: true, mode: 'file', fileName: 'verify-tone.wav' }`.

- [ ] **Step 4: Confirm the level reaches the modulation rack**

`setTimeout` is clamped to ~1000 ms in a hidden pane, so inject a fixed delta and step frames by hand rather than sleeping:

```js
const s = window.__orb.studio;
s.clock.getDelta = () => 0.016;
await s.audioInput.playFile();
await new Promise(r => setTimeout(r, 500));   // let the analyser fill
for (let i = 0; i < 30; i++) s.renderFrame();
const playing = s.modulation.audioLevel;
s.audioInput.stopFilePlayback();
await new Promise(r => setTimeout(r, 500));
for (let i = 0; i < 60; i++) s.renderFrame();
return { levelWhilePlaying: playing, levelAfterStop: s.modulation.audioLevel };
```

Expected: `levelWhilePlaying` clearly above 0; `levelAfterStop` at or near 0.

- [ ] **Step 5: Confirm mute silences output without killing reactivity**

```js
const s = window.__orb.studio;
await s.audioInput.playFile();
s.audioInput.setMuted(true);
await new Promise(r => setTimeout(r, 500));
for (let i = 0; i < 30; i++) s.renderFrame();
const muted = { level: s.modulation.audioLevel, muted: s.audioInput.muted };
s.audioInput.setMuted(false);
return muted;
```

Expected: `muted: true` **and** `level` still above 0 — mute lowers the output gain, it does not pause the source.

- [ ] **Step 6: Confirm mic mode can never be audible**

```js
// Does not request the microphone; checks the rule the graph is built on.
const { gainForMode } = await import('/src/core/audio-transport.js');
return [
  gainForMode('mic'),
  gainForMode('mic', { muted: false }),
  gainForMode('mic', { muted: true }),
];
```

Expected: `[0, 0, 0]`.

- [ ] **Step 7: Confirm a rejected file fails softly**

```js
const s = window.__orb.studio;
const bad = new File([new Uint8Array([1, 2, 3, 4])], 'broken.txt', { type: 'text/plain' });
const started = await s.enableAudio('file', bad);
return { started, mode: s.audioInput.mode };
```

Expected: `{ started: false, mode: null }` — rejected, nothing thrown, no stale mode left behind.

- [ ] **Step 8: Confirm loop and the panel controls**

Click `File`, `Play`, `Loop`, `Mute` and `Stop` in the Motion Lab panel and confirm each button lights with `.btn-accent` when active and that the orb visibly moves while a track plays. Confirm the filename row appears only when a file is loaded.

- [ ] **Step 9: Reset and re-verify**

Reset the viewport with the `desktop` preset. Revert any `autoPort` edit to `.claude/launch.json`.

Run: `npx vite build`
Expected: `✓ built in …`.

Run: `for t in tests/*.test.mjs; do node "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done`
Expected: only `done`.

- [ ] **Step 10: Commit any fixes**

```bash
git add -A
git commit -m "Fix issues found verifying file audio input in the browser"
```

If the verification found nothing to fix, skip this commit rather than creating an empty one.

---

## Acceptance criteria

From the spec, all must hold when the plan is complete:

1. Loading a wav, mp3, m4a or mp4 and pressing Play moves the orb.
2. Stop returns the modulation level to 0; Play from stopped restarts from the beginning.
3. Loop restarts the track without a gap in reactivity.
4. Mute silences output while the orb keeps reacting.
5. `gainForMode('mic', …)` returns 0 in every case.
6. A corrupt file produces a message, not a broken UI or a thrown error.
7. Export/import of a config is unaffected.
8. `npx vite build` passes and every `tests/*.test.mjs` passes.
