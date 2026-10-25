---
description: End a workflow, or terminate a single slice, without completing the full lifecycle. `/wf intake <slug> close [reason]` archives the whole workflow (status closed, writes 99-close.md). `/wf intake <slug> close <slice>` closes/skips just that slice — marks it terminated so downstream prerequisites are satisfied, and writes a slice skip record. Never deletes artifacts; never edits application code.
argument-hint: "<slug> [<slice> | cancelled|superseded|deferred|completed-externally|merged-into]"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steer.** Only when the decision store holds a live `steer` entry (`decide list --kind steer`, per [_decisions.md](../_decisions.md)): apply it. Honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf intake <slug> close`, the **lifecycle-termination utility** for the SDLC lifecycle. It has two
scopes, resolved by whether the second token names a slice:
- **Workflow close** — `/wf intake <slug> close [reason]` archives the entire workflow.
- **Slice close/skip** — `/wf intake <slug> close <slice>` terminates one slice so downstream prerequisites
  are satisfied.

# Pipeline
1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·ship → 9·retro

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `decisions.yaml` | artifact | if-present | |
| `03-slice.md` | artifact | mode:slice | |
| `03-slice-<slice>.md` | artifact | mode:slice | |
| `99-close.md` | writes | | |
| `skip-slice-<slice>.md` | writes | | |

# Scope discipline
- Do not delete any workflow files. Do not run any stage. Do not edit application code.
- Branch cleanup is OPTIONAL and requires explicit user confirmation — never delete a branch silently.
- Do not close a PR automatically — surface the PR URL and tell the user to close it manually.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Resolve scope

1. **Read the slug and the rest:** `intake.md` branch 0 consumed the **slug** and the word `close`.
   The optional first token of the rest is either a **slice-slug** or a **close reason**.
2. **Validate the slug:** if the index of `<slug>` does not exist (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index` exits 1, per [_records.md](../_records.md)) → STOP: "No workflow
   `<slug>` found." A `prototype` row of `INDEX.md` is the exception: its folder is in its POC
   worktree, which `prototype.mjs status` names. Run `prototype.mjs exit <slug> close` first, then
   close the workflow in that worktree.
3. **Resolve that token** (resolution mirrors `/wf status recap`; slice match is checked FIRST so a
   slice literally named like a reason still resolves to the slice):
   - **Exact slice match** — the `03-slice-<token>.md` record exists (`record get` exits 0), OR `<token>` is a
     `slug` in `03-slice.md`'s roster → **slice close/skip** (go to the *Slice close* section).
   - **A close reason** — `<token>` ∈ `{cancelled, superseded, deferred, completed-externally,
     merged-into}` (and no slice matched) → **workflow close** with that reason.
   - **Nothing / neither** — **workflow close**; the reason is collected in Step 1.

---

# Workflow close (`/wf intake <slug> close [reason]`)

Marks the workflow closed at whatever stage it reached. Writes `99-close.md` (the closure record) and
updates `00-index.md` (`status: closed`, `close-reason`, `closed-at`). Does NOT delete artifacts —
files remain for audit or revival.

## Close reasons

| Reason | When to use |
|--------|-------------|
| `cancelled` | Work is no longer wanted. Decision to not build / not fix. |
| `superseded` | Another approach, PR, or workflow replaced this one. |
| `deferred` | Work is valid but not now. May be reopened later. |
| `completed-externally` | The change was made outside this workflow (hotfix, manual edit, another PR). |
| `merged-into` | This workflow's scope was absorbed into a larger workflow or PR. |

## Step W0 — Orient
- Parse the index (`record get "<root>" <slug> index`): `title`, `slug`, `status`, `current-stage`, `stage-number`, `progress`,
  `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `open-questions`, `workflow-type`.
- If `status: closed` already → WARN: "Workflow `<slug>` is already closed (closed-at: `<closed-at>`).
  Running again overwrites the close record. Proceed? (yes to continue)"

## Step W1 — Collect reason and note
If no reason was given, ask (present the five options above). If `superseded`/`merged-into`, also ask
"What superseded/absorbed it? (PR URL, workflow slug, or description)". Do not write until you have a reason.

## Step W2 — Branch and PR state check
- `git branch --show-current`. If `branch-strategy: dedicated` and `branch` non-empty: note whether the
  branch still exists (`git branch --list <branch>`) and whether it has unmerged commits
  (`git log <base-branch>..<branch> --oneline`).
- If `pr-url` non-empty, note the URL — the user closes it manually.
These checks are **informational** — surface them, do not act automatically.

## Step W3 — Write `99-close.md`

Write the draft `.ai/workflows/<slug>/.draft/99-close.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

```yaml
---
schema: sdlc/v1
type: close-record
slug: <slug>
workflow-type: <from 00-index.md>
close-reason: <cancelled|superseded|deferred|completed-externally|merged-into>
superseded-by: <PR URL, slug, or description if superseded/merged-into, else "n/a">
last-stage-reached: <current-stage>
stages-completed: [<from progress>]
stages-incomplete: [<remaining stages never reached>]
had-open-branch: <true|false>
branch: <branch or "none">
had-open-pr: <true|false>
pr-url: <url or "none">
unmerged-commits: <N or 0>
closed-at: <real UTC timestamp per _timestamp.md>
next-command: none
next-invocation: "none — workflow closed"
recommended-routes: [{invocation: "/wf status <slug>", reason: "the revival route when deferred or superseded", default: true}]
---
```

Body sections, as fixed `##` headings: `## Work Completed` (one
bullet per completed/skipped stage), `## Work Not Completed` (last known state of each incomplete
stage), `## Reason & Context` (expanded; name what superseded/absorbed it; revival triggers if
deferred), `## Branch & PR Status` (a resource/state/action table), `## Revival Instructions` (only
if `deferred`/`superseded`: *"To resume, run `wf.mjs record set "<root>" <slug> index status=in-progress` and run
`/wf status <slug>` for the next command, or `/wf intake <slug> <scope>` to extend; all prior artifacts
are intact at `.ai/workflows/<slug>/`"*; otherwise "Not applicable — closed permanently").

## Step W4 — Update `00-index.md`
Run one `record set "<root>" <slug> index` call: `status=closed`, `close-reason=<reason>`, `superseded-by=<value>`,
`closed-at=<timestamp>`, `next-command=none`, `next-invocation=none`, and
`"workflow-files=[<current entries>, 99-close.md]"`. `updated-at` moves by itself. Do not change `current-stage` — it reflects the last stage reached.

## Step W5 — Hand off
Lead with the narrative per [_chat-return.md](../_chat-return.md) (section *The narrative*), then a compact receipt (reason, last
stage, stages completed, `99-close.md` path, "artifacts preserved"). Then a manual-actions checklist:
close PR at `<pr-url>` (if open), delete branch `git branch -d <branch>` (if unneeded), cherry-pick
`<N>` unmerged commits (if any). If `deferred`: *"To resume: `/wf status <slug>` or `/wf intake <slug>
<scope>`."* If `completed-externally`: *"Work was completed outside the workflow. No further action."*

---

# Slice close / skip (`/wf intake <slug> close <slice>`)

Terminates a single slice without building it, so downstream prerequisites (handoff aggregation, slice
ordering) treat it as resolved rather than pending. The **slice** is the unit that actually
matters (see *What this is NOT*).

## Step S0 — Orient
1. Parse the index (`record get "<root>" <slug> index`: `current-stage`, `progress`, `branch-strategy`, `branch`, `selected-slice`)
   and the `03-slice.md` roster (`record get "<root>" <slug> 03-slice.md`). Locate the slice `<slice>` in the roster.
2. If the slice is already `status: complete` → WARN: "Slice `<slice>` is already complete — closing it
   discards nothing built, but marks it terminated. Proceed? (yes)". If already `skipped`/`closed` →
   WARN it will overwrite the skip record.

## Step S1 — Collect reason
If no reason followed the slice token, ask (one question): *"Why is slice `<slice>` being closed/skipped?
(e.g. 'descoped', 'covered by another slice', 'not needed for this release', 'done externally')"*.
Do not write until you have a reason.

## Step S2 — Write the slice skip record `skip-slice-<slice>.md`

```yaml
---
schema: sdlc/v1
type: skip-record
slug: <slug>
skipped-stage: "slice:<slice>"
skipped-stage-artifact: 03-slice-<slice>.md
reason: <reason from Step S1>
skipped-at: <real UTC timestamp per _timestamp.md>
high-risk: <true if the slice was in-progress with real work, else false>
---
```

Body: `# Slice skipped: <slice>` — **Reason**, **What was bypassed** (what this slice would have built),
**Downstream impact** (what depends on it and how prerequisites are now satisfied), **Stub state**
(whether a slice stub was written).

## Step S3 — Mark the slice terminated (so downstream prereqs pass)
1. Get `03-slice.md`. In its `slices:` roster, set the entry for `<slice>` to `status: skipped` and add
   `skip-record: skip-slice-<slice>.md`. Do not touch other slices' entries; do NOT renumber.
2. If the `03-slice-<slice>.md` record exists → set its frontmatter with
   `record set "<root>" <slug> 03-slice-<slice>.md status=skipped skipped=true skip-record=skip-slice-<slice>.md`;
   leave its body intact. If it does **not** exist → write the draft of a
   minimal stub `03-slice-<slice>.md` and put it (`type: slice`, `status: skipped`, `skipped: true`,
   `skip-record: skip-slice-<slice>.md`) whose body says the slice was skipped before definition, so
   downstream commands find the file and do not error on a missing prerequisite.
3. Recompute any author-written slice **count** in `03-slice.md`'s body only if it stated an
   *active/remaining* total; the roster-derived figures (header, figure, metric row) recompute
   themselves. This is clerical, not a roster change.
4. Write the draft of `03-slice.md` with the changes of items 1 and 3, and put it.

## Step S4 — Update `00-index.md`
Run one `record set "<root>" <slug> index` call: add `skip-slice-<slice>.md` (and any stub) to `workflow-files`
(`"workflow-files=[<current entries>, skip-slice-<slice>.md]"`). If `<slice>` was
the `selected-slice`, advance it to the next unresolved slice in the same call (`selected-slice=<next>`). Do not change `status` or
`current-stage` — the workflow continues; only this slice is done.

## Step S5 — Hand off
Lead with a short narrative (what the slice was, why it's closed, what now proceeds without it), then a
receipt: skipped slice, reason, skip-record path, next command (`/wf plan <slug> <next-slice>` or
`/wf ship <slug>` if this was the last open slice). If the slice had real in-progress work, prefix
⚠ noting the discarded state.

---

# What this command is NOT
- **Not a delete** — `close` archives in place; all artifacts remain under `.ai/workflows/<slug>/`. To
  truly remove them, delete the directory manually after closing.
- **Not a stage-skip** — `close` never bypasses a pipeline stage. A slice is the unit of skippable
  work. If you do not want a stage's gate on a slice, either run the stage or close the slice. To end
  the whole workflow before a stage, use workflow close.
- **Not a retro** — `/wf retro` extracts lessons after a successful ship; `close` is early/unplanned
  termination. Run `/wf retro <slug>` separately first if you want a retro on a cancelled effort.
- **Not automatic** — it does not close PRs, delete branches, or notify teammates. Those are explicit
  human actions, surfaced as a checklist.
