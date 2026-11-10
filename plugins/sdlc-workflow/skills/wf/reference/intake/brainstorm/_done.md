# `done`: confirm the work (brainstorm)

Load this file only when the person's reply is the control word `done` ([../brainstorm.md](../brainstorm.md), 2.3). Every rule of the loop still applies: only the person ends the loop, nothing becomes work until the person confirms it, plain words, and no `(Recommended)` mark on a thinking question.

The person settled most of the scope in the loop. A decision is kept when the person makes it, and each area close ([../brainstorm.md](../brainstorm.md), 2.8) settled the rest of its area. At `done` the person confirms one thing: the grouping into work packets, with their `ux-impact`, their `try-out`, and the stack. Everything else comes as a digest that shows the person only what is not settled yet, with your proposal on each item. The person corrects it in free text.

When the person changes nothing, `done` asks two batches: the scope digest (step 2) and the work packets (step 4). A board with more open ground than one question holds takes more questions in step 2, never more than it needs.

## 1. Prepare
1. Snapshot both board files to `history/`: the JSON file, and the output of `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> 01-brainstorm.md`. Add a `revisions:` entry with `trigger: manual` and `because: done`.
2. Run a coherence pass unless one ran after the last change ([_cohere.md](_cohere.md)). Bring its conflicts to the person first, as the pass says.
3. Read the digest: `node "<skill-dir>/scripts/wf.mjs" board digest "<root>" <slug> --json`. It writes nothing, and it is compact. Per area it gives the name, the state, the scope and the counts. It gives the text only of what the person must look at, in `look`: each item that is not settled, with its proposed mark, and each cut that waits for the person. `totals` counts the whole board. `questions` plans the questions of step 2, and `batches` their batches. Read the texts of one area with `--area <key>` (several areas: `--area a,b`), and of every area with `--full`. A digest over its ceiling says `truncated`: read the areas it left out with `--area`.
4. Check each proposed mark against the board. The defaults are: an idea not decided is left for later; an open question and a tension are asked before the slice; a question for the plan and an assumption go to the build. Change a mark when the board gives you a reason, for example an idea the person argued for, or a question that a later decision answers. Give your reason in a few words.
5. Write a close file with the marks that differ from the defaults: `{"areas": "open", "marks": {"<key>": "<mark>"}}`. Preview it with `board digest "<root>" <slug> --file <close.json>`: the digest then shows the board as the close would leave it.

## 2. The scope digest
The digest shows the person only what is not settled. The person settled the rest in the loop and does not read it again.
1. Open the question text with the summary of the board in one line (2.5).
2. Give one line for everything that is settled, with the counts of `totals`, for example "1,628 decisions are kept, 13 are for later, and 22 are cut. Say `board` to see them by area." This line is the one place where the person reads a count.
3. Then, grouped by area, one plain line per item of `look`: the item in words, and your proposal, marked as yours, for example "I propose: the crowd noise waits for later". For an open item, the proposal is a handling: answer now (with your answer), ask before the slice, let the build decide, or drop. Give a cut that waits for the person as a question to the person: the built work stays until the person decides.
4. Give no line to an area whose items are all settled, also when the loop never closed it: the close of step 3 gives it its scope.
5. Ask: is this right, or what should change? The options are:
   - **This is right.** Record it, and go on to the work packets.
   - **Keep the board and think more later.** Change the timestamps only. `status` stays `open`. Return per Step 4 of [../brainstorm.md](../brainstorm.md).

Mark no option `(Recommended)`. Free text names the areas or the items to change. The reply `board` shows where we are (2.6), then asks the question again. An answer that asks for more thinking returns to the loop (Step 2).

When nothing is left to look at, the question holds the summary and the settled line only.

**More than one question.** One question carries about 4,000 characters of text: about 600 words, one screen. Neither [../../_gate-question.md](../../_gate-question.md) nor the host question tools state a limit; this is a reading limit, set so that one question stays readable in one sitting (`QUESTION_TEXT_BUDGET` in `lib/board-ops.mjs`). When the open ground does not fit:
- Split the digest by area into as few questions as it needs, in the plan of `questions`.
- Put the largest areas first: the areas with the most items to look at.
- Put at most four areas in one question.
- Give an area larger than one question questions of its own, split by its items in order.
- Ask up to four questions in one batch, per "Batches" of [../../_gate-question.md](../../_gate-question.md); the digest is one topic.
- Give the summary and the settled line in the first question only.
- Each question has the two options above. A **Keep the board** answer to any question stops `done`, and records nothing.

## 3. Record the scope
1. On **This is right**, write one change file and run `node "<skill-dir>/scripts/wf.mjs" board apply "<root>" <slug> --file <change.json>`. The change file holds the `close` part of step 1, a log entry with kind `walk`, and each answer given now (item 4 below). One write scopes every area that was not closed, with the marks the person saw.
2. On free text, apply each change that the person states, for example "keep the crowd ideas in the first version". Add it to the marks of the close file.
3. For an area or an item that the person names without saying what to do, walk only those. Ask about up to four items of one area per batch. For a decision or an idea, the options are keep, cut, later, and change it (free text says how). For an open item, the options are the four handlings of 2.8. Then record the close with the person's marks, as in item 1. Do not show the whole digest again: the question of step 4 shows the scope with the work packets.
4. Record an answer given now as 2.8 says: a new decision with the answer, and the mark `answered`, `resolved`, `confirmed` or `rejected` on the open item. When a rejected assumption changes a decision, ask about that decision.
5. When a kept item needs an item that is left for later or cut, say so in plain words. Ask how to resolve it before step 4.

## 4. Propose the work packets, one question
Load [_work.md](_work.md) now. It lists what to agree for each work packet, the write-up of a build work packet, the forms, and the size rules. Write the whole split yourself from the board:
- The order: one strict order of every work packet, write-now work packets included (`order` 1, 2, 3, and so on). Put first the smallest work packet that shows the thinking is right. Write a `why-here` note on each work packet after the first. Work packet N may use anything that work packets 1 to N−1 built. Do not agree a dependency graph: the campaign walk builds the work packets in this order, one at a time.
- The grouping: each kept decision goes into exactly one work packet. Each item with `left-to-build` goes into the items of exactly one build work packet: the work packet whose build needs the answer first.
- The slug, the form and the size estimate of each work packet, and the split of a work packet that is too large. A work packet that changes only documents is `write-now` ([_work.md](_work.md) says when it stays a `task`). A design focus adds `design` or `design-direction` to the work packet it serves ([_design.md](_design.md)).
- A stale work packet (2.8): the work packet that brings it up to date.
- The write-up of each build work packet: its goal, its scope, its acceptance criteria, its measures, its constraints and its risks, from the board. Propose its `ux-impact` and its `try-out`.
- The stack of the list, once: detect it per [_work.md](_work.md), "The stack".

Put the split in the question text: each work packet in order, with its form, its `why-here` note, its size, and the documents of a write-now work packet; for a build work packet also its goal, its acceptance criteria, its `ux-impact`, its `try-out`, and each open item left to its build (asked before the slice, or decided by the build). Then the stack. Then the items left for later, and the cut items with their reasons. Do not list the decisions again: the person made them in the loop, and the script copies them into the work packets word for word.

Ask one question: does this split hold, or what should change? Say that a confirmation also writes the write-now work packets. Mark no option `(Recommended)`. A change of the split, of a `ux-impact`, of a `try-out` or of the stack: apply it, and ask again with the changed work packets in full and the others in one line each. A change of scope returns to step 3. Continue until the person says that the split holds.

When the board's `work` list already holds `proposed` work packets from a `done` that stopped before the write, start from them.

## 5. Record the work
1. After the person confirms, add one work packet per agreed work packet to the board's `work` list, with the fields of [_work.md](_work.md), and mark them `selected`. Write the stack to the board with `user-confirmed: true`. One change file holds all three: `add.work`, and `selected` and `stack` in its `board` part. Then check the list, run each write-now work packet, and write the list, per "Check and write the list" of [_work.md](_work.md). Run no command that starts a workflow.
2. A thread with no kept item becomes `parked` when any of its items is `later`, and `dropped` with the person's reason when all are `cut`. A thread whose kept items are all in work packets becomes `routed`.
3. Set `status: distilled` on the board (`board set "<root>" <slug> status=distilled`). The document then shows `## Scope` and `## Work`, rendered from the `scope` of each item and the `work` list. `## Work` links each work packet file; it holds no second copy. After the `write` command and the archive command, run `board render "<root>" <slug>` once.
4. Set `progress.brainstorm: complete` with `record set "<root>" <slug> index progress.brainstorm=complete`. Leave the index `status: ready` and `next-invocation` as the resume command. When no thread is live, set `next-invocation: "/wf intake <slug> close"` in the same call. The `record set` refreshes the registry row.
5. Run the page agent per [_page.md](_page.md).

## A second `done`
On a distilled board, `done` runs the same steps. The digest gives the recorded scope in its settled line, and shows each item that is new since the last `done` with a proposed mark. Step 4 proposes only the new and the changed work packets in full, and gives the work packets already in the list one line each. A started work packet keeps its text: a new decision about its slug becomes a new work packet ([_work.md](_work.md), "Reopening a list").

## Stopping in the middle
The person can stop at any question of `done`. The board holds the progress: the scope after step 3, and the work list after step 5. Nothing becomes work before step 5. A later `done` starts again at step 1. Its digest then shows only what is still not settled, and the settled line for the rest.

## Link-back
The campaign walk opens each build work packet with `campaign.mjs open`, which records `origin-packet` in the work packet's `00-index.md`. A work packet of another form starts through its mode ([../../intake.md](../../intake.md), "List work packet"), which records `origin-packet` too. The walk sets the `state` of each work packet file. A successor started with `from <slug>` applies [../_intake-provenance-consume.md](../_intake-provenance-consume.md). An item with `scope: cut` never seeds a successor, and never goes into a work packet. The board is never superseded.
