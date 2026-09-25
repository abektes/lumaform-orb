// What the Export tab hands to someone using @lumaform/orb.
//
// The file carried `dpr` (the render quality picked on the author's screen)
// and `paused`, and the library applied both on playback, so every viewer got
// one person's density and a paused export shipped a frozen orb. The code
// snippet printed only the config, without the install line or the createOrb
// call that uses it, so it was not a snippet anyone could run.

import { readConfig, ENGINE_PARAM_DEFINITIONS, getDefaultEngineParams } from '@lumaform/orb';
import { exportConfig, generateEmbedSnippet } from '../src/ui/studio-export.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

const state = {
  engine: 'regard',
  global: { dpr: 1.5, paused: true, exposure: 1.1, bloomStrength: 0.3, background: '#05060a', transparentBg: false },
  engines: { regard: getDefaultEngineParams('regard') },
  modulation: { enabled: false, loopLength: 4, sources: {}, routes: [] },
};
const studio = { state, exportConfig };

const config = studio.exportConfig();
ok('the export carries a format version', config.version === 1);
ok('the export leaves out the author\'s render quality', !('dpr' in config.global), JSON.stringify(config.global));
ok('the export leaves out whether the author had paused', !('paused' in config.global));
ok('the export keeps the look', config.global.exposure === 1.1 && config.global.background === '#05060a');
ok('exporting does not touch the studio\'s own settings', state.global.dpr === 1.5 && state.global.paused === true);

const record = readConfig(config, ENGINE_PARAM_DEFINITIONS[config.engine]);
ok('the library reads every exported param back', Object.keys(record.params).length === Object.keys(state.engines.regard).length && record.dropped.length === 0,
  `${Object.keys(record.params).length} read, ${record.dropped.length} dropped`);

const snippet = generateEmbedSnippet.call(studio);
ok('the snippet says how to install', snippet.includes('npm install @lumaform/orb three'));
ok('the snippet imports the engine the config names', snippet.includes("import { regard } from '@lumaform/orb/engines';"));
ok('the snippet mounts it', /createOrb\(document\.querySelector\('#orb'\), \{\s*engines: \{ regard \},\s*config: ORB_CONFIG,\s*\}\)/.test(snippet));
const literal = snippet.match(/export const ORB_CONFIG = (\{[\s\S]*?\n\});/);
ok('the snippet\'s config is exactly the exported file', literal && JSON.stringify(JSON.parse(literal[1])) === JSON.stringify(config));

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nexport config: all checks passed');
