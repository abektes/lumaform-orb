import { DEFAULT_GLOBAL_SETTINGS } from '../core/state.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

export function safeThumbnail(value) {
  const src = String(value ?? '');
  return /^data:image\/(?:jpeg|png);base64,/i.test(src) ? escapeHtml(src) : '';
}

// Globals do not have an engine schema, so their row metadata lives here once
// and is shared by rendering and listeners. Defaults still come from state.js.
export const GLOBAL_NUMBER_DEFINITIONS = {
  bloomStrength: {
    label: 'Bloom Strength',
    min: 0,
    max: 2.5,
    step: 0.05,
    default: DEFAULT_GLOBAL_SETTINGS.bloomStrength,
  },
  bloomRadius: {
    label: 'Bloom Radius',
    min: 0,
    max: 1,
    step: 0.02,
    default: DEFAULT_GLOBAL_SETTINGS.bloomRadius,
  },
  bloomThreshold: {
    label: 'Bloom Threshold',
    min: 0,
    max: 0.5,
    step: 0.01,
    default: DEFAULT_GLOBAL_SETTINGS.bloomThreshold,
  },
  contrast: { label: 'Contrast', min: 0.5, max: 2, step: 0.01, default: DEFAULT_GLOBAL_SETTINGS.contrast },
  saturation: { label: 'Saturation', min: 0, max: 2, step: 0.01, default: DEFAULT_GLOBAL_SETTINGS.saturation },
  grain: { label: 'Grain', min: 0, max: 0.15, step: 0.005, default: DEFAULT_GLOBAL_SETTINGS.grain },
  edgeFade: { label: 'Edge Fade', min: 0, max: 1, step: 0.01, default: DEFAULT_GLOBAL_SETTINGS.edgeFade },
  lightCoverage: { label: 'Glow on Light Pages', min: 0, max: 1, step: 0.01, default: DEFAULT_GLOBAL_SETTINGS.lightCoverage },
  exposure: {
    label: 'ACES Exposure',
    min: 0.4,
    max: 2.2,
    step: 0.05,
    default: DEFAULT_GLOBAL_SETTINGS.exposure,
  },
  autoRotateSpeed: {
    label: 'Camera Auto-Orbit',
    min: -5,
    max: 5,
    step: 0.1,
    default: DEFAULT_GLOBAL_SETTINGS.autoRotateSpeed,
  },
  timeScale: {
    label: 'Simulation Time Scale',
    min: 0.1,
    max: 3,
    step: 0.1,
    default: DEFAULT_GLOBAL_SETTINGS.timeScale,
  },
};
