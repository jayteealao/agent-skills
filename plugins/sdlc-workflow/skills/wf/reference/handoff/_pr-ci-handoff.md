# Shared PR/CI handoff machinery (loaded on demand by `handoff.md`)

This file carries the GitHub-conditional machinery of the PR phase of `/wf ship`: the CI watch procedure (T5.0/T5.3) and the fix-subagent contract (7a CI-red + 7b triage). The PR comment triage loop (T5.1, step 7b) is in [handoff/_pr-triage.md](_pr-triage.md). `handoff.md` instructs you to read this file **in full** the moment the PR/CI path is active (`branch-strategy` is `dedicated`/`shared` AND a `pr-number` is recorded). A local-branch handoff (`branch-strategy: none`) never loads it. Once loaded, follow every section below exactly; the same fidelity rules as the parent reference apply.

# The host's PR monitor

A host can have its own PR monitor, which fixes CI and answers review comments by itself. The "PR monitor" row of [_host-surfaces.md](../_host-surfaces.md) names it and its tools. Its default can tell a session to offer the monitor after it opens a PR, and not to poll CI. The person who runs ship asks for the PR phase's own CI watch and comment triage, so this phase keeps both:

1. Let the host show the PR, as the row says.
2. Do not offer, ask about, or turn on the host's PR monitor: not in a gate question, not in a wrap-up question or button, and not in a closing line. The monitor skips the diagnose-then-ask rule of [_ci-red-routing.md](_ci-red-routing.md) and the triage table, and a second fixer pushes to the same branch. When the monitor is already on for the PR, leave it on, and say once in the handoff report that it also acts on this PR.
3. Run the `## CI watch procedure` below in one CI-watch sub-agent. Do not hand the watch to the host.

# CI watch procedure (shared by T5.0 and T5.3)

A **bounded poll loop** that drives the PR's checks to a terminal state. Idempotent and resumable: re-invoking handoff re-enters the loop against whatever the current check state is. Run the loop in ONE read-only CI-watch sub-agent at **low** effort per [_subagents.md](../_subagents.md). The sub-agent runs steps 1–3, edits nothing, and returns only the outcome (`green`, `red` or `timed-out`), the failed or pending check names, and the poll count. The watch can take up to `max-wait-minutes`. Wait for the sub-agent's result before the next handoff step, and do not ask the person about CI while the watch runs.

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

Every code fix in handoff is delegated to a subagent so the orchestrator context stays clean and the orchestrator-discipline rule (no code changes by the orchestrator) holds. This contract conforms to the shared fix-loop invariants in [_fix-loop.md](../_fix-loop.md). Dispatch ONE sub-agent per fix at **medium** effort per [_subagents.md](../_subagents.md), required on every dispatch (the effort pin follows [_fix-loop.md](../_fix-loop.md) rule 3):

- `description`: 3–5 words, for example `"fix CI failure"` or `"fix review thread"`.
- `prompt`: the prompt of [_fix-prompt.md](../_fix-prompt.md), with its `[handoff]` lines, and with its `[code bug]` lines for a code bug. Fill `Prohibitions in the suggested fix` with each prohibition of the diagnosis, unchanged.

**Self-check is a command, not a promise.** "No new lint/type errors" is unenforceable as prose, so the orchestrator fills `Check command` with a real command:
- When `pre-push-checks:` is configured ([_handoff-config.md](_handoff-config.md)), pass the check(s) whose scope covers the fix's files.
- Absent that config, pass the narrowest gate the fix's own file type implies: the repo's formatter for a formatting fix, its linter for the language of the edited file, the single test file for a test fix.
- If nothing narrow exists, say so explicitly in the prompt (`Check command: none available: state what you verified by hand`) rather than leaving the line to be answered decoratively.

**`Method: deviated` is never auto-accepted.** The orchestrator surfaces it to the user *before* the push, quoting the diagnosis's own words next to what the subagent actually did (rule 5 in [_fix-loop.md](../_fix-loop.md)). When the diagnosis carried an explicit prohibition and the deviation touches it, that is a **hard stop**.

The subagent commits but does **not** push; the orchestrator pushes once after a batch (triage step 7) so a single CI run covers all fixes in the iteration. After the subagents return, the orchestrator re-runs the `## CI watch procedure` to confirm the fixes are green (in T5.3).
