# Brief: Superposition

**Engine id:** `superposition` · **Name:** "Superposition" · **Badge:** "Quantum Wavepacket"

> Coherent quantum orbital probability lobes expand and beat with complex quantum phase interference. Observation collapses the wavepacket into an intense localized focal lobe that smoothly revives.

Read [../ENGINE-AUTHORING.md](../ENGINE-AUTHORING.md) first — this brief assumes the contract.

---

## The bet

An orb that reads as **hypothesizing under uncertainty / weighing multiple possibilities**.
Instead of a static ball or noisy scatter of dots, Superposition renders coherent physical orbital lobes (\(sp\) hybrid, \(d_{z^2}/d_{x^2-y^2}\), \(f\) octupole, and chiral vortex) whose probability envelopes breathe and beat with phase interference.

## Substrate

- **Dual Nested Probability Shells**: Coherent Fibonacci point shells deformed into actual 3D hydrogenic probability lobes via GPU vertex shader.
- **Complex Phase Coloring**: Hue tracks quantum phase \(\arg(\Psi)\) smoothly across the lobe surfaces.
- **Quantum Nucleus**: A radiant faceted core anchor at the origin.

## Motion design

1. **Orbital Phase Beating**: Continuous phase evolution \(\Delta E / \hbar\) rotates and beats the probability lobes.
2. **Vocal & Acoustic Wave Excursion**: Speech and audio modulation directly drives `waveExcursion`, expanding the lobes in rhythm with vocal intensity.
3. **Measurement Collapse (`onPulse`)**: A pulse acts as quantum measurement—the wavepacket instantly collapses into a sharp localized eigenstate lobe with intense radiance, before coherently relaxing back into superposition.

## Proposed parameter schema

| Key | Type | Section | Range / options | Default | Notes |
|---|---|---|---|---|---|
| `sampleDensity` | select | `geometry` | 4096, 6144, 8192, 12288 | 6144 | Number of orbital shell samples |
| `orbitalScale` | number | `geometry` | 0.8 – 2.2, step 0.05 | 1.45 | Overall scale of the wavepacket |
| `nucleusRadius` | number | `geometry` | 0.2 – 0.6, step 0.02 | 0.38 | Central quantum gem radius |
| `stateMode` | select | `geometry` | hybrid_sp, d_orbital, f_orbital, chiral_vortex | d_orbital | Quantum orbital eigenmode mixture |
| `pointSize` | number | `motion` | 1.0 – 6.0, step 0.1 | 2.8 | Screen-space point size |
| `coherence` | number | `motion` | 0.0 – 1.0, step 0.02 | 0.85 | Phase coherence contrast |
| `waveExcursion` | number | `motion` | 0.1 – 1.0, step 0.02 | 0.45 | **Primary voice target:** Lobe expansion with speech |
| `breatheAmp` | number | `motion` | 0.0 – 0.12, step 0.005 | 0.04 | Respiration amplitude |
| `phaseRate` | number | `motion` | 0.2 – 3.0, step 0.05 | 1.1 | Rate — excluded from modulation by name |
| `collapseStrength` | number | `motion` | 0.2 – 2.5, step 0.05 | 1.4 | Collapse sharpness on pulse |
| `psiColorA` | color | `colors` | — | `#38bdf8` | Phase real component tint |
| `psiColorB` | color | `colors` | — | `#f43f5e` | Phase imaginary component tint |
| `nodalColor` | color | `colors` | — | `#e0f2fe` | High-probability nodal spark |
| `glowIntensity` | number | `colors` | 0.4 – 3.0, step 0.1 | 1.8 | Radiance multiplier |

## Framing

`frame.radius ≈ orbitalScale × 1.45`.

## Acceptance criteria

- [ ] Coherent, physical orbital shapes (cloverleaf, toroidal collar, directional teardrop) rather than noisy dots.
- [ ] Responsive to speech: modulating `waveExcursion` causes the lobes to breathe and beat dynamically.
- [ ] 10 engine switch cycles leave 0 leaks.
