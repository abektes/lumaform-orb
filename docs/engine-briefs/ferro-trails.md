# Engine Brief: Ferro Trails (`ferrotrails`)

**One-line concept:** An oval or spherical ferrofluid core pulsating with organic magnetic fluid crests, wrapped in sweeping luminous neon ribbon trails and glowing velocity arcs, inspired by Sabo Sugi's acclaimed shaders *Trails* and *Ferrofluid*.

**Cognitive bet:** Reads as **dynamic focus / magnetic intelligence in motion / sleek executive presence**.

**Substrate:**
1. **Ferrofluid Core:** High-density ellipsoid deformed in custom GLSL by multi-octave 3D simplex noise with power sharpening to produce distinct, organic magnetic peaks and viscous liquid ripples. Shaded with a deep obsidian base liquid, luminescent crest glow (`colorCrest`), multi-point specular highlights, and chromatic Fresnel edge.
2. **Sweeping Arc Trails:** 3D harmonic ribbon trails (`Line2` fat lines with vertex color gradients and alpha taper) orbiting the oval manifold with adjustable arc curvature and bend factors, paired with leading particle heads and ambient magnetic motes.
3. **Inner Spark Core:** An inner breathing luminescent nucleus providing deep silhouette contrast.

**Frame radius:** `2.30`

---

## 1. Why this exists

Sabo Sugi's shaders on CodePen (*Trails* `bNBVWpN` and *Ferrofluid* `azpqWKE`) achieved widespread admiration for their distinctive visual signatures:
1. **Curving 3D Luminous Trails:** Ribbons of light that bend gracefully along smooth 3D arcs with distinct curvature and velocity glow.
2. **Organic Magnetic Ferrofluid Spikes:** A viscous liquid surface whose magnetic peaks sharpen, undulate, and respond dynamically to pulse and acoustic frequency.

Rather than rendering these effects across an open plane or flat camera background, `Ferro Trails` projects and constrains both phenomena onto an **ellipsoidal or spherical manifold**:
- The user can seamlessly adjust `ovalRatio` from a pure sphere (`1.0`) to a sleek prolate oval egg (`1.25` - `1.40`), creating an iconic AI assistant silhouette.
- The ferrofluid spikes erupt along normal vectors of the oval, creating a living magnetic body.
- The arc trails curve around the oval's geodesic contours, arcing above the magnetic peaks like an active electromagnetic containment field.

---

## 2. Visual Architecture

```
                 [ Sweeping 3D Arc Trails: Curved Neon Ribbons ]
              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
             (   ~     * [ Glowing Leading Trail Heads ] *     ~   )
            (  ~      /\   /\   /\   /\   /\   /\   /\   /\     ~  )
           ( ~       /  \ /  \ /  \ /  \ /  \ /  \ /  \ /  \     ~ )
          ( ~       |  [ Organic Magnetic Fluid Spikes ]    |     ~ )
          ( ~       |      [ Viscous Obsidian Body ]        |     ~ )
          ( ~       |      [ Inner Breathing Spark ]        |     ~ )
           ( ~       \  / \  / \  / \  / \  / \  / \  / \  /     ~ )
            (  ~      \/   \/   \/   \/   \/   \/   \/   \/     ~  )
             (   ~            * [ Ambient Magnetic Motes ] *   ~   )
              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

1. **The Ferrofluid Manifold:**
   - Evaluates a 3D simplex noise field with exponential sharpening for magnetic tension:
     $$\mathbf{p}_{\text{oval}} = (x, y \cdot \text{ovalRatio}, z)$$
     $$N_1 = \text{snoise}(\mathbf{n} \cdot f_1 + \omega_1 t)$$
     $$N_2 = \text{snoise}(\mathbf{n} \cdot f_2 - \omega_2 t)$$
     $$h_{\text{spike}} = \max(0, N_1 \cdot 0.7 + N_2 \cdot 0.35 + \text{tension})^{2.2} \cdot (\text{spikes} + \text{pulse} \cdot 0.28)$$
   - Analytical finite-differencing recomputes the surface normal $\mathbf{N}$ at runtime, ensuring specular highlights and Fresnel grazing reflections accurately follow every magnetic crest.

2. **The Sweeping Arc Trails:**
   - 6 to 24 parametric 3D curves wrapping the oval:
     $$\mathbf{r}(\tau) = R_{\text{base}} \cdot \begin{pmatrix} \cos(\theta(\tau)) \cdot \cos(\phi(\tau)) \\ \sin(\phi(\tau)) \cdot \text{ovalRatio} \\ \sin(\theta(\tau)) \cdot \cos(\phi(\tau)) \end{pmatrix} + \mathbf{r}_{\text{arc}}(\tau)$$
   - $\mathbf{r}_{\text{arc}}$ applies radial curvature and Z/Y bend parameters inspired by Sabo Sugi's trail geometry.
   - Drawn with `Line2` (screen-space width, vertex colors fading from `colorTrail1` to `colorTrail2`, and additive blending).

3. **Particle Heads & Magnetic Motes:**
   - Point sprites at the tip of each arc trail simulate high-energy ionizing heads.
   - Magnetic motes drift in the orbital flux lines near the peaks.

---

## 3. Motion & Voice Reactiveness

- **Resting state:** Slow, viscous breathing of the ferrofluid peaks (0.5 Hz) accompanied by steady orbital sweep of the glowing ribbon trails.
- **Voice / Speech Reactiveness:**
  - `magneticSpikes`: Direct modulation destination. Speech energy drives the sharp liquid peaks to rise and ripple in cadence with syllables and consonants.
  - `arcCurvature`: Modulates the radial lift of the trails, expanding the electromagnetic arc field as speech volume increases.
- **On-Pulse:**
  - `onPulse()` triggers an instantaneous magnetic spike surge (e.g. +1.5x) and causes the arc trails to flare with increased velocity and bloom radiance before settling exponentially back to baseline.
