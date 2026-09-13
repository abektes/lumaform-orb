# Open-source readiness

**Date:** 2026-09-13
**State reviewed:** `main` at `82f7c91`. 44 test suites pass, `npm run build` clean.

What stands between this repository and a public release, in the order it should be done. Findings were verified against the tree rather than assumed; where a claim was checked and turned out fine, it is recorded under [Already sound](#already-sound) so nobody re-litigates it.

## Already sound

Worth stating plainly, because these are the things most repos fail and this one does not.

- **No secrets, no personal data, no local paths** in any tracked file. Grep for key/secret/password/private-key patterns returns nothing in source; the apparent hits were the word "token" in `tokens.css`, which is a design-token file.
- **Analytics are genuinely opt-in.** `packages/studio/src/analytics.js` loads nothing unless `VITE_GA_ID` is set at build time, and it is unset in the repository. README and SECURITY.md both describe this accurately.
- **Build output is not committed.** `dist` is gitignored and untracked.
- **CI exists and is meaningful** — `.github/workflows/ci.yml` runs `npm ci`, `npm test` and `npm run build` on every push to main and every pull request, on Node 20.
- **LICENSE, CONTRIBUTING.md, SECURITY.md and .env.example are present** and were added deliberately in phase 1.
- **README's factual claims check out.** It says twenty-two engines; the catalog has 22. It says 83 curated presets; `PRESET_LIBRARY` is an array of 83. (A first count of 498 was wrong — it counted each preset's six fields.)

## Blockers

Things that make a public release actively misleading or unusable.

### 1. `@lumaform/orb` has no publishing metadata

`packages/orb/package.json` declares `name`, `version`, `type`, `exports`, `types` and `sideEffects` — and nothing else. No `license`, `description`, `repository`, `author`, `keywords` or `files`.

Two consequences. npm shows a package with no licence as **UNLICENSED** regardless of the LICENSE file sitting in the repo root, which is the single most likely reason a prospective user closes the tab. And with no `files` array the published tarball carries `tests/` and anything else in the package directory.

Add to both packages:

```json
{
  "license": "MIT",
  "description": "…",
  "author": "…",
  "repository": { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git", "directory": "packages/orb" },
  "homepage": "https://github.com/<owner>/<repo>#readme",
  "bugs": { "url": "https://github.com/<owner>/<repo>/issues" },
  "keywords": ["webgl", "three", "shader", "orb", "ambient", "ai-assistant"],
  "files": ["src", "index.d.ts", "README.md", "LICENSE"]
}
```

`packages/orb` also needs its own `README.md` and a copy of `LICENSE`: npm renders the package directory's README, not the repository root's, so the package page would otherwise be blank.

Verify with `npm pack --dry-run -w @lumaform/orb` and read the file list before believing it.

### 2. Decide the first version, deliberately

Both packages are `"private": true` at `"version": "0.0.0"`. That is correct today — nothing is published, so no API is frozen — and it is the reason the surface could be reworked five times without breaking anyone.

Flipping `private` to `false` is the point of no return. Before it:

- Settle whether `OrbRuntime` stays on the public barrel or moves behind a subpath. It is currently exported as the escape hatch for hosts driving their own loop, which is a real use case, but it is also the widest part of the surface.
- Publish as `0.1.0`, not `1.0.0`. Pre-1.0 semver lets minors break, which is what a runtime with one consumer needs.
- Consider `npm publish --dry-run` and `--access public` for a scoped package.

### 3. No changelog

Version `0.0.0` with no history. A consumer upgrading has nothing to read. Start `CHANGELOG.md` at the first published version — Keep a Changelog format, hand-written, not generated from commit subjects.

## High

### 4. `CODE_OF_CONDUCT.md` is missing

GitHub's community-standards checklist flags its absence, and CONTRIBUTING.md has nowhere to point for conduct questions. Contributor Covenant 2.1 is the default choice; it needs a real contact address, which is a decision rather than a copy-paste.

### 5. No issue or pull-request templates

`.github/ISSUE_TEMPLATE/` and `.github/PULL_REQUEST_TEMPLATE.md` do not exist. For a WebGL project the bug template should ask for **GPU, browser and OS**, because almost every rendering bug report is unactionable without them.

### 6. Historical plans contain paths that no longer resolve

`docs/superpowers/plans/*.md` reference `src/core/studio.js`, `node tests/<name>.test.mjs` and `npx vite build` — the pre-monorepo layout — across 16–18 files.

These are *records of work as it was done*, and rewriting history to match the present would make them lie about their own moment. The fix is a short header on `docs/superpowers/plans/README.md` (new) saying so: plans are historical, paths are as-of their date, `docs/` and the top-level markdown are the live documentation. Do not mass-rewrite them.

This was already corrected in the live documentation: README.md, CLAUDE.md, PRODUCT.md and ENGINE-AUTHORING.md were fixed in `82f7c91`.

## Medium

### 7. The studio bundle is one 942 kB chunk

252 kB gzipped, and Vite warns on every build. Acceptable for a demo studio that loads once; less acceptable as the first impression of a graphics project. The engines are the bulk and are already one module each, so `manualChunks` or a dynamic `import()` per engine would split it along a seam that already exists. Do this for the studio only — the package's tree-shaking story is separate and already handled.

### 8. No declared Node version

CI pins Node 20 but nothing in the repo says so. Add `"engines": { "node": ">=20" }` to the root and both packages, plus `.nvmrc`. A contributor on Node 18 currently discovers this through a failure.

### 9. `archive/demos/` — 14 tracked files

Superseded prototypes. Either delete them (git history keeps them) or add `archive/README.md` explaining what they are and that they are not maintained. Right now a visitor cannot tell them from live code.

### 10. Test the published artifact, not just the source

CI runs the suite against `src/`. Nothing checks that the built tarball is importable — that `exports` resolves, that `index.d.ts` ships, that no test file leaks in. Add a CI step running `npm pack` and importing the result from a scratch directory. `public-api.test.mjs` already guards the barrel against the declarations; this guards the package against the packer.

### 11. `.editorconfig`

Two-space indent, single quotes and semicolons are enforced by review and by nothing else. An `.editorconfig` costs four lines. A linter is a larger decision and is deliberately not proposed here — the codebase has a consistent house style that no off-the-shelf config matches, and retrofitting one would produce a large mechanical diff that buries real history.

## Deferred, with reasons

- **Full de-subclassing of `OrbStudio`.** Composition instead of `extends`, which means prefixing 61 `this.<member>` references. The dependency inversion is already gone — the runtime declares no hooks and the studio overrides nothing but `dispose` — so this is now a mechanical rename, not a design problem. It does not block a release.
- **Frequency-band audio.** Deliberately out of scope when the file-audio feature was designed; revisit once there is evidence about what real tracks need.
- **The remaining float32 precision cases.** `singularity`'s per-fragment Keplerian shear and the fbm/hash drift in `aqueous` and `nebula` still take raw `time` and degrade on the original curve. Fixing them needs tileable noise. Documented in `packages/orb/src/core/phase.js`; not a release blocker, but it is a known defect and should be an issue rather than a comment once there is an issue tracker.

## Suggested order

1. Package metadata, per-package README and LICENSE, `files` — then `npm pack --dry-run` and read the list (blocker 1)
2. `CODE_OF_CONDUCT.md`, issue and PR templates, `.editorconfig`, `.nvmrc`, `engines` (4, 5, 8, 11)
3. `docs/superpowers/plans/README.md` marking plans historical (6)
4. Pack-and-import CI step (10)
5. `archive/` decision (9)
6. Bundle split (7)
7. `CHANGELOG.md`, then the version and `private: false` decision (2, 3)

Items 1–5 are independent and can be done in any order. Item 7 is last on purpose: it is the only irreversible one.
