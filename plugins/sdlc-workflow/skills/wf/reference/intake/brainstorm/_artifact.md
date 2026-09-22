# Brainstorm board template (Step 1 of `intake/brainstorm.md`)

`intake/brainstorm.md` holds the `00-index.md` template. This file holds `01-brainstorm.md`, the board. The board is rewritten to current truth after every batch; the roster arrays are what the renderer, the provenance contract, and a resumed session read, so keep every id stable once written.

**`01-brainstorm.md` — `type: brainstorm`**
```yaml
---
schema: sdlc/v1
type: brainstorm
slug: <slug>
topic: "<topic as given>"
status: open                 # open | distilled
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
sessions: 1
batches: 0
threads:
  - id: T-01
    label: "<short noun phrase>"
    state: live              # live | parked | routed | dropped
    routed-to: null          # the successor slug once routed
claims:
  - id: C-01
    thread: T-01
    text: "<the claim, one sentence>"
    evidence: unverified     # unverified | verified <file:line> | contradicted <file:line> | consult
assumptions:
  - id: A-01
    thread: T-01
    text: "<the assumption the claim rests on>"
    state: named             # named | confirmed | rejected
contradictions:
  - id: X-01
    threads: [T-01, T-02]
    text: "<what conflicts, one sentence>"
    state: open              # open | resolved
candidates: []               # written when the person starts work; see the card below
selected: []                 # candidate ids the person chose to act on
consult-runs: []
revisions: []
---
```

A candidate card (one per thread the person chooses to act on):
```yaml
candidates:
  - id: B-01
    thread: T-01
    title: "<verb phrase>"
    shape: intake            # intake | investigate | fix | discover | task | extension
    entry: "/wf intake <slug-suggestion> from <slug>"
    state: proposed          # proposed | routed
    routed-to: null
```

# Brainstorm: <topic>

## The Brainstorm
<!-- STORY SECTION — first, and self-sufficient. Must follow `../../_story-arc.md`: three beats in order — the thought the person brought and what the recorded history already said, the threads that opened and the assumptions that fell with reasons and counts, then the candidates this board enables plus the top open contradiction. Language must follow `../../_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs, rewritten at every batch to current truth. -->

*Sessions: <N> | Batches: <N> | Threads: <live> live · <parked> parked · <routed> routed · <dropped> dropped*

## Threads

### T-01 — <label>
**State:** <state>

<One paragraph in prose: the claims on this thread and their evidence, the assumptions named and which fell, the contradictions it is party to. Rewrite it to current truth; do not append.>

### T-02 — ...

## Turn log

<One line per question, in order: `batch N · T-NN · reflection|probe|fork|steer · <question in ten words> → <answer in ten words>`. A control word gets its own line: `batch N · control · <word> → <effect>`.>

## Candidates

<Empty until the person chooses to start work. Then one card per candidate: title, the thread it came from, the shape, the entry command, and the claims and assumptions the successor inherits.>

## How to continue

- Resume: `/wf intake brainstorm <slug>`
- Control words: `park <thread>` · `pull <thread>` · `drop <thread>` · `board` · `look it up` · `second opinion` · `done`
- Retire when no thread is live: `/wf close <slug>`
