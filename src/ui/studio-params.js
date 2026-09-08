import { ENGINE_INFO, ENGINE_PARAM_DEFINITIONS } from '../core/state.js';
import { formatParamValue, isAtDefault } from '../core/param-format.js';
import { PALETTES, PALETTE_KEYS } from '../core/palette.js';
import { escapeHtml, GLOBAL_NUMBER_DEFINITIONS } from './studio-format.js';
import { ICONS } from './icons.js';

export function modDot(key) {
  const mod = this.state.modulation;
  const driven = mod?.enabled
    && (mod.routes || []).some((route) => route.enabled !== false && route.dest === key);
  return driven ? '<span class="mod-dot" title="Driven by modulation"></span>' : '';
}

// Engine and global numeric controls use the same markup. Scope is carried on
// the row so equal key names never make one control synchronize another.
export function renderNumberRow({ key, def, value, attr, scope, defaultComparisonValue = value }) {
  const shown = formatParamValue(value, def);
  const atDefault = isAtDefault(defaultComparisonValue, def);
  const label = escapeHtml(def.label ?? key);
  const safeKey = escapeHtml(key);
  const safeScope = escapeHtml(scope);
  const min = formatParamValue(def.min, def);
  const max = formatParamValue(def.max, def);
  const minAttr = Number.isFinite(def.min) ? `min="${escapeHtml(def.min)}"` : '';
  const maxAttr = Number.isFinite(def.max) ? `max="${escapeHtml(def.max)}"` : '';
  const step = Number.isFinite(def.step) && def.step > 0 ? def.step : 'any';

  return `
    <div class="control-row param-row"
         data-number-scope="${safeScope}" data-number-key="${safeKey}">
      <div class="ctrl-label-row">
        <label class="ctrl-label">${label}${scope === 'engine' ? this.modDot(key) : ''}</label>
        <span class="ctrl-entry">
          <input class="ctrl-number" type="text" inputmode="decimal"
                 data-param-number="${safeKey}" value="${escapeHtml(shown)}"
                 aria-label="${label} value" />
          ${Number.isFinite(def.default) ? `
            <button class="ctrl-reset ${atDefault ? 'is-default' : ''}"
                    data-param-reset="${safeKey}"
                    title="Reset to ${escapeHtml(formatParamValue(def.default, def))}"
                    ${atDefault ? 'disabled' : ''}>↺</button>` : ''}
        </span>
      </div>
      <input type="range" class="studio-slider" ${attr}
             ${minAttr} ${maxAttr} step="${escapeHtml(step)}" value="${escapeHtml(value)}" />
      <div class="ctrl-range">
        <span>${escapeHtml(min)}</span>
        <span>${escapeHtml(max)}</span>
      </div>
    </div>
  `;
}

export function numberDefinition(scope, key) {
  if (scope === 'global') return GLOBAL_NUMBER_DEFINITIONS[key] || {};
  return (ENGINE_PARAM_DEFINITIONS[this.state.engine] || {})[key] || {};
}

export function numberValue(scope, key) {
  if (scope === 'global') {
    // Direction has its own dock control; the inspector row edits magnitude.
    return key === 'timeScale'
      ? Math.abs(this.state.global[key])
      : this.state.global[key];
  }
  return this.state.engines[this.state.engine][key];
}

export function numberDefaultComparisonValue(scope, key) {
  if (scope === 'global') return this.state.global[key];
  return this.state.engines[this.state.engine][key];
}

export function writeNumberValue(scope, key, value, { reset = false } = {}) {
  if (scope === 'global') {
    if (key === 'timeScale') {
      this.setPlaybackSpeed(value, { preserveDirection: !reset });
    } else {
      this.state.global[key] = value;
    }
    return;
  }
  this.state.engines[this.state.engine][key] = value;
}

export function syncNumberRow(row, value, def, defaultComparisonValue = value) {
  if (!row) return;
  const field = row.querySelector('.ctrl-number');
  if (field && document.activeElement !== field) {
    field.value = formatParamValue(value, def);
  }
  const reset = row.querySelector('.ctrl-reset');
  if (reset) {
    const atDefault = isAtDefault(defaultComparisonValue, def);
    reset.classList.toggle('is-default', atDefault);
    reset.disabled = atDefault;
  }
}

export function renderParamsSection(sectionName) {
  const engine = this.state.engine;
  const defs = ENGINE_PARAM_DEFINITIONS[engine] || {};
  const engineParams = this.state.engines[engine] || {};

  const filteredKeys = Object.keys(defs).filter((key) => defs[key].section === sectionName);

  if (filteredKeys.length === 0) {
    const info = ENGINE_INFO[engine] || { name: engine };
    return `<div class="empty-notice">No settings in this category for ${info.name}.</div>`;
  }

  const isColors = sectionName === 'colors';

  return `
    ${
      isColors
        ? `
      <div class="panel-section">
        <div class="section-header">
          <span class="section-title">COLOR HARMONIES</span>
        </div>
        <div class="palette-chips-grid">
          ${PALETTE_KEYS.map((key) => {
            const p = PALETTES[key];
            return `
          <button class="palette-chip" data-palette="${key}" title="${p.title}">
            <span class="palette-dot-bar" style="background: linear-gradient(90deg, ${p.colors.join(', ')});"></span>
            <span>${p.label}</span>
          </button>`;
          }).join('')}
        </div>
      </div>
    `
        : ''
    }

    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">${sectionName.toUpperCase()} CONTROLS</span>
        ${sectionName === 'motion' ? '<button type="button" class="lab-entry" data-inspector-leaf="motionlab">Motion Lab</button>' : ''}
      </div>

      <div class="controls-list">
        ${filteredKeys
          .map((key) => {
            const def = defs[key];
            const value = engineParams[key] ?? def.default;

            if (def.type === 'color') {
              return `
                <div class="control-row color-control">
                  <label class="ctrl-label">${def.label}${this.modDot(key)}</label>
                  <div class="color-input-wrapper">
                    <input type="color" class="color-picker-input" data-param="${key}" value="${value}" />
                    <input type="text" class="color-hex-input" data-param-hex="${key}" value="${value}" maxlength="7" />
                  </div>
                </div>
              `;
            } else if (def.type === 'select') {
              return `
                <div class="control-row">
                  <label class="ctrl-label">${def.label}${this.modDot(key)}</label>
                  <select class="studio-select" data-param="${key}">
                    ${def.options
                      .map(
                        (opt) =>
                          `<option value="${opt}" ${String(value) === String(opt) ? 'selected' : ''}>${opt.toLocaleString()}</option>`
                      )
                      .join('')}
                  </select>
                </div>
              `;
            } else {
              return this.renderNumberRow({
                key,
                def,
                value,
                attr: `data-param="${escapeHtml(key)}"`,
                scope: 'engine',
              });
            }
          })
          .join('')}
      </div>
    </div>
  `;
}

export function renderOpticsTab() {
  const g = this.state.global;
  return `
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">UNREAL BLOOM</span>
      </div>

      <div class="controls-list">
        ${['bloomStrength', 'bloomRadius', 'bloomThreshold'].map((key) =>
          this.renderNumberRow({
            key,
            def: GLOBAL_NUMBER_DEFINITIONS[key],
            value: g[key],
            attr: `data-global="${key}"`,
            scope: 'global',
          })
        ).join('')}
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">TONE MAPPING & CAMERA</span>
      </div>

      <div class="controls-list">
        ${['exposure', 'autoRotateSpeed', 'timeScale'].map((key) =>
          this.renderNumberRow({
            key,
            def: GLOBAL_NUMBER_DEFINITIONS[key],
            value: key === 'timeScale' ? Math.abs(g[key]) : g[key],
            attr: `data-global="${key}"`,
            scope: 'global',
            defaultComparisonValue: g[key],
          })
        ).join('')}
      </div>
    </div>
  `;
}

export function renderSpaceTab() {
  const g = this.state.global;
  return `
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">BACKGROUND BACKDROP</span>
      </div>
      <div class="bg-mode-row">
        <button class="bg-mode-btn ${g.background === '#030304' && !g.transparentBg ? 'active' : ''}" data-bg="#030304">Void Black</button>
        <button class="bg-mode-btn ${g.background === '#01080d' && !g.transparentBg ? 'active' : ''}" data-bg="#01080d">Deep Navy</button>
        <button class="bg-mode-btn ${g.background === '#080202' && !g.transparentBg ? 'active' : ''}" data-bg="#080202">Obsidian</button>
        <button class="bg-mode-btn ${g.background === '#06010b' && !g.transparentBg ? 'active' : ''}" data-bg="#06010b">Violet Void</button>
        <button class="bg-mode-btn ${g.transparentBg ? 'active' : ''}" id="btn-toggle-transparent">Transparent</button>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">CUSTOM CANVAS COLOR</span>
      </div>
      <div class="control-row color-control">
        <label class="ctrl-label">Canvas Color</label>
        <div class="color-input-wrapper">
          <input type="color" class="color-picker-input" id="canvas-bg-picker" value="${g.background}" />
          <input type="text" class="color-hex-input" id="canvas-bg-hex" value="${g.background}" maxlength="7" />
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">VIEWPORT & CAMERA</span>
      </div>
      <div class="save-preset-row">
        <button class="btn-sm btn-action" id="btn-space-reset-cam" style="width: 100%;">${ICONS.target} <span>Reset Camera View</span></button>
      </div>
    </div>
  `;
}
