Typography carries information, hierarchy and voice. Improve it inside the established world. A new identity runs through the design stage and updates `DESIGN.md`.

The limits of type (measure, sizes, line height, tracking) are in [_craft-floor.md](_craft-floor.md) rules 17–22. The values in this file are defaults inside those limits. The type tokens of `DESIGN.md` override them.

---

## Design mode

| Mode | Type |
|---|---|
| Persuade and Experience | Display type may carry the voice. Use large size contrasts and mixed weights. The reflex list below applies. |
| Operate | One family is often right. System faces and workhorse UI faces are correct. The scale serves the information structure, not the brand voice. |
| Read | The measure and a reading face lead. Use monospace for code and small labels only. |

---

## Font selection

Use this section when the tokens do not yet hold the faces, on a Persuade or Experience surface, or when the person asks for a new face.

### Choose a face

The method works from the product, and needs no catalog.

1. **What exists.** Read `DESIGN.md` and the font files of the repo. A face that the product already owns comes first.
2. **The voice as objects.** Write three words for the voice as physical things, not as adjectives: a museum caption, a railway timetable, a fabric label. "Modern" and "clean" are not words for this step.
3. **The traits.** Turn the objects into letterform traits:

   | Trait | Range | The object suggests |
   |---|---|---|
   | Construction | geometric, humanist, grotesque, slab, old-style or modern serif, monospace | How the thing was made: drawn, engraved, stamped, typed, machined |
   | Stroke contrast | none to high | A sign painted with one brush width, or a page set for print |
   | Width | condensed to extended | Space that was scarce (a timetable, a label), or generous (a title wall) |
   | x-height and apertures | small and closed to large and open | Text read at a glance and at small sizes needs large and open |
   | Terminals and details | sharp, round, ink traps, quirks | The tool that made the letters |

4. **Candidates.** Name two or three faces that have those traits. Give each one line: the traits that it matches, and its licence class (a system face, an open licence, a commercial licence). Pass each one through the reflex list.
5. **The pick.** Ask the person one gate question per [_gate-question.md](../_gate-question.md): which candidate, and whether the product holds or will buy its licence. Do not pick a commercial face for the person.
6. **One family or two.** One well-chosen family with committed contrast of weight and size is stronger than a timid pair. Add a second family only when the voice needs a role that the first cannot play.

**The reflex list.** These faces are the first answers of a model, and they make designs look alike:
Fraunces · Playfair Display · Cormorant · Lora · Crimson · Newsreader · Syne · Space Grotesk · Space Mono · IBM Plex · Inter as a display face · DM Sans · DM Serif · Outfit · Plus Jakarta Sans · Instrument Sans

A face from this list needs a reason that no other face meets. A subject association is not that reason. Do not pick a face because the category uses it: when someone can guess the face from the category, choose again from the traits. On Operate and Read surfaces, system faces and workhorse UI faces are correct, and the list does not apply.

### Get the face onto a screen

A screen page loads nothing from the network ([_surface.md](_surface.md)). A face reaches a screen in one of two ways:

| Case | Do |
|---|---|
| The product holds the font file, and its licence allows the file in the repo | Put the file in the repo. Declare it with a local `@font-face` in `components.css`, with a relative URL. Name the family in the type tokens of `DESIGN.md`. |
| The file is not available yet, or its licence does not allow the repo | Draw with a named stand-in: a system face or an open-licence face in the repo, chosen for the same traits. Record it in the `02c-craft.md` `## Mock fidelity inventory`: the real face, the stand-in, and that the build replaces it. Tell the person in the approval question that the screens show a stand-in. |

Do not link a font service from a screen page. Do not name a face in a token when no file and no stand-in backs it.

## Assess

Answer each question with a file, a selector or a computed value.

| Question | Look for |
|---|---|
| Authority and fit | Which faces, weights and roles are established? Do they fit the product, or are they unexamined defaults? Is every family necessary? |
| Hierarchy | Can you tell heading, body, label, metadata and data roles apart at a glance? |
| Scale | Is there a deliberate role scale, or a set of arbitrary values? |
| Reading | Are the measure, line height and tracking tuned to the face and the width? |
| Stress | What happens with long headings, translation, zoom, narrow containers, missing weights and the fallback face? |
| Delivery | Does the surface load only the faces in use? Does loading hide text or move the layout? |

## Set the system

Before you draw, state the roles that the interface needs, the contrast between them, the measure and the density, and the faces and weights. Use the fewest roles and families that make the hierarchy clear. Combine size, weight, space and tone; size alone does not do the work. Name each role by its purpose, not by its value.

## Type scale

Take the scale from the type tokens of `DESIGN.md`. With none, build one from a base size and a ratio, and write it into `DESIGN.md`. [_design-context.md](_design-context.md) → Shared design laws gives the ratio of each design mode.

| Mode | Scale |
|---|---|
| Persuade and Experience | A modular scale with fluid headings: each step is a `clamp()` between its size at the narrowest and the widest viewport. The display step stays inside floor rule 21. |
| Operate and Read | A fixed scale. More type roles need less contrast between steps. |

```css
/* Web: one fluid step and one fixed step. Derive the others from the base and the ratio. */
--type-display: clamp(3rem, 2rem + 5vw, 6rem);
--type-base: 1rem;
```

## Hierarchy

- Make three visible tiers: primary, secondary and tertiary.
- Adjacent tiers differ by at least one step of the scale, and by weight or space as well.
- On a Persuade or Experience surface, the display step is at least 1.5 times the next step. A flat scale reads as uncommitted.
- When two heading levels look alike, widen the size step, add weight contrast, or change the space above them.

## Spacing and readability

Defaults, inside the floor limits:

| Role | Line height | Tracking |
|---|---|---|
| Body prose | 1.5–1.7; a wider line takes more | 0 |
| Dense UI text | 1.4–1.5 | 0 |
| Display headings | 1.1–1.2 | −0.02 to −0.03 em at large sizes |
| Small labels and captions | 1.4 | 0 to 0.02 em |

- **On a dark ground,** light text takes a little more line height, a little more tracking, and one weight step up when the face needs it.
- Mark a paragraph boundary with spacing or with a first-line indent, not both.
- Keep repeated roles identical across screens and states.
- Respect zoom, the font settings of the person and the largest text size of the platform ([_platforms.md](_platforms.md) → largest text size).

## Line breaks

- Use **balanced wrap** on headings and short centered blocks ([_platforms.md](_platforms.md)).
- Use **even-last-line wrap** on body text. A two-word last line is acceptable.
- When a column is too narrow for either to help, edit the copy or widen the column.
- Break a heading by hand only between phrases. Check that break at every width where the heading renders.
- Long text (10 or more lines), code and preformatted text keep the default wrap.

## Tabular numerals

Use **tabular numerals** ([_platforms.md](_platforms.md)) for numbers that update or align in columns: counters, prices, timers, table columns, scores. Digits keep equal width, so the layout does not shift as values change. Do not use them for static numbers, phone numbers or versions. Some faces redraw the numerals under this setting: check the result in the real face.

## Verify

Give evidence for each item: a rendered capture or a source line. A bare "yes" is not evidence.
- The roles read clearly without the copy.
- Long text reads well at every viewport, and in the `worst` state.
- Every face on the screens is a file in the repo, a system face, or a recorded stand-in.
- Zoom and text scaling work.

## Never

- A size, a line height or a tracking value outside the floor limits.
- Justified body text.
- A thin weight at small sizes.
- A face chosen by category.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says when each use runs. A note follows [_output.md](_output.md).

### At the design stage

The move changes the type tokens of `DESIGN.md` (families, scale, weights, line heights), the type roles of each component, and the hierarchy of each screen. For a new face, it runs "Choose a face" and "Get the face onto a screen". The contract records the role system, the faces with their licence class, and each stand-in.

### As a pass on an approved design

The pass changes nothing. Answer the Assess table and the Verify list. Write each fault as a finding with its screen key or `file:line`, the computed value, and the fix. Name the checks that code alone cannot settle.

### In implement

- Build every size, weight and line height from the type tokens.
- Replace each recorded stand-in with the real face.
- Show text in a fallback face while a custom face loads, and load only the weights in use ([optimize.md](optimize.md) → Fonts).
- Set font smoothing once, at the root ([_platforms.md](_platforms.md) → font smoothing).

---

> *The text-wrapping and tabular-numbers guidance here, and the font-smoothing form in the platform files, are adapted from Jakub Krehel's "Details that make interfaces feel better" ([jakub.kr](https://jakub.kr/writing/details-that-make-interfaces-feel-better)), used under MIT license.*
>
> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
