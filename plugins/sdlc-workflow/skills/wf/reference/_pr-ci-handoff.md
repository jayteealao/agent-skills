# Shared PR/CI handoff machinery (loaded on demand by `handoff.md`)

This file carries the GitHub-conditional machinery of `/wf handoff`: the CI watch procedure (T5.0/T5.3) and the fix-subagent contract (7a CI-red + 7b triage). The PR comment triage loop (T5.1, step 7b) is in [handoff/_pr-triage.md](handoff/_pr-triage.md). `handoff.md` instructs you to read this file **in full** the moment the PR/CI path is active (`branch-strategy` is `dedicated`/`shared` AND a `pr-number` is recorded). A local-branch handoff (`branch-strategy: none`) never loads it. Once loaded, follow every section below exactly; the same fidelity rules as the parent reference apply.

# CI watch procedure (shared by T5.0 and T5.3)

A **bounded poll loop** that drives the PR's checks to a terminal state. It is the piece the old one-shot `gh pr view` lacked. Idempotent and resumable: re-invoking handoff re-enters the loop against whatever the current check state is.

Inputs: `pr-number`; `ci-watch.poll-interval-seconds` (default 30); `ci-watch.max-wait-minutes` (default 30). The wall-clock bound is the user's hard ceiling; never exceed it silently.

1. **Read current state:** `gh pr view <pr-number> --json statusCheckRollup`. Partition `.statusCheckRollup[]`:
   - **pending** — `status` ∈ {`QUEUED`, `IN_PROGRESS`, `PENDING`, `WAITING`} (or `state` ∈ {`PENDING`, `EXPECTED`} for legacy commit-status contexts).
   - **failed** — terminal-failed: `conclusion` ∈ {`FAILURE`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`, `STARTUP_FAILURE`} (or `state: FAILURE`/`ERROR`).
   - **passed** — terminal-ok: `conclusion` ∈ {`SUCCESS`, `NEUTRAL`, `SKIPPED`} (or `state: SUCCESS`).
2. **Decide:**
   - any **failed** → return **red** (with the failed check names). Stop watching; a red check will not go green on its own.
   - no failed AND no pending → return **green**.
   - else (some pending, none failed) → if the elapsed wall-clock since the watch started ≥ `max-wait-minutes`, return **timed-out** (with the pending names); otherwise `sleep <poll-interval-seconds>` and go to step 1.
3. Prefer `gh pr checks <pr-number> --watch --interval <poll-interval-seconds>` when available (it blocks until checks finish and exits non-zero on failure), but still enforce the `max-wait-minutes` ceiling around it: run it under a timeout; on timeout, fall back to the snapshot decision in step 2. The hand-rolled poll in steps 1–2 is the portable fallback and the source of truth for the partition rules.

Record `ci-watch-rounds: <N polls>` and the terminal outcome in handoff frontmatter (`ci-watch-conclusion`). Never report `green` off a snapshot that still contains pending checks; that is precisely the bug this procedure exists to prevent.

# Fix-subagent contract (shared by 7a CI-red and 7b triage)

Every code fix in handoff is delegated to a subagent so the orchestrator context stays clean and the orchestrator-discipline rule (no code changes by the orchestrator) holds. This contract conforms to the shared fix-loop invariants in [_fix-loop.md](_fix-loop.md). Dispatch ONE sub-agent per fix at **medium** effort per [_subagents.md](_subagents.md), required on every dispatch (the effort pin follows [_fix-loop.md](_fix-loop.md) rule 3):

- `description`: 3–5 words, for example `"fix CI failure"` or `"fix review thread"`.
- `prompt`: self-contained; include the exact target and these rules:
  ```
  Apply the following fix in this repository:

  Location: <file:line-range>
  Problem:  <root cause / thread body>
  Proposed fix: <the change to make>
  Prohibitions in the proposed fix: <copy unchanged any "do not …" / "regenerate,
    don't patch" clause the diagnosis stated — or "none">

  Read the file(s) at the location. Apply the MINIMAL change that resolves
  the problem — do not refactor, reformat, or touch anything unrelated.
  Do not broaden scope beyond this one item.

  The proposed fix names a METHOD, not just an outcome. Follow the method.
  If you conclude the prescribed method is wrong or impossible, you may
  deviate — but you must SAY SO FIRST, in the required field below. A
  deviation disclosed at the bottom of a report that opens with "confirmed"
  is a deviation that will be missed.

  Self-check before returning — run this command and report its exit status:
    <the narrowest gate the orchestrator passed in; see "Self-check" below>
  A non-zero exit means you did not finish. Fix it, or return COULD NOT FIX.

  Then commit ONLY the files you changed:
    git commit -m "<the commit message the orchestrator gave you>"

  Return ONLY, and in this order — the first line is mandatory:
    Method: as-prescribed | deviated
    (if deviated) What the proposed fix said / what you did instead / why.
    Self-check: <command> → exit <N>
    Commit: <sha from `git rev-parse HEAD`>
    Files: <list>
    Confirmed: yes | no
  Paste no diffs or full file contents back.
  ```

**Self-check is a command, not a promise.** "No new lint/type errors" is unenforceable as prose; a fix agent once introduced a detekt `ReturnCount` violation while satisfying it, and the violation went out in the push. So the orchestrator passes a real command:
- When `pre-push-checks:` is configured (`handoff.md` `## Project-level handoff config`), pass the check(s) whose scope covers the fix's files.
- Absent that config, pass the narrowest gate the fix's own file type implies: the repo's formatter for a formatting fix, its linter for the language of the edited file, the single test file for a test fix.
- If nothing narrow exists, say so explicitly in the prompt (`Self-check: none available — state what you verified by hand`) rather than leaving the line to be answered decoratively.

**`Method: deviated` is never auto-accepted.** The orchestrator surfaces it to the user *before* the push, quoting the diagnosis's own words next to what the subagent actually did (rule 5 in [_fix-loop.md](_fix-loop.md)). When the diagnosis carried an explicit prohibition and the deviation touches it, that is a **hard stop**: one round-1 diagnosis said, in its own words, "do not hand-add the 3 missing hashes — regenerate so nothing else is missed"; the subagent hand-added 13 lines, disclosed it in a trailing note, opened with "Fix confirmed: yes", and round 2 hit exactly the predicted next trio.

The subagent commits but does **not** push; the orchestrator pushes once after a batch (triage step 7) so a single CI run covers all fixes in the iteration. After the subagents return, the orchestrator re-runs the `## CI watch procedure` to confirm the fixes are green (in T5.3).
