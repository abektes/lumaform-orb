export const SHELL_SHAPES = ['sphere', 'torus', 'cube', 'disk'];

const TORUS_MAJOR = 0.72;
const TORUS_MINOR = 0.28;
const DISK_FLATTEN = 0.32;

export function resolveShellShape(shape) {
  return SHELL_SHAPES.includes(shape) ? shape : 'sphere';
}

export function shellBoundRadius(shape, radius) {
  const R = Math.max(1e-5, radius);
  switch (resolveShellShape(shape)) {
    case 'cube':
      return R * Math.sqrt(3);
    case 'torus':
    case 'disk':
    case 'sphere':
      return R;
    default:
      return R;
  }
}

export function shellSdf(x, y, z, radius, shape) {
  const R = Math.max(1e-5, radius);
  switch (resolveShellShape(shape)) {
    case 'torus': {
      const major = R * TORUS_MAJOR;
      const minor = R * TORUS_MINOR;
      const q = Math.hypot(x, z) - major;
      return Math.hypot(q, y) - minor;
    }
    case 'cube': {
      const ax = Math.abs(x) - R;
      const ay = Math.abs(y) - R;
      const az = Math.abs(z) - R;
      const ox = Math.max(ax, 0);
      const oy = Math.max(ay, 0);
      const oz = Math.max(az, 0);
      const outside = Math.hypot(ox, oy, oz);
      const inside = Math.min(Math.max(ax, ay, az), 0);
      return outside + inside;
    }
    case 'disk': {
      const nx = x / R;
      const ny = y / (R * DISK_FLATTEN);
      const nz = z / R;
      const len = Math.hypot(nx, ny, nz);
      return (len - 1) * R * DISK_FLATTEN;
    }
    case 'sphere':
      return Math.hypot(x, y, z) - R;
    default:
      return Math.hypot(x, y, z) - R;
  }
}

export function shellNormal(x, y, z, radius, shape) {
  const R = Math.max(1e-5, radius);
  const e = R * 1e-3;
  const gx = shellSdf(x + e, y, z, R, shape) - shellSdf(x - e, y, z, R, shape);
  const gy = shellSdf(x, y + e, z, R, shape) - shellSdf(x, y - e, z, R, shape);
  const gz = shellSdf(x, y, z + e, R, shape) - shellSdf(x, y, z - e, R, shape);
  const len = Math.max(1e-5, Math.hypot(gx, gy, gz));
  return [gx / len, gy / len, gz / len];
}

export function spawnOnShell(random, radius, shape) {
  const R = Math.max(1e-5, radius);
  const resolved = resolveShellShape(shape);

  switch (resolved) {
    case 'torus': {
      const major = R * TORUS_MAJOR;
      const minor = R * TORUS_MINOR;
      const u = random() * Math.PI * 2;
      const v = random() * Math.PI * 2;
      const ring = major + minor * Math.cos(v);
      return [
        ring * Math.cos(u),
        minor * Math.sin(v),
        ring * Math.sin(u),
      ];
    }
    case 'cube': {
      const face = Math.floor(random() * 6);
      const u = (random() * 2 - 1) * R;
      const v = (random() * 2 - 1) * R;
      switch (face) {
        case 0: return [R, u, v];
        case 1: return [-R, u, v];
        case 2: return [u, R, v];
        case 3: return [u, -R, v];
        case 4: return [u, v, R];
        default: return [u, v, -R];
      }
    }
    case 'disk': {
      const z = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const planar = Math.sqrt(Math.max(0, 1 - z * z));
      return [
        Math.cos(theta) * planar * R,
        z * R * DISK_FLATTEN,
        Math.sin(theta) * planar * R,
      ];
    }
    case 'sphere':
    default: {
      const z = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const radial = R * (0.9 + random() * 0.13);
      const planar = Math.sqrt(Math.max(0, 1 - z * z));
      return [
        Math.cos(theta) * planar * radial,
        z * radial,
        Math.sin(theta) * planar * radial,
      ];
    }
  }
}
