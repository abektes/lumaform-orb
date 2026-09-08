import {
  ENGINE_TYPES,
  ENGINE_INFO,
  randomizeState,
} from '../core/state.js';
import { createFindingsStore } from '../core/findings.js';
import { ICONS } from './icons.js';
import { GLOBAL_NUMBER_DEFINITIONS } from './studio-format.js';
import {
  defaultLastByMode,
  leafForModeSwitch,
  modeForLeaf,
  rememberSection,
  resolveLeaf,
} from './inspector-nav.js';
import { shellMarkup } from './studio-shell.js';
import {
  modDot,
  renderNumberRow,
  numberDefinition,
  numberValue,
  numberDefaultComparisonValue,
  writeNumberValue,
  syncNumberRow,
  renderParamsSection,
  renderOpticsTab,
  renderSpaceTab,
} from './studio-params.js';
import {
  renderPresetsTab,
  attachPresetListeners,
  importConfigText,
  requestSnapshot,
  saveFinding,
  selectedEntries,
  renderFindingsSelectionBar,
  updateRehearsalPlaybackUi,
  toggleSequencePlayback,
  stopSequencePlayback,
  renderRehearsalTab,
  attachRehearsalListeners,
  renderFindingsTab,
  attachFindingsListeners,
} from './studio-library.js';
import {
  modConfig,
  modDestinations,
  renderMotionLabTab,
  upgradeCodePreview,
  attachMotionLabListeners,
} from './studio-motion-lab.js';
import {
  exportConfig,
  renderExportTab,
  renderPerfTab,
  attachControlListeners,
  openExportModal,
  closeModal,
  generateEmbedSnippet,
} from './studio-export.js';

export class StudioUI {
  constructor(container, studio, store, onStateChange) {
    this.container = container;
    this.studio = studio;
    this.store = store;
    this.state = store.state;
    this.onStateChange = onStateChange;

    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    this.activeTab = resolveLeaf(urlParams?.get('tab'));
    this.activeMode = modeForLeaf(this.activeTab);
    this.lastSectionByMode = rememberSection(defaultLastByMode(), this.activeMode, this.activeTab);
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
    this.attachTopBarListeners();
    this.attachTabListeners();
    this.render();
  }

  initElements() {
    this.root = document.createElement('div');
    this.root.className = 'studio-ui-root';
    this.root.innerHTML = this.shellMarkup();
    this.container.appendChild(this.root);
    this.inspectorContent = this.root.querySelector('.inspector-content');
    this.inspectorContent.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-inspector-leaf]');
      if (!trigger || !this.inspectorContent.contains(trigger)) return;
      this.setInspectorDestination(trigger.getAttribute('data-inspector-leaf'));
    });

    // Session chrome lives on the root as siblings of the shell. Overlay
    // tokens sit below panel tokens, so these stay under the inspector
    // without a second stacking wrapper. Full-screen dialogs still mount
    // on the container so they can cover the root.
    this.clipIndicator = document.createElement('div');
    this.clipIndicator.className = 'clip-indicator hidden';
    this.abReadout = document.createElement('div');
    this.abReadout.className = 'ab-readout hidden';
    this.sweepCaption = document.createElement('div');
    this.sweepCaption.className = 'sweep-caption hidden';
    this.root.append(this.clipIndicator, this.abReadout, this.sweepCaption);

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

    // Close the engine dropdown on an outside click. Bound once — the trigger
    // and menu are part of the persistent shell and are not replaced by render().
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
    this.store.applyRandomize(randomizeState(this.state));
    this.onStateChange(this.state);
    this.render();
  }

  // The shell is built once. render() only rewrites tab content and patches
  // labels/classes on the chrome that already exists.
  render() {
    this.syncShell();
    this.inspectorContent.innerHTML = this.renderTabContent();
    this.attachPresetListeners();
    this.attachControlListeners();
    this.attachMotionLabListeners();
    this.attachFindingsListeners();
    this.attachRehearsalListeners();
  }

  syncShell() {
    const info = ENGINE_INFO[this.state.engine] || { name: this.state.engine, badge: '' };
    const nameEl = this.root.querySelector('.trigger-name');
    const badgeEl = this.root.querySelector('.trigger-badge');
    if (nameEl) nameEl.textContent = info.name;
    if (badgeEl) badgeEl.textContent = info.badge;

    this.root.querySelectorAll('.engine-dropdown-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-engine') === this.state.engine);
    });

    const statsBadge = this.root.querySelector('.stats-engine-label');
    if (statsBadge) statsBadge.textContent = info.badge || '';

    this.root.querySelector('#btn-grid')?.classList.toggle('active', !!this.studio.isGridMode);

    this.root.querySelectorAll('.mode-btn').forEach((btn) => {
      const selected = btn.getAttribute('data-mode') === this.activeMode;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });

    const sections = this.root.querySelector('.inspector-sections');
    const modeLabel = this.root.querySelector(`.mode-btn[data-mode="${this.activeMode}"]`)?.textContent;
    if (sections && modeLabel) sections.setAttribute('aria-label', modeLabel);

    this.root.querySelectorAll('.inspector-nav [data-tab]').forEach((btn) => {
      const selected = btn.getAttribute('data-tab') === this.activeTab;
      const inMode = btn.getAttribute('data-mode') === this.activeMode;
      btn.classList.toggle('active', selected);
      btn.toggleAttribute('hidden', !inMode);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });

    this.root.querySelector('.studio-inspector')?.classList.toggle('collapsed', !this.isSidebarOpen);

    this.updatePlayPauseBtn();
    this.applyTimeScale(this.state.global.timeScale);
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
            this.store.setEngine(newEngine);
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
      this.store.setEngine(next);
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
      this.setInspectorDestination('export', { reveal: true });
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
    this.root.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setInspectorMode(btn.getAttribute('data-mode'));
      });
    });
    this.root.querySelectorAll('.inspector-nav [data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setInspectorDestination(btn.getAttribute('data-tab'));
      });
    });
  }

  setInspectorMode(mode) {
    if (mode === this.activeMode) return;
    const next = leafForModeSwitch(this.lastSectionByMode, mode);
    this.activeMode = mode;
    this.activeTab = next;
    this.syncInspectorUrl(next);
    this.render();
  }

  setInspectorDestination(leaf, { reveal = false } = {}) {
    const next = resolveLeaf(leaf);
    const nextMode = modeForLeaf(next);
    if (reveal) this.isSidebarOpen = true;
    if (next === this.activeTab && nextMode === this.activeMode) {
      if (reveal) this.syncShell();
      return;
    }
    this.activeTab = next;
    this.activeMode = nextMode;
    this.lastSectionByMode = rememberSection(this.lastSectionByMode, this.activeMode, next);
    this.syncInspectorUrl(next);
    this.render();
  }

  syncInspectorUrl(leaf) {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', leaf);
    window.history.replaceState({}, '', url);
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

Object.assign(StudioUI.prototype, {
  shellMarkup,
  renderPresetsTab,
  attachPresetListeners,
  modDot,
  renderNumberRow,
  numberDefinition,
  numberValue,
  numberDefaultComparisonValue,
  writeNumberValue,
  syncNumberRow,
  renderParamsSection,
  renderOpticsTab,
  renderSpaceTab,
  modConfig,
  modDestinations,
  renderMotionLabTab,
  upgradeCodePreview,
  attachMotionLabListeners,
  importConfigText,
  requestSnapshot,
  saveFinding,
  selectedEntries,
  renderFindingsSelectionBar,
  updateRehearsalPlaybackUi,
  toggleSequencePlayback,
  stopSequencePlayback,
  renderRehearsalTab,
  attachRehearsalListeners,
  renderFindingsTab,
  attachFindingsListeners,
  exportConfig,
  renderExportTab,
  renderPerfTab,
  attachControlListeners,
  openExportModal,
  closeModal,
  generateEmbedSnippet,
});
