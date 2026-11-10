# Explore (`design/explore.md`)

The free path of design: `/wf design explore [slug] [instructions]`. An explore run sketches ideas on the design surface of the repo, and it settles nothing. The person approves a design only at the design stage ([stage.md](stage.md)). In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root.

An explore run may link to a workflow: a brainstorm, an intake, or a feature. It can run inside `/wf intake brainstorm <slug> design` ([../intake/brainstorm/_design.md](../intake/brainstorm/_design.md)). Without a slug, it links to nothing.

## The rule

- An explore sketch is an idea that the person can drop at no cost. A pick is a starting direction, not an approval.
- Do not write a screen, `screens.json`, `02c-craft.md`, an `image-gate` value or `direction-confirmed-by`.
- Do not build working product code. A sketch is a page with mock data.
- Do not load [_craft-floor.md](_craft-floor.md). The craft floor applies when the design stage draws screens.

## Step 1 — The form

1. When `.ai/design/screens.json` is missing, run `<wf> design init <root>`. Run `<wf> design refs check <root>`. When it exits 1, show the person each unreadable reference before you sketch from it.
2. Choose the form from the instructions:

   | The instructions ask for | Form |
   |---|---|
   | a look, a layout or a direction of one screen | that screen in two or three directions |
   | a task or a journey | a flow of three to five steps |
   | one part, for example a card or a table row | that part in several versions |
   | a mood, a palette or a type choice | a mood page of type, color and spacing |
   | nothing that picks a form | Ask one gate question per [_gate-question.md](../_gate-question.md), with these four forms as its options. |

   State the form in the message of Step 3. The person can ask for another form there.

## Step 2 — Sketch

1. For each sketch, run `<wf> design explore add <root> <key> --title "<one-line caption>" [--link <slug>]`. Then write the page `.ai/design/explore/<key>.html`. A sketch key is unique in the repo: put the slug, or the subject, in the key.
2. A sketch uses the tokens of `tokens.css` when they fit, real copy, and realistic mock data. It loads nothing from the network.
3. When the person gives outside design work (a link, a file, a canvas), save it as a sketch at once, or add it as a reference per [_surface.md](_surface.md). A link alone is not a sketch.

## Step 3 — Exact picks

1. Run `<wf> design server url <root>` (with `--workflow <slug>` when the run links to a workflow). It starts the server when it is stopped, and prints one `computer:` line and one `phone:` line. Send one message: both links, the form, and each sketch with its number and its caption. The sketches are in the Sketches lane, left of the screens. When the person says that the links do not open, run `<wf> design publish <root>` and publish the page with the page tool of the host.
2. Ask one question, with every option numbered 1 to n in its text. The person picks one number, a mix, another round, or nothing.
3. Before you make a mix, state which trait you take from which option, for example: "the layout of 2, the type of 3, the color of 1". The person confirms the mix in one answer.
4. When the explore run links to a workflow, record each pick with `<wf> decide add "<root>" <slug> --stage design --key <key> --answer "<pick>"` per [_decisions.md](../_decisions.md). The design stage reads the picks as its starting direction ([_carried.md](_carried.md)).
5. After two rounds with no pick, ask the person what is missing before you sketch again.

## Chat return

Return per [_chat-return.md](../_chat-return.md): the form, the sketch keys with their captions, the two links, and the picks. Next:
- with a linked feature workflow, "Type `/wf design <slug>`.";
- inside a brainstorm, return to the brainstorm loop;
- else, "Type `/wf design explore <instructions>`." for another round, or "Done".
