# Brand register

When design IS the product: brand sites, landing pages, marketing surfaces, campaign pages, portfolios, long-form content. The deliverable is the design itself — a visitor's impression is the thing being made.

The register spans every genre: tech brands, luxury, consumer products, creative studios, editorial. They all share the stance — *communicate, not transact* — and diverge wildly in aesthetic. Don't collapse them into a single visual lane.

## The brand slop test

If someone could look at this and say "AI made that" without hesitation, it has failed. The bar is distinctiveness — a visitor should ask "how was this made?", not "which AI made this?"

Brand isn't a neutral register. Average is no longer findable. Restraint without intent reads as mediocre, not refined. Brand surfaces need a POV, a specific audience, a willingness to risk strangeness.

**The second slop test: aesthetic lane.** Before committing to moves, name the reference. A Klim-style specimen page is one lane; Stripe-minimal is another; Liquid-Death-acid-maximalism is another. Don't drift into editorial-magazine aesthetics on a brief that isn't editorial.

## Typography

Font selection: write three concrete brand-voice words — not "modern" or "elegant" but "warm and mechanical and opinionated." Browse a real catalog with those words in mind. Find the font for the brand as a *physical object* — a museum caption, a 1970s terminal manual, a fabric label. Reject the first thing that "looks designy."

**Reflex-reject list** (training-data defaults — look further):
Fraunces · Newsreader · Lora · Crimson Pro · Playfair Display · Cormorant · Syne · IBM Plex · Space Mono · Space Grotesk · Inter · DM Sans · DM Serif · Outfit · Plus Jakarta Sans · Instrument Sans · Instrument Serif

**Saturated aesthetic lanes to avoid** (unless the brief genuinely requires them):
- Editorial-typographic: display serif (often italic) + small mono labels + ruled separators + monochromatic restraint. By 2026, every Stripe-adjacent and Notion-adjacent brand has landed here.

Scale: modular scale, fluid `clamp()` for headings, ≥1.25 ratio between steps. Flat scales (1.1× apart) read as uncommitted.

## Color

Brand color strategy — pick one:
- **Restrained** — tinted neutrals + one accent ≤10%
- **Committed** — one saturated color carries 30–60% of the surface
- **Full palette** — 3–5 colors, each with a defined role
- **Drenched** — color owns the surface; the brand is its palette

Committed, Full palette, and Drenched deliberately exceed the ≤10% rule. Unexpected combinations are allowed when the chosen strategy calls for it.

Use OKLCH. Never `#000` or `#fff`. Tint every neutral toward the brand hue (chroma 0.005–0.01 is enough).

## Layout

- Asymmetry is available. Editorial grids, intentional white space as content.
- Multiple columns are a design choice, not a grid default.
- Scroll-driven narrative: the page tells a story as the user scrolls.
- Long-form surfaces: establish a clear typographic rhythm early and return to it.

## Motion

Orchestrated page-load sequences are available. Staggered reveals, scroll-driven animation, cinematic hero entrances — all legitimate brand tools when they serve the emotional contract of the page. One well-rehearsed entrance beats scattered micro-interactions.

## Absolute bans (brand and product both)

- `border-left` or `border-right` > 1px as a decorative colored side stripe — use a full hairline border, a background tint, or a leading glyph instead
- Purple-blue generic gradients
- Generic hero metric cards ("10x faster", "500+ customers") without real product proof
- Nested card-inside-card layouts
- Bounce or elastic easing in production UI
- Pure black (`#000`) or pure white (`#fff`) for text or large surface areas
- Fraunces or Cormorant as the primary display face on a new brand surface
