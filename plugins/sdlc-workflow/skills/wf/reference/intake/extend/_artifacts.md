# Extension artifact templates (Steps 4–5 of `intake/extend.md`)

## `03-slice-<new-slug>.md` (Step 4)

For each confirmed new slice, write `03-slice-<new-slug>.md`:

```yaml
---
schema: sdlc/v1
type: slice
slug: <slug>
slice-slug: <new-slug>
status: defined
stage-number: 3
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
complexity: <xs|s|m|l|xl>
depends-on: [<existing-slice-slug-if-any>, ...]
source: <from-review | from-retro | from-probe | from-simplify | extension>
source-ref: <07-review-<slice-slug>.md | 10-retro.md | "user description">
extension-round: <N>  # 1 for the first extension on this workflow, 2 for the second, etc.
tags: []
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  source: <07-review-<slice-slug>.md | 10-retro.md | "">
  plan: 04-plan-<new-slug>.md
  implement: 05-implement-<new-slug>.md
---
```

# Slice: <slice-name>

## Goal

## Why This Slice Exists
Explain what motivated this extension — which review finding, retro item, or user decision created it. Reference the source artifact.

## Scope
- In: ...
- Out: ...

## Acceptance Criteria
- Given ... When ... Then ...

## Dependencies on Other Slices
- `<existing-slice-slug>`: what this slice needs from it

## Risks
- ...

## `03-slice.md` roster entry (Step 5, item 2)

```yaml
- slug: <new-slug>
  status: defined
  complexity: <xs|s|m|l|xl>
  depends-on: [<if-any>]
  source: <from-review | from-retro | from-probe | from-simplify | extension>
  extension-round: <N>
```

## `03-slice.md` Extension Round section (Step 5, item 4)

```markdown
## Extension Round <N> — <ISO date>
Source: <from-review | from-retro | from-probe | from-simplify | user request>

### New Slices Added
| Slice | Goal | Complexity | Depends On |
|-------|------|------------|------------|
| `<new-slug>` | <one-line goal> | <size> | <deps or —> |

### Motivation
<Why these slices were added — what the review/retro/user said that created this scope.>
```
