---
description: Shared single-source procedure — the ship-plan readiness pre-check run by `/wf handoff` and `/wf ship`. Detects a missing `.ai/ship-plan.md` and drift between the plan and how the code ships (version sources, secrets, workflow files, release-relevant change surface, plan staleness), then gates: route to the sanctioned editor (`/wf ship-plan init` | `/wf ship-plan edit`) or record an explicit acknowledgement. Every finding carries a `clears-on: amend | repo | merge` tag and the gate offers only remedies that can clear it. It never edits the plan itself; authoring stays in the ship-plan skill.
---

# Ship-plan readiness pre-check (shared, single source)

**A ship plan that no longer describes how the code actually ships is worse than no plan at all**: it lends a stale contract false authority at the exact moment (merge, tag, publish) that authority is irreversible. Before `/wf handoff` declares a PR ship-ready and before `/wf ship` runs a release, confirm that the project's `.ai/ship-plan.md` exists **and** still matches the repository. Both stages **gate** on the result: they cannot proceed silently past a missing or drifted plan; they require the plan fixed, or an explicit, recorded acknowledgement.

`ship.md` and `handoff.md` load this file and follow it exactly. It is the only place the pre-check lives; cite it, never inline it. The signal catalogue is in [ship-plan/_readiness-signals.md](ship-plan/_readiness-signals.md) (Step R2, with the shell-portability rules for its commands); the ledger filter, question texts, re-fire guards, and inline-amendment rules are in [ship-plan/_readiness-gate.md](ship-plan/_readiness-gate.md) (Steps R2.5, R3, R3.5).

## Boundary — this check never authors the plan itself

The plan is a contract authored by `/wf ship-plan init` and amended, one block at a time, by `/wf ship-plan edit` (which bumps `plan-version`). This pre-check **detects and routes**; it never opens, rewrites, or bumps the plan **by hand**. Three outcomes are available when a fix is needed:
- **Route + STOP** — print the exact `/wf ship-plan …` command; the caller resumes after the user has run it.
- **Route + run inline** — with the user's explicit choice, invoke `ship-plan edit` as a sub-step **scoped to the drifted blocks**, then re-verify and continue the same run. The editor still does the authoring; this check only decides that it should run and confirms afterwards that it worked. A re-check that is not clean falls back to STOP.
- **Acknowledge** — proceed with known drift, recorded, never silent.

This file never hand-edits `.ai/ship-plan.md`, never bumps `plan-version` itself, and never continues on an amendment it has not re-verified. A fourth rule governs which of the three it may offer: a remedy is offered only for drift it can actually clear. Some findings are the plan being wrong about the repo (an amendment ends them); some are the repo being behind the plan (only a repo change ends them); some are true statements about an open branch that stay true until it merges. Offering "amend the plan" for the last kind costs a `plan-version` bump, invalidates plan-scoped acknowledgements, and returns the user to the identical question. See `clears-on` below.

## Inputs the caller passes in

| Input | From | Used by |
|---|---|---|
| `base-branch` | `00-index.md` | change-surface diff, staleness window |
| commit range | `git merge-base HEAD origin/<base-branch>`..`HEAD` (handoff) / the release HEAD (ship) | change-surface signal |
| `has-migration` | handoff frontmatter / `00-index.md` | rollback-playbook signal |
| `branch-strategy` | `00-index.md` | not-applicable path (local-only work) |
| caller | `handoff` or `ship` | which missing-plan gate applies (Step R3) |

# Step R1 — Plan presence

`test -f .ai/ship-plan.md`. **Present** → parse Blocks A–G (and any inbound H–K) into memory; go to Step R2. **Missing** → skip R2; go to Step R3 with `verdict: missing`.

# Step R2 — Drift detection (three signal groups)

Run the three groups in the signals file: Group 1, version sources, secrets, and workflow files (plan-vs-repo mismatch); Group 2, the release-relevant change surface of the packaged diff; Group 3, the plan-staleness heuristic. Collect every mismatch into `drift-findings[]` as `{ signal, detail, suggested-block, clears-on }`, where `suggested-block` names the ship-plan block the user would amend (`B` version, `C` CI/CD + secrets, `D` post-publish, `E` rollout/rollback, `F` recovery playbooks). A run with an empty `drift-findings[]` is **clean**.

## `clears-on` — what actually ends a finding

**A remedy that cannot clear a finding is not a remedy.** Every signal carries a `clears-on` tag naming the one action that ends it, and the R3 gate offers remedies keyed to that tag. The field exists because the gate once did the opposite: a branch answered *Amend the plan*, amended block C exactly as instructed, and got the identical question back twelve minutes later, because the surviving finding was one that only merging can clear.

| `clears-on` | Meaning | Signals |
|---|---|---|
| `amend` | An edit to the named block ends it — the plan is wrong about the repo. | `version-source-missing`, `version-source-new`, `secret-unplanned`, `secret-orphaned`, `workflow-missing`, `workflow-new`, `migration-without-rollback`, `plan-stale` |
| `repo` | A change **to the repository**, not to the plan, ends it — the plan is right and the repo is behind. | `version-already-released` (bump the working-tree version or cut from a new base), `compliance-stale` (re-run `/wf ship-plan build --dry-run`) |
| `merge` | Nothing ends it while the branch is open — it is a true statement about the branch that stays true until the branch lands. | `release-surface-touched`, `dependencies-changed` |

`clears-on` and fingerprint scope (R2.5) are **separate axes** and neither implies the other: `migration-without-rollback` fingerprints on the branch yet clears on an amendment, because adding the missing playbook to block F makes it false. Tag each finding from the table when you raise it; do not derive it.

# Step R2.5 — Acknowledgement-ledger filter

Acknowledgements live in `.ai/ship-plan-acks.yaml`. Filter `drift-findings[]` against the surviving ledger per the gate file: a finding already acknowledged, or amended for, is reported as one advisory line and never re-asks; new drift always still gates. Invalidation is scoped (plan-scoped entries die on a `plan-version` bump, branch-scoped entries die at merge), so an honest amendment never re-opens a settled branch fact.

# Step R3 — Verdict + gate

Compute the verdict after the R2.5 filter (a run whose every finding was already acknowledged is `ok` with the advisory lines in the report):
- `missing` — no plan (from R1).
- `drift` — at least one **gating** finding survives. Advisory findings (`secret-orphaned`, `compliance-stale`) are never gating and never counted into the ask; they are printed beneath the table and carried forward.
- `ok` — plan present and no gating finding survives. **Record `ship-plan-readiness: ok` and return to the caller; no prompt.**

Both `missing` and `drift` **gate**: present the situation and require an explicit decision. Ask a gate question per [_gate-question.md](_gate-question.md), with the texts, the two re-fire guards, and the per-answer procedures from the gate file. Two principles build the drift menu. Let `amendable` = the gating findings whose `clears-on` is `amend`; name in the amend options only the blocks the amendable findings point at, because a `merge`-class finding riding along must not drag its block into the amendment. When `amendable` is empty — never offer an amendment; offer only acknowledgement and, where a finding is `clears-on: repo`, the repo action that ends it. `<N>` in a question counts **gating findings only**.

The answers map to verdicts: *Create it* / *Amend separately* / *Fix in the repo* / *Cancel* → stop the run (`missing` or `drift`); *Shipping is external* (handoff only) → `not-applicable`; *Amend now and continue* → a scoped `ship-plan edit` sub-step, re-checked, → `amended-inline` on a clean re-check, else the run stops; *Acknowledge and proceed* → `acknowledged`, with the reason in `po-answers.md` and the ledger.

# Step R4 — Record the outcome

Whatever the path, stamp `ship-plan-readiness: <ok | missing | drift | acknowledged | amended-inline | not-applicable>` into the calling stage's artifact frontmatter (`08-handoff.md` / `09-ship-run-<run-id>.md`) and, on the lead slug in batch mode, once for the branch (the plan is project-level: one check per repo per run, not per slug). Older artifacts without the field predate this pre-check; treat an absent field as `skipped`. On `amended-inline`, the caller also records which blocks were amended and the `plan-version` before→after; the amendment happened inside a stage run, so the artifact is the only place a reader will find it.

# Caller integration

- **`/wf ship`** — run this pre-check inside Step 0 immediately after reading `.ai/ship-plan.md`. `missing`/`drift`/`cancel` all STOP before the 13-step sequence. `ok`, `acknowledged`, and `amended-inline` proceed.
- **`/wf handoff`** — run this pre-check once the roster and commit range are known (after the fingerprint/roster report, before packaging). `missing`/`drift` STOP and route via `00-index.md` `recommended-next-*` (no partial package written, but `resume-orientation` **is** written per Step R3.5 so the resumed run skips re-deriving the roster and prereqs); `ok`, `acknowledged`, `amended-inline`, and `not-applicable` proceed to packaging. In batch mode the lead owns the single check.
