---
description: Dashboard across all workflows, plus single-workflow detail and routing. Reads every .ai/workflows/*/00-index.md and renders a grouped status table; with a slug, shows the detail view and the exact next command to run. Reconciles the global registry .ai/workflows/INDEX.md when it drifts from disk (idempotent, reported). An optional `deep` mode runs a reality-drift check against code/git/deps and writes a sync report.
argument-hint: "[slug] [deep]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `$wf status`, the **dashboard, detail view, and router** for all SDLC workflows.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

`status` does NOT advance any workflow. It reads state, renders it, tells you the exact next command,
and keeps the global registry honest. Its **only** write is the low-risk, idempotent reconcile of
`.ai/workflows/INDEX.md` in Step -1 (and, in `deep` mode, a `00-sync.md` drift report). It never
touches a stage artifact or application code.

# CRITICAL — execution discipline
You are a **dashboard + router + registry keeper**, not a problem solver.
- Do NOT run stages, fix issues, or advance workflows.
- The **only** files you may write are `.ai/workflows/INDEX.md` (Step -1 reconcile) and, in `deep`
  mode, `.ai/workflows/<slug>/00-sync.md` + the `updated-at` bookkeeping touch. Nothing else.
- Follow the numbered steps below **exactly in order**.
- If you catch yourself about to modify a stage file or run a stage, STOP.

# Step -1 — Reconcile the global registry (`.ai/workflows/INDEX.md`) — always, first

`status` absorbs the former `$wf-meta sync` registry maintenance. This step runs **unconditionally on
every invocation, before Step 0**, even with a slug argument. It is the read-side guarantee that
positional slug detection (compressed-slice attach via `$wf intake`/`$wf probe`/`$wf simplify`) has a
fresh registry to consult. The repair is **idempotent and low-risk** — running it twice produces an
identical file — so `status` self-heals the registry rather than merely warning about drift.

**File: `.ai/workflows/INDEX.md`** — one header line (a `#` comment), then one tab-separated row per
workflow, sorted alphabetically by slug. Closed workflows are retained (positional slug detection
skips closed rows, but a slug match still triggers the "append a slice to a closed workflow?"
confirmation).

```
# .ai/workflows/INDEX.md — global workflow registry. Reconciled by $wf status (bootstrap+refresh) and additively touched by slug-mode compressed-slice writes from $wf intake/$wf probe/$wf simplify (updated-at only) and by $wf intake (append self if absent). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.
<slug>	<status>	<workflow-type>	<branch>	<updated-at>
```

Column semantics (all pulled from each workflow's `00-index.md` YAML frontmatter):

| Column | Source field | Notes |
|---|---|---|
| `slug` | `slug` (must equal the directory name) | The lookup key. |
| `status` | `status` | e.g. `defined`, `shaped`, `sliced`, `planned`, `implementing`, `verifying`, `reviewing`, `handed-off`, `shipped`, `closed`, `abandoned`. |
| `workflow-type` | `workflow-type` | `compressed`, `fix`, `rca`, `investigate`, `discover`, `hotfix`, `update-deps`, `refactor`, `docs`, `standard`. Use `standard` if missing on legacy indexes. |
| `branch` | `branch` | The git branch (informational; not used for routing). |
| `updated-at` | `updated-at` | ISO 8601 UTC. |

**Procedure:**
1. **Search / list files** to find `.ai/workflows/*/00-index.md` for every workflow directory.
2. For each, parse YAML frontmatter and extract the five columns.
3. If `.ai/workflows/INDEX.md` does **not** exist → **bootstrap**: write it fresh (header + one sorted
   row per discovered workflow). Note in the chat return: *"Bootstrapped `.ai/workflows/INDEX.md` with
   N workflows — positional slug detection is now enabled."*
4. If it **does** exist → **refresh**: rewrite with the current sorted set. Report a one-line diff:
   *"Reconciled INDEX.md: A added, R removed (stale dirs), U status/branch updates."* If nothing
   changed, say nothing about the registry (it was already in sync).
5. If a previous row references a slug whose `.ai/workflows/<slug>/00-index.md` is missing on disk →
   omit it from the rewritten file and flag *"Removed stale row: `<slug>` (directory missing)."*

This step is fast (one frontmatter read per dir; no git ops, no network). The dashboard/detail render
below runs *after* it, against the freshly reconciled set.

# Step 0 — Resolve mode
1. Parse `$ARGUMENTS`. If the **last** token is `deep`, set deep-mode and strip it.
2. If a slug remains → **detail mode** (single workflow). Read `00-index.md` directly.
3. If no slug remains → **dashboard mode** across all workflows.
4. If enumeration found **no** workflows (registry empty AND search empty) → tell the user: "No
   workflows found. Start one with `$wf intake <description>`." STOP.

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

**Staleness:** if `updated-at` is >7 days ago, append `(stale)` to the status (`date -u +%s` vs parsed `updated-at`).

**Render the dashboard.** The Runtime column shows `runtime-evidence-status`: `clean` → `—`;
`deferrals: <N>`; `probe-findings: <N>`; both separated by `+` when both apply.

```
## Active Workflows ({count})

| Slug | Title | Stage | Status | Slice | Runtime | Updated | Next |
|------|-------|-------|--------|-------|---------|---------|------|
| <slug> | <title> | <N>·<stage-name> | <status> | <slice or —> | <runtime> | <YYYY-MM-DD> | `<next-invocation>` |

## Blocked ({count})

| Slug | Title | Stage | Blocker | Open Qs | Runtime | Since |
|------|-------|-------|---------|---------|---------|-------|

## Completed ({count})

| Slug | Title | Outcome | Stages | Runtime | Completed |
|------|-------|---------|--------|---------|-----------|
```

The Runtime column appears in every table because the deferral mechanism is orthogonal to lifecycle
stage — a `Completed` workflow can still carry `deferrals: <N>`, a `Blocked` one `probe-findings: <N>`.

**After the tables, a quick-actions section — this is where the former `$wf-meta next` lives now:**

```
## Quick Actions
- Continue most recent: `<next-invocation of the most recently updated active workflow>`
- Drive it to done: `$wf auto <slug>`  (or `$wf yolo <slug>` for autonomous)
- See detail + exact next command for <slug>: `$wf status <slug>`
- Catch up on what a workflow did: `$wf recap <slug>`
```

If any workflow has `branch-strategy: dedicated`, add a branch summary:

```
## Branch Summary
| Slug | Branch | Base | PR |
|------|--------|------|----|
```

# Detail Mode (slug provided) — dashboard + routing in one

`$wf status <slug>` renders the single-workflow detail **and** tells the user the exact next command
(this absorbs the former `$wf-meta next`). It never advances the workflow.

1. **Read `00-index.md`** for the slug. If not found → "Workflow `<slug>` not found. Run `$wf status`
   to list all workflows." STOP.
2. Read the `workflow-files` list and check which files exist on disk.
3. Read each existing stage file's frontmatter (`status`, `created-at`, `updated-at`, key metrics).
4. Read the **current** stage file's `Status` and `## Recommended Next Stage` — these drive the `## Next` routing.
5. **Render the detail view:**

```
# Workflow: <title>
**Slug:** <slug> | **Status:** <status> | **Updated:** <updated-at>

## Stage Progress
| # | Stage | File | Status | Created | Updated |
|---|-------|------|--------|---------|---------|
| 1 | intake | 01-intake.md | ✓ complete | <date> | <date> |
| ... | | | | | |

## Slice Progress (if sliced)
| Slice | Plan | Implement | Verify | Review | Handoff | Ship |
|-------|------|-----------|--------|--------|---------|------|

## Key Metrics
- Files changed / lines ± (from implement records)
- Review findings (from review records)
- Acceptance criteria met / interactive checks passed (from verify records)

## Open Questions
- <question> (or "None")

## Branch Info
- Strategy: <branch-strategy> | Branch: <branch> (base <base-branch>) | PR: <pr-url or "not created">
- Current branch: <git branch --show-current> <warning if mismatched>

## Next
- **Default:** `<recommended-next-invocation>` — <one-line reason>
- **Options:** (every option from the current stage file's `## Recommended Next Stage` — present ALL, do not pick silently)
- If `Status: Awaiting input`: resolve the listed open questions first.
- If the workflow is complete/closed: say so, and offer `$wf recap <slug>` or `$wf intake <slug> <new scope>` (extend).
- If on the wrong branch: ⚠ You are on `<current>` — switch to `<branch>` before the next command.
```

6. For the **slice progress matrix**, search for `03-slice-*.md`, `04-plan-*.md`, `05-implement-*.md`,
   `06-verify-*.md`, `07-review-*.md` (the `07-review-<slice>.md` master per slice; exclude
   `07-review-<slice>-<command>.md` sub-reviews), `08-handoff.md`. Mark: `✓` complete · `→`
   in-progress/awaiting-input · `✗` failed · `·` pending.
7. For **branch info**, `git branch --show-current` vs the workflow's `branch` field; warn if mismatched.

# Deep Mode (`$wf status <slug> deep`) — reality-drift check

`deep` runs the reality reconciliation the former `$wf-meta sync <slug>` performed: it checks whether
referenced code, tests, PRs, branches, and dependencies actually exist or have drifted, and writes a
`00-sync.md` report. Run it when a workflow has been idle mid-flight (stages 4–7) and you suspect the
world moved underneath it. Plain `$wf status <slug>` (no `deep`) does **not** run this — it stays a
read-only detail view.

1. **Inventory references** from every stage file in `workflow-files`: code file paths, test paths,
   git refs (branch, base, PR, SHAs), dependency/package names, external tickets/APIs. Record source + type.
2. **Check code reality** — file existence (search / list files); freshness (`git log -1 --format="%ai" -- <file>`);
   flag files modified after the referencing stage as `⚠ drifted`. Test files: existence + pattern validity (search).
3. **Check git reality** — branch existence (`git branch --list` / `-r`), current-branch match,
   ahead/behind (`git rev-list --left-right --count <base>...<branch>`), PR status
   (`gh pr view <n> --json state,mergeable,reviewDecision,statusCheckRollup` if `gh` present), SHA existence.
4. **Check dependency reality** — package present in lockfile/manifest; version drift; config-file freshness.
5. **Assess health** — per-category totals (Code, Test, Git, Deps, External) with ✓/⚠/✗/? counts. Rate:
   `in-sync` (no ✗, ≤2 ⚠) · `minor-drift` (no ✗, 3+ ⚠) · `significant-drift` (any ✗) · `stale` (>7d old AND drift).
6. **Write `.ai/workflows/<slug>/00-sync.md`** (`type: sync-report`, `regenerable: true`, `health: <rating>`)
   with the summary table, per-category tables, drift details, and recommended actions. **Overwrite
   freely** each run (no history append). Also write the sibling **`00-sync.yaml`** (`artifact: sync`,
   with `branch`/`base_branch`/`ahead_count`/`behind_count`/`conflict_risk` REQUIRED, optional
   `diverged_files[]`/`recommendation`) — without it the rich sync page degrades to plain prose.
7. **Bookkeeping touch:** add `00-sync.md` to `workflow-files` and set `updated-at` in `00-index.md`
   (and the matching `updated-at` column in `INDEX.md`). Do NOT change `status`/`current-stage`.

Recommended-actions in the report point at real commands: `$wf plan <slug>` (stale plan refs),
`$wf intake <slug> <scope>` (new scope surfaced), `$wf status <slug> deep` (re-check after fixes).

# Chat return contract
- **Dashboard mode:** return the rendered tables + quick-actions. Prepend the one-line registry
  reconcile note from Step -1 only if it changed something. No other preamble — the dashboard IS the output.
- **Detail mode:** return the detail view. The `## Next` section carries the routing (former `next`);
  do not add a separate options footer.
- **Deep mode:** lead with a short **narrative** paragraph (the drift story — what moved and what it
  means), then Health (✓/⚠/✗), the compact category table, ≤5 top drift findings, and `options:`
  (`$wf plan <slug>`, `$wf intake <slug> <scope>`, `$wf status <slug> deep`).
