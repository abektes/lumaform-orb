// Flux strand colour. The GLSL in flux-engine.js must stay in step with this:
// glow used to multiply the whole strand (default 2.1), which pushed every
// pixel into HDR before additive blending, so palette changes washed out.

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function fluxStrandColor(ramp, crest, s, glow) {
  const hot = smoothstep(0.45, 1.0, Math.abs(crest));
  const body = 0.55 + 0.45 * (1 - Math.abs(s - 0.5) * 2);
  const restGain = Math.min(1, 0.55 * body);
  const intensity = restGain + hot * body * Math.max(0, glow - 0.55);
  return [ramp[0] * intensity, ramp[1] * intensity, ramp[2] * intensity];
}
