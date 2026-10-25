# Carried design thoughts (`design/_carried.md`)

A design brainstorm (`intake/brainstorm/_design.md`) leaves design thoughts on a board: decisions, open ideas, open questions, and sketches. This file says where they are, how the brief uses them, and how the design stage presents them again as its starting direction.

## Find the carried thoughts

Look in these places, in this order. Read every source that exists.

1. **The origin work packet.** When `00-index.md` records `origin-packet: .ai/workflows/<source-slug>/work/<packet-slug>.md`, read the work packet file's `sketches:`: each key with its file, its link, and its caption.
2. **The origin board.** When `00-index.md` records `origin-packet`, read the board of the source folder, with `<source-slug>` from that path: `.ai/workflows/<source-slug>/brainstorm-board.json`, or `ideate-work.json` for an ideate source. When it records `origin-brainstorm: <board-slug>`, read `.ai/workflows/<board-slug>/brainstorm-board.json`. Take the board work packet in `work[]` whose `slug` is this slug. The work packet file records the same value as `packet-slug`.
3. **This workflow's own board.** When `.ai/workflows/<slug>/brainstorm-board-design.json` exists, take its work packet with `shape: design`.

From each work packet, the carried set is:
- its kept items (`scope: keep`) with `design: true`: the decisions and the open ideas, with each item's `why`;
- the open questions and the open tensions on its threads with `design: true`;
- its sketches (`sketches`), with each sketch's file, link, and caption. The work packet file gives the file; the board gives a sketch that the work packet file does not list.

An item with `scope: cut` or `scope: later` is not carried. When no source exists, or the carried set is empty, there is nothing to present: continue without this file.

## The file is the source

The sketch file is the design. Every stage reads the file. The person sees it on the canvas, in the Explore panel ([_surface.md](_surface.md)).

1. **Give the file and the canvas.** Each time you name a sketch, give its path and the canvas URL.
2. **A sketch from before the design surface.** When a carried sketch is a file in `.ai/workflows/<slug>/design/sketches/`, make it an explore sketch: run `node "<skill-dir>/scripts/wf.mjs" design explore add "<root>" <key> --title "<caption>" --link <slug>`, and copy an HTML file to `.ai/design/explore/<key>.html`. Add a PNG sketch as a reference with `wf.mjs design refs add`. A sketch path can be `<file>#<artboard>`: copy the file once, and keep the `#<artboard>` anchor in the record of each key.
3. **A link with no file.** When a carried sketch has a link and no local file, run the import at the door of [import.md](import.md) → Import at the door before you present it.

## In the brief (`shape` Step 5a)

Treat each carried decision as an answer the person already gave. Record it in the brief with its source (`<board path>#<item key>`), and do not ask its question again. Put each carried open question in the discovery round.

## At the design stage (Step 1b)

The person meets the carried thoughts again, with time and the brief behind them.

1. **Present.** Show one read-only summary in plain words. List every carried item with its intake answer and its source key. Give each carried sketch's local path, its caption, and its canvas link when one exists. The summary asks nothing.
2. **Find contradictions.** Compare each carried item with:
   - every other carried item;
   - `.ai/design/direction.md`, `DESIGN.md`, and `PRODUCT.md`;
   - each carried sketch;
   - each answer in `02b-design.md`.
   Each contradiction is one question that names both sides.
3. **Walk.** Ask only about the items in the ask set:
   - an item that touches a surface in `02b-design.md` `surfaces:`;
   - an item that shape narrowed;
   - every contradiction from step 2.
   For each item in the ask set, ask: keep, change (free text says how), or drop. Ask about up to four items per batch, per [_gate-question.md](../_gate-question.md). When you have a view, give it and its reason in the question text. The person decides. When the ask set is empty, ask one question: "Keep the carried direction, or name a change". A free-text answer can change any item of the summary.
4. **Ask the open questions.** Put each carried open question and open tension to the person in the same batches.
5. **Hand over.** The kept and changed items, and the carried sketches they point to, are the starting direction for Step 4. An item that you did not ask about is kept. Draw from them first. A drawing that departs from a kept item says why in its caption.
6. **Record.** In the draft of `02c-craft.md`, write `carried-from:` (each source as `<board path>#<packet-of-work key>`) and a `## Carried design thoughts` section: each item with what the person decided (kept, changed, or dropped) and why. Mark each item that was not asked as "kept from the summary".

On `amend`, present only the carried items that touch the surfaces the amend changes.
