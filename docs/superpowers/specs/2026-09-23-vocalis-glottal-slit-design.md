# Vocalis: glottal slit centre, full globe, two presets refreshed

**Date:** 2026-09-23 · **Status:** approved, building

## Problem

- **The centre has never been visible.** The "glottal nucleus" (`MeshBasicMaterial`, radius `0.28·R`, scaled to about 1.18) sits inside the "occluder" sphere (radius `0.55·R`, centred at `z = −0.4·depth`), which was meant to sit behind it. The occluder's front face lands at `z ≈ +0.56`, in front of the nucleus at `≈ +0.48`. It is 80% opaque and writes depth, so the centre pixel reads `(0, 0, 1)`. When a preset's proportions let the nucleus show through, it appears as a small hard-edged blob (Phonetic Diaphragm).
- **Even when visible, the centre was an unlit flat disc** that only scaled uniformly, with no articulation.
- **The `globe` layout covers only 16°–76° from the pole**, so it renders as a dome in the upper half of the frame. This is why Orbital Voice reads as broken.

## Design

**Centre: a shader-drawn glottal slit** on a camera-facing card, replacing both the nucleus and the occluder.
- A lens-shaped (vesica) opening: dark inside, with a glowing rim at stroke weight similar to the rings.
- A soft dark falloff around it gives the depth contrast the occluder was meant to provide, without writing depth.
- Opening is driven by a **syllable envelope**, not a sine: syllables arrive at `articulationRate`, each with a seeded peak height, a fast open, a hold and a close, with occasional full closures.
- **Click = plosive:** the slit snaps shut for about 60 ms, then bursts past its normal maximum and decays.
- The rings keep their existing ripple.

**Parameters**
- `apertureSize`: maximum opening (existing key).
- `glottisDarkness`: darkness of the opening. Same key and label, so existing configs load unchanged.
- New `slitAngle` (0–180°, motion): 0 is a horizontal mouth, 90 is vertical vocal folds.
- New `slitLength` (motion): half-length as a fraction of the innermost ring radius.
- All of these are uniform writes: modulatable, and no rebuild.

**Globe:** latitudes span `φ ∈ [0.3, π − 0.3]` evenly, so rings sit symmetrically about the equator and the globe is centred.

**Presets:** Orbital Voice (globe) and Rounded Vowels (ellipse) are retuned after the fix. The other three gain only slit values.

## Verification

- `vocalis-layout.test.mjs`: globe latitudes are symmetric about the equator and centred.
- Full `npm test` and `npm run build`.
- In the studio, via canvas capture (hidden-pane screenshots are stale):
  - before/after sheets of all five presets
  - the centre pixel is no longer black
  - a sweep on `apertureSize`
  - the grid
  - ten engine switches with stable `renderer.info.memory`
  - export → import round trip
  - a modulation route on `slitAngle`

## Out of scope

Corona Veil's surface direction is a separate design, next.
