# Review: triage mode (`/wf review <slug> triage`)

This file belongs to [_stage.md](_stage.md). Load it only when the second argument is `triage`.

If the second argument is `triage` (e.g., `/wf review my-feature triage`), skip the full review and jump directly to re-triage:

1. **Resolve slug** from the first argument. Read `00-index.md` with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index` ([_records.md](../_records.md)) for `review-scope` and `selected-slice`.
   - `review-scope: slug-wide` → target is `07-review.md`; ignore any third-argument slice selector.
   - `review-scope: per-slice` → use the third argument as slice slug if present, else `selected-slice`; if neither, ask. Target is `07-review-<slice-slug>.md`.
2. **Read the ledger** — run `wf.mjs findings list "<root>" <slug> --source review --open`, with `--slice <slice-slug>` in per-slice mode. Collect findings with status `deferred` or `open`. Findings already `resolved`/`fixed`/`dismissed`/`refuted` are not re-presented unless the user names them.
3. **If no findings to triage** → print "No deferred or untriaged findings. Run `/wf review <slug> [<slice>]` for a full review." and STOP.
4. **Ask one gate question for each finding, per [_gate-question.md](../_gate-question.md).** Show only `deferred` and `open` findings. The options are `Fix`, `Defer` and `Dismiss`. Offer `Defer` only for a finding that needs runtime evidence behind a recorded wall. A `Fix` answer runs the finding as one fix step of `_stage.md` Step 4c.
5. **Record each decision** with `wf.mjs findings set`, then write the draft of the target review record whole from the ledger and put it, per `_stage.md` Step 5.
6. **Print summary** — show fix/defer/dismiss counts and list findings newly marked for fixing.

Then STOP — do not continue to the full review workflow.
