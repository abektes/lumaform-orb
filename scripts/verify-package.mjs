// Packs @lumaform/orb, installs the tarball into a scratch project, and imports
// every subpath from outside the workspace.
//
// The test suite runs against `src/`, where every path resolves because the
// repository is right there. None of it exercises the thing a consumer actually
// receives. Three failures are invisible until after publish, and a spent
// version cannot be unspent:
//
//   - `files` omits something an export needs, so the subpath 404s on install
//   - `exports` names a path that only resolves inside the workspace
//   - a test or scratch file rides along in the tarball
//
// package-metadata.test.mjs checks the manifest's claims. This checks that npm
// agrees with them.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PACKAGE = '@lumaform/orb';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const repo = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'lumaform-verify-'));

try {
  // --- pack ---

  const packed = JSON.parse(run('npm', [
    'pack', '-w', PACKAGE, '--json', '--pack-destination', scratch,
  ], repo));
  const { filename, files } = packed[0];
  const names = files.map((f) => f.path);

  console.log(`packed ${filename} — ${names.length} files\n`);

  // Nothing from the development tree should ride along.
  const strays = names.filter((n) =>
    n.endsWith('.test.mjs') || n.split('/').includes('tests') ||
    n.endsWith('.log') || n.startsWith('.env'));
  ok('the tarball carries no tests or scratch files', strays.length === 0, strays.join(', '));

  for (const required of ['package.json', 'README.md', 'LICENSE', 'index.d.ts']) {
    ok(`the tarball carries ${required}`, names.includes(required));
  }

  // --- install it somewhere that is not this repository ---

  // A scratch project, so nothing resolves by accident through the workspace.
  writeFileSync(join(scratch, 'package.json'), JSON.stringify({
    name: 'lumaform-verify', version: '1.0.0', type: 'module', private: true,
  }, null, 2));

  // Install the peer explicitly: npm does not always place peers, and an import
  // failing for a missing peer looks exactly like a broken export.
  //
  // Use the version the repository itself builds against rather than deriving
  // one from the peer range — that range is a constraint, not a version, and
  // parsing it into one produced `three@0.1601` on the first attempt.
  const studioDeps = JSON.parse(
    run('node', ['-p', "JSON.stringify(require('./packages/studio/package.json').dependencies)"], repo)
  );
  run('npm', ['install', '--no-audit', '--no-fund',
    join(scratch, filename), `three@${studioDeps.three}`,
  ], scratch);

  const installed = join(scratch, 'node_modules', '@lumaform', 'orb');
  ok('the package installed', existsSync(installed));
  ok('index.d.ts survived the install', existsSync(join(installed, 'index.d.ts')));
  ok('no tests directory was installed', !existsSync(join(installed, 'tests')));

  // --- import every subpath as a consumer would ---

  // Probe every subpath the manifest declares, not a list kept in this file: a
  // subpath added later would otherwise ship unverified, which is exactly the
  // class of mistake this script exists to catch.
  const subpaths = Object.keys(JSON.parse(
    run('node', ['-p', "JSON.stringify(require('./packages/orb/package.json').exports)"], repo)
  ));
  console.log(`probing ${subpaths.length} declared subpath(s): ${subpaths.join(', ')}\n`);

  const probe = join(scratch, 'probe.mjs');
  writeFileSync(probe, `
    const out = {};
    for (const sub of ${JSON.stringify(subpaths)}) {
      const spec = sub === '.' ? '${PACKAGE}' : '${PACKAGE}' + sub.slice(1);
      const m = await import(spec);
      out[sub] = Object.keys(m).length;
    }
    const root = await import('${PACKAGE}');
    out.createOrb = typeof root.createOrb;
    out.OrbRuntime = typeof root.OrbRuntime;
    const engines = await import('${PACKAGE}/engines');
    out.engineCount = Object.keys(engines).length;
    // Compared against the installed catalog rather than a literal count: a
    // hard-coded 22 failed the first time an engine was added.
    out.catalogIds = (root.ENGINE_CATALOG || []).map((entry) => entry.id);
    out.unreachable = out.catalogIds.filter((id) => typeof engines[id] !== 'function');
    // The catalog must not drag the engine layer in. If a factory is reachable
    // from the root barrel the tree-shaking contract is broken again.
    out.factoryOnRoot = Object.keys(root).some((k) => /^create[A-Z]\\w*Engine$/.test(k));
    console.log(JSON.stringify(out));
  `);

  let result;
  try {
    result = JSON.parse(run('node', [probe], scratch).trim().split('\n').pop());
  } catch (error) {
    ok('every subpath imports from the installed package', false,
      String(error.stderr || error).slice(0, 300));
    result = null;
  }

  if (result) {
    for (const sub of subpaths) {
      ok(`"${PACKAGE}${sub === '.' ? '' : sub.slice(1)}" imports`,
        result[sub] > 0, `${result[sub]} exports`);
    }
    ok('createOrb is callable from the tarball', result.createOrb === 'function');
    ok('OrbRuntime is exported', result.OrbRuntime === 'function');
    ok('all engines are reachable from ./engines',
      result.catalogIds.length > 0 && result.unreachable.length === 0
        && result.engineCount === result.catalogIds.length,
      `${result.engineCount} exported, ${result.catalogIds.length} in catalog`
        + (result.unreachable.length ? `, missing: ${result.unreachable.join(', ')}` : ''));
    ok('no engine factory leaks onto the root barrel', result.factoryOnRoot === false);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
  // npm pack writes into the workspace when --pack-destination is ignored by an
  // older npm; make sure nothing was left behind in the repo.
  for (const stray of readdirSync(repo).filter((f) => f.endsWith('.tgz'))) {
    rmSync(join(repo, stray), { force: true });
    console.log(`removed stray tarball ${stray}`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
