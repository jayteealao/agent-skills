# Carried design thoughts (`design/_carried.md`)

A design brainstorm (`intake/brainstorm/_design.md`) leaves design thoughts on a board: decisions, open ideas, open questions, and sketches. This file says where they are, how the brief uses them, and how the design stage presents them again as its starting direction.

## Find the carried thoughts

Look in these places, in this order. Read every source that exists.

1. **The origin board.** When `00-index.md` records `origin-brainstorm: <board-slug>`, read `.ai/workflows/<board-slug>/brainstorm-board.json`. Take the piece of work in `work[]` whose `routed-to` is this slug.
2. **This workflow's own board.** When `.ai/workflows/<slug>/brainstorm-board-design.json` exists, take its piece of work with `shape: design`.

From each piece of work, the carried set is:
- its kept items (`scope: keep`) with `design: true`: the decisions and the open ideas, with each item's `why`;
- the open questions and the open tensions on its threads with `design: true`;
- its sketches (`sketches`), with each sketch's link and caption.

An item with `scope: cut` or `scope: later` is not carried. When no source exists, or the carried set is empty, there is nothing to present: continue without this file.

## In the brief (`shape` Step 5a)

Treat each carried decision as an answer the person already gave. Record it in the brief with its source (`<board path>#<item key>`), and do not ask its question again. Put each carried open question in the discovery round.

## At the design stage (Step 1b)

The person meets the carried thoughts again, with time and the brief behind them.

1. **Present.** In the question text, give a short summary in plain words: what the brainstorm decided about how the idea looks and behaves, with the reason for each decision. Give each carried sketch's link and caption.
2. **Walk.** Ask about each carried decision and idea: keep, change (free text says how), or drop. Ask about up to four items per batch, per [_gate-question.md](../_gate-question.md). When you have a view, give it and its reason in the question text. The person decides.
3. **Ask the open questions.** Put each carried open question and open tension to the person in the same batches.
4. **Hand over.** The kept and changed items, and the carried sketches they point to, are the starting direction for Step 4. Draw from them first. A drawing that departs from a kept item says why in its caption.
5. **Record.** In `02c-craft.md`, write `carried-from:` (each source as `<board path>#<piece-of-work key>`) and a `## Carried design thoughts` section: each item with what the person decided (kept, changed, or dropped) and why.

On `amend`, present only the carried items that touch the surfaces the amend changes.
