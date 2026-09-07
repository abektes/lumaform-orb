# Engine Brief: Aetheria (`aetheria`)

**One-line concept:** An ultra-smooth, iridescent chromatic fluid sphere with internal swirling silk caustics and a spectral chromatic dispersion rim, inspired by the peaceful luminescence of modern Siri and Apple Intelligence.

**Cognitive bet:** Reads as **ambient listening / receptive presence / gentle empathy**.

**Substrate:** Custom multi-layered fluid sphere (`THREE.SphereGeometry`) deformed by 3-frequency domain-warped Perlin simplex harmonics in the vertex shader, rendered with a custom translucent subsurface scattering fragment shader with chromatic aberration, complemented by floating internal caustic silk ribbons (`Line2` / ribbon strips) and a warm breathing nucleus.

**Frame radius:** `2.25`

---

## 1. Why this exists

Many orb engines lean either toward rigid geometric wireframes (Tesseract, Auris) or particle swarms. While `Aqueous` provides a displaced glassy sphere, it models a clear physical water droplet with hard environment refraction.

`Aetheria` occupies a completely different aesthetic: **pure, peaceful luminescence and soft chromatic fluidity**. It captures the ethereal, calm breathing quality of Siri / Apple Intelligence:
1. **Silky, low-frequency continuous surface deformation** that never looks chaotic or spiky.
2. **Subsurface Chromatic Diffusion:** Spectral colors (cyan, electric violet, magenta, and warm gold) melt into each other through deep internal diffusion.
3. **Internal Swirling Silk Caustics:** Smooth ribbons of concentrated light curl and twist gently within the translucent volume.
4. **Spectral Dispersion Rim:** A soft Fresnel rim that subtly splits red, green, and blue wavelengths, giving an authentic optical glow.

---

## 2. Visual Architecture

```
                 [ Outer Chromatic Rim: Spectral Fresnel Glow ]
             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            (   ~   ~   ~   ~   ~   ~   ~   ~   ~   ~   ~   ~   )
           (  ~       [ Floating Caustic Silk Ribbons ]       ~  )
          ( ~     .~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.     ~ )
         ( ~     (        [ Warm Breathing Nucleus ]      )     ~ )
          ( ~     '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'     ~ )
           (  ~       [ Subsurface Chromatic Diffusion ]      ~  )
            (   ~   ~   ~   ~   ~   ~   ~   ~   ~   ~   ~   ~   )
             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

1. **The Fluid Membrane:**
   - Evaluates a 3D simplex noise field with domain warping:
     $$\mathbf{p}' = \mathbf{p} + \alpha \cdot \text{noise}(\mathbf{p} \cdot f_1 + \omega_1 t)$$
     $$r(\theta, \phi) = R_0 + \beta \cdot \text{noise}(\mathbf{p}' \cdot f_2 + \omega_2 t)$$
   - Displacements are tangential and radial, producing smooth fluid swells rather than spiky spikes.
2. **The Chromatic Caustic Ribbons:**
   - 2 to 3 smooth internal 3D Lissajous curves spinning within the translucent sphere.
   - Drawn with additive blending and varying stroke width, resembling submerged ribbons of liquid light or an aurora trapped inside glass.
3. **The Core Nucleus:**
   - A soft Gaussian radiant center that breathes out of phase with the surface swells, providing anchored depth and strong contrast.

---

## 3. Motion & Voice Reactiveness

- **Idle breathing:** A slow, continuous tidal expansion and gentle surface wavelets at 0.45 Hz.
- **Voice / Speech Reactiveness:**
  - `fluidWaveAmp`: Directly modulated by audio amplitude (`audio1`). Soft vowel sounds produce smooth undulating ripples across the surface without geometry tearing.
  - `causticSwirl`: Audio rhythm accelerates the slow internal caustic drift, giving the impression that speech is stirring the internal light.
- **On-Pulse:**
  - `onPulse()` initiates a gentle radiant bloom from the core nucleus, sending a soft luminous wavefront rolling outward through the fluid membrane.

---

## 4. Parameter Schema

| Parameter | Type | Range / Options | Default | Section | Description | Modulatable |
|---|---|---|---|---|---|---|
| `sphereRadius` | number | 1.0 – 2.2, step 0.05 | 1.55 | geometry | Rest radius of the fluid sphere | No |
| `detail` | select | 32, 48, 64, 96 | 64 | geometry | Sphere tessellation resolution | No |
| `causticRibbons` | select | 1, 2, 3, 4 | 3 | geometry | Number of internal silk caustic ribbons | No |
| `fluidSpeed` | number | 0.1 – 2.0, step 0.05 | 0.45 | motion | Rate of fluid surface drift | No (rate) |
| `fluidWaveAmp` | number | 0.0 – 0.35, step 0.01 | 0.12 | motion | Height of organic surface ripples | **Yes** (Voice) |
| `breatheAmp` | number | 0.0 – 0.12, step 0.005 | 0.04 | motion | Slow radial breathing depth | **Yes** |
| `causticSwirl` | number | 0.1 – 2.0, step 0.05 | 0.60 | motion | Swirl velocity of internal ribbons | **Yes** |
| `pulseGlow` | number | 0.2 – 2.5, step 0.05 | 1.50 | motion | Peak brightness boost on pulse | **Yes** |
| `color1` | color | hex | `#00f2fe` | colors | Primary spectral tint (electric cyan) | Target |
| `color2` | color | hex | `#a855f7` | colors | Secondary fluid hue (soft violet) | Target |
| `color3` | color | hex | `#ff4fd8` | colors | Ambient interior tone (magenta) | Target |
| `rimColor` | color | hex | `#ffed00` | colors | Prismatic dispersion rim highlight | Fixed / Target |
| `iridescence` | number | 0.0 – 1.5, step 0.05 | 0.85 | colors | Spectral chromatic dispersion strength | No |
| `glowIntensity` | number | 0.4 – 3.0, step 0.1 | 1.80 | colors | Bloom radiance multiplier | No |

---

## 5. Definition of Done

1. Shaders compile cleanly with no precision warnings.
2. Full lifecycle conformance: `update`, `setParams` (all sections), `onPulse`, `onResize`, and `dispose`.
3. 10 engine switch cycles leave 0 WebGL leaks or orphan scene children.
4. Voice modulation on `fluidWaveAmp` yields silky, organic surface waves.
