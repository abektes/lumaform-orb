// Views that must follow the engine underneath them. Both bugs here had the
// same shape: something other than the view swapped the engine, and the view
// kept describing the old one. See docs/STATE-MACHINES.md, issue A.
//
// Built from the real method bags with only the fields they read, as
// set-state.test.mjs does for the runtime: constructing a studio needs WebGL.
import { sequenceMethods } from '../src/core/studio-sequence.js';
import { gridMethods } from '../src/core/studio-grid.js';
import { createSequencePlayer } from '../src/core/sequence.js';
import { createParamTween } from '@lumaform/orb/internal';
import { handleSequenceStep } from '../src/ui/studio-library.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// The bag first, then the fakes, so a stub replaces the real method it stands in for.
function withMethods(bag, fields) {
  const target = Object.defineProperties({}, Object.getOwnPropertyDescriptors(bag));
  return Object.assign(target, fields);
}

function rehearsalStudio() {
  return withMethods(sequenceMethods, {
    sequencePlayer: createSequencePlayer(),
    paramTween: createParamTween(),
    activeEngineType: 'tesseract',
    baseParams: {},
    paramDefs: {},
    applyingSequenceStep: false,
    currentSequence: null,
    sequenceState: null,
    setEngine(type) { this.activeEngineType = type; },
    syncModulation() {},
    updateGlobalSettings() {},
    tweenTo() {},
    applyModulatedParams() {},
  });
}

function rehearsalState() {
  return {
    engine: 'tesseract',
    global: { paused: false, glow: 1 },
    modulation: null,
    engines: { tesseract: { edgeGlow: 1 }, moire: { scale: 1 } },
  };
}

// --- A1: a step that swaps engines says so ---
{
  const studio = rehearsalStudio();
  const state = rehearsalState();
  const events = [];
  studio.onSequenceStep = (event) => events.push(event);
  studio.playSequence([
    { engine: 'tesseract', params: { edgeGlow: 2 }, holdMs: 100, transitionMs: 0 },
    { engine: 'moire', params: { scale: 2 }, holdMs: 100, transitionMs: 0 },
  ], state);
  studio.advanceTimeline(0.05);
  studio.advanceTimeline(0.1);
  ok('a same-engine step reports no engine change', events[0]?.engineChanged === false, JSON.stringify(events[0]));
  ok('a step onto another engine reports the change', events[1]?.engineChanged === true, JSON.stringify(events[1]));
  ok('and the rehearsal did swap the engine', state.engine === 'moire');
}

// --- A1: the inspector re-renders on that change ---
{
  let renders = 0;
  const toggled = [];
  const ui = {
    activeSequenceIndex: -1,
    render() { renders++; },
    root: {
      querySelectorAll: () => [0, 1].map((index) => ({
        getAttribute: () => String(index),
        classList: { toggle: (name, on) => toggled.push([index, on]) },
      })),
    },
  };
  handleSequenceStep.call(ui, { index: 1, engineChanged: false });
  ok('a same-engine step only moves the highlight', renders === 0 && toggled.length === 2);
  ok('the highlight lands on the playing step', toggled.find(([i]) => i === 1)?.[1] === true);

  handleSequenceStep.call(ui, { index: 0, engineChanged: true });
  // Without this, the Params tab kept the previous engine's sliders and a drag
  // wrote that engine's key into the new engine's bag.
  ok('an engine change re-renders the inspector', renders === 1);
  ok('the re-render knows which step is playing', ui.activeSequenceIndex === 0);
}

// --- B1 (rehearsal path): a legacy step cannot pause the session ---
{
  const studio = rehearsalStudio();
  const state = rehearsalState();
  studio.playSequence([
    { engine: 'tesseract', global: { glow: 2, paused: true, dpr: 3 }, params: {}, holdMs: 100, transitionMs: 0 },
  ], state);
  studio.advanceTimeline(0.016);
  ok('a step applies its look globals', state.global.glow === 2);
  ok('a step cannot pause the session', state.global.paused === false);
  ok('a step cannot set the render quality', !('dpr' in state.global));
}

// --- A2: an engine switch inside a sweep reports the sweep it actually built ---
{
  const reports = [];
  const studio = withMethods(gridMethods, {
    gridCols: 3,
    gridRows: 3,
    sweepInfo: null,
    scaleInfo: null,
    onGridRebuild: (view) => reports.push(view),
    enterScaleMode() { return null; },
    enterGridMode() {},
    enterSweepMode(_state, { paramKey }) {
      this.sweepInfo = { key: paramKey, label: `label:${paramKey}`, values: ['1', '2'] };
      return this.sweepInfo;
    },
  });
  // edgeGlow is tesseract's; moire has no such parameter, so the sweep falls
  // back to moire's first sweepable one.
  studio.rebuildGridForEngine({ engine: 'moire' }, { key: 'edgeGlow', values: [1, 2] }, null);
  ok('the rebuild is reported', reports.length === 1);
  ok('the report names the fallback parameter, not the old one',
    reports[0]?.sweepInfo?.key && reports[0].sweepInfo.key !== 'edgeGlow', JSON.stringify(reports[0]));
}

// --- A2: the grid session redraws its caption from that report ---
{
  const element = () => ({
    children: [],
    className: '',
    textContent: '',
    style: {},
    classes: new Set(),
    get classList() {
      const set = this.classes;
      return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
    },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
  });
  globalThis.window = { innerWidth: 1200, innerHeight: 800 };
  globalThis.document = { createElement: element, addEventListener() {} };
  const { createGridSession } = await import('../src/ui/grid-session.js');

  const caption = element();
  const studio = {
    isGridMode: false,
    enterSweepMode(_state, { paramKey }) {
      this.isGridMode = true;
      this.sweepInfo = { key: paramKey, label: 'Edge Glow', values: ['0.1', '0.5'] };
      return this.sweepInfo;
    },
  };
  const ui = { sweepCaption: caption, root: { classList: element().classList }, render() {} };
  const session = createGridSession({ studio, store: {}, state: { engine: 'tesseract' }, ui });
  session.mount();
  session.bind().toggleSweep();
  ok('entering a sweep captions its parameter', caption.children[0]?.textContent === 'Edge Glow');

  // The engine changed from the top bar; the studio rebuilt the sweep on another key.
  studio.onGridRebuild({ sweepInfo: { key: 'scale', label: 'Scale', values: ['1', '2', '3'] }, scaleInfo: null });
  ok('the caption follows the rebuilt sweep', caption.children[0]?.textContent === 'Scale',
    caption.children[0]?.textContent);
  ok('the caption shows the rebuilt values', caption.children[1]?.children.length === 3);

  studio.onGridRebuild({ sweepInfo: null, scaleInfo: null });
  ok('a rebuild into the plain grid drops the caption', caption.classes.has('hidden'));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
