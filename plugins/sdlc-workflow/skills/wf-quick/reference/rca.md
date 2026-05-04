---
description: Root-cause analysis workflow. Investigates a reported issue using parallel diagnosis sub-agents, writes a structured RCA artifact with confidence, blast radius, and suggested fix shape, then recommends the right downstream command (/wf-plan for non-trivial work, /wf-quick quick for small fixes, /wf-quick hotfix for active incidents). Does NOT write a fix. Synthesizes a minimal 02-shape.md so /wf-plan can consume the workflow directory without modification.
argument-hint: <description-or-slug>
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-rca`, a **root-cause analysis workflow** that investigates an issue and recommends the right downstream command, without writing a fix.

# Pipeline
`1·symptom` → `2·investigate` → `3·synthesize` → `/wf-plan` | `/wf-quick quick` | `/wf-quick hotfix`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass an error description, stack trace, or an existing slug to resume. |
| Produces | `01-rca.md` (full RCA), `02-shape.md` (synthesized minimal shape so /wf-plan works), `00-index.md` |
| Skips | No fix, no plan, no shape interview. The RCA *is* the shape. |
| Next | `/wf-plan <slug>` (default — non-trivial fixes), `/wf-quick quick <slug>` (small fixes), `/wf-quick hotfix <slug>` (active production incidents). The artifact recommends one based on the diagnosis. |
| Escalate | If root cause is genuinely uncertain (confidence: low) AND blast radius is high → surface `human triage required` and stop without recommending a routing path. |

# CRITICAL — investigation discipline
You are a **diagnostician**, not a fixer.
- The **only** acceptable output is the RCA artifact, the synthesized shape, and the index. Do NOT edit application code. Do NOT propose a patch. Do NOT run code that would mutate state (DB writes, deployments, git commits).
- Read-only investigation only: `git log`, `git blame`, `Read`, `Grep`, log file inspection, dev-tooling inspection, and tests run in read-only modes.
- The "Suggested fix shape" section is **direction, not a plan** — 1 to 3 lines naming the area and approach. Do not enumerate steps.
- Ask at most **3 questions** in chat. No `AskUserQuestion`, no separate `po-answers.md` — answers go inline into the artifact.
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: rca` → **resume mode**. Read that index. If `01-rca.md` is complete, the user likely meant to run the recommended next command — tell them and stop. If incomplete, pick up from the missing section.
   - Otherwise → **new RCA**. Derive a slug: `rca-<short-symptom>` (kebab-case, max 5 words, e.g., `rca-checkout-double-charge`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` already exists and `workflow-type` is NOT `rca` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf-resume <slug>` to continue the existing workflow." Stop.
3. **Branch posture (do NOT switch branches):**
   - Investigation is read-only — do not create or switch branches.
   - Record the current branch in the index as `branch` and `base-branch` so the eventual fix workflow knows where the diagnosis was performed.
4. **Read project context (lightweight):**
   - Read `README.md` (top 100 lines) for project shape.
   - Skim `.ai/workflows/*/00-index.md` (filenames only) to spot any related active workflows the symptom might be tied to.

# Step 1 — Symptom intake
Ask at most **3 questions** — stop as soon as you have enough to investigate:

1. **What is broken?** — Symptom: what is failing, where (URL, endpoint, page, component, service, log line), and for whom (all users, specific cohort, environment, account).
2. **What is the impact?** — Critical (outage, data risk), high (degraded), medium (annoyance), or low (cosmetic). How many users? Is data at risk?
3. **What changed recently?** — Deployments, migrations, config changes, dependency bumps in the last 24-72 hours that might be the cause.

If the user provided a stack trace or error message in `$ARGUMENTS`, treat it as partial answers — only ask remaining questions.

Do NOT write the artifact yet. Hold the answers in working memory and proceed to Step 2.

# Step 2 — Parallel root-cause investigation
Launch parallel sub-agents to identify the root cause. Do not proceed to synthesis until all complete.

### Explore sub-agent 1 — Code path investigation

Prompt with ALL of the following:
- Identify the code path most likely to contain the bug from the symptom description and any error/stack trace.
- Read the implicated files in full. Look for: incorrect assumptions, missing null/undefined handling, race conditions, off-by-one errors, incorrect state transitions, mismatched contract between caller and callee.
- Check tests covering the implicated path. If tests exist, identify why they did not catch this. If tests do not exist, note the gap.
- Run `git log --oneline -20` on the implicated files; cross-reference with "recent changes" from the symptom intake.

Return as structured text:
- `implicated_files`: list of paths
- `most_likely_mechanism`: one paragraph naming the root cause mechanism
- `evidence`: 2-5 bullets citing file:line locations
- `confidence`: high | medium | low (with one-line justification)
- `test_coverage_gap`: description or "none"

### Explore sub-agent 2 — Recent change correlation

Prompt with ALL of the following:
- Run `git log --since="7 days ago" --oneline` and identify commits in or near the implicated path.
- For each candidate commit, read the diff and check whether it could plausibly cause the symptom.
- Check open PRs touching the implicated path: `gh pr list --search "path:<implicated-dir>"`.
- Check recent deployments, migrations, or feature flags if discoverable from the repo.

Return as structured text:
- `suspect_commits`: list of `<sha> <short-message>` with one-line "could it cause this?" assessment
- `concurrent_work`: list of open PRs touching the same area
- `external_changes`: any deploys/migrations/flag flips noted (or "none discovered")

### Explore sub-agent 3 — Blast radius

Prompt with ALL of the following:
- Given the implicated mechanism, identify what else might be silently affected: callers of the broken function, sibling code paths sharing the same flawed assumption, data already corrupted by past invocations, downstream systems consuming the bad output.
- Search the codebase for the same pattern that caused the bug, in case it exists in multiple places.

Return as structured text:
- `affected_callers`: list of `path:symbol` that may be affected
- `same_pattern_elsewhere`: list of paths where the buggy pattern repeats (or "none found")
- `data_at_risk`: description of any persisted state that may be corrupt (or "none")
- `radius`: low | medium | high (with one-line justification)

If the symptom is clearly local (a single component, a single endpoint, no shared utilities), Sub-agent 3 may be skipped — but state in the RCA artifact that it was skipped and why.

# Step 3 — Synthesize and write `01-rca.md`

Merge findings from the sub-agents. **Do not invent root causes the agents did not surface.** If the agents disagree or returned low confidence, the RCA records that — uncertainty is data.

**`01-rca.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: rca
slug: <slug>
workflow-type: rca
symptom: <one-line description>
impact: <critical|high|medium|low>
root-cause-confidence: <high|medium|low>
blast-radius: <low|medium|high|skipped>
recommended-next: </wf-plan|/wf-quick quick|/wf-quick hotfix|human-triage>
status: ready-for-fix-routing
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

**Body sections (in order):**

## 1. Symptom

The user-reported issue, verbatim where possible. ≤3 sentences. Cite the original error message or stack trace if provided.

## 2. Scope

- **Who is affected:** all users / cohort / specific account / specific environment.
- **When it started:** first known occurrence (commit, deploy, time window) or "unknown".
- **Reproduction:** specific steps if reliably reproducible, or "intermittent — see Step 4 evidence".

## 3. Investigation summary

A short bulleted list of what was checked. ≤6 bullets. Mention what each sub-agent inspected and what was ruled out as well as what was confirmed. Ruling things *out* is data — record it.

## 4. Root cause

The actual cause, written as a mechanism: "X happens because Y, which causes Z." Cite specific `file:line` locations. ≤5 sentences. If multiple plausible causes survive investigation, list them in priority order with the evidence supporting each.

## 5. Contributing factors

Secondary issues that made the bug worse, harder to detect, or harder to recover from. Examples: missing test coverage, no observability on the affected code path, retry logic that masked early failure, error handling that swallowed the original exception. ≤4 bullets.

## 6. Blast radius

- **Currently visible:** what is broken right now.
- **Possibly affected (silent):** other code paths or persisted data that may be corrupt or behaving unexpectedly because of this same root cause.
- **Same pattern elsewhere:** other locations in the codebase where the same flawed pattern exists and should be checked or fixed alongside this work.

If sub-agent 3 was skipped, write: "Blast radius investigation skipped — symptom is local to <component>. If the fix turns out to require changes outside <component>, run `/wf-quick rca` again or escalate to `/wf-quick intake`."

## 7. Suggested fix shape

**Direction, not a plan.** 1 to 3 lines naming the area and the approach. Do NOT enumerate implementation steps — that belongs in `/wf-plan` or `/wf-quick quick`. Examples of the right shape:

> "Fix the off-by-one in `cart/total.ts:checkout()` — apply discount before tax, not after. One-line change. Add a regression test in `cart.test.ts`."

> "Add idempotency keys to the checkout webhook handler. New middleware in `webhooks/checkout/`. Deduplicate by `(provider_event_id, order_id)`. Migration to add an index. Estimate 3-5 files."

## 8. Verification

How will we know the fix worked? List:
- **Test:** specific assertion or test command that should pass post-fix.
- **Manual:** specific URL, flow, or visual check.
- **Log signal:** specific log line, metric, or absence-of-error that confirms the bug is gone.

This section becomes the acceptance criteria for the downstream fix workflow.

## 9. Confidence

- **Root cause confidence:** high | medium | low. One sentence justifying.
- **Fix shape confidence:** high | medium | low. One sentence justifying.

If either is `low`, this section MUST also recommend whether to fix anyway (with monitoring) or to escalate to human triage / further investigation.

## 10. Recommended next command

Pick **one** primary recommendation based on the diagnosis. Routing logic:

| Conditions | Recommendation |
|---|---|
| `impact: critical` AND production-affecting AND root-cause-confidence ≥ medium AND blast-radius ≤ medium AND suggested-fix-shape is small | `/wf-quick hotfix <slug>` |
| Suggested fix shape touches ≤3 files, ≤5 steps, no new dependency, no architecture change | `/wf-quick quick <slug>` |
| Anything else — including any architectural change, new dependency, cross-cutting work, or blast radius is `high` | `/wf-plan <slug>` |
| `root-cause-confidence: low` AND `blast-radius: high` | **`human-triage`** — recommend escalation, do not auto-route |

State the recommendation clearly with one sentence of justification. Then list the alternatives in priority order. The user makes the final call.

## 11. Tripwire warnings (only if any fired)

Tripwires are **warn-and-continue** — record them, do NOT refuse to write the RCA. Tripwires:

- **Confidence breach:** root-cause-confidence is `low`.
- **Blast radius breach:** blast-radius is `high` (regardless of confidence).
- **Multiple plausible root causes:** Section 4 listed >1 cause and the sub-agents could not narrow further.
- **Concurrent work conflict:** Sub-agent 2 found an open PR touching the implicated path — fixing this may collide with that work.
- **Same-pattern elsewhere:** the buggy pattern repeats in other locations and the fix scope expands beyond the originally implicated code.

For each fired tripwire, write one line: `[tripwire-name]: <what specifically tripped it>`. Then add a single closing line:

> One or more wf-rca tripwires fired. The RCA is still valid, but the downstream fix workflow should account for the recorded warnings before proceeding.

# Step 4 — Synthesize `02-shape.md`

Write a minimal `02-shape.md` so `/wf-plan <slug>` can consume the workflow directory without modification. This file is intentionally short — it is a *forwarding contract*, not a duplicate of the RCA.

**`02-shape.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
workflow-type: rca
status: ready
derived-from: 01-rca.md
created-at: <timestamp>
---
```

**Body:**

```markdown
# Shape (synthesized from RCA)

This shape was generated by `/wf-quick rca` from the diagnosis in `01-rca.md`. The full investigation context, evidence, and fix-shape rationale lives there — read it before planning.

## Problem

<copy Section 1 (Symptom) and Section 4 (Root cause) summary from 01-rca.md>

## Scope (in)

<copy Section 7 (Suggested fix shape) from 01-rca.md, plus the implicated files from Section 4>

## Scope (out)

- Anything not directly required to remediate the root cause identified in `01-rca.md`.
- Refactoring, cleanup, or unrelated improvements in the implicated files. If those are needed, file separately.
- Same-pattern-elsewhere fixes (Section 6 of `01-rca.md`) — these are noted but require their own scoping decision before being added here.

## Acceptance criteria

<copy Section 8 (Verification) from 01-rca.md as bulleted criteria>

## Open questions

<list any items from Section 9 (Confidence) that the user still needs to decide; or "none">
```

If the recommended next command is `/wf-quick quick` or `/wf-quick hotfix`, still write `02-shape.md` — those commands ignore it, but it preserves the option for the user to switch routing to `/wf-plan` later without losing the synthesis.

# Step 5 — Write `00-index.md`

Standard index file:

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
workflow-type: rca
current-stage: fix-routing
status: ready
selected-slice: <slug>
branch-strategy: none
branch: <current-branch-recorded-at-step-0>
base-branch: <current-branch-recorded-at-step-0>
next-command: <recommended next command from Section 10>
next-invocation: <recommended next command with slug>
recommended-routes:
  primary: <command>
  alternates: [<command>, <command>]
open-questions: []
progress:
  - rca: complete
  - shape-synthesized: complete
created-at: <timestamp>
---
```

Body: one-line description + a short pointer to `01-rca.md` and the routing recommendation.

# Step 6 — Hand off to user

Emit a compact chat summary, no more than 10 lines:

```
wf-rca complete: <slug>
Symptom: <one-line>
Root cause: <one-line, citing file:line>
Confidence: <root-cause-confidence> root cause / <fix-shape-confidence> fix shape
Blast radius: <low|medium|high|skipped>
Tripwires: <none | comma-separated list>
Recommended next: <command> — <one-sentence justification>
Alternates: <comma-separated list of other viable next commands>
RCA artifact: .ai/workflows/<slug>/01-rca.md
```

If the recommendation is `human-triage`, replace the `Recommended next:` line with:

> ⚠ Human triage required — confidence is low and blast radius is high. Read `01-rca.md` and decide manually before routing to a fix workflow.

# Routing notes (read carefully)

- **`/wf-plan <slug>` is the cleanest downstream path** — it reads the synthesized `02-shape.md` and the workflow directory without any modification. Use this as the default unless the diagnosis clearly fits hotfix or quick.
- **`/wf-quick quick <slug>` and `/wf-quick hotfix <slug>`** are designed to start fresh workflows. They will detect the existing `00-index.md` and warn about a collision. To use them after `wf-rca`, the user can either: (a) accept the collision warning and proceed manually, copying the relevant context from `01-rca.md` into the fresh workflow's brief; or (b) run `/wf-plan <slug>` instead, which preserves continuity and is usually fine even for small fixes. The recommendation surfaces the cleanest option for the diagnosis.
- **Future enhancement:** `/wf-quick quick` and `/wf-quick hotfix` may add an "inherit from RCA" mode that consumes an existing `01-rca.md`. Until then, `/wf-plan` is the seamless path.

# What this command is NOT

- **Not a fixer** — `wf-rca` produces an RCA artifact and a routing recommendation. It does not edit application code. It does not run mutating commands. It does not commit, push, or open a PR.
- **Not a hotfix** — `wf-hotfix` is what you run *after* `wf-rca` recommends it. `wf-rca` decides whether the situation warrants the hotfix path.
- **Not a how/explain** — `wf-how` is for explaining existing code or artifacts on demand. `wf-rca` is for *finding* a cause that is not yet explained.
