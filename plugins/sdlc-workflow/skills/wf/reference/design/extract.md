# Extract (`design/extract.md`)

`/wf design [slug] extract` reads the design system out of an existing UI: the design tokens, the component patterns, and the design decisions that the code holds. It writes the result into the design record ([record.md](record.md)). It needs no design record to start.

## Purpose

Use `extract` to:
- Document an existing UI before redesigning it
- Create a design token file from hard-coded values scattered through the codebase
- Reverse-engineer the implicit spacing, color, and typographic system
- Identify inconsistencies and opportunities for systematization

## Step 1: Scan for design values

Choose the search roots first: the UI source directories that the `stack:` block of a workflow names, or the directories that hold the page and component files of the repo. When you find none, search the repo root. Always exclude `node_modules/`, `dist/`, `build/` and `.ai/`.

Search with the search tool of the host. The patterns below are written as `grep` lines to show what to match: `<roots>` is the chosen roots and `<excludes>` is the four excluded folders.

Search the codebase for:

**Colors** (Grep for hex, rgb, hsl, oklch, named colors):
```
grep -r <excludes> "#[0-9a-fA-F]\{3,8\}\|rgb(\|hsl(\|oklch(" <roots> --include="*.css" --include="*.tsx" --include="*.jsx"
```

**Spacing values** (px, rem, em in CSS):
```
grep -r <excludes> "padding:\|margin:\|gap:\|space-[xy]" <roots> --include="*.css"
```

**Typography** (font families, font sizes, font weights):
```
grep -r <excludes> "font-family:\|font-size:\|font-weight:\|fontSize\|fontWeight" <roots>
```

**Border radii**:
```
grep -r <excludes> "border-radius:\|rounded-" <roots>
```

**Shadows**:
```
grep -r <excludes> "box-shadow:\|drop-shadow\|shadow-" <roots>
```

## Step 2: Identify the implicit system

From the collected values:

1. **Color palette**: group by hue, identify the actual palette being used. Name unknowns (primary, secondary, surface, border, text-primary, text-secondary, etc.).
2. **Spacing scale**: list all spacing values, identify the base unit (usually 4px or 8px), identify the multipliers.
3. **Type scale**: list all font-size values, identify the ratio, identify the base size.
4. **Border radius**: list all values, identify if there's a system (one consistent radius? multiple for different element sizes?).
5. **Inconsistencies**: values that appear only once and don't fit the emerging system — flag these.

## Step 3: Generate token definitions

Produce a CSS custom properties block (or Tailwind `theme.extend` block) that captures the extracted system:

```css
/* Extracted design tokens */
:root {
  /* Colors */
  --color-primary: oklch(55% 0.18 250);
  --color-surface: oklch(98% 0.005 250);
  /* ... */

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  /* ... */

  /* Typography */
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  /* ... */

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  /* ... */
}
```

Or Tailwind format:
```js
// tailwind.config.js — extracted tokens
theme: {
  extend: {
    colors: { /* ... */ },
    spacing: { /* ... */ },
  }
}
```

## Step 4: Identify component patterns

Scan for repeated component structures:
- Button variants (primary, secondary, ghost, destructive)
- Card patterns (header, body, footer structure)
- Form input patterns
- Navigation patterns

Document each with its implicit design decisions. When these patterns will be systematized into a *reusable* component set, apply the loved-component principles in `_component-craft.md` (DX-first API, excellent defaults, memorable naming, touchable docs).

## Step 5: Produce extraction report

```
## Design Token Extraction

**Codebase**: [project name]
**Scan date**: [date]
**Files scanned**: N

### Color palette
[Table of extracted colors with current usage]

### Spacing system
[Base unit: Npx. Scale: 1×, 2×, 3×, 4×, 6×, 8×, 12×, 16×]

### Typography
[Scale and families]

### Inconsistencies found
[Values that don't fit the system — candidates for consolidation]

### Recommended token file
[The generated CSS/Tailwind block]
```

## Output in SDLC context

With a slug (`/wf design <slug> extract`), the report belongs to the workflow:
- Write the extraction report to `<wf-dir>/design-notes/extract-<timestamp>.md`. Get `<timestamp>` from [../_timestamp.md](../_timestamp.md) in the compact run-id form.
- Write the suggested token block into the report, under `### Recommended token file`.

With no slug (`/wf design extract`), write no report file: the design record below holds the result, and the chat return holds the report.

In both cases, update the design record:
1. Write the extracted tokens and the component patterns into the `## System in code` section of `.ai/design/current.md`, in the format of [record.md](record.md).
2. Run `node "<skill-dir>/scripts/wf.mjs" design components scan "<root>"` to list the components of the code. For each one that the library does not have, run `node "<skill-dir>/scripts/wf.mjs" design component add "<root>" <key> --title "<title>" --code <file> --name <its name in the code>`, so the library lists it ([_surface.md](_surface.md) → The foundation).
3. Do not record a floor refusal as a system pattern. Record it under `## Design debt` per [_craft-floor.md](_craft-floor.md) → Record guard.

Chat return: the palette, the spacing scale and the type scale in a few lines each, the count of components added to the library, the inconsistencies, and `Done`. The person does not open the report.
