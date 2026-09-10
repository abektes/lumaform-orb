# Clip Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a few seconds of the orb to a video file, so a motion candidate can be replayed, compared and shown to someone else.

**Architecture:** Every capture the tool has is a still — a PNG snapshot or a thumbnail — and a still is exactly the thing that cannot represent motion. This records the live canvas with `MediaRecorder` over `canvas.captureStream()`, which needs no encoder dependency and costs nothing while idle. Codec selection and filename formatting are pure functions so they can be unit-tested; the recorder itself is a small state machine with an auto-stop guard.

**Tech Stack:** Vanilla JS ES modules, Vite 5, Three.js 0.160, MediaRecorder API. No framework. No new dependencies.

## Global Constraints

- **No new npm dependencies.** In particular do **not** add ffmpeg.wasm, whammy, or a GIF encoder — `MediaRecorder` is built in and this is a capture aid, not a production render pipeline.
- **Vanilla JS only.** No framework.
- **ES modules**, `"type": "module"`.
- **Tests are plain Node scripts** in `tests/`, run with `node tests/<name>.test.mjs`. No test framework; do not add one. Exit `0` on pass, `1` on fail. Node has no `MediaRecorder`, so anything tested must take its capability check as an injected function.
- **Do not modify `package.json`.**
- **The build must pass:** `npx vite build`.
- **Recording must never disturb the render loop.** No resizing, no re-rendering, no pausing. If recording changes what is on screen, it is not recording what you were looking at.
- **Match surrounding code style:** 2-space indent, single quotes, semicolons, comments explaining *why*.

## Background you need (you have no prior context)

Repo root: the repository root. Dev server: `npm run dev` → http://localhost:5173. Build: `npx vite build`.

Read `docs/VISION.md` §4 (capture) and §8 (why *export* video is deferred). **This sprint is capture, not export.** It exists so you can review and share a candidate during exploration. It is not the "rendered loop per state" delivery format §8 defers — do not build state selection, looping, or transparent backgrounds into it.

**The canvas.** `OrbStudio` owns a single `THREE.WebGLRenderer` whose canvas is `studio.renderer.domElement`, appended to `#container`. It is created with `preserveDrawingBuffer: true`. `canvas.captureStream(fps)` produces a `MediaStream` from it, which `MediaRecorder` consumes.

**Frames only exist while the render loop runs.** `OrbStudio.renderFrame()` is driven by `requestAnimationFrame`. If the page is hidden, rAF never fires, no frames are produced, and a recording will be empty or near-empty. This matters for verification — see the gotchas.

**Existing keybindings — do not collide.** In `src/ui/studio-ui.js` (`bindEvents`): `Space`, `R`, `H`, `S`, `Escape`. In `src/main.js`: `G`, `K`, `1`, `2`, `` ` ``, and while in grid mode `M`, `T`, `E`. Depending on which other sprints have landed, `C` (findings), `D` and `F` (transitions) may also be taken. **This plan uses `V`**, which is free in all combinations.

**`src/main.js` returns early on any modifier** — its keydown handler begins with `if (e.metaKey || e.ctrlKey || e.altKey) return;`. Do not plan a modifier chord; it will never fire.

**Where overlays are mounted.** `StudioUI.render()` assigns `this.root.innerHTML`, so anything parented to `ui.root` is destroyed on the next re-render. The A/B readout, sweep caption and grid HUD are all appended to `document.body` for this reason, and `toggleZenMode()` mirrors a `zen-hidden` class onto `<body>` so they can still be hidden. Follow that pattern.

**Browser verification handle:** `window.__orb = { studio, state, ui }`.

**CRITICAL browser gotchas:**
- A hidden Browser pane means `requestAnimationFrame` never fires and the render loop is frozen. `studio.fpsTracker.fps` still reports its default `60`, so it is not a liveness signal. Step frames with `studio.renderFrame()`.
- CSS transitions are frozen for the same reason; `getComputedStyle()` on a transitioning property returns the starting value forever. Set `element.style.transition = 'none'` before measuring.
- **For this sprint specifically:** `MediaRecorder` fed by `captureStream()` produces data only when the canvas actually paints. In a hidden pane you can still start and stop a recording and assert on the state machine and the resulting MIME type, but the blob may be tiny or empty — that is the environment, not a bug. **A human must confirm a real clip plays.**

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/clip-format.js` | **Create.** Pure: codec preference order and filename formatting. Unit-tested. |
| `src/core/clip-recorder.js` | **Create.** MediaRecorder state machine over the canvas stream. |
| `src/core/studio.js` | **Modify.** Own the recorder; expose start/stop/toggle. |
| `src/main.js` | **Modify.** Bind `V`, mount a recording indicator, download the clip. |
| `src/style.css` | **Modify.** Append indicator styles. |
| `tests/clip-format.test.mjs` | **Create.** Node tests for the pure parts. |

---

### Task 1: Codec selection and filenames

**Files:**
- Create: `src/core/clip-format.js`
- Test: `tests/clip-format.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MIME_CANDIDATES: string[]` — preference order, best first: `video/webm;codecs=vp9`, `video/webm;codecs=vp8`, `video/webm`, `video/mp4`.
  - `pickMimeType(isSupported, candidates = MIME_CANDIDATES) => string | null` — first candidate for which `isSupported(type)` is true, else `null`. `isSupported` is injected so this is testable without `MediaRecorder`.
  - `extensionFor(mimeType) => string` — `'mp4'` for an mp4 type, `'webm'` otherwise (including `null`).
  - `formatClipFilename(engine, mimeType, date = new Date()) => string` — `orb-<engine>-<YYYYMMDD-HHMMSS>.<ext>`, with a `-` fallback engine of `unknown`.
  - `MAX_CLIP_MS = 30_000` — a hard auto-stop. A recording nobody remembers to stop becomes a several-hundred-megabyte blob.

- [ ] **Step 1: Write the failing test**

Create `tests/clip-format.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/clip-format.test.mjs`
Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/core/clip-format.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/clip-format.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/clip-format.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add src/core/clip-format.js tests/clip-format.test.mjs
git commit -m "Add codec selection and clip filename formatting"
```

---

### Task 2: The recorder

**Files:**
- Create: `src/core/clip-recorder.js`

**Interfaces:**
- Consumes: `pickMimeType`, `formatClipFilename`, `MAX_CLIP_MS` from `./clip-format.js`.
- Produces:
  - `createClipRecorder({ canvas, fps = 60, getEngineName }) => recorder` with:
    - `isSupported` getter — whether `MediaRecorder` and `canvas.captureStream` both exist.
    - `isRecording` getter
    - `start() => boolean` — begins recording; returns `false` (with a warning) if unsupported or already running.
    - `async stop() => { blob, filename, mimeType, durationMs } | null` — resolves once the recorder has flushed. Returns `null` if not running.
    - `onAutoStop` settable callback, fired when `MAX_CLIP_MS` is hit so the UI can update itself.
    - `elapsedMs` getter
    - `dispose()`

- [ ] **Step 1: Write the recorder**

Create `src/core/clip-recorder.js`:

```js
// Recording the live canvas to a video file.
//
// Capture, not export: this exists so a motion candidate can be replayed and
// shown to someone, which a PNG cannot do. It deliberately does not resize,
// re-render or pause anything — if recording changed what was on screen, it
// would not be recording what you were looking at.

import { MAX_CLIP_MS, formatClipFilename, pickMimeType } from './clip-format.js';

export function createClipRecorder({ canvas, fps = 60, getEngineName = () => 'orb' } = {}) {
  let recorder = null;
  let chunks = [];
  let startedAt = 0;
  let autoStopId = null;
  let mimeType = null;

  const supported = () =>
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof canvas?.captureStream === 'function';

  const api = {
    onAutoStop: null,

    get isSupported() {
      return supported();
    },
    get isRecording() {
      return recorder?.state === 'recording';
    },
    get elapsedMs() {
      return startedAt ? Date.now() - startedAt : 0;
    },
    get mimeType() {
      return mimeType;
    },

    start() {
      if (!supported()) {
        console.warn('Clip recording is not available in this browser.');
        return false;
      }
      if (api.isRecording) return false;

      mimeType = pickMimeType((t) => window.MediaRecorder.isTypeSupported(t));
      if (!mimeType) {
        console.warn('No supported video codec found for recording.');
        return false;
      }

      let stream;
      try {
        stream = canvas.captureStream(fps);
      } catch (err) {
        console.warn('Could not capture the canvas stream', err);
        return false;
      }

      chunks = [];
      recorder = new window.MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      // A timeslice means partial data survives if something goes wrong before
      // stop() is reached.
      recorder.start(250);
      startedAt = Date.now();

      autoStopId = setTimeout(() => {
        api.stop().then((result) => api.onAutoStop?.(result));
      }, MAX_CLIP_MS);

      return true;
    },

    stop() {
      if (!recorder || recorder.state === 'inactive') return Promise.resolve(null);
      clearTimeout(autoStopId);
      autoStopId = null;

      return new Promise((resolve) => {
        const durationMs = api.elapsedMs;
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const filename = formatClipFilename(getEngineName(), mimeType);
          chunks = [];
          startedAt = 0;
          recorder = null;
          resolve({ blob, filename, mimeType, durationMs });
        };
        recorder.stop();
      });
    },

    dispose() {
      clearTimeout(autoStopId);
      autoStopId = null;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* already stopping */ }
      }
      recorder = null;
      chunks = [];
      startedAt = 0;
    },
  };

  return api;
}
```

- [ ] **Step 2: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors. (Nothing imports the recorder yet.)

- [ ] **Step 3: Commit**

```bash
git add src/core/clip-recorder.js
git commit -m "Add a MediaRecorder-based clip recorder for the live canvas"
```

---

### Task 3: Wire it into the studio

**Files:**
- Modify: `src/core/studio.js`

**Interfaces:**
- Consumes: `createClipRecorder` from `./clip-recorder.js`.
- Produces:
  - `studio.clipRecorder` — created lazily on first use.
  - `studio.startClip() => boolean`
  - `studio.stopClip() => Promise<{ blob, filename, mimeType, durationMs } | null>`
  - `studio.isRecordingClip` getter

- [ ] **Step 1: Add the import**

In `src/core/studio.js`, find:

```js
import { isSweepable, sweepValues } from './sweep.js';
```

Add directly below it:

```js
import { createClipRecorder } from './clip-recorder.js';
```

- [ ] **Step 2: Add the lazy field**

In `src/core/studio.js`, find this line in the constructor:

```js
    this.sweepInfo = null;
```

Add directly below it:

```js
    // Created on first use: constructing a MediaRecorder costs nothing until it
    // runs, but the capture stream should not exist for sessions that never record.
    this.clipRecorder = null;
```

- [ ] **Step 3: Add the methods**

In `src/core/studio.js`, find the method `enterSweepMode(state, { paramKey, steps = 5 } = {}) {` and insert these immediately **above** it:

```js
  ensureClipRecorder() {
    if (!this.clipRecorder) {
      this.clipRecorder = createClipRecorder({
        canvas: this.renderer.domElement,
        fps: 60,
        getEngineName: () => this.activeEngineType,
      });
    }
    return this.clipRecorder;
  }

  get isRecordingClip() {
    return !!this.clipRecorder?.isRecording;
  }

  startClip() {
    return this.ensureClipRecorder().start();
  }

  stopClip() {
    return this.clipRecorder ? this.clipRecorder.stop() : Promise.resolve(null);
  }

```

- [ ] **Step 4: Tear down on dispose**

In `src/core/studio.js`, find in `dispose()`:

```js
    this.renderer.domElement.removeEventListener('pointerdown', this.handleGridPointer);
    this.exitGridMode();
```

Replace with:

```js
    this.renderer.domElement.removeEventListener('pointerdown', this.handleGridPointer);
    this.clipRecorder?.dispose();
    this.exitGridMode();
```

- [ ] **Step 5: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/studio.js
git commit -m "Expose clip recording from the studio"
```

---

### Task 4: Keybinding, indicator and download

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css` (append at end)

**Interfaces:**
- Consumes: `studio.startClip`, `studio.stopClip`, `studio.isRecordingClip`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the indicator and the toggle**

In `src/main.js`, find:

```js
window.__orb = { studio, state, ui };
```

Add directly below it:

```js
// --- clip recording ---------------------------------------------------------
// V starts and stops. Mounted on document.body, not ui.root, because
// StudioUI.render() replaces root.innerHTML and would destroy it.
const clipIndicator = document.createElement('div');
clipIndicator.className = 'clip-indicator hidden';
document.body.appendChild(clipIndicator);

let clipTimerId = null;

function refreshClipIndicator() {
  if (!studio.isRecordingClip) {
    clipIndicator.classList.add('hidden');
    clearInterval(clipTimerId);
    clipTimerId = null;
    return;
  }
  clipIndicator.classList.remove('hidden');
  const seconds = (studio.clipRecorder.elapsedMs / 1000).toFixed(1);
  clipIndicator.innerHTML = `<span class="clip-dot"></span>REC ${seconds}s <span class="clip-hint">V to stop</span>`;
}

function downloadClip(result) {
  if (!result?.blob || result.blob.size === 0) {
    console.warn('Recording produced no data — was the page visible while recording?');
    return;
  }
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function toggleClip() {
  if (studio.isRecordingClip) {
    const result = await studio.stopClip();
    refreshClipIndicator();
    downloadClip(result);
    return;
  }
  if (!studio.startClip()) return;
  studio.clipRecorder.onAutoStop = (result) => {
    refreshClipIndicator();
    downloadClip(result);
  };
  refreshClipIndicator();
  clipTimerId = setInterval(refreshClipIndicator, 100);
}

window.__orb.toggleClip = toggleClip;
```

- [ ] **Step 2: Bind `V`**

In `src/main.js`, find:

```js
  if (e.code === 'KeyK') {
    e.preventDefault();
    toggleSweep();
    return;
  }
```

Insert directly **above** it:

```js
  if (e.code === 'KeyV') {
    e.preventDefault();
    toggleClip();
    return;
  }

```

- [ ] **Step 3: Append the styles**

Append to the end of `src/style.css`:

```css

/* ---------------------------------------------------------------------------
   Recording indicator. Top-centre, clear of the top bar and the grid HUD.
   --------------------------------------------------------------------------- */
.clip-indicator {
  position: fixed;
  top: 88px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--panel-bg);
  border: 1px solid #ef4444;
  backdrop-filter: blur(20px);
  border-radius: var(--radius-pill);
  font-family: var(--font);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #ef4444;
  z-index: 70;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}

.clip-indicator.hidden {
  display: none;
}

.clip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 10px #ef4444;
  animation: clip-pulse 1s ease-in-out infinite;
}

@keyframes clip-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.clip-hint {
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0;
}

/* Zen mode hides body-mounted overlays via a class mirrored onto <body> by
   toggleZenMode(); keep the recorder consistent with the others. */
body.zen-hidden .clip-indicator {
  opacity: 0;
}
```

- [ ] **Step 4: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 5: Verify in the browser**

Dev server running, open http://localhost:5173.

First the state machine and codec selection, which work regardless of visibility:

```js
const { studio: s } = window.__orb;
const r = s.ensureClipRecorder();
const out = { supported: r.isSupported, idleBefore: s.isRecordingClip };

out.started = s.startClip();
out.recordingNow = s.isRecordingClip;
out.mimeType = r.mimeType;
out.doubleStartRejected = s.startClip() === false;
out.indicatorShown = !document.querySelector('.clip-indicator').classList.contains('hidden');

// paint some frames so there is something to encode
for (let i = 0; i < 60; i++) s.renderFrame();
await new Promise((res) => setTimeout(res, 700));

const result = await s.stopClip();
out.stoppedCleanly = s.isRecordingClip === false;
out.filename = result?.filename;
out.blobBytes = result?.blob?.size ?? 0;
out.stopWhenIdleReturnsNull = (await s.stopClip()) === null;
return JSON.stringify(out, null, 2);
```

Expected: `supported: true`, `started: true`, `doubleStartRejected: true`, a `mimeType` from the candidate list, a `filename` matching `orb-<engine>-<stamp>.webm`, `stoppedCleanly: true`, `stopWhenIdleReturnsNull: true`.

**`blobBytes` may be 0 or very small if the Browser pane is hidden** — `captureStream` only yields frames when the canvas actually paints. That is the environment, not a defect.

**A human must confirm a real clip.** With the pane visible, press `V`, let the orb move for a few seconds, press `V` again, and check the downloaded `.webm` plays and shows the motion.

Finally confirm the auto-stop guard is wired without waiting 30 seconds:

```js
const { studio: s } = window.__orb;
s.startClip();
// Fire the guard's effect directly rather than waiting out MAX_CLIP_MS.
const result = await s.stopClip();
JSON.stringify({ autoStopCallbackWired: typeof s.clipRecorder.onAutoStop === 'function', recording: s.isRecordingClip });
```

Expected: `autoStopCallbackWired: true`, `recording: false`.

- [ ] **Step 6: Commit**

```bash
git add src/main.js src/style.css
git commit -m "Bind V to record a clip of the live canvas"
```

---

## Definition of done

- `node tests/clip-format.test.mjs` prints `ALL PASS`, and the other suites still do.
- `npx vite build` succeeds.
- `V` starts recording and shows a pulsing indicator with elapsed time; `V` again stops and downloads the file.
- The clip plays and shows the motion (**human-confirmed**).
- Recording never resizes, re-renders or pauses the scene.
- A second `start()` while recording is refused; `stop()` while idle resolves to `null`.
- A browser without `MediaRecorder` or a supported codec logs a warning and leaves the app working.
- Recording auto-stops at 30 s.
- No console errors beyond intentional warnings.

## Follow-up worth noting

This is capture, not the deferred video *export* in `docs/VISION.md` §8 — that one is per-state loops for non-WebGL targets and stays deferred until states exist. Update the capability inventory in that document's appendix in the same commit as your last task; it went stale immediately last time.
