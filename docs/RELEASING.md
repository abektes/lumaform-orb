# Releasing `@lumaform/orb`

Only the runtime is published, as [`@lumaform/orb`](https://www.npmjs.com/package/@lumaform/orb). The studio stays `private` for good: it is the instrument, not a dependency.

## What happens automatically, and what doesn't

| Event | What runs | Automatic? |
|---|---|---|
| Pull request opened or updated | CI: `npm ci`, `npm test`, `npm run build`, `npm run verify:package` | Yes |
| Merge to `main` | CI again, and Railway redeploys the studio at [orb.lumaform.xyz](https://orb.lumaform.xyz) | Yes |
| Push a `v*` tag | The [Publish workflow](../.github/workflows/publish.yml): checks, tests, publishes to npm, creates the GitHub release | Yes, once you push the tag |
| Choosing the version and writing its changelog | Steps 1–3 below | **No**. That takes a person |

**Merging never publishes; pushing a version tag does.** The runtime on `main` can be ahead of the version on npm for as long as you like, and users get the new code only when someone tags a release. That is deliberate. A published version can be deprecated but never reused, so a person decides when one is spent, and a person decides whether a change is breaking.

## How publishing works

The Publish workflow uses npm's [trusted publishing](https://docs.npmjs.com/trusted-publishers):

- **npm trusts one workflow file in one repository.** On npmjs.com, `@lumaform/orb` → Settings → Trusted Publisher names GitHub Actions, `abektes` / `lumaform-orb`, and `publish.yml`. All fields are case-sensitive, and npm doesn't check them when you save, so a mismatch only surfaces as a failed publish. **Renaming the workflow file breaks publishing** until that setting is updated.
- **No token exists.** Each run, GitHub hands npm a short-lived OIDC token proving which repository and workflow is asking. Nothing is stored in the repository or its secrets that could leak.
- **Provenance comes with it.** npm records a signed statement linking each version to the commit and workflow run that built it, and shows it on the package page.
- **It guards the version before spending it.** The run fails before publishing if the tag doesn't match `packages/orb/package.json`, if the tagged commit isn't on `main`, or if the changelog has no dated section for that version. It then runs `npm ci`, `npm test` and `npm run verify:package`, publishes, and creates the GitHub release with that changelog section as its notes.
- **It runs on npm 11.5.1+ and Node 24.** Trusted publishing needs npm 11.5.1+ and Node 22.14+. The regular CI stays on Node 20.

Run it by hand (Actions → Publish → Run workflow) to rehearse everything except the upload: without a tag it ends in `npm publish --dry-run`.

## Who owns what

- **npm organisation:** `lumaform`, owner `abektes`. Only its members can publish `@lumaform/*` by hand, and they can change the trusted publisher setting. Add a maintainer under the organisation's Members page on npmjs.com.
- **Two-factor authentication** is required for anything done by hand: publishing, and changing package settings. npm refuses a manual publish from an account without it, with `E403 … Two-factor authentication or granular access token with bypass 2fa enabled is required`. Nothing is uploaded when that happens, so the version is not spent. Turn it on under Account → Two-Factor Authentication, covering *authorization and writes*, and check it with `npm profile get`.
- **Tokens are disallowed** for this package (Settings → Publishing access → *Require two-factor authentication and disallow tokens*). A leaked npm token can't publish it, and the trusted publisher is unaffected.
- **`main` is protected** by the GitHub ruleset "Protect main". Every change lands through a pull request whose `test` check passed, history stays linear, and `main` cannot be force-pushed or deleted. Repository admins can bypass only when merging a pull request, never by pushing directly. The Publish workflow refuses a tag that isn't on `main`, so everything that reaches npm has passed CI.

## Keep the changelog as you go

Every pull request that changes what a runtime user sees adds a line under `## [Unreleased]` in [packages/orb/CHANGELOG.md](../packages/orb/CHANGELOG.md), in the right group (`Added`, `Changed`, `Fixed`, `Removed`). That covers an export, an engine's look or behaviour, a parameter, or the config format. Studio-only changes don't go there. At release time the section is already written, and the version number follows from it.

## Choosing the version

The package is pre-1.0, which changes what the numbers mean:

- **Patch (`0.1.x`):** fixes only. No export changes shape, and no saved config renders differently except where it was broken.
- **Minor (`0.x.0`):** anything else. That includes every breaking change: a removed or renamed export, or a parameter whose name, range or meaning changes (saved configs depend on those).
- `@lumaform/orb/internal` is outside semver, as its header says. Changing it never forces a minor.

1.0 is the point where the API is promised to hold. Nothing forces it; see [VISION.md](VISION.md) §6.

## Every release

Steps 1–3 are reversible. **Step 4 is not.**

1. **Name the version.** On a branch, edit `packages/orb/CHANGELOG.md`:
   - Rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`.
   - Open a fresh, empty `## [Unreleased]` above it.
   - At the bottom, point `[Unreleased]` at `compare/vx.y.z...HEAD` and add an `[x.y.z]` link to its release.

   Then set `version` in `packages/orb/package.json` to match.
2. **Land it on `main`.** Open a pull request with those two files, let CI pass, and merge it.
3. **Read what will ship.** Pull `main`, then:
   ```bash
   npm run verify:package
   npm publish --dry-run -w @lumaform/orb
   ```
   The file list should be `src/`, `index.d.ts`, `README.md`, `LICENSE`, `CHANGELOG.md` and `package.json`, and nothing else. `verify:package` has already installed this tarball in a scratch project and imported every subpath. Running the Publish workflow by hand does the same in CI.
4. **Tag the merged commit and push the tag.** This publishes, and it is irreversible:
   ```bash
   git tag -a vx.y.z -m "@lumaform/orb x.y.z"
   git push origin vx.y.z
   ```
   Watch the run under Actions → Publish. When it's green, the version is on npm and the GitHub release exists.
5. **Check it from the outside.**
   - `npm view @lumaform/orb version` shows the new version.
   - The npm page renders the README and shows the provenance badge.
   - A fresh install works: in an empty directory, run `npm install @lumaform/orb three`, then import `@lumaform/orb`, `@lumaform/orb/engines`, `@lumaform/orb/audio` and `@lumaform/orb/internal`.

### If the workflow fails

- **Before the "Publish to npm" step:** nothing was published and the version is not spent. Fix the cause, delete the tag (`git push origin :refs/tags/vx.y.z` and `git tag -d vx.y.z`), and tag again.
- **At "Publish to npm":** check the trusted publisher settings on npmjs.com against the workflow (repository, file name, case). In an emergency, publish by hand from an up-to-date `main` with `npm publish -w @lumaform/orb`. It asks for your second factor, which is why it still works while tokens are disallowed. Then create the release as below.
- **Only at the release step:** the package is already published. Create the release by hand:
  ```bash
  awk '/^## \[x.y.z\]/{on=1; next} /^## \[|^\[[^]]+\]: /{on=0} on' packages/orb/CHANGELOG.md > /tmp/notes.md
  gh release create vx.y.z --title "@lumaform/orb x.y.z" --notes-file /tmp/notes.md --verify-tag
  ```

## If something is wrong after publishing

Publish a fixed patch release. Don't `npm unpublish`: it is refused after 72 hours, and even within them it breaks anyone who already installed the package. Warn people off a bad version instead:

```bash
npm deprecate @lumaform/orb@<version> "<why, and which version to use>"
```
