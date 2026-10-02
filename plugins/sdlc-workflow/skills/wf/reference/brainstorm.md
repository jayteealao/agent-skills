---
description: Think an idea through with the person, as a loop of question batches on a board that stays open until the person says `done`. `design` concentrates the brainstorm on how the idea looks and behaves, with rough sketches, and carries the design thoughts to the design stage. A slug resumes a brainstorm board, or brainstorms the design of a feature workflow.
argument-hint: "[slug] [design] [idea]"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `/wf brainstorm`. It runs the brainstorm loop in [intake/brainstorm.md](intake/brainstorm.md), the same loop that `/wf intake brainstorm` runs. This file only resolves the invocation.

## Requires

Read every row before you run the loop. [_requires.md](_requires.md) defines the check. The `writes` rows are in the `intake/brainstorm.md` table.

| Input | Kind | When | Sections |
|---|---|---|---|
| `intake/brainstorm.md` | procedure | always | |
| `intake/brainstorm/_design.md` | procedure | mode:design | |

# Step 0 — Parse the invocation

Resolve the first token by an exact existence check. Never fuzzy-match: a wrong guess opens the wrong board.

1. **When `.ai/workflows/<token0>/00-index.md` exists**, `token0` is the slug. Read its `workflow-type` and `status`.
   - `status: closed` → STOP: *"Workflow `<slug>` is closed. To reopen it, set `status: in-progress` in its `00-index.md`, then run `/wf brainstorm <slug>` again."*
   - `workflow-type: brainstorm` → **resume** that board. When `token1` is `design`, set the board's `focus: design`. When `token1` is `add`, the rest is a **quick capture** (`intake/brainstorm/_work.md`).
   - any other type, and `token1` is `design` → **design on a workflow**. The remaining tokens are an optional idea.
   - any other type, and `token1` is anything else → **slug-mode**: the remaining tokens are the topic of a compressed brainstorm slice.
2. **Else**, when `token0` is `design` → **new board**, `focus: design`. The remaining tokens are the idea. With no idea, STOP and render the usage below.
3. **Else** → **new board**, general focus. All the tokens are the idea. With no token, STOP and render the usage below.

```
Usage:
  /wf brainstorm <idea>                     Think an idea through on a new board.
  /wf brainstorm design <idea>              Think through how an idea looks and behaves, with sketches.
  /wf brainstorm <brainstorm-slug> [design] Resume a board; design switches its focus.
  /wf brainstorm <brainstorm-slug> add <text>
                                            Add one piece of work, for example a bug, as a packet.
  /wf brainstorm <feature-slug> design [idea]
                                            Brainstorm the design of a workflow that exists.
  /wf brainstorm <feature-slug> <topic>     Brainstorm a topic inside a workflow, as a compressed slice.
```

Record the resolved shape, slug, focus, and idea before you continue.

# Step 1 — Run the loop

Follow [intake/brainstorm.md](intake/brainstorm.md) with the resolved shape, as if `/wf intake brainstorm` had resolved it:

- **new board** and **resume** → the standalone flow.
- **slug-mode** → the slug-mode section.
- **design on a workflow** → the standalone flow, with the files and the `done` route in `intake/brainstorm/_design.md` → On a feature workflow.

When the focus is `design`, `intake/brainstorm/_design.md` adds to the loop and replaces nothing.
