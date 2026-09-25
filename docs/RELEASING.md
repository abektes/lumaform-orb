# Releasing `@lumaform/orb`

Only the runtime is published, as [`@lumaform/orb`](https://www.npmjs.com/package/@lumaform/orb). The studio stays `private` for good: it is the instrument, not a dependency.

## What happens automatically, and what doesn't

| Event | What runs | Automatic? |
|---|---|---|
| Pull request opened or updated | CI: `npm ci`, `npm test`, `npm run build`, `npm run verify:package` | Yes |
| Merge to `main` | CI again, and Railway redeploys the studio at [orb.lumaform.xyz](https://orb.lumaform.xyz) | Yes |
| New version on npm | The checklist below | **No** |
| Git tag and GitHub release | Steps 6 and 7 below | **No** |

**Merging never publishes.** The runtime on `main` can be ahead of the version on npm for as long as you like; users get the new code only when someone runs the release. That is deliberate. A published version can be deprecated but never reused, so a person decides when one is spent. [Automating publishing](#automating-publishing-not-set-up) describes how a tag could trigger it instead.

## Who owns what

- **npm organisation:** `lumaform`, owner `abektes`. Only its members can publish `@lumaform/*`. Add a maintainer under the organisation's Members page on npmjs.com.
- **Two-factor authentication is required to publish.** npm refuses a publish from an account without it, with `E403 … Two-factor authentication or granular access token with bypass 2fa enabled is required`. Nothing is uploaded when that happens, so the version is not spent. Turn it on under Account → Two-Factor Authentication, covering *authorization and writes*, and check it with `npm profile get`.
- **Log in** with `npm login`, and check it with `npm whoami`.
- **`main` is protected** by the GitHub ruleset "Protect main". Every change lands through a pull request whose `test` check passed, history stays linear, and `main` cannot be force-pushed or deleted. Repository admins can bypass only when merging a pull request, never by pushing directly. Because releases publish from `main`, everything that reaches npm has passed CI.

## Keep the changelog as you go

Every pull request that changes what a runtime user sees adds a line under `## [Unreleased]` in [packages/orb/CHANGELOG.md](../packages/orb/CHANGELOG.md), in the right group (`Added`, `Changed`, `Fixed`, `Removed`). That covers an export, an engine's look or behaviour, a parameter, or the config format. Studio-only changes don't go there. At release time the section is already written, and the version number follows from it.

## Choosing the version

The package is pre-1.0, which changes what the numbers mean:

- **Patch (`0.1.x`):** fixes only. No export changes shape, and no saved config renders differently except where it was broken.
- **Minor (`0.x.0`):** anything else. That includes every breaking change: a removed or renamed export, or a parameter whose name, range or meaning changes (saved configs depend on those).
- `@lumaform/orb/internal` is outside semver, as its header says. Changing it never forces a minor.

1.0 is the point where the API is promised to hold. Nothing forces it; see [VISION.md](VISION.md) §6.

## Every release

Steps 1–4 are reversible. **Step 5 is not.**

1. **`main` is green.** CI has passed on the latest commit. Run `npm test`, `npm run build` and `npm run verify:package` locally too if anything changed since.
2. **Name the version.** In `packages/orb/CHANGELOG.md`:
   - Rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`.
   - Open a fresh, empty `## [Unreleased]` above it.
   - At the bottom, point `[Unreleased]` at `compare/vx.y.z...HEAD` and add an `[x.y.z]` link to its release.

   Then set `version` in `packages/orb/package.json` to match.
3. **Land it on `main`.** Open a pull request with those two files, let CI pass, merge it, and pull. Publish from an up-to-date `main`, so what is on npm is what is on `main`.
4. **Read what will ship:**
   ```bash
   npm run verify:package
   npm publish --dry-run -w @lumaform/orb
   ```
   The file list should be `src/`, `index.d.ts`, `README.md`, `LICENSE`, `CHANGELOG.md` and `package.json`, and nothing else. `verify:package` has already installed this tarball in a scratch project and imported every subpath. Note the `shasum`: the published one should match it.
5. **Publish** (irreversible):
   ```bash
   npm publish -w @lumaform/orb
   ```
   npm asks for your second factor, either through a browser prompt or a code. With an authenticator app, you can pass the code directly: `--otp=123456`. Success prints `+ @lumaform/orb@x.y.z`.
6. **Tag the published commit** and push the tag:
   ```bash
   git tag -a vx.y.z -m "@lumaform/orb x.y.z"
   git push origin vx.y.z
   ```
7. **Create the GitHub release** from the tag, with the changelog section as its notes. The changelog links point at this release.
   ```bash
   awk '/^## \[x.y.z\]/{on=1; next} /^## \[|^\[[^]]+\]: /{on=0} on' packages/orb/CHANGELOG.md > /tmp/notes.md
   gh release create vx.y.z --title "@lumaform/orb x.y.z" --notes-file /tmp/notes.md --verify-tag
   ```
8. **Check it from the outside.**
   - `npm view @lumaform/orb version dist.shasum` shows the new version and the shasum from step 4.
   - The npm page renders the README.
   - A fresh install works: in an empty directory, run `npm install @lumaform/orb three`, then import `@lumaform/orb`, `@lumaform/orb/engines`, `@lumaform/orb/audio` and `@lumaform/orb/internal`.

## If something is wrong after publishing

Publish a fixed patch release. Don't `npm unpublish`: it is refused after 72 hours, and even within them it breaks anyone who already installed the package. Warn people off a bad version instead:

```bash
npm deprecate @lumaform/orb@<version> "<why, and which version to use>"
```

## Automating publishing (not set up)

npm's [trusted publishing](https://docs.npmjs.com/trusted-publishers) lets a GitHub Actions workflow publish without any npm token stored in the repository. The workflow proves its identity to npm with a short-lived OIDC token instead. If this repository adopts it:

- **What it would automate:** steps 4–5, and 6–7 with a little more work. Pushing a `v*` tag would run the tests and publish that exact commit.
- **What stays manual:** steps 1–3. A person still names the version and writes the changelog, because only a person knows whether a change is breaking.

Setting it up takes three things:

1. **A workflow triggered by a tag** (for example `.github/workflows/publish.yml` on `push: tags: ['v*']`). It needs `permissions: id-token: write`, and must run on **npm 11.5.1+ and Node 22.14+**. The existing CI runs Node 20, so this job needs its own `setup-node` version. The job runs `npm ci`, `npm test`, `npm run verify:package` and `npm publish -w @lumaform/orb`.
2. **A trusted publisher on npm.** Configure it in the package's settings on npmjs.com, naming this repository and that workflow file, or run `npm trust github @lumaform/orb --file publish.yml --repo abektes/lumaform-orb`.
3. **Tokens disallowed.** Once a trusted publish has worked, set the package's publishing access to require two-factor authentication and disallow tokens. That setting does not affect the OIDC route.
