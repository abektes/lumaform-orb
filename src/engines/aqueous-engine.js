import * as THREE from 'three';
import { createPhaseTracker } from '../core/phase.js';

const DEFAULT_PARAMS = {
  detail: 5,
  radius: 1.5,
  displaceAmount: 0.18,
  displaceScale: 1.4,
  displaceOctaves: 3,
  breatheSpeed: 0.35,
  breatheAmp: 0.04,
  driftSpeed: 0.25,
  pulseDeform: 0.25,
  transmission: 0.85,
  thickness: 1.2,
  ior: 1.42,
  roughness: 0.15,
  bodyColor: '#2dd4bf',
  coreColor: '#ffed00',
  coreIntensity: 1.6,
  fresnelPower: 2.5,
};

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, Math.round(number)))
    : fallback;
}

function frameRadiusFor(params) {
  const radius = Math.max(0, Number(params.radius) || 0);
  const breathe = Math.abs(Number(params.breatheAmp) || 0) * radius;
  const displacement = Math.abs(Number(params.displaceAmount) || 0);
  const pulse = Math.abs(Number(params.pulseDeform) || 0);
  return Math.max(0.1, (radius + breathe + displacement + pulse) * 1.05);
}

export function createAqueousEngine({ scene, params }) {
  const currentParams = {
    ...DEFAULT_PARAMS,
    ...params,
  };

  const group = new THREE.Group();
  scene.add(group);

  const bodyMaterial = new THREE.ShaderMaterial({
    defines: {
      DISPLACE_OCTAVES: clampInteger(currentParams.displaceOctaves, 1, 4, 3),
    },
    uniforms: {
      // uTime remains only for the fbm surface drift, whose noise domain is
      // aperiodic and so has no seamless wrap. Everything periodic accumulates.
      uTime: { value: 0 },
      uBreathePhase: { value: 0 },
      uCausticAPhase: { value: 0 },
      uCausticBPhase: { value: 0 },
      uVeilPhase: { value: 0 },
      uDisplaceAmount: { value: currentParams.displaceAmount },
      uDisplaceScale: { value: currentParams.displaceScale },
      uBreatheSpeed: { value: currentParams.breatheSpeed },
      uBreatheAmp: { value: currentParams.breatheAmp },
      uDriftSpeed: { value: currentParams.driftSpeed },
      uPulse: { value: 0 },
      uPulseDeform: { value: currentParams.pulseDeform },
      uTransmission: { value: currentParams.transmission },
      uThickness: { value: currentParams.thickness },
      uIor: { value: currentParams.ior },
      uRoughness: { value: currentParams.roughness },
      uBodyColor: { value: new THREE.Color(currentParams.bodyColor) },
      uCoreColor: { value: new THREE.Color(currentParams.coreColor) },
      uCoreIntensity: { value: currentParams.coreIntensity },
      uFresnelPower: { value: currentParams.fresnelPower },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uBreathePhase;
      uniform float uDisplaceAmount;
      uniform float uDisplaceScale;
      uniform float uBreatheSpeed;
      uniform float uBreatheAmp;
      uniform float uDriftSpeed;
      uniform float uPulse;
      uniform float uPulseDeform;

      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying float vSurfaceNoise;

      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float valueNoise(vec3 p) {
        vec3 cell = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float n000 = hash31(cell);
        float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

        float nearY0 = mix(n000, n100, f.x);
        float nearY1 = mix(n010, n110, f.x);
        float farY0 = mix(n001, n101, f.x);
        float farY1 = mix(n011, n111, f.x);
        return mix(mix(nearY0, nearY1, f.y), mix(farY0, farY1, f.y), f.z) * 2.0 - 1.0;
      }

      float surfaceFbm(vec3 p) {
        mat3 octaveTurn = mat3(
          0.00, 0.80, 0.60,
          -0.80, 0.36, -0.48,
          -0.60, -0.48, 0.64
        );
        float value = valueNoise(p) * 0.56;
        float weight = 0.56;
#if DISPLACE_OCTAVES > 1
        p = octaveTurn * p * 2.03 + vec3(1.7, -2.1, 0.8);
        value += valueNoise(p) * 0.27;
        weight += 0.27;
#endif
#if DISPLACE_OCTAVES > 2
        p = octaveTurn * p * 2.01 + vec3(-1.3, 0.5, 2.4);
        value += valueNoise(p) * 0.12;
        weight += 0.12;
#endif
#if DISPLACE_OCTAVES > 3
        p = octaveTurn * p * 1.97 + vec3(0.7, 1.9, -2.6);
        value += valueNoise(p) * 0.05;
        weight += 0.05;
#endif
        return value / weight;
      }

      vec3 displaceSurface(vec3 direction, float baseRadius, out float surfaceNoise) {
        vec3 drift = vec3(0.73, -0.41, 0.57) * uTime * uDriftSpeed;
        surfaceNoise = surfaceFbm(direction * uDisplaceScale + drift);
        vec3 pulseDrift = vec3(-0.31, 0.67, 0.44) * uTime * uDriftSpeed;
        float pulseNoise = valueNoise(direction * (uDisplaceScale * 2.35 + 1.2) + pulseDrift);

        float breathe = 1.0 + sin(uBreathePhase) * uBreatheAmp;
        float pulseOffset = uPulse * uPulseDeform * (0.12 + pulseNoise * 0.72);
        float displacedRadius = (baseRadius + surfaceNoise * uDisplaceAmount + pulseOffset) * breathe;
        return direction * max(displacedRadius, baseRadius * 0.2);
      }

      void main() {
        float baseRadius = length(position);
        vec3 direction = normalize(position);

        // Moving the sample point, rather than the mesh, lets features migrate
        // through a body that remains visibly at rest.
        float surfaceNoise;
        vec3 displaced = displaceSurface(direction, baseRadius, surfaceNoise);

        // Reconstruct the normal from the continuous displacement field instead
        // of the mesh triangles so liquid contours stay smooth at every detail.
        vec3 tangent = normalize(
          abs(direction.y) < 0.9
            ? cross(direction, vec3(0.0, 1.0, 0.0))
            : cross(direction, vec3(1.0, 0.0, 0.0))
        );
        vec3 bitangent = normalize(cross(direction, tangent));
        float tangentNoise;
        float bitangentNoise;
        float sampleStep = 0.012;
        vec3 tangentPosition = displaceSurface(
          normalize(direction + tangent * sampleStep),
          baseRadius,
          tangentNoise
        );
        vec3 bitangentPosition = displaceSurface(
          normalize(direction + bitangent * sampleStep),
          baseRadius,
          bitangentNoise
        );
        vec3 localNormal = normalize(cross(tangentPosition - displaced, bitangentPosition - displaced));
        if (dot(localNormal, direction) < 0.0) localNormal = -localNormal;

        vLocalPosition = displaced;
        vSurfaceNoise = surfaceNoise;
        vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uCausticAPhase;
      uniform float uCausticBPhase;
      uniform float uVeilPhase;
      uniform float uTransmission;
      uniform float uThickness;
      uniform float uIor;
      uniform float uRoughness;
      uniform vec3 uBodyColor;
      uniform vec3 uCoreColor;
      uniform float uCoreIntensity;
      uniform float uFresnelPower;

      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying float vSurfaceNoise;

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        if (dot(normal, viewDirection) < 0.0) normal = -normal;

        float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
        float fresnel = pow(1.0 - facing, max(uFresnelPower, 0.001));
        vec3 refracted = refract(-viewDirection, normal, 1.0 / max(uIor, 1.001));

        // Environment, absorption and highlights all follow the authored body
        // and core colours. Hardcoded teal/water terms made every palette read
        // as the same glass of water. Keep in step with aqueous-color.js.
        vec3 body = uBodyColor;
        float horizon = smoothstep(-0.82, 0.92, refracted.y + normal.y * 0.12);
        float sideLight = pow(max(dot(refracted, normalize(vec3(-0.62, 0.48, 0.62))), 0.0), 6.0);
        vec3 deep = body * 0.09;
        vec3 mid = body * 0.46;
        vec3 clearLift = mix(body * 0.72, body + (vec3(1.0) - body) * 0.18, 0.35);
        vec3 environment = mix(deep, clearLift, horizon);
        environment = mix(environment, mid, 0.18 + facing * 0.12);
        environment += mix(body, uCoreColor, 0.22) * sideLight * 0.28;

        float travel = uThickness * mix(0.42, 1.18, 1.0 - facing);
        vec3 absorption = exp(-(vec3(1.0) - body) * travel * 0.92);
        vec3 softenedEnvironment = mix(
          environment,
          mix(deep, mid, 0.58),
          clamp(uRoughness, 0.0, 1.0) * 0.62
        );
        vec3 refractedColor = softenedEnvironment * absorption;

        vec2 lensUv = normal.xy + refracted.xy * 0.075;
        lensUv += vec2(vSurfaceNoise, -vSurfaceNoise) * 0.025;
        float innerLens = exp(-dot(lensUv, lensUv) * 8.5);
        float causticA = sin(dot(refracted.xz, vec2(12.0, -9.0)) + vLocalPosition.y * 6.0 - uCausticAPhase);
        float causticB = sin(dot(refracted.zy, vec2(8.0, 11.0)) - vLocalPosition.x * 5.0 + uCausticBPhase);
        float caustics = pow(clamp(1.0 - abs(causticA + causticB) * 0.52, 0.0, 1.0), 5.0);
        caustics *= (1.0 - clamp(uRoughness, 0.0, 1.0)) * (0.16 + innerLens * 0.34);
        float innerVeil = smoothstep(0.34, 0.88, facing);
        innerVeil *= 0.5 + 0.5 * sin(
          vLocalPosition.y * 5.2 +
          vLocalPosition.x * 2.1 +
          vSurfaceNoise * 5.0 -
          uVeilPhase
        );
        innerVeil = smoothstep(0.28, 0.82, innerVeil) * (0.35 + innerLens * 0.65);

        vec3 surfaceColor = body * (0.22 + facing * 0.28 + vSurfaceNoise * 0.04);
        vec3 bodyColor = mix(surfaceColor, refractedColor, clamp(uTransmission, 0.0, 1.0));
        bodyColor += mix(body, uCoreColor, innerLens * 0.62) * caustics * uCoreIntensity * 0.12;
        bodyColor += uCoreColor * innerLens * uCoreIntensity * uTransmission * 0.12;
        bodyColor += mix(deep, body, 0.48) * innerVeil * uTransmission * 0.10;

        float specularPower = mix(96.0, 10.0, clamp(uRoughness, 0.0, 1.0));
        vec3 halfVector = normalize(viewDirection + normalize(vec3(-0.45, 0.72, 0.53)));
        float specular = pow(max(dot(normal, halfVector), 0.0), specularPower);
        bodyColor += mix(vec3(1.0), mix(body, uCoreColor, 0.4), 0.22) * specular * 0.42;

        vec3 rimColor = mix(body, uCoreColor, 0.28);
        bodyColor += rimColor * fresnel * (0.22 + uTransmission * 0.28);

        float opaqueAlpha = clamp(0.86 + uThickness * 0.035, 0.86, 0.96);
        float glassAlpha = clamp(0.43 + uThickness * 0.075, 0.43, 0.68);
        float alpha = mix(opaqueAlpha, glassAlpha, clamp(uTransmission, 0.0, 1.0));
        alpha = clamp(alpha + fresnel * 0.14, 0.0, 0.96);
        gl_FragColor = vec4(bodyColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
  });

  function createBodyGeometry() {
    const detail = clampInteger(currentParams.detail, 3, 6, DEFAULT_PARAMS.detail);
    const radius = Number.isFinite(Number(currentParams.radius))
      ? Math.max(0.01, Number(currentParams.radius))
      : DEFAULT_PARAMS.radius;
    return new THREE.IcosahedronGeometry(radius, detail);
  }

  let bodyGeometry = createBodyGeometry();
  const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
  bodyMesh.renderOrder = 2;
  group.add(bodyMesh);

  const coreGeometry = new THREE.SphereGeometry(1, 32, 24);
  const coreMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(currentParams.coreColor) },
      uIntensity: { value: currentParams.coreIntensity },
      uWobbleAPhase: { value: 0 },
      uWobbleBPhase: { value: 0 },
      uLivingPhase: { value: 0 },
      uMoltenPhase: { value: 0 },
    },
    vertexShader: `
      uniform float uWobbleAPhase;
      uniform float uWobbleBPhase;

      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vLocalPosition;

      void main() {
        float softWobble = sin(position.y * 3.8 + uWobbleAPhase);
        softWobble *= sin(position.x * 3.1 - position.z * 2.4 - uWobbleBPhase);
        vec3 displaced = position * (1.0 + softWobble * 0.045);
        vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -viewPosition.xyz;
        vLocalPosition = displaced;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uLivingPhase;
      uniform float uMoltenPhase;

      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vLocalPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDirection = normalize(vViewPosition);
        float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
        float keyLight = max(dot(normal, normalize(vec3(-0.48, 0.66, 0.57))), 0.0);
        float highlight = pow(max(dot(normalize(normal + viewDirection), normalize(vec3(-0.42, 0.72, 0.55))), 0.0), 24.0);
        float livingLight = 0.96 + sin(uLivingPhase) * 0.04;
        float moltenBand = 0.5 + 0.5 * sin(vLocalPosition.y * 5.4 + vLocalPosition.x * 2.2 - uMoltenPhase);
        moltenBand = smoothstep(0.18, 0.86, moltenBand) * 0.12;
        float hotPool = exp(-dot(vLocalPosition.xy - vec2(-0.22, 0.24), vLocalPosition.xy - vec2(-0.22, 0.24)) * 5.5);
        vec3 hot = mix(uColor, vec3(1.0), 0.4);
        vec3 color = mix(uColor * 0.28, hot, 0.16 + facing * 0.64 + hotPool * 0.12);
        color *= (0.72 + uIntensity * 0.38) * (0.72 + keyLight * 0.28 + moltenBand) * livingLight;
        color += hot * (highlight * 0.28 + hotPool * 0.12);
        float alpha = smoothstep(0.02, 0.68, facing) * clamp(0.28 + uIntensity * 0.12, 0.28, 0.62);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  // The core is emissive rather than an opaque object; compositing it after
  // the liquid lets warmth survive the body's absorption without flattening it.
  coreMesh.renderOrder = 3;
  group.add(coreMesh);

  const frame = { radius: frameRadiusFor(currentParams) };
  let pulseEnergy = 0;
  let pulsePhase = Math.PI * 0.5;
  const phaseTracker = createPhaseTracker();

  function updateCoreScale(pulse = 0) {
    const radius = Math.max(0.01, Number(currentParams.radius) || DEFAULT_PARAMS.radius);
    const pulseLift = 1 + Math.abs(pulse) * Math.max(0, currentParams.pulseDeform) * 0.16;
    coreMesh.scale.setScalar(radius * 0.26 * pulseLift);
  }
  updateCoreScale();

  function rebuildBodyGeometry() {
    const nextGeometry = createBodyGeometry();
    bodyMesh.geometry = nextGeometry;
    bodyGeometry.dispose();
    bodyGeometry = nextGeometry;
  }

  return {
    frame,

    update(args = {}) {
      const time = typeof args.time === 'number' ? args.time : 0;
      const delta = typeof args.delta === 'number' ? Math.max(0, args.delta) : 0;

      if (pulseEnergy > 0.0001 && delta > 0) {
        pulsePhase += delta * 11.5;
        pulseEnergy *= Math.exp(-delta * 3.6);
      } else if (pulseEnergy <= 0.0001) {
        pulseEnergy = 0;
      }
      const pulse = pulseEnergy * Math.sin(pulsePhase);

      bodyMaterial.uniforms.uTime.value = time;
      phaseTracker.advance(time);
      const bu = bodyMaterial.uniforms;
      bu.uBreathePhase.value = phaseTracker.phase('breathe', currentParams.breatheSpeed);
      bu.uCausticAPhase.value = phaseTracker.phase('causticA', 0.28);
      bu.uCausticBPhase.value = phaseTracker.phase('causticB', 0.17);
      bu.uVeilPhase.value = phaseTracker.phase('veil', 0.19);
      const cu = coreMaterial.uniforms;
      cu.uWobbleAPhase.value = phaseTracker.phase('wobbleA', 0.33);
      cu.uWobbleBPhase.value = phaseTracker.phase('wobbleB', 0.21);
      cu.uLivingPhase.value = phaseTracker.phase('living', 0.47);
      cu.uMoltenPhase.value = phaseTracker.phase('molten', 0.31);
      bodyMaterial.uniforms.uPulse.value = pulse;
      updateCoreScale(pulse);
    },

    setParams(patch = {}) {
      const needsGeometryRebuild = (
        patch.detail !== undefined && patch.detail !== currentParams.detail
      ) || (
        patch.radius !== undefined && patch.radius !== currentParams.radius
      ) || (
        patch.displaceOctaves !== undefined &&
        patch.displaceOctaves !== currentParams.displaceOctaves
      );

      Object.assign(currentParams, patch);

      if (patch.displaceOctaves !== undefined) {
        bodyMaterial.defines.DISPLACE_OCTAVES = clampInteger(
          currentParams.displaceOctaves,
          1,
          4,
          DEFAULT_PARAMS.displaceOctaves
        );
        bodyMaterial.needsUpdate = true;
      }
      if (needsGeometryRebuild) {
        rebuildBodyGeometry();
      }

      if (patch.displaceAmount !== undefined) {
        bodyMaterial.uniforms.uDisplaceAmount.value = currentParams.displaceAmount;
      }
      if (patch.displaceScale !== undefined) {
        bodyMaterial.uniforms.uDisplaceScale.value = currentParams.displaceScale;
      }
      if (patch.breatheSpeed !== undefined) {
        bodyMaterial.uniforms.uBreatheSpeed.value = currentParams.breatheSpeed;
      }
      if (patch.breatheAmp !== undefined) {
        bodyMaterial.uniforms.uBreatheAmp.value = currentParams.breatheAmp;
      }
      if (patch.driftSpeed !== undefined) {
        bodyMaterial.uniforms.uDriftSpeed.value = currentParams.driftSpeed;
      }
      if (patch.pulseDeform !== undefined) {
        bodyMaterial.uniforms.uPulseDeform.value = currentParams.pulseDeform;
      }
      if (patch.transmission !== undefined) {
        bodyMaterial.uniforms.uTransmission.value = currentParams.transmission;
      }
      if (patch.thickness !== undefined) {
        bodyMaterial.uniforms.uThickness.value = currentParams.thickness;
      }
      if (patch.ior !== undefined) {
        bodyMaterial.uniforms.uIor.value = currentParams.ior;
      }
      if (patch.roughness !== undefined) {
        bodyMaterial.uniforms.uRoughness.value = currentParams.roughness;
      }
      if (patch.bodyColor !== undefined) {
        bodyMaterial.uniforms.uBodyColor.value.set(currentParams.bodyColor);
      }
      if (patch.coreColor !== undefined) {
        bodyMaterial.uniforms.uCoreColor.value.set(currentParams.coreColor);
        coreMaterial.uniforms.uColor.value.set(currentParams.coreColor);
      }
      if (patch.coreIntensity !== undefined) {
        bodyMaterial.uniforms.uCoreIntensity.value = currentParams.coreIntensity;
        coreMaterial.uniforms.uIntensity.value = currentParams.coreIntensity;
      }
      if (patch.fresnelPower !== undefined) {
        bodyMaterial.uniforms.uFresnelPower.value = currentParams.fresnelPower;
      }

      if (
        patch.radius !== undefined ||
        patch.displaceAmount !== undefined ||
        patch.breatheAmp !== undefined ||
        patch.pulseDeform !== undefined
      ) {
        frame.radius = frameRadiusFor(currentParams);
        updateCoreScale();
      }
    },

    onPulse() {
      pulseEnergy = 1;
      pulsePhase = Math.PI * 0.5;
    },

    dispose() {
      scene.remove(group);
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
    },
  };
}
