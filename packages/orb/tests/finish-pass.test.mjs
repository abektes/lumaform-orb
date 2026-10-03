// The finish pass must be invisible until asked for: every existing config
// renders identically, and the pass costs nothing while it is at identity.
import {
  FINISH_DEFAULTS, resolveFinish, isIdentityFinish, createFinishPass, contrastCurve,
} from '../src/core/finish-pass.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

ok('defaults are identity', isIdentityFinish(FINISH_DEFAULTS, { transparent: false }));
ok('contrast off identity', !isIdentityFinish({ ...FINISH_DEFAULTS, contrast: 1.2 }, { transparent: false }));
ok('lightCoverage is ignored on an opaque background',
  isIdentityFinish({ ...FINISH_DEFAULTS, lightCoverage: 0.5 }, { transparent: false }));
ok('lightCoverage counts on a transparent one',
  !isIdentityFinish({ ...FINISH_DEFAULTS, lightCoverage: 0.5 }, { transparent: true }));

ok('edgeFade alone is non-identity', !isIdentityFinish({ ...FINISH_DEFAULTS, edgeFade: 0.3 }, { transparent: false }));
ok('grain alone is non-identity', !isIdentityFinish({ ...FINISH_DEFAULTS, grain: 0.05 }, { transparent: false }));

const resolved = resolveFinish(FINISH_DEFAULTS, { contrast: 9, grain: -1, saturation: 'x', unrelated: 5 });
ok('clamps to the top of a range', resolved.contrast === 2);
ok('clamps to the bottom of a range', resolved.grain === 0);
ok('ignores non-numbers', resolved.saturation === 1);
ok('ignores keys it does not own', !('unrelated' in resolved));
ok('does not mutate its input', FINISH_DEFAULTS.contrast === 1);

const finish = createFinishPass();
ok('the pass starts disabled', finish.pass.enabled === false);
finish.set({ contrast: 1.3, saturation: 0.6 }, { transparent: false });
ok('a non-identity setting enables it', finish.pass.enabled === true);
const u = finish.pass.material.uniforms;
ok('contrast reaches its uniform', u.uContrast.value === 1.3);
ok('saturation reaches its uniform', u.uSaturation.value === 0.6);
finish.set({ lightCoverage: 0.7 }, { transparent: false });
ok('lightCoverage is zeroed when opaque', u.uLightCoverage.value === 0);
finish.set({}, { transparent: true });
ok('lightCoverage applies when transparent', u.uLightCoverage.value === 0.7);
finish.set({ contrast: 1, saturation: 1, lightCoverage: 0 }, { transparent: true });
ok('back to identity disables it', finish.pass.enabled === false);

finish.frame({ center: [0.4, 0.6], radius: 0.8, aspect: 1.5, seed: 3 });
ok('frame sets the centre', u.uCenter.value.x === 0.4 && u.uCenter.value.y === 0.6);
ok('frame sets the radius and aspect', u.uRadius.value === 0.8 && u.uAspect.value === 1.5);

// An omitted `transparent` keeps the previous mode; partial patches are sticky.
finish.set({ lightCoverage: 0.4 }, { transparent: true });
finish.set({ contrast: 1.2 });
ok('omitted transparent keeps the previous mode', u.uLightCoverage.value === 0.4);
ok('omitted transparent still applies the patch', u.uContrast.value === 1.2);

// contrastCurve mirrors the GLSL, which Node cannot run.
const xs = [0, 0.05, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.95, 1];
ok('curve is the identity at k=1', xs.every((x) => Math.abs(contrastCurve(x, 1) - x) < 1e-5));
// The curve clamps its input to [1e-6, 1-1e-6] (see the shader), so the ends
// sit within eps^min(k,1) of 0 and 1: 1e-6 at k>=1, 1e-3 at k=0.5.
ok('curve fixes the endpoints', [0.5, 1, 2].every((k) => {
  const tol = 2 * Math.pow(1e-6, Math.min(k, 1));
  return Math.abs(contrastCurve(0, k)) < tol && Math.abs(contrastCurve(1, k) - 1) < tol;
}));
ok('curve passes through mid-grey', [0.5, 1, 2].every((k) => Math.abs(contrastCurve(0.5, k) - 0.5) < 1e-12));
ok('curve is steeper than linear near 0.5 at k=2',
  (contrastCurve(0.55, 2) - contrastCurve(0.45, 2)) / 0.1 > 1);
ok('curve flattens at k<1', (contrastCurve(0.55, 0.5) - contrastCurve(0.45, 0.5)) / 0.1 < 1);
let inRange = true;
for (const k of [0.5, 1, 2]) for (let i = 0; i <= 100; i++) {
  const y = contrastCurve(i / 100, k);
  if (!(y >= 0 && y <= 1)) inRange = false;
}
ok('curve never leaves [0,1]', inRange);
ok('curve is monotonic at k=2', xs.every((x, i) => i === 0 || contrastCurve(x, 2) >= contrastCurve(xs[i - 1], 2)));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
