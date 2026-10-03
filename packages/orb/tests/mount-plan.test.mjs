// What createOrb registers and mounts, decided without a renderer.
import { planMount } from '../src/core/mount-plan.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const factory = () => ({ update() {}, dispose() {} });
const regard = () => ({ update() {}, dispose() {} });

const template = {
  id: 'ember', name: 'Ember', description: 'x', engine: regard,
  config: {
    version: 2, engine: 'regard', params: { attention: 0.05 },
    states: { idle: { params: {} }, thinking: { params: { attention: 0.85 }, tempo: 1.4 } },
    initialState: 'idle',
  },
};

const fromTemplate = planMount({ template });
ok('a template registers its own engine', fromTemplate.engines.regard === regard);
ok('a template mounts its config\'s engine', fromTemplate.engine === 'regard');
ok('a template carries its states', fromTemplate.mount.states?.thinking?.params.attention === 0.85);
ok('a template starts in its initialState', fromTemplate.mount.initialState === 'idle');

const overridden = planMount({ template, state: 'thinking' });
ok('`state` overrides initialState', overridden.mount.initialState === 'thinking');

const unknownState = planMount({ template, state: 'dreaming' });
ok('an unknown `state` falls back to initialState', unknownState.mount.initialState === 'idle');

const both = planMount({ template, engines: { tesseract: factory } });
ok('a template adds to engines passed alongside it', both.engines.tesseract === factory && both.engines.regard === regard);

const plain = planMount({ engines: { tesseract: factory }, config: { engine: 'tesseract', params: {} } });
ok('config without template still works', plain.engine === 'tesseract' && plain.mount.states === null);

const sole = planMount({ engines: { tesseract: factory } });
ok('falls back to the only engine handed over', sole.engine === 'tesseract');

const none = planMount({});
ok('nothing to mount → null', none.engine === null && none.mount === null);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
