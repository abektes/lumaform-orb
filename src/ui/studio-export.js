import {
  ENGINE_INFO,
  ENGINE_PARAM_DEFINITIONS,
  loadSavedPresets,
  saveCustomPreset,
  deleteCustomPreset,
} from '../core/state.js';
import { formatParamValue, parseParamValue } from '../core/param-format.js';
import { SHORTCUT_GROUPS, formatKey, shortcutsInGroup } from '../core/shortcuts.js';
import { applyPalette } from '../core/palette.js';
import { highlightJs } from './highlight.js';
import { ICONS } from './icons.js';

export function exportConfig() {
  return {
    engine: this.state.engine,
    global: this.state.global,
    params: this.state.engines[this.state.engine],
    modulation: this.state.modulation,
  };
}

export function renderExportTab() {
  const embedIframe = `<iframe src="./?engine=${this.state.engine}" width="100%" height="600" frameborder="0" allow="autoplay; fullscreen"></iframe>`;

  return `
    <!-- INSTANT RENDERS -->
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">SNAPSHOT RENDER SUITE</span>
      </div>
      <div class="controls-list">
        <label class="snapshot-opt">
          <input type="checkbox" id="snap-trans-tab" ${this.state.global.transparentBg ? 'checked' : ''} />
          <span>Transparent PNG (Alpha Channel)</span>
        </label>
        <div class="snapshot-btn-row">
          <button class="btn-action btn-highlight" id="btn-quick-snap-hd" style="flex: 1;">${ICONS.camera} <span>Standard HD (1x)</span></button>
          <button class="btn-action btn-accent" id="btn-quick-snap-4k" style="flex: 1;">${ICONS.sparkle} <span>Ultra 4K (2x)</span></button>
        </div>
      </div>
    </div>

    <!-- IFRAME EMBED -->
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">EMBED LIVE ORB</span>
      </div>
      <textarea class="embed-textarea custom-scroll" readonly id="embed-iframe-code">${embedIframe}</textarea>
      <div class="save-preset-row" style="margin-top: 8px;">
        <button class="btn-sm btn-primary" id="btn-copy-embed-tab" style="width: 100%;">Copy Embed Snippet</button>
      </div>
    </div>

    <!-- JSON STATE -->
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">PRESET JSON EXPORT</span>
      </div>
      <div class="save-preset-row">
        <button class="btn-sm btn-secondary" id="btn-copy-json-tab" style="flex: 1;">Copy JSON</button>
        <button class="btn-sm btn-secondary" id="btn-dl-json-tab" style="flex: 1;">Download .json</button>
        <button class="btn-sm btn-accent" id="btn-open-advanced-export" style="flex: 1;">Full Suite</button>
      </div>
    </div>
  `;
}

export function renderPerfTab() {
  const g = this.state.global;
  return `
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">RENDER QUALITY & DPR</span>
      </div>

      <div class="controls-list">
        <div class="control-row">
          <label class="ctrl-label">Pixel Ratio (DPR)</label>
          <select class="studio-select" data-global="dpr">
            <option value="0.75" ${g.dpr === 0.75 ? 'selected' : ''}>0.75x (High Performance)</option>
            <option value="1.0" ${g.dpr === 1.0 ? 'selected' : ''}>1.0x (Standard Native)</option>
            <option value="1.2" ${g.dpr === 1.2 ? 'selected' : ''}>1.2x (Recommended Balanced)</option>
            <option value="1.5" ${g.dpr === 1.5 ? 'selected' : ''}>1.5x (Crisp Retina)</option>
            <option value="2.0" ${g.dpr === 2.0 ? 'selected' : ''}>2.0x (Ultra Sharp)</option>
          </select>
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">KEYBOARD SHORTCUTS</span>
      </div>
      <div class="hotkeys-table">
        ${SHORTCUT_GROUPS.flatMap((group) => shortcutsInGroup(group)).map((shortcut) => `
          <div class="hotkey-row">
            <kbd>${formatKey(shortcut.code)}</kbd>
            <span>${shortcut.label}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function attachControlListeners() {
  // Presets click
  this.root.querySelectorAll('.preset-card').forEach((card) => {
    card.addEventListener('click', () => {
      const name = card.getAttribute('data-preset-name');
      const preset = PRESET_LIBRARY.find((p) => p.name === name);
      if (preset) {
        this.store.setActivePresetName(preset.name);
        this.store.patchGlobal(preset.global);
        this.store.patchActiveEngine(preset.params);
        this.onStateChange(this.state);
        this.render();
      }
    });
  });

  // Save custom preset
  this.root.querySelector('#btn-save-custom-preset')?.addEventListener('click', () => {
    const input = this.root.querySelector('#custom-preset-input');
    const name = input?.value.trim() || `Custom ${Date.now()}`;
    saveCustomPreset({
      name,
      engine: this.state.engine,
      global: { ...this.state.global },
      params: { ...this.state.engines[this.state.engine] },
      modulation: structuredClone(this.state.modulation),
    });
    this.store.setActivePresetName(name);
    this.render();
  });

  // Load custom preset
  this.root.querySelectorAll('[data-load-custom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-load-custom');
      const list = loadSavedPresets();
      const found = list.find((p) => p.name === name);
      if (found) {
        this.store.setActivePresetName(found.name);
        this.store.patchGlobal(found.global);
        this.store.patchActiveEngine(found.params);
        // Optional: presets saved before the Motion Lab existed have no
        // modulation block, and should keep whatever rack is currently set.
        if (found.modulation) this.store.setModulation(structuredClone(found.modulation));
        this.onStateChange(this.state);
        this.render();
      }
    });
  });

  // Delete custom preset
  this.root.querySelectorAll('[data-delete-custom]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.getAttribute('data-delete-custom');
      deleteCustomPreset(name);
      this.render();
    });
  });

  // Rows own their synchronization so an engine key can safely match a
  // global (or a future Motion Lab) key without cross-updating its controls.
  this.root.querySelectorAll('.param-row').forEach((row) => {
    const scope = row.getAttribute('data-number-scope');
    // Motion Lab rows share the markup but not the value model; they are
    // wired in attachMotionLabListeners().
    if (scope === 'mod') return;
    const key = row.getAttribute('data-number-key');
    const def = this.numberDefinition(scope, key);
    const slider = row.querySelector('input[type="range"]');
    const field = row.querySelector('.ctrl-number');
    const reset = row.querySelector('.ctrl-reset');

    slider?.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      this.writeNumberValue(scope, key, value);
      this.syncNumberRow(
        row,
        value,
        def,
        this.numberDefaultComparisonValue(scope, key)
      );
      // Studio.updateParameters() tears down an active rehearsal before the
      // next frame can overwrite this direct edit.
      this.onStateChange(this.state);
    });

    if (field) {
      let suppressChange = false;
      const commit = () => {
        const parsed = parseParamValue(field.value, def);
        if (parsed === null) {
          field.value = formatParamValue(this.numberValue(scope, key), def);
          return;
        }

        this.writeNumberValue(scope, key, parsed);
        field.value = formatParamValue(parsed, def);
        if (slider) slider.value = parsed;
        this.syncNumberRow(
          row,
          parsed,
          def,
          this.numberDefaultComparisonValue(scope, key)
        );
        this.onStateChange(this.state);
      };

      field.addEventListener('change', () => {
        if (!suppressChange) commit();
      });
      field.addEventListener('keydown', (event) => {
        // These keys are complete field interactions; neither is allowed to
        // bubble into the panel's bare-key shortcut handling.
        if (event.key === 'Enter') {
          event.preventDefault();
          suppressChange = true;
          commit();
          field.blur();
          queueMicrotask(() => { suppressChange = false; });
        } else if (event.key === 'Escape') {
          event.preventDefault();
          suppressChange = true;
          field.value = formatParamValue(this.numberValue(scope, key), def);
          field.blur();
          queueMicrotask(() => { suppressChange = false; });
        }
        event.stopPropagation();
      });
    }

    reset?.addEventListener('click', () => {
      if (!Number.isFinite(def.default)) return;
      this.writeNumberValue(scope, key, def.default, { reset: true });
      this.onStateChange(this.state);
      this.render();
    });
  });

  // Selects (String or Numeric)
  this.root.querySelectorAll('select[data-param]').forEach((sel) => {
    const key = sel.getAttribute('data-param');
    sel.addEventListener('change', (e) => {
      const raw = e.target.value;
      const num = Number(raw);
      this.state.engines[this.state.engine][key] = isNaN(num) || raw.trim() === '' ? raw : num;
      this.onStateChange(this.state);
    });
  });

  // Color Harmonies Quick Chips. The palette is resolved against the active engine's
  // own colour schema — see src/core/palette.js for why a name-keyed map was wrong.
  this.root.querySelectorAll('.palette-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const defs = ENGINE_PARAM_DEFINITIONS[this.state.engine] || {};
      const engineParams = this.state.engines[this.state.engine];
      const patch = applyPalette(defs, engineParams, btn.getAttribute('data-palette'));
      if (!Object.keys(patch).length) return;
      // Assign into the existing bag; it is held by reference elsewhere.
      Object.assign(engineParams, patch);
      this.onStateChange(this.state);
      this.render();
    });
  });

  // Colors
  this.root.querySelectorAll('input[type="color"][data-param]').forEach((colorInput) => {
    const key = colorInput.getAttribute('data-param');
    colorInput.addEventListener('input', (e) => {
      const val = e.target.value;
      this.state.engines[this.state.engine][key] = val;
      const hexInput = this.root.querySelector(`input[data-param-hex="${key}"]`);
      if (hexInput) hexInput.value = val;
      this.onStateChange(this.state);
    });
  });

  this.root.querySelectorAll('input[data-param-hex]').forEach((hexInput) => {
    const key = hexInput.getAttribute('data-param-hex');
    hexInput.addEventListener('change', (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        this.state.engines[this.state.engine][key] = val;
        const colorInput = this.root.querySelector(`input[type="color"][data-param="${key}"]`);
        if (colorInput) colorInput.value = val;
        this.onStateChange(this.state);
      }
    });
  });

  // Global selects
  this.root.querySelectorAll('select[data-global]').forEach((sel) => {
    const key = sel.getAttribute('data-global');
    sel.addEventListener('change', (e) => {
      this.state.global[key] = Number(e.target.value);
      this.onStateChange(this.state);
    });
  });

  // Background buttons
  this.root.querySelectorAll('[data-bg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      this.state.global.background = btn.getAttribute('data-bg');
      this.state.global.transparentBg = false;
      this.onStateChange(this.state);
      this.render();
    });
  });

  this.root.querySelector('#btn-toggle-transparent')?.addEventListener('click', () => {
    this.state.global.transparentBg = !this.state.global.transparentBg;
    this.onStateChange(this.state);
    this.render();
  });

  // Space tab background picker
  const canvasBgPicker = this.root.querySelector('#canvas-bg-picker');
  const canvasBgHex = this.root.querySelector('#canvas-bg-hex');
  canvasBgPicker?.addEventListener('input', (e) => {
    this.state.global.background = e.target.value;
    this.state.global.transparentBg = false;
    if (canvasBgHex) canvasBgHex.value = e.target.value;
    this.onStateChange(this.state);
  });
  canvasBgHex?.addEventListener('change', (e) => {
    let val = e.target.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      this.state.global.background = val;
      this.state.global.transparentBg = false;
      if (canvasBgPicker) canvasBgPicker.value = val;
      this.onStateChange(this.state);
    }
  });
  this.root.querySelector('#btn-space-reset-cam')?.addEventListener('click', () => this.studio.resetCamera());

  // Export Tab Listeners

  this.root.querySelector('#btn-quick-snap-hd')?.addEventListener('click', () => {
    const trans = this.root.querySelector('#snap-trans-tab')?.checked;
    this.requestSnapshot({ transparent: trans, multiplier: 1 });
  });

  this.root.querySelector('#btn-quick-snap-4k')?.addEventListener('click', () => {
    const trans = this.root.querySelector('#snap-trans-tab')?.checked;
    this.requestSnapshot({ transparent: trans, multiplier: 2 });
  });

  this.root.querySelector('#btn-copy-embed-tab')?.addEventListener('click', (e) => {
    const code = this.root.querySelector('#embed-iframe-code')?.value;
    if (code) {
      navigator.clipboard.writeText(code);
      e.target.textContent = 'Copied Embed Snippet! ✓';
      setTimeout(() => (e.target.textContent = 'Copy Embed Snippet'), 2000);
    }
  });

  this.root.querySelector('#btn-copy-json-tab')?.addEventListener('click', (e) => {
    const jsonStr = JSON.stringify(this.exportConfig(), null, 2);
    navigator.clipboard.writeText(jsonStr);
    e.target.textContent = 'Copied JSON! ✓';
    setTimeout(() => (e.target.textContent = 'Copy JSON'), 2000);
  });

  this.root.querySelector('#btn-dl-json-tab')?.addEventListener('click', () => {
    const jsonStr = JSON.stringify(this.exportConfig(), null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `lumaform-orb-${this.state.engine}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  });

  this.root.querySelector('#btn-open-advanced-export')?.addEventListener('click', () => {
    this.openExportModal();
  });
}

export function openExportModal() {
  const jsonStr = JSON.stringify(this.exportConfig(), null, 2);

  const embedCode = this.generateEmbedSnippet();

  this.modalOverlay.innerHTML = `
    <div class="studio-modal-box">
      <div class="modal-header">
        <div class="modal-title">Export Orb Generator Output</div>
        <button class="modal-close-btn" id="btn-close-modal">✕</button>
      </div>

      <div class="modal-tabs">
        <button class="modal-tab-btn active" data-modaltab="code">Three.js Embed Snippet</button>
        <button class="modal-tab-btn" data-modaltab="json">JSON Config</button>
        <button class="modal-tab-btn" data-modaltab="snapshot">High-Res Render</button>
      </div>

      <div class="modal-content">
        <!-- TAB 1: CODE -->
        <div id="pane-code">
          <div class="code-preview custom-scroll">${highlightJs(embedCode)}</div>
          <div class="modal-footer-row">
            <button class="btn-primary" id="btn-copy-code">Copy Three.js Code</button>
          </div>
        </div>

        <!-- TAB 2: JSON -->
        <div class="hidden" id="pane-json">
          <textarea class="json-textarea custom-scroll" id="export-json-area">${jsonStr}</textarea>
          <div class="modal-footer-row">
            <button class="btn-primary" id="btn-copy-json">Copy JSON</button>
            <button class="btn-secondary" id="btn-download-json">Download .json</button>
            <button class="btn-accent" id="btn-import-json">Load from Textarea</button>
            <label class="import-file-label" for="import-config-file">Load .json file…</label>
            <input type="file" id="import-config-file" accept="application/json,.json" hidden />
          </div>
        </div>

        <!-- TAB 3: SNAPSHOT -->
        <div class="hidden" id="pane-snapshot">
          <div class="snapshot-options-grid">
            <label class="snapshot-opt">
              <input type="checkbox" id="snap-trans" ${this.state.global.transparentBg ? 'checked' : ''} />
              <span>Transparent Background (PNG with Alpha)</span>
            </label>
            <div class="snapshot-multiplier-row">
              <label>Resolution Scale:</label>
              <button class="scale-btn active" data-scale="1">1x (Viewport)</button>
              <button class="scale-btn" data-scale="2">2x (High-Res)</button>
              <button class="scale-btn" data-scale="3">3x (Ultra Print)</button>
            </div>
          </div>
          <div class="modal-footer-row" style="margin-top: 20px;">
            <button class="btn-primary" id="btn-capture-modal">Download PNG Snapshot</button>
          </div>
        </div>
      </div>
    </div>
  `;

  this.modalOverlay.classList.remove('hidden');

  // Attach modal events
  this.modalOverlay.querySelector('#btn-close-modal')?.addEventListener('click', () => {
    this.closeModal();
  });

  const tabBtns = this.modalOverlay.querySelectorAll('.modal-tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-modaltab');
      this.modalOverlay.querySelector('#pane-code')?.classList.toggle('hidden', target !== 'code');
      this.modalOverlay.querySelector('#pane-json')?.classList.toggle('hidden', target !== 'json');
      this.modalOverlay.querySelector('#pane-snapshot')?.classList.toggle('hidden', target !== 'snapshot');
    });
  });

  this.upgradeCodePreview(embedCode);

  // Copy code button
  this.modalOverlay.querySelector('#btn-copy-code')?.addEventListener('click', (e) => {
    navigator.clipboard.writeText(embedCode);
    e.target.textContent = 'Copied to Clipboard! ✓';
    setTimeout(() => (e.target.textContent = 'Copy Three.js Code'), 2000);
  });

  // Copy JSON button
  this.modalOverlay.querySelector('#btn-copy-json')?.addEventListener('click', (e) => {
    navigator.clipboard.writeText(jsonStr);
    e.target.textContent = 'Copied JSON! ✓';
    setTimeout(() => (e.target.textContent = 'Copy JSON'), 2000);
  });

  // Download JSON
  this.modalOverlay.querySelector('#btn-download-json')?.addEventListener('click', () => {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `orb-${this.state.engine}-preset.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  });

  // Import JSON
  this.modalOverlay.querySelector('#btn-import-json')?.addEventListener('click', () => {
    const area = this.modalOverlay.querySelector('#export-json-area');
    this.importConfigText(area?.value ?? '');
  });

  this.modalOverlay.querySelector('#import-config-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      // Show what was loaded in the textarea too, so a rejected file can be
      // inspected and corrected in place rather than re-picked.
      const area = this.modalOverlay.querySelector('#export-json-area');
      if (area) area.value = text;
      this.importConfigText(text);
    } catch (err) {
      console.warn('Could not read that file', err);
      alert('Could not read that file.');
    } finally {
      // Reset so picking the same file twice fires `change` again.
      e.target.value = '';
    }
  });

  // Snapshot scale selection
  let chosenScale = 1;
  this.modalOverlay.querySelectorAll('.scale-btn').forEach((b) => {
    b.addEventListener('click', () => {
      this.modalOverlay.querySelectorAll('.scale-btn').forEach((sb) => sb.classList.remove('active'));
      b.classList.add('active');
      chosenScale = Number(b.getAttribute('data-scale'));
    });
  });

  // Capture from modal
  this.modalOverlay.querySelector('#btn-capture-modal')?.addEventListener('click', () => {
    const trans = this.modalOverlay.querySelector('#snap-trans')?.checked;
    this.requestSnapshot({ transparent: trans, multiplier: chosenScale });
  });
}

export function closeModal() {
  this.modalOverlay.classList.add('hidden');
}

export function generateEmbedSnippet() {
  const engine = this.state.engine;
  const params = this.state.engines[engine];
  const global = this.state.global;

  return `// ===============================================
// Generated with Orb Studio
// Engine: ${ENGINE_INFO[engine].name} (${ENGINE_INFO[engine].badge})
// ===============================================

import * as THREE from 'three';

export const ORB_CONFIG = {
engine: '${engine}',
bloom: {
  strength: ${global.bloomStrength},
  radius: ${global.bloomRadius},
  threshold: ${global.bloomThreshold},
},
exposure: ${global.exposure},
params: ${JSON.stringify(params, null, 2)},
modulation: ${JSON.stringify(this.state.modulation, null, 2)}
};

// Usage Example:
// Pass ORB_CONFIG into your Three.js engine loader.
`;
}
