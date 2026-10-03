# The yolo watch and the running commentary

`/wf yolo` starts a watch on its own run and gives the person a running commentary. The main session follows this file when it starts the watch and when a watch event arrives. The person never builds or re-arms a watch.

The watch is `scripts/yolo-watch.mjs`. It polls the driver journal, the git HEAD, the protected files, and the usage readings. It writes one JSON line per event, and it exits by itself after the run ends.

## Start the watch

1. Right after the `Workflow(...)` call in yolo.md Step 1, start the watch with the **Monitor** tool. Set `timeout_ms` to 1800000, the maximum:

   ```
   node "<pluginRoot>/scripts/yolo-watch.mjs" "<projectRoot>" <slug>
   ```

   Set the description to `yolo <slug>`.
2. When the Monitor tool is not available, do not start a watch. The run is unchanged.
3. When a Monitor expires and the Workflow did not return, start the same command again. Say nothing in chat: a re-arm is not news (C3). The watch keeps its offsets in `.watch-state.json`, so it misses no event.
4. On a relaunch of the same slug (yolo.md "Resuming"), start the same command. The person does not ask for the watch again.

## The events

| Event | What happened | Chat | Push |
|---|---|---|---|
| `stage-start` | A stage agent started. | One line: the slice, the stage, the time. | no |
| `stage-end` | A stage agent ended. | The full stage note (C1). | no |
| `commit` | A new commit is on the branch. | One or two sentences per commit. | no |
| `decision` | The stage artifact waits for input, or records an `intent-bearing` decision. | A full note: the decision, the artifact, and what the person decides. | yes |
| `protected-change` | A protected file changed. `dirtyAtStart: true` means the file held the person's uncommitted edits. | A full note: the file, the change, and the stage that ran. | yes |
| `stale` | The journal is silent past the liveness limit, and its newest line is an `agent-start`. | A warning, worded per the staleness rule in [../_control-file-ownership.md](../_control-file-ownership.md). | yes |
| `stop` | A stage agent returned `hard-stop`, or stopped on a stop request. | Why the run stopped, and the resume command. | yes |
| `run-end` | The driver ended. `inferred: true` means that the journal went silent after an `agent-end`. | The run summary. | yes |
| `usage` | A usage reading crossed a budget line. | One line with both windows and their reset times. At level `pause`, a full note. | at `pause` |
| `usage-reset` | The window of a pause reset. | One line. | no |

Scout, classifier, and bookkeeping agents give no event.

## The commentary rules

- **C1.** For `stage-end`, read the stage artifact that the event names. Then say:
  - what the stage built or found;
  - what it decided, with the class of each decision;
  - how many errors it recovered from (`errors`), and whether an error stopped it;
  - what comes next.
- **C2.** Use plain words and STE. Explain a term that the person did not see before.
- **C3.** Say nothing when you re-arm the watch.
- **C4.** Append each note to `.ai/workflows/<slug>/commentary.md` with the event kind:

  ```
  node "<pluginRoot>/scripts/yolo-watch.mjs" note "<projectRoot>" <slug> --event <kind> <<'NOTE'
  <the note, as said in chat>
  NOTE
  ```

  The script adds the time. After a compaction, read the last notes in `commentary.md` before the next note, so the story continues.
- **C5.** Send a push notification (the `PushNotification` tool) only for the events that the table marks. Lead with what the person acts on, for example "yolo engine-modules: plan stopped on decision D6".
- **C6.** Answer the person's questions between events from the records: the artifacts, the journal, `commentary.md`, and git. Do not answer from memory. A watch event does not block the conversation.

## Quiet

When the person says "quiet", stop the notes for every event except `stop`, `stale`, and `run-end`. Record the change, so that it survives a compaction:

```
node "<pluginRoot>/scripts/yolo-watch.mjs" note "<projectRoot>" <slug> --event quiet <<'NOTE'
The person asked for quiet. Notes continue for stop, stale, and run-end only.
NOTE
```

When the person asks for the commentary again, record `--event loud` the same way.

## Stop at the next boundary

The person can stop the run at a stage boundary, for example "stop after the current verify" or "stop after this stage".

1. Write the stop request. `<after>` is `current` for "after this stage", or the stage that the person names (`plan`, `implement`, `verify`, `review`):

   ```
   node "<pluginRoot>/scripts/yolo-watch.mjs" control "<projectRoot>" <slug> stop <after>
   ```

2. Tell the person in one line where the run stops. The agent that starts the next stage reads `.ai/workflows/<slug>/.control.json`. When the request holds, the agent does no work, and the driver ends with `stoppedAt: stop-request`.
3. When the person adds a steering change in the same message, transcribe the change into `steer.md` per [../_steering.md](../_steering.md). The next run reads it. A stop request is a control signal, not steering: it says when the driver ends, not how a stage works.
4. When the run ends with `stoppedAt: stop-request`, delete the request:

   ```
   node "<pluginRoot>/scripts/yolo-watch.mjs" control "<projectRoot>" <slug> clear
   ```

   Then report where the run stopped and the resume command, `outcome.route`.

## Usage pause

1. When a `usage` event arrives at level `pause`, or a stage fails with a usage-limit error, write a pause with the reset time of the full window:

   ```
   node "<pluginRoot>/scripts/yolo-watch.mjs" control "<projectRoot>" <slug> pause <resetsAt> <window>
   ```

   When the error states no reset time, ask the person for it.
2. The next stage agent stops, and the driver ends with `stoppedAt: usage-pause`. Say why the run paused and when it resumes. During the pause, give no notes: each note uses the same limits.
3. When `usage-reset` arrives, or the reset time passes, clear the control file and relaunch the run per yolo.md "Resuming".

## When the Workflow returns

1. Before the yolo.md Step 2 hand-back, end the watch:

   ```
   node "<pluginRoot>/scripts/yolo-watch.mjs" end "<projectRoot>" <slug> --stopped-at <outcome.stoppedAt>
   ```

   Omit `--stopped-at` when the run reached its endpoint. The watch emits `run-end` and exits.
2. The Step 2 hand-back is the run summary. Do not also give a `run-end` note in chat. Append the hand-back's narrative paragraph to `commentary.md` with `--event run-end`.

## In a campaign

`/wf campaign` uses the same watch, with these changes.

- **K1. One watch per wave.** At the wave start, start one watch over every slug of the wave and the campaign journal:

  ```
  node "<pluginRoot>/scripts/yolo-watch.mjs" "<projectRoot>" <slug-1> <slug-2> ... --campaign <brainstorm-slug>
  ```

  The source is the main checkout. A slug's `run-end` does not end this watch, because the boundary and the next slug still run. The campaign journal's `campaign-end` line ends it, and so does a `wave-end` line when no other started wave is still open (waves overlap: wave n ships while wave n+1 runs). To end it early, run `yolo-watch.mjs end "<projectRoot>" - --campaign <brainstorm-slug>`.
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

- **K4. Where the notes go.** A campaign note goes to `work/campaign/commentary.md`. A slug's note goes there and to the slug's own `commentary.md`. Add `--campaign <brainstorm-slug>` to the `note` command; use `-` as the slug for a note about the campaign only.
- **K5. Scoped stop requests.** A stop request can name one slug, the wave ("stop after this wave"), or the campaign:

  ```
  node "<pluginRoot>/scripts/yolo-watch.mjs" control "<projectRoot>" <slug or -> stop <after> --campaign <brainstorm-slug> --scope <slug|wave|campaign>
  ```

  A yolo run reads a `slug` request for its own slug and every `campaign` request. A `wave` request is for the campaign session: the running wave finishes, and the next wave does not start.
- **K6. While the person prepares.** The watch runs only in the campaign session. While the person prepares slugs there, give one line per event, and hold the full notes until the prepare batch ends. Push the events that the tables mark at once.
