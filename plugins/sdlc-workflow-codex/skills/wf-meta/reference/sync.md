---
description: Reconcile workflow state with reality. Two responsibilities — (a) maintain the global workflow registry `.ai/workflows/INDEX.md` (bootstrap on first run; refresh every run) so `$wf-quick` positional slug detection works; (b) check whether referenced code, tests, PRs, branches, and dependencies actually exist or have changed (per-workflow drift report). Writes a sync report to 00-sync.md.
argument-hint: "[slug]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.ai/dep-updates/...`), stage names or numbers, skill names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-sync`, the **reality reconciliation** skill for SDLC workflows.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

This skill can be run at **any point** in the lifecycle. It is most valuable mid-flight (stages 4–7) when drift is likeliest.

# CRITICAL — execution discipline
You are a **reality checker**, not a fixer.
- Do NOT modify workflow stage files (other than the bookkeeping touch in Step 7 and the INDEX.md maintenance in Step -1). Do NOT advance any workflow.
- Do NOT fix drift in per-workflow stage files — only surface it. The user decides how to respond.
- The global `.ai/workflows/INDEX.md` registry IS your responsibility to keep accurate — bootstrap it if missing, refresh it on every run (Step -1). This is bookkeeping, not stage-file mutation.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself about to fix anything beyond the INDEX.md registry, STOP. This skill is diagnostic.

# Step -1 — Maintain the global workflow registry (`.ai/workflows/INDEX.md`)

This step runs **unconditionally on every invocation, before Step 0**, even if the user passed a specific slug. It is the *only* read-side guarantee that `$wf-quick`'s positional slug detection has a fresh registry to consult.

**File: `.ai/workflows/INDEX.md`**

Format — single header line (one-line comment starting with `#`), then one row per workflow. Columns are tab-separated. Rows sorted alphabetically by slug. Closed workflows are retained for history (they show up as `closed` in the status column; `$wf-quick`'s positional slug detection skips closed rows but a slug match still triggers an "append a slice to a closed workflow?" confirmation).

```
# .ai/workflows/INDEX.md — global workflow registry. Maintained by $wf-meta sync (bootstrap+refresh, Step -1), additively touched by $wf-quick slug-mode writes (updated-at only), and bootstrap+append-self by $wf intake (v9.25.0). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.
<slug>	<status>	<workflow-type>	<branch>	<updated-at>
<slug>	<status>	<workflow-type>	<branch>	<updated-at>
```

Column semantics (all values pulled directly from each workflow's `00-index.md` YAML frontmatter):

| Column | Source field on `00-index.md` | Notes |
|---|---|---|
| `slug` | `slug` (and must equal the directory name) | The lookup key. |
| `status` | `status` | Common values: `defined`, `shaped`, `sliced`, `planned`, `implementing`, `verifying`, `reviewing`, `handed-off`, `shipped`, `closed`, `abandoned`. |
| `workflow-type` | `workflow-type` (or `compressed`, `fix`, `quick` (legacy pre-v9.18.0), `rca`, `investigate`, `discover`, `hotfix`, `update-deps`, `refactor`, `docs`, `standard`). Use `standard` if the field is missing on legacy indexes. |
| `branch` | `branch` | The git branch the workflow lives on (informational; not used for routing). |
| `updated-at` | `updated-at` (ISO 8601 UTC, e.g. `2026-05-16T12:34:56Z`) | Used by `$wf-meta status` ordering and by humans skimming the registry. |

**Procedure:**

1. **List files** to discover every workflow directory (search for `.ai/workflows/*/00-index.md`).
2. For each `00-index.md`, parse its YAML frontmatter and extract the five columns above.
3. If `.ai/workflows/INDEX.md` does **not** exist → **bootstrap**: write a fresh file from scratch with the header comment + one sorted row per discovered workflow. Surface this in the chat return as: *"Bootstrapped `.ai/workflows/INDEX.md` with N workflows. `$wf-quick` positional slug detection is now enabled."*
4. If `.ai/workflows/INDEX.md` **does** exist → **refresh**: rewrite the file with the current sorted set of discovered workflows. Compare against the previous content and report a one-line diff summary in the chat return: *"Refreshed INDEX.md: A added, R removed, U status/branch updates."*
5. If a row in the previous INDEX.md references a slug whose `.ai/workflows/<slug>/00-index.md` is missing on disk → omit the row from the rewritten file and flag it in the chat return as *"Removed stale row: `<slug>` (directory missing)."*

This step is fast (one frontmatter read per workflow dir; no git ops, no external calls) and idempotent — running it twice produces an identical file. The per-workflow drift check (Steps 1–7 below) runs *after* this is done.

# Step 0 — Resolve target workflow

1. If `$ARGUMENTS` contains a slug → use that slug.
2. If no argument → search for `.ai/workflows/*/00-index.md`.
   - If exactly **one** active (non-complete, non-abandoned) workflow exists → use it.
   - If **multiple** active workflows exist → ask the user in chat which one to sync, presenting them as a short numbered list.
   - If **none** found → "No active workflows found. Start one with `$wf intake <description>`." STOP.
3. Read the target `00-index.md`. Parse all YAML frontmatter fields.

# Step 1 — Inventory all references

Read every stage file listed in `workflow-files` from the index. For each file that exists, extract all external references:

**Code references:**
- File paths mentioned in implement/verify stage files (e.g., `src/components/Button.tsx`)
- Function/class names referenced as changed or added
- Import paths mentioned in plan files

**Test references:**
- Test file paths mentioned in verify stage files
- Test suite names or patterns

**Git references:**
- Branch name from `branch` field in index
- Base branch from `base-branch` field
- PR URL or number from `pr-url` / `pr-number`
- Commit SHAs mentioned in any stage file

**Dependency references:**
- Package names mentioned in plan or implement files (e.g., "added lodash", "upgraded React to 18")
- Configuration files referenced (e.g., `tsconfig.json`, `webpack.config.js`)

**External references:**
- Ticket/issue URLs or IDs
- API endpoints referenced
- Documentation links

Build a complete reference inventory with source (which stage file mentioned it) and type.

# Step 2 — Check code reality

For each **code reference** in the inventory:

1. **File existence** — Does the file exist on disk? Search/list files to check.
2. **Content freshness** — If the file exists, has it been modified since the stage file's `updated-at`? Run `git log -1 --format="%ai" -- <file>` to check last modification date.
3. **Drift detection** — If the file was modified after the workflow stage that references it, flag it as **possibly drifted** (someone else may have changed it, or the workflow's own implementation may have continued).

For each **test reference**:
1. **Test file existence** — Does the test file exist?
2. **Test pattern validity** — If a test pattern/suite name was referenced, do matching tests exist? Search to verify.

Report:
- `✓ exists` — file exists, not modified since reference
- `⚠ drifted` — file exists but modified after the referencing stage
- `✗ missing` — file does not exist
- `? unknown` — could not determine (e.g., ambiguous reference)

# Step 3 — Check git reality

1. **Branch existence** — Does the workflow's branch exist? Run `git branch --list <branch>` and `git branch -r --list "origin/<branch>"` (local and remote).
2. **Current branch** — Run `git branch --show-current`. Warn if it doesn't match the workflow's branch.
3. **Branch freshness** — If the branch exists, how many commits ahead/behind the base branch? Run `git rev-list --left-right --count <base>...<branch>`.
4. **PR status** — If a PR URL/number is referenced:
   - Run `gh pr view <number> --json state,mergeable,reviewDecision,statusCheckRollup 2>/dev/null` if `gh` is available.
   - Report: state (open/closed/merged), review decision, CI status.
   - If `gh` is not available, note "PR status check requires GitHub CLI (`gh`)".
5. **Commit references** — For any SHAs mentioned, verify they exist: `git cat-file -t <sha> 2>/dev/null`.

Report each with the same ✓/⚠/✗/? markers.

# Step 4 — Check dependency reality

For each **dependency reference**:

1. **Package existence** — Check if the dependency is in the actual lockfile/manifest:
   - Node: check `package.json` for the package name
   - Python: check `requirements.txt`, `pyproject.toml`, or `Pipfile`
   - Other: check the relevant manifest file
2. **Version drift** — If a specific version was mentioned in the workflow, compare with the installed version.
3. **Config file freshness** — For referenced config files, check if they've been modified since the stage that references them.

# Step 5 — Assess overall health

Compute a sync health summary:

| Category | Total | ✓ OK | ⚠ Drifted | ✗ Missing | ? Unknown |
|----------|-------|------|-----------|-----------|-----------|

Categories: Code Files, Test Files, Git State, Dependencies, External

**Health rating:**
- **In sync** — no ✗ missing, ≤2 ⚠ drifted items
- **Minor drift** — no ✗ missing, 3+ ⚠ drifted items
- **Significant drift** — any ✗ missing items
- **Stale** — workflow's `updated-at` is >7 days ago AND there is drift

# Step 6 — Write sync report

Write `00-sync.md` in the workflow directory (`.ai/workflows/<slug>/00-sync.md`):

```yaml
---
schema: sdlc/v1
type: sync-report
slug: <slug>
created-at: <ISO 8601 timestamp>
synced-at: <ISO 8601 timestamp>      # last read — renderer surfaces "synced N ago"
regenerable: true                     # automation-owned snapshot (see contract below)
health: <in-sync | minor-drift | significant-drift | stale>
refs:
  - 00-index.md
  - <all stage files checked>
---
```

**Report body structure:**

```markdown
# Sync Report: <title>

**Health:** <rating> | **Checked:** <timestamp> | **Workflow updated:** <updated-at from index>

## Summary

| Category | Total | ✓ OK | ⚠ Drifted | ✗ Missing |
|----------|-------|------|-----------|-----------|
| Code Files | ... | ... | ... | ... |
| Test Files | ... | ... | ... | ... |
| Git State | ... | ... | ... | ... |
| Dependencies | ... | ... | ... | ... |

## Code Files
<table of all code references with status, source stage, last modified>

## Test Files
<table of all test references with status>

## Git State
- Branch: <branch> — <status>
- Base divergence: <N> ahead, <M> behind <base>
- PR: <status or "none">
- <any commit SHA checks>

## Dependencies
<table of dependency references with status>

## Drift Details
<for each ⚠ or ✗ item: what changed, when, which stage is affected>

## Recommended Actions
<ordered list of suggested responses — e.g., "Run `$wf-meta amend <stage>` to update file references", "Run `$wf plan <slug>` if plan-level references are stale">
```

## Step 6b — Write the sibling `00-sync.yaml` (MANDATORY — do not skip)

The markdown body above is the readable record; the **rich sync page**
(`sync-report.mjs` → verdict + diverging-bar figure + diverged-files table +
recommendation callout, plus the phone layout) is driven entirely by a sibling
`00-sync.yaml` written next to `00-sync.md`. **Without it the page silently
degrades to plain prose** (the `renderSimple` fallback) — no verdict, no figure,
no drift table. Author it every run:

```yaml
artifact: sync                 # REQUIRED — discriminator
branch: <feature branch>       # REQUIRED
base_branch: <base, e.g. main> # REQUIRED
ahead_count: <int ≥ 0>         # REQUIRED — commits on branch not in base
behind_count: <int ≥ 0>        # REQUIRED — upstream commits the branch lacks
conflict_risk: <none|low|med|high>   # REQUIRED — drives the verdict tone:
                                     #   none|low → "In sync" (ok / ✓)
                                     #   med      → "Drifting" (caveats / ◐)
                                     #   high     → "Conflicts likely" (no / ✗)
rebase_status: <clean|conflicts>     # optional
stale_days: <int ≥ 0>                # optional — days since last rebase
diverged_files:                      # optional — one row per drifted file
  - path: src/checkout/CartSummary.tsx
    base_delta: "+42/−11"            # display string (base-side churn) or null
    branch_delta: "+67/−8"           # display string (branch-side churn) or null
    conflict: true                   # true → row + mobile chip flagged --blocker
recommendation: "Rebase on origin/main; resolve CartSummary + payments conflicts."
```

Notes:
- The schema is `siblingYamlSchemas["sync-report"]` in `tests/frontmatter.schema.json`.
- `conflict_risk` is the single field that sets the verdict tone — pick it from
  the overall drift assessment, not from any single file.
- `base_delta` / `branch_delta` are free display strings (`"+N/−M"`); the
  renderer colours the `+N` green and `−M` red. Use `null` when a side did not
  touch the file. Set `conflict: true` only for files edited on **both** sides.
- This is a **regenerable** view: overwrite `00-sync.yaml` wholesale each run,
  exactly like `00-sync.md`. No history, no revision append.

## Step — Write free narrative fragments

Beyond the structured page, this artifact ships one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the rendered page can't on its own — a bespoke diagram, a before/after comparison, a timeline, or an interactive widget. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See [_fragment-authoring.md](../../wf/reference/_fragment-authoring.md) Step F2 and [../../../references/narrative-fragments.md](../../../references/narrative-fragments.md).

# Step 7 — Update index

Read the current `00-index.md` frontmatter. Update ONLY these fields:
- `updated-at` → current ISO 8601 timestamp
- Add `00-sync.md` to `workflow-files` if not already present

Do NOT change `status`, `current-stage`, or any other field.

Then rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md` to the same timestamp. (Step -1 refreshed the file based on the pre-Step-7 state; this small touch keeps it consistent with the just-bumped `00-index.md.updated-at`.)

# Chat return contract
Return ONLY:
- **Health:** `<rating>` with emoji (✓/⚠/✗)
- **Summary table** (the compact category table)
- ≤5 bullets on the most important drift findings
- `options:`
  - `$wf-meta amend <stage>` — if a specific stage needs updating
  - `$wf plan <slug>` — if plan-level references are stale
  - `$wf-meta status <slug>` — to see full workflow state
  - `$wf-meta sync <slug>` — to re-check after fixes

---

## Additive-write contract (v9.20.2+) — regenerable: true

`sync-report` artifacts are **views over branch state** — they read git/PR
status at a moment in time and project it onto the workflow tree. They are
NOT source-of-truth. The additive-write contract is the opposite of the
shape/slice/plan/intake/retro/handoff family:

1. **Set `regenerable: true` in frontmatter.** This is the canonical
   declaration that the artifact is rewritten by automation; readers and the
   renderer treat it as a snapshot, not a narrative.
2. **Overwrite freely.** Each `$wf-meta sync <slug>` invocation rewrites the
   sync-report end-to-end. No history snapshot, no `## Revision <n>` append.
3. **Do not carry `revision-count`.** The flag is meaningful only for
   append-only artifacts; sync-reports have no revisions, only the latest
   read.
4. **Include `synced-at`** in frontmatter (ISO timestamp) so the renderer
   can surface "last synced N minutes ago" in the page header.

The renderer:
- Shows a `regenerable` badge at the top of the page (informs the reader the
  document is automation-owned).
- Suppresses the prior-revisions `<details class="history">` block — there's
  no history to display.
- Does NOT raise verifier Check 5 (view-tree freshness) warnings on
  sync-reports — staleness here is expected, not a bug.

**Why sync-report is the canonical `regenerable: true` example**: every other
artifact in `.ai/workflows/<slug>/` accumulates narrative over time
(intake → shape → plan → review → retro). Sync-report is the one artifact
that is always "now-state" — it has no past tense to preserve. Marking it
`regenerable: true` lets the additive-write infrastructure stay strict
everywhere else without forcing a permanent exception.

Other artifacts that may carry `regenerable: true`:
- `RESUME.md` (session resume — automation-rewritten each session start).
- Slug-level `00-index.md` *only* when explicitly regenerated by
  `$wf-meta` operations; manual edits to `00-index.md` remain authoritative.
