---
description: The human-only design stage and the design record. `/wf design <slug> [move]` runs the design stage between shape and slice — draw one board per changed surface, get the person's confirmation, freeze the boards, write the visual contract `02c-craft.md` — so no driven stage ever decides a design. `amend` reopens a confirmed design. `import` turns outside design work into boards. `setup`, `teach`, `extract`, `direction`, and `sync` maintain the project's design record. `audit` and `critique` run the review's design dimensions on demand.
argument-hint: "[slug] [move|amend|import|audit|critique|extract] [instructions] | <setup|teach|extract|direction|sync> [instructions]"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `/wf design`. It has three jobs:

1. **The design stage.** A human-only lifecycle stage between `shape` and `slice`. The person confirms the design here, before any stage that `/wf auto` or `/wf yolo` can run. The rule and the per-stage design duties are in [design/_lane.md](design/_lane.md).
2. **The design record.** The project-level design memory: identity, system, current design, direction. [design/record.md](design/record.md) defines it and its upkeep commands.
3. **On-demand design review.** `audit` and `critique` run the same logic as the `design-audit` and `design-critique` review dimensions.

> **Narrative fragments.** Any artifact may ship free narrative fragments — a token swatch board, an annotated drawing, a live component preview. Rules: [_fragment-authoring.md](_fragment-authoring.md) Step F2.

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | |
| `02b-design.md` | artifact | if-present | |
| `po-answers.md` | artifact | if-present | |
| `brainstorm-board-design.json` | artifact | if-present | |
| the origin brainstorm board named by origin-brainstorm | artifact | mode:stage | |
| `06-verify-*.md` | artifact | mode:audit | Accessibility Gate; Performance Gate |
| `design/_lane.md` | procedure | always | |
| `design/_output.md` | procedure | always | |
| `design/stage.md` | procedure | mode:stage | |
| `design/contract.md` | procedure | mode:stage | |
| `design/_carried.md` | procedure | mode:stage | |
| `design/_design-context.md` | procedure | mode:stage | |
| `design/_boards.md` | procedure | mode:stage | |
| `design/import.md` | procedure | mode:import | |
| `design/audit.md` | procedure | mode:audit | |
| `design/critique.md` | procedure | mode:critique | |
| `02c-craft.md` | writes | | |
| `07-design-audit.md` | writes | | |
| `07-design-critique.md` | writes | | |

# Step 0 — Parse the invocation

Resolve the first token by an exact existence check. Never fuzzy-match: a wrong guess sends the work down the wrong path.

1. **When `.ai/workflows/<token0>/00-index.md` exists**, `token0` is the slug. Read `token1`:
   - absent → **stage**;
   - one of the 15 moves → **stage** focused on that move;
   - `amend` → **amend**;
   - `import` → **import**; the rest of the invocation is the link or the paths;
   - `audit` or `critique` → **review**;
   - `extract` → **upkeep** (the report attaches to the slug);
   - anything else → STOP and render the usage below.
2. **Else**, `token0` is the command:
   - `setup`, `teach`, `extract`, `direction`, `sync` → **upkeep**;
   - `audit`, `critique` → **review**, freestanding against the target code;
   - one of the 15 moves → **new workflow**;
   - anything else, or no token → STOP and render the usage below.

The 15 moves: `adapt`, `animate`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `typeset`. The table in [design/_commands.md](design/_commands.md) maps every command to its reference.

```
Usage:
  /wf design <slug> [move] [instructions]   Run the design stage: draw, confirm, write 02c-craft.md.
  /wf design <slug> amend [instructions]    Reopen a confirmed design.
  /wf design <slug> import <link|path>...   Turn outside design work into boards, then confirm.
  /wf design [slug] audit|critique          Run a design review dimension now.
  /wf design <move> <instructions>          Start a new workflow seeded with a move.
  /wf design setup|teach|extract|direction|sync [instructions]
                                            Maintain the project's design record.

Moves: adapt · animate · bolder · clarify · colorize · delight · distill · harden ·
layout · onboard · optimize · overdrive · polish · quieter · typeset
```

Record the resolved job, slug, command, and instructions before you continue.

# Step 1 — Run the job

## Stage and amend

Follow [design/stage.md](design/stage.md) exactly. The boards follow [design/_boards.md](design/_boards.md).

## Import

Follow [design/import.md](design/import.md). An import continues at the design stage, Step 5: the person confirms the imported boards. It loads the design record, the shared design context, and the move reference when a move is named.

## New workflow (`/wf design <move> <instructions>`)

Run `/wf intake <instructions>` in default mode. Before intake writes `00-index.md`, preset `ux-impact: visual` (or higher when the instructions add a surface) and `design-move: <move>`. The person confirms `ux-impact` in intake's stack confirmation. The workflow then runs `shape`, and the design stage focuses on the recorded move.

## Upkeep

Follow the command's section in [design/record.md](design/record.md). `setup` and `teach` also follow [design/setup.md](design/setup.md) and [design/teach.md](design/teach.md). `extract` also follows [design/extract.md](design/extract.md). Upkeep writes the design record only; it touches no workflow artifact, except that `extract` with a slug writes its report under that slug's `design-notes/`.

## Review

Load [design/_design-context.md](design/_design-context.md) → Absolute bans, then follow [design/audit.md](design/audit.md) or [design/critique.md](design/critique.md).
- With a slug, write `07-design-audit.md` or `07-design-critique.md`, and register the augmentation per [design/_output.md](design/_output.md). `audit` consumes the accessibility, performance, and web-vitals results in `06-verify-*.md`; it measures them itself only when no verify ran.
- Without a slug, write no workflow artifact. Report in chat.

# Step 2 — Final summary

Emit the summary last, per [design/_output.md](design/_output.md) Step 6:

```
wf design <job> complete: <slug-or-"freestanding">

<Narrative — quote the explainer summary, per _story-arc.md A6.>

Register: <brand|product>
Image gate: <pass | skipped:<reason> | n/a>
Artifacts: <comma-separated paths, or "none">
Next: <one invocation, or "Done">
```

After the stage, `Next` is `/wf slice <slug>`. After amend, `Next` names the first plan to revisit.
