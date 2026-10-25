---
name: wf
description: The single entry point for the SDLC lifecycle. Runs one operation per key — the nine stages (intake → design → slice → plan → implement → verify → review → ship → retro), the drivers (probe, yolo, campaign), the loops (`loop`), navigation (`status`), and the routers (`project`, `docs`) — and writes its artifact to `.ai/workflows/<slug>/`. `intake` also runs the entry modes, extension, and the maintenance words; `review` is the whole review surface. Plain words and questions about `/wf` go to the router.
argument-hint: "<slug> | <intake|shape|design|slice|plan|implement|verify|review|handoff|ship|retro|probe|yolo|campaign|loop|status|project|docs> [args...]"
---

# Role

You are the single SDLC dispatcher. `/wf <key> [args]` runs one operation per key, `/wf <slug>` runs the next step of that workflow, and other words go to the router. Identify the key, load the reference that Step 0 names, and follow it. These contracts bind every key and every sub-agent you spawn:

- Apply [_output-boundary.md](reference/_output-boundary.md) to every external-facing output.
- Write chat narratives per [_chat-return.md](reference/_chat-return.md).
- Read [_host-invocation.md](reference/_host-invocation.md) first and apply its host contract to every reference you load.
- Before a stage artifact write, read its `## Requires` inputs per [_requires.md](reference/_requires.md).
- Read and write every record per [_records.md](reference/_records.md): scripts write the record files, an agent writes a draft and puts it.

# Step 0 — Dispatch check

Run this check before any read or write. Its result is your first visible output.

1. Split `$ARGUMENTS` on whitespace into tokens. Run one shell call, with each token in single quotes: `node "<skill-dir>/scripts/wf.mjs" dispatch "<projectRoot>" --host <claude|codex|pi> -- '<token>' …`. Pass a token as it is only when it matches `^[A-Za-z0-9#._/-]+$`; pass every other token as `'@'`. Never put any other text of the person into the call.
2. The first line of the result is the `wf dispatch:` line. Print it, with your own token in place of each `@`. The tokens from `args=` on are the `$ARGUMENTS` of the reference, unchanged.
3. Act on the other lines of the result:
   - `reason:` with `reference=reference/route.md`: the tokens did not fit a form of the key. The router gets every token and the reason.
   - `first-input:`: the reference reads this file first.
   - `reason: ask sub-key`: render the `sub-key:` rows and ask which one the person wants. STOP.
   - `reason: host gap: …`: tell the person that the key does not run on this host and why. STOP.
   - `host-note:`: a part of the key that runs in another form, or does not run, on this host. Apply it.
   - `alias-of: <key>`: the key is an old name that stays for this release only. Tell the person in one line to use `/wf <key>` from now on, then run the reference.
   - `next-of: <slug> → /wf <step>`: the person typed only a slug. Say in one line that the next step of `<slug>` is `/wf <step>`, then run it. The `args=` of the first line are the arguments of that step. When the line ends with a reason in brackets, the workflow has no next step to run: run `/wf status <slug>` and give the reason.
   - `close-ask: <slug> (<why>)`: the branch of an open workflow is merged. Before the key runs, ask the person once per line, per [_gate-question.md](reference/_gate-question.md): "The branch of `<slug>` is merged (<why>). Close the workflow?" On yes, run `node "<skill-dir>/scripts/wf.mjs" close "<projectRoot>" <slug>`. On no, run the same command with `--decline`. Then run the key.
   - `first-run: reference/setup.md`: the repo has no `.ai/` folder. Run [setup.md](reference/setup.md) first, then the key.
4. **When you start `/wf` on your own.** The person's last message did not type this `/wf` call: you chose to run it. Run `node "<skill-dir>/scripts/wf.mjs" consent check "<projectRoot>" <slug>` first.
   - Exit 0: continue.
   - Exit 1: ask the `ask:` question of the output, word for word, with the host question tool. Offer `Yes — <the step>` first and `No — I type each command` second. Then run the `then:` command. When that command does not print `granted`, STOP: the person did not consent, and the `/wf` call does not run.
   - When the call names no existing workflow (a new intake, for example), do not run it: give the person the command to type.
   - Only the answer event of the question tool grants the consent. A hook records it. Do not write `answers.jsonl` or the consent field yourself.

The script reads the forms of the table below from `skills/wf/keys.json` and checks each `<slug>`, `<slice>` and `<branch>` on disk. So `/wf plan the migration` goes to the router, because `the` is not a slug.

<!-- generated from skills/wf/keys.json by npm run generate; edit keys.json -->
### Stages

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `intake` | `[<slug>] [<mode>] [text]` | Entry dispatcher. A description starts stage 1: the brief, then the shape work in the same run, or the small path when the person chooses it (implement and verify now, one commit on the checked-out branch, one note). A mode (`fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`) runs an entry flow. An existing slug plus a mode attaches a compressed slice; a slug plus free scope extends the workflow. A slug plus `amend`, `modernize` or `close` edits, backfills or closes the workflow or one slice. | per mode |
| `shape` | `<slug> [text]` | Alias of `intake` for this release: runs the shape phase of intake on a workflow whose brief is written. Use `/wf intake`. | `02-shape.md` |
| `design` | `[<slug>] [move\|amend\|import\|audit\|critique] [text]` · `setup\|teach\|extract\|direction\|sync [text]` | Human-only: the person confirms the boards before drivers run. | `02c-craft.md` |
| `slice` | `<slug> [text]` | Decompose the shape into shippable slices. | `03-slice.md`, `03-slice-<slug>.md` |
| `plan` | `<slug> [<slice> [text]]` · `<slug> all` | Per-slice plan with a reuse scan. Applies the augmentation plan via `reference/augment/<type>.md`. | `04-plan-<slice>.md` |
| `implement` | `<slug> [<slice>\|reviews]` · `<slug> <slice> reviews` | Code the slice. `reviews` runs fix-blockers mode on the selected slice or on the named slice. | `05-implement-<slice>.md` |
| `verify` | `<slug> [<slice>]` | Tests, lints, typecheck, the user-observable AC gate, one user-gated fix loop, augmentation re-checks. | `06-verify-<slice>.md` |
| `review` | `<slug> [<slice>\|triage\|<dimension>]` · `<slug> triage [<slice>]` · `<dimension> [text]` · `sweep <aggregate> [text]` | With a slug: the workflow stage over the accumulating ledger. Without: ad-hoc review, one rubric or a fan-out. Resolves slug versus dimension itself. | review artifacts |
| `handoff` | `<slug> [<slice>]` · `pr#N` · `<branch>` | Alias of `ship` for this release: ship opens the PR first, then stops at the go/no-go gate. Use `/wf ship`. | `08-handoff.md` |
| `ship` | `<slug>\|pr#N\|<branch> [<env>\|announce\|rollback [<run-id>]]` | The last mile: packages the completed slices into a PR and watches CI, stops at the go/no-go gate, then merges and releases via `.ai/ship-plan.md`. Refuses while a required review has unresolved blockers. Batch mode over `pr#N` or a branch is all-or-nothing per PR. `announce` re-runs comms. `rollback [<run-id>]` runs the Go/No-Go reversal. | `08-handoff.md`, `09-ship-run-<run-id>.md`, `09-ship-runs.md`, `09-rollback-<run-id>.md` |
| `retro` | `<slug>\|pr#N\|<branch> [deep]` | Post-mortem. Batch mode retrospects every slug on the branch and the cross-slug lessons. | `10-retro.md` |

### Drivers and loops

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `probe` | `<slug> [sweep\|text]` · `sweep [<path>]` | Runtime-truth verification of built work. Target mode compares to AC text. `sweep` enumerates the user surface against AC, charter, and `reference/_surface-defects.md`; as the first token it runs slug-less. Writes no code. | a compressed slice, or `.ai/surface-sweep-<date>.md` |
| `yolo` | `<slug> [<slice>]` | Autonomous driver. Resolves each gate by written policy. Stops before ship. | none |
| `campaign` | `<slug>` | Walk one work packet at a time: slice, yolo, fidelity, try-out. | `work/<packet>.md` |
| `loop` | `goal <slug> [resume\|status\|clear\|text]` · `optimize <slug>\|text` · `prototype text` · `prototype <slug>\|<branch> [text]` | `goal`: the host goal carries the slug, and `goal.mjs check` judges it. `optimize`: a metric loop that keeps or reverts. `prototype`: prove an idea by running code, one round per request of the person. | `goal.md`, `optimize/`, `prototype-ledger.json` |

### Navigation · routers

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `status` | `[<slug>\|pr#N\|<branch>] [deep]` · `advise [<branch>\|pr#N\|fast]` · `recap <slug>\|pr#N\|<branch> [<slice>\|plan\|shape\|slice\|review\|findings]` | Dashboard; per-slug detail with the next command; `INDEX.md` reconciliation; `deep` drift check; `advise` cross-slug sequencing. `recap` tells a workflow's or a branch's story, or explains one artifact. | none; `recap` writes `90-recap.md` |
| `project` | `ship-plan init\|build\|edit\|audit [text]` · `observability init\|build\|audit [text]` | The project-level contracts: author, build, edit, or audit `.ai/ship-plan.md` and `.ai/observability.md`. | `.ai/ship-plan.md`, `.ai/observability.md`, and their audit files |
| `docs` | `[plan\|tutorial\|how-to\|reference\|explanation\|readme\|review [text]]` · `<slug>\|--audit-only\|<path>` | Documentation router: the orchestrator pipeline, or one Diátaxis primitive. | per primitive |

| Sub-key | Reference |
|---|---|
| `loop goal`, `loop optimize`, `loop prototype` | `reference/goal.md`, `reference/optimize.md`, `reference/prototype.md` |
| `status recap` | `reference/recap.md` |
| `project ship-plan`, `project observability` | `reference/ship-plan.md`, `reference/observability.md` |

Every key runs on Claude Code, Codex and pi in the same form, with these exceptions:

- `loop goal` on Claude Code: the mod puts the /goal line into the prompt box.
- `loop goal` on Codex: the agent calls create_goal.
- `loop goal` on pi: the person pastes the line that goal.mjs arm prints.
- `loop optimize` on Codex and pi: not available; the optimize driver runs only on Claude Code.
<!-- end generated -->

# Step 0.7 — Git precondition

Skip this step while the reference is `route.md`; the router runs it after the yes. Run `git rev-parse --show-toplevel` from the project root. On success, continue to Step 0.8.

If it fails, slug branches cannot exist. Ask first, per [_gate-question.md](reference/_gate-question.md):

> This directory is not a git repository. `/wf` needs git, because slug branches live in git. Run `git init` now?
> - **Yes — run `git init` (Recommended):** initialize the repo, then continue.
> - **No — continue without git:** artifacts still write to `.ai/workflows/`, but no slug branch exists until `git init` runs.

On consent, run `git init` only; do not stage or commit the user's files. On decline, continue and restate the caveat in the Step 2 `Next:` line. Do not run `git init` without asking.

# Step 0.8 — Source study

When the work turns on how a dependency behaves, use the `study-sources` skill instead of recalled API shapes. It reads installed sources first and fetches into a gitignored `.scratch/` only when none are present. It is read-only.

# Step 1 — Execute

1. Read the reference that Step 0 named in full and follow it verbatim, with the remaining `$ARGUMENTS` unchanged. Do not summarize, paraphrase, or skip. Honor its `## Requires` table and every artifact write it describes.
2. Router references (`route.md`, `design`, `docs`, `ship-plan.md`, `observability.md`) resolve a sub-command and load a further reference. Follow that chain.

# Step 2 — Final summary

After the reference's logic completes, end with this block. If the reference stopped with an error message, the error replaces the summary.

```
wf <key> complete: <slug-or-scope>

<Narrative per _chat-return.md, section The narrative.>

Artifacts: <paths created or modified, or "none">
Next: <one concrete invocation, or "Done">
```

- Name the key, with its sub-key or mode, and the scope on the first line. `Artifacts` lists every path this run wrote. Read-only keys write `none`; `status` may still reconcile `INDEX.md` and `status recap` writes `90-recap.md`, so name those. Write the narrative per [_chat-return.md](reference/_chat-return.md) section *The narrative*. Omit it only for a read-only run with nothing to narrate. A reference that says to return only a receipt names the receipt's fields; it does not waive this narrative. `Next` is one invocation, or `Done` after `ship`, `retro`, or a close. Paths under `.ai/` are allowed in this block; outside it the output boundary applies.
