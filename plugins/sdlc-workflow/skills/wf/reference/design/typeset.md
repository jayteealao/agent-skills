> **Additional context needed**: the design direction, existing font choices.

Typography carries information, hierarchy and voice. Improve it inside the established world. A new identity runs through the design stage and updates DESIGN.md.

---

## Design mode

Persuade and Experience: display type may carry the voice. Use a scale ratio of 1.25 or more between steps, large size contrasts, and mixed weights for editorial effect. The reflex list below applies.

Operate: one family and a fixed scale at a ratio of 1.125–1.2. System faces are correct. The type scale serves the information structure, not the brand voice.

Read: the measure and a reading face lead. Use monospace only for code and labels.

---

## Font selection (Persuade and Experience)

Write three concrete brand-voice words first (not "modern" — think physical objects, textures, contexts). Then find a font that is that object, not one that looks designed.

**The reflex list** (training-data defaults — look further):
Fraunces · Playfair Display · Cormorant · Lora · Crimson · Newsreader · Syne · Space Grotesk · Space Mono · IBM Plex · Inter as a display face · DM Sans · DM Serif · Outfit · Plus Jakarta Sans · Instrument Sans

A face from this list needs a reason no other face meets. A subject association is never that reason. On Operate and Read surfaces, system faces and workhorse UI faces are correct.

Browse a real catalog (Google Fonts, Pangram Pangram, Future Fonts, Adobe Fonts, ABC Dinamo, Klim) with the brand-voice words in mind. Reject the first thing that "looks designy."

Font resources:
- `https://fonts.google.com/` — free, wide selection
- `https://fonts.adobe.com/` — requires Creative Cloud subscription
- `https://pangrampangram.com/` — distinctive contemporary fonts
- `https://klim.co.nz/` — editorial and book-quality Latin typefaces
- `https://abcdinamo.com/` — contemporary type with strong identity

**Font pairing rules**:
- Two families minimum only when the voice needs it. One well-chosen family with committed weight/size contrast is stronger than a timid display+body pair.
- Display serif + sans body: magazine shape, works for editorial/luxury brand.
- One committed sans: correct for tech, fintech, tools.
- Rule-breaking is available (mono-only, display-only) when it matches the brand voice.

## Assess

Answer each question with a file, a selector or a computed value:
- **Authority and fit.** Which faces, weights and roles are established? Do they fit the product, or are they unexamined defaults? Is every family necessary?
- **Hierarchy.** Can you tell heading, body, label, metadata and data roles apart at a glance?
- **Scale and consistency.** Is there a deliberate role scale, or a set of arbitrary values?
- **Reading.** Are the measure, line height, rhythm, contrast and tracking tuned to the face and the width?
- **Stress.** What happens with long headings, translation, zoom, narrow containers, missing weights and the fallback face?
- **Delivery.** Does the surface load only the faces in use? Does loading hide text or move the layout?

## Set the system

Before you edit, state:
- the roles the interface needs;
- the contrast between those roles;
- the measure and the density;
- the established faces and weights;
- the performance, translation and accessibility constraints.

Use the fewest roles and families that make the hierarchy clear. Combine size, weight, space and tone; do not ask size alone to do the work. Name each role by its purpose, not by its value.

## Type scale

**Persuade and Experience**: modular scale with ≥1.25 ratio between steps. Fluid headings. Display size is 6rem at most.

```css
/* Web: */
--type-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
--type-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
--type-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
--type-lg: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
--type-xl: clamp(1.5rem, 1.3rem + 1vw, 2rem);
--type-2xl: clamp(2rem, 1.6rem + 2vw, 3rem);
--type-3xl: clamp(2.5rem, 2rem + 2.5vw, 4rem);
--type-display: clamp(3rem, 2rem + 5vw, 6rem);
```

**Operate and Read**: fixed scale. Tight ratio (1.125–1.2).

```css
/* Web: */
--type-xs: 0.75rem;   /* 12px */
--type-sm: 0.875rem;  /* 14px */
--type-base: 1rem;    /* 16px */
--type-lg: 1.125rem;  /* 18px */
--type-xl: 1.25rem;   /* 20px */
--type-2xl: 1.5rem;   /* 24px */
--type-3xl: 1.875rem; /* 30px */
```

## Hierarchy

Heading levels must have visible contrast. If h1 and h2 look similar:
- Increase size difference (h1 should be at least 1.5× h2)
- Add weight contrast (h1 at 700–900, body at 400)
- Add color or tracking difference

Three visible tiers minimum: primary (heading), secondary (subheading/label), tertiary (body/caption).

## Spacing and readability

Keep body prose at 65–75 characters per line. A narrow column may go down to 45. Give wider lines more line height.

```css
/* Web: body text */
font-size: 1rem;
line-height: 1.65;
max-width: 70ch;

/* Display headings */
line-height: 1.1–1.2;
letter-spacing: -0.02em to -0.04em; /* tighten at large sizes */

/* Small labels and captions */
line-height: 1.4;
letter-spacing: 0 to 0.02em; /* can open slightly */
```

**On dark grounds**: compensate light text on a dark ground on three axes: 0.05–0.1 more line height, a little more tracking, and one weight step up when the face needs it.

- Mark a paragraph boundary with spacing or a first-line indent. Do not use both.
- Keep repeated roles identical across screens and states.
- Respect zoom, the user's font settings and the **largest text size** ([_platforms.md](_platforms.md)).
- Load faces per [optimize.md](optimize.md) → Fonts.

## Line breaks

- Use **balanced wrap** on headings and short centered blocks ([_platforms.md](_platforms.md)).
- Use **even-last-line wrap** on body text. A two-word last line is acceptable.
- When a column is too narrow for either to help, edit the copy or widen the column.
- Break a heading by hand only between phrases. Check that break at every width the heading renders at.
- Long text (10+ lines), code and preformatted text keep the default wrap.

## Tabular numerals

Use **tabular numerals** ([_platforms.md](_platforms.md)) for numbers that update or align in columns: counters, prices, timers, table columns, scores. Digits keep equal width, so the layout does not shift as values change. Do not use them for static numbers, phone numbers or versions. Some faces redraw the numerals under this setting. Check the result in your real face.

## Common problems and fixes

**Flat hierarchy**: increase size ratio between heading and body. Add weight contrast.
**Too much font variety**: reduce to 2 sizes per context (heading + body), or 1 family.
**Poor readability**: raise body text to the platform body size. Add line height. Reduce line length.
**Display text too tight**: tighten tracking at display sizes (−0.03 em at 48px+).
**Generic font choice**: apply the reflex list and replace.
**Inconsistent hierarchy**: establish fixed scale tokens and apply them uniformly.

## Verify

Give evidence for each item: a rendered capture or a source line. A bare "yes" is not evidence.
- The roles read clearly without the copy.
- Long text reads well at every width and in every language.
- Loading causes no invisible text and no reflow.
- Zoom and text scaling work.

Next: the `polish` move.

## Never

- Font sizes below 12px (captions)
- Body text below the platform body size (16 px on the web), unless a dense role, a platform convention or a user setting needs it
- Line height below 1.5 for body text (1.4 only for dense UI, per polish.md)
- Body prose outside 65–75 characters per line, except a narrow column down to 45
- Justified alignment in body text (uneven word spacing)
- Thin weight (100) at small sizes — unreadable at normal resolutions

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> typeset` focuses the design stage and its contract `02c-craft.md` on typography.
- **Design confirmed:** `/wf design <slug> typeset` runs the Assess questions and the Verify list against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/typeset-<timestamp>.md` per [_output.md](_output.md) with: the role system, each finding with its evidence, the fix, and the checks that code alone cannot settle.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *The text-wrapping and tabular-numbers guidance here, and the font-smoothing form in `_platforms.md`, are adapted from Jakub Krehel's "Details that make interfaces feel better" ([jakub.kr](https://jakub.kr/writing/details-that-make-interfaces-feel-better)), used under MIT license.*
>
> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
