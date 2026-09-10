# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: a designer and a frontend engineer working as a pair.** The designer explores in the tool and hands a config to the engineer, who wires it into a real product. Both halves of that handoff carry weight — the visual artifact the designer judges by, and the config object the engineer consumes — so neither can be pushed out of sight in favour of the other.

The handoff itself is therefore a product surface, not a file-format detail. Work that makes the config easier to read, diff, or trust is user-facing work.

The author is currently the tool's only regular operator. That is a fact about today, not a decision to optimize for a single user.

## Product Purpose

Lumaform Orb is an instrument for discovering what movement makes an ambient orb read as **thinking** — and by extension listening, speaking, idle, interrupted, error.

An AI-communication orb has one job: answer *what is the AI doing right now?* pre-attentively, in well under a second. That is a **legibility** problem, not a beauty problem, and nobody on this project can currently write down what "thinking" looks like as a parameter set. The tool exists to find that out by playing.

Success is a raised **discovery rate**: more candidate motions seen, compared, and kept per session than tuning one slider at a time could ever produce.

It is explicitly **not** a component library, not an embeddable runtime, and not (yet) a design system.

## Positioning

Twenty-two independent shader engines — wireframes, raymarchers, particle swarms, spring networks, physical bodies — all driven through **one parameter schema and one render loop**. Adding an engine is one file plus one catalog entry; the schema alone generates every control in the panel.

The mechanism a neighbouring tool could not truthfully copy is the combination of that uniformity with instruments built for comparison rather than for authoring:

- nine mutations rendered simultaneously, each with its own clock and patch;
- two configs swapped **without rebuilding the engine**, so the animation never restarts and motion can be judged against motion rather than against memory;
- a modulation rack that supplies motion *shape* — hesitation, acceleration, settle — to engines that natively only offer faster and slower.

The strategic position is stated in `docs/VISION.md` §3 and is load-bearing: **exploration before specification.** A proposal that begins "let us define the format for…" is presumed premature until it can say what it lets you discover.

## Operating Context

Runs in a browser. Live publicly at **orb.lumaform.xyz**; locally via `npm run dev` at port 5173.

The working loop:

1. Pick an engine from the top-bar dropdown, or load it directly with `?engine=<id>`.
2. Tune through schema-generated tabs — Colors, Geometry, Motion — or start from one of 54 curated presets.
3. `G` opens a 3×3 variation grid; click to promote a cell, shift-click to mark. Mutation breadth and radius control how many parameters move and how far.
4. `K` ladders one parameter across five cells to see what it actually does.
5. `1` / `2` store two candidates; `` ` `` swaps them without restarting the animation.
6. `C` keeps a finding, `S` takes a PNG, `V` records up to 30 seconds of clip, `E` exports marked cells.
7. Motion Lab routes LFO / fbm noise / envelope / live microphone onto parameters and onto tempo.

Sessions are exploratory and fast. The tool is operated by keyboard as much as by panel.

## Capabilities and Constraints

**Confirmed capabilities:** 22 engines; schema-driven UI with no per-engine control code; variation grid and parameter sweep; A/B compare without engine rebuild; modulation rack with live audio input; rehearsal sequencing between findings; JSON export/import, PNG snapshot, WebM/MP4 clip recording, localStorage presets, findings shelf; a source-scanned keyboard map.

**Technical constraints that are product decisions, not accidents:**

- **No framework.** Vanilla JS, ES modules, Vite. Runtime dependencies are `three` and `shiki` and nothing else. Most component libraries are therefore unavailable; that cost is known and accepted.
- **The export format is a lab notebook.** It must round-trip. It carries a `version` field so a future redesign can migrate old files, but it has no state vocabulary and no stability guarantee. Nothing should be built that depends on its shape holding. See [docs/VISION.md](docs/VISION.md) §6.
- **Rate parameters are never modulated** (engines compute `angle = time × rate`, so changing a rate mid-flight rewrites the accumulated angle), and **geometry-section parameters are never modulated** (several engines rebuild geometry on change).
- **Grid cells render without bloom** deliberately; it is a full-screen pass that bleeds across scissored cells.

**Explicitly undecided — future work must not resolve these silently:**

- **Whether anyone will actually author named behaviour states.** `docs/VISION.md` §9 calls this the riskiest assumption in the project, and it remains genuinely open. If it turns out false, the state machine is over-engineering and the real product is brand-colour ingestion plus a clean export. Neither answer may be assumed.
- Whether reduced grid fidelity (no bloom, lower march quality) is close enough to judge by, or misleads.
- Whether the tool needs a picker for which parameter to sweep, or whether "the last one you touched" is sufficient.

## Brand Commitments

- **Lumaform Orb** is the binding product name, already live at **orb.lumaform.xyz**.
- Electric canary **`#ffed00`** is the established primary accent; the interface is dark-first.
- `docs/VISION.md` is the standing statement of intent and carries a decision log; `CLAUDE.md` and `docs/ENGINE-AUTHORING.md` carry the invariants. Future work amends these rather than contradicting them.

## Evidence on Hand

Real and citable:

- 22 working engines in `src/engines/`, with 54 curated presets in `src/presets/`.
- `docs/VISION.md` — purpose, architectural invariants, a decision log, and a list of deliberately deferred work.
- `docs/ENGINE-AUTHORING.md` and `docs/engine-briefs/` — the engine contract and proposed engines.
- `README.md`, `CLAUDE.md`.
- 23 plain-Node test files covering the DOM-free logic modules.

**Absences future work must not fabricate:** there are no users beyond the author, no testimonials, no case studies, no customer logos, no analytics, no benchmarks, no pricing, and no license file. The hosted demo exists; adoption of it is unmeasured.

## Product Principles

1. **Exploration before specification.** The state schema is the residue of exploration, not its input. Specifying first would freeze the motion vocabulary at whatever was already stumbled into.
2. **Discovery rate is the metric.** Anything that raises the number of candidates seen, compared, and judged per session beats anything that makes a single candidate marginally nicer.
3. **Capture or it never happened.** Exploration produces a stream of near-misses and occasional hits; without frictionless "keep this", exploration is amnesia.
4. **Motion is judged against motion.** Never against a still frame and never against memory — which is why the A/B swap must not restart the animation.
5. **The handoff is a surface.** The designer's artifact and the engineer's config are both deliverables; making one legible at the other's expense is a regression.

## Accessibility & Inclusion

No formal standard is committed to. Because the product's entire subject matter is motion, two obligations are treated as correctness rather than compliance:

- `prefers-reduced-motion` is honoured, and playback can be paused or slowed.
- Keyboard operation and legible contrast on the dark interface are maintained because the tool is keyboard-driven by design.
