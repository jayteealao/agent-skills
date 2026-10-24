# Carried design thoughts (`design/_carried.md`)

A design brainstorm (`intake/brainstorm/_design.md`) leaves design thoughts on a board: decisions, open ideas, open questions, and sketches. This file says where they are, how the brief uses them, and how the design stage presents them again as its starting direction.

## Find the carried thoughts

Look in these places, in this order. Read every source that exists.

1. **The origin piece.** When `00-index.md` records `origin-piece: .ai/workflows/<source-slug>/work/<piece-slug>.md`, read the piece file's `sketches:`: each key with its file, its link, and its caption.
2. **The origin board.** When `00-index.md` records `origin-piece`, read the board of the source folder, with `<source-slug>` from that path: `.ai/workflows/<source-slug>/brainstorm-board.json`, or `ideate-work.json` for an ideate source. When it records `origin-brainstorm: <board-slug>`, read `.ai/workflows/<board-slug>/brainstorm-board.json`. Take the board piece in `work[]` whose `slug` is this slug. The piece file records the same value as `piece-slug`.
3. **This workflow's own board.** When `.ai/workflows/<slug>/brainstorm-board-design.json` exists, take its piece of work with `shape: design`.

From each piece of work, the carried set is:
- its kept items (`scope: keep`) with `design: true`: the decisions and the open ideas, with each item's `why`;
- the open questions and the open tensions on its threads with `design: true`;
- its sketches (`sketches`), with each sketch's file, link, and caption. The piece file gives the file; the board gives a sketch that the piece file does not list.

An item with `scope: cut` or `scope: later` is not carried. When no source exists, or the carried set is empty, there is nothing to present: continue without this file.

When a carried sketch file is not in this slug's `design/sketches/`, copy it there. Keep its key as the file name (`design/_boards.md`). A sketch path can be `<file>#<artboard>`: copy the file once, and keep the `#<artboard>` anchor in the record of each key. Do not copy one file under several names.

## The file is the source

The tracked sketch file is the design. A canvas link is a published view of that file. Every stage reads the file, never the canvas.

1. **Give the file first.** Each time you name a sketch, give its local path first and its canvas link second.
2. **Check the published views at carry.** On a host with a design canvas (`_host-surfaces.md`, row "Design canvas"), run `node "<skill-dir>/scripts/design-boards.mjs" canvas-stale "<projectRoot>" <slug> --account <session account>`. It lists each sketch whose recorded `canvas.account` is not the session's account, or whose recorded `canvas.sha256` differs from the file.
3. **Republish each listed sketch** from its file under the session's account. Record the new `canvas: { link, account, published-at, sha256 }` on the sketch entry. Move the old link to `canvas.previous[]`. The file is the source, so this republish loses nothing.
4. **Read the old comments once.** Before you stop using an old link, read its comments when the session's account can read them. Treat each comment as a change request (step 5).
5. **Read the comments before each question.** Read the canvas comments of each carried sketch with the host's comment tool. Turn each comment into a change to the file, or answer it. Then republish the file to the same link.
6. **No canvas.** On a host with no design canvas, give the file path only, and record no `canvas:`.
7. **A link with no file.** When a carried sketch has a link and no local file, run the import at the door of [import.md](import.md) → Import at the door before you present it.

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
6. **Record.** In `02c-craft.md`, write `carried-from:` (each source as `<board path>#<piece-of-work key>`) and a `## Carried design thoughts` section: each item with what the person decided (kept, changed, or dropped) and why. Mark each item that was not asked as "kept from the summary".

On `amend`, present only the carried items that touch the surfaces the amend changes.
