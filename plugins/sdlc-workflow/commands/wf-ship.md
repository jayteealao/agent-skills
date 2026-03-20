---
name: wf-ship
description: Assess release readiness, ask mandatory rollout questions, and define rollout plus rollback.
argument-hint: <slug> [target-or-slice]
disable-model-invocation: true
---

You are running `wf-ship`, **stage 9 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → `9·ship` → 10·retro

| | Detail |
|---|---|
| Requires | `08-handoff.md` (recommended) or at minimum `05-implement.md` |
| Produces | `09-ship.md` |
| Next | `/wf-retro <slug>` (if ready) or `/wf-implement <slug> <slice>` (if blockers need code changes) |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT actually deploy, push, merge, or run release commands.
- Do NOT fix code — if blockers require code changes, recommend returning to `/wf-implement`.
- Your job is to **assess release readiness, ask rollout questions, and define rollout/rollback plans**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start deploying or fixing code, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **target or slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - At minimum `05-implement.md` must exist. `08-handoff.md` is strongly recommended. If neither exists → STOP. Tell the user which command to run first.
   - If `08-handoff.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve it first.
   - If `current-stage` in the index is already past ship → WARN: "Stage 9 (ship) has already been completed. Running it again will overwrite `09-ship.md`. Proceed?"
4. **Read** `08-handoff.md` (if exists), `05-implement.md`, `07-review.md` (if exists), and `po-answers.md`.
5. **Resolve the slice/target**: If a second argument was passed, use it. If not, use `selected-slice-or-focus` from the index.
6. **Carry forward** `open-questions` from the index.

# Parallel research (use sub-agents when supported)
Ship decisions often need current external information. Launch parallel sub-agents:
- **Web research sub-agent 1:** Check deployment target for current advisories, outages, version requirements, or breaking changes.
- **Web research sub-agent 2:** Check external dependencies for new security advisories or known issues since the plan was written.
- **Explore sub-agent:** Scan the repo's CI/CD config, deployment scripts, and release infrastructure to confirm the rollout plan is feasible.
- Do not spin up sub-agents for simple internal deployments.

# Purpose
Assess release readiness, ask mandatory rollout questions, and define rollout plus rollback.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- Prefer AskUserQuestion for PO interaction; fall back to numbered chat questions. Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

**This is a mandatory-question stage.** Do not finalize until the required questions are asked.

Do this in order:
1. Ask the product owner or release owner the minimum required rollout questions:
   - target environment and release window
   - rollout preference: immediate, staged, canary, feature flag, maintenance window
   - rollback tolerance and business risk
   - whether there are stakeholder communication or compliance requirements
2. Capture answers in `po-answers.md`.
3. Run freshness research (using parallel sub-agents if multi-domain) on deployment target, platform changes, vendor advisories, current release notes, migration notes, and known incidents that affect release readiness.
4. Produce a release-readiness assessment with rollout and rollback guidance.
5. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
6. Update `00-index.md` accordingly.
7. Write `.ai/workflows/<slug>/09-ship.md`.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the ship assessment and present the user with ALL viable options:

**Option A (default): Retro** → `/wf-retro <slug>`
Use when: Ship is approved (Go). The work is deployed or ready to deploy. Close out with a retrospective.

**Option B: Fix and re-implement** → `/wf-implement <slug> <selected-slice>`
Use when: Ship assessment found blockers that require code changes.

**Option C: Re-verify** → `/wf-verify <slug> <selected-slice>`
Use when: Ship assessment found that verification evidence is stale or insufficient.

**Option D: Blocked — re-run ship** → `/wf-ship <slug>`
Use when: Required rollout answers are still missing. Mark `Status: Awaiting input`.

**Option E: Next slice** → `/wf-plan <slug> <next-slice>` or `/wf-implement <slug> <next-slice>`
Use when: This slice shipped but there are more slices. Retro can wait until all slices ship.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `09-ship.md` with this structure:

```yaml
---
schema: sdlc/v1
type: ship
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 9
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
go-nogo: <go|no-go|conditional-go>
rollout-strategy: <immediate|staged|canary|feature-flag|maintenance-window>
tags: []
refs:
  index: 00-index.md
  handoff: 08-handoff.md
  review: 07-review.md
next-command: wf-retro
next-invocation: "/wf-retro <slug>"
---
```

# Ship

## Questions Asked This Stage
- ...

## Answers Captured This Stage
- ...

## Release Readiness

## Key Release Risks
- ...

## Preconditions
- ...

## Recommended Rollout Strategy
- ...

## Post-Deploy Validation
- ...

## Rollback Triggers
- ...

## Rollback Plan
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Go / No-Go Recommendation

## Recommended Next Stage
- **Option A (default):** `/wf-retro <slug>` — Go [reason]
- **Option B:** `/wf-implement <slug> <slice>` — fix blockers [reason, if applicable]
- **Option C:** `/wf-ship <slug>` — blocked, re-run when answers available [reason, if applicable]
