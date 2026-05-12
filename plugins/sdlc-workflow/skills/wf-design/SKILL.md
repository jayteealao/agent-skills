---
name: wf-design
description: Design router for the SDLC plugin. Three modes — workflow stage 2b (`/wf-design <slug>`), workflow + sub-command (`/wf-design <slug> <sub>`), or freestanding (`/wf-design <sub>`). 22 sub-commands across planning (shape, craft), review (audit, critique, extract), transformations (animate, bolder, clarify, colorize, delight, distill, harden, layout, onboard, optimize, overdrive, polish, quieter, typeset, adapt), and project context (setup, teach).
disable-model-invocation: true
argument-hint: "[slug] [shape|craft|audit|critique|extract|animate|bolder|clarify|colorize|delight|distill|harden|layout|onboard|optimize|overdrive|polish|quieter|typeset|adapt|setup|teach] [target]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **design dispatcher** for the SDLC plugin. The 22 sub-commands you route to are *design operators* — `shape` and `craft` produce planning/contract artifacts inside a workflow; `audit`, `critique`, `extract` are read-only or report-producing; the 15 transformation operators (animate, bolder, clarify, colorize, delight, distill, harden, layout, onboard, optimize, overdrive, polish, quieter, typeset, adapt) modify code; `setup` and `teach` author project context. Your job is to identify the invocation mode, resolve the sub-command, run preflight gates, load the matching reference body, and (for workflow modes) write the workflow artifact.

# Step 0 — Mode + Sub-command Resolution (MANDATORY)

Parse `$ARGUMENTS` to determine the invocation mode.

**Known sub-command keys**:
`shape`, `craft`, `audit`, `critique`, `extract`, `animate`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `typeset`, `adapt`, `setup`, `teach`.

**Resolution logic**:

1. **Zero arguments** → STOP. Render usage:
   ```
   Usage:
     /wf-design <slug>                    Run design stage 2b for a workflow (writes 02b-design.md)
     /wf-design <slug> <sub-command>      Run sub-command in workflow context
     /wf-design <sub-command>             Freestanding design sub-command (no workflow)

   Sub-commands: shape · craft · audit · critique · extract · animate · bolder · clarify ·
   colorize · delight · distill · harden · layout · onboard · optimize · overdrive ·
   polish · quieter · typeset · adapt · setup · teach
   ```

2. **One argument**:
   - If arg 0 matches a known sub-command → **Mode C: freestanding** with that sub-command. No slug.
   - Else if `.ai/workflows/<arg0>/00-index.md` exists → **Mode A: workflow stage 2b**. Slug = arg 0. Sub-command = `shape`.
   - Else → STOP. *"Unknown sub-command and no workflow found for `<arg0>`. Run `/wf-design` with no arguments for usage."*

3. **Two or more arguments**:
   - If arg 1 matches a known sub-command:
     - If `.ai/workflows/<arg0>/00-index.md` exists → **Mode B: workflow + sub-command**. Slug = arg 0, sub-command = arg 1, remaining args become target/description.
     - Else → STOP. *"No workflow `<arg0>` found. Did you mean freestanding `/wf-design <arg1>`?"*
   - If arg 1 does NOT match a sub-command:
     - If `.ai/workflows/<arg0>/00-index.md` exists → **Mode B** with sub-command = `shape` and remaining args as target description.
     - Else → STOP. *"Unknown sub-command `<arg1>`. Valid sub-commands: shape, craft, audit, critique, extract, animate, bolder, clarify, colorize, delight, distill, harden, layout, onboard, optimize, overdrive, polish, quieter, typeset, adapt, setup, teach."*

**Record the resolved mode, slug (if any), and sub-command before proceeding.**

## Sub-command categories (used for stage gating in Step 1)

| Category | Sub-commands | Workflow context behavior |
|---|---|---|
| **Context** | `setup`, `teach` | Always allowed at any stage. Modify PRODUCT.md / DESIGN.md only. |
| **Planning** | `shape` | Requires `02-shape.md`. Writes `02b-design.md`. Routes to `craft`. |
| **Contract** | `craft` | Requires `02b-design.md`. Writes `02c-craft.md` (visual contract — NOT code). Routes to `/wf implement`. |
| **Read-only inspection** | `extract` | Allowed at any stage. Writes `design-notes/extract-<timestamp>.md`. |
| **Review** | `audit`, `critique` | Requires `current-stage` ∈ {`implement`, `verify`, `review`, `handoff`, `ship`}. Writes `07-design-audit.md` or `07-design-critique.md`. |
| **Transformation** | `animate`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `typeset`, `adapt` | Requires `current-stage` ∈ {`implement`, `verify`, `review`, `handoff`}. Modifies code. Registers as augmentation in `00-index.md`. Writes `design-notes/<sub>-<timestamp>.md`. |

**The transformation rule**: you cannot transform code that does not exist yet. Block with a clear message and offer the alternative path (e.g., *"use `/wf-design <slug> shape` to plan the design before implementation, or `/wf-design <subcommand>` freestanding for ad-hoc work"*).

# Step 1 — Workflow Context Check (Modes A and B only)

Skip this step in Mode C (freestanding).

1. Read `.ai/workflows/<slug>/00-index.md`. Parse frontmatter: `title`, `current-stage`, `status`, `branch`, `open-questions`, `augmentations`.
2. **Check workflow status**: if `status: closed` → STOP. *"Workflow `<slug>` is closed. Use `/wf-meta resume <slug>` to reopen or `/wf intake` to start a new workflow."*
3. **Prerequisites for `shape`**:
   - `02-shape.md` must exist. If missing → STOP. *"Run `/wf shape <slug>` first to define scope before design."*
   - If `02b-design.md` already exists → WARN: *"Design brief already exists. Running `shape` again will overwrite `02b-design.md`. Proceed?"*
4. **Prerequisites for `craft`**:
   - `02b-design.md` must exist. If missing → STOP. *"Run `/wf-design <slug> shape` first to confirm the design brief before craft."*
   - If `02c-craft.md` already exists → WARN: *"Visual contract already exists. Running `craft` again will overwrite `02c-craft.md`. Proceed?"*
5. **Stage gate for review sub-commands** (`audit`, `critique`):
   - If `current-stage` ∈ {`intake`, `shape`, `design`, `slice`, `plan`} → STOP. *"Cannot run `<sub-command>` at stage `<current-stage>`. There is no implementation to review yet. Run `/wf implement <slug>` first, or use `/wf-design <sub-command>` freestanding to review existing code outside the workflow."*
6. **Stage gate for transformation sub-commands** (the 15 in the table above):
   - If `current-stage` ∈ {`intake`, `shape`, `design`, `slice`, `plan`} → STOP. *"Cannot run `<sub-command>` at stage `<current-stage>`. There is no code to transform yet. Options: (a) use `/wf-design <slug> shape` to plan the design before implementation, (b) run `/wf implement <slug>` first, then re-run this command, (c) use `/wf-design <sub-command>` freestanding for ad-hoc design work outside the workflow."*
   - If `current-stage` is `ship` or workflow is `complete` → WARN. *"Workflow has shipped. Transformation will modify shipped code. Proceed?"*
7. **Read relevant artifacts**: `02-shape.md` (if `shape`), `02b-design.md` (if `craft` or any transformation), `02c-craft.md` (if available, for transformations).
8. Carry forward `open-questions` and `selected-slice` from index.

# Step 2 — Preflight (all modes)

Before any design work or file edits, pass these gates. Skipping them produces generic output that ignores the project.

| Gate | Required check | If fail |
|---|---|---|
| Context | PRODUCT.md exists and is valid (≥200 chars, no `[TODO]` markers) | If sub-command is `setup` or `teach` → proceed (these create/update PRODUCT.md). Otherwise STOP: *"Design context is missing. Run `/wf-design setup` to create PRODUCT.md first."* |
| Register | `brand` or `product` is determined for this task | Read PRODUCT.md `## Register` section; infer from task cue if missing. Suggest `/wf-design teach` to add it explicitly. |
| Codebase | Codebase inspection sub-agents have run | Run the 4 parallel inspection sub-agents (below). Skip if their output is already in this session. |
| Shape | For `craft` only: design brief explicitly confirmed by user | Run `/wf-design <slug> shape` (or freestanding `/wf-design shape`), confirm brief, then proceed. |
| Image gate | Required visual probes are generated, or skipped with a recorded reason | Resolve in `shape` or `craft` reference before proceeding to code. |
| Mutation | All gates above pass; mutation type matches sub-command | Do not edit project files until mutation is open. |

**Codebase gate is relaxed for**: `audit`, `critique`, `extract`, `setup`, `teach` — these are read-only or context-authoring.

**Mutation types**:
- **Code**: transformation sub-commands + freestanding `craft`. Requires image_gate resolved.
- **Artifact**: workflow-context `craft` (writes `02c-craft.md`), `audit`, `critique`. No code touched.
- **Context**: `setup`, `teach`. PRODUCT.md / DESIGN.md only.
- **Read-only**: `extract`. Produces a report; no project files modified.

## Context gathering

Two files, case-insensitive. Search project root first, then `.agents/context/`, then `docs/`.

- **PRODUCT.md** — required. Users, brand, tone, anti-references, strategic principles, register.
- **DESIGN.md** — optional, strongly recommended. Colors, typography, elevation, components, tokens.

If PRODUCT.md is missing, empty, or has `[TODO]` markers: run `/wf-design setup` and resume after context is established.

If DESIGN.md is missing: nudge once per session (*"Run `/wf-design setup` or `/wf-design teach` for better on-brand output"*), then proceed.

## Register detection

Every design task is **brand** (marketing, landing, campaign, portfolio — design IS the product) or **product** (app UI, admin, dashboard, tool — design SERVES the product). Determine before designing.

Priority:
1. Task cue ("landing page" → brand, "dashboard" → product).
2. Surface in focus (the file, page, or route being worked on).
3. `## Register` field in PRODUCT.md.

First match wins. If PRODUCT.md lacks the field, infer from its Users and Product Purpose sections.

Load the matching register reference: `${CLAUDE_PLUGIN_ROOT}/skills/wf-design/reference/brand.md` or `${CLAUDE_PLUGIN_ROOT}/skills/wf-design/reference/product.md`.

## Codebase inspection sub-agents

Run these 4 sub-agents in parallel before any design command that edits files (skip for `audit`, `critique`, `extract`, `setup`, `teach`):

**Agent 1 — Token scanner.** Search for design tokens: CSS custom properties (`--color-*`, `--spacing-*`, `--font-*`, `--radius-*`), Tailwind config `theme.extend`, `tokens.json`, Style Dictionary source files. Return extracted token table.

**Agent 2 — Framework + component detector.** Identify: UI framework (React/Vue/Svelte/Angular from package.json), component library (shadcn/ui, Radix, Headless UI, MUI, Mantine, Ant Design, Chakra), CSS approach (Tailwind, CSS modules, styled-components, plain CSS), Tailwind version, sample component path.

**Agent 3 — Context loader.** Read PRODUCT.md and DESIGN.md (project root → `.agents/context/` → `docs/`). Extract: register, brand-personality, users, aesthetic-direction, design-principles.

**Agent 4 — Surface ranger.** Find files relevant to the current task: active page/component files, related CSS, primary component. If working in workflow context, read `02-shape.md` for `files-in-scope`.

If sub-agent output is already in session history, don't re-run.

## Preflight state record

Record before loading the sub-command reference:

```
WF_DESIGN_PREFLIGHT:
  mode=A|B|C
  sub-command=<name>
  stage=<current-stage or "n/a">
  stage-gate=pass|blocked:<reason>
  context=pass|missing
  register=brand|product
  codebase=pass|skipped
  image_gate=pending|pass|skipped:<reason>  (resolved in shape/craft)
  mutation=blocked|open
```

`mutation=open` rules:
- **Code mutation** (transformation sub-commands, freestanding `craft`): only after image_gate resolves AND stage-gate passes.
- **Artifact mutation** (workflow-context `craft` writing `02c-craft.md`, `audit` writing report, etc.): allowed once stage-gate passes.
- **Context mutation** (`setup`, `teach` writing PRODUCT.md/DESIGN.md): allowed unconditionally.
- **Read-only** (`extract`): no mutation; produces report only.

Do NOT edit any file until the appropriate mutation gate is open.

# Step 3 — Load Sub-command Reference

Load the reference for the resolved sub-command from `${CLAUDE_PLUGIN_ROOT}/skills/wf-design/reference/<sub-command>.md` and follow it verbatim. Do not summarize, paraphrase, or skip.

The reference is the authoritative instruction. The steps above are prerequisite scaffolding only.

| Sub-command | Reference file | Purpose |
|---|---|---|
| `shape` | `reference/shape.md` | Design brief with discovery interview + imagegen probes |
| `craft` | `reference/craft.md` | Design-to-code with build gate and visual direction |
| `audit` | `reference/audit.md` | Technical quality scan (a11y, performance, theming, responsive, anti-patterns) |
| `critique` | `reference/critique.md` | Prescriptive design feedback |
| `extract` | `reference/extract.md` | Reverse-engineer design tokens from existing code |
| `animate` | `reference/animate.md` | Add purposeful motion and micro-interactions |
| `bolder` | `reference/bolder.md` | Increase visual presence and hierarchy |
| `clarify` | `reference/clarify.md` | Reduce cognitive load and improve scannability |
| `colorize` | `reference/colorize.md` | Introduce strategic color |
| `delight` | `reference/delight.md` | Add moments of joy and personality |
| `distill` | `reference/distill.md` | Remove complexity to the essential core |
| `harden` | `reference/harden.md` | Accessibility and robustness improvements |
| `layout` | `reference/layout.md` | Spatial structure, grid, and alignment |
| `onboard` | `reference/onboard.md` | Empty states and first-run experience |
| `optimize` | `reference/optimize.md` | Performance improvements |
| `overdrive` | `reference/overdrive.md` | Technically extraordinary visual effects |
| `polish` | `reference/polish.md` | Finishing details and state completeness |
| `quieter` | `reference/quieter.md` | Reduce noise and visual complexity |
| `typeset` | `reference/typeset.md` | Typography quality and hierarchy |
| `adapt` | `reference/adapt.md` | Context adaptation (responsive, platform, theme) |
| `setup` | `reference/setup.md` | Create PRODUCT.md and DESIGN.md |
| `teach` | `reference/teach.md` | Update or improve existing context files |

# Step 4 — Workflow Artifact Output (Modes A and B only)

Skip this step in Mode C (freestanding).

After the sub-command completes, write the workflow artifact and update `00-index.md`:

| Sub-command | Artifact written | `00-index.md` updates |
|---|---|---|
| `setup`, `teach` | PRODUCT.md / DESIGN.md (project root) | none |
| `shape` | `02b-design.md` | `current-stage: design`, `next-command: /wf-design craft`, `next-invocation: /wf-design <slug> craft` |
| `craft` | `02c-craft.md` (visual contract — NOT code) | `current-stage: design` (unchanged), `next-command: /wf implement`, `next-invocation: /wf implement <slug>` |
| `extract` | `design-notes/extract-<timestamp>.md` + `design-notes/tokens-extracted.css` | none |
| `audit` | `07-design-audit.md` | append to `augmentations:` list |
| `critique` | `07-design-critique.md` | append to `augmentations:` list |
| Transformations (15) | `design-notes/<sub-command>-<timestamp>.md` documenting changes | append to `augmentations:` list with `<sub-command>:<timestamp>` |

**Augmentation registration** (transformations, audit, critique):

```yaml
augmentations:
  - type: design-<sub-command>
    artifact: design-notes/<sub-command>-<timestamp>.md   # or 07-design-audit.md, 07-design-critique.md
    created-at: <timestamp>
    files-modified: [list of code files changed]   # transformations only
```

Create the `augmentations:` field in `00-index.md` if it does not yet exist.

**Transformation artifact contract** (`design-notes/<sub-command>-<timestamp>.md`):

```yaml
---
schema: sdlc/v1
type: design-augmentation
sub-command: <name>
slug: <slug>
created-at: <timestamp>
register: <brand|product>
files-modified: [list]
---
```

Body sections:
1. **What changed** — bullet list of specific changes per file.
2. **Why** — design rationale (one paragraph).
3. **Reference followed** — which design reference doc guided this work.
4. **Verification needed** — what `/wf verify` should re-check (visual regression? a11y? perf?).
5. **Anti-patterns avoided** — confirm none of the absolute bans were introduced.

This artifact lets `/wf review` and `/wf handoff` see exactly what design augmentations were applied during implement.

# Step 5 — Hand off to user

Compact chat summary (≤ 8 lines):

```
wf-design <sub-command> complete: <slug or "freestanding">
Register: <brand|product>
Image gate: <pass|skipped:<reason>>
[For workflow modes]: Artifact: .ai/workflows/<slug>/<artifact>
[For workflow modes]: Next: <next-invocation>
```

# Shared design laws

Apply to every design, both registers. Never converge on the same choices across projects. Vary.

## Color
- Use OKLCH. Reduce chroma as lightness approaches 0 or 100.
- Never `#000` or `#fff`. Tint every neutral toward the brand hue (chroma 0.005–0.01).
- Choose a color strategy: Restrained / Committed / Full palette / Drenched. Brand defaults to Committed or higher. Product defaults to Restrained.

## Typography
- Establish hierarchy through size AND weight contrast — not just one.
- Minimum 16px body text. Line height ≥ 1.5 for prose.
- Max 65–75ch line length for prose content.
- Scale ratio: ≥1.25 for brand, 1.125–1.2 for product.

## Spacing
- Use a consistent spatial system with a 4px or 8px base unit.
- Proximity is meaning: related elements get tighter spacing.
- Whitespace as emphasis: contrast between dense and spacious creates hierarchy.

## Components
- Every interactive element: default, hover, focus, active, disabled states.
- Loading: skeletons not spinners for content areas.
- Empty states teach and guide; they are not error states.

## Accessibility
- `@media (prefers-reduced-motion: reduce)` for all animations — design for motion first.
- Focus rings visible, meeting 3:1 contrast ratio against adjacent background.
- Color is never the only indicator for any state.

# Absolute bans (both registers)

- `border-left` or `border-right` > 1px as a decorative colored accent stripe — use full hairline border, background tint, or leading glyph instead.
- Purple-blue generic gradients.
- Generic hero metric cards ("10x faster", "500+ customers") without real product proof.
- Nested card-inside-card layouts.
- Bounce or elastic easing in production UI.
- Pure `#000` or `#fff` for text or large areas.
- Fraunces or Cormorant as the primary display face on a new brand surface.
