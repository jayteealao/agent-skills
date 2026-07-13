---
description: Dashboard across all workflows, plus single-workflow detail and routing. Reads every .ai/workflows/*/00-index.md and renders a grouped status table; with a slug, shows the detail view and the exact next command to run; with a `pr#N`/branch, shows a read-only roster of every slug on that branch and which are handoff-ready / ship-ready. Reconciles the global registry .ai/workflows/INDEX.md when it drifts from disk (idempotent, reported). An optional `deep` mode runs a reality-drift check against code/git/deps and writes a sync report. An `advise` mode reasons ACROSS all open workflows — builds the dependency/collision graph (seeking code truth when the artifacts don't settle an edge), then renders a ranked "do this next, in this order, stop doing that" plan; read-only, writes nothing.
argument-hint: "[slug|pr#N|branch] [deep] | advise [branch|pr#N|fast]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

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
1b. If the **first** token is `advise`, set **advise-mode** and strip it. The remaining first token (optional) is the advise **scope**: a branch name or `pr#N`/`#N`/bare integer narrows advice to the slugs on that branch; the literal `fast` drops to Tier-0 (frontmatter only — no artifact or code reads). Advise-mode skips the polymorphic resolution in step 2 and, after the always-on Step -1 reconcile, runs the **Advise Mode** section below. Advise does its own bounded code-truth seeking, so it ignores a trailing `deep`.
2. Resolve the remaining first token (polymorphic, first match wins):
   - **Exact slug** (`.ai/workflows/<token>/00-index.md` exists) → **detail mode** (single workflow). Read `00-index.md` directly.
   - **PR reference** `pr#N` / `#N` / bare integer → resolve the branch via `gh pr view <N> --json headRefName -q .headRefName`, then **roster mode** below.
   - **Branch name** (matches a `branch:` column in `.ai/workflows/INDEX.md`) → **roster mode** below.
   - **No token** → **dashboard mode** across all workflows.
3. If enumeration found **no** workflows (registry empty AND search empty) → tell the user: "No
   workflows found. Start one with `$wf intake <description>`." STOP.

# Roster Mode (`pr#N` / branch) — read-only branch view

This is the read-only counterpart to batch `$wf handoff` / `$wf ship`: it answers
"which slugs on this branch are handoff-ready or ship-ready" **without triggering
anything**. It writes nothing beyond the Step -1 registry reconcile.

1. From `.ai/workflows/INDEX.md` (just reconciled), collect every slug whose
   `branch` column equals the resolved branch — the roster. If none → "No
   workflows are on branch `<branch>`." STOP.
2. For each roster slug, read `00-index.md` and (if present) `08-handoff.md`.
   Derive, per slug: `current-stage`, per-slug review verdict / open blockers,
   `readiness-verdict` (from its handoff, if any), `runtime-evidence-status`
   (same computation as dashboard mode), and `handoff-lead:`.
3. Read the lead slug's `08-handoff.md` for the branch-level `pr-readiness-verdict`
   (absent → not yet handed off as a batch).
4. **Render the roster** and STOP:

   ```
   ## Branch <branch> — PR #<N> (<pr-url>)
   Lead slug: <lead>   ·   PR-readiness: <ready | awaiting-input | blocked | not-handed-off>

   | Slug | Stage | Review | Blockers | Handoff-ready | Ship-ready | Runtime | Next |
   |---|---|---|---|---|---|---|---|
   | <slug> | review | ship | 0 | ✓ | ✓ | — | $wf ship pr#<N> |
   | <slug> | implement | — | 2 | ✗ (reviews) | ✗ | deferrals: 1 | $wf review <slug> |

   Handoff-ready = the slug passes its own handoff prerequisites.
   Ship-ready = pr-readiness-verdict is `ready` AND the slug's runtime-evidence is clean.
   ```

   The bottom line names the single batch action available now: `$wf handoff pr#N`
   if any slug is packageable-but-not-packaged, `$wf ship pr#N` if the whole
   branch is ship-ready, or the specific per-slug command blocking progress.

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
4b. **Check steering reality** — if `steer.md` exists (the user-owned standing-steering file; see
   `_steering.md`), read it as **signal, not drift**: its mere presence is normal, expected state and
   is never a finding. A finding arises only when a **stage artifact contradicts a steering entry** —
   e.g. steering says "never touch `config/loader.ts`" but an `05-implement` diff or a plan decision
   did. Surface each contradiction as a `⚠ steering-violation` drift finding under a **Steering**
   category; absent file → skip this check silently, no category, no counts.
4c. **Check intent-risk reality (RIM ledger)** — read `intent-risks` from `00-index.md` (the Intent-Risk
   ledger, same machinery as `runtime-evidence-deferrals`; may be absent → skip silently). Render each
   entry **beside the deferrals ledger** as a compact row — `id` · `severity` (high|medium|low) ·
   `status` (open|adjudicated|carried). A finding arises when an entry is still `status: open`
   **after shape is complete** (shape should have adjudicated it): surface each as a `⚠ intent-risk-open`
   drift finding under an **Intent-Risk** category. Adjudicated/carried entries are normal state, not
   findings.
5. **Assess health** — per-category totals (Code, Test, Git, Deps, External, Steering, Intent-Risk) with ✓/⚠/✗/? counts. Rate:
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

# Advise Mode (`$wf status advise [branch|pr#N | fast]`) — cross-slug sequencing

Advise answers the question the dashboard **cannot**: given every open workflow, *what should I do
next, in what order, and what should I stop doing.* It is the portfolio-level counterpart to `$wf
status <slug>`'s `## Next` — that routes one slug; advise routes the whole set. It is **read-only and
route-don't-act**: it recommends commands (including `$wf close`), never runs them, and never advances
a workflow. Its **only** write is the Step -1 registry reconcile shared by every mode — advise writes
no artifact of its own (see the render note at the end for why it stays ephemeral).

**Scope:**
- `$wf status advise` — every non-terminal workflow in the registry.
- `$wf status advise <branch|pr#N>` — only the slugs on that branch (the sequencing view of roster mode).
- `$wf status advise fast` — Tier-0 only (frontmatter; no artifact or code reads) — the quick sort
  when you don't need the semantic-dependency analysis.

The core is a **constrained sort**: HARD constraints fix the order, SOFT priorities rank within them,
and a WIP pass surfaces what to stop. Run the steps in order.

## Step A1 — Gather the portfolio (Tier 0, always)

From the just-reconciled `INDEX.md` and each `00-index.md`, collect per slug: `status`,
`current-stage`/`stage-number`, `branch`, `updated-at` (+ staleness, >7d), `open-questions`,
`progress` (slices-implemented/total), `runtime-evidence-deferrals`, probe compressed-slices with
`findings-count > 0`, and `intent-risks`. This is the same read the dashboard already does — no new
cost. Drop terminal slugs (`shipped`/`closed`/`abandoned`) **unless** one still carries open
carried-risk (an unresolved deferral, probe finding, or intent-risk), in which case keep it in the
carried-risk section only.

If advise-scope narrowed to a branch/`pr#N`, restrict the set to that branch's roster (resolve `pr#N`
via `gh pr view <N> --json headRefName -q .headRefName`, then filter the `branch` column).

## Step A2 — Build the constraint graph (Tier 1, skipped under `fast`)

For each non-terminal slug, read its `02-shape.md` and its **current** `04-plan-*.md` (latest by stage
number) to extract two things:
- **Stated dependencies** — "assumes X", "after Y ships", "needs the Z schema/module/endpoint" → a
  directed edge `producer → consumer` whenever *another* slug in the set produces that X/Y/Z.
- **Scope footprint** — the modules/paths/features it touches (the plan's files-to-change list + the
  shape's scope). Two slugs whose footprints intersect are **collision candidates**.

When many slugs are open, fan out one lightweight sub-agent per slug to return a compact
`{slug, dependencies[], footprint[]}` record; read inline when few. Assemble the edges into a
dependency graph (a cycle among edges is itself a finding — surface it as a "these N slugs are
mutually entangled; split or sequence deliberately" decision).

## Step A3 — Seek code truth when an edge is uncertain (Tier 2, on demand)

When A2 **suspects** an edge but the artifacts don't settle it — two footprints overlapping on the same
module, or a "needs X" with no obvious producer — **go to the codebase** and confirm or refute,
reusing Deep Mode's code-reality technique **scoped to the one question** (never a full-tree audit):
- **File existence + ownership** — search for / list the paths both plans name; does the shared module
  already exist, and which branch last touched it (`git log -1 --format="%ai %an" -- <path>`)?
- **Symbol reality** — search for the symbol/export one slug "needs" and another "provides": already
  present → *no* edge (the dependency is already satisfied); absent → a *real* producer→consumer edge.
- **Branch divergence** — for two slugs sharing a branch, `git diff --name-only <base>...<branch>`
  to check whether their footprints actually collide in tracked changes (or only in plan intent).

Keep every probe bounded to the specific files/symbols the suspected edge turns on. If a probe instead
reveals **broad** drift (the world moved under a mid-flight slug), don't chase it here — record it and
recommend `$wf status <slug> deep`, which is the full drift audit. Attach each code-truth result to the
edge it settled so the sequencing note can cite it as evidence.

## Step A4 — Rank, serialize, and run the WIP pass

1. **Ready set** — non-terminal, not blocked (`status` ≠ `awaiting-input` AND no `open-questions`),
   and every dependency predecessor already satisfied (shipped, or ranked ahead this run).
2. **Rank the ready set** by descending weight: (a) steer.md priority (Step A5); (b) proximity to done
   (higher `stage-number` — closest to shippable value); (c) carried-risk paid-down soonest; (d) decay
   (staler first, within the same tier — resume before it rots); (e) least effort remaining (`progress`).
3. **Serialize** same-branch, footprint-colliding slugs: name which must precede which and *why*
   (from A2/A3). Independent slugs (disjoint footprints) are flagged as safe-to-parallelize.
4. **WIP pass** — the half users forget: flag every stale (>7d) slug that **nothing depends on** as a
   CLOSE-OR-COMMIT decision; and if the active in-flight count is high, name the few to focus and the
   rest to park. Advise is an anti-sprawl tool, not only a sequencer.

## Step A5 — Honor steering (steer.md)

If `steer.md` exists (per [_steering.md](_steering.md)), read it as the priority overlay across **all**
slugs, not just one. When steering elevates a slug above where proximity/decay would place it, rank it
there **and state the tradeoff out loud** ("ranked #1 per your steering, though `<other>` is closer to
done"). Steering never overrides a HARD dependency — you cannot do B before its predecessor A no matter
the stated priority; if steering implies that, say so and keep the dependency order.

## Render (chat only — advise writes no artifact)

Lead with the single highest-leverage move, then the ranked plan, the blocked set, the decisions, and
the carried risk. **Every row carries a one-line rationale** so the ranking is auditable, and each
names a concrete next command that chains into the driver (`$wf auto <slug>`).

```
## Portfolio Advice — <N> open · <A> active · <B> blocked · <S> stale     (<date> · scope: <all | branch <b>>)

▶ If you do one thing: `<top-ranked next command>` — <one-line why>.

### Do next (ready, ranked)
| # | Next command | Stage | Why now |
|---|---|---|---|
| 1 | `$wf ship <slug>` | review | 0 blockers, ships in one step · 4d stale → land before it drifts |
| 2 | `$wf implement <slug> reviews` | implement | one fix-loop from done · 2 review blockers |

### Blocked — unblock first
| Slug | Blocker | Since | Unblock |
|---|---|---|---|
| <slug> | awaiting-input: "<question>" | <Nd> | answer it, then <next stage> |

### Decisions for you (advise won't make these silently)
- <slug> — <Nd> stale at <stage>, nothing depends on it → `$wf close <slug>` or `$wf <stage> <slug>`
- <slugA> + <slugB> share branch <b> and module <m> → serialize; <slugA> first (<why>)

### Carried risk
- <slug> — <N> open deferral(s) / probe-finding(s) / intent-risk(s) → clear before <stage>

### Sequencing notes (edges found)
- <slugA> before <slugB> — <slugB> needs <X> that <slugA> produces (confirmed: <code-truth evidence, if Tier-2>)
- safe to parallelize: <slugC>, <slugD> (disjoint footprints)
```

Advise is deliberately **ephemeral** — advice is about *now*, so it writes no report (a persisted plan
goes stale the moment you act on it, and re-running is cheap). For a durable per-slug drift record,
that is Deep Mode's `00-sync.md`, not this.

# Chat return contract
- **Dashboard mode:** return the rendered tables + quick-actions. Prepend the one-line registry
  reconcile note from Step -1 only if it changed something. No other preamble — the dashboard IS the output.
- **Detail mode:** return the detail view. The `## Next` section carries the routing (former `next`);
  do not add a separate options footer.
- **Deep mode:** lead with a short **narrative** paragraph (the drift story — what moved and what it
  means), then Health (✓/⚠/✗), the compact category table, ≤5 top drift findings, and `options:`
  (`$wf plan <slug>`, `$wf intake <slug> <scope>`, `$wf status <slug> deep`).
- **Advise mode:** return the Portfolio Advice render — lead with the "if you do one thing" line, then
  the ranked plan, blocked set, decisions, carried risk, and sequencing notes. `Artifacts: none`
  (advise writes nothing beyond the Step -1 reconcile). No preamble — the render IS the output.
