---
description: End a workflow, or terminate a single slice, without completing the full lifecycle. `$wf close <slug> [reason]` archives the whole workflow (status closed, writes 99-close.md). `$wf close <slug> <slice>` closes/skips just that slice — marks it terminated so downstream prerequisites are satisfied, and writes a slice skip record. Never deletes artifacts; never edits application code.
argument-hint: "<slug> [<slice> | cancelled|superseded|deferred|completed-externally|merged-into]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.codex/...`, `.ai/dep-updates/...`), stage names or numbers, skill names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `$wf close`, the **lifecycle-termination utility** for the SDLC lifecycle. It has two
scopes, resolved by whether the second token names a slice:
- **Workflow close** — `$wf close <slug> [reason]` archives the entire workflow.
- **Slice close/skip** — `$wf close <slug> <slice>` terminates one slice so downstream prerequisites
  are satisfied (this absorbs the former `$wf-meta skip`, now scoped to a *slice*, not a pipeline stage).

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

# CRITICAL — scope discipline
- Do NOT delete any workflow files. Do NOT run any stage. Do NOT edit application code.
- Branch cleanup is OPTIONAL and requires explicit user confirmation — never delete a branch silently.
- Do NOT close a PR automatically — surface the PR URL and tell the user to close it manually.
- Follow the steps below exactly in order.

# Step 0 — Resolve scope (MANDATORY)

1. **Parse `$ARGUMENTS`:** first token is the **slug**; the optional second token is either a
   **slice-slug** or a **close reason**.
2. **Validate the slug:** if `.ai/workflows/<slug>/00-index.md` does not exist → STOP: "No workflow
   `<slug>` found."
3. **Resolve the second token** (resolution mirrors `$wf recap`; slice match is checked FIRST so a
   slice literally named like a reason still resolves to the slice):
   - **Exact slice match** — `.ai/workflows/<slug>/03-slice-<token>.md` exists, OR `<token>` is a
     `slug` in `03-slice.md`'s roster → **slice close/skip** (go to the *Slice close* section).
   - **A close reason** — `<token>` ∈ `{cancelled, superseded, deferred, completed-externally,
     merged-into}` (and no slice matched) → **workflow close** with that reason.
   - **Nothing / neither** — **workflow close**; the reason is collected in Step 1.

---

# Workflow close (`$wf close <slug> [reason]`)

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
- Read `00-index.md` in full: `title`, `slug`, `status`, `current-stage`, `stage-number`, `progress`,
  `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `open-questions`, `workflow-type`.
- If `status: closed` already → WARN: "Workflow `<slug>` is already closed (closed-at: `<closed-at>`).
  Running again overwrites the close record. Proceed? (yes to continue)"

## Step W1 — Collect reason and note
If no reason was given, ask directly in chat (present the five options above as a short numbered list). If `superseded`/`merged-into`, also ask
"What superseded/absorbed it? (PR URL, workflow slug, or description)". Do NOT write until you have a reason.

## Step W2 — Branch and PR state check
- `git branch --show-current`. If `branch-strategy: dedicated` and `branch` non-empty: note whether the
  branch still exists (`git branch --list <branch>`) and whether it has unmerged commits
  (`git log <base-branch>..<branch> --oneline`).
- If `pr-url` non-empty, note the URL — the user closes it manually.
These checks are **informational** — surface them, do not act automatically.

## Step W3 — Write `99-close.md`

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
closed-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"`>
---
```

Body sections: **1. Closure summary** (≤5 sentences for a future reader), **2. Work completed** (one
bullet per completed/skipped stage), **3. Work not completed** (last known state of each incomplete
stage), **4. Reason & context** (expanded; name what superseded/absorbed it; revival triggers if
deferred), **5. Branch & PR status** (a resource/state/action table), **6. Revival instructions** (only
if `deferred`/`superseded`: *"To resume, restore `status: in-progress` in `00-index.md` and run
`$wf status <slug>` for the next command, or `$wf intake <slug> <scope>` to extend; all prior artifacts
are intact at `.ai/workflows/<slug>/`"*; otherwise "Not applicable — closed permanently").

### Step — Write free narrative fragments
Beyond the structured page, this artifact may ship free **narrative fragments**:
`<stem>.<NN-label>.html.fragment` siblings of raw HTML (a timeline, a before/after, a decision map) —
no contract, no sibling `.yaml`, ordered by an `NN-` prefix, injected raw-inline below the page. See
[_fragment-authoring.md](_fragment-authoring.md) Step F2 and `../../../references/narrative-fragments.md`.

## Step W4 — Update `00-index.md`
Update `status: closed`, `close-reason`, `superseded-by`, `closed-at`, `next-command: none`,
`next-invocation: none`, `updated-at`. Do NOT change `current-stage` — it reflects the last stage reached.

## Step W5 — Hand off
Lead with a short **narrative** paragraph (the closure story), then a compact receipt (reason, last
stage, stages completed, `99-close.md` path, "artifacts preserved"). Then a manual-actions checklist:
close PR at `<pr-url>` (if open), delete branch `git branch -d <branch>` (if unneeded), cherry-pick
`<N>` unmerged commits (if any). If `deferred`: *"To resume: `$wf status <slug>` or `$wf intake <slug>
<scope>`."* If `completed-externally`: *"Work was completed outside the workflow. No further action."*

---

# Slice close / skip (`$wf close <slug> <slice>`)

Terminates a single slice without building it, so downstream prerequisites (handoff aggregation, slice
ordering) treat it as resolved rather than pending. This is the successor to the former stage-`skip`,
rescoped to the **slice** — the unit that actually matters (see *What this is NOT*).

## Step S0 — Orient
1. Read `00-index.md` (`current-stage`, `progress`, `branch-strategy`, `branch`, `selected-slice-or-focus`)
   and `03-slice.md` (the roster). Locate the slice `<slice>` in the roster and read its
   `03-slice-<slice>.md` file if present.
2. If the slice is already `status: complete` → WARN: "Slice `<slice>` is already complete — closing it
   discards nothing built, but marks it terminated. Proceed? (yes)". If already `skipped`/`closed` →
   WARN it will overwrite the skip record.

## Step S1 — Collect reason
If no reason followed the slice token, ask in chat (one question): *"Why is slice `<slice>` being closed/skipped?
(e.g. 'descoped', 'covered by another slice', 'not needed for this release', 'done externally')"*.
Do NOT write until you have a reason.

## Step S2 — Write the slice skip record `skip-slice-<slice>.md`

```yaml
---
schema: sdlc/v1
type: skip-record
slug: <slug>
skipped-stage: "slice:<slice>"
skipped-stage-artifact: 03-slice-<slice>.md
reason: <reason from Step S1>
skipped-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"`>
high-risk: <true if the slice was in-progress with real work, else false>
---
```

Body: `# Slice skipped: <slice>` — **Reason**, **What was bypassed** (what this slice would have built),
**Downstream impact** (what depends on it and how prerequisites are now satisfied), **Stub state**
(whether a slice stub was written).

## Step S3 — Mark the slice terminated (so downstream prereqs pass)
1. In `03-slice.md`'s `slices:` roster, set the entry for `<slice>` to `status: skipped` and add
   `skip-record: skip-slice-<slice>.md`. Do NOT touch other slices' entries; do NOT renumber.
2. If `03-slice-<slice>.md` exists → set its frontmatter `status: skipped`, add `skipped: true` and
   `skip-record: skip-slice-<slice>.md`; leave its body intact. If it does **not** exist → write a
   minimal stub `03-slice-<slice>.md` (`type: slice`, `status: skipped`, `skipped: true`,
   `skip-record: skip-slice-<slice>.md`) whose body says the slice was skipped before definition, so
   downstream commands find the file and do not error on a missing prerequisite.
3. Recompute any author-written slice **count** in `03-slice.md`'s body only if it stated an
   *active/remaining* total; the roster-derived figures (header, figure, metric row) recompute
   themselves. This is clerical, not a roster change.

### Step — Write free narrative fragments
The skip record may ship free narrative fragments — same contract as above.

## Step S4 — Update `00-index.md`
Update `updated-at`; add `skip-slice-<slice>.md` (and any stub) to `workflow-files`. If `<slice>` was
the `selected-slice-or-focus`, advance it to the next unresolved slice. Do NOT change `status` or
`current-stage` — the workflow continues; only this slice is done.

## Step S5 — Hand off
Lead with a short narrative (what the slice was, why it's closed, what now proceeds without it), then a
receipt: skipped slice, reason, skip-record path, next command (`$wf plan <slug> <next-slice>` or
`$wf handoff <slug>` if this was the last open slice). If the slice had real in-progress work, prefix
⚠ noting the discarded state.

---

# What this command is NOT
- **Not a delete** — `close` archives in place; all artifacts remain under `.ai/workflows/<slug>/`. To
  truly remove them, delete the directory manually after closing.
- **Not a stage-skip** — the old `skip <slug> <stage>` bypassed a *pipeline stage*; that is retired.
  Slices are the unit of skippable work now. If you don't want a stage's gate on a slice, either run the
  stage or close the slice. To end the whole workflow before a stage, use workflow close.
- **Not a retro** — `$wf retro` extracts lessons after a successful ship; `close` is early/unplanned
  termination. Run `$wf retro <slug>` separately first if you want a retro on a cancelled effort.
- **Not automatic** — it does not close PRs, delete branches, or notify teammates. Those are explicit
  human actions, surfaced as a checklist.
