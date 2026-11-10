# Amend (`design/amend.md`)

`/wf design <slug> amend [instructions]` reopens an approved design, because a later stage found that it cannot be built as drawn, or because the person changed their mind. `<wf> design next` also sends a run here when `00-index.md` records `progress.design: in-progress`. In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root. The step numbers are the steps of [stage.md](stage.md).

The approval rules of the stage hold: only the answer of the person to the approval question approves the amended screens.

1. Run Step 1, items 1–4: load the design context, read the design record, list the screens, and check the references.
2. Find the reason:

   | Source | The reason |
   |---|---|
   | the instructions of the invocation | what the person wrote |
   | `why` of `<wf> design next <root> <slug>` | what the script found |
   | the newest record of the stage that `current-stage` of `00-index.md` names | its blockers, or the section that says why it stopped |
   | an extension | the new slices in `03-slice.md` and the surfaces that they add |
   | a design brainstorm | the carried thoughts: run Step 1b, for the items that touch the amended surfaces only |

   When no source gives a reason, ask the person one question: what must change, and on which screen.
3. When `02c-craft.md` does not exist, the design was never approved: run the whole stage from Step 2, and do not continue here.
4. Change or add only the screens that the reason names, in place. The rounds and the approved versions keep the old pages, and the canvas compares them. A new part needs Step 3c first. Then run Step 4 for those screens, Step 4b and Step 5.
5. When the person approves at Step 5, do these in order, one time each:
   1. Snapshot the prior contract per [_additive-write.md](../_additive-write.md): write the `record get` output of `02c-craft.md`, before any change, to the `history/` path that the file names.
   2. Write the draft of the new contract per [contract.md](contract.md), and put it.
   3. Run `<wf> design approve <root> <slug> --reason "<the reason>"`. The canvas shows the reason on the new version. Handle a refusal as Step 6, item 3, says.
   4. Do Step 6, items 4 and 5.
6. Name every plan that cites a changed screen. Route to `/wf plan <slug> <slice>` for each.

When the person wants to reconsider the direction itself, run [directions.md](directions.md) around the direction that they name, then continue at item 4.

**Chat return.** In the stop message form of the stage: the reason, the screens that changed, the new version, and the plans to revisit. Next: "Type `/wf plan <slug> <slice>`." for the first plan to revisit, or the step that `design approve` printed when no plan cites a changed screen.
