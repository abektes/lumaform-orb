// Aqueous volume and core colour. The GLSL in aqueous-engine.js must stay in
// step: absorption follows the body hue's complement, and the core heats toward
// white in the same hue — never a hardcoded teal volume or amber nucleus.

export function aqueousAbsorption(body, travel) {
  return [
    Math.exp(-(1 - body[0]) * travel * 0.92),
    Math.exp(-(1 - body[1]) * travel * 0.92),
    Math.exp(-(1 - body[2]) * travel * 0.92),
  ];
}

export function aqueousCoreColor(core, facing, intensity) {
  const hot = [
    core[0] + (1 - core[0]) * 0.4,
    core[1] + (1 - core[1]) * 0.4,
    core[2] + (1 - core[2]) * 0.4,
  ];
  const t = 0.18 + facing * 0.64;
  const gain = 0.72 + intensity * 0.38;
  return [
    (core[0] * 0.28 + (hot[0] - core[0] * 0.28) * t) * gain,
    (core[1] * 0.28 + (hot[1] - core[1] * 0.28) * t) * gain,
    (core[2] * 0.28 + (hot[2] - core[2] * 0.28) * t) * gain,
  ];
}
