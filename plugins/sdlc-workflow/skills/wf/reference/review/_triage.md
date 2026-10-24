# Review: triage mode (`/wf review <slug> triage`)

This file belongs to [_stage.md](_stage.md). Load it only when the second argument is `triage`.

If the second argument is `triage` (e.g., `/wf review my-feature triage`), skip the full review and jump directly to re-triage:

1. **Resolve slug** from the first argument. Read `00-index.md` for `review-scope` and `selected-slice`.
   - `review-scope: slug-wide` → target is `07-review.md`; ignore any third-argument slice selector.
   - `review-scope: per-slice` → use the third argument as slice slug if present, else `selected-slice`; if neither, ask. Target is `07-review-<slice-slug>.md`.
2. **Read the ledger** — run `wf.mjs findings list "<root>" <slug> --source review --open`, with `--slice <slice-slug>` in per-slice mode. Collect findings with status `deferred` or `open`. Findings already `resolved`/`fixed`/`dismissed`/`refuted` are not re-presented unless the user names them.
3. **If no findings to triage** → print "No deferred or untriaged findings. Run `/wf review <slug> [<slice>]` for a full review." and STOP.
4. **Present for triage as a gate question per [_gate-question.md](../_gate-question.md)** — same protocol as Step 4b, but show only `deferred` and `open` findings. A `Fix` decision here may also run the Step 4c fix loop.
5. **Record each decision** with `wf.mjs findings set`, then write the target review file whole from the ledger per `_stage.md` Step 5.
6. **Print summary** — show fix/defer/dismiss counts and list findings newly marked for fixing.

Then STOP — do not continue to the full review workflow.
