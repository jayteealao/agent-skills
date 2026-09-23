# `/wf intake brainstorm` — a rubber-duck intake mode — plan

Status: **DRAFTED 2026-09-22** against v9.158.0 (`a4e3b579`); **W1–W7 and W9
BUILT 2026-09-22** as v9.159.0. The operator settled one point before the
draft (§11): a question turn is a **batch** of questions through the host's
question tool, not one question per turn. Departures from the draft, all
recorded in §11: the index pairs `next-command: intake` with the resume
invocation (the terminus guard rejects `user-continues`); a non-interactive
run asks no batch and returns the resume command (added for the eval case);
the prose-budget ratchet made the dispatcher additions shorter and cut six
restatements from `intake.md`, `yolo.md`, and `SKILL.md`; the surface
freeze's three pins were raised (`intakeModes` 13, `artifactStems` 95,
`frontmatterTypes` 67) with the earn rule's item 2 met by one transcript,
not three; `docs/site/reference/artifacts.html` was left untouched because
another session holds an uncommitted edit on the same row; `_story-arc.md`
gained the `## The Brainstorm` heading; P-B4 became a permanent hook test.
**W8 RAN 2026-09-22** on `SoccerManager`, slug
`brainstorm-realism-additions-20260922`, seven batches. It found three
defects, fixed in **v9.160.0** (§17): the agent distilled without the
person's `done`, `done` handed the person a list of intake commands rather
than a question, and a resumed board carried `status: distilled` with no
instruction to reopen it. Sessions 2 and 3 ran on the same board (129
questions in total) and found two more defects, fixed in **v9.162.0**
(§18): the agent interviewed rather than explored, and every question
carried board ids the person could not remember. The person then asked for `done` to be a scoping
conversation; that shipped in **v9.163.0** (§19). A high-level critique then found that the mode steered
the conversation with quotas, kept its bookkeeping for the agent, and gave
the agent a contradictory role; **v9.164.0** fixes all three (§20). The first live session on v9.164.0 then showed that
the mode drew out intent well but never asked the person to choose; **v9.165.0**
puts choosing into the conversation (§21). **Still open:** probes P-B1, P-B2, and P-B3, and
the `artifacts.html` row. Every line reference below was read from the
working tree at v9.158.0.

Related: [INTAKE-MODES-REPAIR-PLAN.md](INTAKE-MODES-REPAIR-PLAN.md) (the
mode family's terminus contracts), the archived
[INTAKE-AUDIT-MODE-PLAN.md](archived/INTAKE-AUDIT-MODE-PLAN.md) (the last
mode added; its Appendix A lists what an intake mode gets for free),
`skills/wf/reference/intake/ideate.md` (the closest sibling),
`skills/wf/reference/_gate-question.md` (the question ladder this plan
extends), [MOD-FEATURES.md](MOD-FEATURES.md) §4 (the question counter),
[RELEASE-DISCIPLINE.md](RELEASE-DISCIPLINE.md).

## 1. Goal

A person with a half-formed thought runs `/wf intake brainstorm <topic>`
and thinks it through with the agent as the duck. The person does the
generating. The agent asks question batches, reflects each thought back as
candidate readings, names the assumption inside it, and keeps a board on
disk. When the person says `done`, the agent distills the live threads into
candidate cards, each with an entry command that carries `from <slug>`, and
the board stays open until every thread is routed, parked, or dropped.

## 2. Why a new mode

- No mode runs a person-driven loop today. `ideate` scans the codebase and
  generates; the person only picks. `investigate` asks at most three
  questions, then writes option cards for a stated problem. `shape` runs a
  fixed 20-question interview, agent-paced, multiple-choice. `consult`
  returns one panel per call and does not converse.
- The dispatcher's auto-route table sends "brainstorm ways to …" to `ideate`
  (`intake.md:63`). A person who wants to talk gets a sub-agent scan.
- The rubber-duck payoff is the assumption the person did not know they
  held. `shape`'s Ambiguity Inventory surfaces those for a request that
  already exists. Nothing does it before the request exists.
- Everything a conversational mode needs is already in the tree: the
  question ladder, the question-craft contract, the additive-write
  contract, the provenance contract, the terminal `workflow-index` root,
  and the free narrative-fragment tier.

## 3. Decisions

These are fixed for the build. A wave that needs a different answer stops
and asks the operator.

1. **An intake mode, not a top-level key.** The dispatcher's own rule
   (`intake.md:12`) is that a flow which enters the lifecycle is an intake
   mode, and only a flow that acts on built code is a key. A brainstorm
   feeds intake. A 23rd key would also cost a picker row in the mod.
2. **Question batches, unbounded.** A turn asks one to four questions per
   call through rung 1 of the question ladder, and as many calls as the
   thinking needs. No question count is a floor and none is a cap. The
   person leaves the loop with the control word `done`, never by a count.
3. **The person generates, the agent questions.** The agent writes no
   solution, no plan, and no option card inside the loop. When the person
   asks for options, the agent records the request and routes the thread
   to `investigate` at `done`. The same STOP rule `ideate.md` carries
   applies: if the agent catches itself solving, it stops.
4. **The board is the memory.** The lead artifact is rewritten after every
   batch. A session that dies loses at most one batch. A resume
   (`/wf intake brainstorm <slug>`) reads the board and continues; it never
   re-asks a question the board answers.
5. **Stays-open terminus.** `done` distills, it does not close. One
   brainstorm often spawns several routes. Each routed thread marks itself
   `routed` with the successor slug; the person retires the workflow with
   `/wf close <slug>` when no thread is live. This is `audit`'s shape
   (`intake.md:97`), not `ideate`'s pick-closes shape.
6. **One bounded read per checkable claim.** When the person states
   something about the codebase that a read can check, the agent runs one
   read, cites `file:line`, and records the claim as `verified` or
   `contradicted`. A claim no single read can check is `unverified`.
   Sub-agents run only on the control word `look it up`.
7. **A new artifact type `brainstorm`.** The `ideation` renderer draws a
   ranked table with scores (`renderers/ideation.mjs:14–35`); a board of
   threads has no score, and a fake one would misread. R1 ships the type
   with the generic fallback renderer (`scripts/render-sunflower.mjs:358`,
   frontmatter card plus prose plus fragments). R2 adds
   `renderers/brainstorm.mjs`.
8. **Convention over flags.** Control words are the first token of a
   free-text reply: `park <thread>`, `pull <thread>`, `drop <thread>`,
   `board`, `look it up`, `second opinion`, `done`. No flags anywhere.
9. **Aid, never gate, in the mod.** The only mod change is one skip in the
   question-floor annotation. No new switch.

## 4. The turn contract

This is the content of `intake/brainstorm.md` Step 2. It is written here
once so the reference can be authored from it.

### 4.1 A batch

1. Read the board. Pick the live thread with the newest unanswered
   question, or the thread the person's last reply named.
2. Compose one to four questions on that thread. A batch has one topic
   (S4). Every question is one of three kinds:
   - **Reflection.** "I heard: …" The options are two to four candidate
     readings of the person's last thought. Picking one confirms the
     reading. The free-text option is where the person rethinks.
   - **Probe.** A question on one assumption or one gap the last answer
     opened. The options are the agent's best guesses at the answer.
   - **Fork.** Two to four directions the thought can take next.
     Multi-select is allowed. At most one fork per batch.
3. Deliver the batch through rung 1 of `_gate-question.md` (the batch
   clause W1.1 adds). Under rung 2, render the batch as one message with
   lettered questions and numbered options.
4. Read the answers. A free-text answer that starts with a control word is
   a command (§4.3), not an answer.
5. Rewrite the board (§5): the new claims, assumptions, contradictions,
   and one turn-log line per question.
6. When a claim is checkable, run the one bounded read (decision 6) before
   the next batch and record the result on the claim.
7. Every fourth batch, append one **steer** question to the batch:
   Continue / Park a thread / Show the board / Done. The person can also
   steer at any time with a control word.

### 4.2 Question rules

- Every question follows `_question-craft.md` in full: the decision in
  outcome terms first, jargon named and translated, options that state
  consequences, reversibility stated, a recommended reading first when one
  exists.
- Every question and option follows `_ste-procedural.md` section 1.
- No question the board already answers. No question whose answer is in
  the last reply.
- No option that is a solution ("implement X with Y"). A solution-shaped
  answer from the person is recorded as a claim on the thread and, at
  `done`, routes to `investigate` or `fix`.
- A batch cites the board id it builds on (`T-02`, `A-04`) in the question
  text, so the person can follow the thread across batches.

### 4.3 Control words

| Word | Effect |
| --- | --- |
| `park <thread>` | The thread's state becomes `parked`. No further question on it until `pull`. |
| `pull <thread>` | The thread's state becomes `live`. |
| `drop <thread>` | The thread's state becomes `dropped` with the person's one-line reason. |
| `board` | Print the board (§5.3) to chat. No question this batch. |
| `look it up` | Dispatch one research sub-agent per `_subagents.md` on the last unverified claim, then continue. |
| `second opinion` | Run `/consult` with the board's live threads as the brief (§7). Fold the panel's distinct additions in as claims tagged `consult`. |
| `done` | Distill (§6). |

A control word that names an unknown thread id is answered with the
thread roster and no state change.

### 4.4 What the agent never does in the loop

- Never writes a plan, a slice, an option card, or code.
- Never runs a sub-agent without `look it up`.
- Never asks a question the board answers.
- Never closes the workflow.

## 5. The board

### 5.1 Files

```
.ai/workflows/brainstorm-<topic-slug>-<YYYYMMDD>/
  00-index.md          type: workflow-index, workflow-type: brainstorm
  01-brainstorm.md     type: brainstorm — the board
  01-brainstorm.<NN-label>.html.fragment   free narrative fragments, optional
  history/01-brainstorm-<rev>.md           one snapshot per session, per _additive-write.md
```

The slug derivation follows `ideate.md` Step 0 sub-step 2b: the topic's
kebab form, then the date from `_timestamp.md` with dashes removed; a
collision appends `-2`, `-3`.

### 5.2 `00-index.md`

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
title: "Brainstorm: <topic> <YYYY-MM-DD>"
workflow-type: brainstorm
current-stage: brainstorm
status: ready
branch-strategy: none
open-questions: []
next-command: intake
next-invocation: "/wf intake brainstorm <slug>"
progress:
  brainstorm: in-progress
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
---
```

`progress.brainstorm` becomes `complete` at `done`. `next-invocation`
becomes `"/wf close <slug>"` when no thread is live. The template carries
`title:`, `updated-at:`, and object-form `progress:` because
`intake-terminus-contracts.test.mjs:115` asserts all three for every
terminal index author.

### 5.3 `01-brainstorm.md`

```yaml
---
schema: sdlc/v1
type: brainstorm
slug: <slug>
topic: "<topic as given>"
status: open            # open | distilled
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
sessions: 1
batches: 0
threads:
  - id: T-01
    label: "<short noun phrase>"
    state: live         # live | parked | routed | dropped
    routed-to: null     # the successor slug once routed
claims:
  - id: C-01
    thread: T-01
    text: "<the claim>"
    evidence: unverified   # unverified | verified <file:line> | contradicted <file:line>
assumptions:
  - id: A-01
    thread: T-01
    text: "<the assumption the claim rests on>"
    state: named        # named | confirmed | rejected
contradictions:
  - id: X-01
    threads: [T-01, T-02]
    text: "<what conflicts>"
    state: open         # open | resolved
candidates: []          # written at done — see §6
selected: []
revisions: []
---
```

Body sections, in order:

1. `# Brainstorm: <topic>`
2. `## The Brainstorm` — the story section per `_story-arc.md`, rewritten
   at every batch to current truth.
3. `## Threads` — one `### T-NN — <label>` per thread: its state, its
   claims, its assumptions, and the contradictions it is party to. Prose,
   not a table.
4. `## Turn log` — one line per question: `batch N · T-NN · <kind> ·
   <question in ten words> → <answer in ten words>`.
5. `## Candidates` — empty until `done`; then one card per candidate (§6).
6. `## How to continue` — the resume command, the control words, and
   `/wf close <slug>`.

The revision ledger gets one entry per resumed session (`trigger: resume`)
and one at `done` (`trigger: manual`, `because: done`). It does not get an
entry per batch. The `history/` snapshot is taken at the start of every
resumed session and at `done`, not per batch.

### 5.4 Schema

A new `brainstormFrontmatter` branch in `tests/frontmatter.schema.json`
beside `ideationFrontmatter` (line 1669), and a `oneOf` entry beside line
1831. Required: `schema`, `type`, `slug`, `topic`, `status`, `created-at`.
`threads[]`, `claims[]`, `assumptions[]`, `contradictions[]`, and
`candidates[]` are typed arrays with the enums above. Without the branch
the root `oneOf` (`schema-validator.mjs:94–95`) matches nothing and
`post-write-verify` blocks the first write.

`brainstorm` is **not** added to `RICH_TIER_TYPES`
(`hooks/post-write-verify.mjs:66`), so no sibling `.yaml` or fragment is
required. Free fragments stay allowed.

## 6. `done` — distillation

1. Snapshot the board to `history/`.
2. For every `live` thread, write one candidate:
   ```yaml
   - id: B-01
     thread: T-01
     title: "<verb phrase>"
     shape: intake | investigate | fix | discover | task | extension
     entry: "/wf intake <slug-suggestion> from <slug>"
     state: proposed     # proposed | routed
   ```
   The `shape` follows the thread's content: a stated problem with
   unknown approach → `investigate`; a self-evident localized correction
   → `fix`; a yes/no truth question → `discover`; a deliverable that is
   not a code change → `task`; net-new scope on an existing workflow →
   `extension` (`/wf intake <existing-slug> <scope>`); everything else →
   `intake`. The shape vocabulary is the auto-route table's own
   (`intake.md:55–64`); the mode invents none.
3. A `parked` thread gets no candidate and stays parked. A `dropped`
   thread gets none.
4. Print the candidates to chat in `ideate.md` Step 5's card format, then
   ask which to act on: at most three candidates → one multi-select gate
   question; four or more → a numbered chat reply, exactly as `ideate.md`
   Step 5 does.
5. Record the selection in `selected:`. Print one entry command per
   selected candidate. Do not run any of them.
6. Set `status: distilled`, `progress.brainstorm: complete`. Leave the
   index `status: ready`. The workflow stays open.

A second `done` on a distilled board re-distills only threads whose state
changed since the last distillation.

## 7. Consult

The block follows the objective-trigger posture
(`consult-trigger-coverage.test.mjs:48–58`): an "Auto second opinion
(objective triggers)" paragraph that auto-invokes
`` `/consult codex <…>` `` when ANY of a named list holds. The names must
be rows of `_consult-triggers.md`. Two rows are new (W1.2):

| Trigger | Condition | Stages |
| --- | --- | --- |
| `thread-contested` | at `done`, a live thread is party to an `open` contradiction | intake |
| `claim-contradicted` | a claim's bounded read returned `contradicted` and the person kept the thread live | intake |

Existing rows the block also cites: `touches-auth`, `touches-billing`,
`touches-security`, `touches-migration` (a live thread touches one of
those surfaces), and `user-invoked` (the `second opinion` control word).
The consult brief is the board's live threads and open contradictions,
and the ask is "widen and name what this thinking missed". Additions come
back as claims tagged `consult`, never as candidates.

## 8. Provenance

`_intake-provenance.md` gains:

- **Detect §2**: `brainstorm` joins `investigate` and `ideate` as a
  labeled source. The labels are the candidate titles in `candidates[]`.
  Exact-match, 30-day window, one confirmation question, as the section
  already states.
- **Consume table row**:

  | `brainstorm` | `01-brainstorm.md`, the **routed thread's** claims, assumptions, and contradictions, plus the candidate card | The candidate title and the thread's `verified` claims seed the restated request. The `named` and `confirmed` assumptions seed the risk inventory. The `contradicted` claims seed known unknowns. The `dropped` and `parked` threads seed the out-of-scope list, so the successor does not re-widen. |

- **Link back**: `origin-brainstorm: <slug>` on the successor's index. The
  source is **not** decision-shaped as a whole, so `superseded-by` is not
  set; instead the successor sets the routed thread's `state: routed` and
  `routed-to: <new-slug>` and the candidate's `state: routed`. Updating
  those fields on an open board is additive.

## 9. Files

| File | Change |
| --- | --- |
| `skills/wf/reference/intake/brainstorm.md` | **new** — the mode reference (§4–§7 as steps; slug-mode block; pipeline line; what it is NOT; resume; consult block; chat return) |
| `skills/wf/reference/intake/brainstorm/_artifact.md` | **new** — the §5.3 template and body sections |
| `skills/wf/reference/_gate-question.md` | the batch clause (W1.1) |
| `skills/wf/reference/_consult-triggers.md` | two rows (§7) |
| `skills/wf/reference/intake/_intake-provenance.md` | Detect §2, one Consume row, the Link back paragraph (§8) |
| `skills/wf/reference/_compressed-slice.md` | lines 5, 16, 29: `brainstorm` after `audit` |
| `skills/wf/reference/intake.md` | lines 2, 3, 6, 16, 25, 35, 52 (mode sets); line 63 (the `ideate` row loses the word "brainstorm"); a new auto-route row and two discriminator bullets near line 69; a span row after line 96; a file row after line 121 |
| `skills/wf/SKILL.md` | line 31 mode list — the only site; the `description:` line and the retired-key roster no longer enumerate modes (checked at v9.158.0) |
| `skills/wf/reference/status.md` | line 46 vocabulary |
| `skills/wf/reference/auto.md` | a `workflow-type: brainstorm` PAUSE arm beside the `audit` arm at line 62 |
| `skills/wf/reference/yolo.md` | line 50 terminal class |
| `skills/wf/workflows/yolo.js` | lines 562, 571 terminal class and the recorded next step |
| `tests/frontmatter.schema.json` | line 210 `workflow-type` enum; the `brainstormFrontmatter` branch after line 1683; the `oneOf` ref after line 1831 |
| `renderers/_paths.mjs` | `'01-brainstorm': ['brainstorm', null]` after line 61 — **`dist/` rebuild trigger** |
| `lib/leak-lexicon.mjs` | line 36: `\|brainstorm` — **`dist/` rebuild trigger** |
| `hooks/mod/register.ts` | line 716: skip the floor annotation when `bracket.command.slug === 'brainstorm'` |
| `hooks/mod/tests/register.test.ts` | one kit test beside line 824 |
| `tests/sunflower.test.mjs` | line 74 area: `01-brainstorm` → `brainstorm/INDEX.html` |
| `tests/unit/skills/intake-terminus-contracts.test.mjs` | line 42 `MODE_FILES`; line 113 `TERMINAL_INDEX_AUTHORS` |
| `tests/unit/skills/consult-trigger-coverage.test.mjs` | line 45 `SWEPT` |
| `tests/unit/skills/work-without-a-home.test.mjs` | lines 93, 109 assert `` `ideate`, `audit` `` adjacent — keep them adjacent by appending `brainstorm` after `audit` |
| `tests/unit/skills/brainstorm-mode.test.mjs` | **new** — roster drift guard and contract guards (W6) |
| `tests/wf-fixtures.json` | one fixture row; documentation only, the file has no consumer |
| `docs/site/reference/intake-modes.html` | a `brainstorm` section beside `ideate` (line 84) |
| `docs/site/reference/commands.html`, `docs/site/guides/choose-your-entry.html`, `docs/site/guides/investigation.html`, `docs/site/reference/artifacts.html`, `docs/site/guides/autonomous-drivers.html` | mode rosters and the entry decision |
| `README.md` | line 46 mode list |
| `.codex-plugin/plugin.json` | line 4 description mode list |
| `CHANGELOG.md` | the release heading |

Confirmed free at v9.158.0: `hooks/mod/catalog.ts` (the intake argument
hint already says `[mode]`), `hooks/mod/active.ts` `expectedArtifactOf`
(intake returns null, so any write under the slug counts as landed),
`COMPACT_KEYS` (intake is absent, so no post-stage compaction fires),
`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (neither
enumerates modes), `scripts/build.mjs` (renderers are discovered by
directory read at line 86, so R2's renderer needs no build edit),
`npm test` (automatic discovery).

## 10. Waves

### W0 — Probes (before W3)

| Probe | Question | Feeds |
| --- | --- | --- |
| P-B1 | Does Codex's `request_user_input` accept several questions in one call, and does it offer free text? | W1.1 batch clause, Codex row |
| P-B2 | Does pi's question tool accept up to four questions per call and offer free text? | W1.1, pi row |
| P-B3 | After a brainstorm turn ends with the board `status: open`, does the mod's `suggestNext` propose `/wf intake brainstorm <slug>` from the index? | §5.2 `next-invocation` |
| P-B4 | Does `post-write-verify` accept a `type: brainstorm` board once the W2 branch lands, on a fixture repo? | W2 gate |

P-B1 and P-B2 are one session each on the host. P-B3 and P-B4 are one
live session on the fixture repository (`scripts/mod-fixture.mjs <dir>`)
with `SDLC_HOOK_DEBUG=1`. Answers go in MOD-FEATURES.md §4 (P-B3) and in
this file's §11 (the rest).

### W1 — Shared contracts

| | |
| --- | --- |
| W1.1 | `_gate-question.md`: a **batch clause** after the ladder. "A citing site may deliver up to four questions in one rung-1 call when the host tool accepts a list. Under rung 2, one message carries the questions lettered A–D, each with its numbered options. Under rung 3, resolve each question by its own recorded default." The host table gains the per-host list limit from P-B1 and P-B2. The file keeps its rule that no other skill file names a question tool. |
| W1.2 | `_consult-triggers.md`: the two §7 rows. |
| W1.3 | `_intake-provenance.md`: the §8 edits. |
| W1.4 | `_compressed-slice.md`: `brainstorm` after `audit` at lines 5, 16, 29. |

Gate: `consult-trigger-coverage.test.mjs` and `work-without-a-home.test.mjs`
green. Nothing else changes behaviour yet.

### W2 — Schema, paths, lexicon

| | |
| --- | --- |
| W2.1 | `tests/frontmatter.schema.json`: `brainstorm` in the `workflow-type` enum (line 210). While there, note that `ideate` is absent from that enum although `status.md:46` treats it as a member; do **not** fix it in this wave, record it as a follow-up. |
| W2.2 | `tests/frontmatter.schema.json`: the `brainstormFrontmatter` branch (§5.4) and its `oneOf` ref. |
| W2.3 | `renderers/_paths.mjs`: the `'01-brainstorm'` line in the terminal-analysis block. Without it `resolveViewPath` returns null and the orchestrator skips the board (the file's own comment at lines 50–60). |
| W2.4 | `lib/leak-lexicon.mjs`: `brainstorm` in `STAGE_NAMES`. |
| W2.5 | `tests/sunflower.test.mjs`: the `01-brainstorm` assertion beside line 74. |
| W2.6 | `npm run build`; `dist/` rides the same commit. |

Gate: `npm test` green; P-B4 passes on the fixture repository.

### W3 — The mode reference

Author `intake/brainstorm.md` from §4–§8, in this step order:

| Step | Content |
| --- | --- |
| 0 | Parse: topic vs existing slug (resume) vs slug-mode. Derive the slug. Read recorded history for the topic: retro action items, `.ai/solutions/INDEX.md`, `sdlc-debt:` markers, as `ideate.md` Step 0 sub-step 3b does. Announce the plan in four lines. |
| 1 | Open the board: write `00-index.md` and an empty `01-brainstorm.md` with one `live` thread named from the topic. On resume: snapshot, ledger entry, print the board. |
| 2 | The loop (§4). Runs until `done`. |
| 3 | `done` (§6). |
| 4 | Chat return per `_chat-return.md`: narrative lead, then the anchors (threads by state, candidates, the resume command, the board path). |

The slug-mode block at the top follows `_compressed-slice.md`: on
`/wf intake <slug> brainstorm <topic>` the board is one compressed slice
`03-slice-brainstorm-<descriptor>.md` (`slice-type: brainstorm`), the loop
is the same, and `done` writes the candidates into the slice for a later
`/wf intake <slug> <scope>` extension. No new workflow.

Must **cite, never restate**: `_intake-context.md`, `_output-boundary.md`,
`_chat-return.md`, `_question-craft.md`, `_gate-question.md`,
`_additive-write.md`, `_compressed-slice.md`, `_subagents.md`,
`_timestamp.md`, `_story-arc.md`, `_ste-procedural.md`,
`_intake-provenance.md`. `output-boundary.test.mjs` and
`shared-reference-drift.test.mjs` auto-discover new reference files and
fail on a duplicated rule body.

Must **not** cite `_fix-loop.md`, and must not name a question tool.

W3.1 — `intake/brainstorm/_artifact.md`: the §5.3 template and body
sections, with the same comment markers `ideate/_artifact.md` uses for
the story section.

Gate: `intake-terminus-contracts.test.mjs`, `output-boundary.test.mjs`,
`shared-reference-drift.test.mjs` green with `brainstorm.md` registered
(W6).

### W4 — Dispatch surfaces

| | |
| --- | --- |
| W4.1 | `intake.md`: the seven mode-set sites (§9 row). |
| W4.2 | `intake.md` auto-route table: a `brainstorm` row — "the person has a thought and wants it examined: 'help me think through', 'talk me through', 'rubber duck', 'I have a half-formed idea', 'brainstorm with me'". The `ideate` row drops the phrase "brainstorm ways to …". Two discriminator bullets: `brainstorm` vs `ideate` (who generates: the person, or a codebase scan; "brainstorm ways to X" with no thought of the person's own is `ideate`); `brainstorm` vs `investigate` (`investigate` has a stated problem and wants approaches; `brainstorm` has no stated problem yet). `brainstorm` joins the proposable set at line 52. |
| W4.3 | `intake.md` span table: `brainstorm` — standalone: `01-brainstorm.md` + `00-index.md`, no branch; slug-mode: compressed slice; terminus: **stays open**; `done` distills candidates; each routes `from <slug>`; retire via `/wf close <slug>`. |
| W4.4 | `intake.md` file table: `brainstorm` → `intake/brainstorm.md`. |
| W4.5 | `SKILL.md` line 31. |
| W4.6 | `status.md:46`, `auto.md` PAUSE arm, `yolo.md:50`, `yolo.js:562/571`. The drivers drive nothing for a brainstorm slug; orientation hands back `/wf intake brainstorm <slug>` or, when distilled, the candidates' entry commands. |

Gate: `npm test` green.

### W5 — The mod

| | |
| --- | --- |
| W5.1 | `hooks/mod/register.ts:716`: the floor annotation returns `next(e)` when `bracket.command.key === 'intake'` and `bracket.command.slug === 'brainstorm'`. The counter keeps counting; only the "(question N, floor 20)" suffix is withheld, because a brainstorm has no floor. The same wart exists for every other mode keyword; this wave fixes only `brainstorm` and records the wider fix as a follow-up in MOD-FEATURES.md. |
| W5.2 | `hooks/mod/tests/register.test.ts`: a kit test beside line 824 — a `/wf intake brainstorm alpha` turn renders the question text unchanged. |

Gate: kit tests green.

### W6 — Tests

| | |
| --- | --- |
| W6.1 | `intake-terminus-contracts.test.mjs`: `brainstorm.md` in `MODE_FILES` and `TERMINAL_INDEX_AUTHORS`. |
| W6.2 | `consult-trigger-coverage.test.mjs`: `intake/brainstorm.md` in `SWEPT`. |
| W6.3 | New `tests/unit/skills/brainstorm-mode.test.mjs`: (a) roster drift — `intake.md`'s keyword set, span table, file table, `SKILL.md`'s intake row, `_compressed-slice.md`, `yolo.md`, and `status.md` all name `brainstorm`; (b) the reference names no question tool; (c) the reference carries the seven control words; (d) the reference carries "stays open" and `/wf close <slug>`, and does not carry `# Pick — decision closure`; (e) `_gate-question.md` carries the batch clause; (f) `_intake-provenance.md` has the `brainstorm` Consume row. |
| W6.4 | Schema round-trip: a `type: brainstorm` board with every array populated validates; a board with `state: pending` on a thread fails. |

Gate: `npm test` green.

### W7 — Docs

The six site pages in §9, `README.md:46`, `.codex-plugin/plugin.json:4`,
and the CHANGELOG heading. `npm run verify:docs` passes. There is no
automated roster guard on the site pages; the §9 table is the checklist.

### W8 — Live test

One real session on the fixture repository:

1. `/wf intake brainstorm "a per-slug cost budget"`. Run at least six
   batches. Use `park`, `board`, and `look it up` once each.
2. Close the session. Reopen. `/wf intake brainstorm <slug>`. The board
   prints and the next batch does not repeat an answered question.
3. `done`. Select one candidate. Run its printed entry command with
   `from <slug>`. The successor's index carries `origin-brainstorm`, and
   the board's thread reads `routed`.
4. `/wf close <slug>` on the board. `/wf status` lists it closed.

Record the transcript's deviations in §11 before W9.

### W9 — Release

One minor release under RELEASE-DISCIPLINE.md: gates, changelog heading,
catalog line, `npm version minor`, commit and tag by hand, push with tags,
reinstall the four hosts. `dist/` rides the W2 commit.

### R2 — later

- `renderers/brainstorm.mjs`: threads grouped by state, claims with their
  evidence chip, open contradictions first, candidates as cards. One
  snapshot case in `tests/unit/snapshots/_fixtures.mjs`.
- The wider mod fix: withhold the floor suffix for every non-default
  intake mode.
- `ideate` in the schema's `workflow-type` enum (the W2.1 note).

## 11. Operator decisions and build record (2026-09-22)

1. **Question batches, not one question per turn.** The draft proposed one
   open question per turn in plain chat. The operator rejected it: the
   agent asks as many questions as it wants, through the question tool.
   Decision 2 and §4.1 record it.
2. **The remaining four choices were delegated.** The operator asked for
   reasonable defaults. Decisions 1, 5, 6, and 7 are those defaults. A
   wave that finds one of them wrong stops and asks.
3. **Build the whole plan.** The operator said so; the build ran the same
   day in one session and shipped as v9.159.0.

Build record:

- **W0.** P-B4 is settled and permanent: `tests/unit/hooks/hooks.test.mjs`
  drives `post-write-verify` over a board and its index and expects exit 0
  with no stderr. P-B1, P-B2, and P-B3 are open; the batch clause in
  `_gate-question.md` covers both answers to P-B1 (a list, or one call per
  question).
- **W1–W7.** Built as §9 lists, with these departures. `00-index.md`
  carries `next-command: intake` (the terminus guard pairs the command with
  the invocation, and `user-continues` fails it). `brainstorm.md` Step 2
  says a non-interactive run asks no batch and returns the resume command,
  so the eval case (`tests/evals/cases/brainstorm.json`) has something to
  assert. `_story-arc.md` A1 lists `## The Brainstorm`. The prose-budget
  ratchet (`verify:prose`) forced the dispatcher additions to fifty words
  and six restatement cuts elsewhere in `intake.md`, `yolo.md`, and
  `SKILL.md`; the two lowered ratchets were written with `--update`. The
  surface freeze (`SURFACE-POLICY.md`) required a pin raise for the mode,
  the two artifact stems, and the frontmatter type; the earn rule's items
  1, 3, 4, and 5 are met, and item 2 is met by one transcript (the
  operator's own request), not three. `docs/site/reference/artifacts.html`
  is untouched: another session holds an uncommitted edit on the row the
  mode would join.
- **W8.** Not run. The build session was non-interactive, so no live
  brainstorm was driven. The first real session is the test.
- **Follow-ups.** The `artifacts.html` row once the other session lands;
  `ideate` in the schema's `workflow-type` enum (W2.1's note); the wider
  floor-suffix fix for every non-default intake mode (W5.1's note); a
  dedicated `renderers/brainstorm.mjs` (R2).

## 12. Risks

- **The agent solves instead of asking.** The STOP rule and decision 3
  are prose; nothing enforces them at runtime. W8 reads the transcript
  for it. If it recurs, R2 adds a `tool.call` guard in the mod that
  blocks Write outside `.ai/workflows/<slug>/` during a brainstorm turn.
- **Batches feel like an interrogation.** Four questions per call is the
  tool's cap, not a target. §4.1 step 2 says one topic per batch; the
  steer question every fourth batch gives the person the wheel. W8 judges
  the feel.
- **Rung 2 hosts get a wall of text.** A four-question batch as one chat
  message is long. P-B1 and P-B2 decide whether Codex and pi ever fall to
  rung 2 in practice.
- **The board rewrite per batch is slow on a big board.** A board is one
  markdown file; a rewrite is one Write. Past forty batches, the turn log
  is the bulk. If it hurts, R2 moves the turn log to a sibling file.
- **Auto-route misfires.** "Brainstorm ways to X" still reads as `ideate`
  by the W4.2 discriminator. A person who wanted the loop declines the
  proposal and types the mode keyword. The cost is one gate question.
- **A stale claim seeds a successor.** The provenance row says re-verify,
  do not copy, as every row does. The successor's research targets the
  claims; it does not trust them.

## 13. Considered and rejected

| Proposal | Why rejected |
| --- | --- |
| A top-level `/wf brainstorm` key | Breaks the dispatcher's key-vs-mode rule (`intake.md:12`) and adds a picker row. |
| One open question per turn, plain chat | Rejected by the operator on 2026-09-22 (§11). |
| Reuse `type: ideation` with a `mode: brainstorm` discriminator | The ideation renderer draws a scored ranked table (`renderers/ideation.mjs`); a board has no scores. The fallback renderer is the honest R1. |
| Pick-closes terminus, as `ideate` | A brainstorm routes several threads; a single pick would strand the rest. `audit`'s stays-open shape fits. |
| Free reads of the codebase whenever the agent wants | Turns the duck into a researcher and the loop into `investigate`. One bounded read per checkable claim keeps the person generating. |
| A per-batch revision ledger entry | Forty entries for one sitting is noise. One entry per session and one at `done`. |

## 14. Sources

- `skills/wf/reference/intake.md` lines 2–3, 6, 12, 16, 25, 35, 52–74,
  86–104, 111–128.
- `skills/wf/reference/intake/ideate.md` Step 0 sub-steps 2b–3b, Step 5,
  Step 6, `# Pick — decision closure`.
- `skills/wf/reference/intake/investigate.md` lines 62, 163–215.
- `skills/wf/reference/intake/_intake-provenance.md` Detect, Consume, Link back.
- `skills/wf/reference/_gate-question.md` lines 1–40.
- `skills/wf/reference/_question-craft.md` lines 1–40.
- `skills/wf/reference/_consult-triggers.md` lines 24–52.
- `skills/wf/reference/_compressed-slice.md` lines 5, 16, 29.
- `skills/wf/reference/status.md` line 46; `yolo.md` line 50;
  `workflows/yolo.js` lines 562–571; `auto.md` line 62.
- `tests/frontmatter.schema.json` lines 206–211, 1669–1683, 1764–1837.
- `lib/schema-validator.mjs` lines 64–137.
- `hooks/post-write-verify.mjs` lines 41–98.
- `renderers/_paths.mjs` lines 43–61; `renderers/ideation.mjs` lines 4–50;
  `scripts/render-sunflower.mjs` lines 282–305, 353–367;
  `scripts/build.mjs` lines 81–86.
- `lib/leak-lexicon.mjs` lines 32–36.
- `hooks/mod/register.ts` lines 128–137, 180, 714–726, 813;
  `hooks/mod/active.ts` lines 66–128.
- `tests/unit/skills/intake-terminus-contracts.test.mjs` lines 40–44,
  113–134, 204–219; `consult-trigger-coverage.test.mjs` lines 34–58;
  `work-without-a-home.test.mjs` lines 93, 109; `tests/sunflower.test.mjs`
  lines 73–77.
- `docs/site/reference/intake-modes.html` lines 84–88; `README.md` line 46;
  `.codex-plugin/plugin.json` line 4.
- `docs/internal/archived/INTAKE-AUDIT-MODE-PLAN.md` Appendix A (what an
  intake mode gets for free; re-checked above at v9.158.0).

## 17. W8 — the live session, and the three defects it found

The first real session ran on 2026-09-22 in `~/Documents/dev/SoccerManager`:
`/wf intake brainstorm what needs to be added to players, teams, tactics and
match engine to improve realism`. It produced the slug
`brainstorm-realism-additions-20260922`, seven batches of two to four
questions, 39 claims, 16 assumptions, 6 contradictions, and 8 threads. The
loop itself worked: the batches landed, the control words were never needed,
the board carried the state, and the bounded reads grounded the claims.

Three defects appeared at the end of the session.

**D1 — the agent ended the loop.** After batch 7 the agent wrote "All eight
threads have material now. I distill." The person never sent `done`. The
transcript holds exactly two person-authored text turns, both the opening
command; every other answer arrived through the question tool. The mode said
"Repeat until the person says `done`", which is a condition, not a
prohibition, so nothing stopped the agent from judging the thinking complete.
**Fix:** a WARNING at the head of Step 2 that the agent never ends the loop,
a discipline rule that forbids judging the thinking complete, and an entry
gate on Step 3 that admits only the person's `done`.

**D2 — `done` gave the person homework.** Step 3 printed eight candidate
cards with eight `/wf intake … from <slug>` commands and asked which to act
on. The person wanted to be asked what to do with the thinking. The mode had
assumed the answer was always "start workflows". **Fix:** Step 3 prints the
live threads with no command, then asks one disposition batch — keep the
board, write the thinking up, start work on some threads, take a second
opinion, or drop threads — and produces only what the person chose. Entry
commands are written for chosen threads only.

**D3 — a resumed board stayed closed.** Step 3 set `status: distilled` and
`progress.brainstorm: complete`, and Step 0's resume path never said to undo
either. **Fix:** the resume path reopens a distilled board, and Step 3 sets
`distilled` only when the person chose to start work or to write the thinking
up.

The person owns the end of a brainstorm. That is the rule the three fixes
share, and it is now pinned by three guard tests in
`tests/unit/skills/brainstorm-mode.test.mjs`.

## 18. Sessions 2 and 3 — the agent interviewed, and it spoke in ids

Sessions 2 and 3 resumed `brainstorm-realism-additions-20260922` on
2026-09-22 and 2026-09-23. Across the three sessions the agent asked 129
questions. The board grew to 213 claims, 8 threads, and 41 named
assumptions. The person's verdict: the agent does not properly explore the
problem and solution space, and its questions use numbering the person
cannot remember.

**D4 — the agent interviewed; it did not explore.** Every question was a
closed choice among four options the agent wrote. No question was open. In
session 3, 24 of 82 questions opened from a contradiction the agent had
logged, for example whether a tactic change "counts twice" against a measured
possession rule. The new ground came from the person: the manager as an
entity, the season layer, "moments" as a development factor, and further
personality traits all arrived in free text (44 free-text answers in the
three sessions), and the person picked every option on 13 multi-select
questions. The person also had to correct the frame ("all actions in
football are important", after the agent made the duel the central action)
and ask for a full list of actions. The loop drifted into plan-level design:
which provider schema to copy, which provider wins a conflict. Three rules in
the mode caused this. The framing said "the person does the generating" and
"you do not solve", so the agent contributed no ideas of its own. Step 2.1
chose "the live thread with the newest unanswered question", which only goes
deeper. Step 2.2 loaded `_question-craft.md` in full, and that file is the
contract for decision interviews (frame the decision, recommend, state
reversibility).

**D5 — the questions spoke in board ids.** Step 2.2 said "Name the board id
the question builds on in the question text." IDs per question rose from 1.2
in session 1 to 3.2 in session 3: 264 ids in 82 questions. Headers carried
ids ("X-24 agree") and so did the chat ("Batch 22 follows up on X-22 and on
the cost A-42 names"). The person answered "Explain this more" at least four
times, and each answer cost a batch.

**Fix (v9.162.0).**
- The framing is a **thinking partner**: the person leads, the agent explores
  beside the person, maps the space, and brings directions of its own. It
  still decides nothing and designs nothing.
- Step 0.3 **maps the space** (problem side and solution side, every member
  of a named family) before any area goes deep; the board gains a `## Map`
  body section with `open` / `touched` / `explored` areas. A resume starts
  from the map and adds what earlier sessions missed.
- Step 2.1 chooses where to go from the person's last reply first, then an
  unexplored area, then open assumptions. At most one question per batch
  resolves a contradiction. Signals of narrow options (every option picked,
  "mix of", "all", "more", a new idea) make the next batch widen.
- Step 2.2 adds the **widen** question kind (another point of view, a
  comparison, an extreme case, "what makes this feel wrong?") and requires
  one fork or widen question per batch. A new area starts from the problem.
  Questions cite only rules 2 and 3 of `_question-craft.md`: no
  `(Recommended)` option, and no "explain this more" option, because each
  question explains first.
- A new **Plain words** section: no board id and no mode mechanics in any
  text the person reads; plain headers; one plain sentence between batches.
  The ids stay in the board file.
- Technical design choices are recorded as questions for the plan, not asked.
- The steer question offers go deeper, open a new area, zoom out for what is
  missing, and show where we are.

Three guard tests pin the rules, and each fails against the v9.161.3 text.
The next live session is the test of the map and the widen question.

## 19. `done` is a scoping conversation

**What `done` did before v9.163.0.** After the v9.160.0 fix, `done` printed
the live threads, asked one disposition question (keep the board, write it
up, start work, second opinion, drop), and for "start work" asked which
threads and wrote one candidate per thread. In session 3 of the live board
the person answered the disposition question in free text ("what is a
reasonable split for this work"). The agent proposed a 12-unit split from
the board on its own, the person redirected it to three programmes, and the
agent wrote 12 task cards. Every decision from 129 questions went into the
cards as it stood. Nothing let the person look back over the discussion and
cut.

**The person's requirement.** How the session becomes work is a decision the
person makes with the agent: talk about how to scope the decided changes, run
back through the discussion, and decide what to cut and what to keep.

**Fix (v9.163.0).** Step 3 has four parts.
- **3.1 Choose what happens now:** scope the work together, keep the board,
  or take a second opinion. No entry command.
- **3.2 Walk through the discussion:** one map area at a time, the area's
  decisions listed in plain words with their reasons, then keep all / go
  one by one / cut all / later per area, and keep / cut / later / change it
  per decision. The agent may give its view with a reason; the person
  decides. Each answer is written on the claim (`scope: keep | cut | later`,
  optional `reason`), so an interrupted walk resumes where it stopped. A
  kept decision that needs a cut one is raised before the next area.
- **3.3 Shape the work:** what comes first, how the kept decisions group,
  the order and dependencies, the size, and the form of each piece. The
  agent proposes a split and changes it until the person says it holds.
- **3.4 Confirm and record:** the scope in plain words (pieces in order,
  later, cut with reasons), a confirm, and only then one candidate per piece
  of work (`threads:` and `claims:` on the card), a `## Scope` section on the
  board, and printed entry commands. Nothing runs.

A cut decision never seeds a successor (`_intake-provenance.md`); a `later`
decision joins its out-of-scope list. Schema: optional `scope` and `reason`
on claims, optional `threads` and `claims` on candidates. Three guard tests
and two schema round-trips pin it.

## 20. Principles, a board for the person, and one clear role

A high-level critique after v9.163.1 named seven problems. The person chose
three to fix.

**Quotas steered the conversation.** "At most one contradiction question per
batch", "every batch holds a fork or widen question", and "a steer question
every fourth batch" regulated the conversation with counters, and counters
produce the mechanical behaviour they were added to prevent. **Fix:** the
reference now has three layers. *Your role* says what the agent is for.
*Invariants* hold the few hard rules that protect the person: only the person
ends the loop, plain words, no commitments and no code, nothing becomes work
until the person confirms, the board is the memory, and evidence is bounded.
*Craft* holds seven principles, each with its reason and a weak and a better
example: follow the person, go wide before deep, bring your own ideas, start
from the problem, raise a tension when it matters now, read the signals, and
explain then ask. The steer question became a **check-in at a natural moment**.

**The bookkeeping was built for the agent.** The board was one YAML
frontmatter with 213 numbered claims that the person never read, and the ids
leaked into the questions. **Fix:** the board is two files with one truth.
`01-brainstorm.md` is the person's document, in plain prose with no keys: the
summary (`## The Brainstorm`, rewritten at every check-in), the map, the
decisions with their reasons, the open ideas, the findings with their sources,
the assumptions, the tensions, the questions for the plan, and, after `done`,
the scope and the work. `brainstorm-board.json` is the agent's board: areas,
threads, and items with **readable keys** (`club-style`, not `C-128`) and six
kinds (decision, idea, finding, question, assumption, tension), the scope
answers, the pieces of work, and the log. `$defs.brainstormBoard` in the
frontmatter schema defines it, and `post-write-verify` validates it on every
write (`isBrainstormBoardPath`, `validateBrainstormBoardFile`; opt-out
`hooks.validateBrainstormBoard: false`). Each **check-in** rewrites the
summary and asks the person to correct it, so the board consolidates as it
grows. A legacy board converts on its first resume (`_artifact.md`,
"Converting a legacy board"), and stays schema-valid until then.

**The agent's role contradicted itself.** "Bring directions of your own" sat
beside "you do not design" and "no option is a solution". **Fix:** one line
with its reason — *ideas are welcome; commitments are not.* An idea is
something the person could drop tomorrow at no cost; a commitment is
something other work would build on, and it is recorded as a question for the
plan. The agent may propose ideas including concrete solutions, compare them,
bring outside knowledge, disagree with a reason, and give its view. It may not
decide for the person, commit to a design, or write a plan or code. Options
asked for in the loop are given in the conversation; only a formal comparison
with evidence becomes an `investigate` piece of work.

**Other contracts.** `_intake-provenance.md` reads the routed piece of work
from the JSON board (a legacy board still works). `_consult-triggers.md`
words its two brainstorm rows as tension and contradicted statement; the
trigger names are unchanged. The eval case asserts the `board` field and the
JSON file. The `SoccerManager` board was converted by hand on release day
with the same rules the conversion section states.

Guard tests pin every invariant, every principle and its reason, the absence
of the three quotas and of the contradictory role sentences, the two-file
board, the six kinds, the synthesis beat, and the legacy conversion; each
fails against the v9.163.1 text. Schema round-trips cover the document, a
legacy board, a valid JSON board, and three invalid JSON boards, and a hook
test proves a broken or unparseable board blocks the write.

## 21. Choosing inside the conversation

The first live session on v9.164.0 (the `SoccerManager` realism board, session
6, 2026-09-23) ran 46 batches and 94 questions in two hours and added 166
items. It asked well: no id leaked, every new area started from the problem,
and nine research sub-agents fed their findings straight into the next
questions. It never made the person choose. The person chose every option in
36 of 45 multi-select questions, the agent disagreed once, two of 365 earlier
items changed, and the session ended with "Stop here", so about 230 decisions
waited for one `done` walk that grows with every session. Two check-ins asked
the person to confirm a summary that the question dialog had hidden. The
person chose all five fixes.

**Questions that choose.** "Read the signals" no longer widens when the person
picks every option: the next question on that thread is a **choice**, a new
question form whose options exclude each other (an order, a trade-off, or a
cut) and state their cost. A new principle, *Make the options choose*, says
that a "which of these belong?" list opens an area and choices follow it. It
is a response to a signal, not a counter.

**The counterweight.** A new principle, *Be the counterweight*: when the
person sets a risk aside or takes the costliest option, the agent states the
consequence once, in one sentence, in the next question text, and records the
choice as a decision with its `accepted-risk`. When the agent thinks a choice
is a mistake, it says so once, with its reason.

**Scope as an area closes.** A check-in that follows an explored area closes
it (§2.8 of the reference): the area gets a `brief` of five lines or fewer,
the person names the core decisions (`core: true`) and keeps, cuts, or leaves
the area for later (item `scope`, area `scope`), and says whether the area
changes existing work (work `stale`, `stale-because`). A newer decision that
replaces an older one sets `replaced-by`. `done` walks only the areas not yet
closed, and shaping proposes the piece that brings a stale piece up to date.
The person can answer "not yet".

**Every question carries its own context.** `_gate-question.md` gains the rule
for every gate in the plugin: the host's question dialog can hide the chat text
before it, so the question text carries the summary, the finding, or the list.
The brainstorm check-in, the board view, the `done` walk, and the scope
confirmation all put their content in the question.

**A document the person reads, and a live page.** The person's document opens
with a short front — the summary, the map with the area briefs, and a new
`## Open now` section (open tensions, accepted risks, open questions) — and the
full record follows. Where the host can publish a page, the agent builds
`brainstorm-page.html` beside the board, publishes it the first time the person
needs to see the board, records its link as `page` in both files, and
republishes it to the same link at each check-in, area close, `board`, and
`done`. The host contract `_host-invocation.md` gains a "Published page" row:
Claude Code uses the Artifact tool with the `artifact-design` skill when the
session lists it; Codex and pi have none, and the person reads the document.
The page presents the board and never replaces it.

**Schema.** `$defs.brainstormBoard` gains `page`, area `brief` and `scope`
(`keep|cut|later|mixed`), item `core`, `accepted-risk`, and `replaced-by` (a
readable key), work `stale` and `stale-because`, and the log kinds `choice` and
`close`. `brainstormFrontmatter` gains `page`. All are optional, so the
converted `SoccerManager` board stays valid and gains its briefs on its next
resume.

Guard tests pin each fix, and each fails against the v9.164.0 text: the choice
form and the removed widen-on-every-option rule, the counterweight, the area
close with its core, stale, and replaced-by records, the own-context rule in
the gate ladder and at every brainstorm question, the short front, and the page
with its host-contract row and no tool name in the mode. A schema round-trip
covers every new field and rejects an unknown area scope and a numbered
`replaced-by`.

