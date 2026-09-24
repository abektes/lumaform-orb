// The background colour must reach the screen as picked.
//
// It went through ACES tone mapping and exposure in the main view (#336699 →
// (31,105,165), #05060a → pure black, white unreachable, exposure moved it),
// and the grid cleared its linear render targets with sRGB-encoded values, so
// cells showed a third colour (#336699 → (147,184,205)). Separately, bloom
// wrote alpha everywhere it blurred, so "transparent background" laid a 43%
// dark veil over the host page.
//
// The fix composites the exact colour after tone mapping, in both paths. The
// shader cannot run in Node, so this checks the colour maths exactly and the
// pipeline wiring by source.

import { readFileSync } from 'node:fs';
import { backgroundComponents } from '../src/core/background-color.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

ok('#336699 is passed through as display sRGB, untouched', same(backgroundComponents('#336699'), [0.2, 0.4, 0.6]));
ok('a near-black tint survives exactly', same(backgroundComponents('#05060a'), [5 / 255, 6 / 255, 10 / 255]));
ok('white is reachable', same(backgroundComponents('#ffffff'), [1, 1, 1]));
ok('shorthand hex expands', same(backgroundComponents('#fa0'), [1, 170 / 255, 0]));
ok('case does not matter', same(backgroundComponents('#AbCdEf'), backgroundComponents('#abcdef')));
ok('garbage is refused, not guessed', backgroundComponents('teal') === null && backgroundComponents('#12345') === null && backgroundComponents(undefined) === null);

const runtime = readFileSync(new URL('../src/core/runtime.js', import.meta.url), 'utf8');
const pass = readFileSync(new URL('../src/core/background-pass.js', import.meta.url), 'utf8');
const grid = readFileSync(new URL('../../studio/src/core/variation-grid.js', import.meta.url), 'utf8');

ok('the runtime never hands the colour to scene.background (that path is tone-mapped)',
  !/scene\.background\s*=(?!\s*null)/.test(runtime));
const order = ['new RenderPass', 'new UnrealBloomPass', 'new OutputPass', 'createBackgroundPass('].map((s) => runtime.indexOf(s));
ok('main composer order: render → bloom → output → background',
  order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]), order.join(' < '));
ok('bloom is made to preserve alpha', /preserveBloomAlpha\(this\.bloomPass\)/.test(runtime));
ok('the pass composites premultiplied light over the colour',
  /src\.rgb \+ uColor \* \(1\.0 - /.test(pass));
ok('grid cells composite the same background after OutputPass',
  grid.indexOf('new OutputPass') >= 0 && grid.indexOf('createBackgroundPass(') > grid.indexOf('new OutputPass'));

// Additive light must not claim coverage. It blends alpha in with its colour,
// so once the backdrop moved behind the composite, Regard's glowing halo
// punched a near-black ring (luma 2–11 on a 128 grey) into its own background.
const THREE = await import('three');
const { lightCarriesNoCoverage } = await import('../src/core/background-pass.js');
const scene = new THREE.Scene();
const glow = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true }));
const premultipliedGlow = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, premultipliedAlpha: true }));
const veil = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }));
const multi = new THREE.Mesh(new THREE.BufferGeometry(), [new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending }), new THREE.MeshBasicMaterial()]);
scene.add(glow, premultipliedGlow, veil);
glow.add(multi);
lightCarriesNoCoverage(scene);
const leavesAlpha = (m) => m.blending === THREE.CustomBlending && m.blendSrcAlpha === THREE.ZeroFactor && m.blendDstAlpha === THREE.OneFactor;
ok('additive light keeps its colour factors but writes no coverage',
  leavesAlpha(glow.material) && glow.material.blendSrc === THREE.SrcAlphaFactor && glow.material.blendDst === THREE.OneFactor);
ok('premultiplied additive light keeps ONE, ONE', leavesAlpha(premultipliedGlow.material) && premultipliedGlow.material.blendSrc === THREE.OneFactor);
ok('normal-blended veils still cover what is behind them', veil.material.blending === THREE.NormalBlending);
ok('material arrays and nested objects are reached', leavesAlpha(multi.material[0]) && multi.material[1].blending === THREE.NormalBlending);
const version = glow.material.version;
lightCarriesNoCoverage(scene);
ok('a second pass changes nothing (cheap to run every frame)', glow.material.version === version);
ok('the runtime applies it before drawing', /lightCarriesNoCoverage\(this\.scene\)/.test(runtime));
ok('grid cells apply it before drawing', /lightCarriesNoCoverage\(cells\[i\]\.scene\)/.test(grid));

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nbackground: all checks passed');
