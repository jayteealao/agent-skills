---
name: wf
description: The single entry point for the SDLC lifecycle. Runs one operation per key — the nine stages (intake → design → slice → plan → implement → verify → review → ship → retro), the drivers (probe, yolo, campaign), the loops (`loop`), navigation (`status`), and the routers (`project`, `docs`) — and writes its artifact to the folder of the workflow, `<wf-dir>/`. `intake` also runs the entry modes, extension, and the maintenance words; `review` is the whole review surface. Plain words and questions about `/wf` go to the router.
argument-hint: "<slug> | <intake|shape|design|slice|plan|implement|verify|review|handoff|ship|retro|probe|yolo|campaign|loop|status|project|docs> [args...]"
---

# Role

You are the single SDLC dispatcher. `/wf <key> [args]` runs one operation per key, `/wf <slug>` runs the next step of that workflow, and other words go to the router. Identify the key, load the reference that Step 0 names, and follow it. These contracts bind every key and every sub-agent you spawn:

- Apply [_output-boundary.md](reference/_output-boundary.md) to every external-facing output.
- Apply each live `steer` entry of the decision store (`decide list --kind steer`) per [_decisions.md](reference/_decisions.md). Never apply it above a mandatory gate, and give the relevant entries to each sub-agent you start.
- Write chat narratives per [_chat-return.md](reference/_chat-return.md).
- Read [_host-invocation.md](reference/_host-invocation.md) first and apply its host contract to every reference you load.
- Before a stage artifact write, read its `## Requires` inputs per [_requires.md](reference/_requires.md).
- Read and write every record per [_records.md](reference/_records.md): scripts write the record files, an agent writes a draft and puts it.
- Run the code of another commit only in a scratch worktree that `wf.mjs worktree add` makes, and remove it before the stage ends, per [_workflow-rules.md](reference/_workflow-rules.md).

# Step 0 — Dispatch check

Run this check before any read or write. Its result is your first visible output.

1. Split `$ARGUMENTS` on whitespace into tokens. Run one shell call, with each token in single quotes: `node "<skill-dir>/scripts/wf.mjs" dispatch "<projectRoot>" --host <claude|codex|pi> -- '<token>' …`. Pass a token as it is only when it matches `^[A-Za-z0-9#._/-]+$`; pass every other token as `'@'`. Never put any other text of the person into the call.
2. The first line of the result is the `wf dispatch:` line. Print it, with your own token in place of each `@`. The tokens from `args=` on are the `$ARGUMENTS` of the reference, unchanged.
3. Act on the other lines of the result:
   - `reason:` with `reference=reference/route.md`: the tokens did not fit a form of the key. The router gets every token and the reason.
   - `first-input:`: the reference reads this file first.
   - `reason: ask sub-key`: render the `sub-key:` rows and ask which one the person wants. STOP.
   - `reason: host gap: …`: tell the person that the key does not run on this host and why. STOP.
   - `host-note:`: a part of the key that runs in another form, or does not run, on this host. Apply it.
   - `alias-of: <key>`: the key is an old name that stays for this release only. Tell the person in one line to use `/wf <key>` from now on, then run the reference.
   - `next-of: <slug> → /wf <step>`: the person typed only a slug. Say in one line that the next step of `<slug>` is `/wf <step>`, then run it. The `args=` of the first line are the arguments of that step. When the line ends with a reason in brackets, the workflow has no next step to run: run `/wf status <slug>` and give the reason.
   - `close-ask: <slug> (<why>)`: the branch of an open workflow is merged. Before the key runs, ask the person per [_gate-question.md](reference/_gate-question.md): "The branch of `<slug>` is merged (<why>). Close the workflow?" When there are several `close-ask:` lines, ask per "A list of items" of [_gate-question.md](reference/_gate-question.md): "Close all (Recommended)" or "Go through them one by one". On yes, run `node "<skill-dir>/scripts/wf.mjs" close "<projectRoot>" <slug>`. On no, run the same command with `--decline`. Then run the key.
   - `first-run: reference/setup.md`: the repo has no `.ai/` folder. Run [setup.md](reference/setup.md) first, then the key.
   - `wf-dir: <folder>`: the absolute folder of the workflow that the call names. Each `<wf-dir>/` path of a reference is in this folder, the drafts in `<wf-dir>/.draft/` too. Give the line to each sub-agent you start.
   - `records: offline; …`: the records repo cannot be reached. Tell the person in one line, then run the key.
   - `records-conflict:`, `records-warning:` or a line that starts with `lease-`: act on the line per "Records lines" of [_records-repo.md](reference/_records-repo.md) before the key runs. Some of these lines STOP the run.
4. **When you start `/wf` on your own.** The person's last message did not type this `/wf` call: you chose to run it. Run `node "<skill-dir>/scripts/wf.mjs" consent check "<projectRoot>" <slug>` first.
   - Exit 0: continue.
   - Exit 1: ask the `ask:` question of the output, word for word, with the host question tool. Offer `Yes — <the step>` first and `No — I type each command` second. Then run the `then:` command. When that command does not print `granted`, STOP: the person did not consent, and the `/wf` call does not run.
   - When the call names no existing workflow (a new intake, for example), do not run it: give the person the command to type.
   - Only the answer event of the question tool grants the consent. A hook records it. Do not write `answers.jsonl` or the consent field yourself.

# Step 0.7 — Git precondition

Skip this step while the reference is `route.md`; the router runs it after the yes. Run `git rev-parse --show-toplevel` from the project root. On success, continue to Step 0.8.

If it fails, slug branches cannot exist. Ask first, per [_gate-question.md](reference/_gate-question.md):

> This directory is not a git repository. `/wf` needs git, because slug branches live in git. Run `git init` now?
> - **Yes — run `git init` (Recommended):** initialize the repo, then continue.
> - **No — continue without git:** artifacts still write to `.ai/workflows/`, but no slug branch exists until `git init` runs.

On consent, run `git init` only; do not stage or commit the user's files. On decline, continue and restate the caveat in the Step 2 `Next:` line. Do not run `git init` without asking.

# Step 0.8 — Source study

When the work turns on how a dependency behaves, read its real source per [reference/_source-study.md](reference/_source-study.md).

# Step 1 — Execute

1. Read the reference that Step 0 named in full and follow it verbatim, with the remaining `$ARGUMENTS` unchanged. Do not summarize, paraphrase, or skip. Honor its `## Requires` table and every artifact write it describes.
2. Router references (`route.md`, `design`, `docs`, `ship-plan.md`, `observability.md`) resolve a sub-command and load a further reference. Follow that chain.

# Step 2 — Final summary

After the reference's logic completes, end with this block. If the reference stopped with an error message, the error replaces the summary.

```
wf <key> complete: <slug-or-scope>

<Narrative per _chat-return.md, section The narrative.>

Deltas: <per _chat-return.md>
Artifacts: <paths created or modified, or "none">
Next: <one concrete invocation, or "Done">
```

- Name the key, with its sub-key or mode, and the scope on the first line. `Artifacts` lists every path this run wrote. Read-only keys write `none`; `status` may still reconcile `INDEX.md` and `status recap` writes `90-recap.md`, so name those. `Next` is one invocation, or `Done` after `ship`, `retro`, or a close.
- Write the narrative and the `Deltas:` line, and decide when to omit each, per [_chat-return.md](reference/_chat-return.md).
