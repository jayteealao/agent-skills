# Campaign watch: the watch and the commentary of a campaign

This file belongs to [../campaign.md](../campaign.md). `/wf campaign` uses the watch and the commentary rules of [../yolo/_commentary.md](../yolo/_commentary.md), with the changes below.

- **K1. One watch per wave run.** One Workflow run of the wave driver, `workflows/campaign-wave.js`, drives every unit of the wave. Right after the Workflow call that launches the wave driver, start one watch over every slug of the wave and the campaign journal. Do not start a watch for each unit ([../yolo/_commentary.md](../yolo/_commentary.md), "Start the watch", step 6):

  ```
  node "<pluginRoot>/scripts/yolo-watch.mjs" "<projectRoot>" <slug-1> <slug-2> ... --campaign <brainstorm-slug>
  ```

  Every 20 seconds, the watch reads `work/campaign/ledger.json`. It follows each unit of a live wave to the unit's worktree, where the wave driver writes the records of that unit. In the worktree, it reads the journal, the commits on the slug branch, and the protected files. A unit that a later wave adds is watched from that moment. When a worktree is removed after the merge, the merged journal in the main checkout is history, and its lines give no event again. The `run-end` of one unit does not end this watch, because the other units and the boundary still run. The campaign journal's `campaign-end` line ends it, and so does a `wave-end` line when no other started wave is still open (waves overlap: wave n ships while wave n+1 runs). To end it early, run `yolo-watch.mjs end "<projectRoot>" - --campaign <brainstorm-slug>`. When every unit is finished and only the boundary runs (the wave review, the as-built notes, the wave output), start the watch with `-` in place of the slugs. A unit's run ends once: a restart does not say a finished unit's `run-end` again.
- **K2. Parallel slugs.** A `stage-end` event carries `parallel`, the number of slugs with a stage open. When `parallel` is more than 1, give the stage end one line, not a full note. Give the full note at that slug's `run-end`.
- **K3. Campaign events.** Each of these gets a full note:

| Event | The note says | Push |
|---|---|---|
| `wave-start` | the wave, its slugs, and the slugs that moved | no |
| `prepare-waiting` | the slugs that wait for prepare | yes |
| `merge` | the slug, and whether it merged or stopped | no |
| `wave-verify` | green or red, and the fix rounds | no |
| `refuter` | how many claims the refuter upheld, changed, or could not check | no |
| `fidelity` | each narrowed or dropped decision, and whether the person ratified it | no |
| `drift` | each contract difference, and the slugs that wait for the person | no |
| `wave-ready` | the build label, and the try-it note: "Wave 2 is ready to try." | yes |
| `work-changed` | what the brainstorm added, and which packets need prepare | yes |
| `pr-opened`, `ci-result`, `merged` | the wave PR and its state | no |
| `released` | the version | yes |
| `asked` | the question, and where to answer it | yes |
| `paused`, `resumed` | why, and the reset time | `paused` only |
| `wave-end`, `campaign-end` | the wave or the campaign summary | yes |

- **K4. Where the notes go.** A campaign note goes to `work/campaign/commentary.md`. A slug's note goes there and to the slug's own `commentary.md`. The watch's own lines (R1) go to both files too. Add `--campaign <brainstorm-slug>` to the `note` command; use `-` as the slug for a note about the campaign only.
- **K5. Scoped stop requests.** A stop request can name one slug, the wave ("stop after this wave"), or the campaign. Write it per [_waves.md](_waves.md), "Pause and resume", step 3, which owns the scopes and the `--then` question. The wave driver reads a `slug` request for each of its units and every `campaign` request.
- **K6. While the person prepares.** The watch runs only in the campaign session. While the person prepares slugs there, give one line per event, and hold the full notes until the prepare batch ends. Push the events that the tables mark at once.
- **K7. The unit lines.** Each line that the wave driver writes to the journal of a unit has `"driver":"campaign-wave"` and `"campaign":"<brainstorm-slug>"`. The agent label is `<stage>:<slice>@<slug>`, because two units can have slices of the same name. The watch removes `@<slug>` from the label: an event gives the stage and the slice, and its `slug` field names the unit.
  - A `stop` event gives `/wf campaign <brainstorm-slug>` as the resume command, not `/wf yolo <slug>`. Give the person that command.
  - When a unit parks, the park agent writes a `waiting` line with the question id. The unit then stays silent until the person answers, so the watch gives no `stale` event for that unit. The `asked` event of K3 gives the question.
  - The unit end agent appends the run-end note of the unit to the unit's `commentary.md`. Do not append that note again.
