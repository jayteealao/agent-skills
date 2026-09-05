# Docs orchestrator — run artifact templates

Load this file from `docs.md` Steps 1–5. Every run artifact under `.ai/docs/<run-id>/` (or the workflow directory) uses the frontmatter below; `schema: sdlc/v1` and a real UTC timestamp per [_timestamp.md](../_timestamp.md) are required on each.

## `discover.md` (Step 1)

```yaml
---
schema: sdlc/v1
type: docs-discover
run-id: <run-id>
mode: <project|workflow|path>
target-slug: <slug or "n/a">
scope: <description>
doc-files-found: <count>
has-docs-folder: <true|false>
doc-generator: <tool or "none">
status: complete
created-at: <real UTC timestamp per _timestamp.md>
---
```

## `audit.md` (Step 2)

```yaml
---
schema: sdlc/v1
type: docs-audit
run-id: <run-id>
files-audited: <count>
accuracy-issues: <count>
quadrant-violations: <count>
gaps-found: <count>
ste-violations: <count>
high-freshness-risk: <count>
status: complete
created-at: <real timestamp>
---
```

Body — one section per file:
```
## <file-path>
- Type: <tutorial|how-to|reference|explanation|readme|unknown>
- Accuracy issues: <list or "none">
- Quadrant violations: <list or "none">
- Gaps: <list or "none">
- STE violations: <list with rule IDs, or "none">
- Freshness risk: <low|medium|high>
- Action needed: <update|rewrite|split|create|delete|none>
```

## `plan.md` (Step 3)

```yaml
---
schema: sdlc/v1
type: docs-plan
run-id: <run-id>
p0-count: <count>
p1-count: <count>
p2-count: <count>
p3-count: <count>
p4-count: <count>
total-actions: <count>
audit-only: <true|false>
status: complete
created-at: <real timestamp>
---
```

## `generate.md` (Step 4)

```yaml
---
schema: sdlc/v1
type: docs-generate
run-id: <run-id>
files-created: [<paths>]
files-updated: [<paths>]
files-deleted: [<paths>]
actions-completed: <count>
actions-skipped: <count>
status: complete
created-at: <real timestamp>
---
```

## `08b-docs-index.md` (Step 5)

In `mode: workflow`, write `.ai/workflows/<target-slug>/08b-docs-index.md`; in project/path mode, write `.ai/docs/<run-id>/08b-docs-index.md` unless the run is explicitly attached to an existing workflow slug.

```yaml
---
schema: sdlc/v1
type: docs-index
slug: <target-slug or docs-run slug>
title: Documentation index
status: complete
run-id: <run-id>
gaps-found: <count>
actions-completed: <count>
created-at: <real timestamp>
updated-at: <real timestamp>
---
```

Body structure:
```
## Generated or Updated Docs
| File | Diataxis type | Action | Status |
|------|---------------|--------|--------|

## Remaining Gaps
- ...

## Review Notes
- ...
```

Also write sibling `08b-docs-index.yaml` beside the docs-index artifact with a `docs:` array of `{path, type, action, status}` so the view layer can render the docs table in both workflow and project/path mode.
