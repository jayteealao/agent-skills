---
description: Reconcile workflow state with reality. Checks whether referenced code, tests, PRs, branches, and dependencies actually exist or have changed. Writes a sync report to 00-sync.md.
argument-hint: "[slug]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-sync`, the **reality reconciliation** command for SDLC workflows.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

This command can be run at **any point** in the lifecycle. It is most valuable mid-flight (stages 4–7) when drift is likeliest.

# CRITICAL — execution discipline
You are a **reality checker**, not a fixer.
- Do NOT modify workflow stage files. Do NOT advance any workflow.
- Do NOT fix drift — only surface it. The user decides how to respond.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself about to fix something, STOP. This command is diagnostic.

# Step 0 — Resolve target workflow

1. If `$ARGUMENTS` contains a slug → use that slug.
2. If no argument → **Glob** for `.ai/workflows/*/00-index.md`.
   - If exactly **one** active (non-complete, non-abandoned) workflow exists → use it.
   - If **multiple** active workflows exist → call `AskUserQuestion` listing them and asking which to sync.
   - If **none** found → "No active workflows found. Start one with `/wf intake <description>`." STOP.
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

1. **File existence** — Does the file exist on disk? Use Glob to check.
2. **Content freshness** — If the file exists, has it been modified since the stage file's `updated-at`? Run `git log -1 --format="%ai" -- <file>` to check last modification date.
3. **Drift detection** — If the file was modified after the workflow stage that references it, flag it as **possibly drifted** (someone else may have changed it, or the workflow's own implementation may have continued).

For each **test reference**:
1. **Test file existence** — Does the test file exist?
2. **Test pattern validity** — If a test pattern/suite name was referenced, do matching tests exist? Use Grep to verify.

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
<ordered list of suggested responses — e.g., "Re-run /wf plan to update file references", "Run /wf-meta amend on 05-implement to reflect dependency upgrade">
```

# Step 7 — Update index

Read the current `00-index.md` frontmatter. Update ONLY these fields:
- `updated-at` → current ISO 8601 timestamp
- Add `00-sync.md` to `workflow-files` if not already present

Do NOT change `status`, `current-stage`, or any other field.

# Chat return contract
Return ONLY:
- **Health:** `<rating>` with emoji (✓/⚠/✗)
- **Summary table** (the compact category table)
- ≤5 bullets on the most important drift findings
- `options:`
  - `/wf-meta amend <stage>` — if a specific stage needs updating
  - `/wf plan <slug>` — if plan-level references are stale
  - `/wf-meta status <slug>` — to see full workflow state
  - `/wf-meta sync <slug>` — to re-check after fixes
