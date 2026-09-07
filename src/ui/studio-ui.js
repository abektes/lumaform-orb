import {
  ENGINE_TYPES,
  ENGINE_INFO,
  ENGINE_PARAM_DEFINITIONS,
  DEFAULT_GLOBAL_SETTINGS,
  randomizeState,
  loadSavedPresets,
  saveCustomPreset,
  deleteCustomPreset,
} from '../core/state.js';
import { PRESET_LIBRARY } from '../presets/preset-library.js';
import { parseConfigFile, applyConfig } from '../core/config-io.js';
import { createFindingsStore, makeFinding } from '../core/findings.js';
import { makeStep, totalDuration } from '../core/sequence.js';
import { formatParamValue, parseParamValue, isAtDefault } from '../core/param-format.js';
import { EASING_NAMES } from '../core/easing.js';
import { SHORTCUT_GROUPS, formatKey, shortcutsInGroup } from '../core/shortcuts.js';
import { PALETTES, PALETTE_KEYS, applyPalette } from '../core/palette.js';
import { highlightJs, ensureHighlighter } from './highlight.js';
import {
  LFO_SHAPES,
  TIME_SCALE_DEST,
  listModulationTargets,
  createDefaultModulation,
} from '../core/modulation.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function safeThumbnail(value) {
  const src = String(value ?? '');
  return /^data:image\/(?:jpeg|png);base64,/i.test(src) ? escapeHtml(src) : '';
}

// Globals do not have an engine schema, so their row metadata lives here once
// and is shared by rendering and listeners. Defaults still come from state.js.
const GLOBAL_NUMBER_DEFINITIONS = {
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
    const validTabs = ['presets', 'findings', 'rehearsal', 'colors', 'geometry', 'motion', 'motionlab', 'optics', 'space', 'export', 'perf'];
    this.activeTab = validTabs.includes(reqTab) ? reqTab : 'presets';
    this.initialOpenDropdown = urlParams?.get('openDropdown') === 'true';
    this.isZenMode = false;
    this.isSidebarOpen = true;
    let findingsStorage = null;
    try {
      findingsStorage = window.localStorage;
    } catch (err) {
      console.warn('Findings storage is unavailable', err);
    }
    this.findings = createFindingsStore(findingsStorage);
    // A rehearsal is a scratch arrangement. Findings are durable; this ordering
    // remains intentionally session-local until exploration reveals a format
    // worth preserving.
    this.sequence = [];
    this.activeSequenceIndex = -1;
    this.studio.onSequenceStep = ({ index }) => {
      this.activeSequenceIndex = index;
      this.root.querySelectorAll('[data-seq-step]').forEach((element) => {
        element.classList.toggle(
          'playing',
          Number(element.getAttribute('data-seq-step')) === index
        );
      });
    };
    this.studio.onSequenceStop = () => {
      this.activeSequenceIndex = -1;
      this.updateRehearsalPlaybackUi();
    };
    // Selection describes the current comparison, not persistent shelf data.
    // It is capped at two because its consumer has exactly two slots.
    this.selectedFindings = new Set();
    this.onCompareFindings = null;
    this.onBreedFinding = null;
    this.onToggleShortcuts = null;
    this.onCloseShortcuts = null;

    this.initElements();
    this.bindEvents();
    this.render();
  }

  initElements() {
    this.root = document.createElement('div');
    this.root.className = 'studio-ui-root';
    this.container.appendChild(this.root);

    // Two layers inside the root, because .studio-ui-root is a positioned
    // element with a z-index and therefore forms a stacking context — anything
    // mounted outside it (as these overlays previously were, to survive
    // render()) outranks the whole panel subtree no matter how high the panel's
    // own z-index is. That is what put the grid HUD over the engine dropdown.
    //
    // overlayLayer is never rewritten, so long-lived chrome can live in it;
    // panelLayer is what render() replaces.
    this.overlayLayer = document.createElement('div');
    this.overlayLayer.className = 'studio-overlay-layer';
    this.root.appendChild(this.overlayLayer);

    this.panelLayer = document.createElement('div');
    this.panelLayer.className = 'studio-panel-layer';
    this.root.appendChild(this.panelLayer);

    // Modal container
    this.modalOverlay = document.createElement('div');
    this.modalOverlay.className = 'studio-modal-overlay hidden';
    this.container.appendChild(this.modalOverlay);
  }

  bindEvents() {
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // Selects and contenteditable controls are typing surfaces too. Letting a
      // bare shortcut through would re-render the panel and steal their focus.
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
        e.target.isContentEditable
      ) return;

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
        // The modal's body-level layer outranks the keyboard map, so dismiss it
        // first if both exist. Exactly one surface closes per key press.
        if (!this.modalOverlay.classList.contains('hidden')) {
          this.closeModal();
          return;
        }
        if (this.onCloseShortcuts?.()) return;
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
    // Overlays now live in root's overlayLayer, so the root rule hides them too.
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

    this.panelLayer.innerHTML = `
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
        <div class="inspector-tabs">
          <button class="tab-btn ${this.activeTab === 'presets' ? 'active' : ''}" data-tab="presets">Presets</button>
          <button class="tab-btn ${this.activeTab === 'findings' ? 'active' : ''}" data-tab="findings">Findings</button>
          <button class="tab-btn ${this.activeTab === 'rehearsal' ? 'active' : ''}" data-tab="rehearsal">Rehearsal</button>
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
    this.attachFindingsListeners();
    this.attachRehearsalListeners();
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

    // Stepping is the common case — cycling through eight engines by opening a
    // menu each time is slower than it needs to be.
    const stepEngine = (direction) => {
      const order = Object.values(ENGINE_TYPES);
      const index = order.indexOf(this.state.engine);
      const next = order[(index + direction + order.length) % order.length];
      if (next === this.state.engine) return;
      this.state.engine = next;
      this.onStateChange(this.state);
      this.render();
    };
    this.root.querySelector('#engine-prev')?.addEventListener('click', () => stepEngine(-1));
    this.root.querySelector('#engine-next')?.addEventListener('click', () => stepEngine(1));

    this.root.querySelector('#btn-randomize')?.addEventListener('click', () => this.handleRandomize());
    this.root.querySelector('#btn-playpause')?.addEventListener('click', () => this.togglePlayPause());
    this.root.querySelector('#btn-reset-cam')?.addEventListener('click', () => this.studio.resetCamera());
    this.root.querySelector('#btn-snapshot')?.addEventListener('click', () => this.studio.captureSnapshot());
    this.root.querySelector('#btn-export')?.addEventListener('click', () => {
      this.activeTab = 'export';
      this.render();
    });
    this.root.querySelector('#btn-grid')?.addEventListener('click', () => this.onToggleGrid?.());
    this.root.querySelector('#btn-shortcuts')?.addEventListener('click', () => this.onToggleShortcuts?.());
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
    const motionSlider = this.root.querySelector('input[data-global="timeScale"]');
    if (motionSlider) {
      motionSlider.value = magnitude;
      this.syncNumberRow(
        motionSlider.closest('.param-row'),
        magnitude,
        GLOBAL_NUMBER_DEFINITIONS.timeScale,
        signed
      );
    }

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
      case 'findings':
        return this.renderFindingsTab();
      case 'rehearsal':
        return this.renderRehearsalTab();
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

  modDot(key) {
    const mod = this.state.modulation;
    const driven = mod?.enabled
      && (mod.routes || []).some((route) => route.enabled !== false && route.dest === key);
    return driven ? '<span class="mod-dot" title="Driven by modulation"></span>' : '';
  }

  // Engine and global numeric controls use the same markup. Scope is carried on
  // the row so equal key names never make one control synchronize another.
  renderNumberRow({ key, def, value, attr, scope, defaultComparisonValue = value }) {
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

  numberDefinition(scope, key) {
    if (scope === 'global') return GLOBAL_NUMBER_DEFINITIONS[key] || {};
    return (ENGINE_PARAM_DEFINITIONS[this.state.engine] || {})[key] || {};
  }

  numberValue(scope, key) {
    if (scope === 'global') {
      // Direction has its own dock control; the inspector row edits magnitude.
      return key === 'timeScale'
        ? Math.abs(this.state.global[key])
        : this.state.global[key];
    }
    return this.state.engines[this.state.engine][key];
  }

  numberDefaultComparisonValue(scope, key) {
    if (scope === 'global') return this.state.global[key];
    return this.state.engines[this.state.engine][key];
  }

  writeNumberValue(scope, key, value, { reset = false } = {}) {
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

  syncNumberRow(row, value, def, defaultComparisonValue = value) {
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

  renderParamsSection(sectionName) {
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

  renderOpticsTab() {
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
  // noise, envelope, audio) routed onto destinations.

  modConfig() {
    if (!this.state.modulation) this.state.modulation = createDefaultModulation();
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
          <div class="control-row">
            <label class="ctrl-label">Audio Input</label>
            <div class="audio-input-row">
              <button class="btn-sm ${this.studio.audioInput?.mode === 'mic' ? 'btn-accent' : ''}" id="btn-audio-mic">Mic</button>
              <button class="btn-sm ${this.studio.audioInput?.mode === 'tone' ? 'btn-accent' : ''}" id="btn-audio-tone">Test Tone</button>
              <button class="btn-sm" id="btn-audio-off">Off</button>
            </div>
          </div>
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

    this.root.querySelector('#btn-audio-mic')?.addEventListener('click', async () => {
      const started = await this.studio.enableAudio('mic');
      if (!started) alert('Could not access the microphone. Check the browser permission prompt.');
      mod.enabled = true;
      commit(true);
    });

    this.root.querySelector('#btn-audio-tone')?.addEventListener('click', async () => {
      await this.studio.enableAudio('tone');
      mod.enabled = true;
      commit(true);
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
  // and picking between them is a job for a future gallery.
  importConfigText(text) {
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

    this.state.activePresetName = 'Imported Config';
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
  requestSnapshot(options) {
    const blocked = this.studio.snapshotBlockedReason(options);
    if (blocked) {
      alert(blocked);
      return null;
    }
    return this.studio.captureSnapshot(options);
  }

  // A finding is the exported config plus a thumbnail, so the shelf can be
  // browsed by eye rather than by timestamp.
  saveFinding(note = '') {
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

  selectedEntries(entries = this.findings.list()) {
    const available = new Set(entries.map((entry) => String(entry.id)));
    for (const id of this.selectedFindings) {
      if (!available.has(id)) this.selectedFindings.delete(id);
    }
    // Shelf order, rather than click order, makes the top selection A.
    return entries.filter((entry) => this.selectedFindings.has(String(entry.id)));
  }

  renderFindingsSelectionBar() {
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

  updateRehearsalPlaybackUi() {
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

  toggleSequencePlayback() {
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

  stopSequencePlayback() {
    this.studio.stopSequence();
    if (this.activeTab === 'rehearsal') this.render();
  }

  renderRehearsalTab() {
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

  attachRehearsalListeners() {
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

  renderFindingsTab() {
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

  attachFindingsListeners() {
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
