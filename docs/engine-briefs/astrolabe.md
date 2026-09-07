# Brief: Astrolabe

**Engine id:** `astrolabe` · **Name:** "Astrolabe" · **Badge:** "Kinetic Armillary"

> Concentric gimballed coordinate rings rotate with precision celestial mechanics around a datum core. Graduated tick marks and floating vernier calipers track astronomical precession.

Read [../ENGINE-AUTHORING.md](../ENGINE-AUTHORING.md) first — this brief assumes the contract.

---

## The bet

An orb that reads as **deliberating / calculating / navigating**.
Instead of noisy ungrounded lines ("AI slop"), Astrolabe presents timeless mechanical and astronomical craft: precision armillary rings (Meridian, Equator, Ecliptic, Colure) with engraved coordinate ticks and orbiting vernier indices.

## Substrate

- **Armillary Rings**: Concentric `Line2` circular hoops gimballed on three 3D axes.
- **Graduation Ticks**: Perpendicular radial tick marks along each ring (`Line2`).
- **Floating Vernier Indicators**: Orbiting caliper markers indicating active celestial calculations.
- **Datum Core**: Dark machined central sphere with subtle equatorial seam.

## Motion design

1. **Differential Precession**: Rings counter-rotate according to harmonic gear ratios.
2. **Gyroscopic Nutation**: Voice and audio levels induce rhythmic nutation oscillations and gimbal breathing.
3. **Astronomical Transit (`onPulse`)**: A pulse triggers an eclipse alignment—the rings momentarily snap into plane, flaring the vernier indicators before releasing into precession.

## Proposed parameter schema

| Key | Type | Section | Range / options | Default | Notes |
|---|---|---|---|---|---|
| `ringCount` | select | `geometry` | 3, 4, 5 | 4 | Number of gimballed rings |
| `armillaryRadius` | number | `geometry` | 0.8 – 2.0, step 0.05 | 1.55 | Overall armillary radius |
| `datumCoreRadius` | number | `geometry` | 0.3 – 1.0, step 0.05 | 0.65 | Central globe radius |
| `lineWidth` | number | `geometry` | 1.0 – 5.0, step 0.1 | 2.2 | `LineMaterial.linewidth` |
| `tickLength` | number | `geometry` | 0.05 – 0.25, step 0.01 | 0.12 | Length of graduation ticks |
| `ringSpread` | number | `motion` | 0.0 – 0.8, step 0.02 | 0.28 | Gimbal angular separation — voice modulatable |
| `nutationAmp` | number | `motion` | 0.0 – 0.25, step 0.005 | 0.08 | Gyroscopic wobble amplitude |
| `gearRatio` | number | `motion` | 0.5 – 3.0, step 0.05 | 1.5 | Harmonic differential ratio |
| `breatheAmp` | number | `motion` | 0.0 – 0.12, step 0.005 | 0.035 | Mechanical breath |
| `precessionRate` | number | `motion` | 0.2 – 3.0, step 0.05 | 0.8 | Rate — excluded from modulation by name |
| `transitSurge` | number | `motion` | 0.2 – 2.5, step 0.05 | 1.5 | Transit alignment flare on pulse |
| `ringColor` | color | `colors` | — | `#38bdf8` | Precision ring hoop tint |
| `vernierColor` | color | `colors` | — | `#ffed00` | Caliper indicator highlight |
| `coreColor` | color | `colors` | — | `#0c4a6e` | Central datum sphere tint |
| `glowIntensity` | number | `colors` | 0.4 – 3.0, step 0.1 | 1.7 | Instrument radiance |

## Framing

`frame.radius ≈ armillaryRadius × 1.35`.

## Acceptance criteria

- [ ] Zero "AI slop": clean, deliberate, timeless astronomical geometry.
- [ ] Voice reactive: audio modulates `ringSpread` and `nutationAmp` smoothly.
- [ ] 10 engine switch cycles leave 0 leaks.
