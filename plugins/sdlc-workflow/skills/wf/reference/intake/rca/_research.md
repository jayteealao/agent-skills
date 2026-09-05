# RCA research charters (Step 2 of `intake/rca.md`)

Step 2 of `/wf intake rca` dispatches the three sub-agents below in parallel. Every dispatch is read-only. Wait for all of them before synthesis.

**Effort tier for every dispatched agent:** **medium** (per [_subagents.md](../../_subagents.md)). REQUIRED on every dispatch. Root-cause analysis is the defining judgment-heavy task: Code path investigation must reason about incorrect assumptions and race conditions, Recent change correlation must causally link diffs to symptoms, Blast radius must reason about coupling. Low effort underserves causal reasoning under uncertainty; medium is the right tier.

When an inbound `discover` verdict supplied ranked counter-hypotheses (`_intake-provenance.md`), seed every prompt below with them: they are candidate root causes.

### research sub-agent 1 — Code path investigation

Prompt with ALL of the following:
- Identify the code path most likely to contain the bug from the symptom description and any error/stack trace.
- Read the implicated files in full. Look for: incorrect assumptions, missing null/undefined handling, race conditions, off-by-one errors, incorrect state transitions, mismatched contract between caller and callee.
- Check tests covering the implicated path. If tests exist, identify why they did not catch this. If tests do not exist, note the gap.
- Run `git log --oneline -20` on the implicated files; cross-reference with "recent changes" from the symptom intake.

Return as structured text:
- `implicated_files`: list of paths
- `most_likely_mechanism`: one paragraph naming the root cause mechanism
- `evidence`: 2-5 bullets citing file:line locations
- `confidence`: high | medium | low (with one-line justification)
- `test_coverage_gap`: description or "none"

### research sub-agent 2 — Recent change correlation

Prompt with ALL of the following:
- Run `git log --since="7 days ago" --oneline` and identify commits in or near the implicated path.
- For each candidate commit, read the diff and check whether it could plausibly cause the symptom.
- Check open PRs touching the implicated path: `gh pr list --search "path:<implicated-dir>"`.
- Check recent deployments, migrations, or feature flags if discoverable from the repo.

Return as structured text:
- `suspect_commits`: list of `<sha> <short-message>` with one-line "could it cause this?" assessment
- `concurrent_work`: list of open PRs touching the same area
- `external_changes`: any deploys/migrations/flag flips noted (or "none discovered")

### research sub-agent 3 — Blast radius

Prompt with ALL of the following:
- Given the implicated mechanism, identify what else might be silently affected: callers of the broken function, sibling code paths sharing the same flawed assumption, data already corrupted by past invocations, downstream systems consuming the bad output.
- Search the codebase for the same pattern that caused the bug, in case it exists in multiple places.

Return as structured text:
- `affected_callers`: list of `path:symbol` that may be affected
- `same_pattern_elsewhere`: list of paths where the buggy pattern repeats (or "none found")
- `data_at_risk`: description of any persisted state that may be corrupt (or "none")
- `radius`: low | medium | high (with one-line justification)

If the symptom is clearly local (a single component, a single endpoint, no shared utilities), Sub-agent 3 may be skipped. State in the RCA artifact that it was skipped and why.
