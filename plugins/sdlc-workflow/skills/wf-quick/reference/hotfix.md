---
description: Compressed incident-response workflow for production fixes. Skips intake interviews and slicing — goes directly from diagnosis to minimal fix to ship.
argument-hint: <description-or-slug>
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-hotfix`, an **accelerated incident-response workflow**.

# Slug-mode (read before proceeding)

If `/wf-quick`'s dispatcher selected **slug-mode** in Step 0 (the first argument after the sub-command matched a non-closed slug in `.ai/workflows/INDEX.md`), the *Step 1 — Slug-mode contract* in `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/SKILL.md` overrides the standalone instructions below. Substantively:

- **One artifact, in the existing workflow.** Write `.ai/workflows/<slug>/03-slice-hotfix-<descriptor>.md` (collision suffix `-2`, `-3` if needed). Frontmatter: `type: slice`, `slice-slug: hotfix-<descriptor>`, `slice-type: hotfix`, `compressed: true`, `origin: wf-quick/hotfix`, `stage-number: 3`, `status: defined`.
- **Same content, different home.** Body carries the same sections the standalone hotfix would have written to `01-hotfix.md` (incident summary, diagnosis, narrow fix plan, verification, rollback strategy, scope tripwires), under a `# Compressed Slice: hotfix` heading with a one-line provenance preamble.
- **No new workflow, no new branch (no `hotfix/<slug>` branch creation), no `01-hotfix.md`, no new top-level `00-index.md`.** The slug already owns those — the user is opting in to landing the hotfix as a slice on the existing workflow's branch.
- **Production-base check still applies:** verify the current branch is suitable for a production hotfix. If not, surface a warning in the chat return and let the user decide whether to abort the slug-mode write.
- **Index updates:** append the slice file to `00-index.md.workflow-files`, append `{slug: hotfix-<descriptor>, slice-type: hotfix, created-at: <iso>}` to `00-index.md.compressed-slices` (create the array if missing). If `.ai/workflows/<slug>/03-slice.md` exists, also append `{slug, status: defined, slice-type: hotfix, compressed: true}` to its `slices`, bump `total-slices`, update `updated-at`. Do not modify `current-stage`, `selected-slice`, `status`, `branch`, or `progress`. Also rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md` (see SKILL.md Step 1 step 6).
- **Chat return:** one line — `wf-quick hotfix → compressed slice hotfix-<descriptor> on <slug>` — plus the recommended next step (`/wf implement <slug>` to apply the planned fix, or `/wf-meta status <slug>` to inspect).

If slug-mode was not selected (first argument was not a known slug, or `INDEX.md` did not exist), ignore this section and proceed standalone per the instructions below.

# Pipeline
`1·brief` → `2·diagnose` → `3·plan` → `4·implement` → `5·verify` → `6·ship`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a description or an existing slug to resume. |
| Produces | `hf-brief.md`, `hf-plan.md`, `hf-implement.md`, `hf-verify.md` |
| Next | `/wf ship <slug>` after verify passes |
| Escalate | If fix requires >3 files or architectural changes → `/wf intake <description>` |

# CRITICAL — scope lock
You are a **hotfix orchestrator**. This is not a feature workflow.
- The **only** acceptable output is the minimum change that stops the incident.
- **ZERO tolerance for scope creep.** Do NOT refactor, clean up, or improve code that is not the direct cause of the incident. Do not touch anything outside the identified root cause location without explicit user approval.
- Do NOT run the full 5-round PO interview. Ask at most 3 questions.
- If the fix requires touching more than 3 files, more than ~50 lines, or any architectural changes → **STOP**. Tell the user: "This is too large for a hotfix. Use `/wf intake` to start a proper workflow."
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: hotfix` → **resume mode**. Read that index, determine the last completed step, skip to the next incomplete step.
   - Otherwise → **new hotfix**. Derive a slug: `hotfix-<short-description>` (kebab-case, max 5 words, e.g., `hotfix-auth-token-expiry`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` already exists and `workflow-type` is NOT `hotfix` → WARN and ask the user to adjust the description.
3. **Branch check (MANDATORY):**
   - Check current branch: `git branch --show-current`.
   - Identify the production/default branch: `git remote show origin | grep 'HEAD branch'`.
   - A hotfix ALWAYS branches from the production/default branch. Create and switch to `hotfix/<slug>` if not already on it: `git checkout -b hotfix/<slug> <production-branch>`.

# Step 1 — Brief (replaces intake + shape)
Ask at most **3 questions** — stop as soon as you have enough to proceed:

1. **What is broken?** — Describe the symptom: what is failing, where (URL, endpoint, page, component, service), and for whom (all users, specific cohort, specific environment, specific account).
2. **What is the impact?** — Complete outage, degraded experience, or data issue? How many users are affected? Is data at risk?
3. **What changed recently?** — Any deployments, migrations, config changes, or dependency updates in the last 24–72 hours?

Write `hf-brief.md` immediately after the answers. Do not wait.

**`hf-brief.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: hf-brief
slug: <slug>
workflow-type: hotfix
symptom: <one-line description of what is broken>
impact: <critical|high|medium>
affected-scope: <all-users|cohort|environment|specific-account>
recent-changes: <description or "none known">
status: in-progress
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

Write `00-index.md` immediately after with `workflow-type: hotfix`, `current-stage: diagnose`, `branch: hotfix/<slug>`, `base-branch: <production-branch>`.

# Step 2 — Diagnose
Launch parallel sub-agents to identify root cause. Do not proceed to planning until both complete.

**Model for every dispatched agent:** `sonnet` (resolved from `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/router-metadata.json` `models.overrides["hotfix"]`). REQUIRED on every `Task` call. Both agents do causal reasoning under time pressure — Root Cause must trace symptom-to-cause across recent changes, Impact must reason about blast radius. Haiku's pattern-matching is insufficient for an incident-mode root-cause hunt; Opus is too slow. Sonnet 4.6 is the right tier.

### Explore sub-agent 1 — Root Cause Investigation

Prompt with ALL of the following:
- Read the areas of the codebase most likely to contain the bug based on the symptom description
- Run `git log --oneline -20` on the affected files — cross-reference with the "recent changes" from the brief
- Run `git log --oneline --since="72 hours ago" -- <affected-path>` for the suspected area specifically
- Search for error messages matching the symptom: grep the codebase for exception names, error strings, or failure patterns from the symptom description
- Check for TODOs, FIXMEs, or HACK comments near the suspected area
- Look for failing unit/integration tests related to the symptom
- Identify the **exact file(s) and line(s)** where the bug originates
- Report: file:line, root cause hypothesis (2–4 sentences), confidence level (high/medium/low), supporting evidence

### Explore sub-agent 2 — Impact & Scope

Prompt with ALL of the following:
- Find every caller, consumer, or dependent of the broken code path — use grep for imports and references across the codebase
- Check if related components or services exhibit the same bug via shared code
- Identify what data, if any, may have been corrupted during the bug's active period
- Check if the bug exists on the current production branch or only in unreleased code
- Report: complete list of affected files/paths/services, data risk (none/possible/confirmed), blast radius summary

Wait for both sub-agents. If root cause confidence is low, launch a focused third agent targeting the most likely hypothesis before continuing.

After synthesis: write the `## Diagnosis` section to `hf-brief.md` with root cause, evidence (file:line), and scope. Update `00-index.md` with `current-stage: plan`.

# Step 3 — Plan
Write `hf-plan.md` — a **minimal execution-ready plan** with hard constraints:
- **Maximum 5 implementation steps.** If more steps are needed → STOP and escalate to full workflow.
- Every step must directly address the root cause. No cleanup, no refactoring, no improvements.
- Include a rollback plan: what exactly to revert if the fix causes a regression.
- If data was corrupted: include a data remediation step as a separate tracked item.

**`hf-plan.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: hf-plan
slug: <slug>
workflow-type: hotfix
root-cause-file: <file>
root-cause-line: <line>
step-count: <N>
rollback: <exact git revert command or manual revert steps>
data-remediation-needed: <true|false>
status: complete
created-at: <real timestamp>
---
```

**After writing:** Confirm the plan with the user before implementing — use AskUserQuestion:
```yaml
options:
  - Proceed with this plan
  - Adjust the plan (describe changes in chat)
  - This is too large — escalate to /wf intake
```

# Step 4 — Implement
Execute the plan. For each step:
1. TaskCreate the step, mark `in_progress`, implement it, mark `completed`.
2. Make the **smallest possible change** that addresses the root cause.
3. After all steps: run the build and the relevant portion of the test suite. Record results.

Write `hf-implement.md` with:
- What was changed (file:line and description of the change)
- What was intentionally NOT changed (scope boundary)
- Build and test results (pass/fail counts)

**Atomic commit:** `fix(<slug>): <one-line summary of the fix>` — then record the SHA in `hf-implement.md` frontmatter.

```yaml
---
schema: sdlc/v1
type: hf-implement
slug: <slug>
workflow-type: hotfix
files-changed: [<file>, ...]
lines-changed: <approximate count>
commit-sha: <sha>
test-result: <pass|partial|fail>
status: complete
created-at: <real timestamp>
---
```

# Step 5 — Verify
Run targeted verification focused on the incident. Do not verify unrelated functionality.

1. **Reproduce the original symptom** using the most direct available method (unit test, integration test, browser check, API call, log inspection). Confirm it no longer fails.
2. **Run regression suite** — all pre-existing tests must pass. If tests were already failing before this fix, document which ones and why they are pre-existing failures unrelated to this fix.
3. **Spot-check adjacent paths** — any code paths that call or share the fixed code should be spot-checked for unintended side effects.

Write `hf-verify.md`:
```yaml
---
schema: sdlc/v1
type: hf-verify
slug: <slug>
workflow-type: hotfix
symptom-confirmed-fixed: <true|false>
tests-pass: <true|partial|false>
pre-existing-failures: <list or "none">
result: <PASS|FAIL>
status: complete
created-at: <real timestamp>
---
```

If FAIL: return to Step 4. Do NOT broaden the fix without returning to the plan.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Never leave canonical results only in chat.
- **Every artifact MUST have YAML frontmatter** with `schema: sdlc/v1`.
- **Timestamps must be real:** run `date -u +"%Y-%m-%dT%H:%M:%SZ"` for every `created-at` and `updated-at`. Never guess.
- Skip `wf-review` unless the user explicitly requests it or the fix touches security-sensitive code (auth, tokens, crypto, permissions). Hotfixes trade review thoroughness for speed — but `wf-review security` is always safe to run quickly.
- `00-index.md` must always have: slug, workflow-type, current-stage, branch, base-branch, updated-at, recommended-next-command, recommended-next-invocation.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `branch: hotfix/<slug>`
- `wrote: <paths>`
- `options:` (always `/wf ship <slug>` as default; optionally `/wf review <slug> security` if security-sensitive)
- ≤3 bullets: what was fixed, what to watch for post-deploy, whether data remediation is needed
