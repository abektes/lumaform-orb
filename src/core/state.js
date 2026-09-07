// Central state management, parameter schemas, and serialization for Lumaform Orb Studio

import { createDefaultModulation } from './modulation.js';

export const ENGINE_TYPES = {
  TESSERACT: 'tesseract',
  MOIRE: 'moire',
  AURIS: 'auris',
  HOPF: 'hopf',
  POLYTOPE: 'polytope',
  NEBULA: 'nebula',
  QUANTUM: 'quantum',
  SINGULARITY: 'singularity',
  FLUX: 'flux',
  AQUEOUS: 'aqueous',
  CURL_DRIFT: 'curldrift',
  MURMURATION: 'murmuration',
  FILAMENT: 'filament',
  PRISM_BLOOM: 'prismbloom',
  CORONA_VEIL: 'coronaveil',
  ECHO_RINGS: 'echorings',
  MYCELIUM: 'mycelium',
};

export const ENGINE_INFO = {
  [ENGINE_TYPES.TESSERACT]: {
    id: ENGINE_TYPES.TESSERACT,
    name: '4D Tesseract',
    badge: 'Hypercube Projection',
    description: 'Canonical 4-dimensional hypercube projected into 3D space with rigid 3D perspective and harmonic 4D inversion.',
  },
  [ENGINE_TYPES.MOIRE]: {
    id: ENGINE_TYPES.MOIRE,
    name: 'Chiral Moiré',
    badge: 'Optical String Art',
    description: 'Nine sacred geometric ruled-surface wireframes, chiral vortexes, and interference moiré patterns with harmonic breathing apertures.',
  },
  [ENGINE_TYPES.AURIS]: {
    id: ENGINE_TYPES.AURIS,
    name: 'Auris Light',
    badge: 'Sacred Crystallography',
    description: 'Multifaceted geodesic polyhedra, Kepler cubic compounds, and chiral wireframe vortexes illuminated with directional light and architectural hatching.',
  },
  [ENGINE_TYPES.HOPF]: {
    id: ENGINE_TYPES.HOPF,
    name: 'Hopf Fibration',
    badge: 'Clifford Torus',
    description: 'Stereographic projection of the 3-sphere S³ to R³ generating nested Villarceau circle fibers and Clifford toroidal inversions.',
  },
  [ENGINE_TYPES.POLYTOPE]: {
    id: ENGINE_TYPES.POLYTOPE,
    name: 'Sacred Polytope',
    badge: 'Merkabah & Kepler Star',
    description: 'Dual counter-rotating Stella Octangula with nested Kepler-Poinsot star, geodesic wireframes, and chromatic dispersion facets.',
  },
  [ENGINE_TYPES.NEBULA]: {
    id: ENGINE_TYPES.NEBULA,
    name: 'Gyroid Nebula',
    badge: 'Volumetric Raymarching',
    description: 'Organic, volumetric gyroid SDF folded within a glowing atmospheric forcefield with chromatic aberration and cosmic stardust.',
  },
  [ENGINE_TYPES.QUANTUM]: {
    id: ENGINE_TYPES.QUANTUM,
    name: 'Quantum Lattice',
    badge: '4D Hyper-Fractal',
    description: 'Hyper-dimensional recursive IFS fractal lattice with glowing quantum orbital filaments and geometric symmetries.',
  },
  [ENGINE_TYPES.SINGULARITY]: {
    id: ENGINE_TYPES.SINGULARITY,
    name: 'Chrono Singularity',
    badge: 'Relativistic Black Hole',
    description: 'Event horizon with gravitational light bending, Doppler-beamed accretion disk, and relativistic photon sphere.',
  },
  [ENGINE_TYPES.FLUX]: {
    id: ENGINE_TYPES.FLUX,
    name: 'Flux Ribbon',
    badge: 'Travelling Wave',
    description: 'A bundle of glowing strands streaming in a travelling wave, fanning apart and converging into bright knots. Renders as a wide ribbon or wrapped onto an orb.',
  },
  [ENGINE_TYPES.AQUEOUS]: {
    id: ENGINE_TYPES.AQUEOUS,
    name: 'Aqueous',
    badge: 'Refractive Body',
    description: 'A soft, luminous body with migrating liquid contours, glassy depth, and a calm physical presence.',
  },
  [ENGINE_TYPES.CURL_DRIFT]: {
    id: ENGINE_TYPES.CURL_DRIFT,
    name: 'Curl Drift',
    badge: 'Advected Flow',
    description: 'Directional light ribbons braid around a spherical shell inside a deterministic curl field.',
  },
  [ENGINE_TYPES.MURMURATION]: {
    id: ENGINE_TYPES.MURMURATION,
    name: 'Murmuration',
    badge: 'Emergent Swarm',
    description: 'A living cloud of agents gathers, separates, and regroups as if weighing several possibilities.',
  },
  [ENGINE_TYPES.FILAMENT]: {
    id: ENGINE_TYPES.FILAMENT,
    name: 'Filament Lattice',
    badge: 'Spring Network',
    description: 'Signals travel through an elastic geodesic network, reflect, interfere, and ring down.',
  },
  [ENGINE_TYPES.PRISM_BLOOM]: {
    id: ENGINE_TYPES.PRISM_BLOOM,
    name: 'Prism Bloom',
    badge: 'Crystalline Flora',
    description: 'Iridescent crystalline petals open in waves around a warm faceted core.',
  },
  [ENGINE_TYPES.CORONA_VEIL]: {
    id: ENGINE_TYPES.CORONA_VEIL,
    name: 'Corona Veil',
    badge: 'Aurora Membrane',
    description: 'Layered aurora membranes roll quietly around a dark solar core.',
  },
  [ENGINE_TYPES.ECHO_RINGS]: {
    id: ENGINE_TYPES.ECHO_RINGS,
    name: 'Echo Rings',
    badge: 'Signal Memory',
    description: 'Luminous wavefronts remember each pulse as they propagate and settle around a dark orb.',
  },
  [ENGINE_TYPES.MYCELIUM]: {
    id: ENGINE_TYPES.MYCELIUM,
    name: 'Mycelium',
    badge: 'Living Network',
    description: 'A branching bioluminescent network carries visible signals from root to tip.',
  },
};

export const DEFAULT_GLOBAL_SETTINGS = {
  dpr: 1.2,
  exposure: 1.00,
  // A low threshold with high strength put a bloom halo over most of the frame —
  // measured 81% of pixels lit for Hopf and 61% for Tesseract, so the orb had no
  // dark surround and its silhouette dissolved. Nothing was clipping; the halo
  // was simply covering everything. These values are close to what every preset
  // in preset-library.js already used, which the defaults had drifted away from.
  bloomStrength: 0.25,
  bloomRadius: 0.25,
  bloomThreshold: 0.35,
  autoRotate: true,
  autoRotateSpeed: 0.8,
  timeScale: 1.0,
  paused: false,
  background: '#000000',
  transparentBg: false,
  bgMode: 'void',
};

export const ENGINE_PARAM_DEFINITIONS = {
  [ENGINE_TYPES.TESSERACT]: {
    color1: { type: 'color', label: 'Outer Cube Edges', default: '#ffed00', section: 'colors' },
    color2: { type: 'color', label: 'Inner Cube Edges', default: '#00f0ff', section: 'colors' },
    colorStrut: { type: 'color', label: 'Corner Struts', default: '#ffffff', section: 'colors' },
    nodeColor: { type: 'color', label: 'Corner Vertex Nodes', default: '#ffffff', section: 'colors' },
    cellColor: { type: 'color', label: 'Glass Facet Tint', default: '#ffed00', section: 'colors' },
    edgeGlow: { type: 'number', label: 'Edge Radiance', min: 0.5, max: 3.5, step: 0.1, default: 1.2, section: 'colors' },

    edgeMode: { type: 'select', label: 'Edge Architecture', options: ['sketch', 'cubes', 'outer_struts', 'inner_struts', 'struts'], default: 'sketch', section: 'geometry' },
    innerScale: { type: 'number', label: 'Inner Cube Ratio', min: 0.25, max: 0.75, step: 0.01, default: 0.48, section: 'geometry' },
    cubeSize: { type: 'number', label: 'Hypercube Scale', min: 0.6, max: 2.5, step: 0.05, default: 1.35, section: 'geometry' },
    edgeWidth: { type: 'number', label: 'Edge Line Width', min: 1.0, max: 6.0, step: 0.2, default: 2.6, section: 'geometry' },
    nodeSize: { type: 'number', label: 'Corner Vertex Nodes', min: 0.0, max: 0.12, step: 0.005, default: 0.038, section: 'geometry' },
    cellOpacity: { type: 'number', label: 'Glass Facet Opacity', min: 0.0, max: 0.4, step: 0.01, default: 0.0, section: 'geometry' },

    motionMode: { type: 'select', label: 'Motion Dynamic', options: ['sketch3d', 'hyperfold', 'pulse', 'true4d'], default: 'sketch3d', section: 'motion' },
    rotSpeedX: { type: 'number', label: '3D Rotation Pitch', min: -2.0, max: 2.0, step: 0.05, default: 0.25, section: 'motion' },
    rotSpeedY: { type: 'number', label: '3D Rotation Yaw', min: -2.0, max: 2.0, step: 0.05, default: 0.50, section: 'motion' },
    pulseSpeed: { type: 'number', label: 'Fold / Pulse Speed', min: 0.2, max: 3.0, step: 0.1, default: 1.2, section: 'motion' },
    rotSpeedXW: { type: 'number', label: '4D Hyperspace XW', min: -2.0, max: 2.0, step: 0.05, default: 0.35, section: 'motion' },
    rotSpeedYW: { type: 'number', label: '4D Hyperspace YW', min: -2.0, max: 2.0, step: 0.05, default: 0.45, section: 'motion' },
  },

  [ENGINE_TYPES.HOPF]: {
    color1: { type: 'color', label: 'Core Villarceau Ring', default: '#ffed00', section: 'colors' },
    color2: { type: 'color', label: 'Outer Toroidal Shell', default: '#a855f7', section: 'colors' },
    accentColor: { type: 'color', label: 'Streamline Sparkles', default: '#00f2fe', section: 'colors' },
    glowIntensity: { type: 'number', label: 'Fiber Radiance', min: 0.4, max: 3.5, step: 0.1, default: 1.5, section: 'colors' },

    fiberCount: { type: 'select', label: 'Fiber Circle Count', options: [16, 24, 32, 48], default: 32, section: 'geometry' },
    torusRadius: { type: 'number', label: 'Major Torus Radius (R)', min: 0.8, max: 2.8, step: 0.05, default: 1.75, section: 'geometry' },
    tubeRadius: { type: 'number', label: 'Minor Torus Radius (r)', min: 0.3, max: 1.6, step: 0.05, default: 0.85, section: 'geometry' },
    lineWidth: { type: 'number', label: 'Fiber Ribbon Width', min: 1.0, max: 6.0, step: 0.5, default: 2.8, section: 'geometry' },

    cliffordSpeed: { type: 'number', label: 'Clifford 4D Inversion Rate', min: 0.0, max: 2.5, step: 0.05, default: 0.70, section: 'motion' },
    flowSpeed: { type: 'number', label: 'Stream Flow Velocity', min: 0.1, max: 3.0, step: 0.1, default: 1.2, section: 'motion' },
    twistHarmonics: { type: 'number', label: 'Winding Harmonics', min: 1.0, max: 5.0, step: 1.0, default: 2.0, section: 'motion' },
  },

  [ENGINE_TYPES.POLYTOPE]: {
    color1: { type: 'color', label: 'Primary Star (Yang)', default: '#ffed00', section: 'colors' },
    color2: { type: 'color', label: 'Counter Star (Yin)', default: '#ec4899', section: 'colors' },
    coreColor: { type: 'color', label: 'Divine Core Spark', default: '#ffffff', section: 'colors' },
    wireColor: { type: 'color', label: 'Geodesic Wireframe', default: '#00f0ff', section: 'colors' },
    wireGlow: { type: 'number', label: 'Wireframe Luma', min: 0.5, max: 3.5, step: 0.1, default: 1.8, section: 'colors' },
    facetDispersion: { type: 'number', label: 'Prismatic Dispersion', min: 0.0, max: 1.5, step: 0.05, default: 0.75, section: 'colors' },

    polytopeType: { type: 'select', label: 'Sacred Archetype', options: ['merkabah', 'kepler_star', 'icosa_stellation'], default: 'merkabah', section: 'geometry' },
    scale: { type: 'number', label: 'Polytope Outer Radius', min: 0.8, max: 2.6, step: 0.05, default: 1.65, section: 'geometry' },
    coreRadius: { type: 'number', label: 'Divine Core Radius', min: 0.15, max: 0.9, step: 0.05, default: 0.45, section: 'geometry' },
    wireThickness: { type: 'number', label: 'Geodesic Line Width', min: 1.0, max: 6.0, step: 0.5, default: 3.0, section: 'geometry' },

    rotRateA: { type: 'number', label: 'Star A Spin Velocity', min: -2.0, max: 2.0, step: 0.05, default: 0.60, section: 'motion' },
    rotRateB: { type: 'number', label: 'Star B Counter-Spin', min: -2.0, max: 2.0, step: 0.05, default: -0.60, section: 'motion' },
  },

  [ENGINE_TYPES.NEBULA]: {
    color1: { type: 'color', label: 'Primary Gradient', default: '#00ffc8', section: 'colors' },
    color2: { type: 'color', label: 'Secondary Field', default: '#4466ff', section: 'colors' },
    colorShell: { type: 'color', label: 'Atmosphere Shell', default: '#00ffc8', section: 'colors' },
    aberration: { type: 'number', label: 'Chromatic Aberration', min: 0.0, max: 2.0, step: 0.01, default: 0.85, section: 'colors' },
    glowIntensity: { type: 'number', label: 'Internal Glow', min: 0.002, max: 0.03, step: 0.001, default: 0.007, section: 'colors' },
    atmosphereStrength: { type: 'number', label: 'Atmosphere Shell', min: 0.0, max: 1.0, step: 0.01, default: 0.30, section: 'colors' },

    sphereRadius: { type: 'number', label: 'Sphere Bounds', min: 1.0, max: 3.5, step: 0.05, default: 2.15, section: 'geometry' },
    edgeFade: { type: 'number', label: 'Edge Softness', min: 0.1, max: 1.2, step: 0.01, default: 0.381, section: 'geometry' },
    fractalScale: { type: 'number', label: 'Domain Scale', min: 0.2, max: 1.4, step: 0.01, default: 0.7602, section: 'geometry' },
    fractalMult: { type: 'number', label: 'Fractal Multiplier', min: 1.2, max: 3.8, step: 0.05, default: 2.196, section: 'geometry' },
    particleDensity: { type: 'number', label: 'Stardust Density', min: 0.0, max: 0.05, step: 0.001, default: 0.014, section: 'geometry' },

    sphereSpinSpeed: { type: 'number', label: 'Fractal Spin', min: -3.0, max: 3.0, step: 0.05, default: -0.65, section: 'motion' },
    fractalWarpSpeed: { type: 'number', label: 'Warp Speed', min: 0.005, max: 0.08, step: 0.001, default: 0.0262, section: 'motion' },
  },

  [ENGINE_TYPES.QUANTUM]: {
    color1: { type: 'color', label: 'Primary Energy', default: '#0066ff', section: 'colors' },
    color2: { type: 'color', label: 'Secondary Field', default: '#a855f7', section: 'colors' },
    color3: { type: 'color', label: 'Quantum Core', default: '#00f2fe', section: 'colors' },
    edgeGlow: { type: 'number', label: 'Edge Luma', min: 0.0, max: 3.0, step: 0.05, default: 1.2, section: 'colors' },

    shape: { type: 'select', label: 'Lattice Geometry', options: ['sphere', 'cube', 'octahedron'], default: 'sphere', section: 'geometry' },
    cubeSize: { type: 'number', label: 'Structure Size', min: 0.6, max: 2.2, step: 0.05, default: 1.25, section: 'geometry' },
    scaleFactor: { type: 'number', label: 'Recursion Scale', min: 1.4, max: 3.2, step: 0.01, default: 2.15, section: 'geometry' },
    orbitPathWidth: { type: 'number', label: 'Orbital Line Width', min: 1.0, max: 8.0, step: 0.5, default: 4.0, section: 'geometry' },
    orbitPathBrightness: { type: 'number', label: 'Orbital Brightness', min: 0.5, max: 6.0, step: 0.1, default: 3.5, section: 'geometry' },

    rotSpeedX: { type: 'number', label: 'Rotation Pitch', min: 0.0, max: 0.8, step: 0.02, default: 0.18, section: 'motion' },
    rotSpeedY: { type: 'number', label: 'Rotation Yaw', min: 0.0, max: 0.8, step: 0.02, default: 0.28, section: 'motion' },
    fractalSpeed: { type: 'number', label: 'Fractal Oscillation', min: 0.2, max: 2.5, step: 0.05, default: 1.0, section: 'motion' },
    morphSpeed: { type: 'number', label: 'Dimensional Morph', min: 0.2, max: 2.5, step: 0.05, default: 1.0, section: 'motion' },
  },

  [ENGINE_TYPES.SINGULARITY]: {
    color1: { type: 'color', label: 'Accretion Core Flame', default: '#f59e0b', section: 'colors' },
    color2: { type: 'color', label: 'Outer Collapsar Halo', default: '#ef4444', section: 'colors' },
    color3: { type: 'color', label: 'Relativistic Doppler Blue', default: '#38bdf8', section: 'colors' },

    horizonRadius: { type: 'number', label: 'Event Horizon Radius', min: 0.5, max: 1.6, step: 0.05, default: 1.05, section: 'geometry' },
    diskInner: { type: 'number', label: 'Accretion Inner Ring', min: 0.8, max: 2.2, step: 0.05, default: 1.45, section: 'geometry' },
    diskOuter: { type: 'number', label: 'Accretion Outer Edge', min: 2.2, max: 5.0, step: 0.1, default: 3.5, section: 'geometry' },
    accretionDensity: { type: 'number', label: 'Disk Density', min: 0.4, max: 3.0, step: 0.05, default: 1.6, section: 'geometry' },

    warpStrength: { type: 'number', label: 'Gravitational Lensing', min: 0.2, max: 2.5, step: 0.05, default: 1.35, section: 'motion' },
    diskSpeed: { type: 'number', label: 'Vortex Orbital Velocity', min: 0.2, max: 2.5, step: 0.05, default: 0.85, section: 'motion' },
    dopplerShift: { type: 'number', label: 'Relativistic Beaming', min: 0.0, max: 1.5, step: 0.05, default: 0.75, section: 'motion' },
    diskTilt: { type: 'number', label: 'Accretion Plane Tilt', min: -1.0, max: 1.0, step: 0.02, default: 0.28, section: 'motion' },
  },

  [ENGINE_TYPES.AURIS]: {
    archetype: { type: 'select', label: 'Crystalline Archetype', options: ['geodesic', 'cubic_compound', 'nested_square', 'nested_hex', 'nested_pentagon', 'nested_triangle'], default: 'geodesic', section: 'geometry' },
    scale: { type: 'number', label: 'Polyhedron Scale', min: 0.8, max: 2.5, step: 0.05, default: 1.4, section: 'geometry' },
    stellaHeight: { type: 'number', label: 'Stellation / 3D Depth', min: 0.0, max: 1.2, step: 0.02, default: 0.45, section: 'geometry' },
    twistAngle: { type: 'number', label: 'Per-Layer Rotation', min: 0.02, max: 0.35, step: 0.01, default: 0.14, section: 'geometry' },
    wireWidth: { type: 'number', label: 'Contour Line Width', min: 1.0, max: 5.0, step: 0.2, default: 2.4, section: 'geometry' },

    lightColor: { type: 'color', label: 'Directional Light Tint', default: '#ffea79', section: 'colors' },
    facetColor: { type: 'color', label: 'Facet Base Shading', default: '#1e293b', section: 'colors' },
    wireColor: { type: 'color', label: 'Glowing Edge Contours', default: '#fef08a', section: 'colors' },
    shadowColor: { type: 'color', label: 'Shadow Ambient Tone', default: '#090d16', section: 'colors' },
    wireGlow: { type: 'number', label: 'Wire Radiance', min: 0.5, max: 3.5, step: 0.1, default: 1.3, section: 'colors' },
    hatchStrength: { type: 'number', label: 'Architectural Hatching', min: 0.0, max: 1.0, step: 0.05, default: 0.85, section: 'colors' },

    lightYaw: { type: 'number', label: 'Light Direction (Azimuth)', min: 0, max: 360, step: 5, default: 45, section: 'motion' },
    lightPitch: { type: 'number', label: 'Light Elevation (Altitude)', min: -85, max: 85, step: 5, default: 35, section: 'motion' },
    lightIntensity: { type: 'number', label: 'Illumination Power', min: 0.4, max: 3.5, step: 0.1, default: 1.6, section: 'motion' },
    hatchDensity: { type: 'number', label: 'Hatching Frequency', min: 6, max: 50, step: 1, default: 18, section: 'motion' },
    rotSpeedX: { type: 'number', label: '3D Rotation Pitch', min: -2.0, max: 2.0, step: 0.05, default: 0.20, section: 'motion' },
    rotSpeedY: { type: 'number', label: '3D Rotation Yaw', min: -2.0, max: 2.0, step: 0.05, default: 0.45, section: 'motion' },
    rotSpeedZ: { type: 'number', label: '3D Rotation Roll', min: -2.0, max: 2.0, step: 0.05, default: 0.10, section: 'motion' },
  },

  [ENGINE_TYPES.MOIRE]: {
    archetype: {
      type: 'select',
      label: 'Grid Archetype',
      options: ['meridian_beat', 'lattice_beat', 'helix_beat'],
      default: 'meridian_beat',
      section: 'geometry',
    },
    scale: { type: 'number', label: 'Orb Scale', min: 0.8, max: 3.0, step: 0.05, default: 2.2, section: 'geometry' },
    lineDensity: { type: 'number', label: 'Meridians', min: 8, max: 60, step: 1, default: 28, section: 'geometry' },
    // The beat: the inner shell carries this many more meridians than the outer,
    // and the difference is what sets the number of interference fringes.
    beatOffset: { type: 'number', label: 'Beat Offset', min: -8, max: 8, step: 1, default: 2, section: 'geometry' },
    latBands: { type: 'number', label: 'Latitude Rings', min: 0, max: 24, step: 1, default: 8, section: 'geometry' },
    twistAngle: { type: 'number', label: 'Chiral Twist Angle', min: -1.5, max: 1.5, step: 0.02, default: 0.72, section: 'geometry' },
    // Applied as a scale on the inner shell rather than baked into vertices, so
    // it is a transform: cheap to animate and safe to modulate.
    shellGap: { type: 'number', label: 'Shell Gap', min: 0.55, max: 0.99, step: 0.01, default: 0.90, section: 'motion' },
    lineWidth: { type: 'number', label: 'Line Stroke Thickness', min: 0.5, max: 6.0, step: 0.1, default: 1.6, section: 'geometry' },

    // Was '#0a0a0d' labelled "Ink / Stroke Color" — a near-black chosen for a
    // white-paper aesthetic, drawn on a #000000 canvas, so the engine rendered an
    // almost entirely black frame out of the box. The label is what let the
    // paper-era value survive.
    lineColor: { type: 'color', label: 'Line Color', default: '#7fe9ff', section: 'colors' },
    lineGlow: { type: 'number', label: 'Line Glow / Radiance', min: 0.5, max: 3.0, step: 0.1, default: 1.0, section: 'colors' },

    motionMode: {
      type: 'select',
      label: 'Motion Dynamic',
      options: ['counter_spin', 'orbit_3d', 'wave_pulse', 'interactive_tilt'],
      default: 'counter_spin',
      section: 'motion',
    },
    // The rate the two shells rotate against each other. This is what makes the
    // interference fringes travel, and it is the engine's real signature motion.
    counterSpin: { type: 'number', label: 'Counter-Spin Rate', min: -2.0, max: 2.0, step: 0.05, default: 0.55, section: 'motion' },
    rotSpeedX: { type: 'number', label: '3D Pitch Rotation', min: -2.0, max: 2.0, step: 0.02, default: 0.06, section: 'motion' },
    rotSpeedY: { type: 'number', label: '3D Yaw Rotation', min: -2.0, max: 2.0, step: 0.02, default: 0.18, section: 'motion' },
    rotSpeedZ: { type: 'number', label: '3D Roll Rotation', min: -2.0, max: 2.0, step: 0.02, default: 0.0, section: 'motion' },
    breatheSpeed: { type: 'number', label: 'Shell Breath Rate', min: 0.0, max: 2.5, step: 0.05, default: 0.60, section: 'motion' },
    breatheAmp: { type: 'number', label: 'Breathing Amplitude', min: 0.0, max: 0.25, step: 0.01, default: 0.05, section: 'motion' },
    twistSpeed: { type: 'number', label: 'Chiral Winding Speed', min: 0.0, max: 2.0, step: 0.05, default: 0.15, section: 'motion' },
    tiltStrength: { type: 'number', label: 'Mouse Parallax Depth', min: 0.0, max: 1.0, step: 0.05, default: 0.35, section: 'motion' },
  },

  // Section assignment is load-bearing here. `geometry` is what excludes a
  // parameter from modulation (isModulatable in modulation.js), so anything that
  // rebuilds the strand lattice must live there — while amplitude and its
  // neighbours are plain shader uniforms and therefore safe to drive at frame
  // rate. That is what makes `amplitude` an audio destination for free.
  [ENGINE_TYPES.FLUX]: {
    layout: {
      type: 'select',
      label: 'Layout',
      options: ['ribbon', 'orb'],
      default: 'ribbon',
      section: 'geometry',
    },
    strands: { type: 'number', label: 'Strand Count', min: 6, max: 64, step: 1, default: 28, section: 'geometry' },
    segments: { type: 'number', label: 'Strand Resolution', min: 40, max: 300, step: 10, default: 160, section: 'geometry' },
    bandSpread: { type: 'number', label: 'Band Spread', min: 0.0, max: 3.0, step: 0.05, default: 1.1, section: 'geometry' },
    ribbonWidth: { type: 'number', label: 'Ribbon Width', min: 4.0, max: 24.0, step: 0.5, default: 14.0, section: 'geometry' },
    twist: { type: 'number', label: 'Orb Twist', min: -2.0, max: 2.0, step: 0.05, default: 0.6, section: 'geometry' },
    sparkleDensity: { type: 'number', label: 'Sparkle Density', min: 0.0, max: 0.2, step: 0.005, default: 0.03, section: 'geometry' },

    // Uniforms — modulatable. `flowSpeed` is auto-excluded by RATE_PATTERN.
    amplitude: { type: 'number', label: 'Wave Amplitude', min: 0.0, max: 2.5, step: 0.05, default: 0.85, section: 'motion' },
    wavelength: { type: 'number', label: 'Wavelength', min: 0.1, max: 1.5, step: 0.02, default: 0.42, section: 'motion' },
    phaseSpread: { type: 'number', label: 'Strand Phase Spread', min: 0.0, max: 8.0, step: 0.1, default: 2.4, section: 'motion' },
    depth: { type: 'number', label: 'Depth Separation', min: 0.0, max: 5.0, step: 0.1, default: 2.2, section: 'motion' },
    turbulence: { type: 'number', label: 'Turbulence', min: 0.0, max: 1.5, step: 0.05, default: 0.35, section: 'motion' },
    flowSpeed: { type: 'number', label: 'Flow Speed', min: -3.0, max: 3.0, step: 0.05, default: 0.9, section: 'motion' },

    colorA: { type: 'color', label: 'Leading Colour', default: '#ff4fd8', section: 'colors' },
    colorB: { type: 'color', label: 'Mid Colour', default: '#a86bff', section: 'colors' },
    colorC: { type: 'color', label: 'Trailing Colour', default: '#4fd0ff', section: 'colors' },
    glow: { type: 'number', label: 'Strand Glow', min: 0.2, max: 3.0, step: 0.05, default: 2.1, section: 'colors' },
    sparkleSize: { type: 'number', label: 'Sparkle Size', min: 0.5, max: 8.0, step: 0.1, default: 2.2, section: 'colors' },
    sparkleBrightness: { type: 'number', label: 'Sparkle Brightness', min: 0.0, max: 5.0, step: 0.1, default: 2.4, section: 'colors' },
  },

  [ENGINE_TYPES.AQUEOUS]: {
    detail: { type: 'select', label: 'Surface Detail', options: [3, 4, 5, 6], default: 5, section: 'geometry' },
    radius: { type: 'number', label: 'Body Radius', min: 0.8, max: 2.2, step: 0.05, default: 1.5, section: 'geometry' },
    displaceOctaves: { type: 'select', label: 'Surface Layers', options: [1, 2, 3, 4], default: 3, section: 'geometry' },
    displaceAmount: { type: 'number', label: 'Liquid Displacement', min: 0, max: 0.5, step: 0.01, default: 0.18, section: 'motion' },
    displaceScale: { type: 'number', label: 'Surface Character', min: 0.3, max: 4, step: 0.05, default: 1.4, section: 'motion' },
    breatheSpeed: { type: 'number', label: 'Breathing Rate', min: 0, max: 2, step: 0.05, default: 0.35, section: 'motion' },
    breatheAmp: { type: 'number', label: 'Breathing Depth', min: 0, max: 0.15, step: 0.005, default: 0.04, section: 'motion' },
    driftSpeed: { type: 'number', label: 'Surface Drift Speed', min: 0, max: 1.5, step: 0.05, default: 0.25, section: 'motion' },
    pulseDeform: { type: 'number', label: 'Pulse Deformation', min: 0, max: 0.6, step: 0.02, default: 0.25, section: 'motion' },
    bodyColor: { type: 'color', label: 'Body Tint', default: '#2dd4bf', section: 'colors' },
    coreColor: { type: 'color', label: 'Inner Light', default: '#ffed00', section: 'colors' },
    transmission: { type: 'number', label: 'Glassy Transmission', min: 0, max: 1, step: 0.01, default: 0.85, section: 'colors' },
    thickness: { type: 'number', label: 'Optical Thickness', min: 0, max: 3, step: 0.05, default: 1.2, section: 'colors' },
    ior: { type: 'number', label: 'Refraction Index', min: 1, max: 2.4, step: 0.01, default: 1.42, section: 'colors' },
    roughness: { type: 'number', label: 'Surface Roughness', min: 0, max: 1, step: 0.01, default: 0.15, section: 'colors' },
    coreIntensity: { type: 'number', label: 'Inner Light Strength', min: 0, max: 4, step: 0.1, default: 1.6, section: 'colors' },
    fresnelPower: { type: 'number', label: 'Rim Falloff', min: 0.5, max: 6, step: 0.1, default: 2.5, section: 'colors' },
  },

  [ENGINE_TYPES.CURL_DRIFT]: {
    streamCount: { type: 'select', label: 'Stream Count', options: [32, 48, 64, 96, 128], default: 64, section: 'geometry' },
    trailLength: { type: 'select', label: 'Trail Length', options: [16, 32, 48, 64, 96], default: 48, section: 'geometry' },
    shellRadius: { type: 'number', label: 'Flow Shell Radius', min: 0.8, max: 2.4, step: 0.05, default: 1.6, section: 'geometry' },
    lineWidth: { type: 'number', label: 'Stream Width', min: 0.5, max: 5, step: 0.1, default: 1.6, section: 'motion' },
    fieldScale: { type: 'number', label: 'Curl Field Scale', min: 0.2, max: 3, step: 0.05, default: 0.9, section: 'motion' },
    fieldEvolveSpeed: { type: 'number', label: 'Field Evolution Speed', min: 0, max: 1, step: 0.01, default: 0.12, section: 'motion' },
    flowSpeed: { type: 'number', label: 'Stream Flow Speed', min: 0.1, max: 3, step: 0.05, default: 0.8, section: 'motion' },
    shellBinding: { type: 'number', label: 'Shell Binding', min: 0, max: 2, step: 0.05, default: 0.7, section: 'motion' },
    swirl: { type: 'number', label: 'Directional Swirl', min: 0, max: 1.5, step: 0.05, default: 0.3, section: 'motion' },
    lifetimeJitter: { type: 'number', label: 'Lifetime Variation', min: 0, max: 1, step: 0.05, default: 0.5, section: 'motion' },
    headColor: { type: 'color', label: 'Leading Light', default: '#00f2fe', section: 'colors' },
    tailColor: { type: 'color', label: 'Trailing Light', default: '#a855f7', section: 'colors' },
    glowIntensity: { type: 'number', label: 'Flow Radiance', min: 0.4, max: 3, step: 0.1, default: 1.3, section: 'colors' },
    tailFade: { type: 'number', label: 'Trail Fade', min: 0, max: 1, step: 0.05, default: 0.7, section: 'colors' },
  },

  [ENGINE_TYPES.MURMURATION]: {
    agentCount: { type: 'select', label: 'Agent Count', options: [128, 256, 384, 512], default: 256, section: 'geometry' },
    shellRadius: { type: 'number', label: 'Swarm Shell Radius', min: 0.8, max: 2.6, step: 0.05, default: 1.7, section: 'geometry' },
    trailLength: { type: 'select', label: 'Ghost Trail Length', options: [0, 4, 8, 16], default: 8, section: 'geometry' },
    pointSize: { type: 'number', label: 'Agent Size', min: 0.5, max: 6, step: 0.1, default: 2, section: 'motion' },
    cohesion: { type: 'number', label: 'Cohesion', min: 0, max: 1, step: 0.01, default: 0.4, section: 'motion' },
    separation: { type: 'number', label: 'Separation', min: 0, max: 1, step: 0.01, default: 0.55, section: 'motion' },
    alignment: { type: 'number', label: 'Alignment', min: 0, max: 1, step: 0.01, default: 0.35, section: 'motion' },
    neighbourRadius: { type: 'number', label: 'Neighbour Radius', min: 0.1, max: 1.5, step: 0.05, default: 0.55, section: 'motion' },
    attractorPull: { type: 'number', label: 'Attractor Pull', min: 0, max: 2, step: 0.05, default: 0.5, section: 'motion' },
    shellBinding: { type: 'number', label: 'Shell Binding', min: 0, max: 2, step: 0.05, default: 0.8, section: 'motion' },
    agentSpeed: { type: 'number', label: 'Agent Speed', min: 0.1, max: 3, step: 0.05, default: 1, section: 'motion' },
    damping: { type: 'number', label: 'Collective Damping', min: 0.8, max: 0.995, step: 0.005, default: 0.96, section: 'motion' },
    coreColor: { type: 'color', label: 'Core Agent Colour', default: '#ffed00', section: 'colors' },
    edgeColor: { type: 'color', label: 'Shell Agent Colour', default: '#00f2fe', section: 'colors' },
    glowIntensity: { type: 'number', label: 'Swarm Radiance', min: 0.4, max: 3, step: 0.1, default: 1.4, section: 'colors' },
    trailFade: { type: 'number', label: 'Ghost Trail Fade', min: 0, max: 1, step: 0.05, default: 0.6, section: 'colors' },
  },

  [ENGINE_TYPES.FILAMENT]: {
    subdivision: { type: 'select', label: 'Lattice Subdivision', options: [1, 2, 3], default: 2, section: 'geometry' },
    radius: { type: 'number', label: 'Rest Sphere Radius', min: 0.8, max: 2.4, step: 0.05, default: 1.6, section: 'geometry' },
    nodeSize: { type: 'number', label: 'Node Size', min: 0, max: 0.1, step: 0.005, default: 0.03, section: 'motion' },
    lineWidth: { type: 'number', label: 'Filament Width', min: 0.5, max: 5, step: 0.1, default: 1.8, section: 'motion' },
    stiffness: { type: 'number', label: 'Spring Stiffness', min: 0.05, max: 1, step: 0.01, default: 0.35, section: 'motion' },
    damping: { type: 'number', label: 'Ring-down Damping', min: 0.8, max: 0.995, step: 0.005, default: 0.94, section: 'motion' },
    tether: { type: 'number', label: 'Rest Tether', min: 0, max: 0.5, step: 0.01, default: 0.06, section: 'motion' },
    pulseStrength: { type: 'number', label: 'Pulse Impulse', min: 0, max: 1.5, step: 0.05, default: 0.5, section: 'motion' },
    idleExcitation: { type: 'number', label: 'Idle Excitation', min: 0, max: 0.3, step: 0.01, default: 0.05, section: 'motion' },
    waveSpeed: { type: 'number', label: 'Wave Speed', min: 0, max: 2, step: 0.05, default: 0.4, section: 'motion' },
    displacementGlow: { type: 'number', label: 'Displacement Radiance', min: 0, max: 3, step: 0.1, default: 1.5, section: 'colors' },
    restColor: { type: 'color', label: 'Resting Filaments', default: '#1e293b', section: 'colors' },
    activeColor: { type: 'color', label: 'Active Signal', default: '#ffed00', section: 'colors' },
    nodeColor: { type: 'color', label: 'Node Light', default: '#ffffff', section: 'colors' },
  },

  [ENGINE_TYPES.PRISM_BLOOM]: {
    petalCount: { type: 'select', label: 'Petal Count', options: [24, 36, 48, 60, 72], default: 48, section: 'geometry' },
    petalLength: { type: 'number', label: 'Petal Length', min: 1.05, max: 1.42, step: 0.01, default: 1.32, section: 'geometry' },
    petalWidth: { type: 'number', label: 'Petal Width', min: 0.38, max: 0.64, step: 0.01, default: 0.52, section: 'geometry' },
    coreRadius: { type: 'number', label: 'Faceted Core Radius', min: 0.68, max: 0.9, step: 0.01, default: 0.83, section: 'geometry' },
    bloom: { type: 'number', label: 'Bloom Openness', min: 0.12, max: 1, step: 0.01, default: 0.58, section: 'motion' },
    fold: { type: 'number', label: 'Petal Fold', min: 0.35, max: 1, step: 0.01, default: 0.78, section: 'motion' },
    waveStrength: { type: 'number', label: 'Opening Wave', min: 0, max: 0.7, step: 0.01, default: 0.42, section: 'motion' },
    breatheAmp: { type: 'number', label: 'Breathing Depth', min: 0, max: 0.25, step: 0.01, default: 0.14, section: 'motion' },
    breatheSpeed: { type: 'number', label: 'Breathing Rate', min: 0.2, max: 1.4, step: 0.02, default: 0.72, section: 'motion' },
    innerColor: { type: 'color', label: 'Inner Petal Colour', default: '#f8c8ff', section: 'colors' },
    outerColor: { type: 'color', label: 'Outer Petal Colour', default: '#58c9ff', section: 'colors' },
    edgeColor: { type: 'color', label: 'Prismatic Edge', default: '#fff4cb', section: 'colors' },
    iridescence: { type: 'number', label: 'Iridescence', min: 0, max: 1, step: 0.01, default: 0.72, section: 'colors' },
    glow: { type: 'number', label: 'Crystal Radiance', min: 0.8, max: 1.8, step: 0.02, default: 1.28, section: 'colors' },
  },

  [ENGINE_TYPES.CORONA_VEIL]: {
    veilCount: { type: 'select', label: 'Veil Count', options: [5, 6, 8, 10, 12], default: 8, section: 'geometry' },
    detail: { type: 'select', label: 'Membrane Detail', options: [48, 64, 80, 96], default: 80, section: 'geometry' },
    coreRadius: { type: 'number', label: 'Dark Core Radius', min: 1.5, max: 1.75, step: 0.01, default: 1.62, section: 'geometry' },
    veilSpread: { type: 'number', label: 'Veil Separation', min: 0.14, max: 0.3, step: 0.01, default: 0.24, section: 'motion' },
    twist: { type: 'number', label: 'Membrane Twist', min: 0.25, max: 1.1, step: 0.01, default: 0.68, section: 'motion' },
    waveAmp: { type: 'number', label: 'Membrane Wave', min: 0.02, max: 0.09, step: 0.005, default: 0.055, section: 'motion' },
    breatheAmp: { type: 'number', label: 'Corona Breath', min: 0, max: 0.055, step: 0.005, default: 0.025, section: 'motion' },
    driftSpeed: { type: 'number', label: 'Veil Drift Speed', min: 0.06, max: 0.28, step: 0.01, default: 0.16, section: 'motion' },
    waveSpeed: { type: 'number', label: 'Membrane Wave Speed', min: 0.24, max: 0.72, step: 0.02, default: 0.48, section: 'motion' },
    coreColor: { type: 'color', label: 'Solar Core', default: '#02040a', section: 'colors' },
    veilColor: { type: 'color', label: 'Aurora Veil', default: '#62d8d2', section: 'colors' },
    accentColor: { type: 'color', label: 'Corona Accent', default: '#b9a7ff', section: 'colors' },
    opacity: { type: 'number', label: 'Veil Opacity', min: 0.16, max: 0.34, step: 0.01, default: 0.25, section: 'colors' },
    edgeGlow: { type: 'number', label: 'Membrane Edge Glow', min: 0.75, max: 1.7, step: 0.05, default: 1.25, section: 'colors' },
  },

  [ENGINE_TYPES.ECHO_RINGS]: {
    ringCount: { type: 'select', label: 'Idle Ring Count', options: [3, 5, 7, 9, 11], default: 7, section: 'geometry' },
    segments: { type: 'select', label: 'Ring Resolution', options: [64, 96, 128, 160, 192], default: 128, section: 'geometry' },
    radius: { type: 'number', label: 'Signal Sphere Radius', min: 1.4, max: 1.9, step: 0.02, default: 1.72, section: 'geometry' },
    lineWidth: { type: 'number', label: 'Signal Width', min: 0.8, max: 5, step: 0.1, default: 2.4, section: 'motion' },
    tiltSpread: { type: 'number', label: 'Ring Plane Spread', min: 0.15, max: 1.45, step: 0.02, default: 0.92, section: 'motion' },
    ringSpacing: { type: 'number', label: 'Wavefront Spacing', min: 0.35, max: 1.3, step: 0.01, default: 0.82, section: 'motion' },
    idleWave: { type: 'number', label: 'Idle Signal', min: 0, max: 1.2, step: 0.02, default: 0.42, section: 'motion' },
    pulseStrength: { type: 'number', label: 'Echo Strength', min: 0.4, max: 2.2, step: 0.05, default: 1.35, section: 'motion' },
    driftSpeed: { type: 'number', label: 'Ring Drift Speed', min: -0.4, max: 0.4, step: 0.01, default: 0.14, section: 'motion' },
    propagationSpeed: { type: 'number', label: 'Propagation Speed', min: 0.55, max: 1.45, step: 0.02, default: 1, section: 'motion' },
    baseColor: { type: 'color', label: 'Resting Rings', default: '#123039', section: 'colors' },
    echoColor: { type: 'color', label: 'Active Echo', default: '#42d9ff', section: 'colors' },
    coreColor: { type: 'color', label: 'Signal Core', default: '#e8fdff', section: 'colors' },
    glow: { type: 'number', label: 'Echo Radiance', min: 0.5, max: 2.8, step: 0.05, default: 1.65, section: 'colors' },
  },

  [ENGINE_TYPES.MYCELIUM]: {
    branchDepth: { type: 'select', label: 'Branch Depth', options: [3, 4, 5, 6], default: 5, section: 'geometry' },
    branching: { type: 'select', label: 'Branching', options: [2, 3], default: 2, section: 'geometry' },
    radius: { type: 'number', label: 'Growth Shell Radius', min: 1.85, max: 2.35, step: 0.05, default: 2.1, section: 'geometry' },
    lineWidth: { type: 'number', label: 'Network Width', min: 0.6, max: 3, step: 0.05, default: 1.35, section: 'motion' },
    curl: { type: 'number', label: 'Branch Curl', min: 0, max: 1.2, step: 0.01, default: 0.42, section: 'motion' },
    growth: { type: 'number', label: 'Visible Growth', min: 0.05, max: 1, step: 0.01, default: 1, section: 'motion' },
    reach: { type: 'number', label: 'Tip Reach', min: 0, max: 1, step: 0.01, default: 0.45, section: 'motion' },
    pulseStrength: { type: 'number', label: 'Signal Strength', min: 0.2, max: 1.4, step: 0.05, default: 0.8, section: 'motion' },
    crawlSpeed: { type: 'number', label: 'Growth Crawl Speed', min: 0.05, max: 1.2, step: 0.05, default: 0.32, section: 'motion' },
    pulseSpeed: { type: 'number', label: 'Signal Pulse Speed', min: 0.4, max: 3, step: 0.05, default: 1.35, section: 'motion' },
    rootColor: { type: 'color', label: 'Root Light', default: '#b7ffe1', section: 'colors' },
    tipColor: { type: 'color', label: 'Tip Light', default: '#287d78', section: 'colors' },
    signalColor: { type: 'color', label: 'Traveling Signal', default: '#f4ffd2', section: 'colors' },
    glow: { type: 'number', label: 'Network Radiance', min: 0.6, max: 2.6, step: 0.05, default: 1.55, section: 'colors' },
    packetSize: { type: 'number', label: 'Signal Packet Size', min: 1, max: 5, step: 0.1, default: 2.4, section: 'colors' },
  },
};

export function getDefaultEngineParams(engineType) {
  const defs = ENGINE_PARAM_DEFINITIONS[engineType] || {};
  const params = {};
  for (const [key, meta] of Object.entries(defs)) {
    params[key] = meta.default;
  }
  return params;
}

export function createInitialState() {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const reqEngine = urlParams?.get('engine');
  const engine = Object.values(ENGINE_TYPES).includes(reqEngine) ? reqEngine : ENGINE_TYPES.TESSERACT;

  return {
    engine,
    activePresetName:
      engine === ENGINE_TYPES.MOIRE
        ? '1. Chiral Square Vortex'
        : engine === ENGINE_TYPES.AURIS
        ? 'Geodesic Stellated Sun'
        : engine === ENGINE_TYPES.TESSERACT
        ? 'Canonical Hypercube'
        : engine === ENGINE_TYPES.HOPF
        ? 'Clifford Quantum Vortex'
        : engine === ENGINE_TYPES.POLYTOPE
        ? 'Lumaform Gold Merkabah'
        : engine === ENGINE_TYPES.QUANTUM
        ? 'Cyber Matrix'
        : engine === ENGINE_TYPES.SINGULARITY
        ? 'Gargantua Singularity'
        : engine === ENGINE_TYPES.AQUEOUS
        ? 'Stillwater Listener'
        : engine === ENGINE_TYPES.CURL_DRIFT
        ? 'Blue Current'
        : engine === ENGINE_TYPES.MURMURATION
        ? 'Deliberation Cloud'
        : engine === ENGINE_TYPES.FILAMENT
        ? 'Signal Lattice'
        : engine === ENGINE_TYPES.PRISM_BLOOM
        ? 'Opaline Bloom'
        : engine === ENGINE_TYPES.CORONA_VEIL
        ? 'Polar Veil'
        : engine === ENGINE_TYPES.ECHO_RINGS
        ? 'First Contact'
        : engine === ENGINE_TYPES.MYCELIUM
        ? 'Luminous Root'
        : 'Aurora Core',
    global: { ...DEFAULT_GLOBAL_SETTINGS },
    modulation: createDefaultModulation(),
    engines: {
      [ENGINE_TYPES.MOIRE]: getDefaultEngineParams(ENGINE_TYPES.MOIRE),
      [ENGINE_TYPES.AURIS]: getDefaultEngineParams(ENGINE_TYPES.AURIS),
      [ENGINE_TYPES.TESSERACT]: getDefaultEngineParams(ENGINE_TYPES.TESSERACT),
      [ENGINE_TYPES.HOPF]: getDefaultEngineParams(ENGINE_TYPES.HOPF),
      [ENGINE_TYPES.POLYTOPE]: getDefaultEngineParams(ENGINE_TYPES.POLYTOPE),
      [ENGINE_TYPES.NEBULA]: getDefaultEngineParams(ENGINE_TYPES.NEBULA),
      [ENGINE_TYPES.QUANTUM]: getDefaultEngineParams(ENGINE_TYPES.QUANTUM),
      [ENGINE_TYPES.SINGULARITY]: getDefaultEngineParams(ENGINE_TYPES.SINGULARITY),
      [ENGINE_TYPES.FLUX]: getDefaultEngineParams(ENGINE_TYPES.FLUX),
      [ENGINE_TYPES.AQUEOUS]: getDefaultEngineParams(ENGINE_TYPES.AQUEOUS),
      [ENGINE_TYPES.CURL_DRIFT]: getDefaultEngineParams(ENGINE_TYPES.CURL_DRIFT),
      [ENGINE_TYPES.MURMURATION]: getDefaultEngineParams(ENGINE_TYPES.MURMURATION),
      [ENGINE_TYPES.FILAMENT]: getDefaultEngineParams(ENGINE_TYPES.FILAMENT),
      [ENGINE_TYPES.PRISM_BLOOM]: getDefaultEngineParams(ENGINE_TYPES.PRISM_BLOOM),
      [ENGINE_TYPES.CORONA_VEIL]: getDefaultEngineParams(ENGINE_TYPES.CORONA_VEIL),
      [ENGINE_TYPES.ECHO_RINGS]: getDefaultEngineParams(ENGINE_TYPES.ECHO_RINGS),
      [ENGINE_TYPES.MYCELIUM]: getDefaultEngineParams(ENGINE_TYPES.MYCELIUM),
    },
  };
}

// Color Utilities & Harmony Generator
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function generateHarmoniousPalette() {
  const baseHue = Math.floor(Math.random() * 360);
  const schemeType = Math.floor(Math.random() * 4);
  let h1 = baseHue;
  let h2, h3;

  switch (schemeType) {
    case 0:
      h2 = (baseHue + 180) % 360;
      h3 = (baseHue + 40) % 360;
      break;
    case 1:
      h2 = (baseHue + 120) % 360;
      h3 = (baseHue + 240) % 360;
      break;
    case 2:
      h2 = (baseHue + 35) % 360;
      h3 = (baseHue + 70) % 360;
      break;
    default:
      h2 = (baseHue + 150) % 360;
      h3 = (baseHue + 210) % 360;
      break;
  }

  const sat = 85 + Math.floor(Math.random() * 15);
  const l1 = 55 + Math.floor(Math.random() * 15);
  const l2 = 60 + Math.floor(Math.random() * 15);
  const l3 = 65 + Math.floor(Math.random() * 15);

  return {
    primary: hslToHex(h1, sat, l1),
    secondary: hslToHex(h2, sat, l2),
    accent: hslToHex(h3, sat, l3),
  };
}

export function randomizeState(currentState) {
  const palette = generateHarmoniousPalette();
  const engine = currentState.engine;
  const newEngineParams = { ...currentState.engines[engine] };

  if (engine === ENGINE_TYPES.TESSERACT) {
    newEngineParams.color1 = palette.primary;
    newEngineParams.color2 = palette.secondary;
    newEngineParams.cellColor = palette.accent;
    newEngineParams.cubeSize = +(1.0 + Math.random() * 0.8).toFixed(2);
    newEngineParams.rotSpeedXW = +((Math.random() - 0.5) * 1.5).toFixed(2);
    newEngineParams.rotSpeedYW = +((Math.random() - 0.5) * 1.5).toFixed(2);
  } else if (engine === ENGINE_TYPES.MOIRE) {
    newEngineParams.lineColor = palette.primary;
    newEngineParams.zDepth = +(0.8 + Math.random() * 1.5).toFixed(2);
    newEngineParams.twistAngle = +((Math.random() - 0.5) * 2.0).toFixed(2);
    newEngineParams.innerScale = +(0.15 + Math.random() * 0.35).toFixed(2);
    newEngineParams.rotSpeedX = +((Math.random() - 0.5) * 0.8).toFixed(2);
    newEngineParams.rotSpeedY = +((Math.random() - 0.5) * 0.8).toFixed(2);
    newEngineParams.rotSpeedZ = +((Math.random() - 0.5) * 0.4).toFixed(2);
    newEngineParams.lineDensity = Math.floor(18 + Math.random() * 20);
  } else if (engine === ENGINE_TYPES.HOPF) {
    newEngineParams.color1 = palette.primary;
    newEngineParams.color2 = palette.secondary;
    newEngineParams.accentColor = palette.accent;
    newEngineParams.torusRadius = +(1.2 + Math.random() * 0.9).toFixed(2);
    newEngineParams.tubeRadius = +(0.6 + Math.random() * 0.6).toFixed(2);
    newEngineParams.cliffordSpeed = +(0.4 + Math.random() * 1.2).toFixed(2);
  } else if (engine === ENGINE_TYPES.POLYTOPE) {
    newEngineParams.color1 = palette.primary;
    newEngineParams.color2 = palette.secondary;
    newEngineParams.wireColor = palette.accent;
    newEngineParams.scale = +(1.2 + Math.random() * 0.8).toFixed(2);
    newEngineParams.rotRateA = +((Math.random() - 0.5) * 1.5).toFixed(2);
    newEngineParams.rotRateB = +((Math.random() - 0.5) * 1.5).toFixed(2);
  } else if (engine === ENGINE_TYPES.AURIS) {
    newEngineParams.lightColor = palette.primary;
    newEngineParams.wireColor = palette.secondary;
    newEngineParams.shadowColor = palette.bg;
    newEngineParams.lightYaw = Math.floor(Math.random() * 360);
    newEngineParams.lightPitch = Math.floor(-30 + Math.random() * 90);
    newEngineParams.wireWidth = +(1.6 + Math.random() * 1.8).toFixed(1);
    newEngineParams.stellaHeight = +(0.2 + Math.random() * 0.6).toFixed(2);
  } else if (engine === ENGINE_TYPES.NEBULA) {
    newEngineParams.color1 = palette.primary;
    newEngineParams.color2 = palette.secondary;
    newEngineParams.colorShell = palette.accent;
    newEngineParams.aberration = +(0.3 + Math.random() * 1.3).toFixed(2);
    newEngineParams.glowIntensity = +(0.005 + Math.random() * 0.006).toFixed(3);
    newEngineParams.fractalScale = +(0.5 + Math.random() * 0.5).toFixed(2);
    newEngineParams.fractalMult = +(1.8 + Math.random() * 1.2).toFixed(2);
  } else if (engine === ENGINE_TYPES.QUANTUM) {
    newEngineParams.color1 = palette.primary;
    newEngineParams.color2 = palette.secondary;
    newEngineParams.color3 = palette.accent;
    newEngineParams.edgeGlow = +(0.8 + Math.random() * 1.5).toFixed(2);
    newEngineParams.scaleFactor = +(1.8 + Math.random() * 0.9).toFixed(2);
  } else if (engine === ENGINE_TYPES.SINGULARITY) {
    newEngineParams.color1 = palette.primary;
    newEngineParams.color2 = palette.secondary;
    newEngineParams.color3 = palette.accent;
    newEngineParams.warpStrength = +(1.0 + Math.random() * 0.9).toFixed(2);
    newEngineParams.diskSpeed = +(0.5 + Math.random() * 1.0).toFixed(2);
  } else if (engine === ENGINE_TYPES.AQUEOUS) {
    newEngineParams.bodyColor = palette.primary;
    newEngineParams.coreColor = palette.accent;
    newEngineParams.displaceAmount = +(0.1 + Math.random() * 0.22).toFixed(2);
    newEngineParams.displaceScale = +(0.7 + Math.random() * 1.7).toFixed(2);
    newEngineParams.thickness = +(0.6 + Math.random() * 1.4).toFixed(2);
  } else if (engine === ENGINE_TYPES.CURL_DRIFT) {
    newEngineParams.headColor = palette.primary;
    newEngineParams.tailColor = palette.secondary;
    newEngineParams.fieldScale = +(0.45 + Math.random() * 1.5).toFixed(2);
    newEngineParams.swirl = +(0.1 + Math.random() * 0.8).toFixed(2);
    newEngineParams.lineWidth = +(1 + Math.random() * 1.8).toFixed(1);
  } else if (engine === ENGINE_TYPES.MURMURATION) {
    newEngineParams.coreColor = palette.primary;
    newEngineParams.edgeColor = palette.accent;
    newEngineParams.attractorPull = +(0.2 + Math.random() * 1.2).toFixed(2);
    newEngineParams.cohesion = +(0.2 + Math.random() * 0.55).toFixed(2);
    newEngineParams.separation = +(0.3 + Math.random() * 0.55).toFixed(2);
  } else if (engine === ENGINE_TYPES.FILAMENT) {
    newEngineParams.activeColor = palette.primary;
    newEngineParams.nodeColor = palette.accent;
    newEngineParams.stiffness = +(0.18 + Math.random() * 0.58).toFixed(2);
    newEngineParams.damping = +(0.88 + Math.random() * 0.1).toFixed(3);
    newEngineParams.idleExcitation = +(0.02 + Math.random() * 0.12).toFixed(2);
  } else if (engine === ENGINE_TYPES.PRISM_BLOOM) {
    newEngineParams.innerColor = palette.primary;
    newEngineParams.outerColor = palette.secondary;
    newEngineParams.edgeColor = palette.accent;
    newEngineParams.bloom = +(0.3 + Math.random() * 0.55).toFixed(2);
    newEngineParams.fold = +(0.45 + Math.random() * 0.45).toFixed(2);
  } else if (engine === ENGINE_TYPES.CORONA_VEIL) {
    newEngineParams.veilColor = palette.primary;
    newEngineParams.accentColor = palette.secondary;
    newEngineParams.twist = +(0.35 + Math.random() * 0.55).toFixed(2);
    newEngineParams.veilSpread = +(0.16 + Math.random() * 0.12).toFixed(2);
    newEngineParams.edgeGlow = +(0.9 + Math.random() * 0.55).toFixed(2);
  } else if (engine === ENGINE_TYPES.ECHO_RINGS) {
    newEngineParams.baseColor = palette.secondary;
    newEngineParams.echoColor = palette.primary;
    newEngineParams.coreColor = palette.accent;
    newEngineParams.tiltSpread = +(0.45 + Math.random() * 0.8).toFixed(2);
    newEngineParams.idleWave = +(0.2 + Math.random() * 0.75).toFixed(2);
  } else if (engine === ENGINE_TYPES.MYCELIUM) {
    newEngineParams.rootColor = palette.primary;
    newEngineParams.tipColor = palette.secondary;
    newEngineParams.signalColor = palette.accent;
    newEngineParams.curl = +(0.15 + Math.random() * 0.75).toFixed(2);
    newEngineParams.reach = +(0.2 + Math.random() * 0.65).toFixed(2);
  }

  const newGlobal = {
    ...currentState.global,
    bloomStrength: +(0.5 + Math.random() * 0.4).toFixed(2),
    bloomRadius: +(0.3 + Math.random() * 0.25).toFixed(2),
  };

  return {
    ...currentState,
    activePresetName: 'Procedural Creation',
    global: newGlobal,
    engines: {
      ...currentState.engines,
      [engine]: newEngineParams,
    },
  };
}

// Local Storage for Custom Saved Presets
const STORAGE_KEY = 'lumaform_orb_custom_presets_v1';

export function loadSavedPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Failed to read presets from localStorage', err);
    return [];
  }
}

export function saveCustomPreset(preset) {
  try {
    const list = loadSavedPresets();
    const filtered = list.filter((p) => p.name !== preset.name);
    filtered.unshift(preset);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, 30)));
    return true;
  } catch (err) {
    console.warn('Failed to save preset to localStorage', err);
    return false;
  }
}

export function deleteCustomPreset(name) {
  try {
    const list = loadSavedPresets();
    const updated = list.filter((p) => p.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.warn('Failed to delete preset from localStorage', err);
    return false;
  }
}
