# Ideation lead template (Step 6 of `intake/ideate.md`)

`intake/ideate.md` holds the `00-index.md` template. This file holds `01-ideate.md`.

**`01-ideate.md` — `type: ideation`** (the lead carries a `slug` for the in-slug path; `focus` stays the schema key). The roster keeps the per-idea `file:line` evidence the lenses were required to gather; dropping it strips the successor's seed:
```yaml
---
schema: sdlc/v1
type: ideation
slug: <slug>
focus: <focus-area or "all">
created-at: "<ISO 8601>"
raw-candidates: <N>
culled-count: <N>
survivor-count: <N>
shown-count: <N>
selected: []          # idea ids the user selected in Step 5; stamped again at pick time
ideas:
  - id: IDEA-001
    title: "<title>"
    category: <quality|performance|security|dx|feature|architecture>
    impact: <critical|high|medium|low>
    effort: <xs|s|m|l|xl>
    feasibility: <clear|needs-design|external>
    rank-reason: "<one line: why this rank>"
    evidence: ["<file:line>", "..."]   # the lens findings this idea is grounded in
    entry: "<the entry invocation — new-workflow or extension form>"
  - ...
culled:
  - id: IDEA-NNN
    title: "<title>"
    reason: "<adversarial filter reason, or needs-verification: <the named cheap check>>"
  - ...
next-command: user-picks
next-invocation: "/wf intake ideate <slug> <idea-id>"
recommended-routes: [{invocation: "/wf intake ideate <slug> <idea-id>", reason: "record the pick", default: true}]
---
```

# Ideation: <focus-area or "Codebase-Wide">

Write the explainer to `01-ideate.explainer.html.fragment` per [_story-arc.md](../../_story-arc.md).

*Generated: <date> | Lenses: <list> | Raw: <N> → Filtered: <N> → Showing: <N>*

## Ranked Ideas

Build this list from the `ideas:` roster. The roster order is the rank. Write one entry for each roster entry. Do not copy the roster fields (category, impact, effort, feasibility, rank-reason, evidence, entry) into the body. The `culled:` roster is the adversarial filter log.

### #1 — <Title> (IDEA-001)

<Description>

---

## How to use these results

Each idea above maps directly to a `/wf intake` invocation. Copy the entry command for any idea you want to pursue. The slug suggestion is a starting point; you can adjust it.

If you want to re-run ideation with a different focus or count:
```
/wf intake ideate security          # security lens only
/wf intake ideate performance 5     # performance lens, top 5
/wf intake ideate dx 20             # DX lens, top 20
```
