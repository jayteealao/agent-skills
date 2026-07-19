# Shared PR/CI handoff machinery (loaded on demand by `handoff.md`)

This file carries the GitHub-conditional machinery of `/wf handoff`: the CI watch
procedure (T5.0/T5.3), the fix-subagent contract (7a CI-red + 7b triage), and the
PR comment triage loop (T5.1). `handoff.md` instructs you to read this file **in
full** the moment the PR/CI path is active (`branch-strategy` is
`dedicated`/`shared` AND a `pr-number` is recorded). A local-branch handoff
(`branch-strategy: none`) never loads it. Once loaded, follow every section below
verbatim — the same fidelity rules as the parent reference apply.

# CI watch procedure (shared by T5.0 and T5.3)

A **bounded poll loop** that drives the PR's checks to a terminal state. It is the piece the old one-shot `gh pr view` lacked. Idempotent and resumable: re-invoking handoff re-enters the loop against whatever the current check state is.

Inputs: `pr-number`; `ci-watch.poll-interval-seconds` (default 30); `ci-watch.max-wait-minutes` (default 30). The wall-clock bound is the user's hard ceiling — never exceed it silently.

1. **Read current state:** `gh pr view <pr-number> --json statusCheckRollup`. Partition `.statusCheckRollup[]`:
   - **pending** — `status` ∈ {`QUEUED`, `IN_PROGRESS`, `PENDING`, `WAITING`} (or `state` ∈ {`PENDING`, `EXPECTED`} for legacy commit-status contexts).
   - **failed** — terminal-failed: `conclusion` ∈ {`FAILURE`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`, `STARTUP_FAILURE`} (or `state: FAILURE`/`ERROR`).
   - **passed** — terminal-ok: `conclusion` ∈ {`SUCCESS`, `NEUTRAL`, `SKIPPED`} (or `state: SUCCESS`).
2. **Decide:**
   - any **failed** → return **red** (with the failed check names). Stop watching — a red check won't go green on its own.
   - no failed AND no pending → return **green**.
   - else (some pending, none failed) → if the elapsed wall-clock since the watch started ≥ `max-wait-minutes`, return **timed-out** (with the pending names); otherwise `sleep <poll-interval-seconds>` and go to step 1.
3. Prefer `gh pr checks <pr-number> --watch --interval <poll-interval-seconds>` when available — it blocks until checks finish and exits non-zero on failure — but still enforce the `max-wait-minutes` ceiling around it (run it under a timeout; on timeout, fall back to the snapshot decision in step 2). The hand-rolled poll in steps 1–2 is the portable fallback and the source of truth for the partition rules.

Record `ci-watch-rounds: <N polls>` and the terminal outcome in handoff frontmatter (`ci-watch-conclusion`). Never report `green` off a snapshot that still contains pending checks — that is precisely the bug this procedure exists to prevent.

# Fix-subagent contract (shared by 7a CI-red and 7b triage)

Every code fix in handoff is delegated to a subagent so the orchestrator context stays clean and the orchestrator-discipline rule ("do NOT make code changes") holds. This contract conforms to the shared fix-loop invariants in [_fix-loop.md](_fix-loop.md). Dispatch with the `Task` tool:

- `subagent_type`: `general-purpose`
- `model`: `sonnet` — **REQUIRED on every call** (the model pin follows [_fix-loop.md](_fix-loop.md) rule 3).
- `description`: 3–5 words, e.g. `"fix CI failure"` or `"fix review thread"`.
- `prompt`: self-contained — include the exact target and these rules:
  ```
  Apply the following fix in this repository:

  Location: <file:line-range>
  Problem:  <root cause / thread body>
  Proposed fix: <the change to make>

  Read the file(s) at the location. Apply the MINIMAL change that resolves
  the problem — do not refactor, reformat, or touch anything unrelated.
  Do not broaden scope beyond this one item.

  After editing, sanity-check: no new lint/type errors, surrounding code
  still coherent, the specific problem is resolved.

  Then commit ONLY the files you changed:
    git commit -m "<the commit message the orchestrator gave you>"

  Return ONLY: the commit SHA (`git rev-parse HEAD`), the list of files
  changed, and one line on whether the fix is confirmed. Do NOT paste diffs
  or full file contents back.
  ```

The subagent commits but does **not** push — the orchestrator pushes once after a batch (7b step 7) so a single CI run covers all fixes in the iteration. After the subagents return, the orchestrator re-runs the `## CI watch procedure` to confirm the fixes are green (in T5.3).

# PR comment triage (T5.1)

This is the body of step 7b. T5.1 is a **bounded loop**, not a one-shot pass. It runs until either no unresolved 🔴 blockers remain or the user opts to defer. Skip this section entirely when `branch-strategy ≠ dedicated` or no `pr-number` is recorded.

## Loop bound

Maximum **5 iterations**. After the bound, set `readiness-verdict: awaiting-input` and STOP. This avoids infinite ping-pong with bots that re-comment after every fix.

## Default review-bots list

Used to distinguish bot reviews (often more aggressive on style) from human reviewers. Override per-project via the `review-bots:` key in `00-index.md`.

```
coderabbitai
greptile-dev
gemini-code-assist
chatgpt-codex-connector[bot]
```

Add `[bot]` suffix only for GitHub App accounts whose login carries it.

## Iteration

For each iteration N (1..5):

### 1. Fetch unresolved review threads

Use `gh api graphql` with this query (replace `<owner>`, `<repo>`, `<pr-number>`):

```graphql
query {
  repository(owner: "<owner>", name: "<repo>") {
    pullRequest(number: <pr-number>) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 50) {
            nodes { id author { login } body createdAt }
          }
        }
      }
    }
  }
}
```

Filter `nodes` to those with `isResolved == false`. Capture `{ threadId, author, file, line, body }` for each.

### 2. Fetch top-level PR comments and formal review submissions

```bash
gh pr view <pr-number> --json comments,reviews
```

Top-level comments live under `.comments[]`; formal review bodies live under `.reviews[]` (with `.state` ∈ {`COMMENTED`, `APPROVED`, `CHANGES_REQUESTED`, `DISMISSED`}). Top-level comments are not resolvable via API; capture them for the triage table only.

### 3. Classify each comment

| Severity | Trigger heuristics |
|---|---|
| 🔴 **Blocking** | A reviewer marked `CHANGES_REQUESTED`; a finding mentions correctness, crash, security, data loss, missing migration, breaking API change without bump; bot output flagged with severity ≥ "high"; comment body contains "must fix", "blocker", or "do not merge". |
| 🟡 **Suggestion** | Style, naming, doc gap, test gap, refactor recommendation, nit-with-merit, performance hint without measured regression. |
| 🟢 **Informational** | Walkthrough/summary, praise, declined-nit acknowledgment, FYI, "considered alternatives" notes. |

When ambiguous, prefer the more severe class. Bots producing very long walkthrough summaries should not auto-elevate to 🔴 — read the actual finding text.

### 4. Report the triage table to the user

```
| Source | File:Line | Severity | Summary | Recommended action |
```

`Source` is the reviewer login (or `<login> [bot]` for bot accounts). `Summary` is one short sentence in product language (per External Output Boundary — do not cite workflow artifact paths in the summary, even though the table is internal).

### 5. Address 🔴 blockers

Fixes run in **subagents, never inline** — this is what keeps the orchestrator context clean (the original "littering" complaint). The orchestrator collects approved threads and dispatches the fix work; it does not read source or patch code itself.

- Collect every 🔴 thread the user has not declined into a batch of `{ threadId, file, line, body }`.
- **Dispatch fix subagents** per the `## Fix-subagent contract` above — one `Task` per thread. Parallelize threads that touch disjoint files (issue the `Task` calls in a single message); serialize threads that touch the same file to avoid clobbering. Each subagent reads the thread context, applies the minimal fix, commits `fix(<slug>): address review thread — <short>`, and returns `{ threadId, fix-sha, status }`. Only that compact result returns to the orchestrator — not the diffs, log dumps, or file reads.
- Record each `{ threadId, fix-sha }` for the resolve step in 7.

If the user has a strong reason to decline a 🔴 (e.g., the bot is wrong about correctness) and confirms via AskUserQuestion, route to "deferred" and add `threadId` to `triage-deferred-thread-ids`. Set `has-deferred-comments: true`.

### 6. Address 🟡 suggestions

Use a single AskUserQuestion call (multi-select) listing all 🟡 items:

```yaml
question: "Which suggestions should we apply now?"
header: "Suggestions"
options:
  - label: "<short summary> (<source>)"
    description: "<file:line> — apply | defer | decline"
  - ...
multiSelect: true
```

For selected ones: route through the same fix-subagent path (`## Fix-subagent contract`) — one subagent per selected thread, same as 🔴. For unselected: ask in a freeform chat round whether to **defer** (keep open, add to `triage-deferred-thread-ids`) or **decline** (resolve the thread with a brief decline rationale recorded in the comment via `gh pr comment`).

### 7. Push fixes and resolve threads

After all selected fixes commit:
- `git push origin <branch>` (regular push within the dedicated branch).
- For each `{ threadId, fix-sha }` whose fix landed: run the `resolveReviewThread` GraphQL mutation:

```graphql
mutation {
  resolveReviewThread(input: { threadId: "<threadId>" }) {
    thread { id isResolved }
  }
}
```

Do NOT resolve a thread whose fix was deferred or declined — those stay open with the deferral/decline rationale in a fresh `gh pr comment`.

### 8. Re-fetch and decide loop continuation

Re-run step 1. Compare the fresh unresolved-thread set against the prior iteration's:
- Empty → exit loop, set `readiness-verdict` per T5.3's logic.
- Has new 🔴 (bot re-commented or human added) → loop again (iteration N+1).
- Has only 🟢/🟡 already triaged this run → exit loop.

## Exit conditions

| Condition | Frontmatter outcome |
|---|---|
| No unresolved 🔴 AND user has triaged every 🟡 | `readiness-verdict` decided in T5.3 (likely `ready` or `awaiting-input`) |
| User chose "defer remaining" | `has-deferred-comments: true`; verdict `awaiting-input` unless 🔴 deferred → `blocked` |
| 5-iteration bound hit | `readiness-verdict: awaiting-input`. STOP. Tell the user the loop terminated by bound. |

## Frontmatter contract

After the loop completes:

```yaml
triage-iterations: <N actual iterations run>
triage-fixes-applied: <count of 🔴+🟡 that landed via implement reviews>
triage-fixes-skipped: <count of 🟡 declined or 🔴 deferred>
triage-deferred-thread-ids: [<id>, ...]
has-deferred-comments: <true if any thread is still unresolved>
```

🟢 informational comments are summarised in the artifact's `## Reviewer Comments Triaged` table with action `noted`. They are never resolved (top-level PR comments are not threadable via API).
