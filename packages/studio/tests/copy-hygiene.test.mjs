// Copy that reads as generated. Reddit's verdict on the studio was "AI slop",
// and the loudest tell was the words: a page titled "Hyper-Geometric 3D
// Shaders", presets of "lime quantum photon packets" against "pure obsidian
// void". This scans every user-facing string the catalog, presets and page
// carry, so the register cannot drift back.
//
// The list targets tone, not subject. Mathematics stays: hypercube, hyperboloid
// and hyperbolic are what those things are called. `quantum` is allowed only
// for Superposition, which draws real quantum orbitals.
import { readFileSync } from 'node:fs';
import { ENGINE_CATALOG, optionLabel } from '@lumaform/orb';
import { PRESET_LIBRARY } from '../src/presets/preset-library.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const BANNED = [
  /\bcyber\w*/i, /\bneon\b/i, /\bvoid\b/i, /\bobsidian\b/i, /\bpristine\b/i,
  /\bethereal\b/i, /\baetheric\b/i, /\bmatrix\b/i, /\bcelestial\b/i, /\bcosmic\b/i,
  /\btranscend\w*/i, /\bmystic\w*/i, /\bsacred\b/i, /\bmerkabah\b/i, /\bquantum\b/i,
  /\bhyperspace\b/i, /\bhyper-\w+/i,
];
const ALLOWED = { superposition: [/\bquantum\b/i] };

function offences(text, engine) {
  const allowed = ALLOWED[engine] || [];
  return BANNED
    .filter((re) => !allowed.some((a) => a.source === re.source))
    .map((re) => re.exec(text || '')?.[0])
    .filter(Boolean);
}

const found = [];
for (const entry of ENGINE_CATALOG) {
  for (const field of ['name', 'badge', 'description']) {
    for (const word of offences(entry[field], entry.id)) found.push(`catalog ${entry.id}.${field}: "${word}"`);
  }
  for (const [key, def] of Object.entries(entry.params)) {
    for (const word of offences(def.label, entry.id)) found.push(`catalog ${entry.id}.params.${key}.label: "${word}"`);
    // A select shows its options in a dropdown, so what a user reads there is
    // copy too. Option values are stored in saved configs and cannot change;
    // optionLabels is where their wording gets fixed.
    for (const option of def.type === 'select' ? def.options : []) {
      for (const word of offences(optionLabel(def, option), entry.id)) {
        found.push(`catalog ${entry.id}.params.${key} option "${option}": "${word}"`);
      }
    }
  }
}
for (const preset of PRESET_LIBRARY) {
  for (const field of ['name', 'badge', 'description']) {
    for (const word of offences(preset[field], preset.engine)) found.push(`preset "${preset.name}" .${field}: "${word}"`);
  }
}
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
for (const word of offences(head, null)) found.push(`index.html <head>: "${word}"`);

ok('no generated-sounding words in user-facing copy', found.length === 0,
  found.length ? `\n  ${found.join('\n  ')}` : '');

// Renaming a preset must not orphan the engine whose default it was.
const names = new Set(PRESET_LIBRARY.map((p) => `${p.engine}/${p.name}`));
const orphaned = ENGINE_CATALOG
  .filter((e) => !names.has(`${e.id}/${e.defaultPreset}`))
  .map((e) => `${e.id} → "${e.defaultPreset}"`);
ok('every catalog defaultPreset names a preset of that engine', orphaned.length === 0, orphaned.join(', '));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
