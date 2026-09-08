import { createAbCompare, normalizeSnapshot } from '../core/ab-compare.js';
import { EASING_NAMES } from '../core/easing.js';

const TRANSITION_DURATIONS = [0, 200, 400, 900];

export function createAbSession({ studio, state, ui }) {
  let transitionIndex = 2;
  let transitionEasing = 'easeOut';

  const ab = createAbCompare(studio, state, {
    getTransition: () => ({
      durationMs: TRANSITION_DURATIONS[transitionIndex],
      easing: transitionEasing,
    }),
  });

  const host = ui.abReadout;

  // Name the slot that is still empty, rather than assuming A is always filled
  // first — pressing 2 before 1 used to produce "press 2 to fill B".
  function hint() {
    const empty = ['a', 'b'].find((slot) => !ab.has(slot));
    if (!empty) {
      const ms = TRANSITION_DURATIONS[transitionIndex];
      return `\` to swap · ${ms === 0 ? 'cut' : `${ms}ms ${transitionEasing}`} · D/F to change`;
    }
    return `press ${empty === 'a' ? '1' : '2'} to fill ${empty.toUpperCase()}`;
  }

  function refresh(justSwapped = false) {
    const filled = ['a', 'b'].filter((slot) => ab.has(slot));
    if (!filled.length) {
      host.classList.add('hidden');
      return;
    }
    host.classList.remove('hidden');
    host.innerHTML = ['a', 'b']
      .map((slot) => {
        const stored = ab.has(slot);
        const active = ab.activeSlot === slot && stored;
        return `<span class="ab-slot ${active ? 'active' : ''} ${stored ? '' : 'empty'}">${slot.toUpperCase()}</span>`;
      })
      .join('') + `<span class="ab-hint">${hint()}</span>`;

    if (justSwapped) {
      host.classList.remove('flash');
      // Force a reflow so the animation restarts on every swap.
      void host.offsetWidth;
      host.classList.add('flash');
    }
  }

  function compareFindings(first, second) {
    // Resolve both inputs before touching either slot, so one corrupt shelf
    // entry cannot leave a half-updated comparison behind.
    const a = normalizeSnapshot(first);
    const b = normalizeSnapshot(second);
    if (!a || !b || !state.engines[a.engine] || !state.engines[b.engine]) return false;
    if (!ab.stash('a', a) || !ab.stash('b', b)) return false;
    if (!ab.activate('a')) return false;
    ui.render();
    refresh(true);
    return true;
  }

  return {
    mount() {},
    bind() {
      return {
        ab,
        compareFindings,
        onKey(e) {
          // Skipped in grid mode, where digits and backquote are free for
          // future cell selection and the single-orb view isn't on screen anyway.
          if (studio.isGridMode) return false;
          if (e.code === 'Digit1' || e.code === 'Digit2') {
            e.preventDefault();
            ab.store(e.code === 'Digit1' ? 'a' : 'b');
            refresh();
            return true;
          }
          if (e.code === 'Backquote') {
            e.preventDefault();
            const now = ab.swap();
            if (now) {
              ui.render();
              refresh(true);
            }
            return true;
          }
          if (e.code === 'KeyD') {
            e.preventDefault();
            transitionIndex = (transitionIndex + 1) % TRANSITION_DURATIONS.length;
            refresh();
            return true;
          }
          if (e.code === 'KeyF') {
            e.preventDefault();
            const i = EASING_NAMES.indexOf(transitionEasing);
            transitionEasing = EASING_NAMES[(i + 1) % EASING_NAMES.length];
            refresh();
            return true;
          }
          return false;
        },
      };
    },
    dispose() {},
  };
}
