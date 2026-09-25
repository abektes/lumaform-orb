# Releasing `@lumaform/orb`

Only the runtime is published. The studio stays `private` for good: it is the instrument, not a dependency.

Everything up to step 4 is reversible. **Step 5 is not**: a published version can be deprecated but never reused, so read the tarball before you publish it.

## Before the first release, once

1. **Own the `lumaform` scope on npm.** A scoped package can only be published by the user or organisation of that name. Create the free organisation at npmjs.com (`Add Organization` → `lumaform`), or confirm you already own it. `publishConfig.access` is already `public`, which a scoped package needs; without it npm tries to publish privately and fails.
2. **Log in with two-factor authentication on:** `npm login`, then `npm whoami`.

## Every release

1. **`main` is green.** CI runs `npm ci`, `npm test`, `npm run build` and `npm run verify:package`. Run them locally too if anything changed since the last CI run.
2. **Name the version.** In `packages/orb/CHANGELOG.md`, rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`, open a fresh empty `## [Unreleased]` above it, and update the link references at the bottom. Set `version` in `packages/orb/package.json` to match. Pre-1.0 rule: a breaking change bumps the minor.
3. **Land it on `main`.** Open a pull request with those two files, let CI pass, merge, and publish from an up-to-date `main`, so what is on npm is what is on `main`. (`"private"` has been `false` since 0.1.0; `package-metadata.test.mjs` still refuses a `0.0.0` version.)
4. **Read what will ship:**
   ```bash
   npm run verify:package
   npm publish --dry-run -w @lumaform/orb
   ```
   The file list should be `src/`, `index.d.ts`, `README.md`, `LICENSE` and `CHANGELOG.md`, and nothing else. `verify:package` has already installed this tarball in a scratch project and imported every subpath.
5. **Publish** (irreversible):
   ```bash
   npm publish -w @lumaform/orb
   ```
6. **Tag and release.** Tag the published commit on `main` and push the tag:
   ```bash
   git tag vx.y.z
   git push origin vx.y.z
   ```
   Create a GitHub release from the tag and paste in the changelog section. The link at the bottom of the changelog points at that release.
7. **Check it from the outside.** Open the npm page and confirm the README renders. Then install the package into an empty directory next to `three` and import `@lumaform/orb` and `@lumaform/orb/engines`.

## If something is wrong after publishing

Publish a fixed patch release. Don't `npm unpublish`: it is refused after 72 hours, and even within them it breaks anyone who already installed the package. Use `npm deprecate @lumaform/orb@<version> "<why>"` to warn people off a bad version.
