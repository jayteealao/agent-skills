---
description: Minimal lifecycle for work whose deliverable is not a code change — repo chores, environment/infra operations (rotate a key, set a DNS record), non-code deliverables (an RFC, a license audit), coordination (file an upstream issue, get signoff), and one-shot throwaway execution. Briefs the work with acceptance criteria that each name how the outcome will be OBSERVED, classifies blast radius, gates before acting (shared-env/external-party/irreversible always stop for a human), executes, then re-observes — an outcome the agent asserts but never reads back lands at evidence-rung `asserted` and cannot close an AC. Slug-first: an existing non-closed slug as the first token attaches the task as a compressed slice.
argument-hint: "<description> | <task-slug> (resume) | <existing-slug> <description> (compressed slice)"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `$wf task`, the **minimal lifecycle** for a unit of work with a slug whose deliverable is not a code change verified by executing software. Every other surface assumes that deliverable; `task` exists for the five classes that have nowhere else to go: repo chores with no behavior change, environment/infra operations, non-code deliverables, coordination with external parties, and one-shot throwaway execution. Uniquely on the surface except `ship`, a task may act **outside the repository** — which is why it carries an authorization gate no intake mode has.

# Slug-mode (read before proceeding)

If the first positional token exactly matches an existing non-closed slug in `.ai/workflows/INDEX.md` whose `workflow-type` is NOT `task`, follow [_compressed-slice.md](_compressed-slice.md) — it OVERRIDES the standalone flow below. Write one `.ai/workflows/<slug>/03-slice-task-<descriptor>.md` (`type: slice`, `slice-type: task`, `compressed: true`, `origin: wf/task`); no new workflow, no branch, additive index updates only. Per the contract's inline-records rule, the slice records its per-AC evidence rows (with `evidence-rung`) **inline in a body table** — it writes no `06-verify.md`. The blast-radius classification and the Step-1.5 gate still apply in full — the slice body records both. Chat return: `task → compressed slice <slice-slug> on <slug>`. The idiomatic use: "I'm mid-feature and need to rotate a key first."

If the first token matches an existing slug whose `workflow-type` IS `task`, that is a **resume** of the standalone flow below.

# Pipeline
`0·orient` → `1·brief` → `[gate]` → `2·execute` → `3·evidence` → `4·hand off`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh from a description, or resumes a task slug. |
| Produces | `00-index.md` (`type: index`, `workflow-type: task`), `01-task.md` (`type: intake`, the brief), `05-implement.md` (what actually happened), `06-verify.md` (per-AC evidence with rungs), `10-retro.md` on request |
| Skips | `shape`, `slice`, `plan` — marked `skipped` in `progress:` (the brief carries its steps inline; for a task, planning and briefing are one motion). `review`, `handoff`, `ship` — `skipped` unless the task produced a repo diff worth reviewing or merging (Step 4). |
| Next | `Done` for most tasks. A task that left a reviewable diff → ad-hoc `$wf review <dimension>` or `$wf handoff <slug>`. |
| Escalate | Deliverable turns out to be a code behavior change → `$wf intake fix`; more than one slice of work → `$wf intake` (tripwires below). |

# CRITICAL — task discipline
- **Re-observe; never assert.** An acceptance criterion closes only on independent observation of the outcome — re-read the system of record after acting (`ls` the directory, `curl` the DNS record, query the API, read the file back). An AC whose only evidence is the agent's own claim of success carries `evidence-rung: asserted` and **cannot close** — the post-write verifier blocks `result: pass` on the same path that blocks a mock-evidenced code AC. `verify.md` places the two task rungs (`attested`, `asserted`) on the existing ladder; cite it, do not restate it.
- **The gate is not optional above `local-env`.** A `shared-env`, `external-party`, or `irreversible` task stops for explicit human authorization even when every other signal says proceed. The non-interactive default for those classes is STOP with the missing authorization recorded — never proceed (the auto driver refuses `task` slugs entirely).
- **`task` is not a todo list.** One task = one outcome. More than one independent outcome → enumerate them and have the user pick one, or escalate to a feature.
- `current-stage` stays inside the standard enum — `implement` while working, `verify` while checking. Never a bespoke label.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode:**
   - First token matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: task` → **resume**. Read the index; pick up at the first incomplete step.
   - First token matches an existing non-closed slug of another `workflow-type` → **slug-mode** (see above).
   - Otherwise → **new task**. Derive a slug: `task-<short-description>` (kebab-case, max 5 words, e.g. `task-rotate-stripe-key`). Collision → WARN and stop, as the intake modes do.
2. **Branch decision:** default `branch-strategy: none` — most tasks do not warrant a branch (this inverts the `fix` default deliberately). Create one only when the task will produce a repo diff the user wants isolated; record the decision either way.
3. **Project context (lightweight):** read `README.md` (top 100 lines) and any file the description names.

# Step 1 — Brief (`00-index.md` + `01-task.md`)

Author the brief. Ask at most **2 questions** in chat; answers go inline into the artifact (no `po-answers.md`).

`01-task.md` (`type: intake`; satisfies the intake required set: `status: complete`, `stage-number: 1`, `created-at`/`updated-at` per [_timestamp.md](_timestamp.md), `tags`, `refs`, `next-command`, `next-invocation`) carries:

- **Restated request** — what outcome this task exists to produce, in one paragraph.
- **`blast-radius`** (frontmatter, MANDATORY) — one of:

| `blast-radius` | Meaning | Gate |
|---|---|---|
| `repo-local` | Touches only this repository's working tree | May auto-proceed; decision recorded either way |
| `local-env` | Touches this machine outside the repo | Proceed with a recorded note |
| `shared-env` | Touches infrastructure others depend on (CI secrets, shared DBs, staging) | **Stop for explicit human authorization. No auto-proceed, ever** |
| `external-party` | Involves a third party (vendor email, upstream issue, registrar) | **Stop for explicit human authorization. No auto-proceed, ever** |
| `irreversible` | Cannot be undone by any rollback (data deletion, key revocation broadcast, a sent message) | **Named confirmation echoing exactly what will happen**, plus a `rollback:` line per step or an explicit "no rollback exists" acknowledgement |

- **Steps** — at most 5, each with its **own outcome check** (the observation that will prove it happened).
- **Acceptance criteria** — each naming **how it will be observed** (the concrete read-back), not just what should be true.
- **`rollback:`** line per step for anything above `repo-local` (or the explicit "no rollback exists" acknowledgement).
- **Assumptions and open questions.**
- Story section `## The Task` — first, per [_story-arc.md](_story-arc.md); language per [_ste-procedural.md](_ste-procedural.md) sections 1 and 3.

`00-index.md` is a fully-conformant `type: index` (the heavy 22-field set from `intake/default.md`) plus `workflow-type: task`. `progress:` marks `shape`, `slice`, `plan` as `skipped`; `review`, `handoff`, `ship` as `skipped` (revisited at Step 4); `intake: complete`. Register the row in `.ai/workflows/INDEX.md` per `intake/_intake-context.md`.

**[Gate]** — apply the blast-radius table through the gate-question ladder ([_gate-question.md](_gate-question.md)) with options Proceed / Adjust / Escalate. `repo-local` may auto-proceed low-risk at your discretion — record `auto-proceeded-low-risk` in the brief. The bottom three rows always stop; their **non-interactive default is STOP** (record the missing authorization; do not proceed). For `irreversible`, the confirmation must echo exactly what will happen, verbatim.

> **Auto second opinion (objective triggers).** At the gate, **auto-invoke** `$consult codex <critique this task brief: steps, rollback, blast radius>` (pinning `codex` keeps it free) when ANY of:
> - `blast-radius` is `shared-env`, `external-party`, or `irreversible`;
> - the task touches credentials, billing, or production data;
> - no rollback exists for any step.
> Surface material critique to the user WITH the gate question — the point is a second set of eyes before anything acts outside the repo. The user may invoke it with any provider.

# Step 2 — Execute

Do the work, step by step, per the brief. Then write `05-implement.md` (`type: implement`) recording **what actually happened per step, including deviations** — the brief is the plan; this file is the history. A step that failed or was skipped is recorded as such, never smoothed over.

# Step 3 — Evidence (`06-verify.md`)

Write `06-verify.md` (`type: verify`) with per-AC evidence rows carrying `evidence-rung`. **Re-observe; never assert:**

- **`live`** — you re-read the real system of record after acting. For a task, non-runtime systems of record count as live observation: `ls` the directory, `curl` the DNS record, query the API, read the file back.
- **`attested`** — a named external party or human confirmed the outcome; record the citation (vendor email, signoff comment, ticket URL). The only rung available for the coordination class. Weaker than `live`, but honest.
- **`asserted`** — you claim success with **no independent read-back**. Presumptively fictional. **Cannot close an AC**: count every user-observable AC at `asserted` (alongside `cited-mock`/`uncited-mock`/`static`) into `metric-acceptance-mock-rung`, and the post-write verifier blocks `result: pass` while that count is > 0. "I moved the files" without an `ls` afterward fails the gate.

Set `result: pass` only when every AC closes at `live` or `attested`; otherwise `result: partial` with the un-observed ACs named. The full ladder and gate rules live in `verify.md`; do not restate them.

# Step 4 — Hand off

1. Update `00-index.md`: `current-stage: verify` → close the loop honestly — a task whose ACs all closed sets `status: closed`, `close-reason: completed`, `closed-at` (a completed task has nothing left to drive; `$wf close <slug>` is not required). A task with open ACs stays `active` with `next-invocation` naming the missing observation.
2. **If the task produced a repo diff worth reviewing or merging**, flip `review`/`handoff` from `skipped` to `not-started` and recommend ad-hoc `$wf review <dimension>` or `$wf handoff <slug>`. Otherwise they stay `skipped` — marked honestly, not silently absent.
3. `10-retro.md` on request only.
4. Return per [_chat-return.md](_chat-return.md) — narrative lead, then:

```
wf task complete: <slug>
Outcome: <one line>
Blast radius: <class> — gate: <authorized-by-user | auto-proceeded-low-risk | recorded-note>
Steps: <N done / M deviated / K failed>
Evidence: <per-AC rungs, e.g. live 3 / attested 1>
Artifacts: .ai/workflows/<slug>/01-task.md, 05-implement.md, 06-verify.md
Next: Done | <the missing observation> | $wf review <dimension> (diff left on <branch>)
```

## Step — Write free narrative fragments
Any artifact may ship free narrative fragments (`<stem>.<NN-label>.html.fragment`) per [_fragment-authoring.md](_fragment-authoring.md) Step F2 — a before/after, a rollback map, a coordination timeline.

# Crash-safe / resume

The artifact trail is the state. Re-invoke `$wf task <slug>`: orientation reads `00-index.md` and picks up at the first incomplete step — an unexecuted brief re-gates; an executed-but-unevidenced task goes straight to Step 3.

# Boundary tripwires (warn-and-continue, never refuse)

- **Deliverable turns out to be a behavior change in product code** → escalate to `$wf intake fix <description>`.
- **Work needs more than one slice** → it is a feature; escalate to `$wf intake <description>`.
- **Work is read-only investigation** → route by shape: defect hunt with no symptom → `$wf intake audit <concern>`; a yes/no hypothesis → `$wf intake discover`; approaches to a decided problem → `$wf intake investigate`.
- **Request contains more than one independent outcome** → `task` is not a todo list. Enumerate the outcomes and have the user pick one, or escalate to a feature.

# What this command is NOT

- **Not a stage** — it is the fourth roster category, a *minimal lifecycle*: it self-authors `05-implement.md`/`06-verify.md` the way `update-deps` does, rather than routing into the standard execution chain.
- **Not a router** — `ship-plan`/`docs`/`observability` are project-level contracts with sub-keys; a task is a unit of work with a slug.
- **Not an intake mode** — every terminal intake mode observes; a task **acts**, including outside the repository, and that external reach is what requires the authorization gate no intake mode carries.
- **Not `ship`** — `ship` releases built software through a ship-plan with Go/No-Go gates; `task` performs a bounded operation with its own scaled gate.
- **Not a todo list** — one task, one outcome.
