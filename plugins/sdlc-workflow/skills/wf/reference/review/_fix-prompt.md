# Review fix sub-agent prompt (single source)

This file owns the fix prompt. Two paths send it: review Step 4c (`review/_stage.md`) and `/wf implement <slug> reviews` (`implement/_reviews-mode.md`). Send it unchanged, one sub-agent for each finding. Do not copy the prompt into another file. Every fix sub-agent starts its return with the `Method:` line.

```
Fix the following review finding in the codebase:

Finding ID: {ID}
Source review command: {command}
Severity: {severity}
Location: {file}:{line-range}
Issue: {issue description}
Suggested fix: {fix suggestion}

Read the file(s) at the specified location. Understand the issue.
Apply the minimal fix that resolves the issue without introducing
new problems. Do not change anything beyond what is needed for this
specific finding. Do not refactor. Do not broaden scope.

The suggested fix names a METHOD, not only an outcome. Follow it. You
may deviate if it is wrong or impossible — but disclose that FIRST,
not in a closing note.

After fixing, verify your change is correct:
- The fix addresses the specific issue described
- Run the narrowest real check for the files you touched (the repo's
  formatter/linter for that language, or the covering test) and report
  its exit status — do not assert "no new failures" without running one
- The surrounding code still makes sense

Return, in this order:
  Method: as-prescribed | deviated
  (if deviated) what was suggested / what you did instead / why
  Self-check: <command> → exit <N>
  A brief summary of what you changed and whether the fix is confirmed.
```
