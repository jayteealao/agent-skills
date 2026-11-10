---
description: The design stage, which only a person runs, and the design record. `/wf design <slug>` runs the design stage between intake and slice. It draws each changed screen on the design surface of the repo, checks it, takes the approval of the person from the answer event, and writes the visual contract `02c-craft.md`, so no driven stage decides a design. `amend` reopens an approved design. `import` turns outside design work into screens. `explore` sketches ideas and settles nothing. `record`, `extract`, `direction` and `sync` keep the design record of the project. `audit` and `critique` run the design dimensions of the review on demand.
argument-hint: "<slug> [amend|import <link|path>...] [instructions] | explore [slug] [instructions] | more: <slug> <move> | [slug] audit|critique|extract | record|direction|sync"
---

You are running `/wf design`. It has four jobs: the design stage of a workflow, explore sketches, the upkeep of the design record of the project, and a design review on demand.

## Card

- The design stage is for a person only. A driver never runs it.
- Only the person approves a design. A script takes the approval from the answer event of the person.
- Draw each screen that changes on the design surface. Check the screens, get the approval, and write the visual contract `02c-craft.md`.
- Do not decide a visual question for the person.
- Done when every changed screen is approved and `wf.mjs design approve` recorded the approval.

## Requires

Read every row that applies before you write the stage artifact. [_requires.md](_requires.md) defines the check. Step 0 gives the modes of the run. Pass each one to the check, because no disk fact sets a mode of this table:

```
node "<skill-dir>/scripts/wf.mjs" requires "<root>" <slug> design --mode <mode> [--mode <mode>]...
```

A run with no slug has no workflow to check: read the procedure rows of its modes yourself.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | |
| `02b-design.md` | artifact | if-present | |
| `decisions.yaml` | artifact | if-present | |
| `brainstorm-board-design.json` | artifact | mode:carried | |
| the origin brainstorm board named by origin-brainstorm | artifact | mode:carried | |
| `06-verify-*.md` | artifact | mode:audit | Accessibility Gate; Performance Gate |
| `06-verify-*.md` | artifact | mode:critique | |
| `design/_lane.md` | procedure | always | The human rule |
| `design/stage.md` | procedure | mode:stage | |
| `design/_surface.md` | procedure | mode:stage | The folder; A screen; Arranging the screens |
| `design/_design-context.md` | procedure | mode:stage | Design modes; Shared design laws |
| `design/_preflight.md` | procedure | mode:stage | |
| `design/_craft-floor.md` | procedure | mode:stage | |
| `design/contract.md` | procedure | mode:stage | |
| `design/_carried.md` | procedure | mode:carried | |
| `design/directions.md` | procedure | mode:directions | |
| `design/foundation.md` | procedure | mode:foundation | |
| `design/_surface.md` | procedure | mode:foundation | The foundation |
| `design/amend.md` | procedure | mode:amend | |
| `design/_surface.md` | procedure | mode:amend | Versions |
| `design/import.md` | procedure | mode:import | |
| `_host-surfaces.md` | procedure | mode:import | Design canvas |
| `design/move-pass.md` | procedure | mode:move-pass | |
| `design/_craft-floor.md` | procedure | mode:move-pass | |
| `design/_output.md` | procedure | mode:move-pass | |
| `design/explore.md` | procedure | mode:explore | |
| `design/record.md` | procedure | mode:upkeep | |
| `design/_craft-floor.md` | procedure | mode:upkeep | Record guard |
| `design/setup.md` | procedure | mode:record | |
| `design/extract.md` | procedure | mode:extract | |
| `design/_craft-floor.md` | procedure | mode:audit | |
| `design/audit.md` | procedure | mode:audit | |
| `design/_output.md` | procedure | mode:audit | |
| `design/_craft-floor.md` | procedure | mode:critique | |
| `design/critique.md` | procedure | mode:critique | |
| `design/_heuristics.md` | procedure | mode:critique | |
| `design/_output.md` | procedure | mode:critique | |
| `02c-craft.md` | writes | | |
| `07-design-audit.md` | writes | | |
| `07-design-critique.md` | writes | | |

The stage loads `design/_craft-floor.md` at its Step 4 and `design/contract.md` at its Step 6, not before. The modes `carried`, `directions` and `foundation` join a run when the stage reaches that branch. List every mode that ran in `modes:` of `02c-craft.md`.

# Step 0 — Parse the invocation

Resolve the first token by an exact existence check. Do not match a near name: a wrong guess sends the work down the wrong path. A token is a slug when `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <token> index` exits 0.

1. When `token0` is a slug, read `token1`:

   | `token1` | Job | Modes |
   |---|---|---|
   | absent | stage | `stage` |
   | `amend` | amend | `stage`, `amend` |
   | `import` | import; the rest is the links or the paths | `stage`, `import` |
   | a move | stage, focused on that move; on an approved design, the move pass | `stage`, or `move-pass` |
   | `audit` or `critique` | review | that word |
   | `extract` | upkeep; the report attaches to the slug | `upkeep`, `extract` |
   | `explore` | explore, linked to the slug | `explore` |
   | anything else | stage; `token1` and the rest are the instructions of the person | `stage` |

2. Otherwise, `token0` is the command:

   | `token0` | Job | Modes |
   |---|---|---|
   | `explore` | explore; when `token1` is a slug, the run links to it | `explore` |
   | `record`, `setup` or `teach` | upkeep: the record interview | `upkeep`, `record` |
   | `extract` | upkeep | `upkeep`, `extract` |
   | `direction` or `sync` | upkeep | `upkeep` |
   | `audit` or `critique` | review, freestanding against the target code | that word |
   | a move, and `token1` is a slug | the same as `<slug> <move>` in table 1 | `stage`, or `move-pass` |
   | a move, and `token1` is not a slug | new workflow | none |
   | anything else, or no token | stop, and render the usage below | |

The moves: `adapt`, `animate`, `bolder`, `clarify`, `colorize`, `harden`, `layout`, `onboard`, `polish`, `simplify`, `typeset`. The reference of each move is `design/<move>.md`. An older word reads as the move that replaced it: `quieter` and `distill` as `simplify`, `overdrive` as `bolder`, `delight` as `animate`. `optimize` is no longer a move: the stage loads `design/optimize.md` as a reference and focuses on no move, and on an approved design it routes to `/wf design <slug> audit`.

```
Usage:
  /wf design <slug> [instructions]          Run the design stage: draw the screens, check them, approve.
  /wf design <slug> amend [instructions]    Reopen an approved design.
  /wf design <slug> import <link|path>...   Turn outside design work into screens, then approve.
  /wf design explore [slug] [instructions]  Sketch ideas on the design surface. Settles nothing.

More:
  /wf design <slug> <move>                  Focus the stage on a move; on an approved design, run its checks.
  /wf design [slug] audit|critique|extract  Run a design review now; read the design system out of the code.
  /wf design record|direction|sync          Complete the design record; change the direction; sync DESIGN.md.
  /wf design <move> <instructions>          Start a new workflow that records the move.
```

# Step 1 — Run the job

| Job | Follow |
|---|---|
| stage, amend, a move | [design/stage.md](design/stage.md). Its Step 0 runs `wf.mjs design next`, which names the step: the stage, the amend ([design/amend.md](design/amend.md)) or the move pass ([design/move-pass.md](design/move-pass.md)). Load [design/_craft-floor.md](design/_craft-floor.md) at Step 4 of the stage, not at Steps 1–3b. The moves use the generic terms of [design/_platforms.md](design/_platforms.md). |
| explore | [design/explore.md](design/explore.md). The run writes only explore sketches and, when it links to a workflow, decisions. It writes no screen and no contract. |
| import | [design/import.md](design/import.md). It continues at Step 5 of the stage, where the person approves the imported screens. |
| new workflow | Run `/wf intake <instructions>` in default mode. Before intake writes `00-index.md`, preset `ux-impact: visual` (or higher when the instructions add a surface) and `design-move: <move>`. The person confirms `ux-impact` in the stack confirmation of intake. The design stage of that workflow focuses on the recorded move. |
| upkeep | The section of the command in [design/record.md](design/record.md). `record`, `setup` and `teach` run the interview of [design/setup.md](design/setup.md). `extract` follows [design/extract.md](design/extract.md). Upkeep writes the design record only, and `extract` with a slug also writes its report under `design-notes/` of that slug. Before a write to the record, load [design/_craft-floor.md](design/_craft-floor.md) → Record guard. |
| review | Load [design/_craft-floor.md](design/_craft-floor.md), then follow [design/audit.md](design/audit.md) or [design/critique.md](design/critique.md). With a slug, write the draft `<wf-dir>/.draft/07-design-audit.md` or `<wf-dir>/.draft/07-design-critique.md`, run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](_records.md), and register the augmentation per [design/_output.md](design/_output.md). `audit` uses the accessibility, performance and web-vitals results in `06-verify-*.md`, and measures them itself only when no verify ran. Without a slug, write no workflow artifact, and report in chat. |

# Step 2 — Final summary

Emit the summary last. The person reads it in chat and opens no record, so it holds every fact that the person needs. Lead with the narrative per [_chat-return.md](_chat-return.md): a short paragraph on what happened, with the counts, the decisions and the top risk.

```
wf design <job> complete: <slug-or-"freestanding">

<Narrative>

Design modes: <surface: persuade|operate|read|experience, ... | n/a>
Image gate: <pass | skipped:<reason> | n/a>
Screens: <keys> — approved in <commit> — computer <url> · phone <url> | n/a
Artifacts: <comma-separated paths, or "none">
Next: <Type `/wf <key> <args>`. | Done>
```

Write `Next` as "Type `/wf <key> <args>`." The person runs the key. Do not write that you run it.

| After | `Next` |
|---|---|
| the stage, an import | the step that `wf.mjs design approve` printed |
| a stop before the approval | "Type `/wf design <slug>`." |
| amend | the first plan to revisit ([design/amend.md](design/amend.md)) |
| the move pass | the `next-invocation` of `00-index.md` |
| explore | [design/explore.md](design/explore.md) → Chat return |
| upkeep | `Done`, or "Type `/wf design <slug>`." when a design stage waits for the record |
| a review with a slug | "Type `/wf review <slug>`." |
| a new workflow | the next step of intake |
