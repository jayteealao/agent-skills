---
description: The human-only design stage and the design record. `/wf design <slug> [move]` runs the design stage between intake and slice — draw one board per changed surface, get the person's confirmation, freeze the boards, write the visual contract `02c-craft.md` — so no driven stage ever decides a design. `amend` reopens a confirmed design. `import` turns outside design work into boards. `setup`, `teach`, `extract`, `direction`, and `sync` maintain the project's design record. `audit` and `critique` run the review's design dimensions on demand.
argument-hint: "[slug] [move|amend|import|audit|critique|extract] [instructions] | <setup|teach|extract|direction|sync> [instructions]"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `/wf design`. It has three jobs:

1. **The design stage.** A human-only lifecycle stage between `intake` and `slice`. The person confirms the design here, before any stage that `/wf yolo` can run. The rule and the per-stage design duties are in [design/_lane.md](design/_lane.md).
2. **The design record.** The project-level design memory: identity, system, current design, direction. [design/record.md](design/record.md) defines it and its upkeep commands.
3. **On-demand design review.** `audit` and `critique` run the same logic as the `design-audit` and `design-critique` review dimensions.

## Card

- This stage is for a person only. A driver never runs it.
- Draw one board for each surface that changes. Get the confirmation of the person. Freeze the confirmed boards, and write the visual contract `02c-craft.md`.
- Do not decide a visual question for the person.
- Done when every changed surface has a frozen board and `02c-craft.md` is written.

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | |
| `02b-design.md` | artifact | if-present | |
| `decisions.yaml` | artifact | if-present | |
| `brainstorm-board-design.json` | artifact | if-present | |
| the origin brainstorm board named by origin-brainstorm | artifact | mode:stage | |
| `06-verify-*.md` | artifact | mode:audit | Accessibility Gate; Performance Gate |
| `design/_lane.md` | procedure | always | |
| `design/_output.md` | procedure | always | |
| `design/stage.md` | procedure | mode:stage | |
| `design/contract.md` | procedure | mode:stage | |
| `design/_carried.md` | procedure | mode:stage | |
| `design/_design-context.md` | procedure | mode:stage | |
| `design/_preflight.md` | procedure | mode:stage | |
| `design/_craft-floor.md` | procedure | mode:stage | |
| `_host-surfaces.md` | procedure | mode:stage | Design canvas |
| `design/_craft-floor.md` | procedure | mode:audit | |
| `design/_craft-floor.md` | procedure | mode:critique | |
| `design/_craft-floor.md` | procedure | mode:upkeep | Record guard |
| `design/_boards.md` | procedure | mode:stage | |
| `design/import.md` | procedure | mode:import | |
| `design/_craft-floor.md` | procedure | mode:import | |
| `_host-surfaces.md` | procedure | mode:import | Design canvas |
| `design/audit.md` | procedure | mode:audit | |
| `design/critique.md` | procedure | mode:critique | |
| `design/_heuristics.md` | procedure | mode:critique | |
| `02c-craft.md` | writes | | |
| `07-design-audit.md` | writes | | |
| `07-design-critique.md` | writes | | |

# Step 0 — Parse the invocation

Resolve the first token by an exact existence check. Never fuzzy-match: a wrong guess sends the work down the wrong path.

1. **When `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <token0> index` exits 0**, `token0` is the slug. Read `token1`:
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

The 15 moves: `adapt`, `animate`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `typeset`. Each move's reference is `design/<move>.md`. Step 1 names the reference of every other job.

```
Usage:
  /wf design <slug> [move] [instructions]   Run the design stage: draw, confirm, write 02c-craft.md.
                                            On a confirmed design, a move runs its checks and draws nothing.
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

Follow [design/stage.md](design/stage.md) exactly. The boards follow [design/_boards.md](design/_boards.md). A move on a confirmed design runs [design/stage.md](design/stage.md) → Move pass. The moves use the generic terms of [design/_platforms.md](design/_platforms.md).

Load [design/_craft-floor.md](design/_craft-floor.md) at Step 4, before the first board. Do not load it at Steps 1–3b. The Move pass reads it as a checklist.

## Import

Follow [design/import.md](design/import.md). An import continues at the design stage, Step 5: the person confirms the imported boards. It loads the design record, the shared design context, and the move reference when a move is named. Load [design/_craft-floor.md](design/_craft-floor.md) with them, because the import skips Step 4.

## New workflow (`/wf design <move> <instructions>`)

Run `/wf intake <instructions>` in default mode. Before intake writes `00-index.md`, preset `ux-impact: visual` (or higher when the instructions add a surface) and `design-move: <move>`. The person confirms `ux-impact` in intake's stack confirmation. The workflow then runs `shape`, and the design stage focuses on the recorded move.

## Upkeep

Follow the command's section in [design/record.md](design/record.md). `setup` and `teach` also follow [design/setup.md](design/setup.md) and [design/teach.md](design/teach.md). `extract` also follows [design/extract.md](design/extract.md). Upkeep writes the design record only; it touches no workflow artifact, except that `extract` with a slug writes its report under that slug's `design-notes/`. Before a write to the design record, load [design/_craft-floor.md](design/_craft-floor.md) → Record guard ([design/record.md](design/record.md) → Floor guard).

## Review

Load [design/_craft-floor.md](design/_craft-floor.md), then follow [design/audit.md](design/audit.md) or [design/critique.md](design/critique.md). Check against its Refuse and Verify lists.
- With a slug, write the draft `.ai/workflows/<slug>/.draft/07-design-audit.md` or `.ai/workflows/<slug>/.draft/07-design-critique.md`, run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](_records.md), and register the augmentation per [design/_output.md](design/_output.md). `audit` consumes the accessibility, performance, and web-vitals results in `06-verify-*.md`; it measures them itself only when no verify ran.
- Without a slug, write no workflow artifact. Report in chat.

# Step 2 — Final summary

Emit the summary last, per [design/_output.md](design/_output.md) "Final-summary rules":

```
wf design <job> complete: <slug-or-"freestanding">

<Narrative — lead with the narrative per _chat-return.md, section The narrative.>

Design modes: <surface: persuade|operate|read|experience, ... | n/a>
Image gate: <pass | skipped:<reason> | n/a>
Boards: <design/r<N>/ — <count> boards — design/r<N>/index.html | n/a>
Artifacts: <comma-separated paths, or "none">
Next: <Type `/wf <key> <args>`. | Done>
```

Write `Next` as "Type `/wf <key> <args>`." The person runs the key; never write that you run it.
- After the stage, write `Next` from the Next row of [design/stage.md](design/stage.md). An `rca` workflow has no slice stage.
- When `00-index.md` has `origin-packet`, the workflow is a campaign work packet, and the campaign walk slices it. `Next` is "Type `/wf campaign <source-slug>`." The `<source-slug>` is the folder in the `origin-packet` path (`.ai/workflows/<source-slug>/work/<packet-slug>.md`).
- After amend, `Next` names the first plan to revisit.
