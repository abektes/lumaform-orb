import { SHORTCUT_GROUPS, shortcutsInGroup, formatKey } from '../core/shortcuts.js';

const CONTEXT_NOTE = {
  any: '',
  single: 'in the single-orb view',
  grid: 'in the grid',
};

// The registry is static, so the map is rendered and wired once rather than
// rebuilding a dialog and its listeners on every toggle.
export function createShortcutsOverlay() {
  const element = document.createElement('div');
  element.className = 'shortcuts-overlay hidden';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-labelledby', 'shortcuts-title');

  const columns = SHORTCUT_GROUPS.map((group) => `
    <section class="shortcuts-group">
      <h3>${group}</h3>
      ${shortcutsInGroup(group).map((shortcut) => {
        const context = CONTEXT_NOTE[shortcut.context];
        return `
          <div class="shortcut-row">
            <kbd>${formatKey(shortcut.code)}</kbd>
            <span>${shortcut.label}${context ? ` <em>${context}</em>` : ''}</span>
          </div>
        `;
      }).join('')}
    </section>
  `).join('');

  element.innerHTML = `
    <div class="shortcuts-card">
      <div class="shortcuts-head">
        <span class="shortcuts-title" id="shortcuts-title">KEYBOARD</span>
        <button class="cp-delete-btn" data-shortcuts-close aria-label="Close keyboard shortcuts" title="Close">✕</button>
      </div>
      <div class="shortcuts-columns">${columns}</div>
      <div class="shortcuts-foot">Shortcuts are ignored while you are typing in a field.</div>
    </div>
  `;

  let open = false;

  function hide() {
    open = false;
    element.classList.add('hidden');
  }

  function show() {
    open = true;
    element.classList.remove('hidden');
  }

  element.querySelector('[data-shortcuts-close]').addEventListener('click', hide);
  element.addEventListener('click', (event) => {
    if (event.target === element) hide();
  });

  return {
    element,
    show,
    hide,
    toggle() {
      if (open) hide();
      else show();
    },
    get isOpen() {
      return open;
    },
  };
}
