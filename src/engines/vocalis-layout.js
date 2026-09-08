export const RING_LAYOUTS = ['circle', 'iris', 'ellipse', 'globe'];

const ELLIPSE_ASPECT = 0.58;
const IRIS_BLADES = 6;
const IRIS_SCALLOP = 0.18;

export function resolveRingLayout(layout) {
  return RING_LAYOUTS.includes(layout) ? layout : 'circle';
}

export function ringRest(layout, ringNorm, baseRadius, depth) {
  const R = Math.max(1e-5, baseRadius);
  const n = Math.min(1, Math.max(0, ringNorm));
  const resolved = resolveRingLayout(layout);

  switch (resolved) {
    case 'globe':
      return {
        radius: R,
        zOffset: 0,
        phi: 0.28 + n * 1.05,
      };
    case 'circle':
    case 'iris':
    case 'ellipse':
      return {
        radius: R * (0.35 + n * 0.75),
        zOffset: (Math.pow(n, 1.5) - 0.5) * depth,
        phi: 0,
      };
    default:
      return {
        radius: R * (0.35 + n * 0.75),
        zOffset: (Math.pow(n, 1.5) - 0.5) * depth,
        phi: 0,
      };
  }
}

export function sampleRingPoint(layout, theta, rest, radiusScale = 1) {
  const scale = Number.isFinite(radiusScale) ? radiusScale : 1;
  const r = rest.radius * scale;
  const z = rest.zOffset;
  const resolved = resolveRingLayout(layout);

  switch (resolved) {
    case 'ellipse':
      return [r * Math.cos(theta), r * ELLIPSE_ASPECT * Math.sin(theta), z];
    case 'iris': {
      const scallop = 1 + IRIS_SCALLOP * Math.cos(theta * IRIS_BLADES);
      return [r * scallop * Math.cos(theta), r * scallop * Math.sin(theta), z];
    }
    case 'globe': {
      const phi = rest.phi;
      const sinPhi = Math.sin(phi);
      return [
        r * sinPhi * Math.cos(theta),
        r * Math.cos(phi),
        r * sinPhi * Math.sin(theta),
      ];
    }
    case 'circle':
    default:
      return [r * Math.cos(theta), r * Math.sin(theta), z];
  }
}
