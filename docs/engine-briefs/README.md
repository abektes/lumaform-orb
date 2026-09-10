# Engine Briefs

One brief per proposed engine. Each is self-contained: an agent should be able to build the engine from its brief plus [../ENGINE-AUTHORING.md](../ENGINE-AUTHORING.md) without further context.

**Implementation status:** all four briefs are built. The same expansion also
added four original concepts designed to cover additional visual vocabularies.
Mycelium was later replaced by Chromasphere: it was the fourth glowing-line engine
of the batch and competed with Filament, Curl Drift and Echo Rings for the same
visual territory, while nothing in the library was solid, opaque or reflective.

| Engine | Concept | Substrate | Bet |
|---|---|---|---|
| Prism Bloom | Iridescent crystalline petals | Instanced mesh + shader | Reads as **opening / receptive** |
| Corona Veil | Aurora membranes around a dark core | Instanced ribbon shader | Reads as **quietly active** |
| Echo Rings | Remembered spherical wavefronts | Line2 + pulse pool | Reads as **acknowledging** |
| Chromasphere | Solid mirrored body under an analytic studio | Opaque shader mesh | Reads as **present / physical** |
| [Vocalis](vocalis.md) | Acoustic diaphragm & formant ripples | Line2 ribbons + vocal nucleus | Reads as **speaking / vocal articulation** |
| [Aetheria](aetheria.md) | Chromatic fluid pearl & silk caustics | Displaced fluid sphere + silk caustics | Reads as **listening / receptive presence** |
| [Superposition](superposition.md) | Coherent quantum orbital wavepacket | Structured shells + phase lobes | Reads as **hypothesizing / uncertainty** |
| [Synthesis](synthesis.md) | 4-body fluid orbital fusion & stardust | Potential metaballs + filaments + stardust | Reads as **deliberation / harmonious thought** |
| [Ferro Trails](ferro-trails.md) | Magnetic fluid core & sweeping arc trails | Deformed ellipsoid + Line2 arc trails | Reads as **dynamic focus / magnetic intelligence** |

| Brief | Concept | Substrate | Bet | Difficulty |
|---|---|---|---|---|
| [murmuration.md](murmuration.md) | Agent swarm on a sphere shell | Points + trails | Reads as **deliberating** | Medium |
| [filament-lattice.md](filament-lattice.md) | Verlet spring network on a geodesic | Line2 + instanced nodes | Reads as **propagating** | Medium-hard |
| [aqueous.md](aqueous.md) | Refracting displaced blob | Transmissive mesh | Reads as **listening / at rest** | Easy |
| [curl-drift.md](curl-drift.md) | Ribbons advected through a curl-noise field | Line2 | Reads as **streaming / speaking** | Medium |
| [vocalis.md](vocalis.md) | Vocal articulation & diaphragm | Line2 ribbons + core | Reads as **speaking / voice reactive** | Medium |
| [aetheria.md](aetheria.md) | Iridescent chromatic fluid pearl | Fluid mesh + caustics | Reads as **listening / gentle presence** | Medium |
| [superposition.md](superposition.md) | Quantum orbital wavepacket | Structured phase lobes | Reads as **hypothesizing / uncertainty** | Medium |
| [synthesis.md](synthesis.md) | 4-body fluid orbital fusion | Metaball bodies + filaments | Reads as **deliberation / thought** | Medium |
| [ferro-trails.md](ferro-trails.md) | Magnetic fluid core & sweeping arc trails | Deformed ellipsoid + Line2 arc trails | Reads as **dynamic focus / magnetic intelligence** | Medium |

---

## Why these four

At the time these briefs were written, the eight existing engines clustered into exactly two substrates:

| Substrate | Engines |
|---|---|
| `Line2` wireframe over analytic geometry | Tesseract, Moiré, Hopf, Polytope, Auris |
| Full-screen raymarch quad | Nebula, Quantum, Singularity |

Nothing used particles as its primary substrate, nothing used a physical material, and — the structural point — **nothing carried internal state.** All eight computed their pose as `f(time × rate)`. That is precisely why [VISION.md](../VISION.md) §4 observes that the only native axis is faster/slower, and why the modulation rack had to be built to supply "shape" from outside.

Three of these four (Murmuration, Filament Lattice, Curl Drift) are **stateful**: their pose depends on the previous frame, not just on `time`. Acceleration, hesitation, overshoot and settle emerge from the simulation rather than being painted on. Whether that reads better than a modulated stateless engine is the open question they exist to answer, and it is not currently testable with anything in the repo.

Aqueous is the deliberate exception: no simulation, easiest of the four, and it fills the equally real gap that every current engine is thin, radiant and hard-edged. Nothing in the library is soft or heavy.

---

## Dispatching an agent

Give the agent this, substituting the brief:

> Build a new engine for the Lumaform Orb project at the repository root.
>
> Read these three files first, in order, and follow them:
> 1. `docs/VISION.md` — why this project exists and what it is not
> 2. `docs/ENGINE-AUTHORING.md` — the engine contract, invariants, and definition of done
> 3. `docs/engine-briefs/<BRIEF>.md` — the engine you are building
>
> The parameter schema in the brief is a starting proposal, not a specification — refine it as you build, but keep the `section` assignments honest per §3 of the authoring guide, and say what you changed and why.
>
> Do not modify any other engine, the studio, or the UI. If the engine genuinely cannot be built within the contract, stop and report that rather than working around it — that is more useful than a working engine plus an invasive change.
>
> Complete the entire Definition of Done checklist in §8 of the authoring guide, including the verification commands, and paste the actual output. Do not report the engine as finished on the basis that it looks right.

## Running several in parallel

The engines share no source files except the catalog group they belong to:

- `src/engines/<name>-engine.js` — the factory
- `src/core/catalog/<group>.js` — one entry (id, info, schema, factory, defaultPreset)

Running agents in separate worktrees is safe; expect trivial conflicts in those two files at merge time, all resolvable by keeping both sides. Nothing else overlaps.

Merge and verify **one at a time**. The framing, grid and memory checks in §7 of the authoring guide only mean anything against a tree where the previous engine already passed them.
