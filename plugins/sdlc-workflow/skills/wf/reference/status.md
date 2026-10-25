---
description: Dashboard across all workflows, plus single-workflow detail and routing. Reads every .ai/workflows/*/00-index.md and renders a grouped status table; with a slug, shows the detail view and the exact next command to run; with a `pr#N`/branch, shows a read-only roster of every slug on that branch and which are handoff-ready / ship-ready. Reconciles the global registry .ai/workflows/INDEX.md when it drifts from disk (idempotent, reported). An optional `deep` mode runs a reality-drift check against code/git/deps and writes a sync report. An `advise` mode reasons ACROSS all open workflows — builds the dependency/collision graph (seeking code truth when the artifacts don't settle an edge), then renders a ranked "do this next, in this order, stop doing that" plan; read-only, writes nothing.
argument-hint: "[slug|pr#N|branch] [deep] | advise [branch|pr#N|fast]"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steer.** Only when the decision store holds a live `steer` entry (`decide list --kind steer`, per [_decisions.md](_decisions.md)): apply it. Honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf status`, the **dashboard, detail view, and router** for all SDLC workflows.

# Pipeline
1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·ship → 9·retro

`status` does NOT advance any workflow. It reads state, renders it, tells you the exact next command, and keeps the global registry honest (its writes are listed under Role).

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check. Dashboard, detail and roster modes read frontmatter only. Status writes no stage artifact.

| Input | Kind | When | Sections |
|---|---|---|---|
| `/.ai/workflows/INDEX.md` | artifact | always | |
| `00-index.md` | artifact | always | |
| `08-handoff.md` | artifact | mode:roster | |
| `.driver-journal.jsonl` | artifact | mode:detail | |
| `cost.jsonl` | artifact | if-present | |
| `status/_renders.md` | procedure | always | |
| `status/_deep.md` | procedure | mode:deep | |
| `02-shape.md` | artifact | mode:advise | |
| `04-plan-*.md` | artifact | mode:advise | |
| `status/_advise.md` | procedure | mode:advise | |
| `_liveness.md` | procedure | mode:detail | The staleness rule |

# Role
You are a **dashboard + router + registry keeper**, not a problem solver.
- Do not run stages, fix issues, or advance workflows.
- The **only** files you may write are `.ai/workflows/INDEX.md` (Step -1 reconcile) and, in `deep` mode, `.ai/workflows/<slug>/00-sync.md` + the `updated-at` bookkeeping touch. Nothing else.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step -1 — Reconcile the global registry (`.ai/workflows/INDEX.md`) — always, first

This step runs **unconditionally on every invocation, before Step 0**, even with a slug argument. The repair is idempotent: running it twice produces an identical file.

**One-time advisory — artifact-tracking policy unset.** While reconciling, if `.ai/sdlc-config.json` has no `artifactTracking` key AND at least one workflow exists, append one advisory line to the status report (never a gate, never a prompt): "artifact-tracking policy unset — `.ai/` tracked-vs-ignored is currently decided ad hoc at ship time; record it via `/wf project ship-plan edit` (or init Step 3.5) to give ship's clean-tree gate a policy to read." Print it at most once per invocation; a repo that has recorded the key never sees it again.

**One-time advisory — design record ignored.** While reconciling, when at least one workflow has a `design/` folder, run `node "<skill-dir>/scripts/design-boards.mjs" track "<projectRoot>"` (read-only without `--write`). When the result has `change: true`, append one advisory line (never a gate, never a prompt): "git ignores the design record — `design-boards.mjs track` shows the `.gitignore` lines that keep `.ai/design/` and `.ai/workflows/*/design/r*/` tracked; add `--write` after the person approves." Print it at most once per invocation.

**File: `.ai/workflows/INDEX.md`**: one `#` header line, then one row per workflow, `slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at`, from each `00-index.md`, sorted by slug. Closed workflows keep their rows.

Run `node "<skill-dir>/scripts/wf.mjs" index "<projectRoot>"`. It rebuilds the file. It drops the row of a missing folder, keeps the row of a folder whose `00-index.md` does not parse, keeps a `prototype` row whose branch has a worktree that holds the workflow, and names each slug that is a `/wf` command word. Print its lines in the chat return, except `INDEX.md is in sync.`. Rename nothing.

The render below runs after this step, against the reconciled set.

# Lists first

For each list with an unfinished work packet, lead with `node "<skill-dir>/scripts/campaign.mjs" status "<projectRoot>" <source-slug>`: its work packets, next step and design needs. Next: "Type `/wf campaign <source-slug>`."

# Step 0 — Resolve mode
1. Parse `$ARGUMENTS`. If the **last** token is `deep`, set deep-mode and strip it.
1b. If the **first** token is `advise`, set **advise-mode** and strip it. The remaining first token (optional) is the advise **scope**: a branch name or `pr#N`/`#N`/bare integer narrows advice to the slugs on that branch; the literal `fast` drops to Tier-0 (frontmatter only — no artifact or code reads). Advise-mode skips the polymorphic resolution in step 2 and, after the always-on Step -1 reconcile, runs the **Advise Mode** section below. Advise does its own bounded code-truth seeking, so it ignores a trailing `deep`.
2. Resolve the remaining first token (polymorphic, first match wins):
   - **Exact slug** (`.ai/workflows/<token>/00-index.md` exists) → **detail mode** (single workflow). Read `00-index.md` directly.
   - **PR reference** `pr#N` → resolve the branch via `gh pr view <N> --json headRefName -q .headRefName`, then **roster mode** below.
   - **Branch name** (matches a `branch:` column in `.ai/workflows/INDEX.md`) → **roster mode** below.
   - **No token** → **dashboard mode** across all workflows.
3. If enumeration found **no** workflows (registry empty AND disk listing empty) → tell the user: "No workflows found. Start one with `/wf intake <description>`." STOP.

# Roster Mode (`pr#N` / branch) — read-only branch view

This is the read-only counterpart to batch `/wf ship`: it answers "which slugs on this branch are handoff-ready or ship-ready" **without triggering anything**. It writes nothing beyond the Step -1 registry reconcile.

1. From `.ai/workflows/INDEX.md` (just reconciled), collect every slug whose `branch` column equals the resolved branch — the roster. If none → "No
   workflows are on branch `<branch>`." STOP.
2. For each roster slug, use the frontmatter of `00-index.md` and (if present) `08-handoff.md`. Derive, per slug: `current-stage`, per-slug review verdict / open blockers, `readiness-verdict` (from its handoff, if any), `runtime-evidence-status` (same computation as dashboard mode), and `handoff-lead:`.
3. Read the lead slug's `08-handoff.md` for the branch-level `pr-readiness-verdict` (absent → not yet handed off as a batch).
4. **Render the roster** and STOP:

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

   The bottom line names the single batch action available now: `/wf ship pr#N` if any slug is packageable-but-not-packaged or the whole branch is ship-ready, or the specific per-slug command blocking progress.

# Dashboard Mode (no slug)

Run `node "<skill-dir>/scripts/wf.mjs" status "<projectRoot>" --json`. Each workflow in it carries its `group` (`active`, `blocked`, `completed`, or `invalid`), `stale` (more than 7 days since `updated-at`), `stage`, `selectedSlice`, `openQuestions` and `next`. Use them as they are. A workflow with a run also carries `progress`: its `state` (`running`, `waiting`, `stopped` or `done`; a dead driver shows as `stopped`), the stage, slice and step, `etaSeconds`, and `resume`. For each run that is not `done`, add one line under the table: `<slug>: <state> at <stage> <slice> step <n> of <m>`, the ETA when it has one, and the `resume` command when it stopped. For the other columns, read `.ai/workflows/<slug>/00-index.md`. Parse frontmatter for:
- `title`, `slug`, `status`, `current-stage`, `stage-number`, `updated-at`
- `selected-slice`, `open-questions`
- `recommended-next-command`, `recommended-next-invocation` (fall back to `next-command`, `next-invocation`)
- `branch-strategy`, `branch`, `pr-url`, `pr-number`
- `progress` (e.g., `slices-implemented: 2, slices-total: 5`)
- `runtime-evidence-deferrals` (list of `{slice, reason, deferred-at, cleared-by}`; may be absent)
- `compressed-slices` (list of `{slug, slice-type, created-at}`; filter `slice-type: probe` to count outstanding probe findings)

**Compute `runtime-evidence-status` per workflow:**

| Condition | Value |
|---|---|
| `runtime-evidence-deferrals` absent OR every entry has `cleared-by` non-null AND no probe slice with `findings-count > 0` | `clean` |
| Any `runtime-evidence-deferrals` entry has `cleared-by: null` | `deferrals-open` (count = null entries) |
| Any probe compressed-slice with `findings-count > 0` AND findings not yet routed through plan/fix | `probe-findings-open` |

A slug can be `Active`/`Blocked` *and* carry a runtime-evidence status — the two are orthogonal.

**Classify each workflow** by its `group`: `active` is Active, `blocked` is Blocked (`status: awaiting-input` or open questions), and `completed` is Completed. An `active` workflow is Blocked too when a prerequisite stage is awaiting input, or when design is unsettled per `design/_lane.md` (next: `/wf design <slug>`). List an `invalid` workflow under Blocked, with its reason.

**Staleness:** when `stale` is true, append `(stale)` to the status.

**Render the dashboard** from the dashboard render in [status/_renders.md](status/_renders.md): the Active / Blocked / Completed tables (the Runtime column appears in every table because the deferral mechanism is orthogonal to lifecycle stage), then the `## Quick Actions` section (continue most recent, `/wf yolo <slug>`, `/wf status <slug>`, `/wf status recap <slug>`), then a `## Branch Summary` table when any workflow has `branch-strategy: dedicated`, then the `## Cost` table.

**Cost (exact tokens).** For each slug, run `node "<skill-dir>/scripts/wf.mjs" cost "<projectRoot>" <slug>`. Its `total` row is the slug's input / output / cache read / cache write, with the external in / out pair apart. Copy every integer as written; never estimate or price. Omit a slug whose result is `No cost ledger.`. Omit the table when no slug has one.

# Detail Mode (slug provided) — dashboard + routing in one

`/wf status <slug>` renders the single-workflow detail **and** tells the user the exact next command. It never advances the workflow.

1. **Run `node "<skill-dir>/scripts/wf.mjs" status "<projectRoot>" <slug> --json`.** It gives the workflow summary, each stage file with its `status` and `updatedAt`, each slice with the status of its plan, implement, verify and review files, the cost sums, and `next` (the current stage file, its `next-invocation` and its `recommended-routes`). Use these as they are. If the result has `error` → "Workflow `<slug>` not found. Run `/wf status`
   to list all workflows." STOP. Then read `00-index.md` for the fields the result does not carry.
2. Read the `workflow-files` list and check which files exist on disk.
3. Read each existing stage file's frontmatter (`status`, `created-at`, `updated-at`, key metrics). Never read the stage bodies, except for the fallback below. When `02c-craft.md` names `boards:`, show `design-revision` and the board count of that `boards.json` in `## Key Metrics`.
4. The **current** stage file's frontmatter drives the `## Next` routing: `status`, `next-invocation` and `recommended-routes` (every option, with its reason). Never take `recommended-next-*` from a stage file. Fallback: an artifact written before `recommended-routes` existed lists its options in a `## Recommended Next Stage` body section. Read that section instead.
5. **Render the detail view** from the detail render in [status/_renders.md](status/_renders.md): title line, `## Stage Progress` (one row per stage file from `01-intake.md` on), `## Slice Progress`, `## Key Metrics`, `## Open Questions`, `## Branch Info`, `## Driver`, `## Open Deferrals`, `## Cost`, and `## Next` (default invocation, every option from the current stage file's `recommended-routes` — present ALL, do not pick silently; the awaiting-input, complete/closed, and wrong-branch variants).
6. For the **slice progress matrix**, list `03-slice-*.md`, `04-plan-*.md`, `05-implement-*.md`, `06-verify-*.md`, `07-review-*.md` (the `07-review-<slice>.md` master per slice; exclude `07-review-<slice>-<command>.md` sub-reviews), `08-handoff.md`. Mark: `✓` complete · `→` in-progress/awaiting-input · `✗` failed · `·` pending.
6b. Show the steps of a slice in progress (detail render).
7. For **branch info**, `git branch --show-current` vs the workflow's `branch` field; warn if mismatched.
8. **Driver liveness** — read the tail of `.ai/workflows/<slug>/.driver-journal.jsonl` if it exists (append-only JSONL heartbeats written by every autonomous-driver subagent) and apply the staleness rule single-sourced in [_liveness.md](_liveness.md), rendering the `## Driver` row from its three states. **Never report a driver as running because the journal exists**: the journal outlives the driver. No journal → omit the section; a missing journal does not prove that no driver ran.
9. **Clearing-event tripwire** — for each open `runtime-evidence-deferrals` entry (`cleared-by: null`) that carries a `clearing-probe`, **execute that one command** with a short timeout. Render every hit as the ⚠ line in the detail render, routing to `/wf probe <slug>`. Rules: one recorded command per deferral, never an improvised one; **never clear the deferral or edit `00-index.md`** — this is a tripwire, not a gate, and the probe stage still owns evidence. Skip PO-authorized entries and entries with no recorded probe.
10. **Cost** — run `node "<skill-dir>/scripts/wf.mjs" cost "<projectRoot>" <slug>`. Its rows are the sums per `key`: turns, sub-agents, input, output, cache read, cache write, external in / out. Render `## Cost` from the detail render. Copy every integer as written; never estimate or price. `No cost ledger.` → omit the section.
11. **Goal and loop** — add one `## Driver` line from `goal.mjs status` when `goal.md` exists, one from `optimize.mjs status` for an optimize slug, and one from `prototype.mjs status` for a prototype slug.

# Deep Mode (`/wf status <slug> deep`) — reality-drift check

`deep` checks whether referenced code, tests, PRs, branches, and dependencies still exist or have drifted, and writes `00-sync.md`. Plain `/wf status <slug>` does **not** run it.

Load [status/_deep.md](status/_deep.md) and run its seven steps: inventory references, check code reality, check git reality, check dependency reality, check steering reality (a contradiction between a stage artifact and a steering entry is a `⚠ steering-violation`; the file's presence is never a finding), check intent-risk reality (an `intent-risks` entry still `status: open` after shape is complete is a `⚠ intent-risk-open`), assess health (`in-sync` / `minor-drift` / `significant-drift` / `stale`), write `00-sync.md` (overwrite freely), then the bookkeeping touch (`workflow-files`, `updated-at`; never `status`/`current-stage`).

# Advise Mode (`/wf status advise [branch|pr#N | fast]`) — cross-slug sequencing

Advise answers the question the dashboard **cannot**: given every open workflow, *what should I do next, in what order, and what should I stop doing.* It is **read-only and route-don't-act**: it recommends commands (including `/wf intake <slug> close`), never runs them, and never advances a workflow. Its **only** write is the Step -1 registry reconcile shared by every mode — advise writes no artifact of its own; advice is about *now*, and re-running is cheap.

Load [status/_advise.md](status/_advise.md), run its steps A1–A5 in order, and render its Portfolio Advice block. Every row has a one-line rationale and a concrete next command.

# Chat return contract
- **Dashboard mode:** return the rendered tables + quick-actions. Prepend the one-line registry reconcile note from Step -1 only if it changed something. No other preamble — the dashboard IS the output.
- **Detail mode:** return the detail view. The `## Next` section carries the routing; do not add a separate options footer.
- **Deep mode:** lead with a short **narrative** paragraph (the drift story — what moved and what it means), then Health (✓/⚠/✗), the compact category table, the top drift findings, and `options:` (`/wf plan <slug>`, `/wf intake <slug> <scope>`, `/wf status <slug> deep`).
- **Advise mode:** return the Portfolio Advice render — lead with the "if you do one thing" line, then the ranked plan, blocked set, decisions, carried risk, and sequencing notes. `Artifacts: none` (advise writes nothing beyond the Step -1 reconcile). No preamble — the render IS the output.
