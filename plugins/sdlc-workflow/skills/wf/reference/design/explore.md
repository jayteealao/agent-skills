# Explore (`design/explore.md`)

The free path of design: `/wf design explore [slug] [instructions]`. An explore run sketches ideas on the repo's design surface, and it settles nothing. The person approves a design only at the design stage ([stage.md](stage.md)). In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root.

An explore run may link to a workflow: a brainstorm, an intake, or a feature. It can run inside `/wf intake brainstorm <slug> design` ([../intake/brainstorm/_design.md](../intake/brainstorm/_design.md)). Without a slug, it links to nothing.

## The rule

- An explore sketch is an idea that the person can drop at no cost.
- Do not write a screen, `screens.json`, `02c-craft.md`, an `image-gate` value or `direction-confirmed-by`.
- Do not build working product code. A sketch is a page with mock data.
- Do not load [_craft-floor.md](_craft-floor.md). The craft floor applies when the design stage draws screens.

## Step 1 — The form

1. When `.ai/design/screens.json` is missing, run `<wf> design init <root>`.
2. Ask the first question per [_gate-question.md](../_gate-question.md): which form to make. Offer the forms that fit the instructions, for example:
   1. one screen in two or three directions;
   2. a flow of three to five steps;
   3. one detail in several versions, for example a card or a table row;
   4. a mood page of type, color and spacing.

   Do not draw before the person picks a form.

## Step 2 — Sketch

1. For each sketch, run `<wf> design explore add <root> <key> --title "<one-line caption>" [--link <slug>]`. Then write the page `.ai/design/explore/<key>.html`.
2. A sketch uses the tokens of `tokens.css` when they fit, real copy, and realistic mock data. It loads nothing from the network.
3. When the person gives outside design work (a link, a file, a canvas), save it as a sketch at once, or add it as a reference per [_surface.md](_surface.md). A link alone is not a sketch.

## Step 3 — Exact picks

1. Show the sketches on the canvas: the Explore panel of the URL that `<wf> design server url` prints, as `/r/<repo>/`. When the person cannot reach the server, run `<wf> design publish <root>` and publish the page with the host's page tool.
2. Number every option, 1 to n, in the question text. The person can pick one number, or a mix.
3. Before you make a mix, state which trait you take from which option, for example: "the layout of 2, the type of 3, the color of 1". The person confirms the mix in one answer.
4. When the explore run links to a workflow, record each pick with `<wf> decide add <root> <slug> --stage design --key <key> --answer "<pick>"` per [_decisions.md](../_decisions.md). The design stage reads the picks as its starting direction.

## Chat return

Return per [_chat-return.md](../_chat-return.md): the form, the sketch keys with their captions, the canvas URL, and the picks. Next:
- with a linked feature workflow, "Type `/wf design <slug>`.";
- inside a brainstorm, return to the brainstorm loop;
- else, "Type `/wf design explore <instructions>`." for another round, or "Done".
