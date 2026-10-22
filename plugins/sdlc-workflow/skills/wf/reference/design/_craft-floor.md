# Craft floor (`design/_craft-floor.md`)

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

The quality floor of every UI that a workflow draws or builds. Load it after the direction is settled, immediately before you draw or edit UI. Build against it. Do not announce the checklist. A pinned brief or the confirmed design overrides a default below. Your own habit does not.

Do not load this file during a brainstorm, design stage Steps 1–3b, `shape`, `slice` or `plan`. A ban list that is present while you invent pushes every direction to the safe middle.

> Load with: `design/_craft-floor.md`

| Where | When | How |
|---|---|---|
| Design stage Step 4, and amend | Before the first board | Draw every board against it. |
| Design stage Move pass, and import | Step 1 of the pass; with the import | A checklist. |
| `implement` | Before the first UI file edit of the slice | Build against it. |
| `verify`, `review`, `/wf design audit` and `critique` | At the design checks | A checklist: Verify and the Refuse lists. |
| Record writes: `setup`, `teach`, `sync`, `direction`, `extract`, `retro`, the token roles at freeze | Before the write | The Record guard only (`record.md` → Floor guard). |
| `02c-craft.md` `## Anti-patterns to avoid` | Design stage Step 6 | Name the refusals that apply to this feature. |

## Verify

Check the built result, not the intention. Run all checks together in one look at the result. Do not take one screenshot for each check.

- **Contrast.** Body text 4.5:1, large text 3:1, a focus ring 3:1 against the adjacent ground. On a colored ground, take secondary text from that hue or the foreground. Never use gray there.
- **Color is never the only signal** of a state. Add a shape, a label or a glyph.
- **Depth.** A shadow has an offset and a soft blur. A zero-offset colored halo is decoration.
- **Spacing.** Keep groups tight and separation wide. Put more space above a heading than below it. Read the measured values.
- **Type.** Body prose at 65–75 characters per line. Display size at most six times the base size (`6rem` on the web). Tracking no tighter than −0.04 em. Balanced headings, and clear steps of size and weight. Run the real copy at every width, and fix each overflow.
- **Motion.** One authored moment, not scattered effects. Never the same entrance on every section. Start from a visible default. The reduced-motion setting gives fewer and gentler motion, not zero: keep opacity and color, remove movement. Never set every duration to zero globally. `animate.md` holds the motion rules.
- **States.** Default, hover, focus, active, disabled, loading, error, empty, success. Real content and working controls at every width.
- **System parts.** Text selection, the caret, the scrollbar, the focus ring, the link underline and the numerals in tables carry the palette. Theme their color. Never change their behavior.
- **Copy.** The product's own words. A control names its action. An error names the problem and the recovery.
- **Coverage.** Every item of the `02c-craft.md` `## Mock fidelity inventory` is present and easy to find.

## Refuse — always

No brief earns these back. When you find one, rewrite the element. Do not soften it.

- A colored side stripe above 1 px on a card, a list item, a callout or an alert. Use a full hairline border, a background tint or a leading glyph.
- A card nested in a card.
- A kicker or eyebrow label above a heading. Delete the label. The heading carries its own weight.
- Bounce or elastic easing on an Operate or Read surface. A Persuade or Experience surface may use a spring with bounce 0.1–0.3 when its direction calls for play (`animate.md`).

## Refuse — defaults the brief can earn

These are the defaults of the category. The brief's own words can earn one of them. When you reach for one by habit, you did not decide: rewrite the element.

Page scaffolds:
- Same-size cards of icon, heading and text as the page structure.
- The hero-metric template (a big number, a small label, supporting stats) without real product proof.
- Section numbers (01, 02, 03), unless the sequence carries information that the reader needs.
- A modal for a task that needs no interruption and no protected focus.

Surface habits:
- Gradient text. Take emphasis from weight or size.
- Glass and blur as decoration, not as a specific effect.
- Hard offset shadows outside a world that is neobrutalist.
- Sparklines, progress rings and soft rounded rectangles in place of content.
- Monospace as a "technical" costume. Use it for code, data and measurement.
- A system display face as the display voice of a Persuade or Experience surface.
- Emoji or text glyphs in place of an icon system. Draw icons from one library, in one stroke and one weight.
- A geometric mask that fakes the organic edge of a photographed subject. Use a real cut-out asset, or omit the effect.
- Light or dark picked by category. Pick it from the use scene: who, where, under what light.
- Purple-blue generic gradients.
- A cream or off-white default ground, italic accent words in headlines, and pill buttons as the default button shape.

## Model tells

Models make these when no rule stops them. Refuse each one.

- A 1 px border under a wide soft shadow: the ghost card. Declare elevation once, as a border or as a shadow.
- Card radii outside 12–16 px. Use a pill only for a small control.
- Sketch-style vector scenes and noise grain that pose as illustration. Use real illustration or none. Exact vector geometry, diagrams and line animation stay valid.
- Stripe and grid backgrounds with no canvas, map, blueprint or measuring tool under them.
- Illustrative values without an "illustrative" label. Take claims and configuration from supplied truth.

## Record guard

Never write a refused element into `DESIGN.md` or `.ai/design/current.md` as a system rule. Record it as design debt in `current.md` → `## Design debt` (`record.md`).

The floor holds the mechanics. It never picks the direction. When you are torn between refined and committed, commit.
