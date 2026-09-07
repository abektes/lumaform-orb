# Brief: Curl Drift

**Engine id:** `curldrift` · **Name:** "Curl Drift" · **Badge:** "Advected Flow"

> Ribbons of light carried through a divergence-free noise field wrapped around a spherical shell. They stretch, braid, and fold into each other. Nothing rotates; everything flows.

Read [../ENGINE-AUTHORING.md](../ENGINE-AUTHORING.md) first — this brief assumes the contract.

---

## The bet

An orb that reads as **streaming** — output being produced, a channel that is open and moving. Every current engine expresses motion as rotation, and rotation is cyclic: it returns, so it reads as waiting. Directional flow does not return, so it reads as *producing*.

Stateful, like Murmuration and Filament Lattice: a streamline's position depends on where it was last frame, not on `time`.

## Substrate

`Line2` polylines, positions rewritten each frame via `setPositions()` — the pattern at [hopf-engine.js:234](../../src/engines/hopf-engine.js:234). One `Line2` per streamline, or a single `Line2` with degenerate segments between streamlines if the per-object count becomes a problem.

Each streamline is a trailing history of one advected particle: a fixed-length ring buffer of past positions, oldest at the tail. Advance the head each frame; the tail is whatever falls out.

Vertex colours give you the fade along the trail for free — Hopf's `geom.setColors()` usage is the reference. `LineMaterial.resolution` must be updated in `onResize`.

## Motion design

Curl noise: the curl of a 3D noise field is divergence-free, so streamlines never converge to a point or vanish. That property is what makes it look like fluid rather than like particles falling toward an attractor, and it is the whole reason to use curl noise instead of sampling noise directly.

```
velocity(p) = curl(noiseField(p × fieldScale + time × fieldEvolve))
```

Approximate the curl by finite differences of a 3D noise function on each axis. The repo already has seedable value noise and `fbm` in [modulation.js](../../src/core/modulation.js) — those are 1D. You will need a 3D variant; keep it in the engine file, deterministic and seeded, and do **not** modify `modulation.js` (it is DOM-free specifically so it can be unit-tested, and it is on the critical path for every engine).

Bounding: a soft radial force keeping particles near `shellRadius`, plus **respawn on escape** — when a particle leaves the bounds, teleport it to a new position on the shell and clear its trail so no line snaps across the sphere. That snapping artefact is the characteristic failure of this technique and the first thing a reviewer will notice.

Also respawn on a staggered lifetime, so streamlines don't all reset at once.

Integrate `delta`, clamped: `Math.min(delta, 1/30)`.

`onPulse()` should spike `flowSpeed` briefly, or inject a radial burst into the field — a surge that then relaxes.

## Proposed parameter schema

A starting point, not a spec. Refine as you build and report what you changed.

| Key | Type | Section | Range / options | Default | Notes |
|---|---|---|---|---|---|
| `streamCount` | select | `geometry` | 32, 64, 128, 256 | 128 | Allocates `Line2` objects — must be `geometry` |
| `trailLength` | select | `geometry` | 16, 32, 64, 96 | 48 | Ring buffer size |
| `shellRadius` | number | `geometry` | 0.8 – 2.4, step 0.05 | 1.6 | |
| `lineWidth` | number | `motion` | 0.5 – 5.0, step 0.1 | 1.6 | Pure material write — keep it modulatable |
| `fieldScale` | number | `motion` | 0.2 – 3.0, step 0.05 | 0.9 | Broad sweeps vs. tight curls. The most expressive parameter |
| `fieldEvolve` | number | `motion` | 0.0 – 1.0, step 0.01 | 0.12 | How fast the field itself changes |
| `flowSpeed` | number | `motion` | 0.1 – 3.0, step 0.05 | 0.8 | Rate — excluded from modulation by name. Correct. |
| `shellBinding` | number | `motion` | 0.0 – 2.0, step 0.05 | 0.7 | |
| `swirl` | number | `motion` | 0.0 – 1.5, step 0.05 | 0.3 | Tangential bias — banded, more directional flow |
| `lifetimeJitter` | number | `motion` | 0.0 – 1.0, step 0.05 | 0.5 | Staggers respawns |
| `headColor` | color | `colors` | — | `#00f2fe` | Leading end of each trail |
| `tailColor` | color | `colors` | — | `#a855f7` | Trailing end |
| `glowIntensity` | number | `colors` | 0.4 – 3.0, step 0.1 | 1.3 | |
| `tailFade` | number | `colors` | 0.0 – 1.0, step 0.05 | 0.7 | Alpha falloff along the trail |

## Framing

`frame.radius ≈ shellRadius × 1.3` at defaults — streamlines wander outside the shell before the binding force reels them back. Measure at steady state after ~10 seconds of running, not on the first frame.

## Specific risks

- **Trail snapping.** A particle that respawns without its trail being cleared draws a line straight across the orb. This is the defining failure mode of the technique; check for it explicitly and describe how you handled it.
- **`Line2` object count.** 256 streamlines is 256 draw calls, × 9 in grid mode. Measure. If it does not hold, cap `streamCount` at what actually works rather than shipping an unusable maximum.
- **Cost of curl.** Finite-difference curl is ~6 noise evaluations per particle per frame. At 96 particles × 9 cells that is ~5.2k noise calls per frame. Keep the noise function cheap and non-allocating.
- **Cell divergence.** Nine cells must differ by parameters, not by random spawn positions. Seed spawn points deterministically — otherwise the grid compares nine unrelated things and is useless for its actual purpose.
- **Reading as spaghetti.** Too many streamlines, too long, too bright and the structure disappears into noise. The head/tail colour gradient and `tailFade` are what keep direction legible. Default toward fewer, clearer streamlines.
- **No bloom in grid cells.** Glow must be in the vertex colours.

## Acceptance criteria

Beyond the standard Definition of Done in authoring guide §8:

- [ ] Flow direction is legible at a glance — you can tell which way it is going from a still frame
- [ ] No streamline ever draws a straight segment across the orb — sixty seconds of observation, stated explicitly
- [ ] `fieldScale` min and max give recognisably different flow characters (broad sweeps vs. tight curls)
- [ ] The nine grid cells differ by parameters, not by spawn seed — reseeding twice with identical parameters produces identical cells
- [ ] Frame rate holds in grid mode at the default stream count — paste the measured number
