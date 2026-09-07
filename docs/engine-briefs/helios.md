# Brief: Helios Dynamo

**Engine id:** `helios` · **Name:** "Helios Dynamo" · **Badge:** "Magnetic Prominence"

> 3D magnetic coronal flux arcades loop above a dark, rotating photosphere. Relativistic plasma streams along magnetic field lines, flaring at reconnection points and erupting on command.

Read [../ENGINE-AUTHORING.md](../ENGINE-AUTHORING.md) first — this brief assumes the contract.

---

## The bet

An orb that reads as **generative burst / active ideation / high-throughput synthesis**. Current engines either slowly drift or rotate statically; Helios Dynamo provides energetic, magnetohydrodynamic vitality — plasma loops arcing above a stellar body, flaring with Alfvén wave pulses.

## Substrate

- **Coronal magnetic arcade**: A set of 3D magnetic flux tubes computed using magnetic dipole and multipole field equations anchored at bipolar active regions on the sphere shell.
- **Lines**: Drawn using `Line2` with screen-space resolution handling and vertex colors representing plasma density and ionization temperature.
- **Photosphere**: An inner opaque sphere with subtle solar granulation and active magnetic footprint spots where the flux loops anchor.
- **Plasma pulse packets**: Luminous plasma packets travelling along the magnetic arcades from one footprint to its conjugate partner.

## Motion design

1. **Alfvén wave streaming**: Continuous flow of plasma packets along the magnetic field lines, accelerating over loop apices.
2. **Arcade twist & breathing**: Field loops slowly twist and breathe under magnetic stress.
3. **Coronal mass ejection (`onPulse`)**: A pulse triggers a magnetic reconnection flare — loop footpoints flash incandescently and an expanding plasma shockwave erupts radially outward before dissipating into the corona.

## Proposed parameter schema

| Key | Type | Section | Range / options | Default | Notes |
|---|---|---|---|---|---|
| `loopCount` | select | `geometry` | 8, 16, 24, 32 | 16 | Number of magnetic arcade loops |
| `photosphereRadius` | number | `geometry` | 0.8 – 2.0, step 0.05 | 1.35 | Base stellar body radius |
| `prominenceHeight` | number | `geometry` | 1.2 – 2.6, step 0.05 | 1.85 | Maximum apex radius of magnetic loops |
| `lineWidth` | number | `geometry` | 1.0 – 5.0, step 0.1 | 2.2 | `LineMaterial.linewidth` |
| `loopTwist` | number | `motion` | 0.0 – 1.5, step 0.05 | 0.45 | Shear and helicity of magnetic lines — modulatable |
| `plasmaActivity` | number | `motion` | 0.2 – 2.5, step 0.05 | 1.2 | Density of plasma pulses along loops — modulatable |
| `breatheAmp` | number | `motion` | 0.0 – 0.15, step 0.005 | 0.04 | Radial expansion of the arcade — modulatable |
| `dynamoRate` | number | `motion` | 0.2 – 3.0, step 0.05 | 1.0 | Rate — excluded from modulation by name |
| `flareStrength` | number | `motion` | 0.2 – 2.5, step 0.05 | 1.5 | Intensity of CME flare on pulse — modulatable |
| `photosphereColor` | color | `colors` | — | `#ff5500` | Deep solar surface tint |
| `plasmaColor` | color | `colors` | — | `#ffc400` | Energetic loop stream tint |
| `flareColor` | color | `colors` | — | `#ff0055` | Extreme temperature reconnection tint |
| `glowIntensity` | number | `colors` | 0.4 – 3.0, step 0.1 | 1.8 | Coronal emission multiplier |

## Framing

`frame.radius ≈ prominenceHeight × 1.3`. Coronal loops extend to `prominenceHeight`.

## Specific risks

- **Line2 performance**: Size `loopCount` reasonably so that 9 simultaneous cells in grid mode maintain 60fps.
- **Clean footpoint anchoring**: Ensure loop start and end vertices cleanly contact the photosphere shell across all parameter variations.
