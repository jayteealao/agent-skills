# Directions (`design/directions.md`)

Step 3b of the design stage ([stage.md](stage.md)). Load this file only when the person picked directions at Step 3a, asks for directions in a round, or wants to reconsider the direction in an amend. In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root.

A direction is a sketch, not a screen. A picked direction is the starting direction of Step 4. It is not an approval.

1. Load the design-mode file of the main surface, as the content inventory of the brief records it: [mode-persuade.md](mode-persuade.md) for Persuade and Experience, [mode-operate.md](mode-operate.md), or [mode-read.md](mode-read.md). Read its `## Directions`.
2. **Ground the search.** Name the mechanism of the product in one sentence, the real scene of the audience, and the cultural home of the product.
3. **Name the rut.** Name the page that this category always ships, and its predictable opposite. Keep both out of the candidates.
4. **List seven candidates** from the culture of the audience: visual systems, artifacts, places or rituals that the audience knows well. Give each one line on why it fits and one line on how it looks. Span at least three material families. On an Operate or Read surface, never take a candidate from the tools that the audience operates: it comes back as a costume of that tool.
5. **Choose three** of the seven as directions, or up to five when the person asks.
   - Give each a name that describes it, in lower-case kebab-case, for example `quiet`, `editorial`, `dense`. Never "Option A".
   - Give each one named axis: layout, density, personality, motion or interaction model. No two directions share a position on an axis.
   - Two directions that differ only in accent color or copy are one direction: replace one.
   - Record the four candidates that you did not draw, with one line each.
6. **Draw each direction** of the main surface as an explore sketch. The key holds the slug, because a sketch key is unique in the repo: run `<wf> design explore add <root> direction-<slug>-<name> --title "<name>: <axis>" --link <slug>`. Then write `.ai/design/explore/direction-<slug>-<name>.html`: full size, in realistic surrounding context, with real copy and the tokens of `tokens.css`. With no tokens yet, a sketch holds its own values, and Step 3c makes the tokens from the picked direction.
7. **Add the canon.** Draw one more sketch, `direction-<slug>-canon`: the category standard, played straight. It is the standing exit of the person. Never recommend it, and never weigh it against the other directions.
8. Send the stop message of [stage.md](stage.md). Its Decide line is a table: number, name, axis, when it is the right choice, its cost. Put the canon in the last row. Do not mark a favorite.
9. **Exact picks.** Ask one gate question per [_gate-question.md](../_gate-question.md): pick a number, mix numbers, or run another round around one of them. Before you make a mix, state which trait you take from which direction, for example "the layout of 2 and the type of 3". The person confirms the mix in one answer. When the person picks the canon, ask one time for two or three products that it sits beside. Their craft level is the bar.
10. **The bound.** After two rounds with no pick, do not draw a third round blind. Ask the person what quality is missing, and draw one more round from the answer. When that round brings no pick, ask whether to go on with the canon, to stop for today, or to name a reference.
11. Record the pick with `<wf> decide add "<root>" <slug> --stage design --key direction --answer "<pick>"`. Keep each direction, its axis, the reason of the person to keep or reject it, and the candidates that you did not draw. Step 6 writes them to `02c-craft.md`.
