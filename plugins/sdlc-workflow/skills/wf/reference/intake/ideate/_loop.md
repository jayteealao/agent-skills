# The ideate loop (Step 5 and Step 7 of `intake/ideate.md`)

After Step 6 writes the records, `/wf intake ideate` goes into this loop. In the loop the person triages each idea, discusses an idea, and steers the scan into a new round ([_rounds.md](_rounds.md)). The loop ends only on the person's `done` or `pause`.

## Invariants

These rules protect the person. They have no exceptions.

- **Only the person ends the loop.** `done` and `pause` end it. Never decide that triage is complete. When every idea has a triage state, ask what is next: take more, look further, or `done`. Then continue.
- **Plain words.** No question, option, or chat line shows an idea id, a round number, a roster key, or a count of batches. Name an idea by its title, for example "the retry logic for the Stripe client". The ids stay in the records. The person can name an idea in words or by its rank number in the last list.
- **No commitments and no code.** The Role rules of `intake/ideate.md` stay.
- **The records are the memory.** After every batch, write the changed ideas to `01-ideate.md`: `record set` for a single key, or get the record, change it, write the draft, and put it. Then run `node "<skill-dir>/scripts/ideate-sources.mjs" check "<projectRoot>" <slug>`. It must return `ok: true`. A lost session loses at most one batch.
- **No person, no loop.** In a non-interactive run (rung 3 of [_gate-question.md](../../_gate-question.md), for example yolo), skip the loop. Step 5 records `selected: []`, and the run ends as a run with no pick.

## The first question (Step 5)

After the ranked list, ask one question with these options:

1. Go through the ideas one by one (recommended).
2. Take some ideas now: the person replies with numbers, for example `1 3`.
3. Look further, or in another direction ([_rounds.md](_rounds.md)).
4. Save the list and decide later (`pause`).

A reply of numbers sets those ideas to `take`, sets every other `open` idea to `later`, and goes to `done`. This is the fast path.

## Triage states

Each idea in `ideas:` carries one `triage` state. Every idea starts `open`.

| State | Meaning |
|---|---|
| `open` | Not triaged yet. |
| `take` | The idea goes into the pick at `done`. |
| `later` | The idea stays in the run. The pick does not take it. |
| `drop` | The person removes the idea, with a reason. |
| `brainstorm` | The idea went to a brainstorm board. The pick does not take it. |

Every change of state sets `triage-at` to the real UTC time ([_timestamp.md](../../_timestamp.md)), and `triage-reason` to the person's words when the person gives a reason.

## A triage batch

1. Ask about up to four `open` ideas per batch, in rank order, per the batch clause of [_gate-question.md](../../_gate-question.md). One idea is one question. The batch has one topic: triage.
2. In each question text, give the title, two plain sentences on what the evidence shows (cite `file:line`), the effort and the impact in words, and your view with its reason. A new idea from a round says "new in this look".
3. Give these options: Take it · Later · Drop it · Talk about it. Mark the option that the rank supports as recommended. ideate ranks the ideas, so you have a view. The person decides.
4. Read each answer:
   - **Take it**, **Later**: set the state.
   - **Drop it**: set `triage: drop` and `triage-reason` to the person's words, or "no reason given". Then move the idea to `culled:` with `source: person`, `reason:` the same words, and `dropped-at:`. Keep it in `ideas:` too, with its state, so the rank list can say what the person dropped.
   - **Talk about it**: open a discussion on that idea (below), after the other answers of the batch are recorded.
   - **Free text**: a control word is a command (Control words). Other free text is a reason or a change to the idea: record it, and ask again only when the state is still not clear.
5. Between two batches, say in one plain sentence what changed and which ideas come next.

## Merge and split

- **`merge <idea> <idea>`.** Join two ideas into one card. The card keeps the higher-ranked id. The other idea gets `merged-into:` that id, and is not shown again. Write the joined title, description, evidence, effort, and impact. Put them in a question, and ask the person to confirm them or to change them.
- **`split <idea>`.** Propose two to four child ideas, each with its own title, evidence, effort, and impact. Ask the person to confirm the split. Each child gets a new id, `parent:` the split idea, and `triage: open`. The split idea gets `merged-into:` the first child.

## Run the check

`check <idea>` runs the cheapest check that can settle the idea's claim. It works on a culled idea too.

1. When the claim is about the code, run one bounded read and cite `file:line`.
2. When the code does not settle it, run one research act per [_lenses.md](_lenses.md), Research. The act counts against the limit of 8 research acts in one run.
3. When the claim is about runtime behaviour, do not run it here. Say that `/wf probe <slug> "<the question>"` answers it after a workflow exists, and record that in `notes:`.

Give the result in plain words. Change the idea's `confidence` by the table in [_artifact.md](_artifact.md), and add one `notes:` entry. When the check shows that the claim is false, say so, and recommend "Drop it" in the next question. When the check confirms a culled idea, rescue it.

## Show the culls and rescue one

`culled` shows every idea in `culled:` that the filter removed, one plain line each, with its reason. Do not show the ideas that the person dropped in this list; give their number only.

`rescue <idea>` brings a culled idea back. Add it to `ideas:` with `triage: open`, `rescued: true`, and `culled-reason:` set to the filter's reason. Remove it from `culled:`. The next batch asks about it first.

A person's drop is not a filter cull. `rescue` on a dropped idea asks the person to confirm, because the person removed it.

## A discussion

`Talk about it`, or `discuss <idea>`, opens a discussion on one idea. Follow the talk rules of [brainstorm/_talk.md](../brainstorm/_talk.md), and these Craft rules of [brainstorm.md](../brainstorm.md): Start from the problem, Explain then ask, Be the counterweight, Make the options choose.

1. Take a talk turn. Explain the idea in plain words: what the evidence shows (cite `file:line`), what a fix looks like, and why it matters now. Give your view. End with one plain sentence that invites a reply.
2. Then ask up to four questions about this idea only. Good questions are: is the problem real for you; what is in scope and what is not; what does done look like; which risk worries you; is it worth the effort.
3. Check each checkable statement with one bounded read. `look it up` runs one research act, as in Run the check.
4. Continue until the person chooses a triage state for the idea, or says `back`.

A discussion changes the idea card. It writes no other board.

- The new description, scope, effort, impact, or confidence replace the old values.
- `notes:` gets one plain sentence per change, with the old value and the reason. Each entry has `at:` and `text:`.
- Set `discussed: true`.
- In the body of `01-ideate.md`, write a `#### Discussion` part under the idea, built from `notes:`.

A changed effort or impact changes the rank. When the discussion ends, rank the list again (Step 4 of `intake/ideate.md`), and say in one line when the idea moved.

### Hand a discussion to brainstorm

A discussion grows past one idea when it opens a second problem, when the person brings a new idea of their own, or when the person says `brainstorm`. Then ask one question: keep the discussion on this idea, or start a brainstorm from it.

When the person chooses the brainstorm:

1. Name the brainstorm slug per "New slug" of [_intake-context.md](../_intake-context.md), with the idea title as the topic.
2. Set the idea's `triage: brainstorm` and `routed-to:` that slug.
3. Print `/wf intake brainstorm <idea title> from <ideate-slug>`. Do not run it. The brainstorm reads the idea's evidence and the discussion notes as its first thread.
4. Return to the loop.

## Control words

A free-text answer whose first word is a control word is a command, not an answer.

| Word | Effect |
|---|---|
| `discuss <idea>` | Open a discussion on the idea. |
| `back` | End the discussion, and return to triage. |
| `check <idea>` | Run the cheapest check. |
| `merge <idea> <idea>` · `split <idea>` | Join two ideas, or split one. |
| `culled` · `rescue <idea>` | Show the culls, or bring one back. |
| `deeper` · `similar` · `lens` · `direction` · `surprise me` | Run a round ([_rounds.md](_rounds.md)). |
| `brainstorm` | Offer the brainstorm hand-off for the idea under discussion. |
| `list` | Show where we are (Resume). No question this batch. |
| `pause` | Save, tell the story, and return. |
| `done` | Go to the pick. |

A control word that names no known idea gets the titles back and changes nothing.

## `done`

`done` ends the loop.

- **One idea or more is `take`.** Set `selected:` to the taken ideas, in rank order. Run `# Pick — decision closure` of `intake/ideate.md` with them. The proposed order of its step 3 is the rank order. `decision-note:` holds the reasons that the person gave during triage, in the person's words. Do not ask for the pick reason again.
- **No idea is `take`.** Ask one question: keep the run open and decide later, or close it with no list. A close runs `record set "<root>" <slug> index status=closed close-reason=no-pick closed-at=<timestamp> next-command=none`.

The `later` ideas stay in `ideas:` after the close.

## `pause`

1. Write the records, and run the check.
2. Tell the story of this sitting, per the session-story rules of [brainstorm/_talk.md](../brainstorm/_talk.md): what we set out to do, what we learned, what the person took and dropped and why, what is still open, and where the next sitting starts.
3. Add the story at the top of a `## Sessions` section in the body of `01-ideate.md`.
4. Keep the index `status: ready` and `next-invocation: /wf intake ideate <slug>`. Return per the chat return contract of `intake/ideate.md`.

## Resume

`/wf intake ideate <slug>` with a complete `01-ideate.md` goes into the loop.

1. Snapshot `01-ideate.md` to `history/`, and add a `revisions:` entry with `trigger: resume`, per [_additive-write.md](../../_additive-write.md).
2. When the run is closed and holds `later` or `open` ideas, reopen it: `record set "<root>" <slug> index status=ready next-command=user-picks "next-invocation=/wf intake ideate <slug>"`. A closed run with no such idea stays closed: say so, and end the run.
3. Tell the story of the last sitting when `## Sessions` holds one.
4. Show where we are, in plain words: the taken ideas, the open ideas in rank order, the later ideas, the drops as titles only, and what each round looked at.
5. Ask the first question of Step 5 again, with "Go through the open ideas one by one" as the first option.

A later pick on a closed run with a list appends its work packets to the list, per `# Pick — decision closure`.
