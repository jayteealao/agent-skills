---
name: wf
description: The single entry point for the SDLC lifecycle. Runs one operation per key — the ten stages (intake → shape → slice → plan → implement → verify → review → handoff → ship → retro), the drivers (design, probe, simplify, auto, yolo), the minimal lifecycle (task), navigation (status, recap), lifecycle control (close), and the routers (ship-plan, docs, observability) — and writes its artifact to `.ai/workflows/<slug>/`. `intake` also dispatches the compressed entry modes and extension; `review` is the whole review surface.
disable-model-invocation: true
argument-hint: "<intake|shape|slice|plan|implement|verify|review|handoff|ship|retro|design|probe|simplify|auto|yolo|task|status|recap|close|ship-plan|docs|observability> [args...]"
---

# Role

You are the single SDLC dispatcher. `/wf <key> [args]` runs one operation per key. Identify the key, load `reference/<key>.md`, and follow it. Three contracts bind every key and every sub-agent you spawn:

- Apply [_output-boundary.md](reference/_output-boundary.md) to every external-facing output.
- Write every text per [_ste-procedural.md](reference/_ste-procedural.md). Write story sections and chat narratives per [_story-arc.md](reference/_story-arc.md). A reference's own writing spec adds to this contract and never replaces it.
- Read [_host-invocation.md](reference/_host-invocation.md) first and apply its host contract to every reference you load. Under Codex or pi, `yolo` ends at Step 0 with the redirect to `/wf auto <slug>` that file prescribes; do not load `reference/yolo.md`.
- Any artifact may ship narrative fragments (`<stem>.<label>.html.fragment` siblings) per [_fragment-authoring.md](reference/_fragment-authoring.md) Step F2.

# Step 0 — Dispatch check

Run this check before any read or write. Its result is your first visible output.

1. Split `$ARGUMENTS` on whitespace. The first token is the key candidate. The remaining tokens are the key's `$ARGUMENTS`, unchanged.
2. If `$ARGUMENTS` is empty, render the key tables and ask which key the user wants. STOP.
3. If the key candidate is not one of the 22 keys, STOP. Tell the user: *"`<token>` is not a known wf key. Pick one of: intake, shape, slice, plan, implement, verify, review, handoff, ship, retro, design, probe, simplify, auto, yolo, task, status, recap, close, ship-plan, docs, observability."* Do not treat the token as a slug or as an intake mode. Do not pick a slug for the user. Do not load a reference.
4. If the key candidate is `yolo` under Codex or pi, answer with the host redirect. STOP.
5. State the dispatch on one line, then continue: `wf dispatch: key=<key> · args=<remaining tokens, or (none)> · reference=reference/<key>.md`

### Stages

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `intake` | `[slug] [mode] <description>` | Entry dispatcher. A description starts stage 1. A mode (`fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `adopt`) runs a compressed entry flow. An existing slug plus a mode attaches a compressed slice; a slug plus free scope extends the workflow. `amend` and `modernize` edit an existing workflow's recorded config. | per mode |
| `shape` | `[slug] [hint]` | Product-owner discovery. Authors the documentation plan and `augmentations-needed`. | `02-shape.md` |
| `slice` | `<slug>` | Decompose the shape into shippable slices. | `03-slice.md`, `03-slice-<slug>.md` |
| `plan` | `<slug> [slice]` | Per-slice plan with a reuse scan. Applies the augmentation plan via `reference/augment/<type>.md`. | `04-plan-<slice>.md` |
| `implement` | `<slug> [slice\|reviews]` | Code the slice. `reviews` runs fix-blockers mode. | `05-implement-<slice>.md` |
| `verify` | `<slug> [slice]` | Tests, lints, typecheck, the user-observable AC gate, one user-gated fix loop, augmentation re-checks. | `06-verify-<slice>.md` |
| `review` | `<slug> [slice\|triage]` · `<dimension>` · `sweep <aggregate>` | With a slug: the workflow stage over the accumulating ledger. Without: ad-hoc review, one rubric or a fan-out. Resolves slug versus dimension itself. | review artifacts |
| `handoff` | `<slug\|pr#N\|branch>` | Aggregate completed slices into a PR. `pr#N` or a branch runs batch mode across the branch onto the lead slug. Refuses while a required review has unresolved blockers. | `08-handoff.md` |
| `ship` | `<slug\|pr#N\|branch> [env\|announce\|rollback]` | Release via `.ai/ship-plan.md`. Batch mode is all-or-nothing per PR. `announce` re-runs comms. `rollback [<run-id>]` runs the Go/No-Go reversal. | `09-ship-run-<run-id>.md`, `09-ship-runs.md`, `09-rollback-<run-id>.md` |
| `retro` | `<slug\|pr#N\|branch>` | Post-mortem. Batch mode retrospects every slug on the branch and the cross-slug lessons. | `10-retro.md` |

### Standalone / drivers

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `design` | `[slug] <command> [instr]` | Compressed design workflow. The 20 design commands are arguments, never keys. | per command |
| `probe` | `<slug> [target\|sweep]` · `sweep [path]` | Runtime-truth verification of built work. Target mode compares to AC text. `sweep` enumerates the user surface against AC, charter, and `reference/_surface-defects.md`; as the first token it runs slug-less. Writes no code. | a compressed slice, or `.ai/surface-sweep-<date>.md` |
| `simplify` | `branch [<base>] \| commit <range> \| plan <slug> <slice> \| codebase [<path>]` | Three parallel sub-agents review one scope, classify findings, and route them. Writes no code. | none |
| `auto` | `<slug> [<slice>]` | Lifecycle driver. Pauses only at a stage's own gate. Stops before handoff. | none |
| `yolo` | `<slug> [<slice>]` | Autonomous driver. Resolves each gate by written policy. Stops before handoff. Claude Code only. | none |

### Minimal lifecycle

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `task` | `<description \| task-slug \| existing-slug + description>` | Work whose deliverable is not a code change. Briefs observable ACs and `blast-radius`; `shared-env`, `external-party`, and `irreversible` always stop for a human; an AC evidenced only by `asserted` cannot close. An existing slug attaches a compressed slice. | `01-task.md` |

### Navigation · lifecycle control · routers

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `status` | `[slug] [deep] \| advise` | Dashboard; per-slug detail with the next command; `INDEX.md` reconciliation; `deep` drift check; `advise` cross-slug sequencing. Read-only apart from `INDEX.md`. | none |
| `recap` | `<slug\|pr#N\|branch> [slice \| plan\|shape\|slice\|review\|findings]` | Plain-language catch-up, or an explanation of one artifact. Batch mode tells the branch story. Does not advance. | `90-recap.md` |
| `close` | `<slug> [<slice> \| reason]` | Archive a workflow, or close one slice. | `99-close.md` |
| `ship-plan` | `<init\|build\|edit\|audit> [args]` | Release-pipeline router: author, build, block-edit, or audit `.ai/ship-plan.md`. | `.ai/ship-plan.md`, `.ai/ship-plan-audit.md` |
| `docs` | `[<primitive> \| <slug> \| --audit-only \| <path>]` | Documentation router: the orchestrator pipeline, or one Diátaxis primitive. | per primitive |
| `observability` | `<init\|build\|audit> [args]` | Observability router: author, realize, or audit `.ai/observability.md`. | `.ai/observability.md`, `.ai/observability-audit.md` |

Every key runs under every host except `yolo`, which is Claude Code only. For `design`, `intake`, `probe`, `auto`, `yolo`, `task`, `status`, `recap`, `retro`, `close`, `review`, `ship-plan`, `docs`, and `observability`, the reference resolves the first remaining token itself, in its own Step 0.

# Step 0.5 — Unknown-slug suggestion

Step 0.5 applies to `shape`, `slice`, `plan`, `implement`, `verify`, and `close`. Every other key resolves its first token inside its reference; a non-matching token there is a PR, a branch, a dimension, a mode, or a sub-key, not a typo.

1. The slug candidate is `$1` of the key's `$ARGUMENTS`. If `$1` is empty, or `.ai/workflows/INDEX.md` does not exist, skip Step 0.5.
2. Run `grep -P "^<candidate>\t" .ai/workflows/INDEX.md`. On a hit, dispatch.
3. On a miss, match every row's slug, closed rows included: Levenshtein distance ≤ 2, then substring inclusion in either direction.
4. If no row matches, STOP: *"Unknown slug `<candidate>`. Run `/wf status` to list all workflows, or `/wf intake <description>` to start a new one."*
5. If a row matches, STOP: *"Unknown slug `<candidate>`. Did you mean `<best-match>`<closed-suffix>? (Run `/wf status` to list all workflows.) Retry: `/wf <key> <best-match> <remaining args>`"* — `<closed-suffix>` is ` (closed)` when that row is closed. Do not auto-correct.

# Step 0.7 — Git precondition

Skip this step when Step 0 ended at the menu or at an unknown key. Run `git rev-parse --show-toplevel` from the project root. On success, continue to Step 0.8.

If it fails, the hub cannot register the repo: every registration returns `skipped-not-git`, queued renders never drain, and slug branches cannot exist. Ask first, per [_gate-question.md](reference/_gate-question.md):

> This directory is not a git repository. `/wf` needs git — the hub registers repos by git identity, and slug branches live in git. Run `git init` now?
> - **Yes — run `git init` (Recommended):** initialize the repo, then continue.
> - **No — continue without git:** artifacts still write to `.ai/workflows/`, but the hub does not register or render this repo until `git init` runs and a `/wf` command re-registers it.

On consent, run `git init` only; do not stage or commit the user's files. On decline, continue and restate the caveat in the Step 2 `Next:` line. Do not run `git init` without asking.

# Step 0.8 — Source study

When the work turns on how a dependency actually behaves (a signature, an edge case, an error string, a version change), use the `study-sources` skill instead of recalled API shapes. It reads installed sources first and fetches into a gitignored `.scratch/` only when none are present. It is read-only. `intake rca`, `intake investigate`, `plan`, `implement`, `verify`, `review`, and `intake update-deps` name it; any other key may use it.

# Step 1 — Execute

1. Read `reference/<key>.md` in full and follow it verbatim. Do not summarize, paraphrase, or skip. Honor every conditional input and every artifact write it describes.
2. Router keys (`design`, `ship-plan`, `docs`, `observability`) resolve a sub-key and load a further reference. Follow that chain.
3. Pass the remaining `$ARGUMENTS` through unchanged.

# Step 2 — Final summary

After the reference's logic completes, end with this block. If the reference stopped with an error message, the error replaces the summary.

```
wf <key> complete: <slug-or-scope>

<Narrative: 2–5 sentences of prose, no bullets, no field labels — the state inherited, the decisions and counts with reasons, what comes next and the top risk.>

Artifacts: <paths created or modified, or "none">
Next: <one concrete invocation, or "Done">
```

- Name the key and the scope on the first line.
- `Artifacts` lists every path this run wrote. Read-only keys write `none`; `status` may still reconcile `INDEX.md` and `recap` writes `90-recap.md`, so name those.
- Write the narrative per [_story-arc.md](reference/_story-arc.md) rule A6. Omit it only for a read-only run with nothing to narrate. A reference that says to return only a receipt names the receipt's fields; it does not waive this narrative.
- `Next` is one invocation, or `Done` after `ship`, `retro`, or `close`.
- Paths under `.ai/` are allowed in this block. Outside it the output boundary applies.
