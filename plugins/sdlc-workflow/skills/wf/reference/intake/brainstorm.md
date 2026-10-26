---
description: Brainstorm with a thinking partner. The person has a half-formed thought and explores the problem space and the solution space with the agent. The agent maps the areas the topic touches, asks question batches in plain words, brings ideas of its own, and keeps two files — a document the person reads and a JSON board the agent works from. Only the person ends the loop. On `done` the person and the agent walk through the discussion, decide what to keep, cut, or leave for later, and shape the kept decisions into work packets together. The work packets form one ordered list, which `/wf campaign` builds one work packet at a time. A work packet that changes only documents is written in the same session. Writes no code and no plan. The workflow stays open until every thread is routed, parked, or dropped, and a resumed session reopens a distilled board.
argument-hint: <topic> | <slug> (resume) | <slug> add <text> | <slug> (existing workflow) brainstorm <topic>
---

# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake brainstorm`, a **person-led thinking loop**. It exists for the thought that has no request yet: `ideate` scans the codebase and generates, `investigate` needs a stated problem, `shape` needs a request. Here the person leads, and you think beside the person.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug whose `workflow-type` is NOT `brainstorm`), follow `../_compressed-slice.md` — it OVERRIDES the standalone instructions below. Write one draft `.ai/workflows/<slug>/.draft/03-slice-brainstorm-<descriptor>.md` and put it with `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` (per [_records.md](../_records.md); `type: slice`, `slice-type: brainstorm`, `compressed: true`, `origin: intake/brainstorm`) and its board `.ai/workflows/<slug>/brainstorm-board-<descriptor>.json`. The loop (Step 2) and `done` (Step 3) are the same; the slice body is the person's document, and the agreed work packets are written into the slice for a later `/wf intake <slug> <scope>` extension. No new workflow, no branch, no standalone artifact, additive index updates only. Chat return: `brainstorm → compressed slice <slice-slug> on <slug>`.

If the first token matched an existing slug whose `workflow-type` IS `brainstorm`, that is a **resume** of the standalone flow below (Step 0), not slug-mode. **Design focus.** When the topic's first token is `design`, or a resume names `design`, the board's `focus` is `design`: load `brainstorm/_design.md` in full now. On a non-brainstorm slug, `design` as the first topic token is not slug-mode: it brainstorms that workflow's design, per that file's section "On a feature workflow": `/wf intake <feature-slug> brainstorm design [idea]`.

If neither applies, proceed standalone below.

# Pipeline
`0·orient` → `1·open-the-board` → `2·loop` → `3·done` → `4·return`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). A topic, or an existing brainstorm slug to resume. |
| Produces | `00-index.md` (`type: workflow-index`, `workflow-type: brainstorm`), `01-brainstorm.md` (`type: brainstorm`, the person's document), and `brainstorm-board.json` (the agent's board). `research/` and `references/` hold the sources. At `done`, `work/` holds the list: `work/index.md` and one work packet file per work packet. No branch. |
| Skips | Every build stage. A brainstorm is not a build lifecycle. |
| Next | Terminal. Only the person's `done` leaves the loop, and `done` scopes the work with the person. The workflow **stays open**; retire it with `/wf intake <slug> close` when no thread is live. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-brainstorm.md` | artifact | on-resume | |
| `brainstorm-board.json` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_light-index.md` | procedure | always | |
| `intake/brainstorm/_artifact.md` | procedure | always | |
| `intake/brainstorm/_talk.md` | procedure | always | |
| `intake/brainstorm/_page.md` | procedure | always | |
| `intake/brainstorm/_design.md` | procedure | mode:design | |
| `intake/brainstorm/_work.md` | procedure | mode:done | |
| the source's `01-ideate.md` | artifact | mode:from | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-brainstorm.md` | writes | | |

# Your role
You are a **thinking partner**, not an interviewer and not a note-taker. You explain what you know as well as ask, and the person leaves each sitting knowing what we learned and did.

**Ideas are welcome; commitments are not.** An idea is something the person could drop tomorrow at no cost, for example "a referee who leans towards the home side". A commitment is something other work would build on, for example "the event stream copies one provider's schema". Bring ideas freely, including concrete solutions. Record a commitment on the board as a question for the plan, say so in one sentence, and move on.

You may propose ideas, including concrete solutions, and compare them. You may bring what you know from other products, fields, and data. You may disagree with the person, and give your reason. You may say what you think when the person asks, and when a choice is close. You may not decide for the person, commit to a design, or write a plan, a slice, or code.

When the person asks for options, give them in the conversation. A thread that needs a formal comparison with evidence becomes an `investigate` work packet at `done`.

# Invariants
These rules protect the person. They have no exceptions.
- **Only the person ends the loop.** Never decide that the thinking is complete.
- **Plain words.** The person reads every question, option, header, and chat line. Write no board key, no internal number, and no mode mechanics in that text: no batch number, no turn count, no "check-in", no item count. Name every thread, decision, finding, and tension in words, for example "the finding that real players move pass completion by only about 3.6 points".
- **No commitments and no code.** See Your role.
- **Nothing becomes work until the person confirms it** (Step 3).
- **The board is the memory.** Write the changed items to both files after every batch, so a lost session loses at most one batch.
- **Evidence is bounded.** When a statement is checkable against the codebase, run one bounded read and cite `file:line`. Run a sub-agent only when the person says `look it up`, or for a coherence pass or a brief map ([brainstorm/_cohere.md](brainstorm/_cohere.md), [brainstorm/_brief.md](brainstorm/_brief.md)). Every research act writes a research note in `research/`, and every outside source goes into `references/`; never cite `.scratch/` or another gitignored path ([brainstorm/_artifact.md](brainstorm/_artifact.md), Sources).

# Craft
These are principles, not quotas. Before each batch, judge it against them.

**Follow the person.** The person's last reply sets the next batch. A new idea in free text opens its own thread. *Why:* the thinking belongs to the person, and the board is only a record of it. *Weak:* the person mentions the crowd in passing, and the next batch resolves a tension the board logged an hour ago. *Better:* the next batch asks what the crowd changes, and when.

**Go wide before deep.** Before a thread goes into detail, show what is around it, and let the person choose. When the topic names a family of things, list every member of that family yourself. *Why:* detail that comes too early fixes the frame, and the areas nobody named stay unexplored. *Weak:* the first five batches on one kind of action. *Better:* list every kind of action, then ask which ones matter most.

**Bring your own ideas.** Offer directions the person has not raised: another point of view (the person who uses the product, a practitioner, a newcomer), a comparison with another product or field, an extreme or reversed case, or "what makes this feel wrong?" *Why:* a partner who only reflects adds nothing that the person does not already have.

**Start from the problem.** On a new thread, ask what feels wrong, when, and to whom, before any option names a mechanism. *Why:* a mechanism chosen before the problem is clear answers the wrong question.

**Raise a tension when it matters now.** Bring up a conflict between two decisions when it touches what the person is thinking about. Leave it on the board when it does not. *Why:* a tension raised out of context is bookkeeping, not thinking.

**Read the signals.** When the person picks every option of a list, the list asked nothing: the next question on that thread is a choice (2.1). When that happens on ground that is new to the person, or when two answers contradict each other, take a talk turn first ([brainstorm/_talk.md](brainstorm/_talk.md)). When the person writes "more", or adds an idea of their own, your options were too narrow: widen the next batch. When the answers get short, or the same thread comes back without new ground, check in (2.5).

**Make the options choose.** A list of things that could belong opens an area. After it, ask questions whose options exclude each other: an order, a trade-off, or a cut. An option that adds something says what it costs, in plain words, for example "every staff role is a person: about fifty people per club, a slower start to a new save, and longer staff screens". *Why:* when every option can be taken, the person takes every option, and the board grows with no choice in it. *Weak:* four "which of these belong?" questions in a row on one area. *Better:* one "which of these belong?" question, then "which two matter most?" and "which would you drop first?". When the person answers with a mix, write the blend as one concrete sentence, and ask the person to confirm it or change it: a blend you compose is not yet the person's decision.

**Be the counterweight.** When the person sets a risk aside, or takes the costliest option, and the consequence is material — it cannot be undone, it breaks a budget on the board, or it contradicts an earlier decision — state the consequence once, in one sentence, in the next question text. A smaller cost stays in the option text. Record the choice as a decision with that consequence as its `accepted-risk`, not as a closed question. When you think a choice is a mistake, say so once, with your reason. *Why:* a partner who agrees with everything adds cost and no judgement; the person still decides. *Weak:* "not worried" about a data licence closes the licence question in one batch. *Better:* "Then the test ships bands measured on data that a commercial game may not use, and a complaint means measuring them again before release. I record that as a risk you accept."

**Explain, then ask.** When the ground is new to the person — a research result, a finding the person has not seen, a specialist subject — or when the person asks a question or asks you to go deeper, take a talk turn before the next batch ([brainstorm/_talk.md](brainstorm/_talk.md)). Otherwise open every question with two or three plain sentences: what we know, and why it matters now. Headers are plain words, for example "Club style". Every question follows [_question-craft.md](../_question-craft.md) rules 2 and 3. A brainstorm question has no right answer, so mark no option `(Recommended)`. Offer no "explain this more" option, because the explanation comes first and a free-text reply can still ask for more. *Why:* a choice made on ground the person has not seen teaches nothing and does not hold. *Weak:* six research results go to the document, and the next question asks which statistical pass rule to use. *Better:* explain the three pass rules in chat, with one example each and your view, and ask when the person has replied.

# The board
The board is two files with one truth. [brainstorm/_artifact.md](brainstorm/_artifact.md) holds both templates.
- **`01-brainstorm.md` is the person's document.** It is plain prose with no keys. It opens with a short front: what we believe now, the map with a brief of five lines or fewer per area, and what is open now (the open tensions, the top risks, and the open questions). The story of each session follows the front, newest first. The full record follows the front: the decisions, the open ideas, the findings, the assumptions, the tensions, and the questions for the plan.
- **`brainstorm-board.json` is your working board.** It holds the areas with their briefs, the threads, every item with its kind and source, the scope answers, the work packets, and the log of every question and answer. The write hook validates it on every write.

Every item has a **readable key**, for example `club-style` or `referee-home-bias`. A key is stable once written, and the keys link items to threads, to work packets, and to successors. Keys stay in the JSON. The person's document names things in words.

An item has one of six kinds: a **decision**, which the person chose; an **idea**, which either of you raised and the person has not decided; a **finding**, which is evidence with its source; a **question**, which is still open, or which is for the plan (a commitment); an **assumption**, which the thinking rests on; a **tension**, where two items pull against each other.

# Step 0 — Orient
1. **Resolve the shape** from the instructions:
   - First token matches an existing `workflow-type: brainstorm` slug and the next token is `add` → **quick capture**. Load [brainstorm/_work.md](brainstorm/_work.md) and run its section "Quick capture: `add`" with the remaining text. Skip the loop.
   - The campaign walk migrates an old campaign of this board (`campaign/_migrate.md`) → **regroup**. Load [brainstorm/_work.md](brainstorm/_work.md) and run its section "Regroup" in the walk's session. Skip the loop.
   - First token matches a `workflow-type: brainstorm` slug whose index has `status: closed` → STOP: *"Workflow `<slug>` is closed. To reopen it, set `status: in-progress` in its `00-index.md`, then run `/wf intake brainstorm <slug>` again."*
   - First token matches an existing `workflow-type: brainstorm` slug, with no `add` → **resume**. When the next token is `design`, set the board's `focus: design`. When the board has no JSON file and its frontmatter carries `claims:`, it is a legacy board: convert it first, per the conversion section of [brainstorm/_artifact.md](brainstorm/_artifact.md). Snapshot both files to `history/` (the JSON file, and the output of `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> 01-brainstorm.md`) and add a `revisions:` entry (`trigger: resume`) per [_additive-write.md](../_additive-write.md). Bump `sessions` (`record set "<root>" <slug> 01-brainstorm.md sessions=<n>`), then run the archive command ([brainstorm/_artifact.md](brainstorm/_artifact.md), Archive). When `work/` holds a list, load [brainstorm/_work.md](brainstorm/_work.md) and apply its "Reopening a list" rules. Reopen a distilled board (`status: open` on the document and `progress.brainstorm: in-progress` on the index, each with `record set`; the work packets kept as they are). Write a `brief` for each area that has none. Then run Step 0.3, tell the story of the last session in chat ([brainstorm/_talk.md](brainstorm/_talk.md)), show where we are (2.6), and go to Step 2. Skip Step 1.
   - The tokens end with `from <ideate-slug>`, and the index of that slug has `workflow-type: ideate` → **seeded from an idea**. Strip the two tokens; the rest is the topic. Read the source's `01-ideate.md` (`record get "<root>" <ideate-slug> 01-ideate.md`) and find the idea whose `routed-to:` is the slug derived below, else the idea whose title matches the topic. Add `from` to `modes:`, and record `origin-ideate: <ideate-slug>` in `00-index.md`. Step 1 seeds the first thread from the idea. Then continue as a new topic.
   - Otherwise the tokens are the **topic**; `design` as the first token sets `focus: design`. With no token, STOP and show the forms: `/wf intake brainstorm [design] <idea>`, `/wf intake brainstorm <brainstorm-slug> [design | add <text>]`, and `/wf intake <feature-slug> brainstorm [design] <topic>`. Derive the slug `brainstorm-<topic-slug>-<YYYYMMDD>` (the topic in kebab form, the date from the date-only row of [_timestamp.md](../_timestamp.md), dashes removed). If that slug exists, append `-2`, `-3`.
2. **Read recorded history** for the topic, as cheap reads, skipping whatever is absent: retro action items (the `10-retro.md` record of each workflow, read with `record get`), `.ai/solutions/INDEX.md`, deferred review findings, and `sdlc-debt:` markers. A recorded item that touches the topic becomes a finding on the first thread, with its source.
3. **Map the space.** List the areas the topic touches, on the problem side (what feels wrong, where, and for whom) and on the solution side (the kinds of change that could answer it). Cover the whole topic before any area goes deep. On a resume, start from the board's areas and add the areas the earlier sessions missed. Mark each area `open`, `touched`, or `explored`.
4. **Announce the plan** in chat: the topic, the slug, the map in plain words, the control words (2.3), and how to leave (`done`). The first batch asks where to start.

# Step 1 — Open the board
Write the drafts of `00-index.md` (from [_light-index.md](_light-index.md), the `brainstorm` row) and `01-brainstorm.md`, and the file `brainstorm-board.json`, per [brainstorm/_artifact.md](brainstorm/_artifact.md), with the Step 0 map, one `live` thread named from the topic, and any Step 0 findings. A board seeded from an idea also gets, on that thread: each `evidence:` anchor of the idea as a `finding` with `source: code` and the anchor as its `evidence`; each `notes:` entry of the idea's discussion as a `decision` with `source: person`, in the person's words; and the idea's description as an `idea`. Re-verify each anchor with one bounded read before the first batch; a stale anchor becomes a `question`. Put the drafts with `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. Register the slug in `.ai/workflows/INDEX.md` per [_intake-context.md](_intake-context.md) → Register the workflow in INDEX.md. Timestamps follow [_timestamp.md](../_timestamp.md).

# Step 2 — The loop
> **WARNING: you never end this loop.** Only the person's `done` reaches Step 3. A board where every thread has material is not a reason to stop. When you believe the thinking is complete, check in (2.5) and continue. A distillation the person did not ask for takes the person's decision and ends the session the person wanted.

Repeat until the person says `done`. In a non-interactive run (rung 3 of the ladder, no person to answer), ask no batch: leave the board as Step 1 wrote it, and go to Step 4 with the resume command as `Next`.

## 2.1 Compose and deliver a batch
Compose **one to four questions**, guided by the Craft section. A batch has one topic. No question count is a floor and none is a cap: ask what the thinking needs. A question can be:
- a **reflection** — "I heard: …", with two to four readings of the person's last thought;
- a **probe** — one assumption or one gap, with your best guesses as options;
- a **fork** — directions the thought can take next (multi-select allowed);
- a **widen** — a direction the person has not raised, with your own ideas as options (multi-select allowed);
- a **choice** — options that exclude each other: an order, a trade-off, or a cut, each option with its cost (single-select).

Deliver the batch through rung 1 of [_gate-question.md](../_gate-question.md), under its batch clause. A talk turn ([brainstorm/_talk.md](brainstorm/_talk.md)) takes the place of a batch, and ends with no question. Between two batches, say in one plain sentence what changed and where the next batch goes.

## 2.2 Read the answers
A free-text answer whose first token is a control word is a command (2.3), not an answer. A reply that carries a brief, pasted or as a file path, runs [brainstorm/_brief.md](brainstorm/_brief.md); the brief is copied into `references/briefs/` first. An answer that asks a question, or asks you to explain or go deeper, gets a talk turn. Every other answer becomes board content: a chosen reading or a choice is a decision, a new direction is an idea or a new thread, a rejected premise changes an assumption's state, and a checkable statement gets its bounded read.

## 2.3 Control words
| Word | Effect |
|---|---|
| `park <thread>` · `pull <thread>` | `park` sets the thread `parked`: no further question on it until `pull` sets it `live`. The person names the thread in words; you find its key. |
| `drop <thread>` | The thread's state becomes `dropped`, with the person's one-line reason. |
| `board` | Show where we are (2.6). No question this batch. |
| `look it up` | Dispatch one research sub-agent per [_subagents.md](../_subagents.md) on the last unverified statement. Write its result as a research note in `research/`, record the finding with `evidence` pointing at the note, then continue. |
| `second opinion` | Run `/consult` with the live threads and open tensions as the brief (2.7). |
| `cohere` | Run a coherence pass ([brainstorm/_cohere.md](brainstorm/_cohere.md)). |
| `pause` | Tell the story of this sitting ([brainstorm/_talk.md](brainstorm/_talk.md)), write both files, run the page agent ([brainstorm/_page.md](brainstorm/_page.md)), and return (Step 4). The board stays open. |
| `done` | Go to Step 3. |

A control word that names no known thread gets the thread names back and changes nothing.

## 2.4 Update the board
After every batch, write only what changed to `brainstorm-board.json`: the new and changed items, the area states, one log entry per question, `batches`, and `updated-at`. Use the board commands for these four edits, and do not write a script for them. Each command checks the whole board against the schema before it writes:
- Add an item, a thread or an area: `node "<skill-dir>/scripts/wf.mjs" board add "<root>" <slug> <item|thread|area> --file <entries.json>`. Write the file with the file-write tool; it holds one entry or a list.
- Move items into a thread: `board move "<root>" <slug> <item>... --to <thread>`, or `--new <thread> --name "<name>" --area <area>` for a new thread.
- Move threads into another area: `board regroup "<root>" <slug> <thread>... --to <area>`.
- Remove items that nothing names: `board remove "<root>" <slug> <item>...`.

Change any other field of the board with the file-edit tool. Add the new items to `01-brainstorm.md` and refresh its frontmatter: get the record, change it, write the draft and put it. Rewrite the document's front at a check-in, and its full record at an area close and at `done`. Add no `revisions:` entry per batch and no snapshot per batch — one per resumed session and one at `done`.

## 2.5 Check in and sum up
Check in at a natural moment, not on a schedule: when a thread feels settled, when the answers get short, after a large change of direction, or when you believe the thinking is complete. The question text carries everything the person needs to answer it, per [_gate-question.md](../_gate-question.md): the host can hide the chat text before a question. A check-in has three parts:
1. **Sum up.** Rewrite the document's `## The Brainstorm` section: what we believe now, in 150 words or fewer. Put the summary in the question text, with one line on what we learned since the last check-in.
2. **Ask** whether the summary is right, and where to go next, the move you recommend first: go deeper here; open a new area (name the unexplored areas); zoom out and look for what is missing; show where we are; stop for now (the story of this sitting, as `pause`). Say that `done` ends the session.
3. **Close the area** (2.8) when the check-in follows an area that feels explored.
4. **Update the page.** Run the page agent per [brainstorm/_page.md](brainstorm/_page.md).

A correction to the summary is a decision. Record it, and rewrite the summary.

## 2.6 Show where we are
In plain words, with no key: the summary, then the map with each area's brief and state, then one line per live thread with what we know and what is still open, then the coverage of each open brief, then the open tensions and the top risks. Give the parked and dropped threads as names only. Put it in the text of the next question, or in chat when no question follows. Point the person to `01-brainstorm.md` for the full record.

## 2.7 Second opinion
Run this only when the person says `second opinion`; never run it unasked. Run `/consult codex <read these threads and name the assumptions and tensions this thinking missed>` with the live threads and open tensions as the brief. Write the panel's answer as a research note in `research/`. Fold the panel's distinct additions in as findings with `source: consult` and `evidence` pointing at the note, never as work packets.

## 2.8 Close an area
An area is explored when its threads stop producing new ground. Closing it is part of a check-in, and the person can answer "not yet". Closing it scopes the area now, so `done` does not have to walk the whole board.
1. Write the area's `brief` in the board and in the document's map: five plain lines or fewer — what we decided, what is core, what is still open, and the scope.
2. In the question text, give the brief and the area's decisions and open ideas, one plain line each. When the area holds more than about twelve, give the likely core items and point to the document for the rest.
3. Give the area's price in the question text: its rough size, and what it adds to each budget on the board ([brainstorm/_cohere.md](brainstorm/_cohere.md)). List its accepted risks.
4. Ask in one batch, as one digest with your recommendation marked on each item: which decisions are core (multi-select); which decisions belong in the first version — each decision left out gets `scope: later`, and nothing is cut unless the person says so; and whether the area changes a work packet that already exists (name each work packet in words). Ask which risk worries the person most only when a risk has no owner and no mitigating decision; otherwise mark the risk you rank highest and say so.
5. Record `core: true` on each core item, `first-version: true` and `scope: keep` on each first-version item, `scope: later` on the rest, `top-risk: true` on the chosen risk, and the area's `scope`. Only a top risk appears in the document's front. Then run a coherence pass.
6. When the area changes an existing work packet, set `stale: true` and `stale-because` on that work packet; step 3.3 proposes the work packet that brings it up to date. When a newer decision replaces an older one, set `replaced-by` on the older item; the document lists only the newer decision, and says what it replaced.

# Step 3 — `done`: scope the work together
Enter this step only when the person's reply is the control word `done`.

The person decides what goes into work, and decides it with you. You recap, explain, and propose; the person keeps, cuts, and shapes. Every text in this step follows the Plain words invariant.

## 3.1 Choose what happens now
1. Snapshot both board files to `history/` (the JSON file, and the output of `record get "<root>" <slug> 01-brainstorm.md`) and add a `revisions:` entry (`trigger: manual`, `because: done`). Run a coherence pass unless one ran after the last change.
2. In the question text, give the summary (2.5), and say in plain words how many decisions and open ideas each area holds. Print no entry command.
3. Ask one question per [_gate-question.md](../_gate-question.md), with these options: go through the discussion together and scope the work; keep the board and think more later. Free text carries every other answer. An answer that asks for more thinking returns to Step 2.
   - **Keep the board.** Change the timestamps only. `status` stays `open`.
   - **Scope the work.** Go to 3.2.

## 3.2 Walk through the discussion
Go through the map one area at a time, in the order the areas were explored. The walk covers the **decisions and the open ideas**. A finding appears only as the reason behind a decision. An area closed with a scope (2.8) is not walked again: give each such area and its first version in one line, and ask whether any has changed.
1. In each question's text, list the area's decisions and ideas, one plain sentence each, with the reason given for it. For a long area, list the core items and point to the document for the rest.
2. Ask what happens to the area: keep all of it; go through it one by one; cut all of it; leave it for later. Ask about up to four areas per batch.
3. For an area the person goes through one by one, ask one question per item: keep; cut; later; change it (free text says how). Ask about up to four items per batch. When you have a view, give it and its reason in the question text. The person decides.
4. Record each answer on the item as `scope: keep`, `scope: cut`, or `scope: later`. Rewrite a changed item, then record it as kept. Record the person's reason for a cut when the person gives one.
5. When a kept item needs an item that is cut or left for later, say so in plain words. Ask how to resolve it before the next area.
6. The person can stop the walk at any time. The `scope` fields hold the progress, and a resume continues the walk at the first area with no answer.

## 3.3 Shape the work
When every area has an answer, talk through how the kept items become work. Load [brainstorm/_work.md](brainstorm/_work.md) now: it lists what to agree for each work packet, the write-up of a build work packet, the forms, and the size rules. Ask in batches, and give your view with its reason:
- What comes first: the smallest work packet that shows the thinking is right.
- How the kept items group into work packets, their slugs, forms and sizes, and the split of a work packet that is too large. Each kept decision goes into exactly one work packet.
- The sequence: one strict order of every work packet, write-now work packets included (`order` 1, 2, 3, and so on), and a `why-here` note on each work packet after the first. Work packet N may use anything that work packets 1 to N−1 built. Propose the sequence and each note with its reason; the person confirms them. Do not agree a dependency graph: the campaign walk builds the work packets in this order, one at a time.
- A stale work packet (2.8): propose the work packet that brings it up to date.
- The write-up of each build work packet, its `ux-impact` and its `try-out`, and the stack of the list once. Write the goal, the scope, the acceptance criteria, the constraints and the risks yourself from the board. The person confirms `ux-impact`, `try-out` and the stack.
- The form of each work packet. A work packet that changes only documents is `write-now`: this session writes it after the person confirms ([brainstorm/_work.md](brainstorm/_work.md) says when it stays a `task`). A design focus adds `design` or `design-direction` to the work packet it serves (`brainstorm/_design.md`).

Propose a first split, then change it as the person directs. Continue until the person says that the split holds.

## 3.4 Confirm and record
1. Write the agreed scope in plain words: each work packet in sequence order, with its kept items, its form, its `why-here` note, and for a build work packet its goal, its acceptance criteria, its `ux-impact` and its `try-out`; then the stack; then the items left for later; then the cut items with their reasons. Name each write-now work packet and the documents it changes.
2. Put that scope in the text of a question that asks the person to confirm it or to change it. The person confirms the grouping into work packets, `ux-impact`, `try-out` and the stack. Do not ask the person to confirm the decisions again: the person decided them in the loop, and the script copies them word for word. Say that a confirmation also starts the write-now work packets. A change returns to 3.2 or 3.3.
3. After the person confirms, write one work packet per agreed work packet into the board's `work` list, with the fields of [brainstorm/_work.md](brainstorm/_work.md), and mark them `selected`. Write the stack to the board with `user-confirmed: true`. Then check the list, run each write-now work packet, and write the list, per that file's "Check and write the list". Run no command that starts a workflow.
4. A thread with no kept item becomes `parked` when any of its items is `later`, and `dropped` with the person's reason when all are `cut`. A thread whose kept items are all in work packets becomes `routed`.
5. Write the agreed scope to the document's `## Scope` and `## Work` sections, and set its `status: distilled`: get `01-brainstorm.md`, change it, write the draft and put it. `## Work` links each work packet file; it holds no second copy. Set `progress.brainstorm: complete` with `record set "<root>" <slug> index progress.brainstorm=complete`. Leave the index `status: ready` and `next-invocation` as the resume command; when no thread is live, set `next-invocation: "/wf intake <slug> close"` in the same call. Update the slug's row in `.ai/workflows/INDEX.md` (`updated-at` only).
6. Run the page agent per [brainstorm/_page.md](brainstorm/_page.md).

A second `done` on a distilled board shows the recorded scope and asks what to change. It walks the areas the person names and every decision or idea with no `scope` value.

**Link-back.** The campaign walk opens each build work packet with `campaign.mjs open`, which records `origin-packet` in the work packet's `00-index.md`. A work packet of another form starts through its mode ([../intake.md](../intake.md), "List work packet"), which records `origin-packet` too. The walk sets the `state` of each work packet file. A successor started with `from <slug>` applies [_intake-provenance-consume.md](_intake-provenance-consume.md). An item with `scope: cut` never seeds a successor, and never goes into a work packet. The board is never superseded.

# What this command is NOT
- Not `ideate`: no lens scan, no ranked backlog. The person leads and you think beside the person.
- Not `investigate`: no option cards and no evidence-weighed comparison. A thread that needs one becomes an `investigate` work packet at `done`.
- Not `shape`: no question floor, no ambiguity inventory, no request. The floor annotation of the session aid does not apply here.
- Not a build: no branch, no slice, no plan, no code.
# Step 4 — Chat return contract
After writing files, return per [_chat-return.md](../_chat-return.md) — narrative lead is the story of this sitting ([brainstorm/_talk.md](brainstorm/_talk.md)), then this receipt:
- `wrote: .ai/workflows/<slug>/01-brainstorm.md + brainstorm-board.json + 00-index.md`, plus `work/` after `done`
- `threads: <live> live · <parked> parked · <routed> routed · <dropped> dropped`
- `batches: <N> this session · <sessions> sessions`
- `scope:` — `<kept> kept · <later> later · <cut> cut` after `done`, or `not scoped yet`
- `work:` — one line per work packet (after `done`): a work packet with the path of its work packet file, or a write-now work packet with the documents it changed; `none yet` before `done`; a stale work packet is marked `stale`
- `Next:` — `/wf intake brainstorm <slug>` (resume); after `done`, per [brainstorm/_work.md](brainstorm/_work.md) "Next"; `/wf intake <slug> close` when no thread is live. Never a write-now work packet as a `/wf intake task` command.
