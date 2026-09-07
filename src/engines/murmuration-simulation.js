const SEED = 0x6d75726d;
const MAX_FRAME_DELTA = 1 / 30;
const MAX_SUBSTEP = 1 / 60;
const MAX_NEIGHBOURS = 96;

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createMurmurationSimulation({
  agentCount = 256,
  shellRadius = 1.7,
  agentSpeed = 1,
} = {}) {
  const count = Math.max(1, Math.floor(finitePositive(Number(agentCount), 256)));
  const radius = finitePositive(Number(shellRadius), 1.7);
  const speed = finitePositive(Number(agentSpeed), 1);
  const random = mulberry32(SEED);
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const accelerations = new Float32Array(count * 3);
  const phases = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const z = random() * 2 - 1;
    const theta = random() * Math.PI * 2;
    const radial = radius * (0.9 + random() * 0.13);
    const planar = Math.sqrt(Math.max(0, 1 - z * z));
    const nx = Math.cos(theta) * planar;
    const ny = z;
    const nz = Math.sin(theta) * planar;
    const p = i * 3;

    positions[p] = nx * radial;
    positions[p + 1] = ny * radial;
    positions[p + 2] = nz * radial;

    let tx = -nz;
    let ty = 0;
    let tz = nx;
    const tangentLength = Math.hypot(tx, ty, tz);
    if (tangentLength < 1e-4) {
      tx = 0;
      ty = nz;
      tz = -ny;
    } else {
      tx /= tangentLength;
      ty /= tangentLength;
      tz /= tangentLength;
    }
    const initialSpeed = speed * (0.18 + random() * 0.22);
    velocities[p] = tx * initialSpeed;
    velocities[p + 1] = ty * initialSpeed;
    velocities[p + 2] = tz * initialSpeed;
    phases[i * 2] = random() * Math.PI * 2;
    phases[i * 2 + 1] = random() * Math.PI * 2;
  }

  return {
    positions,
    velocities,
    accelerations,
    phases,
    elapsed: 0,
    speedBoost: 0,
  };
}

function integrateSubstep(simulation, params, dt) {
  const { positions, velocities, accelerations, phases } = simulation;
  const count = positions.length / 3;
  const shellRadius = finitePositive(Number(params.shellRadius), 1.7);
  const agentSpeed = finitePositive(Number(params.agentSpeed), 1);
  const neighbourRadius = finitePositive(Number(params.neighbourRadius), 0.55);
  const neighbourRadiusSq = neighbourRadius * neighbourRadius;
  const separationRadiusSq = neighbourRadiusSq * 0.36;
  const sampledNeighbours = count <= 320
    ? count - 1
    : Math.min(count - 1, MAX_NEIGHBOURS);
  const sampleStride = 97;
  const motionScale = 0.35 + Math.min(agentSpeed, 3) * 0.65;
  const cohesionGain = Math.max(0, Number(params.cohesion) || 0) * 2.4 * motionScale;
  const separationGain = Math.max(0, Number(params.separation) || 0) * 0.42 * motionScale;
  const alignmentGain = Math.max(0, Number(params.alignment) || 0) * 2 * motionScale;
  const shellGain = Math.max(0, Number(params.shellBinding) || 0) * 2.2;
  const attractorGain = Math.max(0, Number(params.attractorPull) || 0) * 1.45;

  for (let i = 0; i < count; i++) {
    const p = i * 3;
    const px = positions[p];
    const py = positions[p + 1];
    const pz = positions[p + 2];
    let centreX = 0;
    let centreY = 0;
    let centreZ = 0;
    let headingX = 0;
    let headingY = 0;
    let headingZ = 0;
    let separateX = 0;
    let separateY = 0;
    let separateZ = 0;
    let neighbours = 0;

    for (let s = 0; s < sampledNeighbours; s++) {
      const j = count <= 320
        ? (s < i ? s : s + 1)
        : (i + 1 + s * sampleStride) % count;
      if (j === i) continue;
      const q = j * 3;
      const dx = positions[q] - px;
      const dy = positions[q + 1] - py;
      const dz = positions[q + 2] - pz;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq >= neighbourRadiusSq) continue;

      centreX += positions[q];
      centreY += positions[q + 1];
      centreZ += positions[q + 2];
      headingX += velocities[q];
      headingY += velocities[q + 1];
      headingZ += velocities[q + 2];
      neighbours++;

      if (distanceSq < separationRadiusSq && distanceSq > 1e-8) {
        const weight = 1 / (distanceSq + 0.015);
        separateX -= dx * weight;
        separateY -= dy * weight;
        separateZ -= dz * weight;
      }
    }

    let ax = 0;
    let ay = 0;
    let az = 0;
    if (neighbours > 0) {
      const inverseCount = 1 / neighbours;
      ax += (centreX * inverseCount - px) * cohesionGain;
      ay += (centreY * inverseCount - py) * cohesionGain;
      az += (centreZ * inverseCount - pz) * cohesionGain;
      ax += (headingX * inverseCount - velocities[p]) * alignmentGain;
      ay += (headingY * inverseCount - velocities[p + 1]) * alignmentGain;
      az += (headingZ * inverseCount - velocities[p + 2]) * alignmentGain;
      ax += separateX * inverseCount * separationGain;
      ay += separateY * inverseCount * separationGain;
      az += separateZ * inverseCount * separationGain;
    }

    const radius = Math.max(1e-5, Math.hypot(px, py, pz));
    const nx = px / radius;
    const ny = py / radius;
    const nz = pz / radius;
    const radialForce = (shellRadius - radius) * shellGain - attractorGain;
    ax += nx * radialForce;
    ay += ny * radialForce;
    az += nz * radialForce;

    // A weak, slowly turning tangential field keeps a settled flock circulating
    // without prescribing a path to any individual agent.
    const phase = phases[i * 2];
    const axisX = Math.sin(simulation.elapsed * 0.23 + phase * 0.07);
    const axisY = Math.cos(simulation.elapsed * 0.19 + phases[i * 2 + 1] * 0.05);
    const axisZ = Math.sin(simulation.elapsed * 0.17 + 1.7);
    let tangentX = axisY * nz - axisZ * ny;
    let tangentY = axisZ * nx - axisX * nz;
    let tangentZ = axisX * ny - axisY * nx;
    const tangentLength = Math.max(1e-5, Math.hypot(tangentX, tangentY, tangentZ));
    tangentX /= tangentLength;
    tangentY /= tangentLength;
    tangentZ /= tangentLength;
    const drift = agentSpeed * (0.12 + 0.035 * Math.sin(simulation.elapsed * 0.7 + phase));
    ax += tangentX * drift;
    ay += tangentY * drift;
    az += tangentZ * drift;

    const accelerationLength = Math.hypot(ax, ay, az);
    const maxAcceleration = 7 + attractorGain;
    if (accelerationLength > maxAcceleration) {
      const scale = maxAcceleration / accelerationLength;
      ax *= scale;
      ay *= scale;
      az *= scale;
    }
    accelerations[p] = ax;
    accelerations[p + 1] = ay;
    accelerations[p + 2] = az;
  }

  const damping = Math.min(0.9999, Math.max(0, Number(params.damping) || 0));
  const dampingFactor = Math.pow(damping, dt * 60);
  const maxSpeed = agentSpeed * (1.05 + simulation.speedBoost * 2.4) + 0.05;
  const maxRadius = shellRadius * 1.995;

  for (let i = 0; i < count; i++) {
    const p = i * 3;
    let vx = (velocities[p] + accelerations[p] * dt) * dampingFactor;
    let vy = (velocities[p + 1] + accelerations[p + 1] * dt) * dampingFactor;
    let vz = (velocities[p + 2] + accelerations[p + 2] * dt) * dampingFactor;
    const speed = Math.hypot(vx, vy, vz);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      vx *= scale;
      vy *= scale;
      vz *= scale;
    }

    let px = positions[p] + vx * dt;
    let py = positions[p + 1] + vy * dt;
    let pz = positions[p + 2] + vz * dt;
    const radius = Math.hypot(px, py, pz);
    if (radius > maxRadius) {
      const scale = maxRadius / radius;
      px *= scale;
      py *= scale;
      pz *= scale;
      const nx = px / maxRadius;
      const ny = py / maxRadius;
      const nz = pz / maxRadius;
      const outwardSpeed = vx * nx + vy * ny + vz * nz;
      if (outwardSpeed > 0) {
        vx -= nx * outwardSpeed * 1.15;
        vy -= ny * outwardSpeed * 1.15;
        vz -= nz * outwardSpeed * 1.15;
      }
    }

    positions[p] = px;
    positions[p + 1] = py;
    positions[p + 2] = pz;
    velocities[p] = vx;
    velocities[p + 1] = vy;
    velocities[p + 2] = vz;
  }

  simulation.elapsed += dt;
  simulation.speedBoost *= Math.exp(-4 * dt);
}

export function stepMurmuration(simulation, params, delta) {
  const safeDelta = Math.min(
    MAX_FRAME_DELTA,
    Math.max(0, Number.isFinite(delta) ? delta : 0)
  );
  if (safeDelta === 0) return;
  const substeps = Math.ceil(safeDelta / MAX_SUBSTEP);
  const step = safeDelta / substeps;
  for (let i = 0; i < substeps; i++) {
    integrateSubstep(simulation, params, step);
  }
}

export function scatterMurmuration(simulation, agentSpeed = 1) {
  const { positions, velocities, phases } = simulation;
  const count = positions.length / 3;
  const speed = finitePositive(Number(agentSpeed), 1);

  for (let i = 0; i < count; i++) {
    const p = i * 3;
    const radius = Math.max(1e-5, Math.hypot(
      positions[p],
      positions[p + 1],
      positions[p + 2]
    ));
    const nx = positions[p] / radius;
    const ny = positions[p + 1] / radius;
    const nz = positions[p + 2] / radius;
    const phase = phases[i * 2];
    const impulse = Math.max(0.75, speed) * (1.75 + 0.45 * Math.sin(phase));
    const tangent = Math.cos(phases[i * 2 + 1]) * 0.38 * speed;
    velocities[p] += nx * impulse - nz * tangent;
    velocities[p + 1] += ny * impulse;
    velocities[p + 2] += nz * impulse + nx * tangent;
  }
  simulation.speedBoost = 1;
}

export function measureMurmuration(simulation) {
  const { positions } = simulation;
  let radiusTotal = 0;
  let maxRadius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const radius = Math.hypot(positions[i], positions[i + 1], positions[i + 2]);
    radiusTotal += radius;
    maxRadius = Math.max(maxRadius, radius);
  }
  return {
    averageRadius: radiusTotal / (positions.length / 3),
    maxRadius,
  };
}
