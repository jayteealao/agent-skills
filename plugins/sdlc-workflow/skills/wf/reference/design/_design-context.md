# Shared design context (`_design-context.md`)

The single source of truth for design **register**, the **shared design laws**, the
**absolute bans**, the **preflight gates**, and the **image gate**. Loaded by the
design stage (`design/stage.md`) *and* by the lifecycle stages that consume
design knowledge — `slice`, `plan`, `implement`, `verify`, `review` — each pulling only the
slice relevant to its job, when the design lane says design is needed (`design/_lane.md`). Edit the laws, bans, and register
rules in exactly one place: here.

**Consumer contract** — each lifecycle stage loads only its slice; this asymmetry is intentional, not drift:
- `slice` — Register + Absolute bans (structures against the floor; never redesigns).
- `plan` / `implement` — Register + shared design laws + Absolute bans + the Motion & interface-detail summary below, **then** the specific craft home (`animate.md` / `polish.md` / `typeset.md`) for what the feature touches.
- `verify` — Accessibility law + Absolute bans (measures the floor).
- `review` — Absolute bans (audits against the same canon).

The design stage loads the whole file (preflight, image gate, mutation lock included); the other lifecycle stages never touch those stage-only sections.

> Load with: `design/_design-context.md`

---

## Register — brand vs product (load-bearing across every transform + `critique`)

Every design task is **brand** (marketing, landing, campaign, portfolio — design IS the
product) or **product** (app UI, admin, dashboard, tool — design SERVES the product).
Determine the register before designing; it forks color strategy, type scale, and the
`critique` stance.

Priority (first match wins):
1. Task cue ("landing page" → brand, "dashboard" → product).
2. Surface in focus (the file, page, or route being worked on).
3. `## Register` field in PRODUCT.md.

If PRODUCT.md lacks the field, infer from its Users and Product Purpose sections. Load the
matching register reference:
`brand.md` or
`product.md`.

## Context gathering

Two files, case-insensitive. Search project root first, then `.agents/context/`, then `docs/`.

- **PRODUCT.md** — required. Users, brand, tone, anti-references, strategic principles, register.
- **DESIGN.md** — optional, strongly recommended. Colors, typography, elevation, components, tokens.

The design record adds two more files, `.ai/design/current.md` and `.ai/design/direction.md`
(`design/record.md`). The design stage, `review`, and `retro` read them.

If PRODUCT.md is missing, empty, or has `[TODO]` markers: run `/wf design setup` and resume
after context is established. If DESIGN.md is missing: nudge once per session (*"Run
`/wf design setup` or `/wf design teach` for better on-brand output"*), then proceed.

---

## Shared design laws (apply to every design, both registers)

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
- `@media (prefers-reduced-motion: reduce)` for all animations — design for motion first.
- Focus rings visible, meeting 3:1 contrast ratio against adjacent background.
- Color is never the only indicator for any state.

### Motion & interface detail
- Motion craft lives in `animate.md`: the frequency framework (match motion to how often it's seen; never animate keyboard / 100+-per-day actions), strong custom easing (never `ease-in` on an entrance), sub-300ms product UI, origin-aware popovers, never `scale(0)`, interruptible transitions/springs, GPU-only (`transform`/`opacity`), `bounce: 0` for product.
- Interface-detail craft lives in `polish.md`: concentric radius (`outer = inner + padding`), optical alignment, shadows-over-borders for elevation, pure-black/white image outlines, ≥40–44px hit areas.
- These two files are the single source of truth for craft — the summary above is a pointer, not the canon itself. `plan`, `implement`, and every design transform that touches motion or component detail must load the relevant home (`animate.md` / `polish.md`) for the full rules before deciding; the visual contract (`02c-craft.md`, written at the design stage) draws from them too.
- Building a *reusable* component (a design-system primitive or library, not a one-off screen)? See `_component-craft.md` — DX-first API, excellent defaults, memorable naming, a touchable example.

## Absolute bans (both registers)

- `border-left` or `border-right` > 1px as a decorative colored accent stripe. A side stripe marks a card as active or highlighted without a real visual solution. Use a full hairline border, a background tint, or a leading glyph instead.
- Purple-blue generic gradients.
- Generic hero metric cards ("10x faster", "500+ customers") without real product proof.
- Nested card-inside-card layouts.
- Bounce or elastic easing in product-register UI. It reads as cheap and unpolished. A brand surface may use a spring with bounce 0.1–0.3 when the brand direction calls for play; see `animate.md`.
- Pure `#000` or `#fff` for text or large areas.
- Fraunces or Cormorant as the primary display face on a new brand surface.
- Unless the brief names them: a cream or off-white default background, italic accent words in headlines, numbered "01/02/03" section labels, monospace eyebrow labels, and pill-shaped buttons as the default button shape.

---

## Image gate (mutation lock)

`image_gate` is the lock that prevents code mutation before visual direction is confirmed.
It lives in the design artifact frontmatter as `image-gate` (values `pass` or `skipped:<reason>`
only — an *unwritten* gate is the "pending" state; there is no `pending` value). `shape` authors
the brief (`02b-design.md`) leaving `image-gate` unset; **the design stage resolves it** with the
person when it authors the visual contract (`02c-craft.md`, following `design/stage.md` and
`design/contract.md`) — drawing every changed surface, confirming direction, then writing the
resolved `image-gate`. No driven stage resolves it.

- `image_gate=pending` — **blocks all code mutation.** Visual direction is not yet confirmed.
- `image_gate=pass` — the surfaces were drawn on the design canvas, or the visual probes were
  generated via the `imagery` skill; visual direction is confirmed and code mutation may open.
- `image_gate=skipped:<reason>` — direction confirmed without an image probe, with a recorded
  reason. An empty or generic reason is **INVALID** — name *why* no probe was needed (e.g.
  "text-only fallback: no image backend available", "token-only transform, no new surface").

The `imagery` skill (`../../../imagery/SKILL.md`) is invoked internally
and fans out to the best available image backends at runtime (the host's built-in image tool
where one exists — see the imagery provider table — plus the gpt-image-2 / nano-banana API
backends when `externalDispatch.enabled`); the caller records the
`IMAGEGEN_RESULT` and sets the gate.

## Preflight gates (run before any design work that edits files)

Skipping these produces generic output that ignores the project.

| Gate | Required check | If fail |
|---|---|---|
| Context | PRODUCT.md exists and is valid (≥200 chars, no `[TODO]` markers) | If the command is `setup` or `teach` → proceed (these create/update PRODUCT.md). Otherwise STOP: *"Design context is missing. Run `/wf design setup` to create PRODUCT.md first."* |
| Register | `brand` or `product` is determined for this task | Read PRODUCT.md `## Register`; infer from task cue if missing. Suggest `/wf design teach` to add it explicitly. |
| Codebase | Codebase inspection sub-agents have run | Run the 4 parallel inspection sub-agents (below). Skip if their output is already in this session, or reuse the `stack` fingerprint from `00-index.md` where possible. |
| Brief | Design brief `02b-design.md` authored (at `shape`, following `design/shape.md`) and its direction backed by a recorded user source at contract time (an in-session confirmation, a user-confirmed PRODUCT.md, or a prior `teach` answer) | The brief is authored by the `shape` lifecycle stage; the design stage confirms its direction (`shape=pass`) with the person before writing the contract (`design/contract.md`). When the brief is missing, the design stage writes it first. |
| Image gate | Surfaces drawn or probes generated, or skipped with a recorded reason | Resolve at the design stage before any stage plans or builds. |
| Mutation | All gates above pass; mutation type matches the command | Do not edit project files until mutation is open. |

**Codebase gate is relaxed for**: `audit`, `critique`, `extract`, `setup`, `teach`, `direction`, `sync` — these are read-only or record-authoring.

### Codebase inspection sub-agents (4, parallel)

Run in the design stage (skip for `audit`, `critique`, `extract`,
`setup`, `teach`, `direction`, `sync`). If output is already in session history, don't re-run. Reuse the `stack`
fingerprint from `00-index.md` for framework/library facts where it already answers the question.

1. **Token scanner.** Find design tokens: CSS custom properties (`--color-*`, `--spacing-*`, `--font-*`, `--radius-*`), Tailwind config `theme.extend`, `tokens.json`, Style Dictionary source files. Return the extracted token table.
2. **Framework + component detector.** Identify the UI framework (React/Vue/Svelte/Angular from package.json), component library (shadcn/ui, Radix, Headless UI, MUI, Mantine, Ant Design, Chakra), CSS approach (Tailwind, CSS modules, styled-components, plain CSS), Tailwind version, sample component path.
3. **Context loader.** Read PRODUCT.md and DESIGN.md (project root → `.agents/context/` → `docs/`). Extract register, brand-personality, users, aesthetic-direction, design-principles.
4. **Surface ranger.** Find files relevant to the current task: active page/component files, related CSS, primary component. In workflow context, read `02-shape.md` for `files-in-scope`.

## Mutation types

- **Code** — the lifecycle build span (`implement`), which also applies the moves. Requires `image_gate` resolved AND the stage's build gate.
- **Artifact** — contract authoring at the design stage (writes `02c-craft.md`), plus `audit`, `critique`. No code touched.
- **Context** — `setup`, `teach`, `direction`, `sync`. The design record only (PRODUCT.md, DESIGN.md, `.ai/design/`); allowed unconditionally.
- **Read-only** — `extract`. Produces a report; no project files modified.

Do not edit any file until the appropriate mutation gate is open.
