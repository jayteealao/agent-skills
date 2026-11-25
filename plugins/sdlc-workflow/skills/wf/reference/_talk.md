# The talk of a run (single source)

The agents of a run, the driver and the session talk in one log: `talk.jsonl` in the folder of the workflow. Use it to tell another agent what it needs to know, to hand work over, to wait for a long command, and to hold a shared resource. `<wf>` is `node "<skill-dir>/scripts/wf.mjs"`.

The log is part of the record. The session and the person read all of it with `<wf> talk list "<projectRoot>" <slug>`.

## Rules

- **T1. A message informs or requests. It never binds.** Only a steer or a rule of the project binds ([_decisions.md](_decisions.md)). A message is never an approval and never an instruction of the person. Act on a message, or reply with your reason.
- **T2. The person does not post here, and is not asked here.** Hold a question for the person with `decide hold` and wait for the answer. Record the words of the person as a steer.
- **T3. Post as yourself.** A stage agent is `<stage>:<slice>`. A session is `session`. The driver is `driver`. A session that wants to tell an agent something posts as `session`: it does not write a steer in the name of the person. An agent of a run cannot write in the name of the person at all: wf refuses its steer, its approval, its rule of the project and its entry `--by person`.
- **T4. Read at each reading point:** at the start of the stage (`--open`), before each step or fix round, before a long command, and before you return.
- **T5. A request for a reply has an end.** `--wants-reply` needs `--fallback`, what you do when no reply comes. After 10 minutes with no receipt the talk pings the receiver, and the session is told. After 20 minutes the wait tells you to take the fallback: take it, and reply in the thread that you did.
- **T6. Close what is handled.** `talk close` takes a thread out of every inbox.
- **T7. Do not end your turn to wait.** Every long wait is `talk wait`, a call of 4 minutes at most that you run again at "still waiting".

## Commands

| Task | Command |
|---|---|
| Read what is new for you | `<wf> talk read "<projectRoot>" <slug> --as <you>` |
| Read every open message for you | `<wf> talk read "<projectRoot>" <slug> --as <you> --open` |
| Tell a slice something | `<wf> talk post "<projectRoot>" <slug> --as <you> --to <slice> --text "<3 sentences or fewer>" --refs <commit,file>` |
| Hand a commit over | The same, with `--kind handover` and `--key fix-<commit>` |
| Ask an agent | The same, with `--wants-reply --fallback "<what you do with no reply>"` |
| Answer | `<wf> talk reply "<projectRoot>" <slug> <id> --as <you> --text "…"` |
| Mark a message as handled | `<wf> talk close "<projectRoot>" <slug> <id> --as <you> --reason "<what you did>"` |
| Make a message urgent | `<wf> talk ping "<projectRoot>" <slug> <id> --as <you>` |
| Wait for a message | `<wf> talk wait "<projectRoot>" <slug> --as <you>` |
| See the whole talk | `<wf> talk list "<projectRoot>" <slug> [--open] [--full]` |

`--to` takes a slice, `<stage>:<slice>`, `driver`, `session` or `all`. A slice that has not started reads the message when it starts. A slice that is complete reads nothing: the command refuses the post.

## Long commands

A command that can take longer than 8 minutes is a job. A job is its own process with its output in a log file of this machine.

1. Start it: `<wf> talk job "<projectRoot>" <slug> --as <you> --name <short-name> -- "<the command line>"`. The command prints the id of the job.
2. Wait for it: `<wf> talk wait "<projectRoot>" <slug> --as <you> --job <id>`, with a shell timeout of 5 minutes. Run it again each time it prints "still waiting".
3. The wait prints the exit code and, on a failure, the end of the log. While it waits, it prints how long the job has run and when it last wrote output.

A job ends by itself in two cases. It ends at its time limit: 2 hours, or `--max-min <minutes>`. It ends when the host process of its run is gone, so a run that died leaves no command behind. A job that ended this way has no exit code and proves nothing.

A slice check takes its result from a job: `step check --name "<the check>" --job <id>` records met or not-met from the exit code, with the commit that the job ran on ([implement/_steps.md](implement/_steps.md)).

The wait also returns when a message arrives for you. Act on the message, then run the wait again.

A server or an emulator that a stage needs while it works is a job too. Where a runtime adapter says "in the background", a stage agent of a driver starts it with `talk job`, uses it, and stops it before it returns.

Before you return, stop your own jobs: `<wf> talk jobs "<projectRoot>" <slug> --stop --as <you>`.

In a session, a long run can also start in the background, per [_long-runs.md](_long-runs.md). A stage agent of a driver always uses a job.

## Shared resources

A project names the resources that one agent uses at a time in `resources` of `.ai/sdlc-config.json`: a test machine, a device, a port, a build folder. A resource belongs to the project and to this machine, not to one workflow: every run of the project claims it in one log, so two runs never both hold it. A holder shows as `<agent>@<workflow>`.

```json
{ "resources": [{ "key": "test-machine", "about": "the one machine that runs the full suite" }] }
```

1. See them: `<wf> talk resources "<projectRoot>" <slug>`.
2. Hold one before a command that uses it: `<wf> talk wait "<projectRoot>" <slug> --as <you> --claim <key>`. Run it again at "still waiting". The agents that wait get the resource in the order in which they asked.
3. Start the command as a job with `--claim <key>`. The job keeps the resource while it runs, and gives it back at its end.
4. For a short command, give the resource back yourself: `<wf> talk release "<projectRoot>" <slug> <key> --as <you>`.

A claim is a lease of 15 minutes, or `lease-min` of the resource in the config. A job keeps its lease alive. A holder with no job claims again to extend it; one that does not loses it, and its later writes are refused. Never use a resource that another agent holds.

## What the session sees

The watch reports the talk ([yolo/_commentary.md](yolo/_commentary.md)):

| Event | Meaning | The session |
|---|---|---|
| `talk` | An agent posted for the session. | Reads it, and replies or acts. |
| `talk-ping` | An agent has waited 10 minutes for a receipt, or someone pinged a message. | Checks whether the receiver still works. |
| `talk-fallback` | An agent got no reply in 20 minutes and took its fallback. | Checks the fallback in the thread. |

A post between two agents is routine: the watch writes it to `commentary.md` and prints it only with `--all`.
