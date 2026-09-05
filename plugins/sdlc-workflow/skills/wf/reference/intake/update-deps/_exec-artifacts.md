# Self-authored execution artifacts (Steps 7–8 of `intake/update-deps.md`)

update-deps is the one change-mode that self-authors `05-implement.md` and `06-verify.md`. Both are un-suffixed (single slice) and satisfy the standard implement / verify required sets. Bodies are described in `intake/update-deps.md`.

## `05-implement.md`

```yaml
---
schema: sdlc/v1
type: implement
slug: <slug>
slice-slug: <slug>
status: complete
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-changed: <int>          # manifests + lockfiles touched
metric-lines-added: <int>
metric-lines-removed: <int>
metric-deviations-from-plan: <int>   # e.g. packages that became blocked
metric-review-fixes-applied: 0
commit-sha: "<last tier commit sha, or 'multiple'>"
tags: [deps]
refs:
  index: 00-index.md
  plan: 04-plan.md
  next: 06-verify.md
next-command: wf-review               # 06-verify.md is self-authored next; /wf verify would redirect back here
next-invocation: "/wf review <slug>"
---
```

## `06-verify.md`

```yaml
---
schema: sdlc/v1
type: verify
slug: <slug>
slice-slug: <slug>
status: complete
stage-number: 6
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
result: <pass|partial|fail>          # partial is valid: some updated, some blocked
metric-checks-run: <int>
metric-checks-passed: <int>
metric-acceptance-met: <int>
metric-acceptance-total: <int>
metric-interactive-checks-run: 0
metric-interactive-checks-passed: 0
metric-issues-found: <int>           # blocked packages
evidence-dir: ""
tags: [deps]
refs:
  index: 00-index.md
  implement: 05-implement.md
  next: 07-review.md
next-command: wf-review
next-invocation: "/wf review <slug>"
---
```
