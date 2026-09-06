// Central state management, parameter schemas, and serialization for Lumaform Orb Studio

export const ENGINE_TYPES = {
  TESSERACT: 'tesseract',
  AURIS: 'auris',
  HOPF: 'hopf',
  POLYTOPE: 'polytope',
  NEBULA: 'nebula',
  QUANTUM: 'quantum',
  SINGULARITY: 'singularity',
};

export const ENGINE_INFO = {
  [ENGINE_TYPES.TESSERACT]: {
    id: ENGINE_TYPES.TESSERACT,
    name: '4D Tesseract',
    badge: 'Hypercube Projection',
    description: 'Canonical 4-dimensional hypercube projected into 3D space with rigid 3D perspective and harmonic 4D inversion.',
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
};

export const DEFAULT_GLOBAL_SETTINGS = {
  dpr: 1.2,
  exposure: 1.05,
  bloomStrength: 0.65,
  bloomRadius: 0.40,
  bloomThreshold: 0.12,
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
    archetype: { type: 'select', label: 'Crystalline Archetype', options: ['geodesic', 'cubic_compound', 'vortex_square', 'vortex_hex', 'sacred_rosette', 'vortex_triangle'], default: 'geodesic', section: 'geometry' },
    scale: { type: 'number', label: 'Polyhedron Scale', min: 0.8, max: 2.5, step: 0.05, default: 1.4, section: 'geometry' },
    stellaHeight: { type: 'number', label: 'Stellation Apex Extrusion', min: 0.0, max: 1.2, step: 0.02, default: 0.45, section: 'geometry' },
    twistAngle: { type: 'number', label: 'Vortex Chiral Twist', min: 0.02, max: 0.35, step: 0.01, default: 0.14, section: 'geometry' },
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
      engine === ENGINE_TYPES.AURIS
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
        : 'Aurora Core',
    global: { ...DEFAULT_GLOBAL_SETTINGS },
    engines: {
      [ENGINE_TYPES.AURIS]: getDefaultEngineParams(ENGINE_TYPES.AURIS),
      [ENGINE_TYPES.TESSERACT]: getDefaultEngineParams(ENGINE_TYPES.TESSERACT),
      [ENGINE_TYPES.HOPF]: getDefaultEngineParams(ENGINE_TYPES.HOPF),
      [ENGINE_TYPES.POLYTOPE]: getDefaultEngineParams(ENGINE_TYPES.POLYTOPE),
      [ENGINE_TYPES.NEBULA]: getDefaultEngineParams(ENGINE_TYPES.NEBULA),
      [ENGINE_TYPES.QUANTUM]: getDefaultEngineParams(ENGINE_TYPES.QUANTUM),
      [ENGINE_TYPES.SINGULARITY]: getDefaultEngineParams(ENGINE_TYPES.SINGULARITY),
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
    newEngineParams.rotSpeedZW = +((Math.random() - 0.5) * 1.5).toFixed(2);
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
