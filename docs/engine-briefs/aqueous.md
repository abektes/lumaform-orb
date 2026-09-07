# Brief: Aqueous

**Engine id:** `aqueous` · **Name:** "Aqueous" · **Badge:** "Refractive Body"

> A single soft body — a displaced sphere with a thick, glassy, refracting surface and a light source inside it. It has volume and weight. It breathes rather than spins.

Read [../ENGINE-AUTHORING.md](../ENGINE-AUTHORING.md) first — this brief assumes the contract.

---

## The bet

Every one of the eight existing engines is thin, radiant and hard-edged: wireframes, lattices, particle fields, emissive raymarched volumes. **Nothing in the library is soft, heavy, or physical.** An orb that reads as *present and at rest* — listening, idle, calm — probably cannot be built from glowing lines, and the tool currently cannot even attempt it.

This is the easiest of the four briefs and has no simulation. Build it first if you are calibrating against the codebase.

## Substrate

Two viable routes. **Prefer the first** unless you find a concrete reason not to, and say which you chose and why.

**A. `MeshPhysicalMaterial` with transmission.** Three.js gives you `transmission`, `thickness`, `ior`, `roughness` and `iridescence` directly. Deform the surface either by displacing vertices on the CPU each frame, or in an `onBeforeCompile` vertex hook. Least code, most physically plausible.

> Verify against the Three.js 0.160 docs before relying on any specific property — this is the one brief that leans on library behaviour rather than hand-rolled shaders, and transmission has real caveats (it needs a background to refract, it interacts with `renderer.transmissionResolutionScale`, and it can be expensive).

**B. A hand-rolled `ShaderMaterial`** doing fake refraction: offset an environment or gradient lookup by the view-space normal, plus fresnel rim and an internal glow term. Cheaper, fully controlled, matches how the rest of the repo works, but you will be hand-building what route A gives you.

Either way the surface is an `IcosahedronGeometry` at detail 4–6, displaced by layered 3D noise. An internal core — a small emissive sphere, additive, depth-write off — gives the body something to refract and is what stops it reading as a grey blob.

## Motion design

The whole point is that it does **not** spin. Sources of motion:

1. **Breathing** — a slow radial scale on `sin(time × breatheSpeed)`. Small: 2–5%.
2. **Surface drift** — the noise field's evaluation point moves slowly through 3D space, so bumps migrate across the surface instead of the surface rotating past fixed bumps. This is what makes it read as liquid rather than as a rotating potato, and it is the single most important detail in this brief.
3. **Settle after a pulse** — `onPulse()` deforms the body, which relaxes back. No simulation needed: a decaying amplitude on an extra noise octave is enough.

Very slow global rotation is acceptable as a secondary cue but must not be the primary motion.

## Proposed parameter schema

A starting point, not a spec. Refine as you build and report what you changed.

| Key | Type | Section | Range / options | Default | Notes |
|---|---|---|---|---|---|
| `detail` | select | `geometry` | 3, 4, 5, 6 | 5 | Icosphere subdivision — rebuilds geometry |
| `radius` | number | `geometry` | 0.8 – 2.2, step 0.05 | 1.5 | |
| `displaceAmount` | number | `motion` | 0.0 – 0.5, step 0.01 | 0.18 | Vertex or uniform write, never a rebuild — keep out of `geometry` |
| `displaceScale` | number | `motion` | 0.3 – 4.0, step 0.05 | 1.4 | Noise frequency; bumpy vs. lobed |
| `displaceOctaves` | select | `geometry` | 1, 2, 3, 4 | 3 | Changes the evaluation loop |
| `breatheSpeed` | number | `motion` | 0.0 – 2.0, step 0.05 | 0.35 | Rate — excluded from modulation by name. Correct. |
| `breatheAmp` | number | `motion` | 0.0 – 0.15, step 0.005 | 0.04 | Modulate *this* for tempo character |
| `driftSpeed` | number | `motion` | 0.0 – 1.5, step 0.05 | 0.25 | Rate — how fast bumps migrate |
| `pulseDeform` | number | `motion` | 0.0 – 0.6, step 0.02 | 0.25 | |
| `transmission` | number | `colors` | 0.0 – 1.0, step 0.01 | 0.85 | |
| `thickness` | number | `colors` | 0.0 – 3.0, step 0.05 | 1.2 | |
| `ior` | number | `colors` | 1.0 – 2.4, step 0.01 | 1.42 | |
| `roughness` | number | `colors` | 0.0 – 1.0, step 0.01 | 0.15 | |
| `bodyColor` | color | `colors` | — | `#2dd4bf` | Surface tint |
| `coreColor` | color | `colors` | — | `#ffed00` | Internal light |
| `coreIntensity` | number | `colors` | 0.0 – 4.0, step 0.1 | 1.6 | |
| `fresnelPower` | number | `colors` | 0.5 – 6.0, step 0.1 | 2.5 | Rim falloff |

Note that the four most expressive parameters here — `displaceAmount`, `breatheAmp`, `thickness`, `coreIntensity` — are all in modulatable sections. That is deliberate and is most of the point: this engine should be extremely responsive to the modulation rack.

## Framing

`frame.radius ≈ radius + displaceAmount + breatheAmp × radius`, plus a little margin. Measure at full excursion, not at rest.

## Specific risks

- **Transmission and the grid.** `MeshPhysicalMaterial` transmission renders the scene to a transmission buffer. Nine cells with scissored viewports and a shared renderer is exactly the kind of setup that breaks. **Test grid mode early — before polishing the look** — and if transmission is unusable there, fall back to route B rather than special-casing the grid. An engine that only works in the main view is not finished.
- **Cost.** Transmission plus an icosphere at detail 6 × 9 cells will not be free. Scale `detail` down for cells if needed via the `marchQuality` hint, which is `0.7` in cells.
- **Reading as a grey blob.** Against the default `#000000` background there may be nothing to refract. The internal core, the fresnel rim, and a subtle background gradient are what carry the read. Budget real time for this; it is the main aesthetic risk.
- **CPU displacement cost.** Displacing every vertex on the CPU each frame at detail 6 is ~5k vertices — fine for one instance, questionable for nine. Prefer displacing in the vertex shader.
- **No bloom in grid cells.** The core glow must survive without the post pass.

## Acceptance criteria

Beyond the standard Definition of Done in authoring guide §8:

- [ ] The body reads as having volume and weight at rest, with no rotation — screenshot at defaults
- [ ] Surface features migrate across the body rather than rotating with it
- [ ] Grid mode renders nine correct cells — screenshot, and state which substrate route you used and why
- [ ] `transmission` at 0 and 1 give recognisably different materials, both usable
- [ ] Modulating `breatheAmp` from the rack produces a visible, smooth change with no jump
