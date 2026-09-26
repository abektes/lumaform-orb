# README Orb Preview Implementation Plan

> **As built:** GIF was replaced by animated WebP (35 MB → 3.0 MB) and Murmuration by Corona Veil, and playback was later slowed to 0.67× at 560 px; see the spec for why. Steps below are updated to match.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 2×2 looping animated WebP of four engines at the top of both READMEs.

**Architecture:** Frame-step the studio in the browser pane with an injected delta, read each frame with `toDataURL`, hand the PNGs to a small local receiver, then compose with ffmpeg. No runtime or studio code changes.

**Tech Stack:** Studio dev server (Vite), browser pane, Node (frame receiver), ffmpeg.

## Global Constraints

- Engines, in grid order: `nebula` (top-left), `coronaveil` (top-right), `vocalis` (bottom-left), `hopf` (bottom-right). Schema defaults — none has a built-in preset.
- Output `docs/media/orbs.webp`, 560×560, 9 s seamless loop at 0.67× speed, ~3.8 MB.
- READMEs reference `https://raw.githubusercontent.com/abektes/lumaform-orb/main/docs/media/orbs.webp`.
- Studio link: `https://orb.lumaform.xyz`.
- Frame PNGs live in `scratch/` (gitignored check below) and are never committed.
- Single view only — grid cells have no bloom.

---

### Task 1: Capture frames

**Files:**
- Create (throwaway, uncommitted): `scratch/readme-gif/receive.mjs`

- [x] **Step 1:** Confirm `scratch/` is ignored: `git check-ignore scratch/x` prints `scratch/x`.
- [x] **Step 2:** Write a Node receiver on port 5199 that accepts `POST /frame?engine=<id>&i=<n>` with a data-URL body, adds CORS headers, and writes `scratch/readme-gif/<id>/<nnnn>.png`.
- [x] **Step 3:** `preview_start` `orb-animation`. Hide the inspector chrome so the canvas framing is the orb's natural one; confirm the canvas is square-croppable around the orb.
- [x] **Step 4:** For each engine, in the page:

```js
const { studio, store, state } = window.__orb;
store.setEngine(id); studio.setEngine(id, state);
const realDelta = studio.clock.getDelta.bind(studio.clock);
studio.clock.getDelta = () => 1 / 30;
for (let i = 0; i < 60; i++) studio.renderFrame();           // 2 s warm-up
for (let i = 0; i < 201; i++) {                               // 6.7 s = 6 s + 0.7 s crossfade
  studio.renderFrame();
  const url = studio.renderer.domElement.toDataURL('image/png');
  await fetch(`http://localhost:5199/frame?engine=${id}&i=${i}`, { method: 'POST', body: url });
}
studio.clock.getDelta = realDelta;
```

- [x] **Step 5:** Verify: each `scratch/readme-gif/<id>/` has 201 PNGs; look at frame 0 of each.

### Task 2: Compose the WebP

- [x] **Step 1:** Per engine: crop to a centred square, scale to 400×400, loop-crossfade the last 0.7 s over the first 0.7 s → `scratch/readme-gif/<id>.mkv` (lossless FFV1 intermediate, 6 s).
- [x] **Step 2:** `xstack` the four into 800×800, scale to 560, export all 180 PNGs, then `img2webp -loop 0 -lossy -q 60 -m 6 -d 50 frames/*.png -o docs/media/orbs.webp` (30 fps capture played at 20 fps = 0.67×).
- [x] **Step 3:** Verify with `webpmux -info` (560×560, 180 frames) and `ls -l` (~3.8 MB).
- [x] **Step 4:** Decode a frame (`webpmux -get frame 1` + `dwebp`) and look at all four quadrants; compare seam PSNR (frame 179→0) with a mid-clip step.

### Task 3: README placement

**Files:**
- Modify: `README.md` (under the title)
- Modify: `packages/orb/README.md` (under the title)
- Modify: `packages/orb/CHANGELOG.md` is **not** touched — a README image is not a runtime change a user would notice.

- [x] **Step 1:** Insert under each title:

```markdown
<p align="center"><img src="https://raw.githubusercontent.com/abektes/lumaform-orb/main/docs/media/orbs.webp" width="480" alt="Four Lumaform orbs looping: Gyroid Nebula, Corona Veil, Vocalis and Hopf Fibration"></p>
<p align="center"><sub>Gyroid Nebula · Corona Veil · Vocalis · Hopf Fibration — <a href="https://orb.lumaform.xyz">try all twenty-three in the studio</a></sub></p>
```

- [x] **Step 2:** `npm test` passes (no code changed, but markup tests scan the repo).
- [x] **Step 3:** Commit the WebP, both READMEs and this plan.
