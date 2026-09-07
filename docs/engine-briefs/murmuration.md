# Brief: Murmuration

**Engine id:** `murmuration` · **Name:** "Murmuration" · **Badge:** "Emergent Swarm"

> A cloud of hundreds of agents, loosely bound to a spherical shell, moving under cohesion / separation / alignment forces and an attractor at the centre. Density gathers, splits, and re-forms. Nothing follows a path; the shape is a consequence.

Read [../ENGINE-AUTHORING.md](../ENGINE-AUTHORING.md) first — this brief assumes the contract.

---

## The bet

An orb that reads as **deliberating**: many possibilities held at once, converging, scattering, converging somewhere else. No current engine can express indecision, because all eight are deterministic functions of time and therefore always look equally certain.

This is also the project's first **stateful** engine. Agent positions depend on the previous frame, so acceleration, hesitation and settle come from the simulation instead of from the modulation rack. Whether that reads as more alive than a modulated stateless engine is the actual question this engine exists to answer — say what you observed in your final report.

## Substrate

`THREE.Points` with a custom `ShaderMaterial` (Hopf's particle system at [hopf-engine.js:74](../../src/engines/hopf-engine.js:74) is a working starting point — soft round sprites, additive, depth-scaled point size).

Trails matter enormously here: a static point cloud reads as noise, and a trailed one reads as motion. Suggested approach — a per-agent ring buffer of the last N positions rendered as a `Line2`, or a second `Points` cloud of decaying "ghosts". Start without trails, get the flocking legible, then add them; a swarm that looks wrong will look wrong with trails too.

## Motion design

Standard boids, bounded to a shell:

1. **Cohesion** — steer toward the local centroid
2. **Separation** — steer away from neighbours inside a radius
3. **Alignment** — match neighbour headings
4. **Shell binding** — a soft spring pulling each agent back toward `shellRadius`, so the swarm stays orb-shaped instead of drifting off screen
5. **Centre attractor** — a slow pull inward whose strength is the single most expressive parameter here; near zero the swarm disperses into a shell, high it collapses into a dense core

Neighbour search: with a few hundred agents, brute-force O(n²) is fine and honest. Do not build a spatial hash before you have measured that you need one.

Integrate `delta`, not a constant — that is what keeps pause, `timeScale` and the rack's `_timeScale` working.

**Clamp `delta`.** A tab regaining focus, or the hidden-pane trap in §7 of the authoring guide, can deliver a delta of a full second and detonate the simulation. `Math.min(delta, 1/30)` per step.

`onPulse()` should inject an impulse — a burst of outward velocity that the flocking forces then reel back in. This is the engine's signature moment and should be tuned deliberately.

## Proposed parameter schema

A starting point, not a spec. Refine as you build and report what you changed.

| Key | Type | Section | Range / options | Default | Notes |
|---|---|---|---|---|---|
| `agentCount` | select | `geometry` | 128, 256, 512, 1024 | 256 | Rebuilds buffers — must be `geometry` |
| `shellRadius` | number | `geometry` | 0.8 – 2.6, step 0.05 | 1.7 | Also drives `frame.radius` |
| `pointSize` | number | `motion` | 0.5 – 6.0, step 0.1 | 2.0 | Uniform write only — keep out of `geometry` |
| `trailLength` | select | `geometry` | 0, 4, 8, 16 | 8 | 0 disables trails entirely |
| `cohesion` | number | `motion` | 0.0 – 1.0, step 0.01 | 0.40 | |
| `separation` | number | `motion` | 0.0 – 1.0, step 0.01 | 0.55 | |
| `alignment` | number | `motion` | 0.0 – 1.0, step 0.01 | 0.35 | |
| `neighbourRadius` | number | `motion` | 0.1 – 1.5, step 0.05 | 0.55 | |
| `attractorPull` | number | `motion` | 0.0 – 2.0, step 0.05 | 0.5 | The expressive one |
| `shellBinding` | number | `motion` | 0.0 – 2.0, step 0.05 | 0.8 | |
| `agentSpeed` | number | `motion` | 0.1 – 3.0, step 0.05 | 1.0 | Name matches the rate pattern → excluded from modulation. Correct: it is a rate. |
| `damping` | number | `motion` | 0.80 – 0.999, step 0.005 | 0.96 | How quickly the swarm settles |
| `coreColor` | color | `colors` | — | `#ffed00` | Agents near the centre |
| `edgeColor` | color | `colors` | — | `#00f2fe` | Agents at the shell |
| `glowIntensity` | number | `colors` | 0.4 – 3.0, step 0.1 | 1.4 | |
| `trailFade` | number | `colors` | 0.0 – 1.0, step 0.05 | 0.6 | |

Colour agents by **speed or by radius**, not by index — that is what makes the density structure legible rather than confetti.

Note the section discipline: `pointSize` and `trailFade` are uniform writes and belong in `motion`/`colors` so the rack can reach them. `agentCount` and `trailLength` resize buffers and must be `geometry`. Getting this backwards either locks out the interesting modulation targets or thrashes the GPU — see authoring guide §3.

## Framing

`frame.radius` should be roughly `shellRadius × 1.35` at defaults — the swarm overshoots its shell under separation pressure, and a radius measured on the shell alone will crop. Measure it; don't guess. Since `shellRadius` is user-editable and `frame` is read once at construction, framing will be slightly loose at range extremes. That is acceptable and matches how the other engines behave.

## Specific risks

- **Nine simultaneous simulations.** The variation grid builds nine independent instances. 256 agents × 9 cells × O(n²) neighbour search is ~590k distance checks per frame. Budget for it: either keep the default count modest, cheapen the inner loop, or skip the neighbour search every other frame in cells. Measure before optimising — but *do* measure, in grid mode, not just the main view.
- **Divergent cells.** Nine simulations from nine different random seeds will look like nine unrelated engines rather than nine variations. Seed the RNG deterministically from the parameter bag, or from a fixed seed, so cells differ because of their parameters and not because of noise. This is the difference between a usable grid and a useless one.
- **Blowup.** Unbounded velocity plus a large `delta` sends agents to infinity, which shows as an empty frame and reads as "the engine is broken". Clamp velocity magnitude as well as `delta`.
- **No bloom in grid cells.** If the swarm is only visible because of the bloom pass, cells will look empty. Put the glow in the point shader.

## Acceptance criteria

Beyond the standard Definition of Done in authoring guide §8:

- [ ] At `attractorPull` min and max the swarm reads as visibly *different behaviour*, not just different size
- [ ] `onPulse()` produces a scatter that visibly re-gathers over 1–2 seconds
- [ ] The nine grid cells differ by parameters, not by seed — reseeding the grid twice with identical parameters produces identical cells
- [ ] Sixty seconds of continuous running leaves no agent outside `2 × shellRadius`
- [ ] Frame rate holds in grid mode at the default agent count — paste the measured number
