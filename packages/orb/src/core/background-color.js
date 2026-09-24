// A picked background colour as display sRGB components, 0..1, exactly as
// typed. Deliberately not a THREE.Color: colour management would convert the
// hex to linear, and the value is composited after tone mapping and sRGB
// encoding, where it has to arrive unchanged. Pure, so Node can test it.
export function backgroundComponents(hex) {
  if (typeof hex !== 'string') return null;
  let digits = hex.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(digits)) digits = [...digits].map((d) => d + d).join('');
  if (!/^[0-9a-f]{6}$/.test(digits)) return null;
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255);
}
