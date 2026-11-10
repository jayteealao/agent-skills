---
description: The dashboard, the detail view and the router of every workflow. With no argument it shows what waits on the person and a grouped table of every workflow. With a slug it shows the detail view and the exact next command. With `pr#N` or a branch it shows a read-only roster of the slugs on that branch, and which are handoff-ready and ship-ready. Every run brings the registry `.ai/workflows/INDEX.md` in line with the disk and reports what it changed. `deep` checks one workflow against the code, git and the dependencies, and writes a sync report. `advise` reads every open workflow, builds the graph of dependencies and collisions (it reads the code when the artifacts do not settle an edge), and ranks what to do next, in what order, and what to stop; it writes nothing.
argument-hint: "[slug|pr#N|branch] [deep] | advise [branch|pr#N|fast]"
---

You are running `/wf status`, the dashboard, detail view and router of every workflow. It reads the state of the workflows, renders it, and names the exact next command. It runs no stage, fixes nothing, and advances no workflow.

Pipeline: 1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·ship → 9·retro

## Requires

Status writes no stage artifact, so it runs no Requires check before a write. Read the rows of the mode that Step 0 resolves. [_requires.md](_requires.md) defines the table. The dashboard, detail and roster modes read frontmatter only.

| Input | Kind | When | Sections |
|---|---|---|---|
| `/.ai/workflows/INDEX.md` | artifact | always | |
| `00-index.md` | artifact | always | |
| `08-handoff.md` | artifact | mode:roster | |
| `.driver-journal.jsonl` | artifact | mode:detail | |
| `status/_dashboard.md` | procedure | mode:dashboard | |
| `status/_detail.md` | procedure | mode:detail | |
| `status/_deep.md` | procedure | mode:deep | |
| `02-shape.md` | artifact | mode:advise | |
| `04-plan-*.md` | artifact | mode:advise | |
| `status/_advise.md` | procedure | mode:advise | |
| `_liveness.md` | procedure | mode:detail | The staleness rule |

## What status writes

- `.ai/workflows/INDEX.md`, in Step -1.
- In deep mode only: the `00-sync.md` record, and its entry in `workflow-files` of the index.

Write nothing else. Keep the order of the steps where a step uses the output of an earlier step. Reads can run in any order.

# Step -1 — Reconcile the registry

Run this step on every call, first, also when the call names a slug. Running it twice gives the same file.

1. Run `node "<skill-dir>/scripts/wf.mjs" index "<projectRoot>"`. It rebuilds `.ai/workflows/INDEX.md`: one `#` header line, then one row for each workflow, `slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at`, from each `00-index.md`, sorted by slug. A closed workflow keeps its row. The script drops the row of a missing folder, keeps the row of a folder whose `00-index.md` does not parse, keeps a `prototype` row whose branch has a worktree that holds the workflow, and names each slug that is a `/wf` command word. Print its lines in the chat return, except `INDEX.md is in sync.`. Rename nothing.
2. When `.ai/sdlc-config.json` has no `artifactTracking` key and at least one workflow exists, add this line to the report: "artifact-tracking policy unset — ship decides at ship time whether `.ai/` is tracked or ignored; set `artifactTracking` in `.ai/sdlc-config.json` (`/wf project ship-plan init` Step 3.5 asks it) to give the clean-tree gate of ship a policy to read." A repo that has the key does not see the line.
3. When `.ai/design/` exists, run `node "<skill-dir>/scripts/wf.mjs" design track "<projectRoot>" --check`. When it exits 1, add this line to the report: "git ignores the design surface — `wf.mjs design track` keeps `.ai/design/` tracked; run it after the person approves."

Each line of items 2 and 3 is a note, not a gate and not a question. Print each one at most once per call. Every mode below renders the reconciled set.

# Lists first

A list is the `work/index.md` (`type: list`) of a brainstorm or ideate workflow. For each list with an unfinished work packet, lead with the output of `node "<skill-dir>/scripts/campaign.mjs" status "<projectRoot>" <source-slug>`: its work packets, the next step, and the design needs. Then write: "Type `/wf campaign <source-slug>`."

# Step 0 — Resolve the mode

1. When the last token is `deep`, set deep mode and remove the token.
2. When the first token is `advise`, remove it and run advise mode (below). The next token, when there is one, is the scope of the advice: a branch name, `pr#N`, `#N` or a bare integer limits the advice to the slugs on that branch, and `fast` reads frontmatter only, with no artifact or code reads. Advise ignores a trailing `deep`, because it does its own bounded code reads. Skip item 3.
3. Otherwise resolve the first token with `node "<skill-dir>/scripts/wf.mjs" target "<projectRoot>" <token> --json`. A slug wins over a branch.

   | Result | Mode |
   |---|---|
   | no token (do not run `target`) | dashboard mode, across every workflow |
   | `scope: slug` | detail mode; read the index with `node "<skill-dir>/scripts/wf.mjs" record get "<projectRoot>" <slug> index` |
   | `scope: branch` (`pr#N` or a branch name) | roster mode |
   | `error` | show it, and stop |

4. When no workflow exists, in the registry or on the disk, say: "No workflows found. Start one with `/wf intake <description>`." Then stop.

# Dashboard mode (no token)

1. Run `node "<skill-dir>/scripts/wf.mjs" inbox "<projectRoot>" --json`. It lists everything that waits on the person, across every workflow, oldest first. Each entry gives the `slug`, the `kind`, the question in `ask`, `since`, and in `answer` the exact command that the person types. An entry with `later: true` waits for a stage or a run, and its `why` says which. `laterGroups` gives one `line` for each workflow of those entries. Render the inbox from [status/_dashboard.md](status/_dashboard.md), before the tables. When `count` is 0, render the one line "Nothing waits on you." Give each `notes` line as it is.
2. Run `node "<skill-dir>/scripts/wf.mjs" status "<projectRoot>" --json`. Use its fields for each workflow as they are: `group` (`active`, `blocked`, `completed` or `invalid`), `stale` (more than 7 days since `updated-at`), `stage`, `selectedSlice`, `openQuestions` and `next`.
3. A workflow with a run also carries `progress`: its `state` (`running`, `waiting`, `stopped` or `done`; a dead driver shows as `stopped`), the stage, slice and step, `etaSeconds`, and `resume`. For each run that is not `done`, add one line under the table: `<slug>: <state> at <stage> <slice> step <n> of <m>`, with the ETA when it has one, and the `resume` command when it stopped.
4. For the other columns, read the index with `node "<skill-dir>/scripts/wf.mjs" record get "<projectRoot>" <slug> index`, and take these frontmatter fields:
   - `title`, `slug`, `status`, `current-stage`, `stage-number`, `updated-at`
   - `selected-slice`, `open-questions`
   - `next-command` and `next-invocation`. When they are absent, take `recommended-next-command` and `recommended-next-invocation`, the route of a readiness gate. This is the order that `wf.mjs status` and the dispatcher use; `record stage-done` clears the `recommended-` pair when it writes the next step.
   - `branch-strategy`, `branch`, `pr-url`, `pr-number`
   - `progress`, for example `slices-implemented: 2, slices-total: 5`
   - `runtime-evidence-deferrals`: a list of `{slice, reason, deferred-at, cleared-by}`, which may be absent
   - `compressed-slices`: a list of `{slug, slice-type, created-at}`. The entries with `slice-type: probe` are the probe findings.
5. Compute `runtime-evidence-status` for each workflow:

   | Condition | Value |
   |---|---|
   | `runtime-evidence-deferrals` is absent, or every entry has a `cleared-by`, and no probe slice has `findings-count > 0` | `clean` |
   | An entry of `runtime-evidence-deferrals` has `cleared-by: null` | `deferrals-open`, with the count of those entries |
   | A probe slice has `findings-count > 0`, and its findings did not go through plan or a fix | `probe-findings-open` |

   The runtime status is separate from the group: an Active or Blocked workflow can carry one too.
6. Classify each workflow by its `group`: `active` is Active, `blocked` is Blocked (`status: awaiting-input`, or open questions), and `completed` is Completed. An `active` workflow is Blocked too when a prerequisite stage awaits input, or when its design is not settled per `design/_lane.md`; its next step is then `/wf design <slug>`. List an `invalid` workflow under Blocked, with its reason. When `stale` is true, append `(stale)` to the status.
7. Render from [status/_dashboard.md](status/_dashboard.md): the Active, Blocked and Completed tables, the `## Quick Actions` section, a `## Branch Summary` table when any workflow has `branch-strategy: dedicated`, and the `## Cost` table.
8. For the cost table, run `node "<skill-dir>/scripts/wf.mjs" cost "<projectRoot>" <slug>` for each slug. Its `total` row holds the input, output, cache read and cache write of the slug, with the external in / out pair apart. Copy every integer as it is written. Do not estimate or price. Leave out a slug whose result is `No cost ledger.`, and leave out the table when no slug has a ledger.

# Detail mode (a slug)

The detail view of one workflow, with the exact next command. It does not advance the workflow.

1. Run `node "<skill-dir>/scripts/wf.mjs" status "<projectRoot>" <slug> --json`. It gives the summary of the workflow, each stage file with its `status` and `updatedAt`, each slice with the status of its plan, implement, verify and review files, the cost sums, and `next` (the current stage file, its `next-invocation` and its `recommended-routes`). Use these as they are. When the result has `error`, say: "Workflow `<slug>` not found. Run `/wf status` to list all workflows." Then stop.
2. Read the index with `node "<skill-dir>/scripts/wf.mjs" record get "<projectRoot>" <slug> index` for the fields that the result does not carry. Take the `workflow-files` list, and check which records exist with `node "<skill-dir>/scripts/wf.mjs" record list "<projectRoot>" <slug>`.
3. Read the frontmatter of each stage record that exists with `record get`: `status`, `created-at`, `updated-at` and the key metrics. Do not read the stage bodies, except for the fallback of item 4. When `02c-craft.md` names `screens:`, show the screen count and the `approval-commit` in `## Key Metrics`.
4. The frontmatter of the current stage file drives `## Next`: its `status`, `next-invocation` and `recommended-routes` (every option, with its reason). Do not take `recommended-next-*` from a stage file. An artifact written before `recommended-routes` existed lists its options in a `## Recommended Next Stage` body section; read that section instead.
5. For the slice matrix, take these records from `record list`: `03-slice-*.md`, `04-plan-*.md`, `05-implement-*.md`, `06-verify-*.md`, `07-review-*.md` (the `07-review-<slice>.md` record of each slice; leave out the sub-reviews `07-review-<slice>-<command>.md`), and `08-handoff.md`. Mark each cell `✓` complete, `→` in progress or awaiting input, `✗` failed, or `·` pending.
6. Show the steps of a slice in progress, as the detail render says.
7. For the branch info, compare `git branch --show-current` with the `branch` field of the workflow. Warn when they differ.
8. Driver liveness: when `<wf-dir>/.driver-journal.jsonl` exists, read its tail and apply the staleness rule of [_liveness.md](_liveness.md). Render the `## Driver` row from its three states. Do not report a driver as running because the journal exists: the journal outlives the driver. With no journal, leave the section out; a missing journal does not prove that no driver ran.
9. The clearing-event tripwire: for each open entry of `runtime-evidence-deferrals` (`cleared-by: null`) that carries a `clearing-probe`, run that one command with a short timeout. Render each hit as the ⚠ line of the detail render, which routes to `/wf probe <slug>`. Run only the recorded command, never one you make up. Do not clear the deferral and do not edit `00-index.md`: this is a tripwire, not a gate, and the probe stage owns the evidence. Skip an entry that the person authorized, and an entry with no recorded probe.
10. Cost: run `node "<skill-dir>/scripts/wf.mjs" cost "<projectRoot>" <slug>`. Its rows are the sums for each `key`: turns, sub-agents, input, output, cache read, cache write, external in / out. Copy every integer as it is written. Do not estimate or price. When the result is `No cost ledger.`, leave the section out.
11. Goal and loop: add one `## Driver` line from `goal.mjs status` when `goal.md` exists, one from `optimize.mjs status` for an optimize slug, and one from `prototype.mjs status` for a prototype slug.
12. Render the view from [status/_detail.md](status/_detail.md): the title line, `## Stage Progress` (one row for each stage file from `01-intake.md` on), `## Slice Progress`, `## Key Metrics`, `## Open Questions`, `## Branch Info`, `## Driver`, `## Open Deferrals`, `## Cost`, and `## Next`. `## Next` gives the default invocation and every option of `recommended-routes` of the current stage file. Present all of them, and do not pick one silently. It also covers the awaiting-input, complete or closed, and wrong-branch cases.

# Roster mode (`pr#N` or a branch)

The read-only view of a branch: which slugs on it are handoff-ready or ship-ready. It is the counterpart of batch `/wf ship`, and it starts nothing. It writes nothing beyond Step -1.

1. The roster is the `slugs` of the `target` output: every slug whose `branch` column in the reconciled `.ai/workflows/INDEX.md` is the resolved branch.
2. For each slug of the roster, read the index and, when it exists, `08-handoff.md`, each with `node "<skill-dir>/scripts/wf.mjs" record get "<projectRoot>" <roster-slug> <name>`. Take from them: `current-stage`, the review verdict and the open blockers of the slug, `readiness-verdict` (from its handoff, when there is one), `runtime-evidence-status` (computed as in dashboard mode), and `handoff-lead:`.
3. Read `08-handoff.md` of the lead slug with `node "<skill-dir>/scripts/wf.mjs" record get "<projectRoot>" <lead> 08-handoff.md` for the `pr-readiness-verdict` of the branch. When it is absent, the branch is not yet handed off as a batch.
4. Render the roster, and stop:

   ```
   ## Branch <branch> — PR #<N> (<pr-url>)
   Lead slug: <lead>   ·   PR-readiness: <ready | awaiting-input | blocked | not-handed-off>

   | Slug | Stage | Review | Blockers | Handoff-ready | Ship-ready | Runtime | Next |
   |---|---|---|---|---|---|---|---|
   | <slug> | review | ship | 0 | ✓ | ✓ | — | /wf ship pr#<N> |
   | <slug> | implement | — | 2 | ✗ (reviews) | ✗ | deferrals: 1 | /wf review <slug> |

   Handoff-ready = the slug passes its own handoff prerequisites.
   Ship-ready = pr-readiness-verdict is `ready` AND the slug's runtime-evidence is clean.
   ```

   The bottom line names the one batch action that is open now: `/wf ship pr#N` when a slug can be packaged but is not, or the whole branch is ship-ready; otherwise the command of the slug that blocks progress.

# Deep mode (`/wf status <slug> deep`)

Deep mode checks whether the code, tests, PRs, branches and dependencies that the records name still exist or have drifted, and writes the `00-sync.md` record. Plain `/wf status <slug>` does not run it. Load [status/_deep.md](status/_deep.md) and follow its steps.

# Advise mode (`/wf status advise [branch|pr#N|fast]`)

Advise answers what the dashboard cannot: across every open workflow, what to do next, in what order, and what to stop. It recommends commands, `/wf intake <slug> close` among them. It runs none of them, and it advances no workflow. It writes no artifact of its own, because advice is about now and a re-run is cheap. Its only write is the Step -1 reconcile.

Load [status/_advise.md](status/_advise.md), run its steps A1–A5 in order, and render its Portfolio Advice block. Every row has a one-line reason and a concrete next command.

# Chat return

| Mode | Return |
|---|---|
| dashboard | The inbox, then the tables and the quick actions. Put the one-line note of Step -1 first only when it changed something. Add nothing before it: the dashboard is the output. |
| detail | The detail view. `## Next` carries the routing; add no separate options footer. |
| roster | The roster render of roster mode. |
| deep | A short narrative paragraph first (what moved, and what it means), then the health (✓/⚠/✗), the compact category table, the top drift findings, and `options:` (`/wf plan <slug>`, `/wf intake <slug> <scope>`, `/wf status <slug> deep`). |
| advise | The Portfolio Advice render: the "if you do one thing" line first, then the ranked plan, the blocked set, the decisions, the carried risk and the sequencing notes. `Artifacts: none`. Add nothing before it. |
