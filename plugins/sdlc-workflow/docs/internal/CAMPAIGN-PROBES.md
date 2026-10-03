# CAMPAIGN-PROBES — Stage A results for WF-CAMPAIGN-PLAN.md

Run 2026-10-03 on Claude Code 2.1.288 and gh-stack v0.2.0 (upgraded from v0.0.2 the same day). The GitHub probes ran on the private scratch repo `jayteealao/campaign-probes`, and the worktree probes ran in `C:/Users/jayte/Documents/dev/.campaign-probes/`. The owner deletes both when the campaign work is done.

| Probe | Verdict | What Stage D does |
|---|---|---|
| P1 | PASS, (a) and (b) | D1 launches up to `campaign.width` yolo Workflows at once, each with `projectRoot` set to its worktree. yolo is not refactored. |
| P2 | PASS with two changes | Ship merges a stacked wave PR with `gh stack merge`, and reads the trunk, not `base-branch`, for the tag, the release run, and the push. |
| P3 | FAIL for the script; PASS for the session | The fallback rule of 17.4 applies inside the Workflow. The session matches the transcript's `rate_limit` kind. |
| P4 | Open: measured by the usage guard during the live run | Until measured, a reading older than 10 minutes is unknown (17.5). |
| P5 | Open: measured by the usage guard during the live run | Until measured, the guard also raises a toast and a push notification. |
| P6 | PASS | D2 appends with `link <stack-number> <pr>` and merges with `merge <pr> --yes --<method>`. |
| P7 | PASS for ports, folders and caches; the full Rust suite must not overlap | SoccerManager isolation: no `port-env`, per-worktree `target/` and node folders, `cargo test --workspace` as a heavy suite, `min-free-gb` 40. |
| P8 | PASS | Rule 12.4 uses `gh stack rebase --upstack`; exit code 3 is a conflict, and `--abort` restores every branch. |

## P1 — two drives at once, each in its own worktree

Each drive was one agent that wrote a file in its worktree, waited 45 seconds, committed by path, and then read the other worktree's status.

- **(a) Two Workflows launched from the main session.** Drive a ran 08:23:41–08:24:47 and drive b ran 08:23:43–08:24:47 (UTC). Each commit landed on its own branch (`08e27b5` on `p1/a`, `19a4224` on `p1/b`). Each drive saw the other worktree clean, with only the other drive's own commit.
- **(b) One Workflow, two drives in `parallel()`.** Drive c ran 08:24:15–08:25:00 and drive d 08:24:14–08:25:00. Drive d saw `?? drive-c.txt` in worktree c: that is c's own file before c committed it. No drive wrote outside its worktree.

Both forms work. D1 uses (a), because yolo then needs no change.

## P2 — handoff and ship for a PR whose base is another branch

Read of `handoff.md` and `ship.md`, and a live run on the scratch repo.

- **Handoff works unchanged.** It reads `base-branch` for the commit range (`git merge-base HEAD origin/<base-branch>`), the readiness range, commitlint, the PR base (`gh pr create --base <base-branch>`), and the rebase in T5.2. With `base-branch` set to the wave branch below, each range is the wave's own commits, which is correct.
- **CI runs on a stacked PR even with a trunk filter.** The scratch CI had `on: pull_request: branches: [main]`. PR #5 had base `campaign/probe/wave-3` and was in stack #3, and its checks still ran. GitHub applies the branch filter of a PR in a stack to the stack's trunk. SoccerManager's `pr-checks.yml` has the same filter, so its wave PRs get CI once they are in the stack.
- **A PR not yet in a stack gets no CI under that filter.** `gh stack link` needs two PRs (below), so wave 1's PR is in no stack until wave 2's PR opens. Wave 1's base is the trunk, so its CI runs anyway.
- **Ship needs a merge-command switch.** `gh pr merge 4 --merge` on the bottom PR of a stack failed: "This pull request is part of a stack and must be merged using the asynchronous merge REST API." `gh stack merge 4 --yes --squash` merged it.
- **Ship must read the trunk at ship time.** After the lower wave merged, GitHub moved the upper PR's base to `main` by itself (PR #4, then PR #5). The slug's `base-branch:` still names the lower wave. Ship uses `base-branch` for `gh release create --target`, `gh run list --branch`, and the post-release push, so the campaign sets `base-branch:` to the trunk before ship runs (rule in `_waves.md`).

## P3 — the error kind of a usage-limit failure

Evidence search of every transcript under `~/.claude/projects/` and every driver journal; no limit was triggered on purpose. Full report: `.campaign-probes/p3/RESULT.md`.

- Two real usage-limit failures exist, both main-session entries with `"error":"rate_limit"`, `"isApiErrorMessage":true`, `"apiErrorStatus":429`, and the text "You've reached your … limit". The other API error kinds seen are `server_error` (529 Overloaded) and `authentication_failed`.
- No recorded Workflow `agent()` failure exists. The Workflow tool documents that `agent()` returns `null` when the sub-agent dies on a terminal API error after retries, so the script sees no kind and no text.
- The message carries no reset time. The reset time comes from `rateLimits[].resetsAt` (the usage guard's reading).

Therefore: inside the Workflow, a `null` agent result while the newest reading is 95% or more is a usage pause (17.4 fallback). In the campaign session, a failure with kind `rate_limit` or status 429, or text that matches `/you(?:'|’)ve (?:reached|hit) your [^.\n]{0,40}limit|usage limit[^.\n]{0,20}reached|api error: 429|rate[_ ]limit(?:ed)?/i`, is a usage pause. A 529 is not a usage limit.

## P6 — gh-stack append by number, and merge

On v0.2.0:

1. `gh stack link <one-pr>` fails: "requires at least 2 arg(s)". A one-PR stack cannot exist.
2. `gh stack link 1 2` created stack #3 (stack numbers share the PR and issue sequence).
3. `gh stack link 3 4` appended PR #4 to stack #3.
4. `gh stack merge 2 --yes --merge` merged PR #1 and PR #2 into `main` in one operation; GitHub moved PR #4 onto `main`.
5. `gh stack merge 4 --yes --squash` merged the new bottom PR.
6. `gh stack submit --auto` creates draft PRs (PR #5 was a draft). The campaign therefore opens each wave PR through handoff (`gh pr create`) and links it; it does not use `submit`.
7. `gh stack sync` after a merge reported "Merged: #1, #2" and rebased the remaining branch onto `main`.

## P7 — two worktrees run the SoccerManager verify at once

Two `git clone --no-hardlinks` copies ran on 8 CPUs. The real checkout was not touched. The full log is `.campaign-probes/p7/RESULT.md`.

1. Every listener binds port 0: the engine page server (`crates/engine-cli/src/web.rs:190`) and the stream socket (`crates/stream/src/server.rs:52`). Two concurrent e2e runs used different ports and had no EADDRINUSE.
2. Each e2e test makes its own `mkdtemp` folder and passes it as `SM_DATA_DIR`. Rust tests use process-id temp folders. Without `SM_DATA_DIR`, the engine writes to `%LOCALAPPDATA%\SoccerManager`.
3. `cargo test --workspace --locked`, cold: 1025 s alone, 939 passed. Two at once: 1149 s each, and the same 3 `matchday::tests` failed in both copies (a 5-second stop limit, the planted-panic test, the 1/2/4-thread test). These tests are wall-clock sensitive; 2 of 7 failed alone on the busy host too. One run already holds the CPU at 76–100%, so a second run adds wall time, not throughput.
4. The release build (122 s) and the e2e `viewer` project (351 s, 6 passed) ran in both copies at once with no failure.
5. Each clone used 11 GB (`target/` 9.3 GB after the release build). Free space went from 156 GB to 135 GB.

The SoccerManager isolation contract, when the person sets it:

- `port-env`: none. Optionally set `SM_DATA_DIR` per worktree.
- `build-dirs`: `target/`, `viewer/node_modules`, `viewer/dist`, `e2e/node_modules`, `e2e/playwright-report`, `e2e/test-results`. Do not share `CARGO_TARGET_DIR`.
- `heavy-suites`: `cargo test --workspace` and the Playwright `scenario` project (45 minutes, not measured).
- `min-free-gb`: 40, about 11 GB per worktree.
- `width`: 2. A third drive adds wall time on 8 CPUs.

## P8 — rebase the upper waves after a change on a lower wave

1. A new file committed on wave 1, then `gh stack rebase --upstack` from wave 1: wave 1, 2 and 3 rebased in order, exit 0. `gh stack push` pushed the three branches.
2. A conflicting change on wave 1 (a different `wave2.txt`): exit code 3, the message names the branch and `gh stack rebase --continue`, and `gh stack rebase --abort` restored each branch to its earlier tip.
