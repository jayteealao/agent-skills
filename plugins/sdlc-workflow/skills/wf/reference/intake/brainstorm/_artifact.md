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
  "stories": [
    { "session": 1, "text": "We set out to see what a project costs. We learned that the ledger already records every run, so the gap is showing the cost, not measuring it. You chose a limit that warns and never blocks, because a blocked run loses work already paid for. The ledger format is still open. Next time we start with research runs." }
  ],
  "budgets": [
    { "key": "monthly-spend-cap", "name": "Spending stays under the monthly cap", "decision": "limit-warns-only" }
  ],
  "briefs": [
    { "key": "cost-visibility-brief", "name": "Cost visibility", "source": "pasted", "criteria": [
      { "key": "cost-shown-per-run", "part": "good", "text": "Every run shows what it cost.", "status": "covered", "items": ["cost-rows-per-run"] },
      { "key": "surprise-bill", "part": "failure", "text": "A bill arrives with no warning.", "status": "partial", "items": ["limit-warns-only"] }
    ] }
  ],
  "areas": [
    { "key": "seeing-the-cost", "name": "Seeing what a project costs", "side": "problem", "state": "explored", "brief": "A limit per project warns and never blocks. Core: the warning. Open: the ledger format. Scope: kept.", "scope": "keep" }
  ],
  "threads": [
    { "key": "limit-per-project", "name": "A spending limit per project", "area": "seeing-the-cost", "state": "live", "routed-to": null }
  ],
  "items": [
    { "key": "limit-warns-only", "kind": "decision", "thread": "limit-per-project", "text": "A limit warns and never blocks work.", "why": "A blocked run loses work the person already paid for.", "source": "person", "core": true, "first-version": true, "scope": "keep" },
    { "key": "limit-blocks-runs", "kind": "decision", "thread": "limit-per-project", "text": "A limit stops a run when it is reached.", "source": "person", "replaced-by": "limit-warns-only", "scope": null },
    { "key": "no-limit-on-research", "kind": "decision", "thread": "limit-per-project", "text": "Research runs have no limit.", "source": "person", "accepted-risk": "One long research run can spend a month's budget in a day.", "top-risk": true, "scope": "later" },
    { "key": "cost-rows-per-run", "kind": "finding", "thread": "limit-per-project", "text": "The cost ledger records one row per run.", "source": "code", "evidence": "lib/cost-ledger.mjs:12", "check": "verified" },
    { "key": "limit-is-one-number", "kind": "assumption", "thread": "limit-per-project", "text": "A limit is one number per project.", "source": "agent", "state": "named" },
    { "key": "one-number-vs-warn-only", "kind": "tension", "thread": "limit-per-project", "text": "One number per project pulls against warnings that must fit each kind of run.", "between": ["limit-is-one-number", "limit-warns-only"], "source": "agent", "state": "open" },
    { "key": "ledger-format", "kind": "question", "thread": "limit-per-project", "text": "Which format does the ledger export use?", "source": "agent", "state": "for-plan" }
  ],
  "work": [],
  "selected": [],
  "log": [
    { "session": 1, "batch": 1, "thread": "limit-per-project", "kind": "fork", "asked": "<question in ten words>", "answer": "<answer in ten words>" },
    { "session": 1, "batch": 2, "thread": "limit-per-project", "kind": "talk", "asked": "<what the talk explained, in ten words>", "answer": "<the reply in ten words>" }
  ]
}
```

- **Keys** are kebab-case words (`^[a-z0-9]+(-[a-z0-9]+)*$`), stable once written, and unique across areas, threads, items, and work. A key names the thing, so a key that leaks into chat still means something.
- **`areas[].side`** is `problem`, `solution`, or `both`. **`areas[].state`** is `open`, `touched`, or `explored`. **`areas[].brief`** is five plain lines or fewer: what we decided, what is core, what is still open, and the scope. **`areas[].scope`** is `keep`, `cut`, `later`, `mixed`, or `null`, and is set when the area closes or at `done`.
- **`page`** is the link of the published page, or `null` where the host has none.
- **`stories[]`** holds the story of each session ([_talk.md](_talk.md)): its `session` number and its plain `text`.
- **`focus`** is `general` or `design`; absent means `general`. **`sketches[]`** holds each sketch of a design focus ([_design.md](_design.md)): `key`, `thread`, the keys of the `items` it shows, `link` (or `null`), `path` (the file `.ai/workflows/<slug>/design/sketches/<key>.<ext>`, or `null`), a plain `caption`, and `state` (`idea`, `carried`, or `dropped`).
- **`budgets[]`** holds each limit the person decided, with the key of the deciding item in `decision` ([_cohere.md](_cohere.md)).
- **`briefs[]`** holds each brief the person brought ([_brief.md](_brief.md)). `source` is `pasted` or a file path. Each criterion has a `part` (`good`, `failure`, `check`, or `other`), a `status` (`covered`, `partial`, `open`, or `out-of-scope`, with `reason`), and the keys of the items that answer it.
- **`threads[].state`** is `live`, `parked`, `routed`, or `dropped`. A dropped thread carries `reason`.
- **`items[].kind`** is `decision`, `idea`, `finding`, `question`, `assumption`, or `tension`.
  - `source` is `person`, `agent`, `code`, `data`, `research`, `consult`, or `history`.
  - A finding carries `evidence` (a `file:line`, a dataset, or a link) and `check` (`verified`, `contradicted`, or `unverified`).
  - `state` is `named`, `confirmed`, or `rejected` for an assumption; `open` or `resolved` for a tension; `open`, `answered`, or `for-plan` for a question. A commitment is a question with `state: for-plan`.
  - `scope` is `keep`, `cut`, `later`, `pending-cut`, or `null`, and is set when the item's area closes or at `done`. A cut carries the person's `reason` when the person gives one. `pending-cut` marks a cut of a decision whose piece of work is already `prepared` or `routed` ([_work.md](_work.md), Reopening).
  - `session` and `decided-at` record when the person made a decision. Write both on each new decision. A packet carries them, so intake can show the person how old each decision is.
  - A finding from research sets `evidence: research/R<NN>-<label>.md#<anchor>`. A finding from a reference cites the reference id, for example `F03`.
  - `core: true` marks a decision the person named as core when the area closed; `first-version: true` marks a decision in the area's first version.
  - `top-risk: true` marks the accepted risk that worries the person most in its area.
  - `accepted-risk` is the consequence the person accepted with a decision, in one plain sentence.
  - `replaced-by` is the key of the newer decision that replaced this one.
  - `design: true` marks an item about how the idea looks or behaves. These items travel to the design stage.
  - `was` holds a legacy id after a conversion.
- **`log[].kind`** is `reflection`, `probe`, `fork`, `widen`, `choice`, `talk`, `story`, `check-in`, `close`, `cohere`, `brief`, `control`, or `walk`.

A **piece of work** (one per agreed piece at `done`, in order):
```json
{ "key": "spending-limit", "order": 1, "title": "Add a warning-only spending limit per project", "shape": "intake", "slug": "spending-limit", "depends-on": [], "provides": [{ "key": "project-limit", "text": "Each project has a spending limit that warns." }], "expects": [], "threads": ["limit-per-project"], "items": ["limit-warns-only", "cost-rows-per-run"], "research": ["R01"], "references": ["F02"], "entry": "/wf intake .ai/workflows/<slug>/work/spending-limit.md", "state": "proposed", "routed-to": null, "stale": false }
```
- `shape` is the form: `intake`, `investigate`, `discover`, `fix`, `hotfix`, `task`, `extension`, or `write-now` ([_work.md](_work.md)). Older boards also hold `design` and `design-direction` pieces; a new board records those as `design-form` on the piece they serve.
- `slug`, `target-slug`, `depends-on`, `needs`, `provides`, `expects`, `shared`, `research`, `references`, `amends`, and `urgency` are agreed in 3.3 ([_work.md](_work.md)). `size` is `small`, `medium`, `large`, or `too-large`, from the count of carried decisions.
- A piece of work that carries design items also records `ux-impact` (the proposed value) and `sketches` (the keys of its carried sketches). Its packet `work/<slug>.md` carries `sketches:`: each key with its `path`, `link`, and `caption` from `sketches[]`.
- `state` is `proposed`, `prepared` (intake read its packet), `routed` (a successor workflow started), or `written` (a write-now piece the session wrote). A written piece records `written-files` (each `path` with its `section`) and `written-at`.
- `stale: true` with `stale-because` marks a piece of work that a later area changed.

## Sources: `research/` and `references/`

A brainstorm keeps every source it uses inside its own folder. A board item, a research note, or a packet never cites `.scratch/` or another gitignored path, because that citation breaks on another machine, in a worktree, and after a cleanup.

```
.ai/workflows/<slug>/
  research/
    index.md
    R01-<label>.md ...
  references/
    index.md
    <group>/...            (for example code/, transcripts/, reports/, briefs/)
  work/
    index.md               (written by work-packets.mjs)
    changes.md             (written by work-packets.mjs)
    <slug>.md ...          (the packets, written by work-packets.mjs)
```

**Research notes.** Every research act writes one note in `research/`:
- a `look it up` dispatch;
- a research sub-agent of a brief map or a coherence pass that reads outside the board;
- a second opinion;
- a talk turn that cites external sources.

Name the note `R<NN>-<label>.md`. `NN` counts up in this folder and never reuses a number. Give the note this frontmatter, then the result and the evidence in the body:
```yaml
---
id: R03
question: "<the question the research answered>"
asked-in: "session <N>, <thread key>"
method: "<look it up | brief map | coherence pass | second opinion | talk turn>"
sources: ["<URL, repo path, or reference id>"]
date: "<YYYY-MM-DD>"
---
```
A finding that comes from the note sets `evidence: research/R03-<label>.md#<anchor>`. The board item stays short; the note holds the detail. The `write` command at `done` regenerates `research/index.md`. A coherence pass regenerates it too ([_cohere.md](_cohere.md)): one line per note with its id, its question, and the item keys that cite it.

**References.** A reference is outside material that the session reads and cites: a pasted brief, a document, a dataset extract, code from another repository or branch, or a transcript.
1. Copy the reference into `references/<group>/`.
2. Add a row to `references/index.md`:
   ```
   | id | path | origin | copied-at | sha256 | bytes | copy |
   | F03 | references/reports/season-2025.csv | https://… | 2026-10-03 | <hash> | 48213 | yes |
   ```
3. When the file is larger than 5 MB, do not copy it. Record a pointer row with `copy: no`, the origin, the hash, the size, and how to fetch it. A raw dataset is the usual case.
4. Cite the reference by its id. To use a gitignored path, copy the file in or record a pointer row first.

A brief the person brings is copied to `references/briefs/`, and `briefs[].source` holds its reference id ([_brief.md](_brief.md)).

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
revisions: []
next-command: intake
next-invocation: "/wf intake brainstorm <slug>"
recommended-routes: [{invocation: "/wf intake brainstorm <slug>", reason: "resume the board", default: true}]
---
```

The body names everything in words. It carries no key, no internal number, and no mode mechanics. It opens with a short front — the summary, the map with the area briefs, and what is open now — then the story of each session, newest first, and the full record follows. A replaced decision appears only under the decision that replaced it.

```markdown
# Brainstorm: <topic>

## The Brainstorm
<!-- STORY SECTION — first, and self-sufficient. It is the summary of what we believe now, rewritten at every check-in. Follow `../../_story-arc.md`: the thought we started from; what we now believe, with the reasons; what is still open and the sharpest tension. Language follows `../../_ste-procedural.md` sections 1 and 3. 1–3 short paragraphs. -->

## Map
### <area in words> — <problem side or solution side> — <open, touched, or explored>
<The brief: five plain lines or fewer — what we decided, what is core, what is still open, and the scope.>

## Open now
- <Each open tension, each top risk with the decision it belongs to, and each open question, one plain line each.>

## Briefs
- <One line per brief: its name, how many criteria are covered, partial, open, and out of scope, and the open gaps in words. "None." when no brief was brought.>

<!-- The front ends here. The record follows. -->

## Sessions
### Session <N> — <YYYY-MM-DD>
<The story of the session: what we set out to explore, what we learned, what we decided and why, what is still open, and where the next sitting starts. Plain prose, about 100 to 200 words, newest session first.>

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
<Empty until `done`. Then each piece of work in order, one line each: its title, its form, and a link to its packet (`work/<slug>.md`), or the documents a write-now piece changed. No second copy of the packet content.>

## How to continue
- Resume: `/wf intake brainstorm <slug>`
- Control words: `park <thread>` · `pull <thread>` · `drop <thread>` · `board` · `look it up` · `second opinion` · `cohere` · `pause` · `done`
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
