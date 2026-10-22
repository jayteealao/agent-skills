> **Additional context needed**: existing brand colors.

Introduce color as hierarchy, meaning and atmosphere. Keep the confirmed brand and semantic conventions. Do not replace a visual world under the name of color.

---

## Design mode

Persuade and Experience: the palette is the voice. Color may own regions. The Committed, Full palette and Drenched strategies are available.

Operate: Restrained by default, and color still does real jobs: the shell, state, data and selection. A gray screen with one accent is the category default, not restraint.

Read: the world's color owns the frame. The reading column keeps a calm ground.

---

## Audit before choosing

1. Read DESIGN.md, the color tokens, the themes and the states.
2. List the color commitments and the roles that exist.
3. List where gray hides hierarchy, each contrast failure, and each signal that uses color only.
4. When the work needs a new color identity, run [stage.md](stage.md) Step 3b. This move does not replace one.
5. Give every color a purpose. More color is not better.

## Pick a strategy

Pick a strategy before you pick a color:
- **Restrained** — neutrals and one accent for action, selection and state.
- **Committed** — one saturated color carries 30–60% of the surface.
- **Full palette** — 3–4 named color roles.
- **Drenched** — the surface is the color.

Name the temperature, the dominant relationship, the contrast range and the dosage. Follow the brief, not a percentage.

## Build roles, not swatches

Give each job a role:
- canvas and raised surfaces;
- primary and secondary text;
- action, focus and selection;
- borders;
- success, warning, error and info;
- data series.

A theme change remaps the roles. It does not repaint each component.

## Introduce color strategically

### Semantic color
- Give each state one stable meaning across the product. Take its hue from the platform, the domain and the palette.
- Status badges: colored backgrounds for states (active, pending, completed)
- Progress indicators: colored bars or rings

### Accent application
- Primary actions: color the most important buttons and calls to action
- Links: colored clickable text (maintain accessibility)
- Icons: colorize key icons for recognition
- Headers: color on section headings or key labels
- Hover states: introduce color on interaction

### Background and surfaces
- Tint a neutral toward the brand hue only when it creates cohesion. A plain neutral is valid. Never default to a cream or sand ground.
- Colored sections: subtle background colors to separate areas
- Cards and surfaces: a slight tint only when the strategy calls for it
- Use a gradient only from the world's material. Never use gradient text.
- Compose the dark theme on its own. Never invert the light theme.

### Borders and accents

Use the project's color space. For a new palette, prefer a perceptual space such as OKLCH. Apply color to borders and frames as:
- **Hairline full-perimeter borders**: 1px colored strokes around a card or section surface
- **Surface tints**: 4–8% background wash of the accent color on active or highlighted cards
- **Focus rings**: colored focus indicators matching brand
- **Underlines**: colored underlines for active state or emphasis

**Depth is not a color job.** For elevation, prefer a layered shadow to a colored border. A shadow adapts to any background; a solid border does not (see [polish.md](polish.md)). A shadow carries an offset and a soft blur. Give an image edge a pure black or pure white outline at about 10% opacity. Never use a tinted near-black from the palette or the accent: a tinted outline picks up the surface color underneath and reads as dirt on the edge.

### Typography color
- Colored headings: brand colors for section headers (maintain contrast)
- Highlight text: color for emphasis or categories
- Labels and tags: small colored labels for metadata

### Data visualization
- Charts and graphs: color to encode categories or values
- Heatmaps: color intensity for density or importance
- Separate data series by lightness, chroma, shape, label or pattern.

## Balance and refinement

### Maintain hierarchy
- Keep the dosage that the strategy names.
- Same color meanings throughout the surface

### Accessibility
- Contrast: 4.5:1 for body text, 3:1 for large text. 3:1 for controls, icons and focus indicators.
- Check every state, overlays, text on images, disabled content and both themes.
- Simulate the common color vision deficiencies.
- Never use color alone: pair it with an icon, a label or a pattern.
- Prefer an explicit color to a chain of translucent overlays.
- Secondary text on a colored ground takes that hue. Never gray.

### Cohesion
- Use colors from the defined palette only
- Temperature consistency: warm stays warm, cool stays cool

## Verify

- Every color has a stable role.
- Attention lands on the intended action.
- The palette works in quiet, dense, error and empty states.
- Both themes are composed.
- It reads as this product.

## Never
- More hues than the strategy names
- Color applied randomly without semantic meaning
- WCAG contrast violations
- Color as the only state indicator (pair with shape, label, or icon)

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> colorize` focuses the design stage and its contract `02c-craft.md` on color.
- **Design confirmed:** `/wf design <slug> colorize` runs the audit, the Accessibility checks and the Verify list against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/colorize-<timestamp>.md` per [_output.md](_output.md) with: the strategy and its dosage, the role map, each contrast check in both themes, and each signal that used color only.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
