# Standing Steering (steer.md)

This file is the ONE canonical statement of the steering contract. Every stage reference cites it by
name instead of restating it — a conventions test fails the build if the full contract body appears
anywhere else under `skills/`.

Standing steering is the user's durable, asynchronous voice in a workflow: the constraints,
preferences, and vetoes that must hold across sessions and sub-agent boundaries without being
re-typed into every stage gate.

## The file it governs

`.ai/workflows/<slug>/steer.md` — **optional, user-owned, free prose.** No frontmatter, no schema;
bullets of standing constraints and preferences ("don't touch `config/loader.ts` — it's being
rewritten", "prefer the queue approach", "no new runtime deps"). Stages **never author or edit it.**
The one exception: when the user dictates steering in chat ("add to steering: never touch
`config/loader.ts`"), the stage may transcribe the instruction verbatim — transcription, not
authorship.

## The contract every stage honors

1. **Read.** At Step 0, before any stage work, read `steer.md` if it is present. Absent file → no
   steering: proceed normally, add no steering fields, make no noise.
2. **Precedence.** Live user instructions in this session outrank `steer.md`, which outranks
   stage-reference defaults. Steering **never overrides a MANDATORY gate** — the External Output
   Boundary, sibling-fragment enforcement, AC verifiability, the plan/verify constraint-resolution
   rule. A steering entry that tries to is surfaced to the user, not obeyed.
3. **Conflict.** When an entry conflicts with the stage contract, is impossible for this stage, or is
   ambiguous, raise it with the user directly in chat — never silently ignore it, and never silently obey it
   into a broken state.
4. **Acknowledge.** When `steer.md` exists, the stage artifact records what was honored in a
   `steering-honored:` frontmatter list (e.g. `["avoided config/loader.ts", "used the queue
   approach"]`). Absent file → omit the field entirely; do not emit an empty list as noise.
5. **Propagate (load-bearing).** Sub-agents run with fresh context and never re-read the workflow
   directory. Any stage that dispatches sub-agents — plan research, implement coders, verify/review
   panels, the docs pipeline — MUST inject the relevant steering entries into each sub-agent's
   prompt. A steering file only the orchestrator reads is decorative.

## Scope notes

- Steering is **per-workflow**. Project-level standing conventions ("never edit generated `dist/`")
  belong in `CLAUDE.md` or `sdlc-config.json`, not here.
- In an autonomous run (`$wf auto`, `$wf yolo`) a **steering veto outranks any policy default** —
  steering is the user's standing voice exactly where the interactive gates it would speak through
  are absent.
- `status <slug> deep` reads `steer.md` as **signal, not drift**: "an artifact contradicts a steering
  entry" is a drift finding; "steer.md exists" is normal, expected state.
- A steering entry that recurs across workflows is a candidate solutions-corpus learning; retro's
  distillation step may promote it (the durability filter still applies).
