# README orb GIF — design

## Why

Both READMEs describe a visual library in text only. A reviewer's first reaction was to ask for a preview; a short loop answers "what does this look like" before anyone installs anything.

## What

One animated GIF, a 2×2 grid, ~6 s seamless loop, ~800 px wide, under ~3 MB:

| | |
|---|---|
| Gyroid Nebula (`nebula`) — raymarched field | Murmuration (`murmuration`) — particle flock |
| Vocalis (`vocalis`) — speaking body | Hopf Fibration (`hopf`) — analytic line art |

Each engine uses its schema defaults. Engine names are a markdown caption under the image, not burned into pixels.

## Why a GIF

The only animated format that renders on both GitHub and npmjs.com. npm plays no video; GitHub plays video only when uploaded through its web UI. Four separate GIFs would load out of sync and stop reading as one piece.

## Capture

- Drive the studio in the browser pane, one engine at a time in single view (not the grid: grid cells have no bloom by design, so every orb would look flat).
- Step frames manually: `studio.clock.getDelta = () => 1/30`, `studio.renderFrame()`, read `renderer.domElement.toDataURL('image/png')`. The studio renderer sets `preserveDrawingBuffer: true`, so this works in a hidden pane and is deterministic. MediaRecorder is real-time and freezes when the pane is hidden.
- Warm up ~2 s of simulated time before recording, so simulations (Murmuration) are past their initial state.
- Render each engine at a square canvas; crop/scale to 400×400 in ffmpeg.

## Compose

- ffmpeg `xstack` into 800×800.
- Hide the loop seam: crossfade the final ~0.7 s into the opening frames.
- One palette for the whole tiled clip (`palettegen=stats_mode=full`, `paletteuse=dither=sierra2_4a`) to limit banding in glow gradients. Drop to 24 fps or 720 px if over budget.

## Placement

- `docs/media/orbs.gif`, referenced from `README.md` and `packages/orb/README.md` by absolute `https://raw.githubusercontent.com/abektes/lumaform-orb/main/docs/media/orbs.gif` — npm cannot resolve relative paths. `files` in `packages/orb/package.json` excludes `docs`, so the tarball is unaffected.
- Directly under each README's title, with a link to the deployed studio.
- Frame PNGs and intermediate files are not committed.

## Verification

- `ffprobe`: dimensions, frame count, duration. `ls -l`: size under budget.
- Inspect one extracted frame per quadrant visually before committing.
- The raw URL resolves only after merge to `main`; verify rendering on GitHub then. npm renders it on the next published release's README.
