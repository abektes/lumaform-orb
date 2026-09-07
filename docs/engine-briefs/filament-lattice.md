# Brief: Filament Lattice

**Engine id:** `filament` · **Name:** "Filament Lattice" · **Badge:** "Spring Network"

> Nodes on a geodesic sphere, connected by springs. At rest it breathes almost imperceptibly. Disturb it and a wave travels across the surface, reflects, interferes with itself, and rings down. The structure is rigid; the behaviour is elastic.

Read [../ENGINE-AUTHORING.md](../ENGINE-AUTHORING.md) first — this brief assumes the contract.

---

## The bet

An orb that reads as **propagating** — a signal entering, crossing the structure, and settling. Recognisably a *response* rather than a loop.

This engine is also the first real user of `onPulse()`. Every current engine implements it as a scalar that decays over a fixed curve, which is a fade, not a physical response. Here the pulse is an actual impulse into an actual simulation, so overshoot, reflection and interference are emergent. If the hypothesis in [VISION.md](../VISION.md) §4 — that character lives in motion *shape* — is right, this engine should demonstrate it more clearly than anything else in the library.

## Substrate

- **Edges:** `Line2` + `LineGeometry` + `LineMaterial`, positions rewritten each frame via `setPositions()`. [hopf-engine.js:234](../../src/engines/hopf-engine.js:234) proves this pattern is fast enough at this scale. One `Line2` for the whole network is far cheaper than one per edge.
- **Nodes:** `THREE.InstancedMesh` of a small sphere, one instance per node, matrices updated per frame. [tesseract-engine.js:136](../../src/engines/tesseract-engine.js:136) is the reference.
- **`LineMaterial.resolution` must be updated in `onResize`** or line widths go wrong.

## Motion design

Verlet integration over a fixed topology:

1. Build a geodesic sphere at the chosen subdivision. Nodes are vertices; springs are edges. Each node keeps a `restPosition`.
2. Each frame: accumulate spring forces (Hooke against edge rest length), plus a weak tether pulling each node toward its own `restPosition` so the lattice cannot collapse or drift, plus damping.
3. Integrate with `delta`. **Clamp it** — `Math.min(delta, 1/60)` — and consider substepping. Springs are the least forgiving thing in this repo with respect to the hidden-pane trap in authoring guide §7, where a single frame can carry a full second.
4. Idle behaviour: a small continuous excitation so the lattice is never perfectly still. A slow travelling wave driven by `time`, or low-amplitude noise injected at random nodes. **An orb frozen at rest reads as broken, not as calm.**

`onPulse()` displaces one node (or a small cap of nodes) outward by `pulseStrength`. Everything after that is the simulation. Tune the default `stiffness`/`damping` pair so the ring-down lasts roughly 1.5–3 seconds — long enough to watch, short enough not to feel stuck.

Consider making the pulse entry point rotate between calls, so repeated clicks don't look identical.

## Proposed parameter schema

A starting point, not a spec. Refine as you build and report what you changed.

| Key | Type | Section | Range / options | Default | Notes |
|---|---|---|---|---|---|
| `subdivision` | select | `geometry` | 1, 2, 3 | 2 | Icosahedron detail. Node count grows fast — 3 is already ~642 nodes |
| `radius` | number | `geometry` | 0.8 – 2.4, step 0.05 | 1.6 | Rest sphere radius |
| `nodeSize` | number | `motion` | 0.0 – 0.10, step 0.005 | 0.03 | Instance scale only — cheap, so not `geometry` |
| `lineWidth` | number | `geometry` | 0.5 – 5.0, step 0.1 | 1.8 | Material property; `geometry` is defensible but `motion` is fine if it is a pure material write. Pick one and comment why |
| `stiffness` | number | `motion` | 0.05 – 1.0, step 0.01 | 0.35 | With `damping`, the character parameter |
| `damping` | number | `motion` | 0.80 – 0.995, step 0.005 | 0.94 | |
| `tether` | number | `motion` | 0.0 – 0.5, step 0.01 | 0.06 | Pull toward rest position; 0 lets the lattice deform permanently |
| `pulseStrength` | number | `motion` | 0.0 – 1.5, step 0.05 | 0.5 | |
| `idleExcitation` | number | `motion` | 0.0 – 0.3, step 0.01 | 0.05 | Never let the default be 0 |
| `waveSpeed` | number | `motion` | 0.0 – 2.0, step 0.05 | 0.4 | Rate — correctly excluded from modulation by name |
| `displacementGlow` | number | `colors` | 0.0 – 3.0, step 0.1 | 1.5 | How strongly displacement maps to brightness |
| `restColor` | color | `colors` | — | `#1e293b` | Undisturbed edges |
| `activeColor` | color | `colors` | — | `#ffed00` | Maximally displaced edges |
| `nodeColor` | color | `colors` | — | `#ffffff` | |

**Colour edges by displacement from rest**, interpolating `restColor → activeColor`. This is what makes the travelling wave visible; a uniformly coloured lattice hides its own behaviour and the whole engine falls flat.

## Framing

`frame.radius ≈ radius × 1.25` at defaults — displacement pushes nodes outside the rest sphere and a radius measured at rest will crop the pulse, which is the one moment worth seeing. Measure at maximum excursion, not at rest.

## Specific risks

- **Explosion.** Stiff springs plus a large `delta` diverges within a handful of frames, and the failure mode is a full-screen mess of lines. Clamp `delta`, clamp per-node velocity, and clamp the maximum displacement from `restPosition`. Test explicitly by injecting `studio.clock.getDelta = () => 0.5` for one frame and confirming recovery.
- **Cell divergence.** Nine grid cells running nine simulations must differ by parameters, not by accumulated numerical drift. The topology is deterministic, so this is easier than for Murmuration — but any random idle excitation must be seeded deterministically or the grid becomes uncomparable.
- **`subdivision: 3` in nine cells.** ~642 nodes and ~1920 edges × 9. Measure it. If it does not hold 60fps, cap the select at 2 rather than shipping an option that only works in the main view.
- **Rebuild discipline.** `subdivision` and `radius` rebuild the topology. Gate them tightly in `setParams` — a rebuild triggered by a colour change would make every param tween stutter.
- **No bloom in grid cells.** Put the glow in the line colours, not in the post pass.

## Acceptance criteria

Beyond the standard Definition of Done in authoring guide §8:

- [ ] A click produces a visible wave that crosses the sphere, reflects, and rings down — describe the observed duration
- [ ] `stiffness` at min and max produce recognisably different *characters* (slack and sluggish vs. tight and quick), not just different amplitudes
- [ ] The lattice is never perfectly static at defaults
- [ ] Injecting a single 0.5 s delta does not destroy the simulation
- [ ] Sixty seconds of idle running leaves the lattice within 1.5× `radius`
- [ ] Frame rate holds in grid mode at the default subdivision — paste the measured number
