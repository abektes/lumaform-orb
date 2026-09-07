# Brief: Vocalis

**Engine id:** `vocalis` · **Name:** "Vocalis" · **Badge:** "Vocal Diaphragm"

> Concentric acoustic diaphragm rings open and articulate around a radiant vocal nucleus. Syllables trigger phonetic ripples along the diaphragm perimeters, built specifically for expressive speech visualization.

Read [../ENGINE-AUTHORING.md](../ENGINE-AUTHORING.md) first — this brief assumes the contract.

---

## The bet

An orb that reads as **actively speaking / conversing / articulating voice**.
When an AI assistant speaks, an observer expects to see acoustic breath, syllable dilation, and phonetic wave ripples—the visual equivalent of vocal cord articulation and sound pressure waves.

Stateless pose driven by acoustic parameters: `apertureSize` dilates the vocal iris, `vocalRipple` sends acoustic waves traveling along the diaphragm rings, and `plosiveSurge` provides consonant plosive punch.

## Substrate

- **Concentric Diaphragm Rings**: 4 to 10 concentric circular ribbons (`Line2`) forming an acoustic speaker cone / iris diaphragm.
- **Glottal Nucleus**: A radiant inner core that pulses in lockstep with vocal aperture and syllable attacks.
- **Occluding Glottis**: A dark backing sphere providing optical depth and high-contrast silhouette.

## Motion design

1. **Aperture Dilation**: Speaking opens the diaphragm iris (`apertureSize`), exposing the bright glottal core.
2. **Phonetic Surface Ripples**: Travelling harmonic soundwaves cascade around the perimeters of the diaphragm blades (`vocalRipple`).
3. **Plosive Attack (`onPulse`)**: Consonant plosives flare the nucleus and launch an expanding shockwave outward through the rings.

## Proposed parameter schema

| Key | Type | Section | Range / options | Default | Notes |
|---|---|---|---|---|---|
| `ringCount` | select | `geometry` | 4, 6, 8, 10 | 6 | Number of concentric diaphragm blades |
| `baseRadius` | number | `geometry` | 0.8 – 2.0, step 0.05 | 1.45 | Overall diaphragm size |
| `diaphragmDepth` | number | `geometry` | 0.2 – 1.2, step 0.05 | 0.6 | Speaker cone curvature in Z |
| `lineWidth` | number | `geometry` | 1.0 – 5.0, step 0.1 | 2.4 | `LineMaterial.linewidth` |
| `apertureSize` | number | `motion` | 0.0 – 1.0, step 0.02 | 0.35 | **Primary voice target:** Dilates iris with speech |
| `vocalRipple` | number | `motion` | 0.0 – 0.5, step 0.01 | 0.14 | Phonetic acoustic wave amplitude |
| `formantHarmonics` | select | `geometry` | 2, 3, 4, 5 | 3 | Harmonic mode frequency |
| `formantGain` | number | `motion` | 0.2 – 2.5, step 0.05 | 1.2 | High-frequency harmonic brilliance |
| `breatheAmp` | number | `motion` | 0.0 – 0.15, step 0.005 | 0.04 | Chest respiration dilation |
| `articulationRate` | number | `motion` | 0.2 – 3.0, step 0.05 | 1.2 | Rate — excluded from modulation by name |
| `plosiveSurge` | number | `motion` | 0.2 – 2.5, step 0.05 | 1.4 | Consonant attack surge on pulse |
| `coreColor` | color | `colors` | — | `#ffffff` | Glottis nucleus highlight |
| `diaphragmColor` | color | `colors` | — | `#00f2fe` | Mid-frequency diaphragm tint |
| `formantColor` | color | `colors` | — | `#a855f7` | Radiating perimeter tint |
| `glowIntensity` | number | `colors` | 0.4 – 3.0, step 0.1 | 1.8 | Emission multiplier |
| `glottisDarkness` | number | `colors` | 0.0 – 1.0, step 0.05 | 0.8 | Backing depth occlusion |

## Framing

`frame.radius ≈ baseRadius × 1.45`.

## Acceptance criteria

- [ ] Clear voice reactiveness: routing `audio1` to `apertureSize` causes the orb to visibly open and articulate words like a living diaphragm.
- [ ] No bloom assumptions: radiant vertex colors preserve speech readability in grid mode.
- [ ] 10 switches leave memory stable with 0 leaks.
