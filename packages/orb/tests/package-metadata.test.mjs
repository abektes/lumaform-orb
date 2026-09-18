// What npm would publish, and what it would say about it.
//
// The manifest previously declared name, version, type, exports, types and
// sideEffects — and nothing else. Two consequences that neither the test suite
// nor a build could catch:
//
// npm shows a package with no `license` field as UNLICENSED regardless of the
// MIT file sitting in the repository root, because the registry reads the
// manifest, not the tree. And with no `files` array the tarball carries
// everything in the directory, so the tests would have shipped to consumers.
//
// Both are silent until someone looks at the published page, which is after the
// version is spent. Hence a test.
import { readFileSync, existsSync } from 'node:fs';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

// Resolve against the package *directory*, not the manifest file: a URL base
// that is a file makes '../x' climb out of the package entirely.
const pkgDir = new URL('../', import.meta.url);
const at = (rel) => new URL(rel, pkgDir);
const pkg = JSON.parse(readFileSync(at('package.json'), 'utf8'));

// --- the fields a registry page is built from ---

ok('declares a licence', pkg.license === 'MIT', String(pkg.license));
ok('declares a description', typeof pkg.description === 'string' && pkg.description.length > 20);
ok('declares an author', !!pkg.author);
ok('declares a repository', typeof pkg.repository?.url === 'string');
ok('the repository entry points at this package directory',
  pkg.repository?.directory === 'packages/orb', String(pkg.repository?.directory));
ok('declares a bugs url', typeof pkg.bugs?.url === 'string');
ok('declares a homepage', typeof pkg.homepage === 'string');
ok('declares keywords', Array.isArray(pkg.keywords) && pkg.keywords.length >= 3);
ok('declares a supported node range', typeof pkg.engines?.node === 'string');

// A scoped package publishes privately unless told otherwise, which fails for
// an account with no paid plan and is confusing when it does not.
ok('a scoped package opts into public access', pkg.publishConfig?.access === 'public');

// --- the licence has to be in the package, not just the repo ---

// npm renders the package directory's files. The root LICENSE and README are
// invisible to a consumer looking at the registry page.
ok('LICENSE is present in the package directory', existsSync(at('LICENSE')));
ok('README.md is present in the package directory', existsSync(at('README.md')));

if (existsSync(at('LICENSE'))) {
  const pkgLicence = readFileSync(at('LICENSE'), 'utf8');
  const rootLicence = readFileSync(at('../../LICENSE'), 'utf8');
  ok('the package licence matches the repository licence', pkgLicence === rootLicence);
  ok('the licence text is the one the manifest claims', pkgLicence.includes('MIT License'));
}

// --- what actually ends up in the tarball ---

ok('declares a files allowlist', Array.isArray(pkg.files), 'without it, tests ship');
for (const entry of ['src', 'index.d.ts', 'README.md', 'LICENSE']) {
  ok(`files includes ${entry}`, pkg.files?.includes(entry));
}
ok('files does not ship the tests', !pkg.files?.some((f) => /tests?/.test(f)));

// --- every export target has to exist ---

// A broken exports map is only discovered on import, which for a consumer is
// after install. Cheap to check here.
const targets = Object.entries(pkg.exports ?? {});
ok('declares an exports map', targets.length > 0);
for (const [subpath, target] of targets) {
  ok(`exports "${subpath}" resolves to a real file`, existsSync(at(target)), target);
}
ok('types points at a real file', existsSync(at(pkg.types)), String(pkg.types));

// Every exported subpath must be inside the files allowlist, or it resolves in
// the repo and 404s once published.
const allowed = new Set(pkg.files ?? []);
for (const [subpath, target] of targets) {
  const top = target.replace(/^\.\//, '').split('/')[0];
  ok(`exports "${subpath}" is covered by files`, allowed.has(top), `${target} → ${top}`);
}

// --- the irreversible step, guarded ---

// Publishing 0.0.0 wastes the version and cannot be undone. If `private` is
// ever removed, this fails until a real version is chosen with it.
if (pkg.private !== true) {
  ok('a publishable package has a real version', pkg.version !== '0.0.0', pkg.version);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
