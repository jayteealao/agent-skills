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
- Do NOT fix code — if blockers require code changes, recommend returning to `/wf-implement`.
- Your job is to **assess release readiness, ask rollout questions, define rollout/rollback plans, and — if approved — rebase and merge the PR**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts, the merge action (if approved), and the compact chat summary defined below.
- If you catch yourself about to start fixing code or deploying beyond the merge, STOP and return to the next unfinished workflow step.

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
- **Use AskUserQuestion** for multiple-choice PO questions (rollout strategy, merge strategy, go/no-go). Use freeform chat for open-ended questions (environment details, rollback tolerance, stakeholder requirements). Append every answer to `po-answers.md` with timestamp and stage.
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
1. **Read branch strategy** from `00-index.md` frontmatter: `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`.
2. **Create task list.** Use TaskCreate for the ship sequence. All metadata: `{ slug, stage: "ship", slice: "<slice-slug>" }`.
   - T1: `subject: "Ask rollout questions"`, `activeForm: "Asking rollout questions"`.
   - T2: `subject: "Run freshness research"`, `activeForm: "Researching release readiness"`, `addBlockedBy: ["T1"]`.
   - T3: `subject: "Write release readiness assessment"`, `activeForm: "Writing readiness assessment"`, `addBlockedBy: ["T2"]`.
   - T4: `subject: "Get go/no-go confirmation"`, `activeForm: "Awaiting go/no-go"`, `addBlockedBy: ["T3"]`.
   - If `branch-strategy` is `dedicated`, also create the merge chain:
     - T5: `subject: "Rebase <branch> onto <base-branch>"`, `activeForm: "Rebasing onto <base-branch>"`, `addBlockedBy: ["T4"]`.
     - T6: `subject: "Verify CI passes"`, `activeForm: "Checking CI status"`, `addBlockedBy: ["T5"]`.
     - T7: `subject: "Merge PR #<N>"`, `activeForm: "Merging pull request"`, `addBlockedBy: ["T6"]`.
     - T8: `subject: "Clean up branch"`, `activeForm: "Cleaning up branch"`, `addBlockedBy: ["T7"]`.
   - TN: `subject: "Write 09-ship.md"`, `activeForm: "Writing ship artifact"`, `addBlockedBy: [last task in chain]`.
3. Mark T1 `in_progress`. Ask rollout questions using AskUserQuestion for structured choices, freeform for the rest.
   **Structured questions (AskUserQuestion call 1):**
   ```
   Question 1:
     question: "What rollout strategy should we use?"
     header: "Rollout"
     options:
       - label: "Immediate (Recommended)"
         description: "Deploy as soon as merged. Standard for most changes."
       - label: "Staged"
         description: "Roll out incrementally (e.g., 10% → 50% → 100%)."
       - label: "Canary"
         description: "Deploy to a canary environment first, promote after validation."
       - label: "Feature flag"
         description: "Deploy code but gate behind a feature flag. Enable separately."
     multiSelect: false

   Question 2 (only if branch-strategy is dedicated):
     question: "What merge strategy should we use for the PR?"
     header: "Merge"
     options:
       - label: "Rebase and merge (Recommended)"
         description: "Rebase onto base branch, linear history. Default for most workflows."
       - label: "Squash and merge"
         description: "Squash all commits into one. Good for noisy commit histories."
       - label: "Merge commit"
         description: "Create a merge commit preserving all individual commits."
     multiSelect: false
   ```
   **Freeform questions (in chat):**
   - Target environment and release window
   - Rollback tolerance and business risk
   - Stakeholder communication or compliance requirements
   Capture ALL answers in `po-answers.md`. Mark T1 `completed`.
4. Mark T2 `in_progress`. Run freshness research (using parallel sub-agents if multi-domain) on deployment target, platform changes, vendor advisories, current release notes, migration notes, and known incidents that affect release readiness. Mark T2 `completed`.
5. Mark T3 `in_progress`. Produce a release-readiness assessment with rollout and rollback guidance. Mark T3 `completed`.
6. Mark T4 `in_progress`. **Go/no-go decision (AskUserQuestion):**
   ```
   Question:
     question: "Based on the readiness assessment, what is the go/no-go decision?"
     header: "Go/No-Go"
     options:
       - label: "Go"
         description: "Proceed with merge and deployment. All checks pass, risks accepted."
       - label: "Conditional go"
         description: "Proceed, but with caveats or additional monitoring requirements."
       - label: "No-go"
         description: "Do not merge. Return to fix blocking issues first."
     multiSelect: false
   ```
   Mark T4 `completed`.
7. **Rebase and merge (if `branch-strategy` is `dedicated` AND go-nogo is `go` or `conditional-go`):**
   a. Mark T5 `in_progress`. **Ask for explicit confirmation** before merging: "Ready to rebase `<branch>` onto `<base-branch>` and merge. Proceed? (yes/no)"
   b. If confirmed:
      - Fetch latest base: `git fetch origin <base-branch>`.
      - Rebase onto base: `git rebase origin/<base-branch>`.
        - If rebase conflicts → `TaskUpdate(T5, description: "FAILED: rebase conflicts in <files>")`, mark T5 `completed`. STOP. Report the conflicting files. Recommend `/wf-implement <slug> <slice>` to resolve. Downstream tasks (T6–T8) stay pending/blocked. Set `go-nogo: no-go` with reason.
      - Force-push the rebased branch: `git push --force-with-lease origin <branch>`.
      - Mark T5 `completed`.
   c. Mark T6 `in_progress`. Check PR CI status: `gh pr checks <pr-number>`. If checks are failing → WARN and ask whether to proceed anyway. If not proceeding: `TaskUpdate(T6, description: "FAILED: CI checks failing")`, mark T6 `completed`. STOP. Otherwise mark T6 `completed`.
   d. Mark T7 `in_progress`. Merge the PR using the chosen strategy:
      - rebase-and-merge: `gh pr merge <pr-number> --rebase`
      - squash-and-merge: `gh pr merge <pr-number> --squash`
      - merge commit: `gh pr merge <pr-number> --merge`
      Record `merge-sha` (from `git rev-parse HEAD` after merge) and `merge-strategy` in frontmatter. Mark T7 `completed`.
   e. Mark T8 `in_progress`. Clean up: `git branch -d <branch>` (local). Mark T8 `completed`.
   f. If NOT confirmed or go-nogo is `no-go`: `TaskUpdate(T5..T8, status: "deleted")`. The PR stays open. Note this in the ship file.
   - If `branch-strategy` is `shared`: Do NOT merge. `TaskUpdate(T5..T8, status: "deleted")` (if they were created). Note in ship file that the user manages merging.
   - If `branch-strategy` is `none`: Skip all git operations. No merge tasks were created.
8. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
9. Update `00-index.md` accordingly.
10. Mark "Write 09-ship.md" task `in_progress`. Write `.ai/workflows/<slug>/09-ship.md`. Mark `completed`.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the ship assessment and present the user with ALL viable options:

**Option A (default): Retro** → `/wf-retro <slug>`
Use when: Ship is approved (Go). The work is deployed or ready to deploy. Close out with a retrospective.

**Option B: Fix and re-implement** → `/wf-implement <slug> <selected-slice>`
Use when: Ship assessment found blockers that require code changes, OR rebase had conflicts that need resolution.

**Option C: Re-verify** → `/wf-verify <slug> <selected-slice>`
Use when: Ship assessment found that verification evidence is stale or insufficient.

**Option D: Blocked — re-run ship** → `/wf-ship <slug>`
Use when: Required rollout answers are still missing, OR merge was declined and needs to be retried later. Mark `Status: Awaiting input`.

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
merge-strategy: <rebase|squash|merge|none>
merge-sha: "<sha or empty if not merged>"
branch: "<branch name>"
base-branch: "<target branch>"
pr-url: "<url>"
pr-number: <N>
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
