// One dispatch for the engine contract. The studio used to prefer
// onParamsChange in some paths and setParams in others; the grid flipped that
// order. Nebula bound both names to the same function, which hid the split.
// Click also fired onPulse and onPointerClick, so an incrementing pulse doubled.

export function notifyEngine(engine, method, ...args) {
  if (!engine) return;
  const fn = engine[method];
  if (typeof fn === 'function') fn.apply(engine, args);
}

export function notifyParams(engine, patch) {
  notifyEngine(engine, 'setParams', patch);
}

export function notifyPulse(engine) {
  notifyEngine(engine, 'onPulse');
}

export function notifyResize(engine, width, height) {
  notifyEngine(engine, 'onResize', width, height);
}
