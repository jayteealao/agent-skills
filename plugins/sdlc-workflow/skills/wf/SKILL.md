---
name: wf
description: The single entry point for the SDLC lifecycle. Runs one operation per key — the ten stages (intake → shape → slice → plan → implement → verify → review → handoff → ship → retro) plus design, the drivers (probe, auto, yolo, campaign), the loops (`loop`), navigation (`status`), and the routers (`project`, `docs`) — and writes its artifact to `.ai/workflows/<slug>/`. `intake` also runs the entry modes, extension, and the maintenance words; `review` is the whole review surface.
disable-model-invocation: true
argument-hint: "<intake|shape|slice|plan|implement|verify|review|handoff|ship|retro|design|probe|auto|yolo|campaign|loop|status|project|docs> [args...]"
---

# Role

You are the single SDLC dispatcher. `/wf <key> [args]` runs one operation per key. Identify the key, load the reference that Step 0 names, and follow it. Three contracts bind every key and every sub-agent you spawn:

- Apply [_output-boundary.md](reference/_output-boundary.md) to every external-facing output.
- Write every text per [_ste-procedural.md](reference/_ste-procedural.md). Write chat narratives per [_chat-return.md](reference/_chat-return.md). A reference's own writing spec adds to this contract and never replaces it.
- Read [_host-invocation.md](reference/_host-invocation.md) first and apply its host contract to every reference you load.
- Before a stage artifact write, read its `## Requires` inputs per [_requires.md](reference/_requires.md).

# Step 0 — Dispatch check

Run this check before any read or write. Its result is your first visible output.

1. Split `$ARGUMENTS` on whitespace. The first token is the key candidate. The remaining tokens are the key's `$ARGUMENTS`, unchanged. The reference is `reference/<key>.md`, except in items 5 and 6.
2. If `$ARGUMENTS` is empty, render the key tables and ask which key the user wants. STOP.
3. If the key candidate is not one of the 19 keys, STOP. Tell the user: *"`<token>` is not a known wf key. Pick one of: intake, shape, slice, plan, implement, verify, review, handoff, ship, retro, design, probe, auto, yolo, campaign, loop, status, project, docs."* Do not treat the token as a slug or as an intake mode. Do not pick a slug for the user. Do not load a reference.
4. If the key candidate is `yolo` under Codex or pi, answer with the host redirect. STOP.
5. **Sub-keys.** When the next token is a sub-key of the key (the sub-key table), the reference is that sub-key's file, and the key's `$ARGUMENTS` are the tokens after the sub-key. Load no other file of the key. When `loop` or `project` has no sub-key token, render its sub-key rows and ask which one the user wants. STOP.
6. **Intake fast path.** When the key is `intake`, the next token is a mode word below, and `.ai/workflows/<that token>/` does not exist, the reference is `reference/intake/<mode>.md` in place of `reference/intake.md`, and `reference/intake/_intake-context.md` is its first input. The mode's `$ARGUMENTS` are the tokens after the mode word. The mode words are the modes of the `intake` row.
7. State the dispatch on one line: `wf dispatch: key=<key> · args=<remaining tokens, or (none)> · reference=<the reference>`

### Stages

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `intake` | `[slug] [mode] <description>` | Entry dispatcher. A description starts stage 1. A mode (`fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`) runs an entry flow. An existing slug plus a mode attaches a compressed slice; a slug plus free scope extends the workflow. A slug plus `amend`, `modernize` or `close` edits, backfills or closes the workflow or one slice. | per mode |
| `shape` | `[slug] [hint]` | Product-owner discovery. Authors the documentation plan and `augmentations-needed`. | `02-shape.md` |
| `design` | `[slug] [move\|amend\|import\|audit\|critique]` · `setup\|teach\|extract\|direction\|sync` | Human-only: the person confirms the boards before drivers run. | `02c-craft.md` |
| `slice` | `<slug>` | Decompose the shape into shippable slices. | `03-slice.md`, `03-slice-<slug>.md` |
| `plan` | `<slug> [slice]` | Per-slice plan with a reuse scan. Applies the augmentation plan via `reference/augment/<type>.md`. | `04-plan-<slice>.md` |
| `implement` | `<slug> [slice\|reviews]` | Code the slice. `reviews` runs fix-blockers mode. | `05-implement-<slice>.md` |
| `verify` | `<slug> [slice]` | Tests, lints, typecheck, the user-observable AC gate, one user-gated fix loop, augmentation re-checks. | `06-verify-<slice>.md` |
| `review` | `<slug> [slice\|triage]` · `<dimension>` · `sweep <aggregate>` | With a slug: the workflow stage over the accumulating ledger. Without: ad-hoc review, one rubric or a fan-out. Resolves slug versus dimension itself. | review artifacts |
| `handoff` | `<slug\|pr#N\|branch>` | Aggregate completed slices into a PR. `pr#N` or a branch runs batch mode across the branch onto the lead slug. Refuses while a required review has unresolved blockers. | `08-handoff.md` |
| `ship` | `<slug\|pr#N\|branch> [env\|announce\|rollback]` | Release via `.ai/ship-plan.md`. Batch mode is all-or-nothing per PR. `announce` re-runs comms. `rollback [<run-id>]` runs the Go/No-Go reversal. | `09-ship-run-<run-id>.md`, `09-ship-runs.md`, `09-rollback-<run-id>.md` |
| `retro` | `<slug\|pr#N\|branch>` | Post-mortem. Batch mode retrospects every slug on the branch and the cross-slug lessons. | `10-retro.md` |

### Drivers and loops

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `probe` | `<slug> [target\|sweep]` · `sweep [path]` | Runtime-truth verification of built work. Target mode compares to AC text. `sweep` enumerates the user surface against AC, charter, and `reference/_surface-defects.md`; as the first token it runs slug-less. Writes no code. | a compressed slice, or `.ai/surface-sweep-<date>.md` |
| `auto` | `<slug> [<slice>]` | Lifecycle driver. Pauses only at a stage's own gate. Stops before handoff. | none |
| `yolo` | `<slug> [<slice>]` | Autonomous driver. Resolves each gate by written policy. Stops before handoff. Claude Code only. | none |
| `campaign` | `<slug>` | Drive a workflow's work packets in dependency waves, one PR per wave. | `work/campaign/` |
| `loop` | `goal <slug> [objective\|resume\|status\|clear]` · `optimize <slug\|description>` · `prototype <idea>` · `prototype <slug> [request]` | `goal`: the host goal carries the slug, and `goal.mjs check` judges it. `optimize`: a metric loop that keeps or reverts. `prototype`: prove an idea by running code, one round per request of the person. | `goal.md`, `optimize/`, `prototype-ledger.json` |

### Navigation · routers

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `status` | `[slug] [deep] \| advise` · `recap <slug\|pr#N\|branch> [slice\|focus]` | Dashboard; per-slug detail with the next command; `INDEX.md` reconciliation; `deep` drift check; `advise` cross-slug sequencing. `recap` tells a workflow's or a branch's story, or explains one artifact. | none; `recap` writes `90-recap.md` |
| `project` | `ship-plan <init\|build\|edit\|audit>` · `observability <init\|build\|audit>` | The project-level contracts: author, build, edit, or audit `.ai/ship-plan.md` and `.ai/observability.md`. | `.ai/ship-plan.md`, `.ai/observability.md`, and their audit files |
| `docs` | `[<primitive> \| <slug> \| --audit-only \| <path>]` | Documentation router: the orchestrator pipeline, or one Diátaxis primitive. | per primitive |

| Sub-key | Reference |
|---|---|
| `loop goal`, `loop optimize`, `loop prototype` | `reference/goal.md`, `reference/optimize.md`, `reference/prototype.md` |
| `status recap` | `reference/recap.md` |
| `project ship-plan`, `project observability` | `reference/ship-plan.md`, `reference/observability.md` |

Every key runs under every host except `yolo`, which is Claude Code only.

# Step 0.5 — Unknown-slug suggestion

Step 0.5 applies to `shape`, `slice`, `plan`, `implement`, and `verify`. Every other key resolves its first token inside its reference.

1. The slug candidate is `$1` of the key's `$ARGUMENTS`. If `$1` is empty, or `.ai/workflows/INDEX.md` does not exist, skip Step 0.5.
2. Run `grep -P "^<candidate>\t" .ai/workflows/INDEX.md`. On a hit, dispatch.
3. On a miss, match every row's slug, closed rows included: Levenshtein distance ≤ 2, then substring inclusion in either direction.
4. If no row matches, STOP: *"Unknown slug `<candidate>`. Run `/wf status` to list all workflows, or `/wf intake <description>` to start a new one."*
5. If a row matches, STOP: *"Unknown slug `<candidate>`. Did you mean `<best-match>`<closed-suffix>? (Run `/wf status` to list all workflows.) Retry: `/wf <key> <best-match> <remaining args>`"* — `<closed-suffix>` is ` (closed)` when that row is closed. Do not auto-correct.

# Step 0.7 — Git precondition

Skip this step when Step 0 ended at the menu or at an unknown key. Run `git rev-parse --show-toplevel` from the project root. On success, continue to Step 0.8.

If it fails, the hub cannot register the repo, and slug branches cannot exist. Ask first, per [_gate-question.md](reference/_gate-question.md):

> This directory is not a git repository. `/wf` needs git — the hub registers repos by git identity, and slug branches live in git. Run `git init` now?
> - **Yes — run `git init` (Recommended):** initialize the repo, then continue.
> - **No — continue without git:** artifacts still write to `.ai/workflows/`, but the hub does not register or render this repo until `git init` runs and a `/wf` command re-registers it.

On consent, run `git init` only; do not stage or commit the user's files. On decline, continue and restate the caveat in the Step 2 `Next:` line. Do not run `git init` without asking.

# Step 0.8 — Source study

When the work turns on how a dependency behaves, use the `study-sources` skill instead of recalled API shapes. It reads installed sources first and fetches into a gitignored `.scratch/` only when none are present. It is read-only.

# Step 1 — Execute

1. Read the reference that Step 0 named in full and follow it verbatim, with the remaining `$ARGUMENTS` unchanged. Do not summarize, paraphrase, or skip. Honor its `## Requires` table and every artifact write it describes.
2. Router references (`design`, `docs`, `ship-plan.md`, `observability.md`) resolve a sub-command and load a further reference. Follow that chain.

# Step 2 — Final summary

After the reference's logic completes, end with this block. If the reference stopped with an error message, the error replaces the summary.

```
wf <key> complete: <slug-or-scope>

<Narrative: 2–5 sentences of prose, no bullets, no field labels — the state inherited, the decisions and counts with reasons, what comes next and the top risk.>

Artifacts: <paths created or modified, or "none">
Next: <one concrete invocation, or "Done">
```

- Name the key, with its sub-key or mode, and the scope on the first line. `Artifacts` lists every path this run wrote. Read-only keys write `none`; `status` may still reconcile `INDEX.md` and `status recap` writes `90-recap.md`, so name those. Write the narrative per [_chat-return.md](reference/_chat-return.md) section *The narrative*. Omit it only for a read-only run with nothing to narrate. A reference that says to return only a receipt names the receipt's fields; it does not waive this narrative. `Next` is one invocation, or `Done` after `ship`, `retro`, or a close. Paths under `.ai/` are allowed in this block; outside it the output boundary applies.
