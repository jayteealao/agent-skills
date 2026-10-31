# Batch handoff — the body of the `batch` mode of handoff

The `batch` mode applies when the `target` output of [../handoff.md](../handoff.md) Step 0 is `scope: branch`: a `pr#N` or a branch name packages every slug on that branch.

## Elect the lead slug

This is handoff Step 0, item 3a. When a roster slug carries `handoff-lead:`, reuse it unchanged. Otherwise elect the first roster slug alphabetically, and run `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index handoff-lead=<lead>` for every roster slug. The lead owns the single shared PR and the branch-level readiness keys (T3.5–T5.3). Followers carry `readiness-via: <lead>/08-handoff.md`.

## Two layers

Branch scope splits the numbered procedure of handoff into two layers:

1. **Per-slug packaging** (T1–T3.7) runs once for each roster slug whose action is `package`. The artifact work (the T1 reads and the T2 summary) dispatches in parallel, one sub-agent per slug. Each slug touches only its own `.ai/workflows/<slug>/` files. The steps that write or commit in the shared working tree (T3 docs, T3.5 commitlint, T3.6 public-surface regen, T3.7 doc-mirror regen) run one at a time, in roster order, after the parallel wave. Skip the slugs marked `skip-unchanged` or `not-ready`.
2. **Branch machinery** (T3.8–T5.3: the local pre-push gate, the push, the ONE PR, the CI watch, triage, the rebase and the final readiness) runs once, and the lead owns it. The PR description is the union of the summaries of every packaged slug, in one section per slug, with a "Not yet ready" callout that names each `not-ready` slug on the branch. Its title is the theme of the branch.
3. **`pr-readiness-verdict` is the logical AND across the roster.** Ship gates on the AND.

## A shared branch

When `branch-strategy` is `shared`, the lead creates or refreshes the single shared PR (T5 runs), and the body names the not-ready slugs. T5.2 stays dropped. T5.0, T5.1 and T5.3 run.

## The writes

- The lead owns the single ship-plan readiness check (step 6.7) and stamps it.
- Write the branch-level readiness keys, `pr-readiness-verdict` and `handoff-lead` to the lead's `08-handoff.md`. Each follower sets `readiness-via: <lead>/08-handoff.md` and copies `pr-readiness-verdict`.
- Step 9 also sets `handoff-lead=<lead>` on each roster slug, and `readiness-via=<lead>/08-handoff.md` on each follower.
- Carry forward the union of `open-questions` across the roster slugs.
- On a re-run, the PR body is the union across the packaged slugs, made again whole. The readiness keys are only on the lead.
