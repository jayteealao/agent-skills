---
description: Answer an open technical question by running code, one round at a time, with the person steering every round. The work runs in a POC worktree on its own branch. A proof ledger is the memory, each accepted decision is one commit, and one rolling report shows the accepted pipeline and every proof. No driver runs a round.
argument-hint: "<idea> | <poc-branch> <idea> | <slug> [request]"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `/wf loop prototype`. A prototype answers an open question by running code. The person starts every round. You run one round, return, and end the run. You never start the next round.

## Requires

Read every row before the first round. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `prototype-ledger.json` | artifact | on-resume | |
| `01-prototype.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `_host-surfaces.md` | procedure | always | Published page |
| `prototype-ledger.json` | writes | | |
| `01-prototype.md` | writes | | |

## The rules of a prototype

- **The person steers.** Only the person's words start a round. Each round records them in `request`. `yolo`, `goal` and `campaign` refuse a prototype slug.
- **The ledger is the memory.** Read `prototype-ledger.json` before every round. The chat compacts; the ledger does not.
- **The worktree holds every file.** Write code, outputs and media inside the worktree, with paths relative to it. Write scratch to `.scratch/prototype/` in the worktree, which git ignores. Do not write to a temp folder or to the main checkout.
- **A decide round commits.** Only a decide round makes a commit, through the prototype script. Other rounds commit nothing.
- **A failure stays.** A failed or unresolved proof stays in the ledger and on the report, with its reason.

CAUTION: stage by path, per the commit rule of [_workflow-rules.md](_workflow-rules.md). A proof writes model weights, downloads and virtual environments, and a sweep commits them. The prototype script stages explicit paths only.

## Step 0 — Resolve

1. Resolve `projectRoot` (the repo root that owns `.ai/workflows`) and `<skill-dir>`. Every git write goes through the prototype script. Each command prints one JSON object:

   ```
   node "<skill-dir>/scripts/prototype.mjs" <command> "<projectRoot>" <slug> ...
   ```

2. Read the first token:
   - When `prototype.mjs status` finds a prototype with that slug, **resume** it. The other tokens are the person's request.
   - When the first token is a branch that exists (local or `origin/`), the other tokens are the idea. **Start** on that branch: pass `--branch <token>`.
   - Otherwise all the tokens are the idea. **Start** on a new `poc/<slug>` branch.
   - When `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <token> index` exits 0 and shows another `workflow-type`, end the run: *"`<token>` is a `<type>` workflow. Start a prototype with `/wf loop prototype <idea>`."*
   - With no token, end the run and show the invocation forms below.
3. **Start:** derive the slug from the idea (lower-case words joined by dashes, at most 5 words). Run `start <slug> --idea "<idea>" [--branch <b>]`. Show the branch, the worktree, and the scratch folder. Then go to Step 1 with the idea as the first request.
4. **Resume with no request:** show the accepted pipeline, the open proofs, the last round, and the report link from `status`. End the run.

```
/wf loop prototype <idea>                 Start a prototype on a new poc/<slug> branch.
/wf loop prototype <poc-branch> <idea>    Start a prototype on an existing POC branch.
/wf loop prototype <slug> [request]       Resume a prototype and run one round.
```

## Step 1 — Name the round

Infer the kind from the person's words. Name the kind and the question in the first line of your reply.

| Kind | The person asks to | Output |
|---|---|---|
| `research` | find ways to answer the question | Ranked candidate proofs, each with a question, the smallest experiment, and pass/fail checks |
| `prove` | prove out a step or all steps | Runs, measurements, one proof card per question |
| `compare` | test two or more options | A matrix of configurations on the same inputs |
| `diagnose` | find why a result is wrong | The root cause, with an ablation as evidence |
| `decide` | accept a component | An accepted component and a commit |
| `generalize` | run on new inputs with no manual help | A frozen config, a regression run, a held-out run |
| `document` | write down the pipeline as it is now | `01-prototype.md`, current, with rejected paths excluded |
| `talk` | ask a question that needs no work | An answer in chat that cites code. Only the round log changes |

A round can run independent proofs in parallel, one sub-agent per proof ([_subagents.md](_subagents.md)). The round is still one round. Record the count in `agents`.

## Step 2 — Run the round

1. Add the round to `rounds`: `id` (`R-NN`), `kind`, `request` (the person's words), `question`.
2. Do the work in the worktree.
3. Write one proof card per question in `proofs` (`P-NN`):
   - `question`: one sentence.
   - `setup`: inputs, seeds, model revisions, hardware.
   - `evidence.measured` and `evidence.estimated`: the numbers, each with a `name`, a `value` and a `unit`. Put a number in `measured` only when you ran the measurement. Give each estimated number a `basis`.
   - `repro`: run the check again in the same process and in a fresh process. Record `pass`, `fail` or `not-run` for each.
   - `verdict`: `pass`, `mixed`, `fail` or `unresolved`.
   - `licenses`: every model and asset license that the proof used.
   - `files` and `media`: every file that the proof wrote, relative to the worktree.
4. Record a failed approach in `rejected`, with the reason and its proofs.
5. Run `check`. It must return `ok: true`. A write of the ledger that breaks a rule is blocked; repair it while the round is in context.

## Step 3 — Decide and generalize

A decide round accepts a component only from the person's words.

1. Before you record the decision, find a passed generalize proof for the component: one held-out input, frozen settings, and no manual selection or retouch by you.
2. When no such proof exists, say so, and ask whether to run a generalize round first. The person can accept without one.
3. Record the decision in `decisions` (`D-NN`): `component`, `proofs`, `words` (the person's words), `generalized`, and `generalize-proof` when there is one. Without a generalize proof, `generalized` is `false`.
4. Add the component to `pipeline`: `stage`, `component`, `settings`, `decision`, and the measured `time` and `cost` when you have them.
5. Update `01-prototype.md` (Step 4).
6. Run `decide <D-NN>`. The script builds the report, stages the decision's files and the prototype's records by explicit path, and commits `poc: accept <component>`. It refuses a missing, ignored or oversized file, and staged files that the decision does not name.

## Step 4 — Write the person's document

`01-prototype.md` is the accepted pipeline in plain words: the stages, their settings, the measured speed and cost, and the known limits. Rewrite its body after a decide round and in a document round. Exclude the rejected paths; the report keeps them.

The record is in the worktree, so `<worktree>` is the root of each command. Get the record with `node "<skill-dir>/scripts/wf.mjs" record get "<worktree>" <slug> 01-prototype.md`. Write the whole record to the draft `.ai/workflows/<slug>/.draft/01-prototype.md` in the worktree, then run `node "<skill-dir>/scripts/wf.mjs" record put "<worktree>" <slug>` per [_records.md](_records.md).

## Step 5 — Update the report

1. Run `report`. The script builds `report.html` from the ledger and the proof media. The page has the accepted pipeline, the latest round, every proof newest first, and the rejected and unresolved paths.
2. The page must have `ok: true`. The script refuses a page over 1 MB, a page with a script, and a page that loads an external resource. When the page is too large, make the images smaller. Put video and large media on their own page, or in the artifact's asset store.
3. Publish the page per the published-page row of [_host-surfaces.md](_host-surfaces.md). Republish to the link in `report.url`, so the link that the person shares stays the same. Record a new link in `report.url`.
4. When the person asks for a separate page, write it as a separate page and link it from the rolling report.

## Step 6 — Return

Return a short summary, the numbers (measured and estimated kept apart), and the report link. End the run. The next round starts only when the person asks for it.

End with the dispatcher's summary block (SKILL.md Step 2). `Next` is `/wf loop prototype <slug> <request>`.

## Exit

Only the person ends a prototype. Run `exit <slug> park|graduate|close` with the person's choice:

- **park**: the prototype stays open. The branch and the worktree stay.
- **graduate**: `01-prototype.md` becomes the brief. The script prints `/wf intake <idea> from <slug>`; give it to the person. The POC branch stays as the reference implementation.
- **close**: the script lists the links in the worktree. Then `/wf intake <slug> close` archives the workflow.

WARNING: before you remove a worktree, look for `node_modules` junctions. `git worktree remove --force` deletes through a junction into the main checkout. Run `cleanup` only after the person agrees. It refuses while the worktree holds a link, and it keeps the branch.

## The files

The workflow folder is in the worktree, on the POC branch. The main checkout's `INDEX.md` has one `prototype` row, so `/wf status` finds the worktree.

| File | Reader | Content |
|---|---|---|
| `00-index.md` | agents, status | `workflow-type: prototype`, `branch`, `worktree`, `status` |
| `prototype-ledger.json` | agent | Proof cards, rounds, decisions, the pipeline, rejected paths |
| `01-prototype.md` | person | The accepted pipeline in plain words |
| `report.html` | person | The rolling report |
