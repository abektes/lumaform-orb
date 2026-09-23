# Regard — an orb with a front

**Status:** built (`packages/orb/src/engines/regard-engine.js`, catalog group `bodies`).
**Bet:** reads as **listening ↔ thinking** along one axis, and still reads at 20 px.

## The gap it fills

Every other engine is radially symmetric. Whatever they do — breathe, swirl, flock, ring — they do it *equally in every direction*, so none of them can say where their attention is. But "what is the assistant doing right now?" (VISION.md §2) is mostly a question about attention: is it on me, or elsewhere?

Humans read gaze pre-attentively and have a practised "thinking" read built on it: people avert their gaze while retrieving or computing, and return it to hand the turn back. Conversational-robot research has found the same cue makes machines read as thoughtful rather than broken. A symmetric orb cannot use any of this.

The motion shape is also missing from the library. Every engine moves continuously — oscillation, noise flow, springs, flocking. Eyes do the opposite: **ballistic jumps separated by still fixations**. The modulation rack cannot synthesise that either; sample-and-hold jumps, but without the eased flight or the dwell.

## The model

- **Attention** (0 → 1) rotates the *regard axis* from the viewer toward up-and-away, and widens the search cone. It is latched at each saccade, so a change is expressed as a glance after the current fixation. The hesitation before looking away is emergent, not animated. A large change (> 0.3) cuts the fixation short, so modulation and rehearsal tweens still feel responsive.
- **Saccades** follow a minimum-jerk profile, with duration growing with amplitude (the oculomotor main sequence), scaled to orb time by `saccadeSpeed`.
- **Fixations** last `dwell × U(0.45, 1.55)` seconds, with Ornstein–Uhlenbeck drift (`jitter`) so they are never dead still.
- **Blinks** accompany large gaze shifts with probability scaled by `blinks`, plus a rare spontaneous blink; lids close in 70 ms and open in 150 ms.
- **Pursuit:** offsets live in a frame centred on the regard axis, so a fixation on the viewer tracks an orbiting camera, and while attending the gaze follows the pointer.
- **Head follows eyes:** a critically damped spring leans the body toward the gaze, arriving after the look, never with it.
- **Click** = being addressed: an immediate saccade back to the viewer, a dilated and brighter focus, and a 1.4 s hold that attention cannot interrupt.
- Seeded PRNG: identical parameters produce identical glances, so the grid and A/B compare parameters, not dice.

## Measured (studio, hidden pane, injected 1/60 s delta)

| Check | Result |
|---|---|
| Mean gaze off-axis at attention 0 / 0.5 / 1 | 4° / 37° / 63°, always up-left |
| Time spent in saccade while attending | ≈ 5% of frames (17 / 359) |
| Largest single-frame gaze step under an LFO on attention | 9.1° (an eased ≈ 550°/s saccade, no teleports) |
| Focus separation, attending vs pondering, across the scale ladder | 0.30 · 0.29 · 0.29 · 0.29 · **0.26** of cell width at 256 → 20 px |
| Ten engine switches | 3 geometries / 13 textures before and after |
| Export → scramble → import | 16 params, 0 differences |

The ladder row is the strongest result: the listening/thinking distinction loses about 15% of its separation at inline-text size, because it lives in *where the light is*, not in fine structure.

## Things worth trying

- Rehearsal: **Regard Attending → Regard Pondering → Regard Attending**. It is one engine at two points on one axis, so the tween never rebuilds.
- An envelope on `attention` triggered per turn, or `audio1 → attention` with a negative amount: it looks at you while you speak and away while it "thinks".
- Grid with section lock on `motion` only: the nine cells become nine temperaments of the same gaze.

## Open questions

- **Uncanny risk.** Iris fibres and a limbal ring push it toward "eye". `irisFibres: 0` and a smaller `focusSize` read as a lamp instead. Which one people prefer is exactly the kind of thing the tool exists to find out.
- **Direction of aversion** is fixed (up-left). Aversion direction varies between people and cultures. It could become a parameter if the findings say it matters.
- It is the first engine where `autoRotateSpeed` is nearly invisible (the gaze is camera-relative). That is correct, but surprising.
