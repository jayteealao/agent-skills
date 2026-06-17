> **Additional context needed**: target context, constraints, or platform requirements.

Adapt an existing design to work in a new context — different viewport, different platform, different user context, or different constraints while preserving the design's essential character.

---

## Register

Brand: preserve the brand's essential aesthetic during adaptation. A mobile adaptation of a brand site should still feel like the same brand — not a stripped-down generic version. The constraints change; the character doesn't.

Product: preserve functional integrity during adaptation. A responsive product UI must work as well on mobile as on desktop — not just technically work, but feel purposeful and complete.

---

## Types of adaptation

### Responsive adaptation (desktop → mobile / mobile → desktop)

**Desktop to mobile**:
- Start from content priority: what does the user need most on a small screen?
- Collapse multi-column layouts: main content first, secondary content second, navigation last (or behind burger)
- Increase touch target sizes to 44×44px minimum
- Simplify navigation: bottom tab bar (4–5 items max), drawer, or tab bar replaces complex nav
- Increase body font size at small viewports: minimum 16px, often 17–18px for comfortable mobile reading
- Remove hover-state-only information (tooltips, hover reveals) — provide touch-accessible alternatives

**Mobile to desktop**:
- Expand with purpose — don't just stretch single-column to full width
- Introduce multi-column where it improves content relationships (sidebar + main, list + detail)
- Show more information that was hidden on mobile (secondary actions, metadata)
- Leverage hover states for progressive disclosure (tooltips, context menus)
- Increase typographic scale at larger viewports with `clamp()`

### Platform adaptation

**Web to native (React Native, Flutter, etc.)**:
- Replace web conventions (underlined links, box shadows) with native equivalents
- Follow platform navigation patterns (iOS: swipe-back, Android: back button or gesture)
- Respect safe areas (notch, home indicator, dynamic island)
- Native font stack unless brand fonts are critical: `-apple-system` on iOS, Roboto on Android

**Light to dark mode**:
- Build on a token system — don't create a separate dark-mode stylesheet
- Every neutral color token needs a dark counterpart
- Never just invert: dark mode uses a dark surface, not a negative of the light palette
- Dark mode backgrounds: use `oklch(10–20% 0.01 hue)` — dark tinted, not pure black
- Shadows in dark mode: use border + subtle glow instead of drop shadows

### Viewport context adaptation
- Print styles: `@media print` — remove navigation, sidebars, decorative elements; ensure content prints as a readable document
- High-DPI (Retina): SVG or 2× image assets for icons and critical images
- Narrow embedding (widget, iframe): strip all chrome, keep only essential content

## Adaptation principles

**What must survive adaptation**: the design's essential character — the choices that make it recognizable as this brand or product.

**What can change**: layout structure, interaction model, font scale, navigation pattern, information density.

**What must change**: touch targets, navigation patterns, content priority ordering for the new context.

## Validate

After adaptation:
- Does it feel complete for the target context (not a reduced/broken version)?
- Is the essential brand or product character preserved?
- Are all interactive elements reachable without hover?
- Does the information hierarchy work in the new layout?
- Is it tested at the actual target viewport/device?
