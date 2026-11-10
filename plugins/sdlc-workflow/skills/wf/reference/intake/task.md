You are running `/wf intake task`, the **minimal lifecycle** for a unit of work with a slug whose deliverable is not a code change verified by running software. Every other surface assumes that deliverable. `task` exists for the five classes that have nowhere else to go:
- repo chores with no behavior change;
- environment and infra operations;
- non-code deliverables;
- coordination with outside parties;
- one-shot throwaway execution.

A task may act outside the repository. Only `ship` shares that, and it is why a task carries an authorization gate that no other intake mode has.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `task`: it overrides the standalone steps below.

In slug-mode, the blast-radius class and its gate (Step 1) still apply, and the slice body records both.

# Pipeline
`0·orient` → `1·brief` → `[gate]` → `2·execute` → `3·evidence` → `4·hand off`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). Start from a description, or resume a task slug. |
| Produces | `00-index.md` (`type: index`, `workflow-type: task`), `01-task.md` (`type: intake`, the brief), `05-implement.md` (what actually happened), `06-verify.md` (per-AC evidence with rungs), `10-retro.md` on request |
| Skips | The shape phase, `slice` and `plan`. `slice` and `plan` are marked `skipped` in `progress:`: the brief carries its steps inline, because for a task the plan and the brief are one motion. `review` and `ship` are `skipped`, unless the task produced a repo diff worth reviewing or merging (Step 4). |
| Next | `Done` for most tasks. A task that left a reviewable diff → an ad-hoc `/wf review <dimension>` or `/wf ship <slug>`. |
| Escalate | The deliverable turns out to be a code behavior change → `/wf intake fix`; more than one slice of work → `/wf intake` (tripwires below). |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-task.md` | artifact | on-resume | |
| `05-implement.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-task.md` | writes | | |
| `05-implement.md` | writes | | |
| `06-verify.md` | writes | | |

# Task discipline
- **Observe again; never assert.** An acceptance criterion closes only on an independent observation of the outcome. Read the system of record again after you act: `ls` the directory, `curl` the DNS record, query the API, read the file back. An AC whose only evidence is the agent's own claim of success carries `evidence-rung: asserted`, and it cannot close: managed-artifact enforcement ([_host-invocation.md](../_host-invocation.md)) blocks `result: pass` on the same path that blocks a mock-evidenced code AC. The rung ladder for tasks is a **contract revision (§7)** of [EVIDENCE-SCHEMA-CONTRACT](../../../../docs/internal/EVIDENCE-SCHEMA-CONTRACT.md); `verify.md` places the task rungs on the evidence ladder.
- **Above `local-env`, the gate always applies.** A `shared-env`, `external-party` or `irreversible` task stops for the explicit authorization of a person, even when every other signal says go on. No written policy resolves these without a person. The default without a person is to stop, with the missing authorization recorded, and never to go on. The drivers refuse `task` slugs entirely.
- **`task` is not a todo list.** One task is one outcome. When there is more than one independent outcome, list them and have the person pick one, or escalate to a feature.
- `current-stage` stays inside the standard enum: `implement` while you work, `verify` while you check. Never a label of its own.
- Keep the stated order only where a step uses the output of an earlier step or crosses a gate. Reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve the slug and the mode:**
   - When the slug that intake took, or the first token after `task`, has an index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) with `workflow-type: task`, this is a **resume**. Continue at the first incomplete step.
   - When intake took a slug of another `workflow-type` that is not closed, this is **slug-mode** (above).
   - Otherwise this is a **new task**. Name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `task-<short-description>`.

1b. **Provenance check.** Apply `intake/_intake-provenance.md`:
   - Detect an inherited analysis decision: a trailing `from <source-slug>` token. It is implied when this task runs from a work packet ([../intake.md](../intake.md), "List work packet").
   - Use the matching row of the Consume table.
   - Link back: record `origin-<type>` here, and `origin-packet` when the source is a work packet.

   With no match, go on. That is the common case.
2. **Branch decision.** The default is `branch-strategy: none`: most tasks do not need a branch. This is the reverse of the `fix` default, on purpose. Create a branch only when the task will produce a repo diff that the person wants isolated. Record the decision either way.
3. **Project context, lightly:** read the top 100 lines of `README.md`, and each file that the description names.

# Step 1 — Brief (`00-index.md` + `01-task.md`)

Write the brief. Write `01-task.md` and `00-index.md` as drafts `<wf-dir>/.draft/<name>`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. Ask at most 2 questions in chat. Record each answer with `decide add` per [_decisions.md](../_decisions.md), and also write it inline into the artifact.

`01-task.md` (`type: intake`) satisfies the required set of intake: `status: complete`, `stage-number: 1`, `created-at`/`updated-at` per [_timestamp.md](../_timestamp.md), `tags`, `refs`, `next-command`, `next-invocation`, `recommended-routes`. It carries these fixed `##` headings and fields:

- `## Restated Request`: the outcome that this task exists to produce, in one paragraph.
- **`blast-radius`** (frontmatter, required), one of:

| `blast-radius` | Meaning | Gate |
|---|---|---|
| `repo-local` | Touches only this repository's working tree | May auto-proceed; decision recorded either way |
| `local-env` | Touches this machine outside the repo | Proceed with a recorded note |
| `shared-env` | Touches infrastructure others depend on (CI secrets, shared DBs, staging) | **Stop for explicit human authorization. No auto-proceed, ever** |
| `external-party` | Involves a third party (vendor email, upstream issue, registrar) | **Stop for explicit human authorization. No auto-proceed, ever** |
| `irreversible` | Cannot be undone by any rollback (data deletion, key revocation broadcast, a sent message) | **Named confirmation echoing exactly what will happen**, plus a `rollback:` line per step or an explicit "no rollback exists" acknowledgement |

- `## Steps`: at most 5. Each has its own outcome check (the observation that will prove it happened), and a `rollback:` line for anything above `repo-local`, or the explicit "no rollback exists" acknowledgement.
- `## Acceptance Criteria`: each names how it will be observed (the concrete read-back), not only what should be true.
- `## Assumptions / Open Questions`, and `## Gate Decision` (written at the gate).

`00-index.md` is a fully conformant `type: index` (the heavy 22-field set of `intake/default.md`) with `workflow-type: task`. `progress:` marks `slice` and `plan` as `skipped`, `review` and `ship` as `skipped` (Step 4 revisits them), and `intake: complete`. The put registers the row ([_intake-context.md](_intake-context.md)).

**[Gate].** Apply the blast-radius table as a gate question per [_gate-question.md](../_gate-question.md) (Proceed / Adjust / Escalate).
- `repo-local` may go on without the pause when it is low-risk, at your discretion: record `auto-proceeded-low-risk` in the brief.
- The bottom three rows always stop. Without a person, the default is to stop: record the missing authorization, and do not go on.
- For `irreversible`, the confirmation echoes exactly what will happen.

# Step 2 — Execute

Do the work, step by step, per the brief. Then write the draft of `05-implement.md` (`type: implement`), and put it, with `## Steps Performed`: what actually happened in each step, deviations included. The brief is the plan; this file is the history. Record a step that failed or was skipped as such: never smooth it over.

# Step 3 — Evidence (`06-verify.md`)

Write the draft of `06-verify.md` (`type: verify`), and put it, with `## Acceptance Criteria Status`: one evidence row per AC, with its `evidence-rung`. Close with `## Caveats`, `## Issues Found` and `## Recommendation`. Write the raw read-back output to `verify-evidence/<slug>/checks.md`. Use the frontmatter keys of the verify template (`verify/_artifact.md`), with `stack-source`, `skipped-gating-specs: []`, the `debt-markers-*` counts, `next-command`, `next-invocation` and `recommended-routes`.

Observe again; never assert. The rungs:
- **`live`**: you read the real system of record again after you acted. For a task, a system of record that is not a runtime counts as live observation: `ls` the directory, `curl` the DNS record, query the API, read the file back (the §7 gloss).
- **`attested`**: a named outside party or a person confirmed the outcome. Record the citation (a vendor email, a signoff comment, a ticket URL). It is the only rung for the coordination class: weaker than `live`, but honest.
- **`asserted`**: you claim success with no independent read-back. Treat it as fiction until proven. It cannot close an AC. Count every user-observable AC at `asserted` (with `cited-mock`/`uncited-mock`/`static`) into `metric-acceptance-mock-rung`. Managed-artifact enforcement ([_host-invocation.md](../_host-invocation.md)) blocks `result: pass` while that count is > 0. "I moved the files" with no `ls` afterward fails the gate.

Set `result: pass` only when every AC closes at `live` or `attested`. Otherwise set `result: partial`, and name the ACs that were not observed. The full ladder and the gate rules belong to the contract: cite [EVIDENCE-SCHEMA-CONTRACT §7](../../../../docs/internal/EVIDENCE-SCHEMA-CONTRACT.md) and `verify.md`, and do not restate them.

# Step 4 — Hand off

1. Update the index with one `record set "<root>" <slug> index` call, with `current-stage=verify`, and close the loop honestly:
   - A task whose ACs all closed sets `status=closed`, `close-reason=completed`, `closed-at=<timestamp>`. A completed task has nothing left to drive, so `/wf intake <slug> close` is not needed.
   - A task with open ACs stays `active`, with `next-invocation` naming the missing observation.
2. **When the task produced a repo diff worth reviewing or merging,** set `review` and `ship` from `skipped` to `not-started` in the same call (`progress.review=not-started progress.ship=not-started`), and recommend an ad-hoc `/wf review <dimension>` or `/wf ship <slug>`. Otherwise they stay `skipped`: marked honestly, not silently absent.
3. Write `10-retro.md` only on request.
4. Return per [_chat-return.md](../_chat-return.md): lead with the narrative (section *The narrative*), then:

```
wf intake task complete: <slug>
Outcome: <one line>
Blast radius: <class> — gate: <authorized-by-user | auto-proceeded-low-risk | recorded-note>
Steps: <N done / M deviated / K failed>
Evidence: <per-AC rungs, e.g. live 3 / attested 1>
Artifacts: <wf-dir>/01-task.md, 05-implement.md, 06-verify.md
Next: Done | <the missing observation> | /wf review <dimension> (diff left on <branch>)
```

# Crash-safe / resume

The artifact trail is the state. Run `/wf intake task <slug>` again: the orientation continues at the first incomplete step. A brief that was not executed gates again. A task that was executed but has no evidence goes straight to Step 3.

# Boundary tripwires (warn-and-continue, never refuse)

- **The deliverable turns out to be a behavior change in product code:** escalate to `/wf intake fix <description>`.
- **The work needs more than one slice:** it is a feature. Escalate to `/wf intake <description>`.
- **The work is a read-only investigation:** route by its shape. A defect hunt with no symptom → `/wf intake audit <concern>`; a yes/no hypothesis → `/wf intake discover`; approaches to a decided problem → `/wf intake investigate`.
- **The request has more than one independent outcome:** `task` is not a todo list. List the outcomes and have the person pick one, or escalate to a feature.

# What this command is NOT

- **Not a todo list.** One task has one outcome.
- **Not a terminal analysis mode.** A task acts, also outside the repository. That is why a task has an authorization gate that no other intake mode has.
