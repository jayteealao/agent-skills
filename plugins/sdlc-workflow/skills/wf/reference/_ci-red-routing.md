# CI-red routing and review settle

Handoff steps 7a and 7d apply this file when the `## CI watch procedure` in [_pr-ci-handoff.md](_pr-ci-handoff.md) returns **red**, and after it returns **green**. The orchestrator never edits code here: it dispatches a diagnosis, routes by class, asks one gate question, and dispatches a fix.

## On CI red — diagnose-only sub-agent, then ask (do not auto-fix)

1. **Dispatch ONE read-only diagnosis sub-agent** at **medium** effort per [_subagents.md](_subagents.md); the effort is REQUIRED on the dispatch, because diagnosis must not inherit the parent configuration. Prompt it with the failing check names and these instructions: pull the failing logs (`gh pr checks <pr-number>`, `gh run view <run-id> --log-failed`), read the implicated source, and return a structured diagnosis ONLY — apply no edits, run no fixes, create no commits. Required return fields:
   - `root-cause` (one paragraph)
   - `proposed-fix` (file:line + the change, and **the method** — if the right cure is "regenerate", say so and say what must not be hand-patched)
   - `confidence` (high/med/low)
   - `class` (`product-bug` | `flaky-or-infra` | `preexisting-unrelated`)
   - **`converges` (`yes` | `no` | `unknown`)** — *does repeating this fix finish?* Answer `no` when the failure's own structure means one application resolves only part of it: a first-mismatch abort inside a matrix loop fixes one variant per round; a gate reading a database that changes between runs cannot be converged by patching the repo. `converges: no` is not a harder version of `flaky-or-infra` — the Roborazzi golden loop was **both**, and they needed opposite answers (re-running would never finish; the structural answer was a re-record path).

   The sub-agent keeps the full log dump out of the orchestrator context; only its compact diagnosis returns.

2. **Route by class before offering a round.** A counter that treats every red alike once counted a formatter miss, a CVE database that published between runs, and a structurally non-convergent golden loop as the same event.
   - **`converges: no`** — do **not** offer another patch round at all. Repeating provably does not finish ("the token sheet alone could take ~14 more rounds"). Go straight to the structural options: re-record / regenerate path, tolerance or threshold change, scope reduction, or accepting the check as non-required with a recorded justification.
   - **`flaky-or-infra` with an externally-moving gate** (an advisory feed, a live registry, a time-dependent check) — do not spend a patch round chasing a moving target. Offer the structural options directly: severity floor, tolerance, pinning, or suppression with justification. One project's `dependency-audit` reached the right answer — a CVSS ≥ 7.0 gate — only after three patch rounds chasing a database that was changing underneath them.
   - **`flaky-or-infra`, self-contained** — the re-run path (item 6) is legitimate.
   - **`product-bug`** — the normal apply→push→re-watch path. With the local pre-push gate in place these are rare on the first CI round. When one appears anyway, note in the artifact whether a local gate would have caught it; that note is the feedback loop that tunes `pre-push-checks`.
   - **`preexisting-unrelated`** — surface it as a caveat; it is not this PR's round to spend.

3. **Surface the diagnosis to the user** as a gate question per [_gate-question.md](_gate-question.md). Build the option list from the routing above — omit "Apply proposed fix" when `converges: no`, and lead with the structural option when the class calls for it:
   ```yaml
   question: "CI failed: <check names> (class: <class>, converges: <yes|no|unknown>). The diagnosis proposes <one-line>. How should we proceed?"
   header: "CI failure"
   options:
     - { label: "Apply proposed fix",   description: "Route the fix to a fix subagent, push, and re-watch CI. (Omitted when converges: no.)" }
     - { label: "Structural fix",       description: "<the named structural option: re-record path / severity floor / tolerance / justified suppression>. Does not consume a fix round." }
     - { label: "Treat as flaky — re-run", description: "Re-run the failed checks (`gh run rerun <run-id> --failed`) and re-watch. Only for a self-contained flaky-or-infra red." }
     - { label: "Stop — block handoff",  description: "Record the failure; set readiness-verdict: blocked and STOP." }
   multiSelect: false
   ```
4. **Apply proposed fix** → dispatch ONE **fix sub-agent** at **medium** effort per [_subagents.md](_subagents.md) with the prompt in `## Fix-subagent contract` ([_pr-ci-handoff.md](_pr-ci-handoff.md)), passing the diagnosis's `proposed-fix` **and its prohibitions unchanged**. It applies the minimal fix, commits `fix(<slug>): resolve CI failure — <short>`, and returns its `Method:` line plus the commit SHA. Check the method before pushing (`_fix-loop.md` rule 5). Then `git push origin <branch>` and re-run the CI watch procedure.
5. **Budget by class, not by count.** `ci-watch.max-fix-rounds` bounds **`product-bug` rounds only**. A `flaky-or-infra` red, a `converges: no` red, and a `preexisting-unrelated` red do not consume the budget — they consume a *decision*; a counter that treats them alike pushes the user to spend rounds on things rounds cannot fix. Local pre-push rounds do not consume it either. Increment `ci-watch-fix-rounds` for every round and record `ci-fix-rounds-by-class:` so the artifact shows where the time went.
6. **Re-run** → `gh run rerun <run-id> --failed`, then re-run the watch procedure (does not count against `max-fix-rounds`; cap re-runs at 2 to avoid masking a real failure).
   - **Before proposing "dispatch workflow X", check it exists on the base branch.** GitHub only dispatches `workflow_dispatch` workflows registered on the **default branch**, so a recovery workflow this PR itself added cannot be dispatched by this PR — `gh workflow run` returns `HTTP 404: workflow not found on the default branch`. Verify first:
     ```bash
     git show origin/<base-branch>:.github/workflows/<file> >/dev/null 2>&1
     ```
     Absent → do **not** dispatch into a 404. Present the default-branch-landing options instead: land the workflow on the base branch first (its own small PR), reproduce its effect locally, or take the throwaway-commit path — and say plainly that the branch's own recovery hatch is not available to it yet.
7. **Stop — block** → record `ci-watch-conclusion: red`, `live-checks-failing: [<names>]`, set `readiness-verdict: blocked`, and write the artifact. Recommend `/wf implement <slug> <slice>` in the routing options.
8. **On exceeding the budget, name what it cost.** The `awaiting-input` message states **which classes remain open** and **what the structural fix would be** for each — not merely "the fix-round bound was reached". An authorization ask that carries the decision is worth answering; one that asks for another round of the same thing is how three rounds got spent on a moving database.

## Settle reviews (bounded — bots only, never block on humans)

Once CI is green, loop on `review-settle.poll-interval-seconds` until every login in the effective `review-bots` list (default list in `handoff/_pr-triage.md`) has posted at least one review/thread OR `review-settle.settle-minutes` elapses — whichever comes first. Record `bot-reviews-landed: [<logins that posted>]` and `review-settle-elapsed-seconds: <N>`. Do not wait on human reviewers; a missing required human approval is `awaiting-input` at handoff T5.3.

**Distinguish "slow" from "declined".** A configured bot that posts a skip/limit notice — "this PR exceeds the N-file limit", "review skipped", a rate-limit or quota message — has **declined**, not lagged, and waiting out the settle window on it learns nothing. Scan the PR's comments for such a notice from each configured bot and record `bot-review-status:` per login (`landed` | `declined: <reason>` | `absent`). A `declined` bot is a readiness **caveat**, surfaced in `## Reviewer Focus Areas` and in the PR body — never counted as a settled review. A large PR silently losing its automated reviewer is exactly the case where a human reviewer most needs to know they are the only one looking; one 100+-file PR was skipped entirely and nothing in the run said so.
