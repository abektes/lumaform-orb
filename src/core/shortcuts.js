// The registry is both the keyboard map's content and a contract checked
// against the real handlers. Adding a bare-key binding without documenting it
// makes tests/shortcuts.test.mjs fail instead of silently hiding the control.

export const SHORTCUT_GROUPS = ['Playback', 'Explore', 'Compare', 'Capture', 'Grid'];

export const SHORTCUTS = [
  { code: 'Space', label: 'Play / pause', context: 'any', group: 'Playback' },
  { code: 'KeyP', label: 'Play / pause the rehearsal loop', context: 'single', group: 'Playback' },
  { code: 'KeyH', label: 'Hide the interface (zen mode)', context: 'any', group: 'Playback' },
  { code: 'Escape', label: 'Close the open dialog', context: 'any', group: 'Playback' },
  { code: 'Slash', label: 'Show or hide this list', context: 'any', group: 'Playback' },

  { code: 'KeyR', label: 'Randomize the current engine', context: 'any', group: 'Explore' },
  { code: 'KeyG', label: 'Variation grid — nine mutations at once', context: 'any', group: 'Explore' },
  { code: 'KeyK', label: 'Sweep strip — one parameter across five values', context: 'any', group: 'Explore' },

  { code: 'Digit1', label: 'Store the current orb in slot A', context: 'single', group: 'Compare' },
  { code: 'Digit2', label: 'Store the current orb in slot B', context: 'single', group: 'Compare' },
  { code: 'Backquote', label: 'Swap A ↔ B without restarting the animation', context: 'single', group: 'Compare' },
  { code: 'KeyD', label: 'Cycle the swap duration', context: 'single', group: 'Compare' },
  { code: 'KeyF', label: 'Cycle the swap curve', context: 'single', group: 'Compare' },

  { code: 'KeyC', label: 'Keep this orb as a finding', context: 'single', group: 'Capture' },
  { code: 'KeyS', label: 'PNG snapshot', context: 'any', group: 'Capture' },
  { code: 'KeyV', label: 'Start / stop recording a clip', context: 'any', group: 'Capture' },

  { code: 'KeyM', label: 'Cycle the mutation radius', context: 'grid', group: 'Grid' },
  { code: 'KeyT', label: 'Re-trigger every cell’s envelopes', context: 'grid', group: 'Grid' },
  { code: 'KeyE', label: 'Export the marked cells', context: 'grid', group: 'Grid' },
];

export const KNOWN_CODES = new Set(SHORTCUTS.map((shortcut) => shortcut.code));

const NAMED_KEYS = {
  Space: 'Space',
  Escape: 'Esc',
  Backquote: '`',
  // The handler sees the physical Slash key, but Shift makes the visible
  // character and the user's mental model a question mark.
  Slash: '?',
};

export function formatKey(code) {
  if (NAMED_KEYS[code]) return NAMED_KEYS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function shortcutsInGroup(group) {
  return SHORTCUTS.filter((shortcut) => shortcut.group === group);
}
