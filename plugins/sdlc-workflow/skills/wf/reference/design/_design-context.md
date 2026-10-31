# Shared design context (`_design-context.md`)

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

The single source of truth for the **design modes** and the **shared design laws**. Edit them only here. These are direction-time rules. The refusals and the checks of the built result are in [_craft-floor.md](_craft-floor.md), which loads only after the direction is settled. The codebase inspection sub-agents of the design stage are in `design/_preflight.md`.

**Consumer contract.** Each stage loads only its sections, through the Sections cell of its Requires row, when the design lane says design is needed (`design/_lane.md`). This asymmetry is intentional, not drift:
- `slice` — Design modes (maps each surface to its design mode; never redesigns).
- `plan` — Design modes; Shared design laws. Then load the craft home (`animate.md`, `polish.md`, `typeset.md`) for what the feature touches.
- `implement` — Design modes; Shared design laws, and the craft home.
- `verify`, `review`, and the design `audit` and `critique` — they do not load this file. They load `_craft-floor.md` only.
- The design stage — the whole file at Step 1, and `design/_preflight.md` at Step 3.

The table of `_craft-floor.md` says when each stage loads the floor.

> Load with: `design/_design-context.md`

---

## Design modes

A design mode names what success looks like for the person on one surface. It forks the color strategy, the type scale, the motion budget and the `critique` stance.

| Design mode | The person on the surface | Surfaces | Reference |
|---|---|---|---|
| Persuade | decides and acts; the design is the product | landing, marketing, campaign, pricing | [mode-persuade.md](mode-persuade.md) |
| Operate | completes a task | app UI, dashboard, editor, admin, settings, tool | [mode-operate.md](mode-operate.md) |
| Read | understands something | docs, article, guide, help, changelog | [mode-read.md](mode-read.md) |
| Experience | is inside the work itself | portfolio, gallery, showcase | [mode-persuade.md](mode-persuade.md) |

Rules:
1. Choose the design mode per surface, from the surface, not from the product. A tool's landing page is Persuade. A docs index is Read, not Persuade.
2. Take the design mode from the task cue first ("landing page" → Persuade, "dashboard" → Operate, "docs" → Read). Then take it from the surface in focus. When neither settles it, ask the person.
3. Record one design mode per surface in the `02b-design.md` content inventory. `02c-craft.md` carries `surface-modes:`, a map from surface key to design mode (`persuade`, `operate`, `read`, `experience`).
4. Load the reference of each surface's design mode at design stage Step 3b and Step 4.
5. Scale ambition to the design mode. Persuade and Experience get full commitment and a point of view. On Operate and Read, ambition shows as precision and restraint, and patterns the person already knows earn their place.

**Old records.** Read `register: brand` as `persuade` and `register: product` as `operate`. A `## Register` section in an old PRODUCT.md is a hint only. Report it to the person once as deprecated, with the reason: one value for the whole product is wrong for some of its surfaces. Do not write a new `register` field.

---

## Shared design laws

These laws apply to every design, in every design mode. The build checks itself against [_craft-floor.md](_craft-floor.md) at the edit step. The font reflex list is in [typeset.md](typeset.md) → Font selection.

### Color
- Use OKLCH. Reduce chroma as lightness approaches 0 or 100.
- Tint a neutral toward the brand hue only when it creates cohesion. A plain neutral is valid.
- Choose a color strategy before you choose a color:
  - **Restrained.** Tinted or plain neutrals, and one accent at 10% or less of the surface, for action, selection and state.
  - **Committed.** One saturated color carries 30–60% of the surface.
  - **Full palette.** Three to five colors, each with a named role.
  - **Drenched.** Color owns the surface; the brand is its palette.
- Committed, Full palette and Drenched exceed the 10% rule on purpose.
- Defaults: Persuade and Experience use Committed or higher. Operate and Read use Restrained. The brief or the design-mode file can earn another strategy for one surface.

### Anti-convergence
Generated designs cluster around a few looks, whatever the subject. Steer away from them before any color or face is chosen:
- Pick the color strategy before any color. Commit it at page scale: fields that own whole regions, not accents scattered on a neutral ground.
- Decide light or dark from a one-sentence scene: who uses it, where, under what light.
- Four saturated looks fail when the brief leaves the aesthetic free: cream, serif and terracotta; near-black and neon glow; broadsheet hairlines, italic serif and mono labels; flat ink, hard offset shadows and condensed display type.
- Self-check: when someone can guess the look from the category, or from the category plus its avoidance, rework it.
- A negative constraint in the brief removes a device, not energy.
- The model's first palette for a warm or bookish subject (cream, serif, lamplight) is already spent. Do not use it unless the brief pins it.
- Truth binds claims, not demonstrations. Author demo data at full fidelity, and label it synthetic. Never invent prices, customers, benchmarks or capabilities.

### Typography
- Establish hierarchy through size AND weight contrast — not just one.
- Set body text at the platform body size or larger (16 px on the web). Use a line height of 1.5 or more for prose.
- Max 65–75ch line length for prose content.
- Type scale. Persuade and Experience: a modular scale at a ratio of 1.25 or more, with fluid headings. Operate and Read: a fixed scale at a ratio of 1.125–1.2. `typeset.md` → Type scale gives example tokens.

### Spacing
- Use a 4-unit base. Extend the project's spacing tokens. Never add a parallel set.
- Proximity is meaning: related elements get tighter spacing.
- Whitespace as emphasis: contrast between dense and spacious creates hierarchy.

### Components
- Every interactive element: default, hover, focus, active, disabled states.
- Loading: skeletons not spinners for content areas.
- Empty states teach and guide; they are not error states.

### Motion & interface detail
- Motion craft lives in `animate.md`: the frequency and purpose gates (never animate keyboard / 100+-per-day actions), strong curve tokens (never ease-in on UI, entering or exiting), sub-300ms Operate UI, the trigger origin for popovers, never scale from 0, retargetable animations and springs, cheap properties only, the 8.3 ms frame budget, the hover-pointer gate, `bounce: 0` on Operate and Read. Platform forms of each term live in `_platforms.md` (web, iOS, Android Compose, desktop); recipes in `_motion-recipes.md`.
- Interface-detail craft lives in `polish.md`: concentric radius (`outer = inner + padding`), optical alignment, shadows-over-borders for elevation, pure-black/white image outlines, and the minimum hit area of [_platforms.md](_platforms.md).
- These two files are the single source of truth for craft — the summary above is a pointer, not the canon itself. `plan`, `implement`, and every design transform that touches motion or component detail must load the relevant home (`animate.md` / `polish.md`) for the full rules before deciding; the visual contract (`02c-craft.md`, written at the design stage) draws from them too.
- Building a *reusable* component (a design-system primitive or library, not a one-off screen)? See `_component-craft.md` — DX-first API, excellent defaults, memorable naming, a touchable example.
