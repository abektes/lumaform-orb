// Curl Drift spawned every stream at the bottom of its band on first build.
//
// spawnPosition spaces streams by `(index + 0.5) / count`, and took `count` from
// `streams.length` — but the build pushes each stream and spawns it before the
// next exists, so stream i saw a length of i + 1 and landed at (i+0.5)/(i+1):
// almost all of them at the south pole. The default preset ("full coverage")
// rendered as one streak under a dark ball until streams slowly respawned.
// Checked on the real engine: head positions right after construction.

import * as THREE from 'three';
import { createCurlDriftEngine } from '../src/engines/curl-drift-engine.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

function headHeights(params) {
  const scene = new THREE.Scene();
  const renderer = { getSize: (v) => v.set(1024, 768), getPixelRatio: () => 1 };
  const engine = createCurlDriftEngine({ scene, renderer, params });
  // One tiny step so the head buffer is written from the spawned positions
  // without letting the flow carry them anywhere yet.
  engine.update({ delta: 1e-4 });
  let heads = null;
  scene.traverse((o) => { if (o.isPoints) heads = o; });
  const a = heads.geometry.attributes.position.array;
  const ys = [];
  for (let i = 0; i < a.length; i += 3) ys.push(a[i + 1] / Math.hypot(a[i], a[i + 1], a[i + 2]));
  engine.dispose();
  return ys.sort((p, q) => p - q);
}

const quantile = (ys, t) => ys[Math.floor(t * (ys.length - 1))];

for (const streamCount of [32, 64, 128]) {
  const ys = headHeights({ streamCount, coverage: 1, coverageCenter: 0 });
  const southCap = ys.filter((y) => y < -0.8).length / ys.length;
  ok(`${streamCount} streams, full coverage: heights span the shell`,
    quantile(ys, 0.1) < -0.6 && quantile(ys, 0.9) > 0.6, `10%/90% at ${quantile(ys, 0.1).toFixed(2)} / ${quantile(ys, 0.9).toFixed(2)}`);
  ok(`${streamCount} streams, full coverage: no pile-up at the south pole`,
    southCap < 0.2, `${(southCap * 100).toFixed(0)}% below −0.8`);
  ok(`${streamCount} streams, full coverage: median near the equator`,
    Math.abs(quantile(ys, 0.5)) < 0.15, quantile(ys, 0.5).toFixed(2));
}

// A band: streams fill it top to bottom, not just its lower edge.
const band = headHeights({ streamCount: 64, coverage: 0.28, coverageCenter: 0 });
ok('a narrow equatorial band is filled across its width',
  quantile(band, 0.1) < -0.15 && quantile(band, 0.9) > 0.15, `10%/90% at ${quantile(band, 0.1).toFixed(2)} / ${quantile(band, 0.9).toFixed(2)}`);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\ncurl drift spawn: all checks passed');
