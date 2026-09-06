import {
  ENGINE_TYPES,
  ENGINE_INFO,
  ENGINE_PARAM_DEFINITIONS,
  randomizeState,
  loadSavedPresets,
  saveCustomPreset,
  deleteCustomPreset,
} from '../core/state.js';
import { PRESET_LIBRARY } from '../presets/preset-library.js';
import { highlightJs, ensureHighlighter } from './highlight.js';
import {
  LFO_SHAPES,
  TIME_SCALE_DEST,
  listModulationTargets,
  createDefaultModulation,
} from '../core/modulation.js';

const ICONS = {
  dice: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"></circle><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"></circle><circle cx="12" cy="12" r="1.5" fill="currentColor"></circle><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"></circle><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"></circle></svg>`,
  play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`,
  pause: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`,
  target: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>`,
  camera: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`,
  export: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  eye: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  sliders: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>`,
  chevronDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  reverse: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
  sparkle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  cube: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
};

export class StudioUI {
  constructor(container, studio, state, onStateChange) {
    this.container = container;
    this.studio = studio;
    this.state = state;
    this.onStateChange = onStateChange;

    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const reqTab = urlParams?.get('tab');
    const validTabs = ['presets', 'colors', 'geometry', 'motion', 'motionlab', 'optics', 'space', 'export', 'perf'];
    this.activeTab = validTabs.includes(reqTab) ? reqTab : 'presets';
    this.initialOpenDropdown = urlParams?.get('openDropdown') === 'true';
    this.isZenMode = false;
    this.isSidebarOpen = true;

    this.initElements();
    this.bindEvents();
    this.render();
  }

  initElements() {
    this.root = document.createElement('div');
    this.root.className = 'studio-ui-root';
    this.container.appendChild(this.root);

    // Modal container
    this.modalOverlay = document.createElement('div');
    this.modalOverlay.className = 'studio-modal-overlay hidden';
    this.container.appendChild(this.modalOverlay);
  }

  bindEvents() {
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        this.handleRandomize();
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        this.toggleZenMode();
      } else if (e.code === 'KeyS' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        this.studio.captureSnapshot();
      } else if (e.code === 'Escape') {
        this.closeModal();
      }
    });

    // Close the engine dropdown on an outside click. Bound once here rather than
    // in attachTopBarListeners(), which render() calls from 13 different sites —
    // each call used to add another document-level listener that retained the
    // DOM subtree it closed over, so the app got progressively slower to click.
    // Elements are resolved at click time because render() replaces them.
    document.addEventListener('click', (e) => {
      const btn = this.root.querySelector('#engine-dropdown-btn');
      const menu = this.root.querySelector('#engine-dropdown-menu');
      if (!btn || !menu) return;
      if (btn.contains(e.target) || menu.contains(e.target)) return;
      menu.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });

    // Modal overlay click to close
    this.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.modalOverlay) {
        this.closeModal();
      }
    });
  }

  togglePlayPause() {
    const isPaused = this.studio.togglePlayPause();
    this.state.global.paused = isPaused;
    this.updatePlayPauseBtn();
  }

  toggleZenMode() {
    this.isZenMode = !this.isZenMode;
    this.root.classList.toggle('zen-hidden', this.isZenMode);

    let hint = document.getElementById('zen-hint');
    if (this.isZenMode) {
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'zen-hint';
        hint.className = 'zen-hint-pill';
        hint.innerHTML = 'Press <b>H</b> or click to exit Zen Mode';
        hint.addEventListener('click', () => this.toggleZenMode());
        this.container.appendChild(hint);
      }
      hint.style.display = 'block';
    } else if (hint) {
      hint.style.display = 'none';
    }
  }

  handleRandomize() {
    // randomizeState() returns a fresh object. Rebinding this.state to it would
    // orphan every other holder of the original reference — main.js keeps a
    // module-level `state` used for grid entry and export, so a rebind here made
    // the grid breed from pre-randomize params. Copy in place instead; the
    // constructor stays the only place this.state is ever assigned.
    const next = randomizeState(this.state);
    Object.assign(this.state.global, next.global);
    Object.assign(this.state.engines[this.state.engine], next.engines[this.state.engine]);
    this.state.activePresetName = next.activePresetName;
    this.onStateChange(this.state);
    this.render();
  }

  render() {
    const currentEngine = ENGINE_INFO[this.state.engine] || { name: this.state.engine, badge: '' };

    this.root.innerHTML = `
      <!-- TOP NAVIGATION BAR -->
      <header class="studio-topbar">
        <div class="topbar-brand" id="brand-link" title="Lumaform Orb">
          <span class="brand-diamond"></span>
          <div class="brand-text">
            <span class="brand-title">LUMAFORM ORB</span>
          </div>
        </div>

        <!-- ENGINE DROPDOWN SELECTOR -->
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
        <div class="inspector-tabs">
          <button class="tab-btn ${this.activeTab === 'presets' ? 'active' : ''}" data-tab="presets">Presets</button>
          <button class="tab-btn ${this.activeTab === 'colors' ? 'active' : ''}" data-tab="colors">Colors</button>
          <button class="tab-btn ${this.activeTab === 'geometry' ? 'active' : ''}" data-tab="geometry">Geometry</button>
          <button class="tab-btn ${this.activeTab === 'motion' ? 'active' : ''}" data-tab="motion">Motion</button>
          <button class="tab-btn ${this.activeTab === 'motionlab' ? 'active' : ''}" data-tab="motionlab">Motion Lab</button>
          <button class="tab-btn ${this.activeTab === 'optics' ? 'active' : ''}" data-tab="optics">Optics</button>
          <button class="tab-btn ${this.activeTab === 'space' ? 'active' : ''}" data-tab="space">Space</button>
          <button class="tab-btn ${this.activeTab === 'export' ? 'active' : ''}" data-tab="export">Export</button>
          <button class="tab-btn ${this.activeTab === 'perf' ? 'active' : ''}" data-tab="perf">Perf</button>
        </div>

        <div class="inspector-content custom-scroll">
          ${this.renderTabContent()}
        </div>
      </aside>
    `;

    this.attachTopBarListeners();
    this.attachTabListeners();
    this.attachControlListeners();
    this.attachMotionLabListeners();
  }

  attachTopBarListeners() {
    const dropdownBtn = this.root.querySelector('#engine-dropdown-btn');
    const dropdownMenu = this.root.querySelector('#engine-dropdown-menu');

    if (dropdownBtn && dropdownMenu) {
      dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdownMenu.classList.toggle('open');
        dropdownBtn.classList.toggle('open', isOpen);
        dropdownBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      this.root.querySelectorAll('.engine-dropdown-item').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const newEngine = btn.getAttribute('data-engine');
          dropdownMenu.classList.remove('open');
          dropdownBtn.classList.remove('open');
          dropdownBtn.setAttribute('aria-expanded', 'false');

          if (newEngine !== this.state.engine) {
            this.state.engine = newEngine;
            this.onStateChange(this.state);
            this.render();
          }
        });
      });

    }

    this.root.querySelector('#btn-randomize')?.addEventListener('click', () => this.handleRandomize());
    this.root.querySelector('#btn-playpause')?.addEventListener('click', () => this.togglePlayPause());
    this.root.querySelector('#btn-reset-cam')?.addEventListener('click', () => this.studio.resetCamera());
    this.root.querySelector('#btn-snapshot')?.addEventListener('click', () => this.studio.captureSnapshot());
    this.root.querySelector('#btn-export')?.addEventListener('click', () => {
      this.activeTab = 'export';
      this.render();
    });
    this.root.querySelector('#btn-grid')?.addEventListener('click', () => this.onToggleGrid?.());
    this.root.querySelector('#btn-zen')?.addEventListener('click', () => this.toggleZenMode());
    this.root.querySelector('#btn-toggle-panel')?.addEventListener('click', () => {
      this.isSidebarOpen = !this.isSidebarOpen;
      const inspector = this.root.querySelector('.studio-inspector');
      inspector?.classList.toggle('collapsed', !this.isSidebarOpen);
    });

    // Dock Events
    this.root.querySelector('#dock-btn-play')?.addEventListener('click', () => this.togglePlayPause());

    const speedSlider = this.root.querySelector('#dock-speed-slider');
    speedSlider?.addEventListener('input', (e) => {
      this.setPlaybackSpeed(parseFloat(e.target.value));
    });

    this.root.querySelectorAll('.dock-speed-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const speed = parseFloat(pill.getAttribute('data-speed'));
        this.setPlaybackSpeed(speed);
      });
    });

    this.root.querySelector('#dock-btn-reverse')?.addEventListener('click', () => this.toggleReverse());
  }

  // `state.global.timeScale` is signed and is the single source of truth for both
  // speed and direction. The slider sets magnitude, reverse sets sign, and the
  // button derives its state from the sign — previously the slider clamped to >= 0
  // and silently dropped reverse while a separate `isReversed` flag stayed true.
  get isReversed() {
    return this.state.global.timeScale < 0;
  }

  setPlaybackSpeed(speed, { preserveDirection = true } = {}) {
    const magnitude = Math.max(0, Math.min(3.0, Math.abs(speed)));
    const sign = preserveDirection && this.isReversed ? -1 : Math.sign(speed) || 1;
    this.applyTimeScale(magnitude * sign);
  }

  toggleReverse() {
    this.applyTimeScale(-this.state.global.timeScale || -1);
  }

  applyTimeScale(signed) {
    this.state.global.timeScale = signed;
    this.studio.timeScale = signed;

    const magnitude = Math.abs(signed);
    const slider = this.root.querySelector('#dock-speed-slider');
    if (slider) slider.value = magnitude;
    const badge = this.root.querySelector('#dock-speed-badge');
    if (badge) badge.textContent = `${signed < 0 ? '-' : ''}${magnitude.toFixed(1)}x`;
    const valMotion = this.root.querySelector('#val-timeScale');
    if (valMotion) valMotion.textContent = magnitude.toFixed(1);
    const motionSlider = this.root.querySelector('input[data-global="timeScale"]');
    if (motionSlider) motionSlider.value = magnitude;

    this.root.querySelectorAll('.dock-speed-pill').forEach((pill) => {
      const pSpeed = parseFloat(pill.getAttribute('data-speed'));
      pill.classList.toggle('active', Math.abs(pSpeed - magnitude) < 0.05);
    });

    const revBtn = this.root.querySelector('#dock-btn-reverse');
    if (revBtn) revBtn.classList.toggle('active', signed < 0);
  }

  updatePlayPauseBtn() {
    const isPaused = this.state.global.paused;
    const icon = this.root.querySelector('#playpause-icon');
    if (icon) {
      icon.innerHTML = isPaused ? ICONS.play : ICONS.pause;
    }

    const dockBtn = this.root.querySelector('#dock-btn-play');
    if (dockBtn) {
      dockBtn.classList.toggle('paused', isPaused);
      const dIcon = dockBtn.querySelector('.dock-play-icon');
      if (dIcon) dIcon.innerHTML = isPaused ? ICONS.play : ICONS.pause;
      const dText = dockBtn.querySelector('.dock-play-text');
      if (dText) dText.textContent = isPaused ? 'PLAY' : 'PAUSE';
    }
  }

  attachTabListeners() {
    this.root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.getAttribute('data-tab');
        this.render();
      });
    });
  }

  renderTabContent() {
    switch (this.activeTab) {
      case 'presets':
        return this.renderPresetsTab();
      case 'colors':
        return this.renderParamsSection('colors');
      case 'geometry':
        return this.renderParamsSection('geometry');
      case 'motion':
        return this.renderParamsSection('motion');
      case 'motionlab':
        return this.renderMotionLabTab();
      case 'optics':
        return this.renderOpticsTab();
      case 'space':
        return this.renderSpaceTab();
      case 'export':
        return this.renderExportTab();
      case 'perf':
        return this.renderPerfTab();
      default:
        return '';
    }
  }

  renderPresetsTab() {
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
              const colorDot1 = preset.params.color1 || preset.params.particleColor || '#00f0ff';
              const colorDot2 = preset.params.color2 || preset.params.glowColor || '#7c3aed';
              return `
                <div class="preset-card ${isSelected ? 'active' : ''}" data-preset-name="${preset.name}">
                  <div class="preset-card-head">
                    <div class="preset-dots">
                      <span class="color-dot" style="background: ${colorDot1}"></span>
                      <span class="color-dot" style="background: ${colorDot2}"></span>
                    </div>
                    <span class="preset-badge">${preset.badge}</span>
                  </div>
                  <div class="preset-name">${preset.name}</div>
                  <div class="preset-desc">${preset.description}</div>
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
                <span class="cp-name" data-load-custom="${cp.name}">${cp.name}</span>
                <button class="cp-delete-btn" data-delete-custom="${cp.name}" title="Delete">✕</button>
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

  renderParamsSection(sectionName) {
    const engine = this.state.engine;
    const defs = ENGINE_PARAM_DEFINITIONS[engine] || {};
    const engineParams = this.state.engines[engine] || {};

    const filteredKeys = Object.keys(defs).filter((key) => defs[key].section === sectionName);

    // A modulated slider shows the *base* value while the engine renders the
    // modulated one. Without a marker that divergence just looks like a broken
    // control, so flag every param a route is currently driving.
    const mod = this.state.modulation;
    const modulated = new Set(
      mod?.enabled ? (mod.routes || []).filter((r) => r.enabled !== false).map((r) => r.dest) : []
    );
    const modDot = (key) =>
      modulated.has(key) ? '<span class="mod-dot" title="Driven by modulation"></span>' : '';

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
            <button class="palette-chip" data-palette="cosmic" title="Cosmic Aurora">
              <span class="palette-dot-bar" style="background: linear-gradient(90deg, #057eff, #a855f7, #00f2fe);"></span>
              <span>Cosmic</span>
            </button>
            <button class="palette-chip" data-palette="solar" title="Solar Flare">
              <span class="palette-dot-bar" style="background: linear-gradient(90deg, #ff5500, #ff0055, #ffc400);"></span>
              <span>Solar</span>
            </button>
            <button class="palette-chip" data-palette="cyber" title="Cyber Emerald">
              <span class="palette-dot-bar" style="background: linear-gradient(90deg, #059669, #06b6d4, #10b981);"></span>
              <span>Cyber</span>
            </button>
            <button class="palette-chip" data-palette="rose" title="Rose Gold">
              <span class="palette-dot-bar" style="background: linear-gradient(90deg, #f43f5e, #fb923c, #fda4af);"></span>
              <span>Rose</span>
            </button>
            <button class="palette-chip" data-palette="cryo" title="Sub-Zero Cryo">
              <span class="palette-dot-bar" style="background: linear-gradient(90deg, #00f0ff, #38bdf8, #e0f2fe);"></span>
              <span>Cryo</span>
            </button>
            <button class="palette-chip" data-palette="molten" title="Obsidian Molten">
              <span class="palette-dot-bar" style="background: linear-gradient(90deg, #f59e0b, #ef4444, #38bdf8);"></span>
              <span>Molten</span>
            </button>
          </div>
        </div>
      `
          : ''
      }

      <div class="panel-section">
        <div class="section-header">
          <span class="section-title">${sectionName.toUpperCase()} CONTROLS</span>
        </div>

        <div class="controls-list">
          ${filteredKeys
            .map((key) => {
              const def = defs[key];
              const value = engineParams[key] ?? def.default;

              if (def.type === 'color') {
                return `
                  <div class="control-row color-control">
                    <label class="ctrl-label">${def.label}${modDot(key)}</label>
                    <div class="color-input-wrapper">
                      <input type="color" class="color-picker-input" data-param="${key}" value="${value}" />
                      <input type="text" class="color-hex-input" data-param-hex="${key}" value="${value}" maxlength="7" />
                    </div>
                  </div>
                `;
              } else if (def.type === 'select') {
                return `
                  <div class="control-row select-control">
                    <label class="ctrl-label">${def.label}${modDot(key)}</label>
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
                return `
                  <div class="control-row slider-control">
                    <div class="ctrl-label-row">
                      <label class="ctrl-label">${def.label}${modDot(key)}</label>
                      <span class="ctrl-value" id="val-${key}">${value}</span>
                    </div>
                    <input
                      type="range"
                      class="studio-slider"
                      data-param="${key}"
                      min="${def.min}"
                      max="${def.max}"
                      step="${def.step}"
                      value="${value}"
                    />
                  </div>
                `;
              }
            })
            .join('')}
        </div>
      </div>
    `;
  }

  renderOpticsTab() {
    const g = this.state.global;
    return `
      <div class="panel-section">
        <div class="section-header">
          <span class="section-title">UNREAL BLOOM</span>
        </div>

        <div class="controls-list">
          <div class="control-row slider-control">
            <div class="ctrl-label-row">
              <label class="ctrl-label">Bloom Strength</label>
              <span class="ctrl-value" id="val-bloomStrength">${g.bloomStrength}</span>
            </div>
            <input type="range" class="studio-slider" data-global="bloomStrength" min="0" max="2.5" step="0.05" value="${g.bloomStrength}" />
          </div>

          <div class="control-row slider-control">
            <div class="ctrl-label-row">
              <label class="ctrl-label">Bloom Radius</label>
              <span class="ctrl-value" id="val-bloomRadius">${g.bloomRadius}</span>
            </div>
            <input type="range" class="studio-slider" data-global="bloomRadius" min="0.0" max="1.0" step="0.02" value="${g.bloomRadius}" />
          </div>

          <div class="control-row slider-control">
            <div class="ctrl-label-row">
              <label class="ctrl-label">Bloom Threshold</label>
              <span class="ctrl-value" id="val-bloomThreshold">${g.bloomThreshold}</span>
            </div>
            <input type="range" class="studio-slider" data-global="bloomThreshold" min="0.0" max="0.5" step="0.01" value="${g.bloomThreshold}" />
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-header">
          <span class="section-title">TONE MAPPING & CAMERA</span>
        </div>

        <div class="controls-list">
          <div class="control-row slider-control">
            <div class="ctrl-label-row">
              <label class="ctrl-label">ACES Exposure</label>
              <span class="ctrl-value" id="val-exposure">${g.exposure}</span>
            </div>
            <input type="range" class="studio-slider" data-global="exposure" min="0.4" max="2.2" step="0.05" value="${g.exposure}" />
          </div>

          <div class="control-row slider-control">
            <div class="ctrl-label-row">
              <label class="ctrl-label">Camera Auto-Orbit</label>
              <span class="ctrl-value" id="val-autoRotateSpeed">${g.autoRotateSpeed}</span>
            </div>
            <input type="range" class="studio-slider" data-global="autoRotateSpeed" min="-5.0" max="5.0" step="0.1" value="${g.autoRotateSpeed}" />
          </div>

          <div class="control-row slider-control">
            <div class="ctrl-label-row">
              <label class="ctrl-label">Simulation Time Scale</label>
              <span class="ctrl-value" id="val-timeScale">${g.timeScale}</span>
            </div>
            <input type="range" class="studio-slider" data-global="timeScale" min="0.1" max="3.0" step="0.1" value="${g.timeScale}" />
          </div>
        </div>
      </div>
    `;
  }

  renderSpaceTab() {
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

  // --- Motion Lab -----------------------------------------------------------
  //
  // Every engine drives motion as `rate * linearTime`, so plain sliders can only
  // explore faster/slower. This tab is where shape comes from: sources (LFO,
  // noise, envelope) routed onto destinations.

  modConfig() {
    if (!this.state.modulation) this.state.modulation = createDefaultModulation();
    return this.state.modulation;
  }

  modDestinations() {
    const defs = ENGINE_PARAM_DEFINITIONS[this.state.engine] || {};
    // listModulationTargets() already excludes structural params (geometry
    // rebuilds) and rate params (phase jumps), so the dropdown cannot offer a
    // destination that would break the render.
    return [
      { key: TIME_SCALE_DEST, label: 'Tempo — hesitate / accelerate' },
      ...listModulationTargets(defs),
    ];
  }

  renderMotionLabTab() {
    const mod = this.modConfig();
    const dests = this.modDestinations();
    const src = mod.sources || {};
    const lfo = src.lfo1 || {};
    const noise = src.noise1 || {};
    const env = src.env1 || {};

    const slider = (attr, label, value, min, max, step) => `
      <div class="control-row slider-control">
        <label class="ctrl-label">${label}<span class="ctrl-value">${Number(value).toFixed(2)}</span></label>
        <input type="range" class="studio-slider" ${attr} min="${min}" max="${max}" step="${step}" value="${value}" />
      </div>`;

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
          <span class="section-meta">${(mod.routes || []).length} route(s)</span>
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
  upgradeCodePreview(embedCode) {
    if (!this.modalOverlay.querySelector('.code-preview')) return;
    ensureHighlighter().then((hl) => {
      if (!hl) return;
      // The modal may have been dismissed while the chunk was downloading.
      const current = this.modalOverlay.querySelector('.code-preview');
      if (!current) return;
      current.innerHTML = highlightJs(embedCode);
    });
  }

  attachMotionLabListeners() {
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

    this.root.querySelectorAll('[data-mod-src]').forEach((el) => {
      const id = el.getAttribute('data-mod-src');
      const field = el.getAttribute('data-mod-field');
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, (e) => {
        const raw = e.target.value;
        mod.sources[id][field] = field === 'shape' ? raw : Number(raw);
        const label = el.parentElement?.querySelector('.ctrl-value');
        if (label) label.textContent = Number(raw).toFixed(2);
        commit(false);
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

  // The exported config is the save format for a finding — dropping the
  // modulation block would lose the half of the design that makes it move.
  exportConfig() {
    return {
      engine: this.state.engine,
      global: this.state.global,
      params: this.state.engines[this.state.engine],
      modulation: this.state.modulation,
    };
  }

  renderExportTab() {
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

  renderPerfTab() {
    const g = this.state.global;
    return `
      <div class="panel-section">
        <div class="section-header">
          <span class="section-title">RENDER QUALITY & DPR</span>
        </div>

        <div class="controls-list">
          <div class="control-row select-control">
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
          <div class="hotkey-row"><kbd>Space</kbd> <span>Pause / Play animation</span></div>
          <div class="hotkey-row"><kbd>R</kbd> <span>Randomize color palette & math</span></div>
          <div class="hotkey-row"><kbd>H</kbd> <span>Toggle Zen Mode (hide UI)</span></div>
          <div class="hotkey-row"><kbd>S</kbd> <span>Quick PNG snapshot</span></div>
          <div class="hotkey-row"><kbd>Esc</kbd> <span>Close active modal</span></div>
        </div>
      </div>
    `;
  }

  attachControlListeners() {
    // Presets click
    this.root.querySelectorAll('.preset-card').forEach((card) => {
      card.addEventListener('click', () => {
        const name = card.getAttribute('data-preset-name');
        const preset = PRESET_LIBRARY.find((p) => p.name === name);
        if (preset) {
          this.state.activePresetName = preset.name;
          Object.assign(this.state.global, preset.global);
          Object.assign(this.state.engines[this.state.engine], preset.params);
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
      this.state.activePresetName = name;
      this.render();
    });

    // Load custom preset
    this.root.querySelectorAll('[data-load-custom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-load-custom');
        const list = loadSavedPresets();
        const found = list.find((p) => p.name === name);
        if (found) {
          this.state.activePresetName = found.name;
          Object.assign(this.state.global, found.global);
          Object.assign(this.state.engines[this.state.engine], found.params);
          // Optional: presets saved before the Motion Lab existed have no
          // modulation block, and should keep whatever rack is currently set.
          if (found.modulation) this.state.modulation = structuredClone(found.modulation);
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

    // Sliders
    this.root.querySelectorAll('input[type="range"][data-param]').forEach((slider) => {
      const key = slider.getAttribute('data-param');
      slider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        this.state.engines[this.state.engine][key] = val;
        const valLabel = this.root.querySelector(`#val-${key}`);
        if (valLabel) valLabel.textContent = val;
        this.onStateChange(this.state);
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

    // Color Harmonies Quick Chips
    const PALETTES = {
      cosmic: { color1: '#057eff', color2: '#a855f7', color3: '#00f2fe', colorShell: '#00f2fe', wireColor: '#00f2fe', cellColor: '#a855f7' },
      solar: { color1: '#ff5500', color2: '#ff0055', color3: '#ffc400', colorShell: '#ffc400', wireColor: '#ffed00', cellColor: '#ff5500' },
      cyber: { color1: '#059669', color2: '#06b6d4', color3: '#10b981', colorShell: '#10b981', wireColor: '#10b981', cellColor: '#06b6d4' },
      rose: { color1: '#f43f5e', color2: '#fb923c', color3: '#fda4af', colorShell: '#fda4af', wireColor: '#fda4af', cellColor: '#f43f5e' },
      cryo: { color1: '#00f0ff', color2: '#38bdf8', color3: '#e0f2fe', colorShell: '#e0f2fe', wireColor: '#00f0ff', cellColor: '#38bdf8' },
      molten: { color1: '#ffed00', color2: '#ef4444', color3: '#38bdf8', colorShell: '#ffed00', wireColor: '#ffed00', cellColor: '#ef4444' },
    };

    this.root.querySelectorAll('.palette-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pKey = btn.getAttribute('data-palette');
        const pal = PALETTES[pKey];
        if (pal) {
          const engineParams = this.state.engines[this.state.engine];
          for (const [k, v] of Object.entries(pal)) {
            if (engineParams[k] !== undefined) {
              engineParams[k] = v;
            }
          }
          this.onStateChange(this.state);
          this.render();
        }
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

    // Global sliders
    this.root.querySelectorAll('input[type="range"][data-global]').forEach((slider) => {
      const key = slider.getAttribute('data-global');
      slider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        // timeScale carries direction in its sign, so it has to go through the
        // playback path rather than being written raw.
        if (key === 'timeScale') {
          this.setPlaybackSpeed(val);
          this.onStateChange(this.state);
          return;
        }
        this.state.global[key] = val;
        const valLabel = this.root.querySelector(`#val-${key}`);
        if (valLabel) valLabel.textContent = val;
        this.onStateChange(this.state);
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
      this.studio.captureSnapshot({ transparent: trans, multiplier: 1 });
    });

    this.root.querySelector('#btn-quick-snap-4k')?.addEventListener('click', () => {
      const trans = this.root.querySelector('#snap-trans-tab')?.checked;
      this.studio.captureSnapshot({ transparent: trans, multiplier: 2 });
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

  openExportModal() {
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
          <div class="modal-tab-pane" id="pane-code">
            <div class="code-preview custom-scroll">${highlightJs(embedCode)}</div>
            <div class="modal-footer-row">
              <button class="btn-primary" id="btn-copy-code">Copy Three.js Code</button>
            </div>
          </div>

          <!-- TAB 2: JSON -->
          <div class="modal-tab-pane hidden" id="pane-json">
            <textarea class="json-textarea custom-scroll" id="export-json-area">${jsonStr}</textarea>
            <div class="modal-footer-row">
              <button class="btn-primary" id="btn-copy-json">Copy JSON</button>
              <button class="btn-secondary" id="btn-download-json">Download .json</button>
              <button class="btn-accent" id="btn-import-json">Load from Textarea</button>
            </div>
          </div>

          <!-- TAB 3: SNAPSHOT -->
          <div class="modal-tab-pane hidden" id="pane-snapshot">
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
    this.modalOverlay.querySelector('#btn-import-json')?.addEventListener('click', (e) => {
      try {
        const area = this.modalOverlay.querySelector('#export-json-area');
        const parsed = JSON.parse(area.value);
        if (parsed.engine && parsed.params) {
          this.state.engine = parsed.engine;
          if (parsed.global) Object.assign(this.state.global, parsed.global);
          this.state.engines[parsed.engine] = parsed.params;
          this.onStateChange(this.state);
          this.render();
          this.closeModal();
        } else {
          alert('Invalid format. JSON must have "engine" and "params".');
        }
      } catch (err) {
        alert('Invalid JSON syntax.');
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
      this.studio.captureSnapshot({ transparent: trans, multiplier: chosenScale });
    });
  }

  closeModal() {
    this.modalOverlay.classList.add('hidden');
  }

  generateEmbedSnippet() {
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

  updateFps(fps) {
    const fpsLabel = this.root.querySelector('#fps-counter');
    const fpsDot = this.root.querySelector('#fps-dot');
    if (fpsLabel) {
      fpsLabel.textContent = `${Math.round(fps)} FPS`;
    }
    if (fpsDot) {
      fpsDot.style.background = fps >= 48 ? '#10b981' : fps >= 30 ? '#f59e0b' : '#ef4444';
    }
  }
}
