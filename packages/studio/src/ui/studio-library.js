import { ENGINE_TYPES, ENGINE_PARAM_DEFINITIONS, loadSavedPresets, saveCustomPreset, deleteCustomPreset } from '../core/state.js';
import { PRESET_LIBRARY } from '../presets/preset-library.js';
import { parseConfigFile, applyConfig } from '../core/config-io.js';
import { makeFinding } from '../core/findings.js';
import { makeStep, totalDuration } from '../core/sequence.js';
import { EASING_NAMES } from '../core/easing.js';
import { escapeHtml, safeThumbnail } from './studio-format.js';

export function renderPresetsTab() {
  const matchingPresets = PRESET_LIBRARY.filter((p) => p.engine === this.state.engine);
  const customPresets = loadSavedPresets().filter((p) => p.engine === this.state.engine);

  return `
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">Curated Archetypes</span>
        <span class="section-meta">${matchingPresets.length} presets</span>
      </div>

      <div class="presets-grid">
        ${matchingPresets
          .map((preset) => {
            const isSelected = this.state.activePresetName === preset.name;
            const colorDot1 = preset.params.innerColor
              || preset.params.activeColor
              || preset.params.bodyColor
              || preset.params.headColor
              || preset.params.veilColor
              || preset.params.echoColor
              || preset.params.metalTint
              || preset.params.coreColor
              || preset.params.color1
              || preset.params.particleColor
              || '#00f0ff';
            const colorDot2 = preset.params.outerColor
              || preset.params.edgeColor
              || preset.params.nodeColor
              || preset.params.tailColor
              || preset.params.accentColor
              || preset.params.barColor
              || preset.params.coreColor
              || preset.params.color2
              || preset.params.glowColor
              || '#7c3aed';
            return `
              <div class="preset-card ${isSelected ? 'active' : ''}" data-preset-name="${escapeHtml(preset.name)}">
                <div class="preset-card-head">
                  <div class="preset-dots">
                    <span class="color-dot" style="background: ${colorDot1}"></span>
                    <span class="color-dot" style="background: ${colorDot2}"></span>
                  </div>
                  <span class="preset-badge">${escapeHtml(preset.badge)}</span>
                </div>
                <div class="preset-name">${escapeHtml(preset.name)}</div>
                <div class="preset-desc">${escapeHtml(preset.description)}</div>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">Save Custom Preset</span>
      </div>
      <div class="save-preset-row">
        <input type="text" id="custom-preset-input" placeholder="My Custom Orb" class="studio-input" />
        <button id="btn-save-custom-preset" class="btn-sm btn-accent">Save</button>
      </div>

      ${
        customPresets.length > 0
          ? `
        <div class="section-header" style="margin-top: 14px;">
          <span class="section-title">My Saved Presets</span>
        </div>
        <div class="custom-presets-list">
          ${customPresets
            .map(
              (cp) => `
            <div class="custom-preset-item">
              <span class="cp-name" data-load-custom="${escapeHtml(cp.name)}">${escapeHtml(cp.name)}</span>
              <button class="cp-delete-btn" data-delete-custom="${escapeHtml(cp.name)}" title="Delete">✕</button>
            </div>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }
    </div>
  `;
}

export function attachPresetListeners() {
  this.root.querySelectorAll('.preset-card').forEach((card) => {
    card.addEventListener('click', () => {
      const name = card.getAttribute('data-preset-name');
      const preset = PRESET_LIBRARY.find((p) => p.name === name);
      if (!preset) return;
      this.store.setActivePresetName(preset.name);
      this.store.patchGlobal(preset.global);
      this.store.patchActiveEngine(preset.params);
      this.onStateChange(this.state);
      this.render();
    });
  });

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

  this.root.querySelectorAll('[data-load-custom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-load-custom');
      const list = loadSavedPresets();
      const found = list.find((p) => p.name === name);
      if (!found) return;
      this.store.setActivePresetName(found.name);
      this.store.patchGlobal(found.global);
      this.store.patchActiveEngine(found.params);
      // Optional: presets saved before the Motion Lab existed have no
      // modulation block, and should keep whatever rack is currently set.
      if (found.modulation) this.store.setModulation(structuredClone(found.modulation));
      this.onStateChange(this.state);
      this.render();
    });
  });

  this.root.querySelectorAll('[data-delete-custom]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCustomPreset(btn.getAttribute('data-delete-custom'));
      this.render();
    });
  });
}

export function importConfigText(text) {
  const result = parseConfigFile(text, Object.values(ENGINE_TYPES));
  if (!result.ok) {
    alert(`Could not load that config.\n\n${result.error}`);
    return false;
  }

  const config = result.configs[0];
  const defs = ENGINE_PARAM_DEFINITIONS[config.engine] || {};
  const { dropped } = applyConfig(this.state, config, defs);

  if (dropped.length) {
    console.warn(
      `Ignored ${dropped.length} parameter(s) not in the "${config.engine}" schema: ${dropped.join(', ')}`
    );
  }

  this.store.setActivePresetName('Imported Config');
  this.onStateChange(this.state);
  this.render();
  this.closeModal();

  if (result.configs.length > 1) {
    alert(`Loaded 1 of ${result.configs.length} configs in that file (the first).`);
  }
  return true;
}

// Snapshots can be refused while a clip is recording. Route the explicit
// capture buttons through here so the reason reaches the user instead of the
// console — the rest of this file already surfaces failures with alert().
export function requestSnapshot(options) {
  const blocked = this.studio.snapshotBlockedReason(options);
  if (blocked) {
    alert(blocked);
    return null;
  }
  return this.studio.captureSnapshot(options);
}

// A finding is the exported config plus a thumbnail, so the shelf can be
// browsed by eye rather than by timestamp.
export function saveFinding(note = '') {
  const config = this.exportConfig();
  // App state already holds the A/B destination while the renderer is still
  // travelling. Keep the live base so the stored config matches its thumbnail.
  const params = this.studio.paramTween?.isRunning
    ? this.studio.baseParams
    : config.params;
  const entry = makeFinding({
    engine: config.engine,
    global: structuredClone(config.global),
    params: structuredClone(params),
    modulation: structuredClone(config.modulation),
    thumb: this.studio.captureThumbnail(),
    note,
  });
  this.findings.add(entry);
  if (this.activeTab === 'findings') this.render();
  return entry;
}

export function selectedEntries(entries = this.findings.list()) {
  const available = new Set(entries.map((entry) => String(entry.id)));
  for (const id of this.selectedFindings) {
    if (!available.has(id)) this.selectedFindings.delete(id);
  }
  // Shelf order, rather than click order, makes the top selection A.
  return entries.filter((entry) => this.selectedFindings.has(String(entry.id)));
}

export function renderFindingsSelectionBar() {
  const count = this.selectedFindings.size;
  if (!count) return '';
  return `
    <div class="findings-selection-bar">
      <span class="findings-selection-count">${count} selected</span>
      <button class="btn-sm btn-accent" id="btn-findings-compare" ${count === 2 ? '' : 'disabled'}
              title="Load into A and B, then press \` to flip">Compare A/B</button>
      <button class="btn-sm" id="btn-findings-breed" ${count === 1 ? '' : 'disabled'}
              title="Open the variation grid seeded from this finding">Breed</button>
      <button class="btn-sm" id="btn-findings-deselect">Clear</button>
    </div>
  `;
}

export function updateRehearsalPlaybackUi() {
  const active = !!this.studio.currentSequence;
  const playing = this.studio.isPlayingSequence;
  const play = this.root.querySelector('#btn-seq-play');
  if (play) play.textContent = playing ? 'Pause' : active ? 'Resume' : 'Play loop';
  const stop = this.root.querySelector('#btn-seq-stop');
  if (stop) stop.disabled = !active;
  if (!active) {
    this.root.querySelectorAll('[data-seq-step]').forEach((element) => {
      element.classList.remove('playing');
    });
  }
}

export function toggleSequencePlayback() {
  if (this.studio.currentSequence) {
    if (this.studio.isPlayingSequence) {
      this.studio.pauseSequence();
    } else {
      this.studio.resumeSequence();
    }
  } else if (this.sequence.length) {
    this.activeSequenceIndex = -1;
    this.studio.playSequence(this.sequence, this.state, { loop: true });
  }

  if (this.activeTab === 'rehearsal') this.render();
}

export function stopSequencePlayback() {
  this.studio.stopSequence();
  if (this.activeTab === 'rehearsal') this.render();
}

export function renderRehearsalTab() {
  const findings = this.findings.list();
  const active = !!this.studio.currentSequence;
  const playing = this.studio.isPlayingSequence;
  const total = totalDuration(this.sequence);
  const disabled = active ? 'disabled' : '';

  const shelf = findings.length
    ? `<div class="rehearsal-shelf">
        ${findings.map((finding) => `
          <button class="rehearsal-chip" data-seq-add="${escapeHtml(finding.id)}"
                  title="Append to sequence" ${disabled}>
            <img src="${safeThumbnail(finding.thumb)}" alt="" loading="lazy" />
            <span>${escapeHtml(finding.note || finding.engine)}</span>
          </button>
        `).join('')}
      </div>`
    : `<div class="empty-notice">Keep some findings first — press <b>C</b> to stash the current orb.</div>`;

  const strip = this.sequence.length
    ? this.sequence.map((step, index) => `
        <div class="seq-step ${index === this.activeSequenceIndex ? 'playing' : ''}"
             data-seq-step="${index}">
          <img class="seq-thumb" src="${safeThumbnail(step.thumb)}" alt="" loading="lazy" />
          <div class="seq-body">
            <div class="seq-name">${escapeHtml(step.note || step.engine)}</div>
            <div class="seq-engine">${escapeHtml(step.engine)}</div>
            <div class="seq-timings">
              <label>in
                <input type="number" min="0" max="5000" step="50"
                       value="${step.transitionMs}" data-seq-transition="${index}" ${disabled} />
              </label>
              <label>hold
                <input type="number" min="0" max="10000" step="50"
                       value="${step.holdMs}" data-seq-hold="${index}" ${disabled} />
              </label>
              <select data-seq-easing="${index}" ${disabled}>
                ${EASING_NAMES.map((name) => (
                  `<option value="${name}" ${step.easing === name ? 'selected' : ''}>${name}</option>`
                )).join('')}
              </select>
            </div>
          </div>
          <div class="seq-actions">
            <button class="cp-delete-btn" data-seq-up="${index}" title="Move earlier" ${disabled}>↑</button>
            <button class="cp-delete-btn" data-seq-down="${index}" title="Move later" ${disabled}>↓</button>
            <button class="cp-delete-btn" data-seq-remove="${index}" title="Remove" ${disabled}>✕</button>
          </div>
        </div>
      `).join('')
    : `<div class="empty-notice">Click a finding above to add it as a step.</div>`;

  return `
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">FINDINGS</span>
        <span class="section-meta">click to append</span>
      </div>
      ${shelf}
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">SEQUENCE</span>
        <span class="section-meta">${this.sequence.length} steps · ${(total / 1000).toFixed(1)}s loop</span>
      </div>
      <div class="seq-strip">${strip}</div>
      <div class="modal-footer-row seq-footer">
        <button class="btn-sm btn-accent" id="btn-seq-play" ${this.sequence.length ? '' : 'disabled'}>
          ${playing ? 'Pause' : active ? 'Resume' : 'Play loop'}
        </button>
        <button class="btn-sm" id="btn-seq-stop" ${active ? '' : 'disabled'}>Stop</button>
        <button class="btn-sm" id="btn-seq-clear" ${disabled}>Clear</button>
      </div>
      ${active
        ? '<div class="seq-active-note">Stop playback to edit the arrangement.</div>'
        : ''}
    </div>
  `;
}

export function attachRehearsalListeners() {
  this.root.querySelectorAll('[data-seq-add]').forEach((button) => {
    button.addEventListener('click', () => {
      if (this.studio.currentSequence) return;
      const id = button.getAttribute('data-seq-add');
      const finding = this.findings.list().find((entry) => String(entry.id) === id);
      if (!finding) return;
      try {
        this.sequence.push(makeStep(finding));
        this.render();
      } catch (err) {
        console.error('Could not add finding to rehearsal', err);
        alert('Could not add that finding to the rehearsal.');
      }
    });
  });

  const mutateAt = (attribute, mutate) => {
    this.root.querySelectorAll(`[${attribute}]`).forEach((element) => {
      element.addEventListener('click', () => {
        if (this.studio.currentSequence) return;
        mutate(Number(element.getAttribute(attribute)));
        this.render();
      });
    });
  };

  mutateAt('data-seq-remove', (index) => this.sequence.splice(index, 1));
  mutateAt('data-seq-up', (index) => {
    if (index <= 0) return;
    [this.sequence[index - 1], this.sequence[index]] =
      [this.sequence[index], this.sequence[index - 1]];
  });
  mutateAt('data-seq-down', (index) => {
    if (index >= this.sequence.length - 1) return;
    [this.sequence[index + 1], this.sequence[index]] =
      [this.sequence[index], this.sequence[index + 1]];
  });

  const retime = (attribute, key, max) => {
    this.root.querySelectorAll(`[${attribute}]`).forEach((element) => {
      element.addEventListener('change', (event) => {
        if (this.studio.currentSequence) return;
        const step = this.sequence[Number(element.getAttribute(attribute))];
        if (!step) return;
        const value = Number(event.target.value);
        step[key] = Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
        this.render();
      });
    });
  };
  retime('data-seq-transition', 'transitionMs', 5000);
  retime('data-seq-hold', 'holdMs', 10000);

  this.root.querySelectorAll('[data-seq-easing]').forEach((element) => {
    element.addEventListener('change', (event) => {
      if (this.studio.currentSequence) return;
      const step = this.sequence[Number(element.getAttribute('data-seq-easing'))];
      if (step && EASING_NAMES.includes(event.target.value)) step.easing = event.target.value;
    });
  });

  this.root.querySelector('#btn-seq-play')?.addEventListener('click', () => {
    this.toggleSequencePlayback();
  });
  this.root.querySelector('#btn-seq-stop')?.addEventListener('click', () => {
    this.stopSequencePlayback();
  });
  this.root.querySelector('#btn-seq-clear')?.addEventListener('click', () => {
    if (this.studio.currentSequence) return;
    this.sequence.length = 0;
    this.activeSequenceIndex = -1;
    this.render();
  });
}

export function renderFindingsTab() {
  const entries = this.findings.list();
  this.selectedEntries(entries);
  if (!entries.length) {
    return `
      <div class="panel-section">
        <div class="section-header"><span class="section-title">FINDINGS</span></div>
        <div class="empty-notice">
          Nothing kept yet. Press <b>C</b> to stash the current orb with a thumbnail.
        </div>
      </div>
    `;
  }

  return `
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">FINDINGS</span>
        <span class="section-meta">${entries.length} kept</span>
      </div>
      <div class="findings-grid">
        ${entries.map((entry) => {
          const rawId = String(entry.id);
          const id = escapeHtml(rawId);
          return `
            <div class="finding-card ${this.selectedFindings.has(rawId) ? 'selected' : ''}" data-finding="${id}">
              <img class="finding-thumb" src="${safeThumbnail(entry.thumb)}" alt="" loading="lazy"
                   data-finding-select="${id}" title="Click to select for comparison" />
              <div class="finding-meta">
                <input class="finding-note" data-finding-note="${id}"
                       value="${escapeHtml(entry.note)}" placeholder="name this…" />
                <span class="finding-engine">${escapeHtml(entry.engine)}</span>
              </div>
              <div class="finding-actions">
                <button class="btn-sm btn-accent" data-finding-load="${id}">Load</button>
                <button class="cp-delete-btn" data-finding-delete="${id}" title="Delete">✕</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      ${this.renderFindingsSelectionBar()}
      <div class="modal-footer-row findings-footer">
        <button class="btn-sm" id="btn-findings-clear">Clear all</button>
      </div>
    </div>
  `;
}

export function attachFindingsListeners() {
  this.root.querySelectorAll('[data-finding-select]').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const id = thumb.getAttribute('data-finding-select');
      if (this.selectedFindings.has(id)) {
        this.selectedFindings.delete(id);
      } else {
        if (this.selectedFindings.size >= 2) {
          this.selectedFindings.delete(this.selectedFindings.values().next().value);
        }
        this.selectedFindings.add(id);
      }
      this.render();
    });
  });

  this.root.querySelector('#btn-findings-deselect')?.addEventListener('click', () => {
    this.selectedFindings.clear();
    this.render();
  });

  this.root.querySelector('#btn-findings-compare')?.addEventListener('click', () => {
    const entries = this.selectedEntries();
    if (entries.length !== 2 || typeof this.onCompareFindings !== 'function') return;
    try {
      if (this.onCompareFindings(entries[0], entries[1]) === false) {
        alert('Could not compare those findings.');
      }
    } catch (err) {
      console.error('Could not compare findings', err);
      alert('Could not compare those findings.');
    }
  });

  this.root.querySelector('#btn-findings-breed')?.addEventListener('click', () => {
    const entries = this.selectedEntries();
    if (entries.length !== 1 || typeof this.onBreedFinding !== 'function') return;
    try {
      if (this.onBreedFinding(entries[0]) === false) {
        alert('Could not breed from that finding.');
      }
    } catch (err) {
      console.error('Could not breed from finding', err);
      alert('Could not breed from that finding.');
    }
  });

  this.root.querySelectorAll('[data-finding-load]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-finding-load');
      const entry = this.findings.list().find((candidate) => candidate.id === id);
      if (!entry) return;
      this.importConfigText(JSON.stringify({
        engine: entry.engine,
        global: entry.global,
        params: entry.params,
        modulation: entry.modulation,
      }));
    });
  });

  this.root.querySelectorAll('[data-finding-delete]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-finding-delete');
      this.selectedFindings.delete(id);
      this.findings.remove(id);
      if (this.findings.lastError) {
        alert('Could not delete that finding from browser storage.');
        return;
      }
      this.render();
    });
  });

  this.root.querySelectorAll('[data-finding-note]').forEach((input) => {
    // Re-rendering on every keystroke would destroy and blur the input.
    input.addEventListener('change', (event) => {
      this.findings.rename(input.getAttribute('data-finding-note'), event.target.value);
      if (this.findings.lastError) {
        alert('Could not rename that finding in browser storage.');
      }
    });
  });

  this.root.querySelector('#btn-findings-clear')?.addEventListener('click', () => {
    if (!confirm('Delete every kept finding? This cannot be undone.')) return;
    this.selectedFindings.clear();
    this.findings.clear();
    if (this.findings.lastError) {
      alert('Could not clear findings from browser storage.');
      return;
    }
    this.render();
  });
}

// The exported config is the save format for a finding — dropping the
