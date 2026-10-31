# Implement — Reviews Mode (fix review findings)

Triggered when the last argument to `/wf implement` is literally `reviews`. It is the second argument without a slice, and the third argument after a slice. Examples: `/wf implement my-slug reviews` and `/wf implement my-slug auth-flow reviews`.

Reads the open review findings from the ledger `findings.yaml` ([../_findings-ledger.md](../_findings-ledger.md)), extracts all BLOCKER and HIGH findings (and MED if the user requests), then fixes them **in parallel** using write-isolated sub-agents (per [../_subagents.md](../_subagents.md)). The findings are independent by construction; only a patch-overlap conflict forces the conflicting pair back to serial.

Do this in order for reviews mode:
1. **Resolve the scope.** When `review-scope` in `00-index.md` is `per-slice`, resolve the slice-slug: a slice-slug passed as a third argument (for example `/wf implement my-slug auth-flow reviews`), else `selected-slice` from `00-index.md`, else ask the user. Otherwise the scope is the whole work packet.
2. **Read the open findings** with `node "<skill-dir>/scripts/wf.mjs" findings list "<root>" <slug> --source review --open --json`, with `--slice <slice-slug>` in per-slice mode. Skip a finding with `changes-acceptance: true` that has no live answer (`wf.mjs decide answered --key finding:<id>`): it is a question for the person.
3. **Extract the findings list.** Build an ordered list sorted by severity (BLOCKER first, then HIGH, then MED if requested). Each finding has: ID, source review command, severity, file:line, issue description, suggested fix.
4. **Track the findings in a work-tracking checklist**: one item per finding plus the ledger update and the atomic commit; keep statuses truthful as fixes land.
5. **Present the findings list** to the user before starting:
   ```
   ## Review Findings to Fix ({N} total)
   1. [{ID}] {SEVERITY} — {title} @ {file}:{line}
   2. [{ID}] {SEVERITY} — {title} @ {file}:{line}
   ...
   Starting parallel fixes...
   ```
6. **Dispatch ALL finding fixes in parallel, one sub-agent per finding** (one parallel wave), each at **medium** effort with write isolation per [../_subagents.md](../_subagents.md) (required; the effort tier follows [../_fix-loop.md](../_fix-loop.md) rule 3) so concurrent patches cannot collide in the shared tree. Send each sub-agent the prompt of [../_fix-prompt.md](../_fix-prompt.md). Fill `Source` with the `dimension` of the finding.
   a. **As each sub-agent completes, verify its fix (the merge gate):** read its `Method:` line and self-check first. Then read the changed file(s), confirm the fix addresses the finding and the suggested method ([../_fix-loop.md](../_fix-loop.md) rule 5), and check for regressions before merging its patch into the shared tree.
   b. **On a patch-overlap conflict** (two fixes touch the same lines), fall back to serial for the conflicting pair only: merge one, re-dispatch the other against the merged state.
   c. If a fix failed or was partial, record `COULD NOT FIX: <reason>` on its checklist item.
7. **After all findings are processed:**
   a. Write the draft of `05-implement-<slice-slug>.md` with a `## Review Fixes Applied` section listing all findings and resolution status. To update an existing record, get it with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> 05-implement-<slice-slug>.md` and change it. Write the draft to `.ai/workflows/<slug>/.draft/05-implement-<slice-slug>.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` ([_records.md](../_records.md)).
   b. Update the `05-implement.md` master index: get it, change it, write the draft and put it.
   c. **Record each outcome in the ledger** with `wf.mjs findings set <id> fixed` or `wf.mjs findings set <id> could-not-fix --reason "<reason>"`. Then write the draft of the review record (`07-review.md`, or `07-review-<slice-slug>.md` in per-slice mode) whole from the ledger and put it, per `review/_stage.md` Step 5.
   d. Update the index fields with one `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index key=value ...` call.
   e. **Atomic commit (if `branch-strategy` is `dedicated` or `shared`):** stage by path and fail closed on any other dirty path, per the commit rule of [../_workflow-rules.md](../_workflow-rules.md). Commit as `<type>: <what the fix does>` ([_steps.md](_steps.md)). Record the commit SHA. No push. If `branch-strategy` is `none`, skip the commit.
8. **Evaluate adaptive routing.** Write ALL viable options into the record's `recommended-routes`:
   - **Option A (default): Re-verify** → `/wf verify <slug> <slice-slug>` when fixes were applied. Compact recommended: review-fix context is noise for re-verification.
   - **Option B: Re-review** → `/wf review <slug> <slice-slug>` when some findings could not be fixed and need re-assessment. Compact recommended: a fresh review needs clean context.
   - **Option C: Ship** → `/wf ship <slug>` when all findings were fixed and the change was already verified.
