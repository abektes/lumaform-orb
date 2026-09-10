import {
  LFO_SHAPES,
  TIME_SCALE_DEST,
  listModulationTargets,
  createDefaultModulation,
} from '../core/modulation.js';
import { ENGINE_PARAM_DEFINITIONS } from '../core/state.js';
import { formatParamValue, parseParamValue } from '../core/param-format.js';
import { displayFileName } from '../core/audio-transport.js';
import { escapeHtml } from './studio-format.js';
import { highlightJs, ensureHighlighter } from './highlight.js';

// --- Motion Lab -----------------------------------------------------------
//
// Every engine drives motion as `rate * linearTime`, so plain sliders can only
// explore faster/slower. This tab is where shape comes from: sources (LFO,
// noise, envelope, audio) routed onto destinations.

export function modConfig() {
  if (!this.state.modulation) this.store.setModulation(createDefaultModulation());
  // Captures made before audio reactivity have no audio source. Add only that
  // source in place so their existing routes and source settings stay intact.
  if (!this.state.modulation.sources) this.state.modulation.sources = {};
  if (!this.state.modulation.sources.audio1) {
    this.state.modulation.sources.audio1 = {
      type: 'audio',
      gain: 1,
      attack: 0.5,
      release: 0.12,
    };
  }
  return this.state.modulation;
}

export function modDestinations() {
  const defs = ENGINE_PARAM_DEFINITIONS[this.state.engine] || {};
  // listModulationTargets() already excludes structural params (geometry
  // rebuilds) and rate params (phase jumps), so the dropdown cannot offer a
  // destination that would break the render.
  return [
    { key: TIME_SCALE_DEST, label: 'Tempo — hesitate / accelerate' },
    ...listModulationTargets(defs),
  ];
}

export function renderMotionLabTab() {
  const mod = this.modConfig();
  const dests = this.modDestinations();
  const src = mod.sources || {};
  const lfo = src.lfo1 || {};
  const noise = src.noise1 || {};
  const env = src.env1 || {};
  const audio = src.audio1 || {};

  // Was a private helper hardcoding toFixed(2), which is how the same control
  // came to format differently depending on which tab it was in. Scope 'mod'
  // keeps these rows out of the engine/global listener path, so an LFO "rate"
  // never cross-syncs with an engine parameter of the same name. No `default`
  // in the definition means no reset button — modulation sources have no
  // schema defaults to reset to.
  const slider = (attr, label, value, min, max, step) =>
    this.renderNumberRow({
      key: `${attr.match(/data-mod-src="([^"]+)"/)[1]}.${attr.match(/data-mod-field="([^"]+)"/)[1]}`,
      def: { label, min, max, step },
      value,
      attr,
      scope: 'mod',
    });

  const routeRows = (mod.routes || []).map((r, i) => `
    <div class="control-row mod-route-row" data-route="${i}">
      <select class="studio-select mod-route-source" data-route="${i}">
        ${Object.keys(src).map((id) => `<option value="${id}" ${r.source === id ? 'selected' : ''}>${id}</option>`).join('')}
      </select>
      <select class="studio-select mod-route-dest" data-route="${i}">
        ${dests.map((d) => `<option value="${d.key}" ${r.dest === d.key ? 'selected' : ''}>${d.label}</option>`).join('')}
      </select>
      <input type="range" class="studio-slider mod-route-amount" data-route="${i}"
             min="-1" max="1" step="0.02" value="${r.amount ?? 0}" title="Amount" />
      <button class="cp-delete-btn mod-route-remove" data-route="${i}" title="Remove route">✕</button>
    </div>`).join('');

  return `
    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">MODULATION</span>
        <button type="button" class="lab-entry" data-inspector-leaf="motion">Motion</button>
      </div>
      <div class="controls-list">
        <div class="control-row">
          <label class="ctrl-label">Enable Modulation</label>
          <button class="btn-sm ${mod.enabled ? 'btn-accent' : ''}" id="btn-mod-enable">
            ${mod.enabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header"><span class="section-title">SOURCES</span></div>
      <div class="controls-list">
        <div class="control-row">
          <label class="ctrl-label">LFO Shape</label>
          <select class="studio-select" data-mod-src="lfo1" data-mod-field="shape">
            ${LFO_SHAPES.map((sh) => `<option value="${sh}" ${lfo.shape === sh ? 'selected' : ''}>${sh}</option>`).join('')}
          </select>
        </div>
        ${slider('data-mod-src="lfo1" data-mod-field="rate"', 'LFO Rate (Hz)', lfo.rate ?? 0.5, 0.02, 4, 0.02)}
        ${slider('data-mod-src="lfo1" data-mod-field="phase"', 'LFO Phase', lfo.phase ?? 0, 0, 1, 0.01)}
        ${slider('data-mod-src="noise1" data-mod-field="rate"', 'Noise Rate', noise.rate ?? 0.35, 0.02, 2, 0.01)}
        ${slider('data-mod-src="noise1" data-mod-field="octaves"', 'Noise Octaves', noise.octaves ?? 3, 1, 5, 1)}
        ${slider('data-mod-src="env1" data-mod-field="attack"', 'Env Attack (s)', env.attack ?? 0.08, 0, 1.5, 0.01)}
        ${slider('data-mod-src="env1" data-mod-field="hold"', 'Env Hold (s)', env.hold ?? 0.06, 0, 1.5, 0.01)}
        ${slider('data-mod-src="env1" data-mod-field="decay"', 'Env Decay (s)', env.decay ?? 0.9, 0.05, 3, 0.01)}
        <div class="control-row">
          <label class="ctrl-label">Fire Envelope</label>
          <button class="btn-sm btn-accent" id="btn-mod-trigger">Trigger</button>
        </div>
        <div class="control-row">
          <label class="ctrl-label">Audio Input</label>
          <div class="audio-input-row">
            <button class="btn-sm ${this.studio.audioInput?.mode === 'mic' ? 'btn-accent' : ''}" id="btn-audio-mic">Mic</button>
            <button class="btn-sm ${this.studio.audioInput?.mode === 'tone' ? 'btn-accent' : ''}" id="btn-audio-tone">Test Tone</button>
            <button class="btn-sm ${this.studio.audioInput?.mode === 'file' ? 'btn-accent' : ''}" id="btn-audio-file">File</button>
            <button class="btn-sm" id="btn-audio-off">Off</button>
          </div>
        </div>
        ${this.studio.audioInput?.mode === 'file' && this.studio.audioInput?.fileName ? `
        <div class="control-row">
          <label class="ctrl-label audio-file-name" title="${escapeHtml(this.studio.audioInput.fileName)}">${escapeHtml(displayFileName(this.studio.audioInput.fileName))}</label>
          <div class="audio-input-row">
            <button class="btn-sm ${this.studio.audioInput.isPlaying ? 'btn-accent' : ''}" id="btn-audio-play">Play</button>
            <button class="btn-sm" id="btn-audio-stop">Stop</button>
            <button class="btn-sm ${this.studio.audioInput.loop ? 'btn-accent' : ''}" id="btn-audio-loop">Loop</button>
            <button class="btn-sm ${this.studio.audioInput.muted ? 'btn-accent' : ''}" id="btn-audio-mute">Mute</button>
          </div>
        </div>` : ''}
        <div class="control-row">
          <label class="ctrl-label">Audio Level</label>
          <div class="audio-meter"><div class="audio-meter-fill" id="audio-meter-fill"></div></div>
        </div>
        ${slider('data-mod-src="audio1" data-mod-field="gain"', 'Audio Gain', audio.gain ?? 1, 0, 4, 0.05)}
        ${slider('data-mod-src="audio1" data-mod-field="attack"', 'Audio Attack', audio.attack ?? 0.5, 0, 1, 0.01)}
        ${slider('data-mod-src="audio1" data-mod-field="release"', 'Audio Release', audio.release ?? 0.12, 0, 1, 0.01)}
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span class="section-title">ROUTING</span>
        <button class="btn-sm btn-accent" id="btn-mod-add-route">+ Route</button>
      </div>
      <div class="controls-list">
        ${routeRows || '<div class="empty-notice">No routes yet. Add one to shape the motion.</div>'}
      </div>
    </div>
  `;
}

// Shiki lives in its own chunk. On first visit to the Export tab the snippet is
// already on screen as escaped plain text; once the chunk resolves we swap in
// the highlighted markup rather than re-rendering the whole panel.
export function upgradeCodePreview(embedCode) {
  if (!this.modalOverlay.querySelector('.code-preview')) return;
  ensureHighlighter().then((hl) => {
    if (!hl) return;
    // The modal may have been dismissed while the chunk was downloading.
    const current = this.modalOverlay.querySelector('.code-preview');
    if (!current) return;
    current.innerHTML = highlightJs(embedCode);
  });
}

export function attachMotionLabListeners() {
  const mod = this.modConfig();
  const commit = (rerender) => {
    this.onStateChange(this.state);
    if (rerender) this.render();
  };

  this.root.querySelector('#btn-mod-enable')?.addEventListener('click', () => {
    mod.enabled = !mod.enabled;
    commit(true);
  });

  this.root.querySelector('#btn-mod-trigger')?.addEventListener('click', () => {
    this.studio.modulation.trigger(this.studio.virtualTime);
  });

  // Turning an input on is not the same as hearing it. The rack only reacts
  // through routes, "+ Route" defaults to the first source (lfo1), and nothing
  // ever pointed a route at audio1 — so enabling the mic moved the level meter
  // and changed nothing on screen, which reads as "the microphone is broken".
  // Seed one audible route on first enable. Tempo is the destination because it
  // exists for every engine, whereas a parameter destination depends on which
  // engine happens to be open. It appears in the rack like any other route, so
  // it can be retargeted or deleted.
  const ensureAudibleRoute = () => {
    mod.routes = mod.routes || [];
    const alreadyRouted = mod.routes.some((r) => r.source === 'audio1' && r.enabled !== false);
    if (alreadyRouted) return;
    mod.routes.push({ source: 'audio1', dest: TIME_SCALE_DEST, amount: 0.5 });
  };

  this.root.querySelector('#btn-audio-mic')?.addEventListener('click', async () => {
    const started = await this.studio.enableAudio('mic');
    if (!started) {
      alert('Could not access the microphone. Check the browser permission prompt.');
      this.render();
      return;
    }
    ensureAudibleRoute();
    mod.enabled = true;
    commit(true);
  });

  this.root.querySelector('#btn-audio-tone')?.addEventListener('click', async () => {
    // Was unchecked, so a context the browser refused to start still lit the
    // button as though the tone were playing.
    const started = await this.studio.enableAudio('tone');
    if (!started) {
      alert('Could not start the test tone. The browser blocked audio playback.');
      this.render();
      return;
    }
    ensureAudibleRoute();
    mod.enabled = true;
    commit(true);
  });

  this.root.querySelector('#btn-audio-file')?.addEventListener('click', () => {
    // Created per click and discarded. render() rewrites the inspector's inner
    // HTML, which would destroy a persistent input and silently drop the
    // user's selection, so no file input lives in the markup.
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'audio/*,video/mp4,.wav,.mp3,.m4a,.mp4,.ogg,.flac,.aac';
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      if (!file) return;
      const started = await this.studio.enableAudio('file', file);
      if (!started) {
        alert('Could not load that audio file. The browser could not decode it.');
        this.render();
        return;
      }
      ensureAudibleRoute();
      mod.enabled = true;
      commit(true);
    });
    picker.click();
  });

  this.root.querySelector('#btn-audio-play')?.addEventListener('click', async () => {
    // The context is resumed inside this click rather than at file-select time,
    // because a file picker can outlive the gesture that opened it.
    const ok = await this.studio.audioInput?.playFile();
    if (!ok) {
      alert('The browser blocked playback. Click Play again to allow audio.');
    }
    this.render();
  });

  this.root.querySelector('#btn-audio-stop')?.addEventListener('click', () => {
    this.studio.audioInput?.stopFilePlayback();
    this.render();
  });

  this.root.querySelector('#btn-audio-loop')?.addEventListener('click', () => {
    const audio = this.studio.audioInput;
    if (!audio) return;
    audio.setLoop(!audio.loop);
    this.render();
  });

  this.root.querySelector('#btn-audio-mute')?.addEventListener('click', () => {
    const audio = this.studio.audioInput;
    if (!audio) return;
    audio.setMuted(!audio.muted);
    this.render();
  });

  this.root.querySelector('#btn-audio-off')?.addEventListener('click', () => {
    this.studio.disableAudio();
    commit(true);
  });

  clearInterval(this._audioMeterId);
  this._audioMeterId = null;
  if (this.root.querySelector('#audio-meter-fill')) {
    this._audioMeterId = setInterval(() => {
      const fill = this.root.querySelector('#audio-meter-fill');
      if (!fill) {
        clearInterval(this._audioMeterId);
        this._audioMeterId = null;
        return;
      }
      fill.style.width = `${Math.round((this.studio.modulation.audioLevel ?? 0) * 100)}%`;
      // A track that reaches its end with loop off leaves the Play button lit.
      // Re-render only on a transition, never on every tick.
      const playing = !!this.studio.audioInput?.isPlaying;
      if (this._audioWasPlaying !== undefined && this._audioWasPlaying !== playing) {
        this._audioWasPlaying = playing;
        this.render();
        return;
      }
      this._audioWasPlaying = playing;
    }, 100);
  }

  this.root.querySelector('#btn-mod-add-route')?.addEventListener('click', () => {
    const dests = this.modDestinations();
    mod.routes = mod.routes || [];
    mod.routes.push({
      source: Object.keys(mod.sources)[0],
      dest: dests[0]?.key ?? TIME_SCALE_DEST,
      amount: 0.4,
    });
    mod.enabled = true;
    commit(true);
  });

  // Definitions for the shared row's formatter live on the range input's
  // attributes — modulation sources have no schema to look them up in.
  const modRowDef = (rangeEl) => ({
    min: Number(rangeEl.min),
    max: Number(rangeEl.max),
    step: Number(rangeEl.step),
  });

  const writeModField = (id, field, raw) => {
    mod.sources[id][field] = field === 'shape' ? raw : Number(raw);
    if (id === 'audio1' && (field === 'attack' || field === 'release')) {
      this.studio.audioInput?.setOptions({ [field]: Number(raw) });
    }
  };

  this.root.querySelectorAll('[data-mod-src]').forEach((el) => {
    const id = el.getAttribute('data-mod-src');
    const field = el.getAttribute('data-mod-field');
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, (e) => {
      const raw = e.target.value;
      writeModField(id, field, raw);
      const row = el.closest('.param-row');
      if (row) this.syncNumberRow(row, Number(raw), modRowDef(el));
      commit(false);
    });
  });

  // The typed half of each shared row. Engine and global rows get this wiring
  // from attachControlListeners(), which skips mod scope so equal key names
  // never cross-synchronize; these commit straight into the modulation rack.
  this.root.querySelectorAll('.param-row[data-number-scope="mod"]').forEach((row) => {
    const rangeEl = row.querySelector('input[type="range"]');
    const field = row.querySelector('.ctrl-number');
    if (!rangeEl || !field) return;
    const id = rangeEl.getAttribute('data-mod-src');
    const fieldName = rangeEl.getAttribute('data-mod-field');
    const def = modRowDef(rangeEl);
    let suppressChange = false;
    const commitField = () => {
      const parsed = parseParamValue(field.value, def);
      if (parsed === null) {
        field.value = formatParamValue(Number(mod.sources[id][fieldName]), def);
        return;
      }
      writeModField(id, fieldName, parsed);
      field.value = formatParamValue(parsed, def);
      rangeEl.value = parsed;
      commit(false);
    };
    field.addEventListener('change', () => {
      if (!suppressChange) commitField();
    });
    field.addEventListener('keydown', (event) => {
      // Same contract as the parameter rows: Enter commits and Escape
      // reverts, and neither bubbles into the bare-key shortcut handling.
      if (event.key === 'Enter') {
        event.preventDefault();
        suppressChange = true;
        commitField();
        field.blur();
        queueMicrotask(() => { suppressChange = false; });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        suppressChange = true;
        field.value = formatParamValue(Number(mod.sources[id][fieldName]), def);
        field.blur();
        queueMicrotask(() => { suppressChange = false; });
      }
      event.stopPropagation();
    });
  });

  this.root.querySelectorAll('.mod-route-source').forEach((el) => {
    el.addEventListener('change', (e) => {
      mod.routes[Number(el.getAttribute('data-route'))].source = e.target.value;
      commit(false);
    });
  });
  this.root.querySelectorAll('.mod-route-dest').forEach((el) => {
    el.addEventListener('change', (e) => {
      mod.routes[Number(el.getAttribute('data-route'))].dest = e.target.value;
      commit(false);
    });
  });
  this.root.querySelectorAll('.mod-route-amount').forEach((el) => {
    el.addEventListener('input', (e) => {
      mod.routes[Number(el.getAttribute('data-route'))].amount = Number(e.target.value);
      commit(false);
    });
  });
  this.root.querySelectorAll('.mod-route-remove').forEach((el) => {
    el.addEventListener('click', () => {
      mod.routes.splice(Number(el.getAttribute('data-route')), 1);
      commit(true);
    });
  });
}

// Accepts a single exported config or the array the variation grid writes.
// When given an array, loads the first entry — the rest are still in the file,
