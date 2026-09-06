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
    score: <float>
    evidence: ["<file:line>", "..."]   # the lens findings this idea is grounded in
    entry: "<the entry invocation — new-workflow or extension form>"
  - ...
culled:
  - id: IDEA-NNN
    title: "<title>"
    reason: "<adversarial filter reason, or needs-verification: <the named cheap check>>"
  - ...
---
```

# Ideation: <focus-area or "Codebase-Wide">

## The Ideation
<!-- STORY SECTION — first, and self-sufficient. must follow `../../_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language must follow `../../_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

*Generated: <date> | Lenses: <list> | Raw: <N> → Filtered: <N> → Showing: <N>*

## Ranked Ideas

### #1 — <Title>
**Category:** <category> | **Impact:** <level> | **Effort:** <level> | **Score:** <N>

**Evidence:** `<file:line>`

<Description>

**To act on this:** `/wf intake <slug-suggestion>`

---

### #2 — ...

---

## Adversarial Filter Log

<For each culled idea:>
- **IDEA-NNN** — *<title>*: <reason>

---

## How to use these results

Each idea above maps directly to a `/wf intake` invocation. Copy the entry command for any idea you want to pursue. The slug suggestion is a starting point; you can adjust it.

If you want to re-run ideation with a different focus or count:
```
/wf intake ideate security          # security lens only
/wf intake ideate performance 5     # performance lens, top 5
/wf intake ideate dx 20             # DX lens, top 20
```
