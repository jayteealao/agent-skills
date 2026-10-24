# PR comment triage (T5.1) — the body of handoff step 7b

T5.1 is a **bounded loop**, not a one-shot pass. It runs until either no unresolved 🔴 blockers remain or the user opts to defer. Skip this file entirely when no `pr-number` is recorded. Also skip it when `branch-strategy` is `none`, or `shared` in single-slug scope. A `shared` branch in batch scope runs this loop ([../handoff.md](../handoff.md) step 7). Fixes go through the `## Fix-subagent contract` in [_pr-ci-handoff.md](_pr-ci-handoff.md); questions are gate questions per [_gate-question.md](../_gate-question.md).

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

Add the `[bot]` suffix only for GitHub App accounts whose login carries it.

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

When ambiguous, prefer the more severe class. Bots producing very long walkthrough summaries should not auto-elevate to 🔴; read the actual finding text.

### 4. Report the triage table to the user

```
| Source | File:Line | Severity | Summary | Recommended action |
```

`Source` is the reviewer login (or `<login> [bot]` for bot accounts). `Summary` is one short sentence in product language (per External Output Boundary: cite no workflow artifact paths in the summary, even though the table is internal).

### 4b. Record the threads in the findings ledger

Record every 🔴 and 🟡 thread of this iteration in the ledger of [../_findings-ledger.md](../_findings-ledger.md), with source `pr-bot`. A 🟢 comment is not a finding.

1. Write `.ai/workflows/<slug>/.found.json` with `dimensions: ["pr-review"]` and one finding per thread: `dimension: pr-review`, `key: <threadId>`, `severity: HIGH` for 🔴 and `LOW` for 🟡, `file`, `line`, `issue` (the summary of step 4) and `fix` (the recommended action).
2. Run `node "<skill-dir>/scripts/wf.mjs" findings add "<root>" <slug> .ai/workflows/<slug>/.found.json --source pr-bot --run <now>`. A thread that a later iteration does not fetch again (it was resolved on the PR) becomes `resolved`.
3. When an outcome is known, record it on the entry with `wf.mjs findings set`: a fix that landed → `fixed`; a deferred thread → `deferred --reason "<the deferral rationale>"`; a declined thread → `dismissed --reason "<the decline rationale>"`.

### 5. Address 🔴 blockers

Fixes run in **subagents, never inline**; this is what keeps the orchestrator context clean. The orchestrator collects approved threads and dispatches the fix work; it does not read source or patch code itself.

- Collect every 🔴 thread the user has not declined into a batch of `{ threadId, file, line, body }`.
- **Dispatch fix subagents** per the `## Fix-subagent contract`, one dispatch per thread. Parallelize threads that touch disjoint files (one parallel wave); serialize threads that touch the same file to avoid clobbering. Each subagent reads the thread context, applies the minimal fix, and commits `fix(<slug>): address review thread — <short>`. Only its compact result returns to the orchestrator, never the diffs, log dumps, or file reads.
- Keep the `threadId` of each dispatch. When the sub-agent returns `Confirmed: yes`, record `{ thread: <threadId>, sha: <its Commit line> }` in `triage-fixed-threads` for the resolve step in 7.

If the user has a strong reason to decline a 🔴 (for example, the bot is wrong about correctness) and confirms as a gate question per [_gate-question.md](../_gate-question.md), route to "deferred" and add `threadId` to `triage-deferred-thread-ids`. Set `has-deferred-comments: true`.

### 6. Address 🟡 suggestions

Ask ONE multi-select gate question per [_gate-question.md](../_gate-question.md) listing all 🟡 items:

```yaml
question: "Which suggestions should we apply now?"
header: "Suggestions"
options:
  - label: "<short summary> (<source>)"
    description: "<file:line> — apply | defer | decline"
  - ...
multiSelect: true
```

For selected ones: route through the same fix-subagent path, one subagent per selected thread, same as 🔴. For unselected: ask in a freeform chat round whether to **defer** (keep open, add to `triage-deferred-thread-ids`) or **decline** (reply in the thread with a brief decline rationale, then resolve it in step 7).

A thread can also be decided outside this table: the person answers it in chat, or a fix for it lands by another path in this run. Treat that thread as one of the table: a fix goes through the fix-subagent path and into `triage-fixed-threads`, and a decline is replied to and resolved in step 7.

### 7. Push fixes, reply and resolve threads

After all selected fixes commit, push once: `git push origin <branch>` (regular push within the dedicated branch). Then do these steps for each entry of `triage-fixed-threads` that is still open, and for each declined thread:

1. Reply in the thread. A fixed thread names its fix commit, for example `Fixed in <short-sha>: <one line>`. A declined thread gives the decline rationale. Write the reply in product language (External Output Boundary).

   ```graphql
   mutation {
     addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: "<threadId>", body: "<reply>" }) {
       comment { id }
     }
   }
   ```

2. Resolve the thread:

   ```graphql
   mutation {
     resolveReviewThread(input: { threadId: "<threadId>" }) {
       thread { id isResolved }
     }
   }
   ```

3. The result must show `isResolved: true`. When the mutation fails, run it once more. When it fails again, add the thread to `triage-resolve-failed`, and tell the person the error output.

Resolve no deferred thread: it stays open, with the deferral rationale as a reply in the thread. Resolve no thread whose fix did not land.

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
triage-fixes-applied: <count of 🔴 and 🟡 fixes that landed through the fix-subagent contract>
triage-fixes-skipped: <count of 🟡 declined or 🔴 deferred>
triage-deferred-thread-ids: [<id>, ...]
triage-fixed-threads: [{ thread: <id>, sha: <fix sha> }, ...]   # every fix of a thread, kept across re-runs
triage-resolve-failed: [<id>, ...]   # a fixed or declined thread that the resolve mutation could not close
has-deferred-comments: <true if any thread is still unresolved>
```

`triage-fixed-threads` carries over to a later handoff run, so T5.3 resolves a fixed thread that is still open, whichever run fixed it.

🟢 informational comments are summarised in the artifact's `## Reviewer Comments Triaged` table with action `noted`. They are never resolved (top-level PR comments are not threadable via API).
