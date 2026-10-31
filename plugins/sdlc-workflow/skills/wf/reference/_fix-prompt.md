# Fix sub-agent prompt (single source)

This file owns the prompt of a fix sub-agent. Three paths send it:

- `/wf implement <slug> reviews` ([implement/_reviews-mode.md](implement/_reviews-mode.md)), for each open review finding.
- The verify fix loop ([verify.md](verify.md) Step 7.6), for each issue triaged `Fix`.
- The PR phase of ship ([handoff/_pr-ci-handoff.md](handoff/_pr-ci-handoff.md) `## Fix-subagent contract`), for each CI fix and each review-thread fix.

Send one sub-agent for each issue. Fill each `{slot}`. Send each line without a mark. Send a line marked `[verify]` or `[handoff]` only on that path. Send a line marked `[code bug]` only when the issue is a code bug, not a lint, format, config, tooling or docs finding. Remove the mark before you send the line. Do not copy the prompt into another file. [_fix-loop.md](_fix-loop.md) gives the rules of the dispatch and of the check of the patch.

```
Fix this one issue in the repository.

Issue ID: {ID}
Source: {the review dimension, the verify check, the CI check or the review thread}
[verify] Type: {check-failure | unmet-ac | runtime-evidence-missing | augmentation-regression}
Location: {file:line-range, or the check name}
Issue: {the observation: the raw output, the criterion text, the root cause or the thread body}
Suggested fix: {the change to make}
[handoff] Prohibitions in the suggested fix: {copy unchanged each "do not …" or
[handoff]   "regenerate, don't patch" clause of the diagnosis, or "none"}
Check command: {the narrowest real check for this fix, or "none available: state what you verified by hand"}

Read the files at the location. Apply the minimal fix for this issue only.
Do not refactor, reformat or change anything else. Do not broaden the scope.

The suggested fix names a METHOD, not only an outcome. Follow it. When you
find the method wrong or impossible, you may deviate, but say so in the
FIRST line of your return, not in a closing note.

[code bug] Add a minimal regression test that fails before your patch and
[code bug] passes after it. Write the test first when the check that found the
[code bug] issue can run again. When a regression test is not possible, state
[code bug] why in one line: the orchestrator records it as an exemption.
Never weaken, delete or skip a test to make a check pass.

Run the check command before you return, and report its exit status. A
non-zero exit means that you did not finish: fix it, or return COULD NOT FIX.

[handoff] Then commit only the files that you changed:
[handoff]   git commit -m "{the commit message that the orchestrator gives}"

Return only these lines, in this order. The first line is mandatory:
  Method: as-prescribed | deviated
  (if deviated) what the suggested fix said / what you did instead / why
  Self-check: <command> → exit <N>
  [handoff] Commit: <sha from `git rev-parse HEAD`>
  [handoff] Files: <list>
  [code bug] Regression test: <path, or the one-line exemption reason>
  Confirmed: yes | no
  A brief summary of what you changed.
Paste no diffs and no full file contents.
```
