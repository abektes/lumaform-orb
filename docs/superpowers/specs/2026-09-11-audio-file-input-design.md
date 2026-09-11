# Audio file input — design

**Date:** 2026-09-11
**Status:** approved, not yet implemented

Let a user load their own audio file and drive the orb's modulation rack with it, with play/stop/loop/mute transport in the Motion Lab panel.

## Why

The audio source today is a microphone or a 220 Hz test tone. Neither lets you answer the question the tool exists to answer — *does this orb read as alive against real music?* A mic picks up the room; a sine wave has no structure. Loading an actual track is the shortest path from "the orb reacts to amplitude" to "the orb feels like it is listening."

## Scope

**In:** audio track of a user-selected local file (mp4/m4a/wav/mp3/ogg — whatever the browser decodes), play/stop, loop toggle, mute toggle, feeding the existing single `audio1` modulation source.

**Out, by explicit decision:**

- **Video.** An mp4's picture is ignored; only its audio track is used. Rendering video as a backdrop or engine texture is a separate feature.
- **Frequency bands.** The signal stays a single full-range RMS level, as today. Splitting into bass/mid/treble would change the modulation source model, the routing UI, and config serialization. Revisit after playing with real tracks.
- **Seek/scrub.** Play and stop only, plus loop.
- **Persistence.** The chosen file does not survive a reload and is never written to a preset or export.

## Existing seams this builds on

`createAudioInput()` in `src/core/audio-input.js` already owns a `mode` concept (`'mic' | 'tone'`), a single analyser, and a level follower. `studio.enableAudio(mode)` drives it; `read()` is called once per frame from `renderFrame()` and pushed into both `modulation.setAudioLevel()` and `grid?.setAudioLevel()`.

Audio mode is **runtime-only** — `config-io.js` serializes `modulation.sources.audio1` (its `gain`, `attack`, `release`) but never the input mode. So a third mode needs no persistence work and cannot break export/import.

## Approach

Use an `<audio>` element as the source: `URL.createObjectURL(file)` → hidden `<audio>` → `context.createMediaElementSource()` → the existing analyser.

Chosen over `decodeAudioData` + `AudioBufferSourceNode` because the media element **streams** (a 50 MB file costs no RAM, where full decode of a 10-minute WAV is ~100 MB), its mp4 support is more reliable than `decodeAudioData`'s, and play/stop/loop come free as native element features. `AudioBufferSourceNode` would only have paid for itself if we wanted sample-accurate seeking, which is out of scope.

Chosen over a separate `audio-file.js` module because that would fragment the "one analyser, one level follower" model `createAudioInput` owns, and force `read()` to know which source is live.

## Audio graph

`ensureContext()` currently wires `analyser → silentOutput (gain 0) → destination`; the test tone is inaudible on purpose. `silentOutput` becomes a named `outputGain` resolved per mode:

| Mode | outputGain | Rationale |
|---|---|---|
| `mic` | **0** | Mic routed to speakers is a feedback howl. Never audible, no exceptions. |
| `tone` | 0 | Preserves current behaviour exactly. |
| `file` | 1, or 0 when muted | The thing the user wants to hear. |

Muting sets `outputGain` to 0 rather than pausing, so the analyser stays fed and the orb keeps reacting silently. That is the useful mute for a demo.

`startFile(file)` follows the shape of `startMic`/`startTestTone`: call `stop()` first, take a `requestGeneration` ticket to invalidate superseded requests, return `false` softly on any failure, and log rather than throw. `stop()` additionally revokes the object URL — without it the blob leaks for the lifetime of the page.

**Stop and Off are different operations and must not be merged:**

- **Stop** (transport) — `pause()` plus `currentTime = 0`. Mode stays `'file'`, the graph stays built, and the level decays to 0 naturally because silence reads as rms ≈ 0.
- **Off** (existing `disableAudio()`) — full teardown.

`read()` is unchanged; it reads the analyser and does not care what feeds it.

## UI

In `src/ui/studio-motion-lab.js`, the Audio Input row gains a fourth button:

```
Audio Input    [Mic] [Test Tone] [File] [Off]
```

`File` carries `.btn-accent` when `mode === 'file'`, matching how Mic and Test Tone already signal the active mode.

A second row renders only when a file is loaded:

```
♪ my-track.wav        [Play] [Stop]  [Loop] [Mute]
```

The filename is truncated for the panel and carries a `title` attribute with the full name. Loop and Mute are toggles using the same accent-when-active convention.

`.btn-sm` already declares its own background, colour, hover and `:disabled` fill via the `:not()` chain at `src/styles/inspector.css:529`, so these buttons satisfy the "controls must declare their own background and colour" invariant by reuse. One new class, `.audio-file-name`, is needed for the filename text and must declare an explicit colour.

### No file input in the markup

`render()` rewrites inspector tab content, which would destroy a persistent `<input type="file">` and silently drop the selection. Instead the File button **creates an `<input>` on demand**, clicks it, reads the result, and discards it. There is no node that needs to survive a re-render.

### Two gestures, deliberately separated

Selecting a file only *loads* it: build the element and graph, set `mode = 'file'`. The `await context.resume()` happens on the **Play** click. A file picker can outlive the originating user gesture in some browsers, so resuming at selection time would fail intermittently under autoplay policy; the Play click is always a fresh gesture.

### Routing

File mode calls the existing `ensureAudibleRoute()` exactly as Mic and Test Tone do, creating an `audio1 → _timeScale` route at amount 0.5 when none exists. Without it, loading a track and pressing Play would move nothing visible.

## State ownership

The store owns serialized state. Audio mode is not serialized, and mic/tone already live on `studio.audioInput`. File transport state — loaded filename, playing, loop, muted — follows that precedent and lives on `audioInput`, exposed as getters the panel reads at render time. Nothing new enters the store.

## Failure handling

All failures are soft; the orb keeps running. This matches the module's stated convention.

| Case | Handling |
|---|---|
| Unsupported or corrupt file | `<audio>` fires `error` → `alert()`, call `stop()`, re-render so no stale filename row remains |
| `play()` rejected by autoplay policy | `alert()` and re-render, mode stays `'file'` so the user can retry Play |
| Track ends with loop off | `ended` event → re-render so Play/Stop reflect reality |
| Large file | No limit; the media element streams rather than decoding into memory |
| Switching `file → mic`/`tone`/off | Existing `stop()` halts playback and revokes the URL |

Engine switches and A/B swaps do not interrupt playback, because audio is studio-level rather than engine-level. Grid mode reacts with no extra work, since `grid?.setAudioLevel()` already runs every frame.

## Privacy

The file never leaves the browser. `createObjectURL` produces a local blob URL; nothing is uploaded, and no file contents are persisted. Worth stating because users will drop in personal media.

## Testing

Tests here are DOM-free plain Node scripts, and Web Audio cannot run in Node — which is why `audio-input.js` is already separated from `audio-level.js`. The pure logic goes into a new `src/core/audio-transport.js`, covered by `tests/audio-transport.test.mjs` in the existing `ok(name, condition)` style with `process.exit` on failure:

| Function | Why it earns a test |
|---|---|
| `gainForMode(mode, { muted })` | Safety-critical: must return 0 for `'mic'` unconditionally. A regression is a feedback howl in the user's speakers. |
| `isSupportedAudioFile(name, type)` | Accept/reject across mp4/m4a/wav/mp3/ogg, including MIME-vs-extension disagreement. |
| `displayFileName(name, max)` | Truncation for the panel; pure, mirroring the `param-format.js` precedent. |

That is the honest limit of the Node-testable surface. Graph wiring, autoplay handling, and transport events are verified in the browser instead.

### Browser verification

No fixture file is needed: synthesise a 440 Hz WAV as a `Blob`, wrap it in a `File`, and feed it through the real load path. Confirm that the level meter moves, that `modulation` receives a non-zero level while stepping `renderFrame()`, that Stop returns the level to 0, that Loop restarts playback, and that Mute silences output while the level keeps responding.

Per CLAUDE.md, inject a fixed delta (`studio.clock.getDelta = () => 0.016`) and step frames manually rather than sleeping, because `setTimeout` is clamped in a hidden pane.

## Acceptance criteria

1. Loading a wav, mp3, m4a or mp4 and pressing Play moves the orb.
2. Stop returns the modulation level to 0; Play from stopped restarts from the beginning.
3. Loop restarts the track without a gap in reactivity.
4. Mute silences output while the orb keeps reacting.
5. `gainForMode('mic', …)` returns 0 in every case.
6. A corrupt file produces a message, not a broken UI or a thrown error.
7. Export/import of a config is unaffected.
8. `npx vite build` passes and every `tests/*.test.mjs` passes.
