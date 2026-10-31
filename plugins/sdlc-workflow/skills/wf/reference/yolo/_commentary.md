# The yolo watch and the running commentary

`/wf yolo` starts a watch on its own run and gives the person a running commentary. The main session follows this file when it starts the watch and when a watch event arrives. The person never builds or re-arms a watch.

The watch is `scripts/yolo-watch.mjs`. It polls the driver journal, the git HEAD, the protected files, and the usage readings. It writes one JSON line per event, and it exits by itself after the run ends. It also appends one line to `commentary.md` for each `stage-start` and `commit` event, and for each look-in of a run that decides for the person (R1).

The Monitor tool stops a watch after 30 minutes at most. The session has no watch without a deadline, so it starts the watch again when it expires.

## Start the watch

1. Right after the `Workflow(...)` call in yolo.md Step 1, start the watch with the **Monitor** tool. Set `timeout_ms` to 1800000, the maximum:

   ```
   node "<pluginRoot>/scripts/yolo-watch.mjs" "<projectRoot>" <slug>
   ```

   Set the description to `yolo <slug>`.
2. When the Monitor tool is not available, do not start a watch. The run is unchanged.
3. When a Monitor expires and the Workflow did not return, start the same command again. Say nothing in chat: a re-arm is not news (C3). The watch keeps its offsets in `.watch-state.json`, so it misses no event. The watch also ends itself after 31 minutes, so a watch that the Monitor stop leaves running does not run for days.
4. When the Monitor tool gives no output, use the one-shot watch. To test, start a Monitor whose command is only `echo ok`. When no event arrives, the Monitor gives no output in this session. Then:
   1. Start the watch with `--once` as a background shell task, with the longest timeout the tool allows (2 hours):

      ```
      node "<pluginRoot>/scripts/yolo-watch.mjs" "<projectRoot>" <slug> --once
      ```

   2. When the task ends, read its output. Each line is one event of the table below. Handle the events. The task ends only on news: a `stage-end`, a `decision`, a `stop`, a `stale`, a `protected-change`, a `look-in`, or a `run-end`. A `commit` or a `stage-start` does not end it: their lines wait in the output until news comes.
   3. Start the same command again. The offsets in `.watch-state.json` keep every later event. Do not filter the output; the watch has no noise to remove.
   4. A `watch-timeout` line means that 110 minutes passed with no event. Start the command again, and say nothing in chat.
5. On a relaunch of the same slug (yolo.md "Resuming"), start the same command. The person does not ask for the watch again. The new watch replaces the old one: the old watch emits `watch-replaced` and exits.
6. When a `watch-replaced` event arrives, do not start that watch again, and say nothing in chat. Another watch reads the same journals.

## The events

| Event | What happened | Chat | Push |
|---|---|---|---|
| `stage-start` | A stage agent started. The watch already wrote the line to `commentary.md`. | One line: the slice, the stage, the time. | no |
| `stage-end` | A stage agent ended. | The full stage note (C1). | no |
| `commit` | A new commit is on the branch. The watch already wrote the hash and subject to `commentary.md`. | One or two sentences per commit. | no |
| `decision` | The stage artifact waits for input, or records an `intent-bearing` decision. | A full note: the decision, the artifact, and what the person decides. | yes |
| `protected-change` | A protected file changed. `dirtyAtStart: true` means the file held the person's uncommitted edits. A file gives one event per 10 minutes, however often it is saved. In a worktree, uncommitted files at the watch start are an earlier run's work, not the person's, so they are not protected. | A full note: the file, the change, and the stage that ran. | yes |
| `stale` | The running agent is silent. With `signal: transcript`, the agent's own transcript wrote nothing for 15 minutes: one tool call lasts 10 minutes at most, so the agent hangs. With `signal: pending-tool`, a tool call of the agent (`tool`, since `toolSince`) has no result yet: the agent waits on that tool, most often for the person's approval of a prompt. With `signal: journal`, no transcript was found, and the journal is silent past the liveness limit with an `agent-start` as its newest line. | A warning, worded per the staleness rule in [../_liveness.md](../_liveness.md). With `signal: transcript`, say that the agent hangs, and offer to stop the run and resume it. With `signal: pending-tool`, say which tool call waits and since when, and ask the person to look for an approval prompt in the app. Do not offer to stop the run: a stop throws away the stage's work. | yes |
| `stop` | A stage agent returned `hard-stop`, or stopped on a stop request. | Why the run stopped, and the resume command. | yes |
| `look-in` | A stage ran past its expected time: the stage's time box from the test profile, or 30 minutes when the profile gives no time for the suites of the stage (`--look-in <minutes>` sets one time for every stage; 0 turns it off). A stage gives one look-in past its expected time, and the next only past twice that time. `running` lists each open stage agent: its minutes, its `expectedMinutes`, `due` for the stages past their time, its `root`, its `journal`, and its `transcript` when the watch finds it. When the run decides for the person (the `run-decisions` steer takes the recommended option), the watch writes the look-in to `commentary.md` itself and does not send it to the session. | Send a reader to look in, and tell the person what is happening (C7). | no |
| `run-end` | The driver ended. `inferred: true` means that the journal went silent after an `agent-end`. | The run summary. | yes |
| `watch-replaced` | A newer watch reads the same journal. This watch exited. | Nothing. Do not start this watch again. | no |
| `watch-timeout` | A `--once` watch gave no event for 110 minutes. | Nothing. Start the `--once` watch again. | no |

Scout, classifier, and bookkeeping agents give no event.

## The commentary rules

- **C1.** For `stage-end`, read the stage artifact that the event names with `node "<pluginRoot>/skills/wf/scripts/wf.mjs" record get "<projectRoot>" <slug> <name>` ([_records.md](../_records.md)). Then say:
  - what the stage built or found;
  - what it decided, with the class of each decision;
  - how many errors it recovered from (`errors`), and whether an error stopped it;
  - what comes next.
- **C2.** Use plain words. Explain a term that the person did not see before.
- **C3.** Say nothing when you re-arm the watch.
- **C4.** The watch writes the `stage-start` and `commit` lines to `commentary.md` itself (R1). Append each other note to `.ai/workflows/<slug>/commentary.md` with the event kind:

  ```
  node "<pluginRoot>/scripts/yolo-watch.mjs" note "<projectRoot>" <slug> --event <kind> <<'NOTE'
  <the note, as said in chat>
  NOTE
  ```

  The script adds the time. After a compaction, read the last notes in `commentary.md` before the next note, so the story continues.
- **R1.** The watch appends one line per `stage-start` and per `commit` event, for example `- 2026-10-08 10:01 UTC · stage start · plan · slice auth`. It writes the line where the drive writes its records: in the worktree when the drive has one. Do not append a note for these two events. In a run that decides for the person, the watch also appends one line per stage of a look-in, for example `- 2026-10-08 11:02 UTC · look-in · implement · slice auth · 45 min, expected 30 min`, and the session hears nothing of it.
- **R2.** The chat reply for each event stays as the table says. The record in `commentary.md` does not depend on the chat reply.
- **C5.** Send a push notification (the `PushNotification` tool) only for the events that the table marks. Lead with what the person acts on, for example "yolo engine-modules: plan stopped on decision D6".
- **C6.** Answer the person's questions between events from the records: the artifacts, the journal, `commentary.md`, and git. Do not answer from memory. A watch event does not block the conversation.
- **C7.** A look-in is the work of one sub-agent. The main session never reads the driver journal, the agent transcripts, the git log or the changed files itself for a look-in: the reading fills the session's context. Dispatch one research sub-agent at the summary tier ([../_subagents.md](../_subagents.md)), and wait for its answer. Give it:
  1. the `look-in` event, as JSON;
  2. the newest note in `commentary.md`, so it knows what the person heard last;
  3. this read list, for each agent in `running`:
     - where the workflow stands: `node "<pluginRoot>/skills/wf/scripts/wf.mjs" status "<projectRoot>" <slug> --brief`;
     - the step of the slice: `node "<pluginRoot>/skills/wf/scripts/wf.mjs" step where "<projectRoot>" <slug> <slice>`;
     - the run record: `node "<pluginRoot>/skills/wf/scripts/wf.mjs" progress show "<projectRoot>" <slug>`;
     - the newest 40 lines of its `journal`;
     - the commits since the newest note (`git -C <root> log --since "<the note's time>" --oneline`);
     - the changed files (`git -C <root> status --short`);
     - the newest 60 lines of its `transcript`, when the event names one;
  4. for a campaign work packet (`00-index.md` has `origin-packet`), the state of its list: `node "<pluginRoot>/skills/wf/scripts/campaign.mjs" status "<projectRoot>" <source-slug>`;
  5. the answer it returns: a short paragraph that says what each running stage does now and for how long, what changed since the newest note, what comes next, and what waits on the person. For each held question in the `open-questions` that `status --brief` prints, the answer gives its key and its question, exactly as printed. When nothing changed, the answer is one line that says so. The answer quotes no file contents and no transcript lines.

  The sub-agent changes no file. Tell the person its answer, and append the answer with `--event look-in`. When the sub-agent gives no answer, say in one line that the look-in failed, and wait for the next event.

## A delegate run

While a delegate run is live (yolo.md, "Delegate mode"), the person gets notes, not questions.

1. Do not ask the person about a delegate decision. Do not use the question tool for it, and do not ask "confirm D-<n>?".
2. When a look-in, a commit or a `decision` event shows a delegate decision that changes product behaviour, defers a failing check, accepts a verify item or starts a long run, write one chat line: what the run chose, the measured effect (for example "generated leagues: 4.9 shots a team, 27 before"), and the words that reverse it (for example "Say 'reverse D-080: find the cause now'"). Append the line with `--event decision`.
3. When the person reverses a decision in chat, record `decide add --kind answer --by person` with the same key and the person's words. Do not stop the driver: the next stage reads the answer at its start.
4. Delegate mode ends only when the person asks the run to stop deciding for them, or gives a new `run-decisions` answer. Then record the new `run-decisions` steer. "I'm back", or any other sign that the person is present, does not end it. Do not keep a note of an away mode: the `run-decisions` steer is the only state.

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

2. Tell the person in one line where the run stops. The agent that starts the next stage reads `.ai/run/<slug>/.control.json`. When the request holds, the agent does no work, and the driver ends with `stoppedAt: stop-request`.
3. When the person adds a steering change in the same message, record the person's exact words with `decide add --kind steer` per [../_decisions.md](../_decisions.md). The next run reads it. A stop request is a control signal, not steering: it says when the driver ends, not how a stage works.
4. When the run ends with `stoppedAt: stop-request`, delete the request:

   ```
   node "<pluginRoot>/scripts/yolo-watch.mjs" control "<projectRoot>" <slug> clear
   ```

   The clear keeps a request that the person made after the run ended: that request is for the next run. When the person withdraws a request, add `force`.

   Then report where the run stopped and the resume command, `outcome.route`.

## When the Workflow returns

1. Before the yolo.md Step 2 hand-back, end the watch:

   ```
   node "<pluginRoot>/scripts/yolo-watch.mjs" end "<projectRoot>" <slug> --stopped-at <outcome.stoppedAt>
   ```

   Omit `--stopped-at` when the run reached its endpoint. The watch emits `run-end` and exits.
2. Remove the scratch worktrees that the stages left. A run that stopped before its run-end agent left them in place:

   ```
   node "<pluginRoot>/scripts/wf.mjs" worktree remove "<projectRoot>" <slug>
   ```

   When it exits 1, put each `kept` line in the hand-back.
3. The Step 2 hand-back is the run summary. Do not also give a `run-end` note in chat. Append the hand-back's narrative paragraph to `commentary.md` with `--event run-end`.
