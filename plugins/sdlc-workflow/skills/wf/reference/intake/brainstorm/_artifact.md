# Brainstorm board templates (Step 1 of `intake/brainstorm.md`)

`intake/_light-index.md` holds the `00-index.md` template. This file holds the board, the sections of the person's document, and the conversion of a legacy board. `brainstorm-board.json` is the one source. `01-brainstorm.md` is the same content written for the person, in plain words and with no keys. A script renders the document from the board: every board command that writes the board renders it in the same call. Never edit the document's body, and never put a draft of it.

## `brainstorm-board.json` — the agent's board

The write hook validates this file against `$defs.brainstormBoard` in `schemas/frontmatter.schema.json` on every write.

```json
{
  "schema": "sdlc/v1",
  "artifact": "brainstorm-board",
  "slug": "<slug>",
  "topic": "<topic as given>",
  "updated-at": "<ISO 8601>",
  "sessions": 1,
  "batches": 0,
  "status": "open",
  "summary": "We started from bills that arrive with no warning. We now believe a limit per project that warns and never blocks is enough, because a blocked run loses work already paid for. The ledger format is still open, and one number per project may not fit every kind of run.",
  "stories": [
    { "session": 1, "date": "2026-10-03", "text": "We set out to see what a project costs. We learned that the ledger already records every run, so the gap is showing the cost, not measuring it. You chose a limit that warns and never blocks, because a blocked run loses work already paid for. The ledger format is still open. Next time we start with research runs." }
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
- **`areas[].side`** is `problem`, `solution`, or `both`. **`areas[].state`** is `open`, `touched`, or `explored`. **`areas[].brief`** is five plain lines or fewer: what we decided, what is core, what is still open, and the scope. **`areas[].scope`** is `keep`, `cut`, `later`, `mixed`, or `null`. The `close` part of a change file sets it from the scopes of the area's decisions and ideas, when the area closes or at `done`.
- **`summary`** is what we believe now, in 150 words or fewer: the thought we started from, what we now believe and why, and what is still open. The document shows it as `## The Brainstorm`.
- **`status`** is `open` or `distilled` (after `done`). The board owns it, and the document's frontmatter copies it.
- **`stories[]`** holds the story of each session ([_talk.md](_talk.md)): its `session` number, its `date` (`YYYY-MM-DD`), and its plain `text`.
- **`carried[]`** holds text of a document written by hand that maps to no other field: its `heading`, its `text` word for word, and `place` (`document`, the default, or `archive`). `board adopt` writes it. The document prints each entry as its own section. Remove an entry with `board prose "<root>" <slug> carried --heading "<heading>" --text ""` once its content is on the board.
- **`focus`** is `general` or `design`; absent means `general`. **`sketches[]`** holds each sketch of a design focus ([_design.md](_design.md)): `key`, `thread`, the keys of the `items` it shows, `link` (or `null`), `path` (the file `.ai/design/explore/<key>.html`, `<file>#<artboard>` when one file holds several sketches, or `null`), a plain `caption`, `state` (`idea`, `carried`, `dropped`, or `reference` for an outside link with no file), and for a published sketch `canvas` (`link`, `account`, `published-at`, `sha256` of the published file, and `previous[]` links).
- **`budgets[]`** holds each limit the person decided, with the key of the deciding item in `decision` ([_cohere.md](_cohere.md)).
- **`briefs[]`** holds each brief the person brought ([_brief.md](_brief.md)). `source` is `pasted` or a file path. Each criterion has a `part` (`good`, `failure`, `check`, or `other`), a `status` (`covered`, `partial`, `open`, or `out-of-scope`, with `reason`), and the keys of the items that answer it.
- **`threads[].state`** is `live`, `parked`, `routed`, or `dropped`. A dropped thread carries `reason`.
- **`items[].kind`** is `decision`, `idea`, `finding`, `question`, `assumption`, or `tension`.
  - `source` is `person`, `agent`, `code`, `data`, `research`, `consult`, or `history`.
  - A finding carries `evidence` (a `file:line`, a dataset, or a link) and `check` (`verified`, `contradicted`, or `unverified`).
  - `state` is `named`, `confirmed`, or `rejected` for an assumption; `open` or `resolved` for a tension; `open`, `answered`, or `for-plan` for a question. A commitment is a question with `state: for-plan`.
  - `scope` is `keep`, `cut`, `later`, `pending-cut`, or `null`. A new decision gets `keep` when the person makes it, unless its entry gives another scope. An idea gets its scope when its area closes, or at `done`. A cut carries the person's `reason` when the person gives one. `pending-cut` marks a cut of a decision whose work packet is already started ([_work.md](_work.md), Reopening).
  - `session` and `decided-at` record when the person made a decision. Write both on each new decision. A work packet file carries them with the decision, word for word.
  - A finding from research sets `evidence: research/R<NN>-<label>.md#<anchor>`. A finding from a reference cites the reference id, for example `F03`.
  - `core: true` marks a decision the person named as core when the area closed; `first-version: true` marks a decision in the area's first version.
  - `top-risk: true` marks the accepted risk that worries the person most in its area.
  - `accepted-risk` is the consequence the person accepted with a decision, in one plain sentence.
  - `left-to-build` is set on an open question, an open tension or a named assumption that the person left to the build when its area closed, or at `done`: `ask` (the campaign walk asks the person before it slices the work packet) or `decide` (the build chooses, and records the choice as an assumption). The item is in the `items` of exactly one build work packet.
  - `replaced-by` is the key of the newer decision that replaced this one.
  - `design: true` marks an item about how the idea looks or behaves. These items travel to the design stage.
  - `was` holds a legacy id after a conversion.
- **`archived[]`** records each run of the archive command (below): `session`, `at`, `file`, and the counts it moved.
- **`log[].kind`** is `reflection`, `probe`, `fork`, `widen`, `choice`, `talk`, `story`, `check-in`, `close`, `cohere`, `brief`, `control`, or `walk`.

A **work packet** (one per agreed work packet at `done`, in sequence order):
```json
{ "key": "spending-limit", "order": 2, "why-here": "the limit reads the cost rows of the first packet", "title": "Add a warning-only spending limit per project", "shape": "intake", "slug": "spending-limit", "threads": ["limit-per-project"], "items": ["limit-warns-only", "cost-rows-per-run"], "research": ["R01"], "references": ["F02"], "goal": "Each project has a spending limit that warns and never blocks a run.", "in-scope": ["a limit per project", "a warning when a run passes the limit"], "out-of-scope": ["a limit on research runs"], "acceptance-criteria": ["A run that passes the limit of its project shows a warning and completes."], "constraints": [], "risks": ["The warning can be read as a stop, and the person cancels a paid run."], "ux-impact": "visual", "ux-impact-confirmed": true, "try-out": "yes", "estimated-slices": 6, "entry": "/wf campaign <slug>", "state": "proposed", "stale": false }
```
The board also holds the stack of the list, once, at the top level: `"stack": { "platforms": [], "languages": [], "user-confirmed": true }`, with the fields of the `stack` block in `intake/default/_artifact.md`.
- `shape` is the form: `intake`, `investigate`, `discover`, `rca`, `fix`, `hotfix`, `task`, `extension`, or `write-now` ([_work.md](_work.md)). Older boards also hold `design` and `design-direction` work packets; a new board records those as `design-form` on the work packet they serve.
- `slug`, `target-slug`, `order`, `why-here`, `research`, `references`, `amends`, and `urgency` are agreed in the split of `done` ([_done.md](_done.md), step 4; [_work.md](_work.md)). `order` is the strict sequence 1 to n over every work packet. `why-here` is required on each work packet after order 1.
- A build work packet (`intake`, `fix`, `hotfix`, `extension`) carries its write-up: `goal`, `in-scope`, `out-of-scope`, `acceptance-criteria`, `constraints`, `risks`, `ux-impact` with `ux-impact-confirmed: true`, `try-out` (`yes` or `no`), and `estimated-slices` ([_work.md](_work.md), "The write-up of a build work packet").
- An older board also holds `depends-on`, `needs`, `provides`, `expects`, `size`, `shared` and `routed-to` on a work packet. The brainstorm does not agree these fields, and the `write` command does not put them into a work packet file.
- A work packet that carries design items also records `sketches` (the keys of its carried sketches). Its work packet file `work/<slug>.md` carries `sketches:`: each key with its `path`, `link`, `caption`, and `canvas` from `sketches[]`.
- `state` is `proposed`, or `written` (a write-now work packet the session wrote). A written work packet records `written-files` (each `path` with its `section`) and `written-at`. The migration of an old campaign also writes `open`, `done` and `dropped`, and a migrated work packet records `migrated`. Once the list is written, the work packet file holds the state of a work packet. Older boards also hold `prepared` and `routed`.
- `stale: true` with `stale-because` marks a work packet that a later area changed.

## Sources: `research/` and `references/`

A brainstorm keeps every source it uses inside its own folder. A board item, a research note, or a work packet file never cites `.scratch/` or another gitignored path, because that citation breaks on another machine, in a worktree, and after a cleanup.

```
<wf-dir>/
  research/
    index.md
    R01-<label>.md ...
  references/
    index.md
    <group>/...            (for example code/, transcripts/, reports/, briefs/)
  work/
    index.md               (the list, written by campaign.mjs)
    changes.md             (written by campaign.mjs)
    <slug>.md ...          (the packet files, written by campaign.mjs)
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

`node "<skill-dir>/scripts/wf.mjs" board render "<root>" <slug>` writes the document from the board. Every board command that writes the board runs the same render. The document names everything in words. It carries no key, no internal number, and no mode mechanics. Never edit its body, and never put a draft of it: change the board, and the document follows.

### Its frontmatter, and the owner of each field

```yaml
---
schema: sdlc/v1
type: brainstorm
slug: <slug>
topic: "<topic as given>"
status: open                 # open | distilled
board: brainstorm-board.json
focus: general               # general | design
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

| Field | Owner | How it changes |
|---|---|---|
| `slug`, `topic`, `board`, `focus`, `page` | the board | The render copies them from the board. |
| `status` | the board | `board set "<root>" <slug> status=distilled`, or `status=open`. On an older board with no `status`, the document keeps its own value until `board adopt` copies it to the board. |
| `sessions`, `batches` | the board | `board set "<root>" <slug> sessions=<n>`. A log entry moves `batches`. |
| `updated-at` | the board | Each board write moves it. |
| `created-at` | the document | The first render sets it. |
| `revisions` | the document | `record set "<root>" <slug> 01-brainstorm.md "revisions+={...}"`, per [_additive-write.md](../../_additive-write.md). |
| `next-command`, `next-invocation`, `recommended-routes`, `modes` | the document | The first render writes the defaults. Change them with `record set` on `01-brainstorm.md`. |

The render keeps every other field of the frontmatter. It removes the fields of a legacy board: `threads`, `claims`, `assumptions`, `contradictions`, `candidates`, and `selected`.

### Its sections

The front comes first, then the story of each session, then the full record:
- `## The Brainstorm` — the board's `summary`.
- `## Map` — each area with its side, its state, its `brief`, its threads with their states, and its scope. A closed area with an archived record links `archive/record.md`.
- `## Open now` — each open tension, each top risk with its decision, and each open question.
- `## Briefs` — each brief with its counts of covered, partial, open, and out-of-scope criteria, and the open gaps.
- `## Sessions` — the newest three stories, newest first. The older stories are in `archive/record.md`.
- `## Decisions` — the decisions by area, with the reason, the core mark, the scope, and the accepted risk. A replaced decision appears only under the decision that replaced it: "This replaced: …".
- `## Ideas still open`, `## What we found`, `## What we are assuming`, `## Tensions` — one plain line per item.
- `## Sketches` — with a design focus: each sketch with its caption, its file, its link, and its state.
- `## Questions for the plan` — each commitment this brainstorm does not make. `## Questions we answered` follows when a question was answered, and `## Ideas and questions you cut` when one was cut.
- `## Scope` and `## Work` — after `done` (a `work` list, or `status: distilled`). Each item of the record says its scope once: "In work packet <n>", "Left for later", or "Cut" with the person's reason. `## Scope` says how to read that and repeats no item. `## Work` gives each work packet in order with its form, its sources, and a link to its file. No second copy of the packet content.
- No key appears in the text. A key of three words or more that a text names, for example an evidence that lists other items, is printed as words: the name of its area or thread, else its words without hyphens.
- One section per entry of `carried[]`, word for word.
- `## How to continue` — the resume command, the control words, and the close command.

### Other board files

- **A design board of a feature** (`brainstorm-board-design.json`): the render writes `design-notes/brainstorm-design.md`, with the same frontmatter and `board: brainstorm-board-design.json`.
- **A slug-mode board** (`brainstorm-board-<descriptor>.json`): the document is the compressed slice `03-slice-brainstorm-<descriptor>.md`. Write the slice record first, with its frontmatter, its heading, and its provenance line ([../../_compressed-slice.md](../../_compressed-slice.md)). The render then writes the sections above into its body under that heading, and keeps its frontmatter. Before the slice record exists, a board command writes the board and warns that no document is written.

Add `--board <file name>` to each board command for these boards.

### A document written by hand

A document from an older session holds prose that the board may lack. `node "<skill-dir>/scripts/wf.mjs" board adopt "<root>" <slug>` reads it into the board:
1. It copies the document and the board to `history/` (`01-brainstorm-adopt-<time>.md` and `brainstorm-board-adopt-<time>.json`).
2. It takes `## The Brainstorm` as the `summary`, each map brief as the `brief` of the area of that name, and each `### Session <N> — <date>` as a story, when the board lacks them. It takes `status`, and the higher `sessions` and `batches`.
3. It renders the board, and checks each sentence of the old document against the render. A sentence counts as shown when one line of the render holds most of its words; markdown, punctuation, and labels such as "Why:" do not count, and a link counts by its address.
4. It keeps each sentence that the render does not show word for word in `carried[]`, under the heading of its section: `Earlier notes: <section>`, `Earlier map notes`, `Earlier sessions`, `Earlier summary`, or the section's own heading. A summary longer than 150 words is taken whole; the render only warns.
5. It renders the document.

The first board write on such a document runs the same adopt by itself. A document that the render wrote is never adopted again. A hand-written `archive/record.md` is kept the same way, in a `carried[]` entry with `place: archive`.

## Archive

A long brainstorm keeps its board and its document short. Run the archive command at each resume and after the `write` command at `done`, then render the document:
```
node "<skill-dir>/scripts/campaign.mjs" archive <wf-dir>
node "<skill-dir>/scripts/wf.mjs" board render "<root>" <slug>
```
1. The archive command moves the closed part of the board to `archive/board.json`: each item of a routed or dropped thread that no open work packet, brief, budget, sketch, or staying item names, and the log and stories of sessions older than the newest three. It records the move in `archived[]`.
2. The render writes `archive/record.md` from `archive/board.json` and the board: the older session stories, and the archived items by area. The map keeps the brief of each closed area, with a link to the record.
3. The archive command warns when `## The Brainstorm` is over 150 words. On a warning, write the summary shorter with `board prose`.

Read `archive/` only when the person asks about an archived item or area, or when a reopening changes one. To reopen an archived item, add it back with `board add item`, and remove it from `archive/board.json`.

## Converting a legacy board

A legacy board is a `01-brainstorm.md` whose frontmatter carries `threads:` and `claims:` and which has no `brainstorm-board.json`. Convert it once, at the start of the first resume:
1. Copy the legacy `01-brainstorm.md` to `history/` unchanged: write the output of `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> 01-brainstorm.md` there (per [_records.md](../../_records.md)).
2. Give every thread, claim, assumption, contradiction, and candidate a readable key, and keep its old id in `was`.
3. Map the kinds:
   - A claim with `evidence: verified …`, `contradicted …`, or `consult` becomes a finding. Its `check` comes from the evidence.
   - Any other claim becomes a decision when the turn log shows that the person chose it, and an idea otherwise.
   - An assumption stays an assumption, and a contradiction becomes a tension.
   - A candidate becomes a work packet, with its `state` and `routed-to` kept.
4. Make each thread an area unless the board has a `## Map`.
5. Write `brainstorm-board.json` with the file-write tool. Keep the legacy turn log in the JSON `log`.
6. Run `board adopt`. It takes the summary and the session stories into the board, keeps every other section word for word, removes the legacy fields from the frontmatter, adds `board: brainstorm-board.json`, and renders the document.
7. Show the new summary to the person at the first check-in, and ask whether it is right.
