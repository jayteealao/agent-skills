---
description: Dashboard across all workflows, plus single-workflow detail and routing. Reads every .ai/workflows/*/00-index.md and renders a grouped status table; with a slug, shows the detail view and the exact next command to run; with a `pr#N`/branch, shows a read-only roster of every slug on that branch and which are handoff-ready / ship-ready. Reconciles the global registry .ai/workflows/INDEX.md when it drifts from disk (idempotent, reported). An optional `deep` mode runs a reality-drift check against code/git/deps and writes a sync report. An `advise` mode reasons ACROSS all open workflows — builds the dependency/collision graph (seeking code truth when the artifacts don't settle an edge), then renders a ranked "do this next, in this order, stop doing that" plan; read-only, writes nothing.
argument-hint: "[slug|pr#N|branch] [deep] | advise [branch|pr#N|fast]"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf status`, the **dashboard, detail view, and router** for all SDLC workflows.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

`status` does NOT advance any workflow. It reads state, renders it, tells you the exact next command, and keeps the global registry honest. Its **only** write is the low-risk, idempotent reconcile of `.ai/workflows/INDEX.md` in Step -1 (and, in `deep` mode, a `00-sync.md` drift report). It never touches a stage artifact or application code.

# Role
You are a **dashboard + router + registry keeper**, not a problem solver.
- Do not run stages, fix issues, or advance workflows.
- The **only** files you may write are `.ai/workflows/INDEX.md` (Step -1 reconcile) and, in `deep` mode, `.ai/workflows/<slug>/00-sync.md` + the `updated-at` bookkeeping touch. Nothing else.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.
- If you catch yourself about to modify a stage file or run a stage, STOP.

# Step -1 — Reconcile the global registry (`.ai/workflows/INDEX.md`) — always, first

This step runs **unconditionally on every invocation, before Step 0**, even with a slug argument. It is the read-side guarantee that positional slug detection (compressed-slice attach via `/wf intake`/`/wf probe`/`/wf simplify`) has a fresh registry to consult. The repair is **idempotent and low-risk** — running it twice produces an identical file — so `status` self-heals the registry rather than merely warning about drift.

**One-time advisory — artifact-tracking policy unset.** While reconciling, if `.ai/sdlc-config.json` has no `artifactTracking` key AND at least one workflow exists, append one advisory line to the status report (never a gate, never a prompt): "artifact-tracking policy unset — `.ai/` tracked-vs-ignored is currently decided ad hoc at ship time; record it via `/wf ship-plan edit` (or init Step 3.5) to give ship's clean-tree gate a policy to read." Print it at most once per invocation; a repo that has recorded the key never sees it again.

**File: `.ai/workflows/INDEX.md`** — one header line (a `#` comment), then one tab-separated row per workflow, sorted alphabetically by slug. Closed workflows are retained (positional slug detection skips closed rows, but a slug match still triggers the "append a slice to a closed workflow?" confirmation).

```
# .ai/workflows/INDEX.md — global workflow registry. Reconciled by /wf status (bootstrap+refresh) and additively touched by slug-mode compressed-slice writes from /wf intake/probe/simplify (updated-at only) and by /wf intake (append self if absent). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.
<slug>	<status>	<workflow-type>	<branch>	<updated-at>
```

Column semantics (all pulled from each workflow's `00-index.md` YAML frontmatter):

| Column | Source field | Notes |
|---|---|---|
| `slug` | `slug` (must equal the directory name) | The lookup key. |
| `status` | `status` | e.g. `defined`, `shaped`, `sliced`, `planned`, `implementing`, `verifying`, `reviewing`, `handed-off`, `shipped`, `closed`, `abandoned`. |
| `workflow-type` | `workflow-type` | The schema enum: `standard`, `feature`, `fix`, `quick`, `rca`, `investigate`, `discover`, `rf`, `refactor`, `hotfix`, `dep-update`, `update-deps`, `docs`, `adopt`, `task`, `audit` — plus `ideate` (workflow-index workflows) and legacy `compressed`. Use `standard` if missing on legacy indexes. |
| `branch` | `branch` | The git branch (informational; not used for routing). |
| `updated-at` | `updated-at` | ISO 8601 UTC. |

**Procedure:**
1. **Enumerate** `.ai/workflows/*/00-index.md` to discover every workflow directory.
2. For each, parse YAML frontmatter and extract the five columns.
3. If `.ai/workflows/INDEX.md` does **not** exist → **bootstrap**: write it fresh (header + one sorted row per discovered workflow). Note in the chat return: *"Bootstrapped `.ai/workflows/INDEX.md` with N workflows — positional slug detection is now enabled."*
4. If it **does** exist → **refresh**: rewrite with the current sorted set. Report a one-line diff: *"Reconciled INDEX.md: A added, R removed (stale dirs), U status/branch updates."* If nothing changed, say nothing about the registry (it was already in sync).
5. If a previous row references a slug whose `.ai/workflows/<slug>/00-index.md` is missing on disk → omit it from the rewritten file and flag *"Removed stale row: `<slug>` (directory missing)."*

This step is fast (one frontmatter read per dir; no git ops, no network). The dashboard/detail render below runs *after* it, against the freshly reconciled set.

# Step 0 — Resolve mode
1. Parse `$ARGUMENTS`. If the **last** token is `deep`, set deep-mode and strip it.
1b. If the **first** token is `advise`, set **advise-mode** and strip it. The remaining first token (optional) is the advise **scope**: a branch name or `pr#N`/`#N`/bare integer narrows advice to the slugs on that branch; the literal `fast` drops to Tier-0 (frontmatter only — no artifact or code reads). Advise-mode skips the polymorphic resolution in step 2 and, after the always-on Step -1 reconcile, runs the **Advise Mode** section below. Advise does its own bounded code-truth seeking, so it ignores a trailing `deep`.
2. Resolve the remaining first token (polymorphic, first match wins):
   - **Exact slug** (`.ai/workflows/<token>/00-index.md` exists) → **detail mode** (single workflow). Read `00-index.md` directly.
   - **PR reference** `pr#N` / `#N` / bare integer → resolve the branch via `gh pr view <N> --json headRefName -q .headRefName`, then **roster mode** below.
   - **Branch name** (matches a `branch:` column in `.ai/workflows/INDEX.md`) → **roster mode** below.
   - **No token** → **dashboard mode** across all workflows.
3. If enumeration found **no** workflows (registry empty AND disk listing empty) → tell the user: "No workflows found. Start one with `/wf intake <description>`." STOP.

# Roster Mode (`pr#N` / branch) — read-only branch view

This is the read-only counterpart to batch `/wf handoff` / `/wf ship`: it answers "which slugs on this branch are handoff-ready or ship-ready" **without triggering anything**. It writes nothing beyond the Step -1 registry reconcile.

1. From `.ai/workflows/INDEX.md` (just reconciled), collect every slug whose `branch` column equals the resolved branch — the roster. If none → "No
   workflows are on branch `<branch>`." STOP.
2. For each roster slug, read `00-index.md` and (if present) `08-handoff.md`. Derive, per slug: `current-stage`, per-slug review verdict / open blockers, `readiness-verdict` (from its handoff, if any), `runtime-evidence-status` (same computation as dashboard mode), and `handoff-lead:`.
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

   The bottom line names the single batch action available now: `/wf handoff pr#N` if any slug is packageable-but-not-packaged, `/wf ship pr#N` if the whole branch is ship-ready, or the specific per-slug command blocking progress.

# Dashboard Mode (no slug)

For each slug in the reconciled registry, read `.ai/workflows/<slug>/00-index.md`. Parse frontmatter for:
- `title`, `slug`, `status`, `current-stage`, `stage-number`, `updated-at`
- `selected-slice-or-focus`, `open-questions`
- `recommended-next-command`, `recommended-next-invocation`
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

**Classify each workflow:**
1. **Active** — `status` is `in-progress`, `planning`, `implementing`, or any non-terminal, non-blocked status.
2. **Blocked** — `status` is `awaiting-input`, OR `open-questions` non-empty, OR a prerequisite stage awaiting-input.
3. **Completed** — `status` is `complete`, `shipped`, `closed`, or `abandoned`.

**Staleness:** if `updated-at` is >7 days ago, append `(stale)` to the status (epoch seconds per [_timestamp.md](_timestamp.md) vs parsed `updated-at`).

**Render the dashboard** from the dashboard render in [status/_renders.md](status/_renders.md): the Active / Blocked / Completed tables (the Runtime column appears in every table because the deferral mechanism is orthogonal to lifecycle stage), then the `## Quick Actions` section (continue most recent, `/wf auto <slug>`, `/wf status <slug>`, `/wf recap <slug>`), then a `## Branch Summary` table when any workflow has `branch-strategy: dedicated`, then the `## Cost` table.

**Cost (exact tokens).** For each slug, read `.ai/workflows/<slug>/cost.jsonl` when it exists. Sum the rows: `main` and every `subagents[]` entry into input / output / cache read / cache write; `external[]` entries into a separate in / out pair. Copy every integer as written; never estimate or price. Omit a slug that has no ledger. Omit the table when no slug has one.

# Detail Mode (slug provided) — dashboard + routing in one

`/wf status <slug>` renders the single-workflow detail **and** tells the user the exact next command. It never advances the workflow.

1. **Read `00-index.md`** for the slug. If not found → "Workflow `<slug>` not found. Run `/wf status`
   to list all workflows." STOP.
2. Read the `workflow-files` list and check which files exist on disk.
3. Read each existing stage file's frontmatter (`status`, `created-at`, `updated-at`, key metrics).
4. Read the **current** stage file's `Status` and `## Recommended Next Stage` — these drive the `## Next` routing.
5. **Render the detail view** from the detail render in [status/_renders.md](status/_renders.md): title line, `## Stage Progress` (one row per stage file from `01-intake.md` on), `## Slice Progress`, `## Key Metrics`, `## Open Questions`, `## Branch Info`, `## Driver`, `## Open Deferrals`, `## Cost`, and `## Next` (default invocation, every option from the current stage file's `## Recommended Next Stage` — present ALL, do not pick silently; the awaiting-input, complete/closed, and wrong-branch variants).
6. For the **slice progress matrix**, list `03-slice-*.md`, `04-plan-*.md`, `05-implement-*.md`, `06-verify-*.md`, `07-review-*.md` (the `07-review-<slice>.md` master per slice; exclude `07-review-<slice>-<command>.md` sub-reviews), `08-handoff.md`. Mark: `✓` complete · `→` in-progress/awaiting-input · `✗` failed · `·` pending.
7. For **branch info**, `git branch --show-current` vs the workflow's `branch` field; warn if mismatched.
8. **Driver liveness** — read the tail of `.ai/workflows/<slug>/.driver-journal.jsonl` if it exists (append-only JSONL heartbeats written by every autonomous-driver subagent) and apply the staleness rule single-sourced in [_control-file-ownership.md](_control-file-ownership.md), rendering the `## Driver` row from its three states. **Never report a driver as running because the journal exists**; a session once told a user a dead driver was "currently re-verifying older slices" on exactly that reasoning. No journal → omit the section entirely (silence is honest; a fabricated "no driver running" is not, since a driver from before this feature leaves no trail).
9. **Clearing-event tripwire** — for each open `runtime-evidence-deferrals` entry (`cleared-by: null`) that carries a `clearing-probe`, **execute that one command** with a short timeout. Render every hit as the ⚠ line in the detail render, routing to `/wf probe <slug>`. Rules: one recorded command per deferral, never an improvised one; **never clear the deferral or edit `00-index.md`** — this is a tripwire, not a gate, and the probe stage still owns evidence. Skip PO-authorized entries (settled) and entries with no recorded probe (nothing to run — not a finding). Cost is milliseconds per open deferral, and it catches the case this exists for: an AC shipped uncleared while its clearing event ("device available for the AC6 run") had been satisfied on-screen in the same session.
10. **Cost** — read `.ai/workflows/<slug>/cost.jsonl` when it exists and aggregate per `key`: turns (rows with a `turn`), sub-agents, input, output, cache read, cache write, external in / out. Render `## Cost` from the detail render. Copy every integer as written; never estimate or price. No ledger → omit the section.

# Deep Mode (`/wf status <slug> deep`) — reality-drift check

`deep` runs a reality reconciliation: it checks whether referenced code, tests, PRs, branches, and dependencies actually exist or have drifted, and writes a `00-sync.md` report (`type: sync-report`, `regenerable: true`, `health: <rating>`) plus the sibling `00-sync.yaml` (`artifact: sync`). Run it when a workflow has been idle mid-flight (stages 4–7) and you suspect the world moved underneath it. Plain `/wf status <slug>` (no `deep`) does **not** run this — it stays a read-only detail view.

Load [status/_deep.md](status/_deep.md) and run its seven steps: inventory references, check code reality, check git reality, check dependency reality, check steering reality (a contradiction between a stage artifact and a steering entry is a `⚠ steering-violation`; the file's presence is never a finding), check intent-risk reality (an `intent-risks` entry still `status: open` after shape is complete is a `⚠ intent-risk-open`), assess health (`in-sync` / `minor-drift` / `significant-drift` / `stale`), write `00-sync.md` + `00-sync.yaml` (overwrite freely), then the bookkeeping touch (`workflow-files`, `updated-at`; never `status`/`current-stage`).

# Advise Mode (`/wf status advise [branch|pr#N | fast]`) — cross-slug sequencing

Advise answers the question the dashboard **cannot**: given every open workflow, *what should I do next, in what order, and what should I stop doing.* It is the portfolio-level counterpart to `/wf status <slug>`'s `## Next` — that routes one slug; advise routes the whole set. It is **read-only and route-don't-act**: it recommends commands (including `/wf close`), never runs them, and never advances a workflow. Its **only** write is the Step -1 registry reconcile shared by every mode — advise writes no artifact of its own; advice is about *now*, and re-running is cheap.

Load [status/_advise.md](status/_advise.md) and run its steps in order: A1 gather the portfolio (Tier 0, always; drop terminal slugs unless they carry open carried-risk; narrow to the branch roster when scoped), A2 build the constraint graph from each `02-shape.md` and current `04-plan-*.md` (Tier 1, skipped under `fast`; a cycle is itself a finding), A3 seek code truth for an uncertain edge (Tier 2, on demand, bounded to the one question; broad drift routes to `/wf status <slug> deep`), A4 rank the ready set, serialize footprint-colliding slugs, and run the WIP pass (stale slugs nothing depends on become CLOSE-OR-COMMIT decisions), A5 honor `steer.md` as the priority overlay (never above a HARD dependency). Render the Portfolio Advice block from that file: the "if you do one thing" line, the ranked plan, the blocked set, the decisions, the carried risk, and the sequencing notes — every row with a one-line rationale and a concrete next command.

# Chat return contract
- **Dashboard mode:** return the rendered tables + quick-actions. Prepend the one-line registry reconcile note from Step -1 only if it changed something. No other preamble — the dashboard IS the output.
- **Detail mode:** return the detail view. The `## Next` section carries the routing (former `next`); do not add a separate options footer.
- **Deep mode:** lead with a short **narrative** paragraph (the drift story — what moved and what it means), then Health (✓/⚠/✗), the compact category table, ≤5 top drift findings, and `options:` (`/wf plan <slug>`, `/wf intake <slug> <scope>`, `/wf status <slug> deep`).
- **Advise mode:** return the Portfolio Advice render — lead with the "if you do one thing" line, then the ranked plan, blocked set, decisions, carried risk, and sequencing notes. `Artifacts: none` (advise writes nothing beyond the Step -1 reconcile). No preamble — the render IS the output.
