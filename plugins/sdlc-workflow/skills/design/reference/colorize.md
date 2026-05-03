> **Additional context needed**: existing brand colors.

Strategically introduce color to designs that are too monochromatic, gray, or lacking in visual warmth and personality.

---

## Register

Brand: palette IS voice. Pick a color strategy first (Restrained / Committed / Full palette / Drenched) and follow its dosage. Committed, Full palette, and Drenched deliberately exceed the ≤10% rule — that rule is Restrained only. Unexpected combinations are allowed; a dominant color can own the page when the chosen strategy calls for it.

Product: semantic-first and almost always Restrained. Accent color is reserved for primary action, current selection, and state indicators — not decoration. Every color has a consistent meaning across every screen.

---

## Assess Color Opportunity

1. **Understand current state**: color absence, missed semantic opportunities, existing brand constraints.
2. **Identify where color adds value**: semantic meaning, hierarchy, categorization, emotional tone, wayfinding, delight.

**CRITICAL**: More color ≠ better. Strategic color beats rainbow vomit every time. Every color should have a purpose.

## Plan Color Strategy

- **Dominant color** (60%): Primary brand color or most-used accent
- **Secondary color** (30%): Supporting color for variety
- **Accent color** (10%): High contrast for key moments
- **Neutrals** (remaining): Tinted grays for structure

## Introduce Color Strategically

### Semantic Color
- State indicators: success (green), error (red), warning (orange/amber), info (blue), inactive (gray)
- Status badges: colored backgrounds for states (active, pending, completed)
- Progress indicators: colored bars or rings

### Accent Application
- Primary actions: color the most important buttons/CTAs
- Links: colored clickable text (maintain accessibility)
- Icons: colorize key icons for recognition
- Headers: color on section headings or key labels
- Hover states: introduce color on interaction

### Background and Surfaces
- Tinted backgrounds: replace pure gray (`#f5f5f5`) with warm neutrals (`oklch(97% 0.01 60)`) or cool tints (`oklch(97% 0.01 250)`)
- Colored sections: subtle background colors to separate areas
- Cards and surfaces: slight tint for warmth
- Gradients: subtle, intentional — not generic purple-blue

### Borders and Accents

Use OKLCH for all color. Apply color to borders and frames as:
- **Hairline full-perimeter borders**: 1px colored strokes around a card or section surface
- **Surface tints**: 4–8% background wash of the accent color on active or highlighted cards
- **Focus rings**: colored focus indicators matching brand
- **Underlines**: colored underlines for active state or emphasis

**ABSOLUTE BAN**: `border-left` or `border-right` > 1px as a decorative colored accent stripe. This is a design anti-pattern. A colored side-stripe is an attempt to mark a card as "active" or "highlighted" while avoiding the cost of a real visual solution.

**Instead**: use a full hairline perimeter border + surface tint for "active". Use a leading glyph, icon, or numbered prefix for categorization. Use a full-bleed background color change for state.

### Typography Color
- Colored headings: brand colors for section headers (maintain contrast)
- Highlight text: color for emphasis or categories
- Labels and tags: small colored labels for metadata

### Data Visualization
- Charts and graphs: color to encode categories or values
- Heatmaps: color intensity for density or importance

## Balance and Refinement

### Maintain Hierarchy
- Dominant 60 / Secondary 30 / Accent 10 ratio
- Same color meanings throughout the surface

### Accessibility
- Contrast ratios: WCAG 4.5:1 for text, 3:1 for UI components
- Don't rely on color alone: pair with icons, labels, or patterns
- Test red/green combinations for color blindness

### Cohesion
- Use colors from the defined palette only
- Temperature consistency: warm stays warm, cool stays cool
- Pure gray for neutrals → always add a subtle tint instead

## Never
- Every color in the rainbow (2–4 beyond neutrals is the limit)
- Color applied randomly without semantic meaning
- Gray text on colored backgrounds (use a darker shade or transparent overlay instead)
- Pure `#000` or `#fff` for large surface areas
- WCAG contrast violations
- Color as the only state indicator (pair with shape, label, or icon)
- Purple-blue gradients (AI slop aesthetic)
- `border-left` / `border-right` colored accent stripes (absolute ban — see above)
