# Archive

**Nothing in here runs, ships, or is maintained.** No file under `archive/` is imported by `packages/orb` or `packages/studio`, none is in the engine catalog, and none is covered by a test.

It is kept because these are the prototypes the current design argued with, and reading what was tried is often faster than rediscovering why it was dropped.

| | |
|---|---|
| `demos/` | Standalone HTML-era prototypes, each a single self-contained file with its own render loop. They predate the engine contract, the parameter schema and the modulation rack — every idea they explore now exists as a catalogued engine. |
| `engines/` | Engine factories that were written but never catalogued. See [engines/README.md](engines/README.md) for why each one was dropped. |
| `monolith-engine.js` | The single-file engine everything else was extracted out of. |
| `shared/` | Helpers the monolith used, superseded by `packages/orb/src/shared/`. |

If you are looking for how something works today, this is the wrong directory — see the [project README](../README.md) and [docs/](../docs/).

**To revive anything here**, treat it as a new engine rather than a restoration: it needs a catalog entry, a parameter schema and a disposal path. [docs/ENGINE-AUTHORING.md](../docs/ENGINE-AUTHORING.md) is the contract.
