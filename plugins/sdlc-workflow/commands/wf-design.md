---
name: wf-design
description: Unified design command for the SDLC workflow. Three invocation modes: (1) /wf-design <slug> — runs the design stage (2b) for an active workflow; (2) /wf-design <slug> <sub-command> — runs a specific design sub-command in workflow context; (3) /wf-design <sub-command> — freestanding design work with no workflow context required. 22 sub-commands: shape, craft, audit, critique, extract, animate, bolder, clarify, colorize, delight, distill, harden, layout, onboard, optimize, overdrive, polish, quieter, typeset, adapt, setup, teach.
argument-hint: "[slug] [shape|craft|audit|critique|extract|animate|bolder|clarify|colorize|delight|distill|harden|layout|onboard|optimize|overdrive|polish|quieter|typeset|adapt|setup|teach] [target]"
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`), stage names or numbers, slash-command names, sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought.
- External-facing outputs include commit messages, branch names, PR titles/bodies, release notes, changelog entries, user documentation, code comments, and any file outside the private workflow artifact directories.
- Before writing, committing, pushing, or publishing anything, perform a leak check and remove internal workflow references.

You are running `wf-design`, the **unified design command** for the SDLC lifecycle.

# What this command does

Runs design sub-commands in three modes:
- **Workflow + stage 2b** (`/wf-design <slug>`): run the design stage for an active workflow
- **Workflow + sub-command** (`/wf-design <slug> <sub-command>`): run a specific design sub-command in workflow context
- **Freestanding** (`/wf-design <sub-command>`): run a design sub-command without a workflow

# Valid sub-commands

| Sub-command | Purpose |
|---|---|
| `shape` | Design brief with discovery interview + imagegen probes → writes 02b-design.md |
| `craft` | Design-to-code: build gate, visual direction, implementation, critique pass |
| `audit` | Technical quality scan (a11y, performance, theming, responsive, anti-patterns) |
| `critique` | Prescriptive design feedback on decisions and direction |
| `extract` | Reverse-engineer design tokens and patterns from existing code |
| `animate` | Add purposeful motion and micro-interactions |
| `bolder` | Increase visual presence, hierarchy, and conviction |
| `clarify` | Reduce cognitive load and improve scannability |
| `colorize` | Introduce strategic color to a monochromatic design |
| `delight` | Add moments of joy, surprise, and personality |
| `distill` | Remove complexity to the essential core |
| `harden` | Accessibility and robustness improvements |
| `layout` | Spatial structure, grid, alignment, and responsive behavior |
| `onboard` | Empty states and first-run experience design |
| `optimize` | Performance improvements |
| `overdrive` | Technically extraordinary visual effects |
| `polish` | Finishing details and state completeness |
| `quieter` | Reduce noise and visual complexity |
| `typeset` | Typography quality: font selection, scale, hierarchy |
| `adapt` | Context adaptation: responsive, platform, dark mode |
| `setup` | Create PRODUCT.md and DESIGN.md from a discovery interview |
| `teach` | Update or improve existing context files |

# Step 0 — Mode Resolution (MANDATORY)

Parse `$ARGUMENTS` to determine the invocation mode.

**Known sub-commands** (for argument matching):
`shape`, `craft`, `audit`, `critique`, `extract`, `animate`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `typeset`, `adapt`, `setup`, `teach`

**Resolution logic**:

1. **Zero arguments**: STOP. Output usage:
   ```
   Usage:
     /wf-design <slug>                    Run design stage 2b for a workflow
     /wf-design <slug> <sub-command>      Run sub-command in workflow context
     /wf-design <sub-command>             Freestanding design sub-command

   Sub-commands: shape · craft · audit · critique · extract · animate · bolder ·
   clarify · colorize · delight · distill · harden · layout · onboard · optimize ·
   overdrive · polish · quieter · typeset · adapt · setup · teach
   ```

2. **One argument**:
   - If arg 0 matches a **known sub-command** → **Mode C: freestanding** with that sub-command. No slug.
   - If `.ai/workflows/<arg0>/00-index.md` exists → **Mode A: workflow stage 2b**. Slug = arg 0. Sub-command = `shape`.
   - Otherwise → STOP. "Unknown sub-command and no workflow found for `<arg0>`. Run `/wf-design` with no arguments for usage."

3. **Two or more arguments**:
   - If arg 1 matches a **known sub-command**: check if `.ai/workflows/<arg0>/00-index.md` exists.
     - If yes → **Mode B: workflow + sub-command**. Slug = arg 0, sub-command = arg 1.
     - If no → STOP. "No workflow `<arg0>` found. Did you mean freestanding `/wf-design <arg1>`?"
   - If arg 1 does NOT match a sub-command:
     - Check if `.ai/workflows/<arg0>/00-index.md` exists → **Mode B** with sub-command = `shape` and remaining args as target description.
     - Otherwise → STOP. "Unknown sub-command `<arg1>`. Valid sub-commands: [list]."

**Record the resolved mode, slug (if any), and sub-command before proceeding.**

# Sub-command categories (used for stage gating)

| Category | Sub-commands | Workflow context behavior |
|---|---|---|
| **Context** | `setup`, `teach` | Always allowed at any stage. Modify PRODUCT.md / DESIGN.md only. |
| **Planning** | `shape` | Requires `02-shape.md`. Writes `02b-design.md`. Routes to `craft`. |
| **Contract** | `craft` | Requires `02b-design.md`. Writes `02c-craft.md` (visual contract — NOT code). Routes to `/wf-implement`. |
| **Read-only inspection** | `extract` | Allowed at any stage. Writes `design-notes/extract-<timestamp>.md`. |
| **Review** | `audit`, `critique` | Requires `current-stage` ∈ {`implement`, `verify`, `review`, `handoff`, `ship`}. Writes `07-design-audit.md` or `07-design-critique.md`. |
| **Transformation** | `animate`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `typeset`, `adapt` | Requires `current-stage` ∈ {`implement`, `verify`, `review`, `handoff`}. Modifies code. Registers as augmentation in `00-index.md`. Writes `design-notes/<sub>-<timestamp>.md`. |

**The transformation rule**: you cannot transform code that does not exist yet. Block with a clear message and offer the alternative path (e.g., "use `/wf-design <slug> shape` to plan the design before implementation, or `/wf-design <subcommand>` freestanding for ad-hoc work").

# Step 1 — Workflow Context (Modes A and B only)

If mode is A or B:

1. Read `.ai/workflows/<slug>/00-index.md`. Parse frontmatter: `title`, `current-stage`, `status`, `branch`, `open-questions`, `augmentations`.
2. **Check workflow status**: if `status: closed` → STOP. "Workflow `<slug>` is closed. Use `/wf-resume <slug>` to reopen or `/wf-quick quick intake` to start a new workflow."
3. **Check prerequisites for `shape` sub-command**:
   - `02-shape.md` must exist. If missing → STOP. "Run `/wf-shape <slug>` first to define scope before design."
   - If `02b-design.md` already exists → WARN: "Design brief already exists. Running `shape` again will overwrite `02b-design.md`. Proceed?"
4. **Check prerequisites for `craft` sub-command**:
   - `02b-design.md` must exist. If missing → STOP. "Run `/wf-design <slug> shape` first to confirm the design brief before craft."
   - If `02c-craft.md` already exists → WARN: "Visual contract already exists. Running `craft` again will overwrite `02c-craft.md`. Proceed?"
5. **Stage gate for review sub-commands** (`audit`, `critique`):
   - If `current-stage` ∈ {`intake`, `shape`, `design`, `slice`, `plan`} → STOP. "Cannot run `<sub-command>` at stage `<current-stage>`. There is no implementation to review yet. Run `/wf-implement <slug>` first, or use `/wf-design <sub-command>` freestanding to review existing code outside the workflow."
6. **Stage gate for transformation sub-commands** (the 15 in the table above):
   - If `current-stage` ∈ {`intake`, `shape`, `design`, `slice`, `plan`} → STOP. "Cannot run `<sub-command>` at stage `<current-stage>`. There is no code to transform yet. Options: (a) use `/wf-design <slug> shape` to plan the design before implementation, (b) run `/wf-implement <slug>` first, then re-run this command, (c) use `/wf-design <sub-command>` freestanding for ad-hoc design work outside the workflow."
   - If `current-stage` is `ship` or workflow is `complete` → WARN. "Workflow has shipped. Transformation will modify shipped code. Proceed?"
7. **Read relevant artifacts**: `02-shape.md` (if shape sub-command), `02b-design.md` (if craft or any transformation), `02c-craft.md` (if available, for transformations).
8. Carry forward `open-questions` and `selected-slice` from index.

# Step 2 — Load Design Skill

Load the `design` skill (at `skills/design/SKILL.md`) and execute the preflight protocol:

1. **Context gate**: read PRODUCT.md (project root → `.agents/context/` → `docs/`). If missing or invalid (< 200 chars, contains `[TODO]`):
   - If sub-command is `setup` or `teach` → proceed (these commands create/update PRODUCT.md).
   - Otherwise → STOP. "Design context is missing. Run `/wf-design setup` to create PRODUCT.md first."

2. **Register detection**: determine brand or product from task cue, surface in focus, or PRODUCT.md `## Register` field. Load `skills/design/reference/brand.md` or `skills/design/reference/product.md`.

3. **Codebase inspection sub-agents** (skip for `audit`, `critique`, `extract`, `setup`, `teach`):
   Run the 4 parallel sub-agents defined in `skills/design/SKILL.md`:
   - Token scanner
   - Framework + component detector
   - Context loader
   - Surface ranger
   
   Skip if sub-agent output is already in this session's history.

4. **State preflight** (Codex-style):
   ```
   WF_DESIGN_PREFLIGHT:
     mode=workflow|freestanding
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
   - **Code mutation** (transformation sub-commands, freestanding `craft`): only after image_gate resolves AND stage-gate passes
   - **Artifact mutation** (workflow-context `craft` writing `02c-craft.md`, `audit` writing report, etc.): allowed once stage-gate passes
   - **Context mutation** (`setup`, `teach` writing PRODUCT.md/DESIGN.md): allowed unconditionally
   - **Read-only** (`extract`): no mutation; produces report only

   Do NOT edit any file until the appropriate mutation gate is open.

# Step 3 — Load Sub-command Reference

Load the reference file for the resolved sub-command from `skills/design/reference/<sub-command>.md`. Follow it exactly.

The reference file is the authoritative instruction for the sub-command. The steps above are prerequisite scaffolding only.

# Step 4 — Workflow Artifact Output (Modes A and B only)

After the sub-command completes, write workflow artifacts according to category:

| Sub-command | Artifact written | `00-index.md` updates |
|---|---|---|
| `setup`, `teach` | PRODUCT.md / DESIGN.md (project root) | none |
| `shape` | `02b-design.md` | `current-stage: design`, `next-command: /wf-design craft`, `next-invocation: /wf-design <slug> craft` |
| `craft` | `02c-craft.md` (visual contract — NOT code) | `current-stage: design` (unchanged), `next-command: /wf-implement`, `next-invocation: /wf-implement <slug>` |
| `extract` | `design-notes/extract-<timestamp>.md` + `design-notes/tokens-extracted.css` | none |
| `audit` | `07-design-audit.md` | append to `augmentations:` list |
| `critique` | `07-design-critique.md` | append to `augmentations:` list |
| Transformations (15) | `design-notes/<sub-command>-<timestamp>.md` documenting changes made | append to `augmentations:` list with `<sub-command>:<timestamp>` |

**Augmentation registration** (for transformations, audit, critique):

Add an entry to the `augmentations:` list in `00-index.md` frontmatter:

```yaml
augmentations:
  - type: design-<sub-command>
    artifact: design-notes/<sub-command>-<timestamp>.md   # or 07-design-audit.md, 07-design-critique.md
    created-at: <timestamp>
    files-modified: [list of code files changed]   # transformations only
```

If the `augmentations:` field does not yet exist in `00-index.md`, create it.

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
1. **What changed** — bullet list of specific changes per file
2. **Why** — design rationale (one paragraph)
3. **Reference followed** — which design reference doc guided this work
4. **Verification needed** — what `wf-verify` should re-check (visual regression? a11y? perf?)
5. **Anti-patterns avoided** — confirm none of the absolute bans were introduced

This artifact lets `wf-review` and `wf-handoff` see exactly what design augmentations were applied during implement.

# Step 5 — Hand off to user

Compact chat summary (≤ 8 lines):

```
wf-design <sub-command> complete: <slug or "freestanding">
Register: <brand|product>
Image gate: <pass|skipped:<reason>>
[For workflow modes]: Artifact: .ai/workflows/<slug>/<artifact>
[For workflow modes]: Next: <next-invocation>
```

# Command reference summary

This command is the unified successor to:
- The previous `wf-design` command (design stage 2b → now `shape` sub-command)
- `wf-design-audit` → now `wf-design <slug> audit`
- `wf-design-critique` → now `wf-design <slug> critique`
- `wf-design-extract` → now `wf-design <slug> extract`
- `wf-design-setup` → now `wf-design setup` (freestanding)
- 14 standalone `design-*` skills → now `wf-design <sub-command>` (freestanding or workflow-scoped)
