// The finish pass must be invisible until asked for: every existing config
// renders identically, and the pass costs nothing while it is at identity.
import {
  FINISH_DEFAULTS, resolveFinish, isIdentityFinish, createFinishPass,
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

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
