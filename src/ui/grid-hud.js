// On-screen controls for grid mode.
//
// Grid mode hides the inspector and the playback dock because they cover the
// cells, which left mutation radius on a hidden keybinding and section locking
// unreachable. This bar is mounted only while the grid is up.

import {
  ALL_SECTIONS,
  BREADTH_OPTIONS,
  DEFAULT_BREADTH,
  RADIUS_STEPS,
  breadthLabel,
  cycleBreadth,
  nextRadius,
  sectionsForMutation,
  toggleSection,
} from './grid-hud-state.js';

const SECTION_LABELS = {
  colors: 'Colours',
  geometry: 'Geometry',
  motion: 'Motion',
};

export function createGridHud({
  initialSections = [...ALL_SECTIONS],
  initialRadius = RADIUS_STEPS[1],
  initialBreadth = DEFAULT_BREADTH,
  initialBreedPatch = true,
  onChange = () => {},
  onReseed = () => {},
  onExport = () => {},
  onExit = () => {},
} = {}) {
  let sections = [...initialSections];
  let radius = initialRadius;
  let breadth = BREADTH_OPTIONS.includes(initialBreadth) ? initialBreadth : DEFAULT_BREADTH;
  let breedPatch = initialBreedPatch !== false;
  let marked = 0;

  const element = document.createElement('div');
  element.className = 'grid-hud';

  function radiusLabel(value) {
    if (value <= 0.15) return 'Subtle';
    if (value <= 0.3) return 'Medium';
    return 'Wild';
  }

  function render() {
    element.innerHTML = `
      <div class="grid-hud-group">
        <span class="grid-hud-label">Mutate</span>
        ${ALL_SECTIONS.map(
          (name) => `
          <button class="grid-hud-chip ${sections.includes(name) ? 'active' : ''}"
                  data-section="${name}">${SECTION_LABELS[name]}</button>`
        ).join('')}
        <button class="grid-hud-chip ${breedPatch ? 'active' : ''}"
                id="grid-hud-patch">Patch</button>
      </div>

      <div class="grid-hud-sep"></div>

      <div class="grid-hud-group">
        <span class="grid-hud-label">Radius</span>
        <button class="grid-hud-chip active" id="grid-hud-radius" title="Cycle mutation radius (M)">
          ${radiusLabel(radius)} · ${radius.toFixed(2)}
        </button>
      </div>

      <div class="grid-hud-sep"></div>

      <div class="grid-hud-group">
        <span class="grid-hud-label">Vary</span>
        <button class="grid-hud-chip active" id="grid-hud-breadth"
                title="Cycle how many parameters vary (B)">
          ${breadthLabel(breadth)}
        </button>
      </div>

      <div class="grid-hud-sep"></div>

      <div class="grid-hud-group">
        <button class="grid-hud-btn" id="grid-hud-reseed" title="Re-breed all cells">Re-breed</button>
        <button class="grid-hud-btn" id="grid-hud-export" title="Download marked cells (E)">
          Export <span class="grid-hud-count" id="grid-hud-count">${marked}</span>
        </button>
        <button class="grid-hud-btn" id="grid-hud-exit" title="Leave grid mode (G)">Exit</button>
      </div>

      <div class="grid-hud-hint">Click a cell to promote · Shift-click to mark · T fires envelopes</div>
    `;

    element.querySelectorAll('[data-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = toggleSection(sections, btn.getAttribute('data-section'));
        // At least one of parameter or patch mutation must remain enabled.
        if (!next.length && !breedPatch) return;
        sections = next;
        render();
        emit();
      });
    });

    element.querySelector('#grid-hud-patch')?.addEventListener('click', () => {
      if (breedPatch && !sections.length) return;
      breedPatch = !breedPatch;
      render();
      emit();
    });

    element.querySelector('#grid-hud-radius')?.addEventListener('click', () => {
      radius = nextRadius(radius);
      render();
      emit();
    });

    element.querySelector('#grid-hud-breadth')?.addEventListener('click', () => {
      breadth = cycleBreadth(breadth);
      render();
      emit();
    });

    element.querySelector('#grid-hud-reseed')?.addEventListener('click', () => onReseed());
    element.querySelector('#grid-hud-export')?.addEventListener('click', () => onExport());
    element.querySelector('#grid-hud-exit')?.addEventListener('click', () => onExit());
  }

  function emit() {
    onChange({
      sections: sectionsForMutation(sections),
      radius,
      breadth,
      breedPatch,
    });
  }

  render();

  return {
    element,
    get radius() {
      return radius;
    },
    setRadius(value) {
      radius = value;
      render();
    },
    get breadth() {
      return breadth;
    },
    setBreadth(value) {
      breadth = BREADTH_OPTIONS.includes(value) ? value : DEFAULT_BREADTH;
      render();
    },
    setMarked(count) {
      marked = count;
      const el = element.querySelector('#grid-hud-count');
      if (el) el.textContent = String(count);
    },
    destroy() {
      element.remove();
    },
  };
}
