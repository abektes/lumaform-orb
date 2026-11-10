# State machines

Every stateful part of the runtime and the studio, written out as a state machine: its states, what must always hold, and what moves it. Some of these are explicit (a `state` field, a generation counter). Most are implicit, spread over a few nullable fields whose combinations are the states.

The second half lists the invalid states and transitions the code could actually reach, how each was confirmed, and what fixed it. **Keep this file current.** A change that adds a state, a transition or an async step to one of these machines updates its table here, and a new bug found in one gets a row under [Findings](#findings).

"Concurrency" in this codebase means interleaving, not threads: an `await` that resolves after the user has clicked something else, a `MediaRecorder` event that arrives on its own schedule, a `setInterval` that outlives the view that started it, and two tabs sharing one `localStorage`. "Retry" means the user doing the same thing again after a failure, or code that loops on failure.

---

## Runtime (`packages/orb`)

### R1. Runtime lifecycle — `OrbRuntime` (`core/runtime.js`)

Implicit in `activeEngine`, `activeEngineType` and `disposed`.

| State | `activeEngine` | `activeEngineType` | `disposed` |
|---|---|---|---|
| **Empty** | `null` | `null` | `false` |
| **Mounted(T)** | engine of type T | T | `false` |
| **Disposed** | `null` | last T | `true` |

Invariants

- `activeEngineType` names the engine on screen, or nothing is on screen because nothing was ever mounted.
- At most one engine is alive. A swap disposes the old one before constructing the new one.
- `baseParams` is the unmodulated look; the engine only ever receives base plus modulation.
- Disposed is terminal. Nothing draws after it, and disposing again does nothing.

| From | Event | Guard | To | Effect |
|---|---|---|---|---|
| Empty / Mounted(S) | `mountEngine(T)` | T registered, T ≠ S | Mounted(T) | dispose S, construct T, frame camera, sync modulation and globals, configure states, refit |
| Mounted(T) | `mountEngine(T)` | — | Mounted(T) | `configure` states, then `applyParams`; returns `false` |
| any live state | `mountEngine(X)` | X not registered | *unchanged* | logs, returns `false` ([D1](#d1)) |
| Mounted(S) | `mountEngine(T)` | factory throws | Empty-with-stale-type | S is already disposed; `activeEngineType = T`, `activeEngine = null`. Retrying `mountEngine(T)` recovers. Left as is: a throwing factory is an engine bug |
| Mounted(T) | `applyParams` | — | Mounted(T) | new base; cancels any state transition (hard cut, by design) |
| Mounted(T) | `advance(dt)` | — | Mounted(T) | step state transition (wall ms), apply modulation, integrate `virtualTime` |
| any | `dispose()` | not disposed | Disposed | release everything, remove canvas |
| Disposed | `dispose()`, `tick()` | — | Disposed | no-op ([D2](#d2)) |

### R2. Host loop — `createOrb` (`create-orb.js`)

| State | `rafId` | `disposed` |
|---|---|---|
| **Stopped** | `null` | `false` |
| **Running** | id | `false` |
| **Disposed** | `null` | `true` |

| From | Event | To | Notes |
|---|---|---|---|
| Stopped | `start()` | Running | reads the clock once so the pause is not replayed as one long delta |
| Running | `start()` | Running | no-op |
| Running | `stop()` | Stopped | |
| any | `dispose()` | Disposed | stop, then `runtime.dispose()` |
| Disposed | `start()` | Disposed | no-op ([D2](#d2)) |

The handle also keeps `look`, the full parameter set it last mounted, because `applyParams` replaces the base wholesale and `setParams` merges. **Invariant:** `look` describes the engine actually mounted. `setEngine` and `loadConfig` with an unregistered engine leave it alone ([D1](#d1)).

`setEngine(sameType)` reconfigures the state player with no states, so a config's named states are dropped. That is consistent with `setEngine` meaning "start from this engine's defaults", and is noted here rather than changed.

### R3. Named states — `createStatePlayer` (`core/state-player.js`)

| Variable | Values |
|---|---|
| `current` | `null` or an own key of `states` |
| transition | **Idle** (`!tween.isRunning && elapsed ≥ duration`) or **Easing** |
| `tempo` | always within `TEMPO_RANGE` |

| From | Event | To | Effect |
|---|---|---|---|
| any | `configure(next)` | Idle, `current = initialState` if it exists | cancel, settle tempo |
| any | `setBase(params)` | Idle | cancel, tempo snaps to `tempoOf(current)` |
| any | `start(name)` | Easing, `current = name` | from the given on-screen params, so an interruption never jumps back |
| any | `start(unknown)` | *unchanged* | returns `false` |
| Easing | `advance(dt)` reaching duration | Idle | lands exactly on the target |
| any | `cancel()` | Idle | tempo snaps to `tempoOf(current)` |

Invariants: after any cancel, `tempo === tempoOf(current)` (no stranded mid-ease tempo); a target never contains a key that neither the patch nor the base holds; rates, geometry and selects are never interpolated, only snapped at t = 0.5.

A direct edit (`applyParams`) during Easing is a hard cut to the state's target. A host that calls `setParams` every frame therefore never sees a transition animate. That is the documented policy, not a bug; changing it means deciding what "edit the base mid-transition" should look like.

### R4. Parameter tween — `createParamTween` (`core/param-tween.js`)

**Idle ⇄ Running.** `start` → Running; `advance` past the duration → Idle and returns `{ ...to }` exactly; `cancel` → Idle. Invariant: a finished tween leaves every key exactly on its target. Used by the state player and by the studio's A/B and rehearsal transitions.

### R5. Phase tracker — `createPhaseTracker` (`core/phase.js`)

**Unseeded → Seeded.** The first `advance(time)` only records the clock (an engine built hours into a session does not replay that history). After that, `vdt = max(0, t − last)`: a backwards jump holds phase rather than unwinding. Invariant: every phase stays in `[0, period)`.

### R6. Audio input — `createAudioInput` (`audio/audio-input.js`)

| State | `mode` | Graph |
|---|---|---|
| **Off** | `null` | no context |
| **Starting(m)** | `null` | context exists, request generation g outstanding |
| **Mic / Tone / File** | `'mic'` / `'tone'` / `'file'` | source connected to the analyser |
| File: **Playing / Paused** | `'file'` | media element playing or paused |

Every start begins with `stop()`, which bumps `requestGeneration` and tears the graph down. A start that resolves after another `stop()` sees a different generation, releases what it acquired and resolves `false`.

| From | Event | To |
|---|---|---|
| any | `startMic` / `startTestTone` / `startFile` | Starting(m) |
| Starting(m), generation current | permission granted / context running / metadata loaded | m |
| Starting(m), generation current | refused / suspended / undecodable | Off |
| Starting(m), generation stale | any resolution | *whatever the newer request reached*; resolves `false` |
| any | `stop()` | Off |
| File | `playFile()` / `stopFilePlayback()` | Playing / Paused |

Invariants: a microphone is never audible (`gainForMode`); `read()` returns 0 when Off; a stale request never touches the graph.

The `false` from a stale request is the module's contract and is kept. The studio is what has to tell "lost the race" from "failed" ([C2](#c2)). A superseded `startFile` can wait forever on a media element the newer request reset; nothing awaits it once the studio has a newer request, so it is harmless.

---

## Studio (`packages/studio`)

### S1. Frame order — `OrbStudio.renderFrame` (`core/studio.js`)

Not a machine, but the invariant every other one leans on: **rehearsal and tween move `baseParams` first, then `advance()` evaluates modulation against that base, then exactly one of grid or composer draws.** Grid cells never get bloom.

### S2. Rehearsal playback — `studio-sequence.js` + `createSequencePlayer` (`core/sequence.js`)

Implicit in `currentSequence`, `sequencePlayer.isPlaying`, `sequenceState` and `paramTween.isRunning`.

| State | `currentSequence` | `isPlaying` | tween |
|---|---|---|---|
| **Idle** | `null` | `false` | not driven by the rehearsal |
| **Playing** | array | `true` | advances with the frame |
| **Paused** | array | `false` | frozen where it was |

Invariants

- `sequenceState` is non-null exactly when `currentSequence` is.
- A step writes its target into state *before* the visual tween starts, so while a transition is in flight state is ahead of the screen. Anything that captures "what is on screen" reads `baseParams` while the tween runs (`saveFinding` does), and a reconciling stop copies `baseParams` back into state.
- Every rendered inspector control belongs to `state.engine`'s schema ([A1](#a1)).
- A step applies look globals only, never `paused` or `dpr` ([B1](#b1)).

| From | Event | To | Effect |
|---|---|---|---|
| Idle | `playSequence` (P, Play) | Playing | copy of the sequence; first frame enters step 0 |
| Playing | frame enters step i, same engine | Playing | globals and modulation land now; params tween over `transitionMs` |
| Playing | frame enters step i, other engine | Playing | `setEngine` (no interpolation across a dispose); `onSequenceStep({ engineChanged: true })` re-renders the inspector ([A1](#a1)) |
| Playing | `pauseSequence` (P) | Paused | |
| Paused | `resumeSequence` (P) | Playing | |
| Playing / Paused | `stopSequence()` (Stop) | Idle | reconcile: state takes the on-screen `baseParams` |
| Playing / Paused | direct edit, import, preset, A/B, engine pick | Idle | `supersedeTransition` → `stopSequence({ reconcile: false })`; the edit already in state wins |
| Playing / Paused | enter grid, sweep or scale | Idle | reconciling stop |
| Playing (finite) | elapsed ≥ total | Idle | only `loop: false`, which the UI does not use |

A throttled frame can skip whole steps. Only the step it lands in is applied, and its tween is advanced by that step's own elapsed time, not the whole frame. Skipped steps' targets are never written, which is correct: the landed step supersedes them.

A direct edit during a transition hard-cuts every other parameter to the step's target. The sliders already show that target, so the screen jumps to what the inspector displays. Left as is.

### S3. Grid views — `studio-grid.js` + `ui/grid-session.js`

One field, `studio.grid`, carries all three cell views; `sweepInfo` and `scaleInfo` tell them apart. The session owns the chrome: HUD, caption, two polls.

| State | `grid` | `sweepInfo` | `scaleInfo` | Chrome |
|---|---|---|---|---|
| **Single** | `null` | `null` | `null` | inspector, dock; orbit controls on |
| **Grid** | grid | `null` | `null` | HUD, marked-count poll |
| **Sweep(key)** | grid | `{ key, label, values }` | `null` | caption for *key* |
| **Scale** | grid | `null` | `{ sizes }` | caption, measurement poll |

Invariants: the chrome matches the view, and the caption describes the cells actually drawn ([A2](#a2)); orbit controls are off in every cell view; no rehearsal runs in a cell view; bloom never runs in one.

| From | Event | To |
|---|---|---|
| Single | G / K / L | Grid / Sweep(last touched or first sweepable) / Scale |
| any cell view | G, K or L | Single (`exitView` tears down every piece of chrome, whichever key) |
| Grid | click | Grid, re-bred from the promoted cell; state takes its look and patch |
| Grid | shift-click | Grid, cell marked |
| Grid | M / B / HUD change | Grid, re-seeded |
| Sweep(k) | engine picked from the top bar | Sweep(k) if the new engine has k, else Sweep(its first sweepable) → `onGridRebuild` redraws the caption ([A2](#a2)) |
| Scale | engine picked | Scale, same sizes → `onGridRebuild` |
| Grid | engine picked | Grid, same shape |

`rebuildGridView` falls back from Sweep to Grid when the new engine has nothing sweepable. Every one of the 45 engines has at least one sweepable parameter today, so this is unreachable; `onGridRebuild` drops the caption if it ever happens, but no HUD appears.

The measurement queue (`core/grid-measure.js`) is a one-slot request: a second request answers the first with `[]` rather than dropping it, and `dispose` settles any pending one, so a Promise around it can never hang.

### S4. A/B compare — `core/ab-compare.js` + `ui/ab-session.js`

Slots `a` and `b`, each empty or a snapshot `{ engine, global, modulation, params }`; `activeSlot` is `null`, `'a'` or `'b'`.

| Event | Effect |
|---|---|
| `1` / `2` (`store`) | slot ← current look; that slot becomes active |
| `` ` `` (`swap`) | needs both slots; applies the other one |
| apply, other engine | `setEngine` — always a cut |
| apply, same engine, duration > 0 | globals and modulation now, params tween |
| apply, same engine, cut | `updateParameters` (keeps rotation phase and `virtualTime`) |
| Compare from the shelf (`stash` ×2, `activate('a')`) | both inputs validated before either slot is written |

Invariants: a snapshot holds only the active engine's bag, so a swap never rewrites an engine the user did not open; **a snapshot holds the look, never `paused` or `dpr`** ([B1](#b1)); A/B keys are inert in a cell view.

### S5. Clip recording — `core/clip-recorder.js` + `ui/clip-session.js`

| State | `session` | `recorder.state` | `stopPromise` |
|---|---|---|---|
| **Idle** | `null` | — | — |
| **Recording** | set | `'recording'` | `null` |
| **Stopping** | set | `'inactive'` | pending |
| **Disposed** | `null` | — | — |

Invariants: one session at a time; a session always settles — every path out of Recording reaches `finish()`, which stops the tracks, clears the 30 s guard and resolves the stop promise ([C1](#c1)); the result is handed over once (a manual stop during the guard's flush takes ownership, so the clip is not downloaded twice).

| From | Event | To |
|---|---|---|
| Idle | `start()` (V) | Recording, 30 s guard armed |
| Recording | `stop()` (V) | Stopping → `stop` event → Idle, result to the caller |
| Recording | 30 s guard | Stopping → Idle, result to `onAutoStop` |
| Stopping (guard) | `stop()` (V) | the manual caller owns the result |
| Recording | recorder ends on its own (error, tracks ended) | Idle, result to `onAutoStop` ([C1](#c1)) |
| Recording, recorder already inactive | `stop()` or guard | Idle immediately ([C1](#c1)) |
| Stopping | `start()` | refused |
| any | `dispose()` | Disposed; nothing is handed over |

`clip-session` adds `togglePending`, so a second V during the `await` is dropped rather than starting a recording while the first one flushes. While Stopping, `isRecording` is already false, so the REC indicator hides and a capture takes the normal resize path; the recorder is inactive, so no thumbnail frame reaches the clip.

### S6. Audio in the studio — `OrbStudio.enableAudio` / `disableAudio` (`core/studio.js`)

`audioRequest` counts every enable and disable. An `await` that resolves after a newer request returns **`null`**, and the Motion Lab buttons say nothing for it; only the latest request reports success (`true`) or failure (`false`) ([C2](#c2)).

### S7. Findings shelf — `core/findings.js`

Persisted, not stateful in memory: every operation re-reads `localStorage`, so two tabs interleave without losing each other's writes unless they write in the same instant.

Write is a retry loop: prune to the nominal budget, then keep dropping the oldest entry until `setItem` succeeds. **Known, not fixed:** both the prune and the retry drop old findings silently (`lastError` ends `null` on the eventual success), and a shelf whose JSON is corrupt reads as empty, so the next `add` overwrites it. Both are data-loss paths worth a decision rather than a quiet fix.

### S8. Inspector — `ui/studio-ui.js`

`activeMode`, `activeTab`, `isSidebarOpen`, `isZenMode`. `render()` rewrites tab content only. **Invariant:** the rendered controls belong to `state.engine`. Every engine change re-renders: the dropdown and the step buttons call `render()`, A/B swaps and imports do, exiting a grid view does, and since [A1](#a1) a rehearsal step onto another engine does.

### Not covered

The modulation rack's own envelope and LFO state (`core/modulation.js`), the FPS tracker's march-quality ladder, and per-engine internal state. Engines are covered by their own contract in [ENGINE-AUTHORING.md](ENGINE-AUTHORING.md).

---

## Findings

Each row was reproduced against the code before it was fixed: a Node script driving the real modules with fakes for WebGL, `MediaRecorder` and the audio input, and the three studio fixes again in the running studio. Every regression test below fails on the code before its fix.

Severity is impact on the person exploring: **P1** corrupts saved work or defeats a feature's purpose; **P2** a feature stops working or misreports itself until a reload; **P3** a wrong message, or a misuse of the public API that destroys or leaks.

### Issue A — views desync from the engine underneath them

Something other than the view swapped the engine, and the view kept describing the old one.

<a id="a1"></a>**A1 · P1 · A rehearsal step onto another engine left the inspector bound to the previous engine.** Fixed.

- *Path:* `advanceTimeline` → `applySequenceStep` → `setEngine(other)`. `onSequenceStep` only moved the strip's highlight, so the Params tabs kept the old engine's sliders and the top bar its name.
- *Invalid state:* rendered controls ≠ `state.engine`. Dragging one ran `writeNumberValue`, which writes `state.engines[state.engine][key]`: the old engine's key went into the new engine's bag, and from there into any finding, export or preset made afterwards.
- *Evidence:* stepping a two-engine sequence from tesseract to moire, then calling the still-rendered slider's writer, left moire's bag as `{"scale":2,"edgeGlow":2.5}`.
- *Fix:* `onSequenceStep` carries `engineChanged`; `handleSequenceStep` (`ui/studio-library.js`) re-renders on it.
- *Test:* `packages/studio/tests/view-sync.test.mjs`. In the browser, a moire → tesseract step on the Colors tab re-rendered tesseract's controls (`color1`, `color2`, …, no foreign keys) and the top bar read "Tesseract".

<a id="a2"></a>**A2 · P2 · After an engine switch inside a sweep, the caption described the old engine's parameter.** Fixed.

- *Path:* the top bar stays usable in a cell view. Picking an engine runs `setEngine` → `rebuildGridForEngine`, which falls back to the new engine's first sweepable parameter when the old key does not exist there. The grid session never heard about it.
- *Invalid state:* Sweep(k′) captioned as Sweep(k). The instrument labelled five cells with values they were not rendered at.
- *Evidence:* sweeping tesseract's Edge Radiance and stepping to moire rebuilt the cells on Orb Scale (0.8 … 3) under the caption "Edge Radiance · 0.5 … 3.5".
- *Fix:* `rebuildGridForEngine` reports what it built through `onGridRebuild`; the grid session redraws the caption from it, and the scale poll reads the live `scaleInfo` instead of the one captured on entry.
- *Test:* `view-sync.test.mjs`. In the browser the caption now reads "Orb Scale · 0.8 1.35 1.9 2.45 3", matching `studio.sweepInfo`.

### Issue B — session state leaking through snapshots

<a id="b1"></a>**B1 · P1 · An A/B swap restored the pause state and render quality the slot was stored with.** Fixed.

- *Path:* `snapshotState` copied `state.global` whole, `paused` and `dpr` included. `applySnapshot` wrote them back, and `updateParameters` applied `isPaused`.
- *Invalid state:* a compare that changes the session. Pausing to compare two frames resumed the orb on the first swap; a slot stored while paused froze it. Exports had already dropped these keys (`SESSION_GLOBAL_KEYS`), and A/B was the path that still carried them. A finding from before that change could also carry them into a compare or a rehearsal step.
- *Evidence:* store A, store B, pause, swap → `state.global.paused === false`.
- *Fix:* `snapshotState` and `applySnapshot` go through `lookGlobal`; so does `applySequenceStep`.
- *Test:* `ab-compare.test.mjs` (session keys) and `view-sync.test.mjs` (rehearsal path). In the browser, a swap while paused left both `state.global.paused` and `studio.isPaused` true.

### Issue C — async lifecycles that could not tell "ended" or "superseded" from "failed"

<a id="c1"></a>**C1 · P2 · A recorder that ended on its own stranded the clip session for the rest of the page.** Fixed.

- *Path:* only `ondataavailable` was attached at start; `onstop` and `onerror` were attached by `requestStop`. A `MediaRecorder` ends by itself on an encoder error or when its stream's tracks end.
- *Invalid state:* `session` set, recorder inactive, no stop requested — a state with no way out. `start()` refused it as "still flushing". The 30 s guard then called `stop()` on the inactive recorder, which per spec fires no event, so its promise never settled. Clip recording stayed dead until a reload and the footage was never handed over.
- *Evidence:* with a spec-faithful fake recorder that ends itself, `start()` returned `false` afterwards and `stop()` never settled.
- *Fix:* `onstop` is attached at start, and an unrequested stop settles the session and hands its footage to `onAutoStop`. `requestStop` settles immediately when the recorder is already inactive, and `start()` recovers a session stranded with no stop event at all.
- *Test:* `async-lifecycles.test.mjs`.

<a id="c2"></a>**C2 · P3 · A superseded audio request reported a failure.** Fixed.

- *Path:* click Mic, then Tone (or Off) while the permission prompt is open. The newer request bumps the input's generation; the microphone `await` resolves `false`.
- *Invalid transition:* "lost the race" → "failed". The Motion Lab alerted "Could not access the microphone" over a tone that was playing, or after the user had turned audio off.
- *Evidence:* `enableAudio('mic')` followed by `enableAudio('tone')` resolved `true` for the tone and `false` for the microphone.
- *Fix:* `enableAudio` resolves `null` when a later enable or a disable superseded it, and the buttons stay quiet for `null`.
- *Test:* `async-lifecycles.test.mjs`.

### Issue D — runtime lifecycle guards (public API)

<a id="d1"></a>**D1 · P3 · Mounting an unregistered engine destroyed the one on screen.** Fixed.

- *Path:* `mountEngine` disposed the current engine and only then looked up the factory. Through `createOrb`, `setEngine('typo')` also replaced the handle's `look` with the unknown engine's empty defaults, so the next `setParams({ glow: 2 })` handed the surviving engine a one-key base.
- *Invalid state:* blank canvas, `activeEngineType` still naming the disposed engine, `mountEngine` returning `undefined`.
- *Fix:* look up first and return `false` without touching anything; `setEngine` and `loadConfig` keep the look when the engine is not registered.
- *Test:* `packages/orb/tests/runtime-lifecycle.test.mjs`.

<a id="d2"></a>**D2 · P3 · Dispose was neither idempotent nor terminal.** Fixed.

- *Path:* a second `dispose()` disposed the engine again. `start()` on a disposed `createOrb` handle restarted the loop, which ticked a released composer into a detached canvas every frame for the life of the page.
- *Fix:* `disposed` flag; `dispose` and `tick` return early after it, `start` refuses.
- *Test:* `runtime-lifecycle.test.mjs`. The `createOrb` guard has no Node test: building the handle constructs a WebGL renderer.

### Examined and left alone

These were traced and are behaviours rather than bugs, or need a decision before a change. Each is described with its machine above.

- `applyParams` during a state transition hard-cuts to the target (R3).
- A direct edit during a rehearsal transition jumps the other parameters to the step's target (S2).
- `setEngine(sameType)` on a `createOrb` handle drops the config's named states (R2).
- A factory that throws mid-swap leaves no engine and the new type name (R1).
- The findings shelf prunes old entries silently, and overwrites a corrupt shelf on the next write (S7).
