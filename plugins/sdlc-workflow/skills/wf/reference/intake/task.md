You are running `/wf intake task`, the **minimal lifecycle** for a unit of work with a slug whose deliverable is not a code change verified by executing software. Every other surface assumes that deliverable; `task` exists for the five classes that have nowhere else to go: repo chores with no behavior change, environment/infra operations, non-code deliverables, coordination with external parties, and one-shot throwaway execution. Uniquely on the surface except `ship`, a task may act **outside the repository** — which is why it carries an authorization gate no intake mode has.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `task`: it overrides the standalone steps below.

In slug-mode, the blast-radius class and its gate (Step 1) still apply, and the slice body records both.

# Pipeline
`0·orient` → `1·brief` → `[gate]` → `2·execute` → `3·evidence` → `4·hand off`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). Start from a description, or resume a task slug. |
| Produces | `00-index.md` (`type: index`, `workflow-type: task`), `01-task.md` (`type: intake`, the brief), `05-implement.md` (what actually happened), `06-verify.md` (per-AC evidence with rungs), `10-retro.md` on request |
| Skips | the shape phase, `slice`, `plan` — `slice` and `plan` are marked `skipped` in `progress:` (the brief carries its steps inline; for a task, planning and briefing are one motion). `review`, `ship` — `skipped` unless the task produced a repo diff worth reviewing or merging (Step 4). |
| Next | `Done` for most tasks. A task that left a reviewable diff → ad-hoc `/wf review <dimension>` or `/wf ship <slug>`. |
| Escalate | Deliverable turns out to be a code behavior change → `/wf intake fix`; more than one slice of work → `/wf intake` (tripwires below). |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-task.md` | artifact | on-resume | |
| `05-implement.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-task.md` | writes | | |
| `05-implement.md` | writes | | |
| `06-verify.md` | writes | | |

# Task discipline
- **Re-observe; never assert.** An acceptance criterion closes only on independent observation of the outcome — re-read the system of record after acting (`ls` the directory, `curl` the DNS record, query the API, read the file back). An AC whose only evidence is the agent's own claim of success carries `evidence-rung: asserted` and **cannot close** — managed-artifact enforcement ([_host-invocation.md](../_host-invocation.md)) blocks `result: pass` on the same path that blocks a mock-evidenced code AC. The rung ladder for tasks is a **contract revision (§7)** of [EVIDENCE-SCHEMA-CONTRACT](../../../../docs/internal/EVIDENCE-SCHEMA-CONTRACT.md); `verify.md` places the task rungs on the evidence ladder.
- **The gate is not optional above `local-env`.** A `shared-env`, `external-party`, or `irreversible` task stops for explicit human authorization even when every other signal says proceed. No written policy resolves these unattended — the non-interactive default is STOP with the missing authorization recorded, never proceed (the drivers refuse `task` slugs entirely).
- **`task` is not a todo list.** One task = one outcome. More than one independent outcome → enumerate them and have the user pick one, or escalate to a feature.
- `current-stage` stays inside the standard enum — `implement` while working, `verify` while checking. Never a bespoke label.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve slug and mode:**
   - The slug that intake consumed, or the first token after `task`, has an index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) with `workflow-type: task` → **resume**. Pick up at the first incomplete step.
   - Intake consumed a non-closed slug of another `workflow-type` → **slug-mode** (see above).
   - Otherwise → **new task**. Name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `task-<short-description>`.
2. **Branch decision:** default `branch-strategy: none` — most tasks do not warrant a branch (this inverts the `fix` default deliberately). Create one only when the task will produce a repo diff the user wants isolated; record the decision either way.
3. **Project context (lightweight):** read `README.md` (top 100 lines) and any file the description names.

# Step 1 — Brief (`00-index.md` + `01-task.md`)

Author the brief. Write `01-task.md` and `00-index.md` as drafts `<wf-dir>/.draft/<name>`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. Ask at most **2 questions** in chat; record each answer with `decide add` per [_decisions.md](../_decisions.md), and also write it inline into the artifact.

`01-task.md` (`type: intake`; satisfies the intake required set: `status: complete`, `stage-number: 1`, `created-at`/`updated-at` per [_timestamp.md](../_timestamp.md), `tags`, `refs`, `next-command`, `next-invocation`, `recommended-routes`) carries these fixed `##` headings:

- `## Restated Request` — what outcome this task exists to produce, in one paragraph.
- **`blast-radius`** (frontmatter, mandatory) — one of:

| `blast-radius` | Meaning | Gate |
|---|---|---|
| `repo-local` | Touches only this repository's working tree | May auto-proceed; decision recorded either way |
| `local-env` | Touches this machine outside the repo | Proceed with a recorded note |
| `shared-env` | Touches infrastructure others depend on (CI secrets, shared DBs, staging) | **Stop for explicit human authorization. No auto-proceed, ever** |
| `external-party` | Involves a third party (vendor email, upstream issue, registrar) | **Stop for explicit human authorization. No auto-proceed, ever** |
| `irreversible` | Cannot be undone by any rollback (data deletion, key revocation broadcast, a sent message) | **Named confirmation echoing exactly what will happen**, plus a `rollback:` line per step or an explicit "no rollback exists" acknowledgement |

- `## Steps` — at most 5, each with its **own outcome check** (the observation that will prove it happened) and a `rollback:` line for anything above `repo-local` (or the explicit "no rollback exists" acknowledgement).
- `## Acceptance Criteria` — each naming **how it will be observed** (the concrete read-back), not just what should be true.
- `## Assumptions / Open Questions`, and `## Gate Decision` (written at the gate).

`00-index.md` is a fully-conformant `type: index` (the heavy 22-field set from `intake/default.md`) plus `workflow-type: task`. `progress:` marks `slice`, `plan` as `skipped`; `review`, `ship` as `skipped` (revisited at Step 4); `intake: complete`. Register the row in `.ai/workflows/INDEX.md` per `intake/_intake-context.md`.

**[Gate]** — apply the blast-radius table as a gate question per [_gate-question.md](../_gate-question.md) (Proceed / Adjust / Escalate). `repo-local` may auto-proceed low-risk at your discretion — record `auto-proceeded-low-risk` in the brief. The bottom three rows always stop; their **non-interactive default is STOP** (record the missing authorization; do not proceed). For `irreversible`, the confirmation must echo exactly what will happen.

# Step 2 — Execute

Do the work, step by step, per the brief. Then write the draft of `05-implement.md` (`type: implement`) and put it, with `## Steps Performed`: **what actually happened per step, including deviations** — the brief is the plan; this file is the history. A step that failed or was skipped is recorded as such, never smoothed over.

# Step 3 — Evidence (`06-verify.md`)

Write the draft of `06-verify.md` (`type: verify`) and put it, with `## Acceptance Criteria Status`: per-AC evidence rows carrying `evidence-rung`. Close with `## Caveats`, `## Issues Found`, and `## Recommendation`. Write raw read-back output to `verify-evidence/<slug>/checks.md`. Use the frontmatter keys of the verify template (`verify/_artifact.md`), including `stack-source`, `skipped-gating-specs: []`, the `debt-markers-*` counts, `next-command`, `next-invocation`, and `recommended-routes`. **Re-observe; never assert:**

- **`live`** — you re-read the real system of record after acting. For a task, non-runtime systems of record count as live observation: `ls` the directory, `curl` the DNS record, query the API, read the file back (the §7 gloss).
- **`attested`** — a named external party or human confirmed the outcome; record the citation (vendor email, signoff comment, ticket URL). The only rung available for the coordination class. Weaker than `live`, but honest.
- **`asserted`** — you claim success with **no independent read-back**. Presumptively fictional. **Cannot close an AC**: count every user-observable AC at `asserted` (alongside `cited-mock`/`uncited-mock`/`static`) into `metric-acceptance-mock-rung`, and managed-artifact enforcement ([_host-invocation.md](../_host-invocation.md)) blocks `result: pass` while that count is > 0. "I moved the files" without an `ls` afterward fails the gate.

Set `result: pass` only when every AC closes at `live` or `attested`; otherwise `result: partial` with the un-observed ACs named. The full ladder and gate rules are the contract's — cite [EVIDENCE-SCHEMA-CONTRACT §7](../../../../docs/internal/EVIDENCE-SCHEMA-CONTRACT.md) and `verify.md`; do not restate them.

# Step 4 — Hand off

1. Update the index with one `record set "<root>" <slug> index` call: `current-stage=verify` → close the loop honestly — a task whose ACs all closed sets `status=closed`, `close-reason=completed`, `closed-at=<timestamp>` (a completed task has nothing left to drive; `/wf intake <slug> close` is not required). A task with open ACs stays `active` with `next-invocation` naming the missing observation.
2. **If the task produced a repo diff worth reviewing or merging**, flip `review`/`ship` from `skipped` to `not-started` (`progress.review=not-started progress.ship=not-started`, in the same call) and recommend ad-hoc `/wf review <dimension>` or `/wf ship <slug>`. Otherwise they stay `skipped` — marked honestly, not silently absent.
3. `10-retro.md` on request only.
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

The artifact trail is the state. Re-invoke `/wf intake task <slug>`: orientation picks up at the first incomplete step — an unexecuted brief re-gates; an executed-but-unevidenced task goes straight to Step 3.

# Boundary tripwires (warn-and-continue, never refuse)

- **Deliverable turns out to be a behavior change in product code** → escalate to `/wf intake fix <description>`.
- **Work needs more than one slice** → it is a feature; escalate to `/wf intake <description>`.
- **Work is read-only investigation** → route by shape: defect hunt with no symptom → `/wf intake audit <concern>`; a yes/no hypothesis → `/wf intake discover`; approaches to a decided problem → `/wf intake investigate`.
- **Request contains more than one independent outcome** → `task` is not a todo list. Enumerate the outcomes and have the user pick one, or escalate to a feature.

# What this command is NOT

- **Not a todo list.** One task has one outcome.
- **Not a terminal analysis mode.** A task acts, also outside the repository. That is why a task has an authorization gate that no other intake mode has.
