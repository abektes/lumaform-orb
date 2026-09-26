# README orb preview — design

## Why

Both READMEs describe a visual library in text only. A reviewer's first reaction was to ask for a preview; a short loop answers "what does this look like" before anyone installs anything.

## What

One animated WebP, a 2×2 grid, 9 s seamless loop, 560 px, ~3.8 MB:

| | |
|---|---|
| Gyroid Nebula (`nebula`) — raymarched field | Corona Veil (`coronaveil`) — luminous ribbons |
| Vocalis (`vocalis`) — speaking body | Hopf Fibration (`hopf`) — analytic line art |

Each engine uses its schema defaults. Engine names are a markdown caption under the image, not burned into pixels.

## Why WebP, not GIF

The first build was a GIF, chosen because it is the one format sure to animate everywhere. At 800 px it came to 35 MB; the best tolerable GIF settings still gave 10 MB. Hopf's fine rotating wire lines alone were 6.4 MB at 320 px — close to the worst case for a 256-colour format. Animated WebP at 640 px, 20 fps, `img2webp -lossy -q 60 -m 6` was 3.0 MB with no visible banding.

## Playback speed

The first WebP played the engines at real speed, which read as too fast in a small tile. The shipped file plays every captured frame (1/30 s of simulated time each) at 20 fps: 0.67× speed, a 9 s loop, 180 frames. That grew the file to 4.6 MB at 640 px, close to the ~5 MB limit GitHub's image proxy is believed to apply, so it is 560 px (3.8 MB) — still above the README's 480 px display width. It animates in every current browser, which is where both GitHub and npmjs.com render README images. npm plays no video; GitHub plays video only when uploaded through its web UI.

## Why not Murmuration

It was the first pick for the particle slot. With schema defaults the flock gathers from one dispersed cloud into two small clusters inside the six seconds: mostly black at 400 px, and the loop crossfade would dissolve between two unlike states. Corona Veil replaced it — distinct from Nebula's smooth sphere and Hopf's wireframe.

## Capture

- Drive the studio in the browser pane, one engine at a time in single view (not the grid: grid cells have no bloom by design, so every orb would look flat).
- Step frames manually: `studio.clock.getDelta = () => 1/30`, `studio.renderFrame()`, read `renderer.domElement.toDataURL('image/png')`. The studio renderer sets `preserveDrawingBuffer: true`, so this works in a hidden pane and is deterministic. MediaRecorder is real-time and freezes when the pane is hidden.
- Warm up ~2 s of simulated time before recording, so stateful engines are past their initial state.
- Render each engine at a square canvas; crop/scale to 400×400 in ffmpeg.

## Compose

- Scale each clip to 400×400, ffmpeg `xstack` into 800×800, then scale to 560 and encode every frame with `img2webp -d 50` (0.67× speed).
- Hide the loop seam: crossfade the final ~0.7 s into the opening frames.

## Placement

- `docs/media/orbs.webp`, referenced from `README.md` and `packages/orb/README.md` by absolute `https://raw.githubusercontent.com/abektes/lumaform-orb/main/docs/media/orbs.webp` — npm cannot resolve relative paths. `files` in `packages/orb/package.json` excludes `docs`, so the tarball is unaffected.
- Directly under each README's title, with a link to the deployed studio.
- Frame PNGs and intermediate files are not committed.

## Verification

- `webpmux -info`: dimensions and frame count. `ls -l`: size under budget.
- Loop seam: PSNR from the last frame to the first should match an ordinary mid-clip step.
- Inspect one extracted frame per quadrant visually before committing.
- The raw URL resolves only after merge to `main`; verify it animates on GitHub then. npm renders it on the next published release's README.
