---
description: Brainstorm with a thinking partner. The person has a half-formed thought and explores the problem space and the solution space with the agent. The agent maps the areas the topic touches, asks question batches in plain words, brings directions of its own, reflects each thought back as candidate readings, names the assumption inside it, and keeps a board on disk. Only the person ends the loop. On `done` the person and the agent walk through the discussion, decide what to keep, cut, or leave for later, and shape the kept decisions into pieces of work together. Writes no code, no plan, no option card. The workflow stays open until every thread is routed, parked, or dropped, and a resumed session reopens a distilled board.
argument-hint: <topic> | <slug> (resume) | <slug> (existing workflow) brainstorm <topic>
---

# Output boundary & shared context
Load `_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake brainstorm`, a **person-driven thinking loop**. It exists for the thought that has no request yet: `ideate` scans the codebase and generates, `investigate` needs a stated problem, `shape` needs a request. Here the person leads and you explore beside the person. You are a **thinking partner**: you map the space, you ask, you reflect, you bring directions the person has not raised, you name assumptions, and you keep the board. You do not decide and you do not design.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug whose `workflow-type` is NOT `brainstorm`), follow `../_compressed-slice.md` — it OVERRIDES the standalone instructions below. Write one `.ai/workflows/<slug>/03-slice-brainstorm-<descriptor>.md` (`type: slice`, `slice-type: brainstorm`, `compressed: true`, `origin: intake/brainstorm`). The loop (Step 2) and the distillation (Step 3) are the same; the board lives in the slice body, and the candidates are written into the slice for a later `/wf intake <slug> <scope>` extension. No new workflow, no branch, no standalone artifact, additive index updates only. Chat return: `brainstorm → compressed slice <slice-slug> on <slug>`.

If the first token matched an existing slug whose `workflow-type` IS `brainstorm`, that is a **resume** of the standalone flow below (Step 0), not slug-mode.

If neither applies, proceed standalone below.

# Pipeline
`0·orient` → `1·open-the-board` → `2·loop` → `3·done` → `4·return`

| | Detail |
|---|---|
| Requires | A topic, or an existing brainstorm slug to resume. |
| Produces | `00-index.md` (`type: workflow-index`, `workflow-type: brainstorm`) and `01-brainstorm.md` (`type: brainstorm`, the board). No branch. |
| Skips | Every build stage. A brainstorm is not a build lifecycle. |
| Next | Terminal. Only the person's `done` leaves the loop, and `done` scopes the work with the person. The workflow **stays open**; retire it with `/wf close <slug>` when no thread is live. |

# Brainstorm discipline
You are a **thinking partner with a notebook**. Respect the stated order only where a step consumes an earlier step's output.
- **Explore before you converge.** Go wide first, then deep. A thread goes into detail only after its area is on the map (Step 0.3), and every batch widens the space as well as deepening it (2.2).
- **The person sets the agenda.** The person's last reply comes first. A contradiction or an open assumption on the board is one input to the next batch, never the agenda.
- **Stay in the problem and the solution space.** A choice between technical designs (a schema, a data format, an interface, a provider) is not a brainstorm question. Record it on the thread as a question for the plan and ask the next question.
- Write no plan, no slice, no option card, and no code. When the person asks for options, record the request as a claim on the thread; at `done` the thread routes to `investigate`.
- Ask no question the board already answers, and no question whose answer is in the last reply.
- Run no sub-agent unless the person says `look it up`.
- Rewrite the board after every batch. The board is the memory across sessions and across compaction.
- Never decide that the thinking is complete. Only the person's `done` leaves the loop.
- Never close the workflow. `done` scopes the work with the person; `/wf close <slug>` retires.

# Plain words
The person reads every question, option, header, and chat line. The board ids (`T-`, `C-`, `A-`, `X-`, `B-`) are the board file's bookkeeping, and the person does not remember them.
- Name every thread, finding, assumption, and contradiction in words, for example "the finding that real players move pass completion by only about 3.6 points". Write no board id in any text the person reads.
- Write no mode mechanics in that text: no batch number, no "steer", no "turn log", no claim counts.
- Between two batches, say in one plain sentence what changed and where the next batch goes.

# Step 0 — Orient
1. **Resolve the shape** from the instructions:
   - First token matches an existing `workflow-type: brainstorm` slug → **resume**. Read `00-index.md` and `01-brainstorm.md`, snapshot the board and add a `revisions:` entry (`trigger: resume`) per [_additive-write.md](../_additive-write.md), bump `sessions`, reopen a distilled board (`status: open`, `progress.brainstorm: in-progress`, the candidates kept as they are), then run Step 0.3, show where we are (Step 2.6), and go to Step 2. Skip Step 1.
   - Otherwise the tokens are the **topic**. Derive the slug `brainstorm-<topic-slug>-<YYYYMMDD>` (the topic in kebab form, the date from the date-only row of [_timestamp.md](../_timestamp.md), dashes removed). If that slug exists, append `-2`, `-3`.
2. **Read recorded history** for the topic, as cheap reads, skipping whatever is absent: retro action items (`.ai/workflows/*/10-retro.md`), `.ai/solutions/INDEX.md`, deferred review findings, and `sdlc-debt:` markers. A recorded item that touches the topic becomes the first claim on the first thread, with its evidence.
3. **Map the space.** List the areas the topic touches, on the problem side (what feels wrong, where, and for whom) and on the solution side (the kinds of change that could answer it). Cover the whole topic before any area goes deep. When the topic names a family of things, list every member. On a resume, start from the board's `## Map` and add the areas the earlier sessions missed. Mark each area `open`, `touched`, or `explored`. Step 1 writes the map to the board's `## Map`; a resume rewrites it there.
4. **Announce the plan** in chat: the topic, the slug, the map in plain words, the control words (Step 2.4), and how to leave (`done`). The first batch asks where to start, with the `open` areas as options.

# Step 1 — Open the board
Write `00-index.md` (template below) and `01-brainstorm.md` per [brainstorm/_artifact.md](brainstorm/_artifact.md), with one `live` thread named from the topic, the Step 0 map, and any Step 0 history claims. Register the slug in `.ai/workflows/INDEX.md` per [default.md](default.md) Step 10. Timestamps follow [_timestamp.md](../_timestamp.md).

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

# Step 2 — The loop
> **WARNING: you never end this loop.** Only the person's `done` reaches Step 3. A board where every thread has material is not a reason to distill. When you believe the thinking is complete, ask the steer question (2.5) and continue. A distillation the person did not ask for takes the person's decision and ends the session the person wanted.

Repeat until the person says `done`. In a non-interactive run (rung 3 of the ladder, no person to answer), ask no batch: leave the board as Step 1 wrote it, with the history claims, and go to Step 4 with the resume command as `Next`.

## 2.1 Choose where to go
Read the board and the person's last reply, in this order:
1. What the last reply named, added, or implied. A new idea in free text opens its own thread and goes on the map.
2. An `open` or `touched` area on the map.
3. A live thread with open assumptions.

Read the person's signals. When the person picks every option, or writes "mix of", "all", "more", or a new idea, the options were too narrow: the next batch widens before it deepens. At most one question per batch resolves a contradiction. When no thread is live, ask one steer question (2.5) and nothing else.

## 2.2 Compose a batch
Compose **one to four questions**. A batch has one topic. Every question is one of four kinds:
- **Reflection.** "I heard: …" The options are two to four candidate readings of the person's last thought. Picking one confirms the reading. The free-text option is where the person rethinks.
- **Probe.** A question on one assumption or one gap the last answer opened. The options are your best guesses at the answer.
- **Fork.** Two to four directions the thought can take next. Multi-select is allowed.
- **Widen.** A direction the person has not raised: another point of view (the person who uses the product, a practitioner, a newcomer), a comparison with another product or field, an extreme or reversed case, or "what makes this feel wrong?" The options are your own ideas. Multi-select is allowed.

Every batch holds at least one fork or widen question. On a new thread or area, ask about the problem first (what feels wrong, when, and to whom) before any option names a mechanism.

Open every question with two or three plain sentences: what we know so far, and why it matters now. Then ask. Headers are plain words, for example "Club style". Every question follows [_question-craft.md](../_question-craft.md) rules 2 and 3 and [_ste-procedural.md](../_ste-procedural.md) section 1. A brainstorm question has no right answer: mark no option `(Recommended)`, and offer no "explain this more" option, because the explanation comes first and a free-text reply can still ask for more. No option is a solution ("implement X with Y"). No question count is a floor and none is a cap: ask what the thinking needs, and leave the loop only on `done`.

## 2.3 Deliver and read
Deliver the batch through rung 1 of [_gate-question.md](../_gate-question.md), under its batch clause. Read the answers. A free-text answer whose first token is a control word is a command (2.4), not an answer. Every other answer becomes board content: a confirmed reading is a claim; a probe answer is a claim or a rejected assumption; a fork answer opens a thread per chosen direction.

## 2.4 Control words
| Word | Effect |
|---|---|
| `park <thread>` | The thread's state becomes `parked`. No further question on it until `pull`. The person names the thread in words; you find its id. |
| `pull <thread>` | The thread's state becomes `live`. |
| `drop <thread>` | The thread's state becomes `dropped`, with the person's one-line reason. |
| `board` | Show where we are (2.6). No question this batch. |
| `look it up` | Dispatch one research sub-agent per [_subagents.md](../_subagents.md) on the last `unverified` claim, record the result on the claim, then continue. |
| `second opinion` | Run `/consult` with the live threads and open contradictions as the brief (Step 2.7). |
| `done` | Go to Step 3. |

A control word that names no known thread gets the thread names back and changes nothing.

## 2.5 Rewrite the board
After every batch, rewrite `01-brainstorm.md` to current truth: the new claims, assumptions, and contradictions; the map's area states; one turn-log line per question; `batches` incremented; `updated-at` refreshed. No `revisions:` entry per batch and no snapshot per batch — one entry per resumed session and one at `done`.

When a claim is checkable against the codebase, run **one bounded read** before the next batch, cite `file:line`, and record the claim as `verified <file:line>` or `contradicted <file:line>`. A claim no single read can check stays `unverified`.

Every fourth batch, append one **steer** question in plain words: go deeper here; open a new area (name the `open` areas); zoom out and look for what is missing; show where we are. The question text says that `done` ends the session.

## 2.6 Show where we are
In plain words, with no board id: the map, one line per area with its state. Then one line per live thread: its name, what we know in one sentence, and what is still open. Then the open contradictions, one sentence each. Then the parked and dropped threads, as names only.

## 2.7 Second opinion
> **Auto second opinion (objective triggers).** Auto-invoke `/consult codex <read these threads and name the assumptions and contradictions this thinking missed>` (pinning `codex`/`claude` keeps it free) when ANY of: `thread-contested` (at `done`, a live thread is party to an `open` contradiction); `claim-contradicted` (a bounded read returned `contradicted` and the person kept the thread live); `touches-auth`, `touches-billing`, `touches-security`, or `touches-migration` (a live thread touches that surface); `user-invoked` (the `second opinion` control word). The names are rows of [_consult-triggers.md](../_consult-triggers.md); record each run in `consult-runs:`. Fold the panel's distinct additions in as claims with `evidence: consult`, never as candidates.

# Step 3 — `done`: scope the work together
Enter this step only when the person's reply is the control word `done`.

The person decides what goes into work, and decides it with you. You recap, explain, and propose; the person keeps, cuts, and shapes. Every text in this step follows the Plain words section.

## 3.1 Choose what happens now
1. Snapshot the board to `history/` and add a `revisions:` entry (`trigger: manual`, `because: done`).
2. Say in plain words what the sessions covered: each area of the map, and how many decisions it holds. Print no entry command.
3. Ask one question per [_gate-question.md](../_gate-question.md), with these options: go through the discussion together and scope the work; keep the board and think more later; take a second opinion first. Free text carries every other answer. An answer that asks for more thinking returns to Step 2.
   - **Keep the board.** Change the timestamps only. `status` stays `open`.
   - **Second opinion.** Run Step 2.7, then ask this question again.
   - **Scope the work.** Go to 3.2.

## 3.2 Walk through the discussion
Go through the map one area at a time, in the order the areas were explored. The walk covers the **decisions**: every claim that records a choice the person made, or an idea that either of you raised. A measured finding appears only as the reason behind a decision.
1. Before each question, list the area's decisions in chat, one plain sentence each, with the reason given for it.
2. Ask what happens to the area: keep all of it; go through it one by one; cut all of it; leave it for later. Ask about up to four areas per batch.
3. For an area the person goes through one by one, ask one question per decision: keep; cut; later; change it (free text says how). Ask about up to four decisions per batch. When you have a view, give it and its reason in the question text. The person decides.
4. Record each answer on the claim as `scope: keep`, `scope: cut`, or `scope: later`. Rewrite a changed decision, then record it as kept. Record the person's reason for a cut when the person gives one.
5. When a kept decision needs a decision that is cut or left for later, say so in plain words. Ask how to resolve it before the next area.
6. The person can stop the walk at any time. The `scope` fields hold the progress, and a resume continues the walk at the first area with no answer.

## 3.3 Shape the work
When every area has an answer, talk through how the kept decisions become work. Ask in batches, and give your view with its reason:
- What comes first: the smallest piece that shows the thinking is right.
- How the kept decisions group into pieces of work, the order of the pieces, and the dependencies between them, in plain words.
- The size of each piece, and whether a piece is too large to start.
- The form of each piece: a feature to build (`intake`), a problem to investigate first (`investigate`), a yes-or-no question to check (`discover`), a small correction (`fix`), a document or other deliverable that is not code (`task`), or new scope on a workflow that exists (`extension`, `/wf intake <existing-slug> <scope>`).

Propose a first split, then change it as the person directs. Continue until the person says that the split holds.

## 3.4 Confirm and record
1. Print the agreed scope in plain words: each piece of work in order, with its kept decisions; then the decisions left for later; then the cut decisions with their reasons.
2. Ask the person to confirm the scope or to change it. A change returns to 3.2 or 3.3.
3. After the person confirms, write one candidate per piece of work into `candidates:` (the template's card, with its kept decisions in `claims:`). Record the candidates in `selected:`, and print each entry command in order. Run no command. The `entry` carries `from <slug>` for the new-workflow forms.
4. A thread with no kept decision becomes `parked` when any of its decisions is `later`, and `dropped` with the person's reason when all are `cut`.
5. Write the agreed scope to the board's `## Scope` section. Set `status: distilled` and `progress.brainstorm: complete`. Leave the index `status: ready` and `next-invocation` as the resume command; when no thread is live, set `next-invocation: "/wf close <slug>"`. Update the slug's row in `.ai/workflows/INDEX.md` (`updated-at` only).

A second `done` on a distilled board shows the recorded scope and asks what to change. It walks the areas the person names and every decision with no `scope` value, which includes every decision on a board distilled before this walk existed.

**Link-back.** A successor started `from <slug>` applies [_intake-provenance.md](_intake-provenance.md): it records `origin-brainstorm`, and it sets the routed thread's `state: routed` and `routed-to`, and the candidate's `state: routed`. A decision with `scope: cut` never seeds a successor. The board is never superseded.

## Step — Write free narrative fragments

Author free narrative fragments for this artifact as described in the narrative-fragment tier of `_intake-context.md` — `<stem>.<NN-label>.html.fragment` siblings of unrestricted raw HTML, as many as the story needs, ordered with an `NN-` prefix, rendered raw-inline below the page.

# What this command is NOT
- Not `ideate`: no lens scan, no ranked backlog. The person leads and you explore beside the person.
- Not `investigate`: no option cards, no tradeoffs. A thread that wants those routes there at `done`.
- Not `shape`: no question floor, no ambiguity inventory, no request. The floor annotation of the session aid does not apply here.
- Not a build: no branch, no slice, no plan, no code.

# Step 4 — Chat return contract
After writing files, return per [_chat-return.md](../_chat-return.md) — narrative lead in the artifact's `## The Brainstorm` story voice, then this receipt:
- `wrote: .ai/workflows/<slug>/01-brainstorm.md + 00-index.md`
- `threads: <live> live · <parked> parked · <routed> routed · <dropped> dropped`
- `batches: <N> this session · <sessions> sessions`
- `scope:` — `<kept> kept · <later> later · <cut> cut` after `done`, or `not scoped yet`
- `candidates:` — one line per piece of work with its entry command (after `done`), or `none yet`
- `Next: /wf intake brainstorm <slug>` (resume), or the selected entry commands, or `/wf close <slug>` when no thread is live
