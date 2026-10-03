# Orb templates: states, a finish pass, and copy that doesn't read as generated

**Date:** 2026-10-03 · **Status:** approved in conversation, awaiting spec review · **Target:** `@lumaform/orb` 0.3.0

## 1. Problem

Two signals arrived at once.

- **Reddit feedback called the orbs "AI-generated".** Compared with [shadercn](https://www.shadercn.run/docs/components/orbs/orb-07) the studio reads as a sampler with no single voice: 45 engines at different framings, edge treatments and palettes; a default palette of neon cyan, magenta and acid yellow on black under heavy bloom; bodies lit as gradient spheres with a fresnel rim; an opaque canvas that only works on black. The copy is the loudest tell: the page title is "Hyper-Geometric 3D Shaders", and presets describe "lime quantum photon packets" against "pure obsidian void".
- **shadercn ships what `thinking-orbs` shipped** (VISION §9.1): a fixed set of finished looks, each with `idle`, `thinking` and `speaking`, consumed in one line. That is the second market signal pointing the same way, and the first one we can act on.

What developers adopt is someone else's good taste with states attached. We have the instrument for producing taste and no way to ship it.

## 2. Decisions

| Decision | Why |
| --- | --- |
| **Build named states now.** VISION §3 and §8 deferred `setState()` until exploration produced a vocabulary. | Two independent products converged on idle / thinking / speaking. The burden of proof §9.1 asked for has been met from outside. The vocabulary stays open in the format (§7); only the starter set is fixed. VISION is updated in the same change. |
| **A template is a v2 config, not a separate format.** | Templates, studio exports and findings stay one format. §6 already promised the redesign "around states and transitions"; the version field exists so this is a migration. |
| **Templates live in the runtime**, at `@lumaform/orb/templates`. | Presets live in the studio and never reach an app. A drop-in template has to be importable. |
| **A state may change only what modulation may change, plus colours.** No rates, no `geometry` section, no selects. | The two invariants (never modulate a rate, never a geometry param) hold for a 600 ms ease exactly as for a 60 fps LFO. Enforced on load, not by author discipline. Selects can be allowed later; removing them once templates rely on them would not be possible. |
| **Speed between states is `tempo`**, folded into the integrated frame step. | A rate cannot be eased without the jump. Tempo multiplies the delta before it is banked, which is safe to ease. |
| **Polish comes from curation plus a shared finish pass**, not new engines. | Fastest visible change. New volumetric engines can be added as templates later. |
| **No framework wrapper.** | §5. A React snippet in the guide, not a package. |

## 3. Config v2

```json
{
  "version": 2,
  "engine": "regard",
  "global": { "exposure": 1, "transparentBg": true, "lightCoverage": 0.6 },
  "params": { "attention": 0.05, "focusColor": "#ffc978" },
  "modulation": { "routes": [] },
  "states": {
    "idle":     { "params": {}, "tempo": 1 },
    "thinking": { "params": { "attention": 0.85, "searchSpread": 0.75 }, "tempo": 1.4 },
    "speaking": { "params": { "focusGlow": 1.6 }, "tempo": 1.1 }
  },
  "initialState": "idle",
  "transition": { "durationMs": 600, "easing": "easeInOut" }
}
```

- `params` is the base look. A state's `params` is a **patch** over it: only what differs.
- `states`, `initialState` and `transition` are optional. Without `states` a file is a single look, as today.
- `tempo` defaults to 1, range 0.25–4.
- State names are free strings. Templates use `idle`, `thinking`, `speaking`.
- `transition.easing` takes the names `packages/studio/src/core/easing.js` already defines; `durationMs` defaults to 600.
- **Migration v1 → v2 is a no-op** (`(config) => ({ ...config, version: 2 })`). Every existing file loads unchanged. A v2 file on a 0.2 build is refused by the existing newer-version check, which names both versions.
- **`sanitizeStates(states, defs)`** sits beside `sanitizeParams`. It drops any key that is not `isModulatable()` and is not a non-geometry colour, clamps numbers, validates colours and tempo, and returns `{ states, dropped }` with dropped entries as `"<state>.<key>"`. `readConfig` returns the sanitized states alongside `params`, and the dropped keys join its existing `dropped` list.

## 4. Runtime

**`state-tween.js`** moves down from `packages/studio/src/core/param-tween.js` into `packages/orb/src/core/`, together with the easing curves it needs. Both are already pure and dependency-free. It is exported from `./internal`, and the studio imports it back from there, so the dependency still runs one way.

**`OrbRuntime`**
- `mountEngine(type, { params, global, modulation, states, initialState, transition })`. Still one engine's params, never a store.
- `setState(name, { durationMs, easing } = {})`
  - Unknown name: `console.warn`, return `false`, change nothing.
  - Known name: start a tween from the values currently applied (not the previous target) to `base ⊕ states[name].params`, and ease `stateTempo` from its current value to the state's tempo. Return `true`.
  - An interruption mid-transition therefore never jumps.
- `advance(delta)` steps the tween when one is running and applies its output as base params; modulation still applies on top. The frame step becomes `delta · timeScale · mod.timeScale · stateTempo`.
- `get state()` returns the current state name, or `null`.
- No new hooks. The host calls `setState`; nothing calls up. `runtime-seam.test.mjs` continues to hold.

**`createOrb`**
- New options: `template` and `state`. A template supplies its engine factory and config; `config` and `engines` keep working unchanged.
- The handle gains `setState(name, opts)`, `state` and `states` (the list of names).

## 5. The finish pass

One `ShaderPass` after `OutputPass` (display-referred sRGB) and before the background pass. It adds five globals, each defaulting to identity, so every existing config renders identically. While all five are at their defaults, the pass sets `enabled = false`.

| Global | Range | Default | Effect |
| --- | --- | --- | --- |
| `contrast` | 0.5–2 | 1 | S-curve around mid-grey |
| `saturation` | 0–2 | 1 | Toward luminance, or away from it |
| `grain` | 0–0.15 | 0 | Animated fine noise, scaled by coverage so empty background stays clean. Seeded from virtual time, so pausing freezes it. |
| `edgeFade` | 0–1 | 0 | Radial alpha and light falloff around the framed orb. The radius comes from `framing.js`, so it follows zoom and portrait fit. |
| `lightCoverage` | 0–1 | 0 | Transparent mode only: raises alpha toward the light's luminance, so additive glow shows on a light page instead of vanishing into white. |

**Grid cells** run contrast, saturation and grain, which are per-pixel. `edgeFade` needs each cell's centre and is left out of cells, alongside bloom; VISION §5 records it.

Templates mostly lower bloom. The glow should come from the shader, not a full-screen blur.

## 6. Templates

`packages/orb/src/templates/<name>.js`, one per template, re-exported from `templates/index.js`:

```js
import { createRegardEngine } from '../engines/regard-engine.js';
export const ember = Object.freeze({
  id: 'ember', name: 'Ember', description: 'A warm light that holds your gaze, then looks away to think.',
  engine: createRegardEngine,
  config: { version: 2, engine: 'regard', /* … */ },
});
```

Each template imports only its own engine, so the import list is still the bundle. The package adds `"./templates": "./src/templates/index.js"` to `exports` and declares the types in `index.d.ts`.

**Requirements for every template**
- `idle`, `thinking` and `speaking`, using only allowed keys.
- `transparentBg: true` and a `lightCoverage` that reads on white.
- The finish globals set, and bloom low.
- A one-word name for its character, never the engine's name, and a one-line plain description.

**First set (8), to be confirmed while authoring**

| From the original engines | From the 22 new |
| --- | --- |
| `regard` | `caustics` |
| `vocalis` | `chladni` |
| `echorings` | `mosaic` |
| `nebula` or `aqueous` | `nacre` |

## 7. Copy

- The page `<title>` becomes "Lumaform Orb".
- All 45 catalog entries get their `name`, `badge` and `description` rewritten in plain language, and parameter labels that read as generated ("Primary Energy", "Quantum Core") are renamed. Labels and descriptions are display text; **parameter keys do not change**, so saved configs keep loading.
- Preset descriptions are rewritten where the guard flags them.
- **`copy-hygiene.test.mjs`** (studio): a banned-word list covering quantum, cyber, hyper-, void, obsidian, pristine, ethereal, matrix, celestial, transcendent and the like. It scans catalog names, badges, descriptions and labels, preset names and descriptions, template copy, and the page title. A miss fails with the file, the entry and the word.

## 8. Studio

**States strip, Ship tab**
- Three slots: idle, thinking, speaking.
- **Set as idle** stores the current look as the base. **Set as thinking** and **Set as speaking** store the diff from the base, sanitized by `sanitizeStates`.
- Keys the sanitizer dropped are listed under that state as "not carried into the state", next to its **tempo** slider.
- I / T / S preview buttons call `runtime.setState()` directly, with duration and easing controls.
- Slots live in the store (`state.templateStates`) and change only through store methods. They belong to the active engine and are cleared on engine switch.

**Templates in Library → Presets**: a section above the curated presets. Clicking one loads its look and states and shows I / T / S on the dock.

**Export and import** write and read v2 with states. A file without states clears the slots.

**Not in this version**: renaming states, per-state grid mutation, states in the rehearsal room.

## 9. Tests

**Runtime (`packages/orb/tests`)**
- `state-tween.test.mjs`: interpolation and range clamping; colours lerp; disallowed keys never interpolate; an interruption starts from the current values; landing exactly on the target.
- `set-state.test.mjs`, against a stub engine:
  - an unknown name returns `false` and changes nothing;
  - tempo eases without a jump in accumulated virtual time;
  - modulation still applies on top of a state;
  - `state` reports the name.
- `config-v2.test.mjs`: v1 → v2 no-op; v0 → v2 through the chain; v3 refused; `sanitizeStates` drops rates, geometry params and selects, and reports them as `state.key`.
- `finish-pass.test.mjs`: defaults leave the pass disabled; any non-default enables it.
- `templates.test.mjs`: every template loads through `createOrb`'s config path; has the three states; all state keys survive `sanitizeStates` unchanged; transparent background with `lightCoverage > 0`; its `engine` factory matches the engine named in its config; it is exported from the barrel; its copy passes the banned-word list.

**Studio (`packages/studio/tests`)**
- `copy-hygiene.test.mjs`.
- Store round-trips for state slots, and export → import with states.

**In the browser**: each template in `examples/embed` on a white page and a black page, all three states and the transitions between them, with screenshots in the PR.

## 10. Release (0.3.0, minor)

| Section | Entries |
| --- | --- |
| **Added** | 22 engines; `@lumaform/orb/templates`; `setState`; config v2 with `states`; the finish globals |
| **Changed** | Flux's default `layout` becomes `orb`; plain catalog copy |
| **Removed** | `aetheria`, `murmuration` (to confirm before tagging) |
| **Fixed** | The Auris and Polytope disposal leaks |

Engines from the 22 that don't survive review are cut before tagging, while removing one is still free.

## 11. Build order

1. Three independent pieces: **config v2 and `setState`**, **the finish pass**, and **the copy rewrite and its guard**.
2. **The studio States strip**, which needs the first piece.
3. **Authoring the 8 templates**, in the studio, with the maintainer.

VISION.md is updated in step 1: §3 and §8 record the reversal and why, the §7 decision log gains entries, and §9.1 cites shadercn as the second signal.

## 12. Risks

- **The templates may still read as generated.** The finish pass and curation are the bet; the maintainer judges each template on a white and a black page before it ships. A template that doesn't land is cut, not shipped to make up the number.
- **`lightCoverage` may wash out dark bodies.** It applies only in transparent mode and only where there is light; check Regard's dark body on white specifically.
- **Grid cells still look less finished than the main view** without `edgeFade` and bloom. Known and documented, as bloom already is.
- **Several pieces touch `runtime.js`** (`setState`, `stateTempo`, the finish pass). It must stay under the 1k-line cliff (`file-size.test.mjs`); the tween and the pass live in their own modules.

## 13. Out of scope

New volumetric engines, a React package, brand-colour ingestion, video export per state, renaming states in the studio, and selects in states.
