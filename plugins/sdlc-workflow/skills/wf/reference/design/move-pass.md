# Move pass (`design/move-pass.md`)

`/wf design <slug> <move>` on an approved design runs the checks of the move. It draws nothing and approves nothing. Before the approval, a move focuses the stage instead ([stage.md](stage.md) Step 1). In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root.

1. Read `02c-craft.md` (`record get`) and `design/<move>.md`. Run `<wf> design approved <root> <slug>`, and read the screen pages that it prints. Load [_craft-floor.md](_craft-floor.md) as its table names for the move pass. When built code exists for the surfaces, read it too. When `stack:` names a way to run it, look at the running surfaces.
2. Run the checks of the move against the screens and the built code:

   | Move | Checks |
   |---|---|
   | `animate` | the gates and the opportunity sweep of [animate.md](animate.md): every existing animation through the gates, the opportunities, and the rejected candidates |
   | `harden` | the checks of [harden.md](harden.md), with the `worst` state of each screen |
   | any other move | the checks that its file names |

3. Write `design-notes/<move>-<timestamp>.md` per [_output.md](_output.md), "Move-pass note". Each finding names its surface, its screen key or `file:line`, and the fix.
4. When a finding changes an approved screen, ask one gate question per [_gate-question.md](../_gate-question.md): amend the design now, or keep the note for later. On "amend", follow [amend.md](amend.md) for the screens that the note names. On "later", the note stays, and nothing else changes.
5. Return per [_chat-return.md](../_chat-return.md). The message holds every finding in plain words, with its screen key and its fix, so the person does not open the note. For `animate`, it also holds the rejected candidates. Give the two canvas links of `<wf> design server url <root> --workflow <slug>`, with `#screen=<key>` when one screen holds the findings. Next: the `next-invocation` of `00-index.md`, written as "Type `/wf <key> <args>`.", unless the person chose to amend.
