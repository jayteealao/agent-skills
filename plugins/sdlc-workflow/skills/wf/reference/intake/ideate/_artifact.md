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
modes: []             # [steer] when a round of _rounds.md ran
selected: []          # the ideas at triage: take, stamped at done (_loop.md)
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
    confidence: <high|medium|low>      # the confidence rules below
    source-items: [S01-I04, S02-#42]   # only when sources fed the idea
    seen-in: "<an earlier ideate slug>"  # only when an earlier run proposed or culled it (Step 3c)
    changed: "<what changed since that run>"
    triage: <open|take|later|drop|brainstorm>   # _loop.md; every idea starts open
    triage-reason: "<the person's words>"       # required on a drop
    triage-at: "<ISO 8601>"
    round: <N>                         # only when a later round found it (_rounds.md)
    parent: IDEA-NNN                   # only for an idea from deeper, similar, or a split
    merged-into: IDEA-NNN              # only for an idea merged or split into another
    rescued: true                      # only for a rescued cull, with culled-reason
    culled-reason: "<the filter's reason>"
    discussed: true                    # only after a discussion
    notes:                             # one plain sentence per discussion change
      - at: "<ISO 8601>"
        text: "<what changed, from what, and why>"
    routed-to: <brainstorm slug>       # required when triage is brainstorm
  - ...
culled:
  - id: IDEA-NNN
    title: "<title>"
    reason: "<adversarial filter reason, or needs-verification: <the named cheap check>>"
    seen-in: "<an earlier ideate slug>"  # only for an earlier cull that stays culled
    source: <filter|person>            # person for a drop in the loop; absent means filter
    round: <N>                         # only when a later round culled it
    dropped-at: "<ISO 8601>"           # only for a person's drop
  - ...
rounds:                                # round 1 is the first scan; each steer adds one (_rounds.md)
  - n: 1
    kind: <initial|deeper|similar|lens|direction>
    target: IDEA-NNN                   # deeper and similar only
    lenses: [<the lenses that ran>]
    topic: "<words>"                   # direction only
    raw: <N>
    culled: <N>
    survivors: <N>
    at: "<ISO 8601>"
sources:                               # only when Step 0 found source arguments (_sources.md)
  - id: S01
    kind: <web|document|dependency|issues|research>
    origin: "<URL, path, name@version, or gh query>"
    reference: references/<kind>/<file>
    state: <read|unavailable>
    reason: "<only when unavailable>"
    items: <N>
source-items:                          # every announced item, each with exactly one result
  - id: S01-I04
    title: "<the announced item, short>"
    result: <applies|already-used|not-applicable|blocked-by-version|needs-verification|already-fixed|duplicate-of|withdrawn>
    idea: IDEA-007                     # the key that the result requires (_sources.md)
research:                              # every research act (_lenses.md, Research)
  - id: R01
    trigger: <keyword|agent>
    note: research/R01-<label>.md
next-command: user-picks
next-invocation: "/wf intake ideate <slug>"
recommended-routes: [{invocation: "/wf intake ideate <slug>", reason: "triage, discuss, or steer the ideas", default: true}, {invocation: "/wf intake ideate <slug> <idea-id>", reason: "record the pick"}]
---
```

# Ideation: <focus-area or "Codebase-Wide">

*Generated: <date> | Lenses: <list> | Raw: <N> → Filtered: <N> → Showing: <N>*

## Ranked Ideas

Build this list from the `ideas:` roster. The roster order is the rank. Write one entry for each roster entry that has no `merged-into`. Do not copy the roster fields (category, impact, effort, feasibility, rank-reason, evidence, entry) into the body. The `culled:` roster is the adversarial filter log. Mark each entry with its triage state in words: Open, Taken, Later, Dropped, or Sent to brainstorm.

### #1 — <Title> (IDEA-001) · <triage state in words>

<Description>

#### Discussion

<Only after a discussion: one plain line per `notes:` entry.>

## Triage

<Written by the loop. The taken ideas, then the later ideas, then the drops with the person's reasons, then the ideas sent to brainstorm with their brainstorm slug.>

## Rounds

<Written by _rounds.md. One plain line per round after the first: what it looked at, and what it found.>

## Sessions

<Written at pause. The story of each sitting, newest first.>

---

## Confidence

Give each idea the highest `confidence` that its evidence allows. Step 4 weighs confidence in the rank and names it in `rank-reason`.

| Evidence | Highest confidence |
|---|---|
| A code citation that shows the problem | high |
| A source item confirmed by a code citation | high |
| A source item with no code confirmation | medium |
| Agent research only | low, or medium after a `study-sources` read confirms it |

## How to use these results

Each idea above maps directly to a `/wf intake` invocation. Copy the entry command for any idea you want to pursue. The slug suggestion is a starting point; you can adjust it.

To continue this run, run `/wf intake ideate <slug>`: the loop triages, discusses, and steers the ideas. To look further inside this run:
```
/wf intake ideate <slug> deeper <idea>        # the idea's files and their neighbours
/wf intake ideate <slug> similar <idea>       # the same pattern elsewhere
/wf intake ideate <slug> lens security        # a lens this run did not run
/wf intake ideate <slug> direction payments   # a new topic
/wf intake ideate <slug> surprise me          # angles you did not raise
```

To start a new run with a different focus or count:
```
/wf intake ideate security          # security lens only
/wf intake ideate performance 5     # performance lens, top 5
/wf intake ideate dx 20             # DX lens, top 20
/wf intake ideate https://example.com/changelog react@19.0.0 issues research
                                    # what the changelog, the upgrade, and the issues offer
/wf intake ideate <slug> refresh    # check this run again against the current code
```
