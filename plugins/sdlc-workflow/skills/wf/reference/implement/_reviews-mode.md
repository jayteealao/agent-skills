# Implement — Reviews Mode (fix review findings)

Triggered when the second argument to `/wf implement` is literally `reviews`. Example: `/wf implement my-slug reviews`.

Reads findings from `07-review-<slice-slug>.md`, extracts all BLOCKER and HIGH findings (and MED if the user requests), then fixes them **in parallel** using write-isolated sub-agents (per [../_subagents.md](../_subagents.md)). The findings are independent by construction; only a patch-overlap conflict forces the conflicting pair back to serial.

Do this in order for reviews mode:
1. **Resolve the slice-slug.** If a slice-slug was passed as a third argument (for example `/wf implement my-slug auth-flow reviews`), use it. Otherwise use `selected-slice-or-focus` from `00-index.md`. If neither is set, ask the user.
2. **Read `07-review-<slice-slug>.md`** and all `07-review-<slice-slug>-<command>.md` for that slice. Other slices' review files are out of scope.
3. **Extract the findings list.** Build an ordered list sorted by severity (BLOCKER first, then HIGH, then MED if requested). Each finding has: ID, severity, file:line, issue description, suggested fix.
4. **Track the findings in a work-tracking checklist**: one item per finding plus the ledger update and the atomic commit; keep statuses truthful as fixes land.
5. **Present the findings list** to the user before starting:
   ```
   ## Review Findings to Fix ({N} total)
   1. [{ID}] {SEVERITY} — {title} @ {file}:{line}
   2. [{ID}] {SEVERITY} — {title} @ {file}:{line}
   ...
   Starting parallel fixes...
   ```
6. **Dispatch ALL finding fixes in parallel, one sub-agent per finding** (one parallel wave), each at **medium** effort with write isolation per [../_subagents.md](../_subagents.md) (required; the effort tier follows [../_fix-loop.md](../_fix-loop.md) rule 3) so concurrent patches cannot collide in the shared tree. For each sub-agent, use this prompt:
      ```
      Fix the following review finding in the codebase:

      Finding ID: {ID}
      Severity: {severity}
      Location: {file}:{line-range}
      Issue: {issue description}
      Suggested Fix: {fix suggestion}

      Read the file(s) at the specified location. Apply the minimal fix that resolves the issue without introducing new problems. Change nothing beyond what is needed for this finding.

      After fixing, verify:
      - The fix addresses the specific issue described
      - No new lint/type/test failures introduced
      - Surrounding code still makes sense

      Return a brief summary of what you changed and whether the fix is confirmed correct.
      ```
   a. **As each sub-agent completes, verify its fix (the merge gate):** read the changed file(s), confirm the fix addresses the finding, and check for regressions before merging its patch into the shared tree.
   b. **On a patch-overlap conflict** (two fixes touch the same lines), fall back to serial for the conflicting pair only: merge one, re-dispatch the other against the merged state.
   c. If a fix failed or was partial, record `COULD NOT FIX: <reason>` on its checklist item.
7. **After all findings are processed:**
   a. Write or update `05-implement-<slice-slug>.md` with a `## Review Fixes Applied` section listing all findings and resolution status.
   b. Update the `05-implement.md` master index.
   c. **Update `07-review-<slice-slug>.md` (accumulating ledger: edit in place, never overwrite).** Set each finding's `status` (`fixed` / `could-not-fix`) and `fixed-at` in `## All Findings`, `## Findings (Detailed)`, and the sibling `.yaml`. Update its row in the `## Fix Status` ledger (one row per finding, keyed by ID; update in place, never start a new round table):
      ```
      ## Fix Status
      | ID | Sev | Source | Status | Fixed-at | Commit | Notes |
      |----|-----|--------|--------|----------|--------|-------|
      | {ID} | {sev} | {command} | fixed / could-not-fix | {fixed-at} | {SHA or —} | {notes} |
      ```
   d. Update `00-index.md`.
   e. **Atomic commit (if `branch-strategy` is `dedicated` or `shared`):** stage by explicit path, classified exactly as mainline Step 13 in `implement.md` (slice code by path, workflow artifacts by path, unknown dirty paths fail closed; `git add -A` and pathless `git add` are forbidden). Commit `fix(<slug>): review fixes for <slice-slug>`. Record the commit SHA. No push. If `branch-strategy` is `none`, skip the commit.
8. **Evaluate adaptive routing** and present ALL viable options:
   - **Option A (default): Re-verify** → `/wf verify <slug> <slice-slug>` when fixes were applied. Compact recommended: review-fix context is noise for re-verification.
   - **Option B: Re-review** → `/wf review <slug> <slice-slug>` when some findings could not be fixed and need re-assessment. Compact recommended: a fresh review needs clean context.
   - **Option C: Handoff** → `/wf handoff <slug> <slice-slug>` when all findings were fixed and the change was already verified.
