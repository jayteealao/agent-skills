# Shared design context (`_design-context.md`)

The single source of truth for design **register**, the **shared design laws**, the
**absolute bans**, the **preflight gates**, and the **image gate**. Loaded by the
`/wf design` dispatcher (`reference/design.md`) *and* by the lifecycle stages that consume
design knowledge — `slice`, `plan`, `implement`, `verify`, `review` — each pulling only the
slice relevant to its job, gated behind `stack.ui ≠ ∅`. Edit the laws, bans, and register
rules in exactly one place: here.

**Consumer contract** — each lifecycle stage loads only its slice; this asymmetry is intentional, not drift:
- `slice` — Register + Absolute bans (structures against the floor; never redesigns).
- `plan` / `implement` — Register + shared design laws + Absolute bans + the Motion & interface-detail summary below, **then** the specific craft home (`animate.md` / `polish.md` / `typeset.md`) for what the feature touches.
- `verify` — Accessibility law + Absolute bans (measures the floor).
- `review` — Absolute bans (audits against the same canon).

The `/wf design` dispatcher loads the whole file (preflight, image gate, mutation lock included); lifecycle stages never touch those command-only sections.

> Load with: `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/_design-context.md`

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
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/brand.md` or
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/product.md`.

## Context gathering

Two files, case-insensitive. Search project root first, then `.agents/context/`, then `docs/`.

- **PRODUCT.md** — required. Users, brand, tone, anti-references, strategic principles, register.
- **DESIGN.md** — optional, strongly recommended. Colors, typography, elevation, components, tokens.

If PRODUCT.md is missing, empty, or has `[TODO]` markers: run `/wf design setup` and resume
after context is established. If DESIGN.md is missing: nudge once per session (*"Run
`/wf design setup` or `/wf design teach` for better on-brand output"*), then proceed.

---

## Shared design laws (apply to every design, both registers)

Never converge on the same choices across projects. Vary.

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
- These two files are the single source of truth for craft — the summary above is a pointer, not the canon itself. `plan`, `implement`, and every design transform that touches motion or component detail MUST load the relevant home (`animate.md` / `polish.md`) for the full rules before deciding; the visual contract (`02c-craft.md`, authored at `plan`) draws from them too.
- Building a *reusable* component (a design-system primitive or library, not a one-off screen)? See `_component-craft.md` — DX-first API, excellent defaults, memorable naming, a touchable example.

## Absolute bans (both registers)

- `border-left` or `border-right` > 1px as a decorative colored accent stripe — use full hairline border, background tint, or leading glyph instead.
- Purple-blue generic gradients.
- Generic hero metric cards ("10x faster", "500+ customers") without real product proof.
- Nested card-inside-card layouts.
- Bounce or elastic easing in production UI.
- Pure `#000` or `#fff` for text or large areas.
- Fraunces or Cormorant as the primary display face on a new brand surface.

---

## Image gate (mutation lock)

`image_gate` is the lock that prevents code mutation before visual direction is confirmed.
It lives in the design artifact frontmatter as `image-gate` (values `pass` or `skipped:<reason>`
only — an *unwritten* gate is the "pending" state; there is no `pending` value). `shape` authors
the brief (`02b-design.md`) leaving `image-gate` unset; **`plan` resolves it** when it authors the
visual contract (`02c-craft.md`, following `design/contract.md`) — generating the north-star probes
and confirming direction, then writing the resolved `image-gate`. A standalone transform resolves
it in its own focused-contract step.

- `image_gate=pending` — **blocks all code mutation.** Visual direction is not yet confirmed.
- `image_gate=pass` — required visual probes were generated via the `imagery` skill; visual
  direction is confirmed and code mutation may open.
- `image_gate=skipped:<reason>` — direction confirmed without an image probe, with a recorded
  reason. An empty or generic reason is **INVALID** — name *why* no probe was needed (e.g.
  "text-only fallback: no image backend available", "token-only transform, no new surface").

The `imagery` skill (`${CLAUDE_PLUGIN_ROOT}/skills/imagery/SKILL.md`) is invoked internally
and fans out to the best available image backends at runtime (built-in `image_gen` always; the
gpt-image-2 / nano-banana API backends when `externalDispatch.enabled`); the caller records the
`IMAGEGEN_RESULT` and sets the gate. (Supersedes the former `imagegen` skill, D14.)

## Preflight gates (run before any design work that edits files)

Skipping these produces generic output that ignores the project.

| Gate | Required check | If fail |
|---|---|---|
| Context | PRODUCT.md exists and is valid (≥200 chars, no `[TODO]` markers) | If the command is `setup` or `teach` → proceed (these create/update PRODUCT.md). Otherwise STOP: *"Design context is missing. Run `/wf design setup` to create PRODUCT.md first."* |
| Register | `brand` or `product` is determined for this task | Read PRODUCT.md `## Register`; infer from task cue if missing. Suggest `/wf design teach` to add it explicitly. |
| Codebase | Codebase inspection sub-agents have run | Run the 4 parallel inspection sub-agents (below). Skip if their output is already in this session, or reuse the `stack` fingerprint from `00-index.md` where possible. |
| Brief | Design brief `02b-design.md` authored (at `shape`, following `design/shape.md`) and its direction confirmed by the user at contract time | The brief is authored by the `shape` lifecycle stage; `plan` confirms its direction (`shape=pass`) before writing the contract (`design/contract.md`). A standalone transform, having no full brief, confirms only its focused contract's direction. |
| Image gate | Required visual probes generated, or skipped with a recorded reason | Resolve at the contract step (`plan`, or a transform's focused contract) before proceeding to code. |
| Mutation | All gates above pass; mutation type matches the command | Do not edit project files until mutation is open. |

**Codebase gate is relaxed for**: `audit`, `critique`, `extract`, `setup`, `teach` — these are read-only or context-authoring.

### Codebase inspection sub-agents (4, parallel)

Run before any design command that edits files (skip for `audit`, `critique`, `extract`,
`setup`, `teach`). If output is already in session history, don't re-run. Reuse the `stack`
fingerprint from `00-index.md` for framework/library facts where it already answers the question.

1. **Token scanner.** Find design tokens: CSS custom properties (`--color-*`, `--spacing-*`, `--font-*`, `--radius-*`), Tailwind config `theme.extend`, `tokens.json`, Style Dictionary source files. Return the extracted token table.
2. **Framework + component detector.** Identify the UI framework (React/Vue/Svelte/Angular from package.json), component library (shadcn/ui, Radix, Headless UI, MUI, Mantine, Ant Design, Chakra), CSS approach (Tailwind, CSS modules, styled-components, plain CSS), Tailwind version, sample component path.
3. **Context loader.** Read PRODUCT.md and DESIGN.md (project root → `.agents/context/` → `docs/`). Extract register, brand-personality, users, aesthetic-direction, design-principles.
4. **Surface ranger.** Find files relevant to the current task: active page/component files, related CSS, primary component. In workflow context, read `02-shape.md` for `files-in-scope`.

## Mutation types

- **Code** — transformation commands + the lifecycle build span (`implement`). Requires `image_gate` resolved AND the stage's build gate.
- **Artifact** — contract authoring at `plan` (writes `02c-craft.md`) or a transform's focused contract, plus `audit`, `critique`. No code touched.
- **Context** — `setup`, `teach`. PRODUCT.md / DESIGN.md only; allowed unconditionally.
- **Read-only** — `extract`. Produces a report; no project files modified.

Do NOT edit any file until the appropriate mutation gate is open.
