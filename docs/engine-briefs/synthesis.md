# Engine Brief: Synthesis (`synthesis`)

**One-line concept:** Four harmonious luminous fluid orbs orbiting in a gravitational choreography, organically fusing with smooth liquid bridges, linked by gossamer gravitational light filaments and drifting ethereal stardust, inspired by the Google Assistant / Gemini intelligence visual language.

**Cognitive bet:** Reads as **deliberation / synthesizing multiple perspectives / harmonious thought**.

**Substrate:** Multi-body soft fluid orbital simulation with custom volumetric potential falloff shader, dynamic gravitational connection filaments (`Line2`), and a delicate stardust particle cloud (`THREE.Points`) enclosed in a celestial atmospheric envelope.

**Frame radius:** `2.30`

---

## 1. Why this exists

Google Gemini / Google Assistant's core visual metaphor is the **4-color fluid interaction**: distinct modalities, thoughts, or streams of reasoning that harmonize into an organic whole.

`Synthesis` models this deliberate process:
1. **Four Luminous Fluid Cores:** Representing distinct perspectives, thoughts, or input channels.
2. **Organic Liquid Bridges:** As the bodies orbit and approach one another, their glowing boundaries reach out and smoothly fuse like liquid mercury or metaballs.
3. **Gravitational Filaments:** Gossamer threads of light connect the cores, visualizing the structural tension and relational pathways of deliberation.
4. **Ethereal Stardust:** Floating micro-sparkles drift along the gravitational contours, adding an ambient celestial quality.
5. **Unified Coalescence on Pulse/Voice:** Speech or user impulse causes the 4 bodies to coalesce into a brilliant single white/gold radiant core before peacefully flowering back into their orbital dance.

---

## 2. Visual Architecture

```
                          . ~ ~ ~ ~ ~ ~ ~ .
                      . '   [ Celestial ]   ' .
                    '        Atmosphere        '
                   /  (Core A) ~~~~~ (Core B)   \
                  |       \         /            |
                  |     [ Gravitational ]        |
                  |     [   Filaments   ]        |
                  |       /         \            |
                   \  (Core C) ~~~~~ (Core D)   /
                    .   *  [ Stardust ]   *    .
                      . '    Motes          ' .
                          ' ~ ~ ~ ~ ~ ~ ~ '
```

1. **The 4-Body Choreography:**
   - Evaluates a smooth non-colliding figure-8 or 3D trefoil rosette orbit:
     $$\mathbf{c}_k(t) = R_{\text{spread}} \cdot \begin{pmatrix} \cos(\omega t + \phi_k) \\ \sin(\omega t + \phi_k) \cos(\theta_k) \\ \sin(2\omega t + \phi_k) \sin(\theta_k) \end{pmatrix}$$
2. **Soft Potential Fusion:**
   - Each fluid body generates an inverse-quadratic field $V_k(\mathbf{x}) = \frac{r_0^2}{\|\mathbf{x} - \mathbf{c}_k\|^2 + \epsilon}$.
   - The total field $V(\mathbf{x}) = \sum V_k(\mathbf{x})$ produces smooth liquid blending where the bodies meet.
3. **Gravitational Filaments:**
   - Dynamic `Line2` segments rendered between core pairs when within relational distance, modulated by distance falloff and tension glow.
4. **Stardust Motes:**
   - 64 to 256 slow-moving particles drifting around the center of mass along equipotential surfaces.

---

## 3. Motion & Voice Reactiveness

- **Idle deliberation:** A slow, continuous celestial ballet at 0.55 Hz.
- **Voice Reactiveness:**
  - `orbitSpread`: Audio amplitude modulates the breathing separation of the 4 cores—breathing wider during dramatic pause, drawing closer into dense synthesis during active speech.
  - `fusionTension`: Voice energy boosts the bridge brightness and filament luminescence.
- **On-Pulse / Coalescence:**
  - `onPulse()` triggers an immediate gravitational collapse where all 4 bodies snap to center, merging into a radiant synthesis flash, then smoothly bloom back to their orbital paths over 1.4 seconds.

---

## 4. Parameter Schema

| Parameter | Type | Range / Options | Default | Section | Description | Modulatable |
|---|---|---|---|---|---|---|
| `envelopeRadius` | number | 1.0 – 2.2, step 0.05 | 1.60 | geometry | Outer celestial sphere radius | No |
| `coreRadius` | number | 0.2 – 0.65, step 0.02 | 0.38 | geometry | Fluid body rest radius | No |
| `filamentCount` | select | 0, 4, 6, 8 | 6 | geometry | Number of gravitational light threads | No |
| `stardustDensity` | select | 32, 64, 128, 256 | 64 | geometry | Ambient stardust mote count | No |
| `orbitSpread` | number | 0.2 – 1.2, step 0.02 | 0.75 | motion | Orbital radius / separation | **Yes** (Voice) |
| `orbitSpeed` | number | 0.1 – 2.5, step 0.05 | 0.55 | motion | Orbital frequency | No (rate) |
| `fusionTension` | number | 0.1 – 1.5, step 0.05 | 0.65 | motion | Liquid bridge attraction strength | **Yes** |
| `breatheAmp` | number | 0.0 – 0.1, step 0.005 | 0.035 | motion | Collective breathing depth | **Yes** |
| `coalesceSurge` | number | 0.2 – 2.5, step 0.05 | 1.40 | motion | Impulse collapse recovery speed | **Yes** |
| `color1` | color | hex | `#4285f4` | colors | Google Blue / Azure core | Target |
| `color2` | color | hex | `#ea4335` | colors | Google Red / Coral core | Target |
| `color3` | color | hex | `#fbbc05` | colors | Google Yellow / Amber core | Target |
| `color4` | color | hex | `#34a853` | colors | Google Green / Emerald core | Target |
| `veilColor` | color | hex | `#1e1b4b` | colors | Celestial envelope glow tone | Fixed / Target |
| `glowIntensity` | number | 0.4 – 3.0, step 0.1 | 1.80 | colors | Volumetric bloom intensity | No |

---

## 5. Definition of Done

1. Shaders and lines render without WebGL artifacts.
2. Full lifecycle conformance: `update`, `setParams` (all sections), `onPulse`, `onResize`, and `dispose`.
3. 10 engine switch cycles leave 0 WebGL leaks or orphan scene children.
4. Voice modulation smoothly opens and closes the orbital constellation without glitching.
