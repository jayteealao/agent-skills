---
description: Compressed incident-response STANDARD lifecycle for production fixes. Drives every SDLC stage single-pass (01-hotfix → 02-shape diagnosis → 03-slice → 04-plan → gate → implement → verify → review[security]) on a full type:index overview, with a hard scope lock and a production-branch base. The mode authors the planning half; the standard /wf implement/verify/review chain authors execution.
argument-hint: <description-or-slug>
---

# Output boundary & shared context
Load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, the workflow-registry / slug rules, **and the "Compressed-lifecycle change-modes" contract (the model, the authorship split, and the gate)**. Do not restate them here.

You are running `/wf intake hotfix`, an **accelerated incident-response standard lifecycle**.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-hotfix-<descriptor>.md` (`type: slice`, `slice-type: hotfix`, `compressed: true`, `origin: intake/hotfix`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `hotfix → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`01-hotfix`(intake) → `02-shape` (diagnosis) → `03-slice` → `04-plan` → **[gate]** → `/wf implement` (→`05`) → `/wf verify` (→`06`) → `/wf review security` (→`07`) → `/wf handoff` → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a description or an existing slug to resume. |
| Produces (this command) | `01-hotfix.md` (`type: intake` — incident brief + acceptance criteria + diagnosis), `02-shape.md` (root cause + blast radius + scope), `03-slice.md` (`type: slice-index`, one slice), `04-plan.md` (minimal plan + rollback), conformant `00-index.md` (`type: index`). |
| Compression | Each stage single-pass — **no stage is skipped**, but the lifecycle is expedited under incident pressure. One slice. Handoff and retro stay in the chain: ship STOPs without a ready handoff verdict, and retro auto-triggers its incident consult exactly for hotfixes. |
| Gate | Stop-and-prompt before `05-implement` (Proceed / Adjust / Escalate; family rules per `_change-mode-tail.md`). |
| Next | `/wf implement <slug>` — standard execution; `07-review` defaults to **`security`**. |
| Escalate | If the fix needs >3 files / >~50 lines / architectural change, the tripwire fires — record it per `_change-mode-tail.md` and offer the gate's *Escalate*, which closes this slug and restarts as `/wf intake "<description>" from <slug>`. |

# CRITICAL — scope lock
You are a **hotfix orchestrator**. This is not a feature workflow.
- The **only** acceptable output is the minimum change that stops the incident.
- **ZERO tolerance for scope creep.** Do NOT refactor, clean up, or improve code that is not the direct cause. Do not touch anything outside the identified root cause without explicit user approval.
- Ask at most **3 questions**. No separate `po-answers.md` — answers go inline into `01-hotfix.md`.
- The lifecycle skips no *stage* — but each is single-pass and incident-scoped. The hotfix tripwires are: >3 files · >~50 lines · any architectural change. A breach is recorded per `_change-mode-tail.md` (never a refusal) and surfaces the gate's *Escalate*.
- Follow the steps below exactly in order.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: hotfix` → **resume mode**. Read that index and pick up from the first unwritten planning artifact. (Legacy slugs may carry `hf-*.md` files — re-author them as the standard set if continuing.)
   - Otherwise → **new hotfix**. Derive a slug: `hotfix-<short-description>` (kebab-case, max 5 words, e.g., `hotfix-auth-token-expiry`).
2. **Collision check:** apply the collision check in `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_change-mode-tail.md`.
3. **Provenance check:** apply `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_intake-provenance.md` — an rca frequently routes its critical cases here. On an explicit `from <rca-slug>` token, consume the rca Consume-table row (root cause seeds `## Diagnosis`, section 8 verification seeds the acceptance criteria, blast radius seeds scope — Step 2's sub-agents then re-verify instead of re-deriving) and link back. No match → continue.
4. **Stack fingerprint:** apply the stack policy in `_change-mode-tail.md` — detect cheaply, write the block with `user-confirmed: false`, and spend no question on it (verify's caveat path carries it).
5. **Branch check (MANDATORY):**
   - Check current branch: `git branch --show-current`.
   - Identify the production/default branch **offline first**: `git symbolic-ref refs/remotes/origin/HEAD` (no network — mid-incident the network may be part of the incident). If unset, fall back to `git remote show origin | grep 'HEAD branch'`, then to `main`/`master` whichever exists locally.
   - A hotfix ALWAYS branches from the production/default branch: `git checkout -b hotfix/<slug> <production-branch>`.
6. **Single slice.** The whole hotfix is one slice — the workflow slug doubles as the one slice's `slice-slug` (use `<slug>` for `slice-slug`, `selected-slice`, `best-first-slice`). Downstream stages write **un-suffixed** files.

# Step 1 — Brief → `01-hotfix.md` (`type: intake`)
Ask at most **3 questions** — stop as soon as you have enough:
1. **What is broken?** — symptom: what is failing, where (URL/endpoint/page/component/service), and for whom (all users / cohort / environment / account).
2. **What is the impact?** — outage / degraded / data issue? how many users? data at risk?
3. **What changed recently?** — deployments, migrations, config, dependency updates in the last 24–72h?

Write `01-hotfix.md` immediately:
```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
workflow-type: hotfix
status: complete            # or awaiting-input if a blocking answer is missing
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: [incident]
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "/wf shape <slug>"
---
```
Body: open with `## The Hotfix` — the story section (MUST follow `../_story-arc.md`; 1–2 short paragraphs — the problem inherited, the decisions with reasons, the top open risk; no "This hotfix implements…" opening) — then `## Symptom` (what/where/whom), `## Impact` (severity, affected scope, data risk), `## Acceptance Criteria` (≤2, each objectively verifiable; embed any inline question answers as italic notes — verify and review read the criteria from this lead, so a hotfix without them cannot pass its own quality tail; the incident is over when these are observably true, e.g. "checkout returns 200 for the repro request" + "no new occurrences of the error signature for 30 minutes"), `## Recent Changes` (or "none known"). The `## Diagnosis` section is appended after Step 2.

# Step 2 — Diagnose → `02-shape.md`
Launch parallel sub-agents to identify root cause. Do not proceed until both complete.

**Model for every dispatched agent:** `sonnet`. REQUIRED on every `Task` call — both agents do causal reasoning under time pressure (root-cause tracing across recent changes; blast-radius reasoning). Haiku is insufficient; Opus too slow.

### Explore sub-agent 1 — Root Cause Investigation
Prompt with ALL of: read the areas most likely to contain the bug; `git log --oneline -20` on affected files cross-referenced with the brief's "recent changes"; `git log --oneline --since="72 hours ago" -- <affected-path>`; grep for the symptom's exception names / error strings / failure patterns; check TODO/FIXME/HACK near the area; look for failing related tests; identify the **exact file(s)+line(s)** of origin. Report `file:line`, root-cause hypothesis (2–4 sentences), confidence (high/medium/low), supporting evidence.

### Explore sub-agent 2 — Impact & Scope
Prompt with ALL of: find every caller/consumer/dependent of the broken path (grep imports/references); check whether related components share the bug via shared code; identify any data that may have been corrupted during the active period; check whether the bug is on the production branch or only unreleased code. Report the complete affected file/path/service list, data risk (none/possible/confirmed), blast-radius summary.

Wait for both. If root-cause confidence is low, launch a focused third agent on the most likely hypothesis. **Confidence floor:** if confidence is still low after the third agent, do NOT write a guessed `## Root Cause` — climb the ladder instead: reproduce the symptom at runtime via `/wf probe <slug> "<the runtime question the diagnosis hinges on>"` (the finding lands as a compressed slice on this slug), or `/consult` a second model on the hypothesis, or hand to human triage. A hotfix built on a guess ships a second incident. Then **append `## Diagnosis`** (root cause + `file:line` evidence + scope) to `01-hotfix.md`, and write `02-shape.md` carrying the diagnosis-as-scope:
```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
status: complete
stage-number: 2
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
docs-needed: false
docs-types: []
tags: [incident]
refs:
  index: 00-index.md
  intake: 01-hotfix.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "/wf slice <slug>"
---
```
Body: `## Root Cause` (`file:line` + hypothesis + confidence), `## Blast Radius` (affected paths/services, data risk), `## In Scope` (the minimum change), `## Out of Scope` (everything else — the scope lock).

# Step 3 — Slice → `03-slice.md` (`type: slice-index`, one slice)
```yaml
---
schema: sdlc/v1
type: slice-index
slug: <slug>
status: complete
stage-number: 3
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
total-slices: 1
best-first-slice: <slug>
slices:
  - slug: <slug>
    status: defined
    complexity: <xs|s>
tags: [incident]
refs:
  index: 00-index.md
  shape: 02-shape.md
  next: 04-plan.md
next-command: wf-plan
next-invocation: "/wf plan <slug>"
---
```
Body (one line): "Single-slice incident fix."

# Step 4 — Plan → `04-plan.md`
A **minimal execution-ready plan**: aim for ≤5 steps and ≤3 files; every step directly addresses the root cause (no cleanup/refactor/improvement); include a **rollback** (exact revert command/steps); if data was corrupted, include a separate data-remediation step. When the plan genuinely needs more, that is a tripwire breach, not a schema violation — record it per `_change-mode-tail.md` and let the gate adjudicate.
```yaml
---
schema: sdlc/v1
type: plan
slug: <slug>
slice-slug: <slug>
status: complete
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-to-touch: <int>
metric-step-count: <int>
has-blockers: false
revision-count: 0
tags: [incident]
refs:
  index: 00-index.md
  slice: 03-slice.md
  next: 05-implement.md
next-command: wf-implement
next-invocation: "/wf implement <slug>"
---
```
Body: `## Steps` (each names file(s)+change+verification), `## Rollback` (exact revert), `## Data remediation` (if needed), `## Verification` (reproduce the symptom; regression suite; adjacent-path spot-check), `## Tripwire breaches` (only if any fired — per `_change-mode-tail.md`).

## Step — Write free narrative fragments
Author free narrative fragments for any artifact per the narrative-fragment tier of `_intake-context.md` (a root-cause flow or a before/after diagram tells an incident story well).

# Step 5 — Write `00-index.md` (conformant `type: index`)
Write the shared change-mode index template from [_change-mode-tail.md](_change-mode-tail.md) with the `hotfix` column values (branch `hotfix/<slug>` off the production branch; `stack.user-confirmed: false` per the stack policy). **Seed `intent-risks` from `## Impact`:** write two entries (`id: RIM-1`/`RIM-2`, `severity` from the incident severity, `status: open`) — one for the incident's user/data impact, one for the blast-radius or data-remediation risk — so handoff/ship must adjudicate the incident severity instead of inheriting a hardcoded-empty list. Then register the slug in `.ai/workflows/INDEX.md` per the tail.

# Step 6 — Gate before implement (MANDATORY)
Apply the gate per `_intake-context.md` and the family gate rules in [_change-mode-tail.md](_change-mode-tail.md) — decision recorded in `01-hotfix.md` on every branch; Escalate closes this slug and prints `/wf intake "<description>" from <slug>`. Given incident pressure you MAY auto-proceed when the fix is clearly minimal (≤3 files, root cause confidence high, no data risk).

# Step 7 — Hand off to the standard chain
On proceed, route to `/wf implement <slug>` → `/wf verify <slug>` → **`/wf review <slug> security`** (review defaults to the security rubric for hotfixes; always safe to run quickly) → `/wf handoff <slug>` (ship STOPs without its `readiness-verdict: ready` — an incident does not get to skip it) → `/wf ship <slug>` → `/wf retro <slug>` (retro auto-triggers its incident consult exactly for hotfixes — dropping it drops the incident learning).

Lead with a short **narrative** paragraph (the symptom, root cause, the minimal fix, the gate decision), then:
```
wf intake hotfix complete: <slug>
Branch: hotfix/<slug> (off <production-branch>)
Root cause: <file:line>
Plan: <N> steps · Files: <M> (≤3) · Data remediation: <yes|no>
Gate: <proceeded | adjusted | escalated | auto-proceeded (minimal)>
Next: /wf implement <slug>  →  /wf verify  →  /wf review <slug> security  →  /wf handoff  →  /wf ship  →  /wf retro
```

# Workflow rules
Apply the shared workflow rules in [_change-mode-tail.md](_change-mode-tail.md). Hotfix-specific: review defaults to the **security** rubric (auth, tokens, crypto, permissions) — `/wf review <slug> security` is always safe to run quickly; widen only if the change warrants it.
