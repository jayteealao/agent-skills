Use color as hierarchy, meaning and atmosphere. Keep the confirmed brand and the semantic conventions. Do not replace a visual world under the name of color: when the work needs a new color identity, run [stage.md](stage.md) Step 3b.

`wf.mjs design check` sends a failure of contrast, and a color that is not a token, to this file.

---

## Design mode

| Mode | Color |
|---|---|
| Persuade and Experience | The palette is the voice. Color may own regions. |
| Operate | Color does real jobs: the shell, state, data and selection. |
| Read | The color of the world owns the frame. The reading column keeps a calm ground. |

---

## Audit before you choose

1. Read `DESIGN.md`, the color tokens, the themes and the states.
2. List the color commitments and the roles that exist.
3. List where gray hides hierarchy, each contrast failure, and each signal that uses color only.

## Pick a strategy

Pick a strategy before you pick a color. [_design-context.md](_design-context.md) → Shared design laws defines the four strategies (Restrained, Committed, Full palette, Drenched) and the default of each design mode. Follow the brief, not a percentage.

## Choose the palette

Use this method when the tokens do not yet hold the palette, or when a role is missing. It derives the colors from the product, so that two products do not get the same palette.

1. **The scene.** Write one sentence: who uses the surface, where, under what light. It decides light or dark, and the contrast range. A night shift on a dim ward and a shop counter at noon do not share a ground.
2. **The materials.** Name the world of the direction, and list three to five real materials or objects in it, each with its real color: the enamel of a station sign, the green of a cutting mat, the ink of a ledger. Take them from the subject and the audience, not from other software.
3. **The dominant and the accent.** The dominant comes from the largest material of the world. The accent comes from its smallest and loudest one: the signal, the stamp, the warning paint.
4. **The neutrals.** A neutral is plain, or it leans toward the dominant when that makes the surface cohere. Decide; do not tint by habit.
5. **The dosage.** Give each color its share of the surface from the strategy.
6. **The test.** Cover the name of the product. When the palette alone could belong to any product of the category, go back to step 2 with more specific materials.

Write the result into `DESIGN.md` as token roles, and run `wf.mjs design tokens`. Use the color space of the project. For a new palette, prefer a perceptual space such as OKLCH, and reduce chroma as lightness nears black or white.

## Build roles, not swatches

Give each job a role, and make each role a token:

| Role | Job |
|---|---|
| Ground and raised surfaces | The canvas and each layer above it |
| Primary and secondary text | Reading, and its quieter level |
| Action, focus and selection | What the person can do, where they are, what is chosen |
| Borders and edges | Separation |
| Success, warning, error, info | One stable meaning each across the product |
| Data series | Categories and values in a chart |
| Depth | Each shadow tier, each ring, and the outline of an image |

- A theme change remaps the roles. It does not repaint each component.
- Compose the dark theme on its own. Do not invert the light theme.
- Take the hue of a state from the platform, the domain and the palette, in that order of authority.
- Separate data series by lightness, chroma, shape, label or pattern, not by hue alone.
- A surface tint is the accent mixed into the ground through tokens, for example `color-mix(in oklab, var(--accent) 6%, var(--ground))`. Do not write the mixed value raw.

**Depth is a token, not a color in the page.** The color of a shadow, a ring and an image outline is a depth token of `DESIGN.md`, used through `var()`. `wf.mjs design check` fails a raw `rgba()` in a `box-shadow` or an `outline`. [polish.md](polish.md) → Depth gives the defaults.

## Fix a check failure

| The check says | Do |
|---|---|
| `contrast`: text under its minimum | Change the token of the text or of its ground, so that every use is fixed. Do not patch one element. On a colored ground, take secondary text from the hue of the ground ([_craft-floor.md](_craft-floor.md) rules 1 and 16). |
| `token`: a color that is not a token, with the nearest token named | Use the named token. When no token has the job, add a role to `DESIGN.md` and run `wf.mjs design tokens`. |
| `token`: a custom property that is not a token | Move it to `DESIGN.md` as a role, or to `components.css` when it belongs to one component. |

## Verify

- Every color has a stable role, and every role is a token.
- Attention lands on the intended action.
- The palette works in the `default`, `empty`, `error` and `worst` states.
- Both themes are composed.
- No state uses color as its only signal ([_craft-floor.md](_craft-floor.md) rule 15).
- The palette passes the test of step 6: it reads as this product.

## Never

- More hues than the strategy names.
- Color with no role.
- A chain of translucent overlays where one explicit token would do.
- A gradient that does not come from a material of the world.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says when each use runs. A note follows [_output.md](_output.md).

### At the design stage

The move changes the color token roles of `DESIGN.md`, the region that each color owns in the screens, and the state colors of each component. The contract records the strategy and its dosage, the materials of step 2, and the role map.

### As a pass on an approved design

The pass changes nothing. Write each answer as a finding with its screen key or `file:line`.
1. Does `wf.mjs design check` pass for contrast and tokens, in both themes?
2. Does each color have a role, and does any role have two colors?
3. Where does gray hide hierarchy? Where does color alone carry a state?
4. Does the surface keep the strategy and the dosage of the contract?
5. Does the palette pass the test of "Choose the palette", step 6?

### In implement

- Take every color from a token of `DESIGN.md`. A hex, an `rgb()` or a named color in a UI file is a fault.
- Map the theme through the roles, so that a theme change updates every value.
- Check each contrast pair in both themes after the build.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
