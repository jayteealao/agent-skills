Polish refines the details of a design that is already right. It does not hide a redesign. Keep the established world, content, behavior and everything outside scope. When the concept is wrong, say so, and recommend `bolder` or an amend.

Every value in this file that names a number is a default for a project whose tokens do not yet hold it. A token of `DESIGN.md` overrides it. The limits that no token overrides are in [_craft-floor.md](_craft-floor.md).

---

## Design mode

| Mode | Polished means |
|---|---|
| Persuade and Experience | The details are specific to this product: a hover state that is more than a color change, a transition with character. |
| Operate | The interface behaves as a skilled user expects. No surprise, no missing state, no rough edge. |
| Read | A calm column. Wayfinding stays consistent. Code, tables and notes use known forms. |

---

## Establish the system

1. Read `DESIGN.md`, the tokens, the component library and the neighboring flows.
2. Classify each drift before you fix it:

   | Drift | Meaning | Fix at |
   |---|---|---|
   | Missing token | The system needs a value that it does not hold | `DESIGN.md`: add the role |
   | One-off | A shared component or pattern should replace it | The component library |
   | Conceptual mismatch | The flow, structure or hierarchy differs from comparable areas | The screen; say so when it is a redesign |
   | Local defect | The screen is incomplete or inconsistent | The screen |

3. Fix the cause at the narrowest correct level.
4. When a system principle is not clear, ask the person. Do not guess.

## Triage

Fix in this order. Do not perfect one corner while the rest is below the bar.
1. Broken tasks, misleading state and inaccessible paths.
2. Missing states.
3. Drift in flow, hierarchy, responsive structure and system.
4. Inconsistency of detail and motion.

## The details

**Type.** The rules are in [typeset.md](typeset.md): tracking at display sizes, line height by role, line breaks, tabular numerals. Use real quotation marks and apostrophes in the copy. Hang the opening quotation mark of a block quote outside the text edge ([_platforms.md](_platforms.md) → hanging punctuation).

**Spacing.** Every spacing value is a step of the spacing tokens ([layout.md](layout.md) → The spatial system). A value that fits no step is a symptom: find the step that was meant. Check that padding asymmetry in a component is intended. Align an icon to the cap height of its label, not to the line box.

**Color.** Every color is a token ([_craft-floor.md](_craft-floor.md) rule 11). Replace a raw value with its token. Both themes read the same roles.

**States.** Every control has the states of [_craft-floor.md](_craft-floor.md) rule 14. A disabled control looks inactive and is not interactive. A loading skeleton matches the shape of the content that replaces it. The `empty` state follows [onboard.md](onboard.md), and the `worst` state follows [_worst-case.md](_worst-case.md).

**Transitions.** A state change that passes the gates of [animate.md](animate.md) has a transition from the motion tokens. A state change that fails the gates stays instant. Do not add motion to make polish visible.

**Consistency.** One icon size as the baseline of the surface. One radius family. One shadow per depth tier, not one per component. The same padding on the same kind of button.

### Shape

- Take each radius from the shape tokens of `DESIGN.md`. The direction decides whether corners are square, soft or round; this file does not.
- **Concentric radius.** When one rounded surface sits inside another, the outer radius equals the inner radius plus the padding between them. Equal radii on a padded parent and child look wrong. Past about 24 units of padding, treat the two as separate surfaces and choose each radius alone.

```css
/* Web: 8 px inner radius, 8 px padding, so 16 px outer radius. */
.panel { border-radius: 16px; padding: 8px; }
.panel > .item { border-radius: 8px; }
```

### Optical alignment

When geometric centering looks off, align by eye, and inspect the rendered result first. An icon beside a label takes about 2 units less padding on the icon side. A play triangle moves about 2 units toward its point. Fix a lopsided glyph (a caret, a star) in the icon itself.

### Depth

Depth is a token role of `DESIGN.md`, like color. A screen and a component use a shadow, a ring and an image outline through `var()`, and `wf.mjs design check` fails a raw color in a `box-shadow` or an `outline`.

- One surface declares its elevation once, with one depth token ([_craft-floor.md](_craft-floor.md) rule 23). A depth token may hold a hairline ring and a shadow together as one value. A separate border under a wide soft shadow is the fault.
- A border fits an edge that separates: a divider, a table boundary, an input outline. A shadow fits elevation, because it adapts to any ground behind it.
- In a dark theme, show elevation with a lighter surface for each higher layer. A shadow does not read on a dark ground; a neutral ring can mark the edge.
- An image takes a 1-unit outline inside its edge, so that a pale image does not bleed into the ground. Its color is a neutral: black or white at low opacity. A tinted outline picks up the color of the surface and reads as dirt.

With no depth tokens, start from these defaults, and write them into `DESIGN.md` as depth roles. Change them to fit the direction: a flat direction may hold borders only.

```css
/* Web defaults for the depth roles. tokens.css holds them; a page uses var(). */
--depth-1: 0 0 0 1px rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06), 0 2px 4px rgb(0 0 0 / 0.04);
--depth-1-hover: 0 0 0 1px rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08), 0 2px 4px rgb(0 0 0 / 0.06);
--image-outline: rgb(0 0 0 / 0.1);            /* dark theme: rgb(255 255 255 / 0.1) */

.card { box-shadow: var(--depth-1); }
img { outline: 1px solid var(--image-outline); outline-offset: -1px; }
```

### Hit area and system parts

- The hit area of each control follows [harden.md](harden.md) → Touch targets.
- The system parts carry the palette ([_craft-floor.md](_craft-floor.md) rule 27; [_platforms.md](_platforms.md) → system-part colors).

## Never

- Detail on a broken structure: a hover state on a layout that does not hold.
- A new behavior for a system part.
- Visual complexity in place of completeness.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says when each use runs. A note follows [_output.md](_output.md).

### At the design stage

The move changes the details of the screens and of the component library: the missing states, the values that fit no token, the radii, the depth tokens, the alignment, and the consistency of similar components. The contract records each drift with its class and its fix.

### As a pass on an approved design

The pass changes nothing. Walk each screen in each viewport and state. Write each answer as a finding with its screen key or `file:line`, its drift class and the fix.
1. Which control lacks a state of floor rule 14?
2. Which spacing, radius or depth value fits no token?
3. Which nested rounded surfaces are not concentric?
4. Which surface declares elevation twice, and which image has a tinted outline or none?
5. What differs between two components of the same kind?
6. Does the Verify list of [_craft-floor.md](_craft-floor.md) hold?
7. When a critique exists (`07-design-critique.md`), which of its findings are details? Use it as one input, and do your own pass too.

### In implement

- Replace a custom part with the shared component when the system owns the pattern.
- Keep terms, capitals and punctuation as the approved screens have them. Ask before you change a factual claim.
- Use the feature at each viewport with the mouse, the keyboard and touch. Check zoom, focus, the names that a screen reader speaks, runtime errors, layout shift and input response.
- Remove debug output, dead code, unused imports and obsolete styles.
- End with a review of the diff. Remove accidental changes and temporary files.

---

> *The concentric-radius, optical-alignment, shadows-over-borders, image-outline and hit-area details here are adapted from Jakub Krehel's "Details that make interfaces feel better" ([jakub.kr](https://jakub.kr/writing/details-that-make-interfaces-feel-better)), used under MIT license.*
>
> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
