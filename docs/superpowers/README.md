# Plans and specs

**These are historical records, not live documentation.**

Every file under `plans/` and `specs/` describes the state of the codebase on the day it was written. Many were written before the repository became an npm workspace, so they reference paths that no longer resolve — `src/core/studio.js` rather than `packages/studio/src/core/studio.js`, `node tests/<name>.test.mjs` rather than `npm test`, `npx vite build` rather than `npm run build`.

**That is on purpose.** A plan is a record of what was decided and why, at a moment. Rewriting one so its paths match today would make it lie about its own moment — and the reasoning is the part worth keeping, which the stale paths do not affect. Read them as dated documents, the way you would read a commit message.

If you want to know how the code is laid out **now**, read these instead:

| | |
|---|---|
| [README.md](../../README.md) | What the project is, how to run it, the current layout |
| [CLAUDE.md](../../CLAUDE.md) | The invariants that break in hard-to-trace ways |
| [docs/VISION.md](../VISION.md) | Why this exists, and why several decisions are not arbitrary |
| [docs/ENGINE-AUTHORING.md](../ENGINE-AUTHORING.md) | The engine contract |
| [packages/orb/README.md](../../packages/orb/README.md) | The runtime package's own API |

Those four are live and are expected to be correct. If one disagrees with the code, that is a bug — the code is not the documentation's excuse.

## What is in here

**`specs/`** — designs agreed before implementation. What is being built, what is deliberately out of scope, and why. A spec's *Scope* section is usually the most durable part: it records decisions that were taken rather than defaults that were fallen into.

**`plans/`** — step-by-step implementation plans written from a spec. Task-level, with the exact code each step adds. Most are complete; a plan is not deleted when it is finished, because the order in which something was built explains a lot about its shape.
