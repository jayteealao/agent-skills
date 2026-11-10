---
description: The design stage, which only a person runs, and the design record. `/wf design <slug> [move]` runs the design stage between intake and slice. It draws each changed screen on the design surface of the repo, checks it, takes the approval of the person from the answer event, and writes the visual contract `02c-craft.md`, so no driven stage decides a design. `explore` sketches ideas and settles nothing. `amend` reopens an approved design. `import` turns outside design work into screens. `setup`, `teach`, `extract`, `direction` and `sync` keep the design record of the project. `audit` and `critique` run the design dimensions of the review on demand.
argument-hint: "[slug] [move|amend|import|audit|critique|extract|explore] [instructions] | <setup|teach|extract|direction|sync|explore> [instructions]"
---

You are running `/wf design`. It has four jobs:

1. **The design stage.** A lifecycle stage between `intake` and `slice` that only a person runs. The person approves the screens here, before any stage that `/wf yolo` can run. [design/_lane.md](design/_lane.md) holds the rule and the design duties of each stage. The screens live on the design surface of the repo ([design/_surface.md](design/_surface.md)).
2. **Explore.** A free path that sketches ideas on the design surface and settles nothing ([design/explore.md](design/explore.md)).
3. **The design record.** The design memory of the project: identity, system, current design, direction. [design/record.md](design/record.md) defines it and its upkeep commands.
4. **On-demand design review.** `audit` and `critique` run the same logic as the `design-audit` and `design-critique` review dimensions.

## Card

- This stage is for a person only. A driver never runs it.
- Only the person approves a design. Take the approval from the answer event of the person.
- Draw each screen that changes on the design surface. Check the screens, get the approval, and write the visual contract `02c-craft.md`.
- Do not decide a visual question for the person.
- Done when every changed screen is approved and `02c-craft.md` carries the approval.

## Requires

Read every row that applies before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | |
| `02b-design.md` | artifact | if-present | |
| `decisions.yaml` | artifact | if-present | |
| `brainstorm-board-design.json` | artifact | if-present | |
| the origin brainstorm board named by origin-brainstorm | artifact | mode:stage | |
| `06-verify-*.md` | artifact | mode:audit | Accessibility Gate; Performance Gate |
| `06-verify-*.md` | artifact | mode:critique | |
| `design/_lane.md` | procedure | always | |
| `design/_output.md` | procedure | always | |
| `design/stage.md` | procedure | mode:stage | |
| `design/contract.md` | procedure | mode:stage | |
| `design/_carried.md` | procedure | mode:stage | |
| `design/_design-context.md` | procedure | mode:stage | |
| `design/_preflight.md` | procedure | mode:stage | |
| `design/_craft-floor.md` | procedure | mode:stage | |
| `design/_surface.md` | procedure | mode:stage | |
| `design/explore.md` | procedure | mode:explore | |
| `design/_surface.md` | procedure | mode:explore | |
| `design/_craft-floor.md` | procedure | mode:audit | |
| `design/_craft-floor.md` | procedure | mode:critique | |
| `design/_craft-floor.md` | procedure | mode:upkeep | Record guard |
| `design/import.md` | procedure | mode:import | |
| `design/_craft-floor.md` | procedure | mode:import | |
| `_host-surfaces.md` | procedure | mode:import | Design canvas |
| `design/audit.md` | procedure | mode:audit | |
| `design/critique.md` | procedure | mode:critique | |
| `design/_heuristics.md` | procedure | mode:critique | |
| `02c-craft.md` | writes | | |
| `07-design-audit.md` | writes | | |
| `07-design-critique.md` | writes | | |

The mode of a row is the job that Step 0 resolves: `stage` (also amend and a move), `explore`, `import`, `upkeep`, and `audit` or `critique` for a review. A row applies when it names that job. No `modes:` entry is needed.

# Step 0 — Parse the invocation

Resolve the first token by an exact existence check. Do not fuzzy-match: a wrong guess sends the work down the wrong path.

1. When `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <token0> index` exits 0, `token0` is the slug. Read `token1`:

   | `token1` | Job |
   |---|---|
   | absent | stage |
   | one of the 15 moves | stage, focused on that move |
   | `amend` | amend |
   | `import` | import; the rest of the invocation is the link or the paths |
   | `audit` or `critique` | review |
   | `extract` | upkeep; the report attaches to the slug |
   | `explore` | explore, linked to the slug |
   | anything else | stop, and render the usage below |

2. Otherwise `token0` is the command:

   | `token0` | Job |
   |---|---|
   | `explore` | explore; when `token1` is a slug (`record get` exits 0), the run links to it |
   | `setup`, `teach`, `extract`, `direction`, `sync` | upkeep |
   | `audit`, `critique` | review, freestanding against the target code |
   | one of the 15 moves | new workflow |
   | anything else, or no token | stop, and render the usage below |

The 15 moves: `adapt`, `animate`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `typeset`. The reference of each move is `design/<move>.md`. Step 1 names the reference of every other job.

```
Usage:
  /wf design <slug> [move] [instructions]   Run the design stage: draw the screens, check them, approve, write 02c-craft.md.
                                            On an approved design, a move runs its checks and draws nothing.
  /wf design <slug> amend [instructions]    Reopen an approved design.
  /wf design <slug> import <link|path>...   Turn outside design work into screens, then approve.
  /wf design explore [slug] [instructions]  Sketch ideas on the design surface. Settles nothing.
  /wf design [slug] audit|critique          Run a design review dimension now.
  /wf design <move> <instructions>          Start a new workflow seeded with a move.
  /wf design setup|teach|extract|direction|sync [instructions]
                                            Maintain the project's design record.

Moves: adapt · animate · bolder · clarify · colorize · delight · distill · harden ·
layout · onboard · optimize · overdrive · polish · quieter · typeset
```

Record the resolved job, slug, command and instructions before you continue.

# Step 1 — Run the job

## Stage and amend

Follow [design/stage.md](design/stage.md). The screens follow [design/_surface.md](design/_surface.md). A move on an approved design runs [design/stage.md](design/stage.md) → Move pass. The moves use the generic terms of [design/_platforms.md](design/_platforms.md).

Load [design/_craft-floor.md](design/_craft-floor.md) at Step 4 of the stage, before the first screen. Do not load it at Steps 1–3b. The Move pass reads it as a checklist.

## Explore

Follow [design/explore.md](design/explore.md). An explore run writes only explore sketches and, when it links to a workflow, decisions. It writes no screen and no contract.

## Import

Follow [design/import.md](design/import.md). An import continues at Step 5 of the design stage, where the person approves the imported screens. It loads the design record, the shared design context, and the move reference when a move is named. Load [design/_craft-floor.md](design/_craft-floor.md) with them, because the import skips Step 4.

## New workflow (`/wf design <move> <instructions>`)

Run `/wf intake <instructions>` in default mode. Before intake writes `00-index.md`, preset `ux-impact: visual` (or higher when the instructions add a surface) and `design-move: <move>`. The person confirms `ux-impact` in the stack confirmation of intake. The workflow then runs `shape`, and the design stage focuses on the recorded move.

## Upkeep

Follow the section of the command in [design/record.md](design/record.md). `setup` and `teach` also follow [design/setup.md](design/setup.md) and [design/teach.md](design/teach.md). `extract` also follows [design/extract.md](design/extract.md). Upkeep writes the design record only. It touches no workflow artifact, except that `extract` with a slug writes its report under `design-notes/` of that slug. Before a write to the design record, load [design/_craft-floor.md](design/_craft-floor.md) → Record guard ([design/record.md](design/record.md) → Floor guard).

## Review

Load [design/_craft-floor.md](design/_craft-floor.md), then follow [design/audit.md](design/audit.md) or [design/critique.md](design/critique.md). Check against its Refuse and Verify lists.

- With a slug, write the draft `<wf-dir>/.draft/07-design-audit.md` or `<wf-dir>/.draft/07-design-critique.md`, run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](_records.md), and register the augmentation per [design/_output.md](design/_output.md). `audit` uses the accessibility, performance and web-vitals results in `06-verify-*.md`. It measures them itself only when no verify ran.
- Without a slug, write no workflow artifact. Report in chat.

# Step 2 — Final summary

Emit the summary last, per [design/_output.md](design/_output.md) "Final-summary rules":

```
wf design <job> complete: <slug-or-"freestanding">

<Narrative — lead with the narrative per _chat-return.md, section The narrative.>

Design modes: <surface: persuade|operate|read|experience, ... | n/a>
Image gate: <pass | skipped:<reason> | n/a>
Screens: <keys> — approved in <commit> — <canvas URL> | n/a
Artifacts: <comma-separated paths, or "none">
Next: <Type `/wf <key> <args>`. | Done>
```

Write `Next` as "Type `/wf <key> <args>`." The person runs the key. Do not write that you run it.

| After | `Next` |
|---|---|
| the stage | the Next row of [design/stage.md](design/stage.md) |
| amend | the first plan to revisit |
| explore | [design/explore.md](design/explore.md) → Chat return |
