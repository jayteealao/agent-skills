# Shared design context (`_design-context.md`)

The single source of truth for design **register**, the **shared design laws**, and the
**absolute bans**. Edit the laws, bans, and register rules in exactly one place: here. The
design stage's own gates (context gathering, image gate, preflight gates, mutation types)
are in `design/_preflight.md`.

**Consumer contract.** Each stage loads only its sections, through the Sections cell of its
Requires row, when the design lane says design is needed (`design/_lane.md`). This asymmetry
is intentional, not drift:
- `slice` — Register; Absolute bans (structures against the floor; never redesigns).
- `plan` / `implement` — Register; Shared design laws; Absolute bans. **Then** load the specific
  craft home (`animate.md` / `polish.md` / `typeset.md`) for what the feature touches.
- `verify` — Shared design laws (the Accessibility law); Absolute bans (measures the floor).
- `review` and the design `audit` and `critique` — Absolute bans (audits against the same canon).
- The design stage — the whole file, and `design/_preflight.md`.

> Load with: `design/_design-context.md`

---

## Register

The register is load-bearing across every transform and `critique`.

Every design task is **brand** (marketing, landing, campaign, portfolio — design IS the
product) or **product** (app UI, admin, dashboard, tool — design SERVES the product).
Determine the register before designing; it forks color strategy, type scale, and the
`critique` stance.

Priority (first match wins):
1. Task cue ("landing page" → brand, "dashboard" → product).
2. Surface in focus (the file, page, or route being worked on).
3. `## Register` field in PRODUCT.md (project root, then `.agents/context/`, then `docs/`).

If PRODUCT.md lacks the field, infer from its Users and Product Purpose sections. Load the
matching register reference:
`brand.md` or
`product.md`.

---

## Shared design laws

These laws apply to every design, in both registers.

Check each result against the Absolute bans below and the reflex-reject list in `brand.md`; replace any match with a choice the brief justifies.

### Color
- Use OKLCH. Reduce chroma as lightness approaches 0 or 100.
- Never `#000` or `#fff`. Tint every neutral toward the brand hue (chroma 0.005–0.01).
- Choose a color strategy: Restrained / Committed / Full palette / Drenched. Brand defaults to Committed or higher. Product defaults to Restrained.

### Typography
- Establish hierarchy through size AND weight contrast — not just one.
- Minimum 16px body text. Line height ≥ 1.5 for prose.
- Max 65–75ch line length for prose content.
- Scale ratio: ≥1.25 for brand, 1.125–1.2 for product.

### Spacing
- Use a consistent spatial system with a 4px or 8px base unit.
- Proximity is meaning: related elements get tighter spacing.
- Whitespace as emphasis: contrast between dense and spacious creates hierarchy.

### Components
- Every interactive element: default, hover, focus, active, disabled states.
- Loading: skeletons not spinners for content areas.
- Empty states teach and guide; they are not error states.

### Accessibility
- Every animation honors the reduced-motion setting: fewer and gentler motion, not zero — keep opacity and color, remove movement. Never set every duration to 0 globally.
- Focus rings visible, meeting 3:1 contrast ratio against adjacent background.
- Color is never the only indicator for any state.

### Motion & interface detail
- Motion craft lives in `animate.md`: the frequency and purpose gates (never animate keyboard / 100+-per-day actions), strong curve tokens (never ease-in on UI, entering or exiting), sub-300ms product UI, the trigger origin for popovers, never scale from 0, retargetable animations and springs, cheap properties only, the 8.3 ms frame budget, the hover-pointer gate, `bounce: 0` for product. Platform forms of each term live in `_platforms.md` (web, iOS, Android Compose, desktop); recipes in `_motion-recipes.md`.
- Interface-detail craft lives in `polish.md`: concentric radius (`outer = inner + padding`), optical alignment, shadows-over-borders for elevation, pure-black/white image outlines, ≥40–44px hit areas.
- These two files are the single source of truth for craft — the summary above is a pointer, not the canon itself. `plan`, `implement`, and every design transform that touches motion or component detail must load the relevant home (`animate.md` / `polish.md`) for the full rules before deciding; the visual contract (`02c-craft.md`, written at the design stage) draws from them too.
- Building a *reusable* component (a design-system primitive or library, not a one-off screen)? See `_component-craft.md` — DX-first API, excellent defaults, memorable naming, a touchable example.

## Absolute bans

These bans apply in both registers.

- `border-left` or `border-right` > 1px as a decorative colored accent stripe. A side stripe marks a card as active or highlighted without a real visual solution. Use a full hairline border, a background tint, or a leading glyph instead.
- Purple-blue generic gradients.
- Generic hero metric cards ("10x faster", "500+ customers") without real product proof.
- Nested card-inside-card layouts.
- Bounce or elastic easing in product-register UI. It reads as cheap and unpolished. A brand surface may use a spring with bounce 0.1–0.3 when the brand direction calls for play; see `animate.md`.
- Pure `#000` or `#fff` for text or large areas.
- Fraunces or Cormorant as the primary display face on a new brand surface.
- Unless the brief names them: a cream or off-white default background, italic accent words in headlines, numbered "01/02/03" section labels, monospace eyebrow labels, and pill-shaped buttons as the default button shape.
