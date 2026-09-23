# Corona Veil: Shape × Surface

**Date:** 2026-09-23 · **Status:** approved, building

## Problem

The badge says "Aurora Membrane", but every veil is the same frosted band with horizontal interference stripes, and all four presets are one composition in four colourways. Shading uses the *sphere's* normal rather than the ribbon's, so the twisting folds never catch light.

## Design

One shader. Shape and surface are uniforms, so switching never rebuilds anything.

**Veil Shape** (select, `geometry`): `bands` | `loops`
- **Bands:** today's tilted great-circle ribbons.
- **Coronal Loops:** each veil is an arc rooted in the core. The footpoints sit on the core surface, the arc rises by up to 0.55 (plus a `veilSpread` stagger), the ribbon twists along it, and plasma brightens as it flows along the loop and at the footpoints.
- Loop placement comes from the pure module `corona-veil-loops.js` (angle around the limb, depth, lean, span, height) and is recomputed when `veilCount` changes.
- **Changed during the build:** loops were first spread over the whole sphere with a Fibonacci lattice. Most then sat behind the core or face-on against it and read as hooks and scratches. They now form a **crown around the silhouette**, built in the viewer's frame from `camera.position`, so they stay at the limb as the camera orbits and read like eclipse prominences. `veilSpread` staggers loop heights, so it still does something in loop mode.
- **Frame radius:** loops rise above the bands' 2.12, so their frame is derived from `coreRadius + 0.55 + 0.4·veilSpread + waveAmp + 0.06`.
- Changing shape **morphs** positions over about 0.6 s. When paused, the change snaps immediately.

**Veil Surface** (select, `geometry`): `aurora` (default) | `silk` | `lace` | `frost`
- **Aurora:** rays across the band (integer frequencies, so closed bands wrap seamlessly), a bright hem at one edge, and colour graded from `veilColor` at the hem to `accentColor` at the top, fading with altitude.
- **Silk:** thin-film iridescence driven by the viewing angle, a sheen highlight along the real folds, diffuse fold shading, and a smooth translucent fill.
- **Lace:** periodic Voronoi cells, with holes at cell centres that are fully transparent under additive blending, and bright threads along the cell edges, drifting slowly.
- **Frost:** today's shader, kept unchanged.
- Changing surface **cross-fades** over about 0.6 s. When paused, the change snaps immediately. A change that arrives mid-fade is queued until the current fade lands, because retargeting at once dropped the half-visible surface in a single frame.

**Normals:** computed in the vertex shader by finite differences of the shaped position along both ribbon axes.

**Presets:**
- Polar Veil: bands + aurora
- Solar Storm: loops + aurora
- Quiet Dusk: bands + silk
- Ion Crown: loops + lace

No presets are added.

## Verification

- `corona-veil-loops.test.mjs`:
  - a full crown for every allowed count (angles increasing, no bunching, no holes)
  - depth, lean, span and height within their ranges
  - deterministic output
- Full `npm test` and `npm run build`.
- Canvas-captured contact sheet of all 8 combinations.
- No jumps during morph or cross-fade.
- Grid, sweep, ten switches with stable memory, export → import round trip.
