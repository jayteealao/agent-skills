# Brainstorm board templates (Step 1 of `intake/brainstorm.md`)

`intake/brainstorm.md` holds the `00-index.md` template. This file holds the two board files and the conversion of a legacy board. The two files hold one truth: `brainstorm-board.json` is the agent's working board, and `01-brainstorm.md` is the same content written for the person, in plain words and with no keys.

## `brainstorm-board.json` — the agent's board

The write hook validates this file against `$defs.brainstormBoard` in `tests/frontmatter.schema.json` on every write.

```json
{
  "schema": "sdlc/v1",
  "artifact": "brainstorm-board",
  "slug": "<slug>",
  "topic": "<topic as given>",
  "updated-at": "<ISO 8601>",
  "sessions": 1,
  "batches": 0,
  "page": null,
  "areas": [
    { "key": "seeing-the-cost", "name": "Seeing what a project costs", "side": "problem", "state": "explored", "brief": "A limit per project warns and never blocks. Core: the warning. Open: the ledger format. Scope: kept.", "scope": "keep" }
  ],
  "threads": [
    { "key": "limit-per-project", "name": "A spending limit per project", "area": "seeing-the-cost", "state": "live", "routed-to": null }
  ],
  "items": [
    { "key": "limit-warns-only", "kind": "decision", "thread": "limit-per-project", "text": "A limit warns and never blocks work.", "why": "A blocked run loses work the person already paid for.", "source": "person", "core": true, "scope": "keep" },
    { "key": "limit-blocks-runs", "kind": "decision", "thread": "limit-per-project", "text": "A limit stops a run when it is reached.", "source": "person", "replaced-by": "limit-warns-only", "scope": null },
    { "key": "no-limit-on-research", "kind": "decision", "thread": "limit-per-project", "text": "Research runs have no limit.", "source": "person", "accepted-risk": "One long research run can spend a month's budget in a day.", "scope": "keep" },
    { "key": "cost-rows-per-run", "kind": "finding", "thread": "limit-per-project", "text": "The cost ledger records one row per run.", "source": "code", "evidence": "lib/cost-ledger.mjs:12", "check": "verified" },
    { "key": "limit-is-one-number", "kind": "assumption", "thread": "limit-per-project", "text": "A limit is one number per project.", "source": "agent", "state": "named" },
    { "key": "one-number-vs-warn-only", "kind": "tension", "thread": "limit-per-project", "text": "One number per project pulls against warnings that must fit each kind of run.", "between": ["limit-is-one-number", "limit-warns-only"], "source": "agent", "state": "open" },
    { "key": "ledger-format", "kind": "question", "thread": "limit-per-project", "text": "Which format does the ledger export use?", "source": "agent", "state": "for-plan" }
  ],
  "work": [],
  "selected": [],
  "log": [
    { "session": 1, "batch": 1, "thread": "limit-per-project", "kind": "fork", "asked": "<question in ten words>", "answer": "<answer in ten words>" }
  ],
  "consult-runs": []
}
```

- **Keys** are kebab-case words (`^[a-z0-9]+(-[a-z0-9]+)*$`), stable once written, and unique across areas, threads, items, and work. A key names the thing, so a key that leaks into chat still means something.
- **`areas[].side`** is `problem`, `solution`, or `both`. **`areas[].state`** is `open`, `touched`, or `explored`. **`areas[].brief`** is five plain lines or fewer: what we decided, what is core, what is still open, and the scope. **`areas[].scope`** is `keep`, `cut`, `later`, `mixed`, or `null`, and is set when the area closes or at `done`.
- **`page`** is the link of the published page, or `null` where the host has none.
- **`threads[].state`** is `live`, `parked`, `routed`, or `dropped`. A dropped thread carries `reason`.
- **`items[].kind`** is `decision`, `idea`, `finding`, `question`, `assumption`, or `tension`.
  - `source` is `person`, `agent`, `code`, `data`, `research`, `consult`, or `history`.
  - A finding carries `evidence` (a `file:line`, a dataset, or a link) and `check` (`verified`, `contradicted`, or `unverified`).
  - `state` is `named`, `confirmed`, or `rejected` for an assumption; `open` or `resolved` for a tension; `open`, `answered`, or `for-plan` for a question. A commitment is a question with `state: for-plan`.
  - `scope` is `keep`, `cut`, `later`, or `null`, and is set when the item's area closes or at `done`. A cut carries the person's `reason` when the person gives one.
  - `core: true` marks a decision the person named as core when the area closed.
  - `accepted-risk` is the consequence the person accepted with a decision, in one plain sentence.
  - `replaced-by` is the key of the newer decision that replaced this one.
  - `was` holds a legacy id after a conversion.
- **`log[].kind`** is `reflection`, `probe`, `fork`, `widen`, `choice`, `check-in`, `close`, `control`, or `walk`.

A **piece of work** (one per agreed piece at `done`, in order):
```json
{ "key": "spending-limit", "order": 1, "title": "Add a warning-only spending limit per project", "shape": "intake", "threads": ["limit-per-project"], "items": ["limit-warns-only", "cost-rows-per-run"], "entry": "/wf intake spending-limit from <slug>", "state": "proposed", "routed-to": null, "stale": false }
```
`shape` is `intake`, `investigate`, `fix`, `discover`, `task`, or `extension`. `state` is `proposed` or `routed`. `stale: true` with `stale-because` marks a piece of work that a later area changed.

## `01-brainstorm.md` — the person's document

```yaml
---
schema: sdlc/v1
type: brainstorm
slug: <slug>
topic: "<topic as given>"
status: open                 # open | distilled
board: brainstorm-board.json
page: null                   # the published page link, where the host has one
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
sessions: 1
batches: 0
consult-runs: []
revisions: []
---
```

The body names everything in words. It carries no key, no internal number, and no mode mechanics. It opens with a short front — the summary, the map with the area briefs, and what is open now — and the full record follows it. A replaced decision appears only under the decision that replaced it.

```markdown
# Brainstorm: <topic>

## The Brainstorm
<!-- STORY SECTION — first, and self-sufficient. It is the summary of what we believe now, rewritten at every check-in. Follow `../../_story-arc.md`: the thought we started from; what we now believe, with the reasons; what is still open and the sharpest tension. Language follows `../../_ste-procedural.md` sections 1 and 3. 1–3 short paragraphs. -->

## Map
### <area in words> — <problem side or solution side> — <open, touched, or explored>
<The brief: five plain lines or fewer — what we decided, what is core, what is still open, and the scope.>

## Open now
- <Each open tension, each accepted risk with the decision it belongs to, and each open question, one plain line each.>

<!-- The front ends here. The record follows. -->

## Decisions
### <area in words>
- <The decision, one sentence.> Why: <the reason given.> <"Core." when the person named it core.> <"Accepted risk: …" when it has one.> <"This replaced: …" when it replaced an older decision.>

## Ideas still open
- <The idea, one sentence, and who raised it: you or the agent.>

## What we found
- <The finding, one sentence.> Source: <file:line, dataset, or link>.

## What we are assuming
- <The assumption, and whether it is still open, confirmed, or rejected.>

## Tensions
- <What pulls against what, and whether it is still open.>

## Questions for the plan
- <A commitment this brainstorm does not make, one sentence.>

## Scope
<Empty until `done`. Then the agreed scope: the kept items by piece of work, the items left for later, and the cut items with the person's reasons.>

## Work
<Empty until `done`. Then each piece of work in order: its title, what it carries, its form, and its entry command.>

## How to continue
- Resume: `/wf intake brainstorm <slug>`
- Control words: `park <thread>` · `pull <thread>` · `drop <thread>` · `board` · `look it up` · `second opinion` · `done`
- Retire when no thread is live: `/wf close <slug>`
```

## Converting a legacy board

A legacy board is a `01-brainstorm.md` whose frontmatter carries `threads:` and `claims:` and which has no `brainstorm-board.json`. Convert it once, at the start of the first resume:
1. Copy the legacy `01-brainstorm.md` to `history/` unchanged.
2. Give every thread, claim, assumption, contradiction, and candidate a readable key, and keep its old id in `was`.
3. Map the kinds:
   - A claim with `evidence: verified …`, `contradicted …`, or `consult` becomes a finding. Its `check` comes from the evidence.
   - Any other claim becomes a decision when the turn log shows that the person chose it, and an idea otherwise.
   - An assumption stays an assumption, and a contradiction becomes a tension.
   - A candidate becomes a piece of work, with its `state` and `routed-to` kept.
4. Make each thread an area unless the board has a `## Map`.
5. Write `brainstorm-board.json`. Rewrite the body of `01-brainstorm.md` per the template above: the summary first, then every section in plain words. Keep the legacy turn log in the JSON `log`.
6. Remove `threads`, `claims`, `assumptions`, `contradictions`, `candidates`, and `selected` from the frontmatter, and add `board: brainstorm-board.json`.
7. Show the new summary to the person at the first check-in, and ask whether it is right.
