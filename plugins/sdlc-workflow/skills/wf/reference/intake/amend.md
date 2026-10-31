# Output boundary & shared context
The External Output Boundary and the workflow-registry/slug
semantics come from `_intake-context.md`, which the `intake` dispatcher loaded before this
reference — apply them; do not restate or fork those rules here.

You are running **intake in amend mode** — the narrow path for correcting a workflow's *recorded
configuration* when the config itself was set wrong or has to change mid-flight.

# Why this mode exists

`/wf intake <slug> <free text>` sends new scope to **extension** mode. Amend handles config: its whole
design is the **whitelist**. *Already-built work is never re-specified in place.* Amend
does not touch a slice, a plan, an acceptance criterion, or a line of code. It edits the handful of
fields that describe *how this workflow runs*, and it refuses everything else out loud.

# The amendable fields (exhaustive — this list IS the mode)

| Field in `00-index.md` | What amending it means | Guard |
|---|---|---|
| `branch-strategy` | `dedicated` \| `shared` \| `none` | Changing **to** `dedicated` does **not** create or switch a branch — record the intent; the next `implement`/`yolo` lands the tree per its own branch step |
| `branch` | the workflow's branch name | Refuse when a branch by the OLD name already has commits **and** the new name does not exist — that is a git rename, not a config edit (tell the user the `git branch -m` to run, then re-amend) |
| `base-branch` | what the branch merges into | Refuse when a PR is already open against the old base (`pr-url` set) — changing the base of an open PR is a GitHub action, not a record edit |
| `review-scope` | `per-slice` \| `slug-wide` | Refuse when review artifacts **already exist** under the current convention — the file layout differs (`07-review-<slice>.md` vs `07-review.md`) and silently switching orphans them. Say which files would be orphaned. Amending this field ALSO sets `review-scope-confirmed: true` — the PO just decided it, and leaving the flag `false` lets the next slice/plan ask silently overwrite the amendment |
| `title` | the human-facing workflow title | none |
| `tags` | the workflow's tags | none |

Nothing else. In particular:

- **Acceptance criteria, slice scope, plan decisions, and anything a stage authored** → not amendable.
  New or corrected scope is a **new slice** (`/wf intake <slug> <new scope>`); wrong *behaviour* in
  built code is `/wf intake <slug> fix <defect>`.
- **`status`, `current-stage`, `stage-number`, `progress`, `slices[]`** → not amendable. These are
  *derived* state owned by the stages and drivers that produce them. Editing them by hand is how an
  index starts lying about a workflow. If they are wrong, the artifacts on disk are the truth —
  `/wf status <slug> deep` reconciles.
- **The ship plan** → `.ai/ship-plan.md` is a project-level contract, not a per-slug field.
  `/wf project ship-plan edit` owns it.
- **`workflow-type`** → not amendable. The type decides which references drive the slug; changing it
  mid-flight re-interprets artifacts that were authored under different rules. A workflow that turned
  out to be a different kind of work is a new workflow.

# Step 0 — Resolve the amendment

1. The dispatcher consumed `<slug>` and the `amend` keyword. What remains is the user's request in
   free text (`"base should be develop, not main"`, `"switch to slug-wide review"`). A trailing
   `dry-run` token (same grammar as modernize) means: resolve and present the Step 1 diff, then
   STOP without writing.
2. Read the index with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index` (per [_records.md](../_records.md)). If `status: closed`, WARN and confirm before
   proceeding: *"`<slug>` is closed (close-reason: `<reason>`). Amend its recorded config anyway?"*
   — amending a closed record is legitimate (fixing history's metadata) but never silent. Map the
   request onto the whitelist above. Record, for each field you intend to change: current value →
   proposed value.
3. **If the request maps onto nothing in the whitelist**, STOP and route — do not improvise a wider
   edit and do not silently fall through to extension:
   - new/changed scope → *"That is new scope, not config. Run `/wf intake `<slug>` `<the scope>`` — it
     adds net-new slices without touching completed work."*
   - wrong behaviour in built code → *"That is a defect, not config. Run `/wf intake `<slug>` fix
     `<the defect>``."*
   - derived state looks wrong → *"`status`/`progress` are derived from the artifacts. Run
     `/wf status `<slug>` deep` to reconcile them."*
4. **If the request maps onto a field but trips its guard**, STOP with the guard's own remedy (above).
   A guard is a genuine cross-surface consequence, not a formality.
5. **If the request is ambiguous** between two whitelisted fields, ask **once** as a gate question per [_gate-question.md](../_gate-question.md)
   with the concrete before → after for each reading. Config edits are cheap to confirm and annoying
   to undo.

# Step 1 — Confirm before writing

Show the exact diff — one line per field, `field: old → new` — and get a yes. Amend is small enough
that a confirmation costs nothing, and it is the only gate between "fix a typo in the base branch"
and "quietly repoint a workflow at the wrong trunk."

# Step 2 — Write

1. Apply the confirmed changes to the index: get it, change the fields, refresh `updated-at`, write the draft `<wf-dir>/.draft/00-index.md` and put it with `record put "<root>" <slug>`. The changes of items 3 and 4 go into the same draft. The put refreshes the row of the workflow in `INDEX.md`.
2. Follow [_control-file-ownership.md](../_control-file-ownership.md): get the index immediately before
   you write the draft, and put the draft at once. A driver may be
   running on this slug.
3. Record the amendment in the index's `revisions:` ledger with `trigger: manual` and a one-phrase
   `because` — the *why* is the whole value of a config change ("PR target moved to the release
   train"). The entry shape is the `revisions:` shape from [_additive-write.md](../_additive-write.md)
   (that contract's *scope* covers stage artifacts; the index borrows only the entry shape, which
   the index schema declares and the overview renders as the revision-ledger strip).
4. If the amended field was `review-scope`, also set `review-scope-confirmed: true` (see the
   whitelist guard).
5. Write **nothing else**. No stage artifact, no slice file, no new numbered file. Amend produces no
   artifact of its own.

# Step 3 — Chat return

```
wf intake amend complete: <slug>

<Narrative — what config moved and why it mattered, in one short paragraph.>

Amended: <field: old → new, one per line>
Artifacts: <wf-dir>/00-index.md
Next: <the command the amendment unblocks — usually whatever the workflow was already doing>
```

Framing rules — narrative definition, internal audience, always-emit — are single-sourced in
[_chat-return.md](../_chat-return.md).

# What this mode is NOT

- **Not a scope editor or a state editor.** Scope goes through extension or a fix slice. Derived state belongs to the stages that derive it.
- **Not a stage.** It writes no numbered artifact and never advances `current-stage`.
