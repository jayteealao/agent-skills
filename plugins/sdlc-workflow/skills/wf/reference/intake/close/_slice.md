# Slice close / skip (`/wf intake <slug> close <slice>`)

Load this file only when Step 0 of [../close.md](../close.md) resolved the token to a slice. The scope discipline of that file still applies.

A slice close ends one slice without building it, so that the later prerequisites (the handoff aggregation, the slice order) treat it as resolved, not pending. The **slice** is the unit that matters (see *What this command is NOT* in [../close.md](../close.md)).

## Step S0 — Orient
1. Parse the index (`record get "<root>" <slug> index`: `current-stage`, `progress`, `branch-strategy`, `branch`, `selected-slice`) and the roster of `03-slice.md` (`record get "<root>" <slug> 03-slice.md`). Find the slice `<slice>` in the roster.
2. When the slice is already `status: complete`, warn: "Slice `<slice>` is already complete — closing it discards nothing built, but marks it terminated. Proceed? (yes)". When it is already `skipped` or `closed`, warn that the run overwrites the skip record.

## Step S1 — Collect reason
When no reason followed the slice token, ask one question: *"Why is slice `<slice>` being closed/skipped? (e.g. 'descoped', 'covered by another slice', 'not needed for this release', 'done externally')"*. Do not write until you have a reason.

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

Body: `# Slice skipped: <slice>`, with **Reason**, **What was bypassed** (what this slice would have built), **Downstream impact** (what depends on it, and how its prerequisites are now satisfied), and **Stub state** (whether a slice stub was written).

## Step S3 — Mark the slice terminated (so downstream prereqs pass)
1. Get `03-slice.md`. In its `slices:` roster, set the entry of `<slice>` to `status: skipped`, and add `skip-record: skip-slice-<slice>.md`. Do not touch the entries of other slices, and do not renumber.
2. When the `03-slice-<slice>.md` record exists, set its frontmatter with `record set "<root>" <slug> 03-slice-<slice>.md status=skipped skipped=true skip-record=skip-slice-<slice>.md`, and leave its body intact. When it does not exist, write the draft of a minimal stub `03-slice-<slice>.md` (`type: slice`, `status: skipped`, `skipped: true`, `skip-record: skip-slice-<slice>.md`), and put it. Its body says that the slice was skipped before it was defined, so that later commands find the file and do not fail on a missing prerequisite.
3. Recompute a slice **count** that the author wrote in the body of `03-slice.md` only when it stated an *active/remaining* total. The figures that come from the roster (the header, the figure, the metric row) recompute themselves. This is clerical, not a roster change.
4. Write the draft of `03-slice.md` with the changes of items 1 and 3, and put it.

## Step S4 — Update `00-index.md`
Run one `record set "<root>" <slug> index` call: add `skip-slice-<slice>.md` (and any stub) to `workflow-files` (`"workflow-files=[<current entries>, skip-slice-<slice>.md]"`). When `<slice>` was the `selected-slice`, move it to the next unresolved slice in the same call (`selected-slice=<next>`). Do not change `status` or `current-stage`: the workflow goes on, and only this slice is done.

## Step S5 — Hand off
Lead with a short narrative: what the slice was, why it is closed, and what now goes on without it. Then a receipt: the skipped slice, the reason, the path of the skip record, and the next command (`/wf plan <slug> <next-slice>`, or `/wf ship <slug>` when this was the last open slice). When the slice had real work in progress, put a ⚠ line first that notes the discarded state.
