import { ENGINE_TYPES, ENGINE_INFO } from '../core/state.js';
import { ICONS } from './icons.js';
import { INSPECTOR_MODES, INSPECTOR_MODE_ORDER } from './inspector-nav.js';

export function shellMarkup() {
  const currentEngine = ENGINE_INFO[this.state.engine] || { name: this.state.engine, badge: '' };

  return `
    <!-- TOP NAVIGATION BAR -->
    <header class="studio-topbar">
      <div class="topbar-brand" id="brand-link" title="Lumaform Orb">
        <span class="brand-diamond"></span>
        <div class="brand-text">
          <span class="brand-title">LUMAFORM ORB</span>
        </div>
      </div>

      <!-- ENGINE DROPDOWN SELECTOR -->
      <div class="topbar-engine-group">
      <button class="engine-step" id="engine-prev" title="Previous engine">&lsaquo;</button>
      <div class="topbar-engine-dropdown">
        <button class="engine-dropdown-trigger ${this.initialOpenDropdown ? 'open' : ''}" id="engine-dropdown-btn" aria-haspopup="true" aria-expanded="${this.initialOpenDropdown ? 'true' : 'false'}" title="Switch Generative Engine">
          <span class="trigger-icon">${ICONS.cube}</span>
          <span class="trigger-name">${currentEngine.name}</span>
          <span class="trigger-badge">${currentEngine.badge}</span>
          <span class="trigger-chevron">${ICONS.chevronDown}</span>
        </button>

        <div class="engine-dropdown-menu ${this.initialOpenDropdown ? 'open' : ''}" id="engine-dropdown-menu">
          ${Object.values(ENGINE_TYPES)
            .map((type) => {
              const info = ENGINE_INFO[type];
              const isActive = this.state.engine === type;
              return `
                <button class="engine-dropdown-item ${isActive ? 'active' : ''}" data-engine="${type}">
                  <div class="engine-item-header">
                    <div class="engine-item-title">
                      <span class="engine-item-dot"></span>
                      <span>${info.name}</span>
                    </div>
                    <span class="engine-item-badge">${info.badge}</span>
                  </div>
                  <div class="engine-item-desc">${info.description}</div>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
      <button class="engine-step" id="engine-next" title="Next engine">&rsaquo;</button>
      </div>

      <div class="topbar-actions">
        <button class="btn-action" id="btn-randomize" title="Randomize Parameters (Hotkey: R)">
          ${ICONS.dice}
          <span>Random</span>
        </button>
        <button class="btn-action" id="btn-playpause" title="Play / Pause (Hotkey: Space)">
          <span id="playpause-icon">${this.state.global.paused ? ICONS.play : ICONS.pause}</span>
        </button>
        <button class="btn-action" id="btn-reset-cam" title="Reset Camera View">
          ${ICONS.target}
          <span>View</span>
        </button>
        <button class="btn-action btn-highlight" id="btn-snapshot" title="Save Screenshot (Hotkey: S)">
          ${ICONS.camera}
          <span>Snapshot</span>
        </button>
        <button class="btn-action btn-accent" id="btn-export" title="Export Code / JSON Config">
          ${ICONS.export}
          <span>Export</span>
        </button>
        <button class="btn-action ${this.studio.isGridMode ? 'active' : ''}" id="btn-grid" title="Variation Grid — breed 9 mutations (Hotkey: G)">
          ${ICONS.cube}
          <span>Grid</span>
        </button>
        <button class="btn-action" id="btn-zen" title="Zen Mode / Hide UI (Hotkey: H)">
          ${ICONS.eye}
        </button>
        <button class="btn-action" id="btn-toggle-panel" title="Toggle Inspector">
          ${ICONS.sliders}
        </button>
        <button class="btn-action btn-shortcuts" id="btn-shortcuts" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
      </div>
    </header>

    <!-- LIVE STATS BADGE -->
    <div class="studio-stats-badge">
      <span class="fps-indicator" id="fps-dot"></span>
      <span id="fps-counter">60 FPS</span>
      <span class="stats-sep">•</span>
      <span class="stats-engine-label">${ENGINE_INFO[this.state.engine]?.badge || ''}</span>
    </div>

    <!-- FLOATING PLAYBACK & SPEED CONTROLLER DOCK -->
    <div class="studio-playback-dock">
      <button class="dock-play-btn ${this.state.global.paused ? 'paused' : ''}" id="dock-btn-play" title="Play / Pause (Hotkey: Space)">
        <span class="dock-play-icon">${this.state.global.paused ? ICONS.play : ICONS.pause}</span>
        <span class="dock-play-text">${this.state.global.paused ? 'PLAY' : 'PAUSE'}</span>
      </button>

      <div class="dock-vsep"></div>

      <div class="dock-speed-section">
        <span class="dock-speed-title">SPEED</span>
        <input
          type="range"
          class="dock-speed-slider"
          id="dock-speed-slider"
          min="0.0"
          max="3.0"
          step="0.05"
          value="${this.state.global.timeScale ?? 1.0}"
          title="Adjust Simulation Velocity"
        />
        <span class="dock-speed-badge" id="dock-speed-badge">${(this.state.global.timeScale ?? 1.0).toFixed(1)}x</span>
      </div>

      <div class="dock-vsep"></div>

      <div class="dock-speed-pills">
        <button class="dock-speed-pill ${(this.state.global.timeScale ?? 1.0) === 0.25 ? 'active' : ''}" data-speed="0.25">0.25x</button>
        <button class="dock-speed-pill ${(this.state.global.timeScale ?? 1.0) === 0.5 ? 'active' : ''}" data-speed="0.5">0.5x</button>
        <button class="dock-speed-pill ${(this.state.global.timeScale ?? 1.0) === 1.0 ? 'active' : ''}" data-speed="1.0">1x</button>
        <button class="dock-speed-pill ${(this.state.global.timeScale ?? 1.0) === 2.0 ? 'active' : ''}" data-speed="2.0">2x</button>
      </div>

      <div class="dock-vsep"></div>

      <button class="dock-icon-btn ${this.isReversed ? 'active' : ''}" id="dock-btn-reverse" title="Reverse Rotation Direction">
        ${ICONS.reverse}
      </button>
    </div>

    <!-- RIGHT INSPECTOR SIDEBAR -->
    <aside class="studio-inspector ${this.isSidebarOpen ? '' : 'collapsed'}">
      <nav class="inspector-nav" aria-label="Inspector">
        <div class="inspector-modes">
          ${INSPECTOR_MODE_ORDER.map((id) => {
            const mode = INSPECTOR_MODES[id];
            const selected = id === this.activeMode;
            return `<button type="button" class="mode-btn ${selected ? 'active' : ''}" data-mode="${id}" aria-pressed="${selected}">${mode.label}</button>`;
          }).join('')}
        </div>
        <div class="inspector-sections" aria-label="${INSPECTOR_MODES[this.activeMode].label}">
          ${INSPECTOR_MODE_ORDER.map((id) => {
            const mode = INSPECTOR_MODES[id];
            const hidden = id !== this.activeMode;
            const sections = mode.sections
              .map((section) => {
                const selected = this.activeTab === section.id;
                return `<button type="button" class="tab-btn ${selected ? 'active' : ''}" data-mode="${id}" data-tab="${section.id}" ${hidden ? 'hidden' : ''} aria-pressed="${selected}">${section.label}</button>`;
              })
              .join('');
            const lab = mode.secondary
              ? `<button type="button" class="tab-lab ${this.activeTab === mode.secondary.id ? 'active' : ''}" data-mode="${id}" data-tab="${mode.secondary.id}" ${hidden ? 'hidden' : ''} aria-pressed="${this.activeTab === mode.secondary.id}" aria-label="${mode.secondary.label}">${mode.secondary.shortLabel}</button>`
              : '';
            return sections + lab;
          }).join('')}
        </div>
      </nav>

      <div class="inspector-content custom-scroll"></div>
    </aside>
  `;
}
