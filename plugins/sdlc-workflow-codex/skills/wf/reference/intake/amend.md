---
description: "Amend mode of intake — edit a workflow's RECORDED CONFIGURATION (branch strategy, branch, base branch, review scope, title, tags) in place, without adding scope or touching built work. Slug-REQUIRED: `$wf intake <existing-slug> amend <what to change>`. Strictly whitelisted: anything outside the amendable field list routes to extension (new scope) or a fix slice (wrong behaviour). Writes only 00-index.md and the registry row."
argument-hint: <existing-slug> amend <what to change>
---

You are running **intake in amend mode** — the narrow path for correcting a workflow's *recorded
configuration* when the config itself was set wrong or has to change mid-flight.

> The External Output Boundary, the narrative-fragment tier, and the workflow-registry/slug
> semantics come from `_intake-context.md`, which the `intake` dispatcher loaded before this
> reference. Do not restate or fork those rules here.

# Why this mode exists

`$wf intake <slug> <free text>` claims all free text for **extension** mode — an existing slug plus
new scope means new slices. That is right for scope, and it was wrong for *config*: a branch-strategy
amendment had no lawful home anywhere in the router, so the model had to **refuse its own routing**
and hand-edit `00-index.md`. A command surface that forces the model to defy it in order to do a
legitimate, three-field, entirely-in-scope edit is a missing verb, not a discipline.

So amend exists — and its whole design is the **whitelist**. Everything that made "there is no amend"
the right rule for years is still true: *already-built work is never re-specified in place.* Amend
does not touch a slice, a plan, an acceptance criterion, or a line of code. It edits the handful of
fields that describe *how this workflow runs*, and it refuses everything else out loud.

# The amendable fields (exhaustive — this list IS the mode)

| Field in `00-index.md` | What amending it means | Guard |
|---|---|---|
| `branch-strategy` | `dedicated` \| `shared` \| `none` | Changing **to** `dedicated` does **not** create or switch a branch — record the intent; the next `implement`/`yolo` lands the tree per its own branch step |
| `branch` | the workflow's branch name | Refuse when a branch by the OLD name already has commits **and** the new name does not exist — that is a git rename, not a config edit (tell the user the `git branch -m` to run, then re-amend) |
| `base-branch` | what the branch merges into | Refuse when a PR is already open against the old base (`pr-url` set) — changing the base of an open PR is a GitHub action, not a record edit |
| `review-scope` | `per-slice` \| `slug-wide` | Refuse when review artifacts **already exist** under the current convention — the file layout differs (`07-review-<slice>.md` vs `07-review.md`) and silently switching orphans them. Say which files would be orphaned |
| `title` | the human-facing workflow title | none |
| `tags` | the workflow's tags | none |

Nothing else. In particular:

- **Acceptance criteria, slice scope, plan decisions, and anything a stage authored** → not amendable.
  New or corrected scope is a **new slice** (`$wf intake <slug> <new scope>`); wrong *behaviour* in
  built code is `$wf intake <slug> fix <defect>`.
- **`status`, `current-stage`, `stage-number`, `progress`, `slices[]`** → not amendable. These are
  *derived* state owned by the stages and drivers that produce them. Editing them by hand is how an
  index starts lying about a workflow. If they are wrong, the artifacts on disk are the truth —
  `$wf status <slug> deep` reconciles.
- **The ship plan** → `.ai/ship-plan.md` is a project-level contract, not a per-slug field.
  `$wf ship-plan edit` owns it.
- **`workflow-type`** → not amendable. The type decides which references drive the slug; changing it
  mid-flight re-interprets artifacts that were authored under different rules. A workflow that turned
  out to be a different kind of work is a new workflow.

# Step 0 — Resolve the amendment

1. The dispatcher consumed `<slug>` and the `amend` keyword. What remains is the user's request in
   free text (`"base should be develop, not main"`, `"switch to slug-wide review"`).
2. Read `.ai/workflows/<slug>/00-index.md`. Map the request onto the whitelist above. Record, for
   each field you intend to change: current value → proposed value.
3. **If the request maps onto nothing in the whitelist**, STOP and route — do not improvise a wider
   edit and do not silently fall through to extension:
   - new/changed scope → *"That is new scope, not config. Run `$wf intake `<slug>` `<the scope>`` — it
     adds net-new slices without touching completed work."*
   - wrong behaviour in built code → *"That is a defect, not config. Run `$wf intake `<slug>` fix
     `<the defect>``."*
   - derived state looks wrong → *"`status`/`progress` are derived from the artifacts. Run
     `$wf status `<slug>` deep` to reconcile them."*
4. **If the request maps onto a field but trips its guard**, STOP with the guard's own remedy (above).
   A guard is a genuine cross-surface consequence, not a formality.
5. **If the request is ambiguous** between two whitelisted fields, ask **once** in chat and wait,
   presenting each reading as a short numbered list with its concrete before → after. Config edits
   are cheap to confirm and annoying to undo.

# Step 1 — Confirm before writing (MANDATORY)

Show the exact diff — one line per field, `field: old → new` — and get a yes. Amend is small enough
that a confirmation costs nothing, and it is the only gate between "fix a typo in the base branch"
and "quietly repoint a workflow at the wrong trunk."

# Step 2 — Write

1. Apply the confirmed changes to `.ai/workflows/<slug>/00-index.md` and refresh `updated-at`.
2. Mirror any changed `branch` into the workflow's row in `.ai/workflows/INDEX.md`, and refresh that
   row's `updated-at`.
3. Follow [_control-file-ownership.md](../_control-file-ownership.md): re-read immediately before
   the edit, and on a modified-since-read rejection re-read, re-derive, retry once. A driver may be
   running on this slug.
4. Record the amendment in the index's `revisions:` ledger per
   [_additive-write.md](../_additive-write.md) with `trigger: manual` and a one-phrase `because` — the
   *why* is the whole value of a config change ("PR target moved to the release train").
5. Write **nothing else**. No stage artifact, no slice file, no new numbered file. Amend produces no
   artifact of its own.

# Step 3 — Chat return

```
wf intake amend complete: <slug>

<Narrative — what config moved and why it mattered, in one short paragraph.>

Amended: <field: old → new, one per line>
Artifacts: .ai/workflows/<slug>/00-index.md (+ INDEX.md row when the branch changed)
Next: <the command the amendment unblocks — usually whatever the workflow was already doing>
```

Framing rules — narrative definition, internal audience, always-emit — are single-sourced in
[_chat-return.md](../_chat-return.md).

# What this mode is NOT

- **Not a scope editor.** Scope goes through extension or a fix slice, always.
- **Not a state editor.** Derived state belongs to the stages that derive it.
- **Not a stage.** It writes no numbered artifact and never advances `current-stage`.
- **Not a way to re-specify built work.** That rule has not moved an inch; amend simply carves out
  the config fields it never covered.
