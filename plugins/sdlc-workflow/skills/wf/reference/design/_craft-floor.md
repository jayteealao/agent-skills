# Craft floor (`design/_craft-floor.md`)

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

The quality floor of every UI that a workflow draws or builds. This file is the one place that states the floor. Every other design file links here and does not repeat a number. The floor holds mechanics only. It never picks a direction, a palette, a face or a shape: those are the direction and the tokens of `DESIGN.md`.

Load it after the direction is settled, immediately before you draw or edit UI. Build against it. Do not announce the checklist. A pinned brief or the confirmed design overrides a line marked `judgment`. Nothing overrides a line marked `check`.

Do not load this file during a brainstorm, design stage Steps 1–3b, `shape`, `slice` or `plan`. A list of refusals that is present while you invent pushes every direction to the safe middle.

> Load with: `design/_craft-floor.md`

| Where | When | How |
|---|---|---|
| Design stage Step 4, and amend | Before the first screen | Draw every screen against it. |
| Design stage Move pass, and import | Step 1 of the pass; with the import | A checklist. |
| `implement` | Before the first UI file edit of the slice | Build against it. |
| `verify`, `review`, `/wf design audit` | At the design checks | A checklist: Verify and the Refuse lists. |
| `/wf design critique` | At the specificity verdict | The Refuse lists only, as evidence. |
| Record writes: `setup`, `teach`, `sync`, `direction`, `extract`, `retro`, the token roles at freeze | Before the write | The Record guard only (`record.md` → Floor guard). |
| `02c-craft.md` `## Anti-patterns to avoid` | Design stage Step 6 | Name the refusals that apply to this feature. |

## Verify

Check the built result, not the intention. Run all lines together in one look at the result.

**Held by.** `check` means `wf.mjs design check` measures the line on every screen page, in each viewport and state, and the person sees each failure in the approval question. `judgment` means a person or a reviewer reads it; the check does not.

| # | Rule | Value | Held by |
|---|---|---|---|
| 1 | Text contrast | 4.5:1; 3:1 for large text (24 px, or 18.66 px bold, and larger). A disabled control is exempt. | check, also in the forced hover, press and focus states |
| 2 | Focus indicator | Every control shows a visible change on keyboard focus. A focus ring has 3:1 against the ground beside it. | check |
| 3 | Control and state-indicator contrast | 3:1 against the adjacent ground. Text over an image or a gradient meets rule 1. | judgment |
| 4 | Target size | The hit area of a control is at least 24 by 24 CSS px. The check measures the box of the control, the box of a pseudo-element that extends it, or a label that wraps it. Two hit areas never overlap. | check |
| 5 | Touch target | On a touch surface, design to the touch size: 44 pt on iOS, 48 dp on Android, 44–48 px for a coarse pointer on the web. | judgment |
| 6 | Viewport fit | No horizontal scroll in any viewport of `screens.json`. | check |
| 7 | Worst-case content | In the `worst` state, no text is cut off by a box that hides overflow, unless the box truncates on purpose (an ellipsis or a line clamp). | check |
| 8 | Display bugs | No `undefined`, `null`, `NaN` or `[object Object]` as text. Every image loads. | check |
| 9 | Overlap | No two pieces of text cross. | check |
| 10 | Script | The page runs with no script error. | check |
| 11 | Tokens | Every color is a token of `tokens.css`, used through `var()`. This includes the color of a shadow, an outline and a ring. | check |
| 12 | Components | A control stands inside a component of the library. A screen places a component and never restyles it. | check |
| 13 | Page states | Every screen has `default`, `empty`, `loading`, `error` and `worst` ([_surface.md](_surface.md)). | check |
| 14 | Control states | Every control has default, hover, focus, active and disabled. Where they apply, it also has selected, loading, error and success. | check forces hover, press and focus; judgment for the rest |
| 15 | Color is never the only signal of a state | Add a shape, a label or a glyph. | judgment |
| 16 | Secondary text on a colored ground | Take it from the hue of the ground or from the foreground. Do not use gray there. | judgment; rule 1 still measures it |
| 17 | Measure | Body prose at 65–75 characters per line. A narrow column may go down to 45. Data tables and UI labels have no measure. | judgment |
| 18 | Text size | Body prose at the platform body size or larger (16 px on the web). A dense UI role may go down to 12 px. No text below 12 px. | judgment |
| 19 | Line height | Body prose 1.5 or more. Dense UI text 1.4 or more. Headings and display type 1.1 or more. | judgment |
| 20 | Tracking | No tighter than −0.04 em. | judgment |
| 21 | Display size | At most six times the base size (`6rem` on the web). | judgment |
| 22 | Text holds at every width | Run the real copy at every viewport and at the largest text size of the platform. Fix each overflow. | judgment; rules 6, 7 and 9 measure part |
| 23 | Elevation is declared once | A surface shows its elevation with one depth token: a border, or a shadow. A separate border under a wide soft shadow is a fault. A shadow that shows elevation has an offset and a soft blur. A zero-offset ring is an edge, not elevation. | judgment |
| 24 | Reduced motion | The reduced-motion setting gives fewer and gentler motion, not zero. Keep opacity and color. Remove movement and scale. Do not set every duration to zero globally. | judgment |
| 25 | Bounce | No bounce or elastic easing on an Operate or Read surface. A Persuade or Experience surface may use a spring with bounce 0.1–0.3 when its direction calls for play ([animate.md](animate.md)). | judgment |
| 26 | Flashing | No content flashes more than 3 times a second. | judgment |
| 27 | System parts | Text selection, the caret, the scrollbar, the focus ring, the link underline and the numerals in tables carry the palette. Theme their color. Do not change their behavior. | judgment |
| 28 | Copy | The product's own words. A control names its action. An error names the problem and the recovery ([clarify.md](clarify.md)). | judgment |
| 29 | Coverage | Every item of the `02c-craft.md` `## Mock fidelity inventory` is present and easy to find. | judgment |

Rules 17–21 are limits, not targets. The type tokens of `DESIGN.md` set the values inside them ([typeset.md](typeset.md)).

## Refuse — always

No brief earns these back. When you find one, rewrite the element. Do not soften it.

- A colored side stripe above 1 px on a card, a list item, a callout or an alert. Use a full hairline border, a background tint or a leading glyph.
- A card nested in a card.
- Bounce or elastic easing on an Operate or Read surface (rule 25).

## Refuse — defaults the brief can earn

These are the defaults of the category. The brief's own words, or the direction that the person picked, can earn one of them. When you reach for one by habit, you did not decide: rewrite the element.

Page scaffolds:
- Same-size cards of icon, heading and text as the page structure.
- The hero-metric template (a big number, a small label, supporting stats) without real product proof.
- Section numbers (01, 02, 03), unless the sequence carries information that the reader needs.
- A modal for a task that needs no interruption and no protected focus.

Surface habits:
- Gradient text. Take emphasis from weight or size.
- Glass and blur as decoration. The glass material of a native platform, used as that platform uses it, is not decoration.
- Hard offset shadows outside a world that is neobrutalist.
- Sparklines, progress rings and soft rounded rectangles in place of content.
- Monospace as a "technical" costume. Use it for code, data and measurement.
- A system display face as the display voice of a Persuade or Experience surface.
- Emoji or text glyphs in place of an icon system. Draw icons from one library, in one stroke and one weight.
- A geometric mask that fakes the organic edge of a photographed subject. Use a real cut-out asset, or omit the effect.
- Light or dark picked by category. Pick it from the use scene: who, where, under what light.
- Purple-blue generic gradients.
- A cream or off-white ground, italic accent words in headlines, and pill buttons, each taken as a default.

## Model tells

Models make these when no rule stops them. Refuse each one.

- A 1 px border under a wide soft shadow: the ghost card (rule 23).
- Sketch-style vector scenes and noise grain that pose as illustration. Use real illustration or none. Exact vector geometry, diagrams and line animation stay valid.
- Stripe and grid backgrounds with no canvas, map, blueprint or measuring tool under them.
- Illustrative values without an "illustrative" label. Take claims and configuration from supplied truth.
- One radius, one shadow and one spacing value taken from habit, not from the shape, depth and space tokens of `DESIGN.md`.

## Record guard

Do not write a refused element into `DESIGN.md` or `.ai/design/current.md` as a system rule. Record it as design debt in `current.md` → `## Design debt` (`record.md`).

When you are torn between refined and committed, commit.
