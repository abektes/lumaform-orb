// Named easing curves for parameter tweens.
//
// All map 0 -> 0 and 1 -> 1. `spring` is allowed to exceed 1 in between: that
// overshoot is what makes a transition read as physical rather than mechanical,
// so it is a feature and callers must tolerate values above 1 mid-flight.

export const EASINGS = {
  linear: (t) => t,

  easeOut: (t) => 1 - Math.pow(1 - t, 3),

  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),

  // Damped oscillation, pinned to exactly 1 at t = 1.
  spring: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - Math.pow(2, -10 * t) * Math.cos((t * 10 - 0.75) * ((2 * Math.PI) / 3));
  },

  // Most of the distance in the first third, then a long settle. Reads as
  // "reacted immediately, then thought about it".
  snap: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - Math.pow(1 - t, 6);
  },
};

export const EASING_NAMES = ['linear', 'easeOut', 'easeInOut', 'spring', 'snap'];

export function applyEasing(name, t) {
  return (EASINGS[name] || EASINGS.linear)(t);
}
