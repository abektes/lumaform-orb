// What a consumer gets when they ask for nothing.
//
// Pulled out of the constructor so the defaults are testable without a WebGL
// context. They are the part of the runtime most likely to drift back towards
// the studio's needs, because the studio is the loudest caller and the only one
// in this repo — and a default chosen for the loudest caller is how an embed
// ends up with drag-to-rotate it never asked for.
//
// The rule: every default here is the quiet one. Off, still, cheap. A host that
// wants more says so, and saying so is discoverable. A host cannot discover
// that a default was picked for somebody else.
export const EMBED_DEFAULTS = Object.freeze({
  // Drag-to-rotate on an ambient orb is usually a misclick, not a feature.
  controls: false,
  // Motion belongs to the engine, not the camera.
  autoRotate: false,
  // Only consulted when controls are on.
  enableZoom: true,
  // Keeps the frame alive after compositing, which costs memory and bandwidth
  // on every frame. Only a caller reading pixels back needs it.
  preserveDrawingBuffer: false,
});

export function resolveRuntimeOptions(options = {}) {
  const source = options && typeof options === 'object' ? options : {};
  const resolved = { ...EMBED_DEFAULTS };
  for (const key of Object.keys(EMBED_DEFAULTS)) {
    if (source[key] !== undefined) resolved[key] = !!source[key];
  }
  return resolved;
}
