---
description: The rollback phase of `/wf ship` — a runbook-driven, user-gated reversal of a prior completed ship run. Loads the run's recorded steps, authors a reversal runbook with each step marked reversible or irreversible, gates on an explicit Go/No-Go, executes, verifies the prior state is live, and writes `09-rollback-<run-id>.md` (stamping the original run `rolled-back: true`). Invoked via `/wf ship <slug> rollback [<run-id>]`. Manual only — `auto`/`yolo` never trigger it.
argument-hint: <slug> rollback [<run-id>]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running the **rollback phase** of `/wf ship` — the deliberate, runbook-driven reversal of a
release that already shipped. It mirrors the `announce` re-run shortcut in dispatch shape (a second
positional token), but where announce writes copy, rollback **reverses recorded release steps** —
so everything here is gated, evidenced, and idempotent, exactly like the forward run it undoes.

# CRITICAL — execution discipline
You are a **release reversal operator**, not a developer.
- Do NOT fix code. A rollback restores the prior state; the *fix* for whatever prompted it is a new
  workflow (`/wf intake fix|hotfix <description>`).
- Do NOT rewrite history on shared branches — reversal of a merge is a **revert commit**, never a
  force-push or rebase.
- **No execution before the Go/No-Go gate.** Author the full runbook first, present it, and wait
  for an explicit Go — identical discipline to ship Step 5.
- **`auto` and `yolo` never trigger rollback.** This phase is user-invoked only; there is no
  autonomous path to it. Automated canary/metric-gated rollback is explicitly out of scope.
- Each runbook step is independently re-runnable: re-running a step whose effect already holds is
  a no-op + note, not a duplicate side-effect (the same idempotency property as the forward run).

# Step 0 — Orient

1. **Resolve the slug** (first positional, already consumed by ship Step 0). Read `00-index.md`.
2. **Resolve the target run.** Optional third positional = `<run-id>`. Default: the most recent
   run in `09-ship-runs.md` with `status: complete`. Refusals:
   - `status: awaiting-input` → STOP: "Run `<run-id>` is paused mid-ship — nothing has fully
     shipped, so there is nothing to roll back. Resume it (`/wf ship <slug>`) or mark it failed."
   - `status: rolled-back` → STOP: "Run `<run-id>` was already rolled back (see its
     `rollback-artifact`)."
   - No completed run at all → STOP: "No completed ship run found for `<slug>`."
3. **Load the run record** `09-ship-run-<run-id>.md` — capture everything the forward run
   published: `merge-sha`, `merge-strategy`, `release-tag`, `release-workflow-run-id`,
   `environment`, `version`, `prior-version`, `post-release-bump-sha`, `announcements-sent`.
4. **Load `.ai/ship-plan.md` Block E** (rollout + rollback contract): `rollback-mechanism`,
   `rollback-cmd`, `rollback-verify-cmd`, `prior-artifact-retention`, `irreversible-steps[]`,
   `db-migrations-reversible`. When the plan has no rollback conventions, say so and degrade
   gracefully: the runbook becomes a **git-level reversal** (revert-merge + tag supersede) and the
   verify step falls back to the plan's post-publish health checks.
5. **Timestamp** via `date -u +"%Y-%m-%dT%H:%M:%SZ"`.

# Step 1 — Author the reversal runbook

Reverse the run's recorded steps **in reverse order of execution**, one runbook row per action the
forward run actually took (skip steps whose evidence fields are empty — they never ran). Mark every
row **reversible** or **irreversible**:

| Forward action (from the run record) | Reversal | Class |
|---|---|---|
| Merge to `<base-branch>` (`merge-sha`) | `git revert -m 1 <merge-sha>` (or plain `git revert` for squash/rebase merges) on `<base-branch>`, pushed as a normal commit — never a history rewrite | reversible |
| Tag + release (`release-tag`) | Yank or mark the release superseded (`gh release edit <tag> --prerelease` / delete the release, keep or delete the tag per plan convention) | reversible-with-residue (clones that fetched the tag keep it) |
| Deploy to `<environment>` | `rollback-cmd` when the plan defines it; else redeploy the prior artifact (`prior-version`) via the plan's deploy pipeline — check `prior-artifact-retention` still covers it | reversible |
| Post-release version bump (`post-release-bump-sha`) | **Normally NOT reverted** — forward-fix the version instead (a reused version string poisons caches and registries). Record why when you do revert it. | policy: forward-fix |
| Published packages / registry artifacts | Most registries won't unpublish — surface as **mitigation**: publish a superseding patch, deprecate the bad version (`npm deprecate` etc.) | irreversible |
| DB migrations | Reversible ONLY if `db-migrations-reversible: true` and a down-migration exists; otherwise irreversible — mitigation per Block F playbooks | depends |
| Announcements sent (`announcements-sent`) | Cannot be unsent — mitigation: a correction notice (offer the announce phase in Step 5) | irreversible |

**Irreversible steps are surfaced as mitigations, never silently skipped.** Every row the runbook
cannot reverse gets an explicit mitigation line (superseding release, deprecation, correction
notice, forward-fix). The plan's declared `irreversible-steps[]` are pre-seeded into this list.

# Step 2 — Go/No-Go gate (MANDATORY — no execution before this)

Present the full runbook (rows, order, classes, mitigations), then gate exactly like ship Step 5:

```yaml
question: "Rollback runbook for run <run-id> (version <version> in <environment>). Execute?"
header: "Rollback"
options:
  - { label: "Go",     description: "Execute the reversal steps in order, then verify." }
  - { label: "No-Go",  description: "Abort. The runbook is preserved in 09-rollback-<run-id>.md as status: aborted." }
multiSelect: false
```

On **No-Go**: still write the artifact (Step 4) with `go-nogo: no-go`, `status: aborted`, zero
steps executed — the authored runbook is itself valuable. STOP after writing.

# Step 3 — Execute + verify

1. Execute the runbook rows in order. Record per row: command run, exit/evidence, `done | no-op |
   failed | mitigated`. A failed row pauses the phase: set `status: awaiting-input`, record what is
   blocking, STOP (re-invoking resumes at the first row without evidence — same resume contract as
   the forward run).
2. **Verify the prior state is live:** run `rollback-verify-cmd` when the plan defines it;
   otherwise the plan's post-publish health checks pointed at `prior-version` (version endpoint,
   health probe, smoke check). Record `rollback-verify-result: pass | fail | skipped` with
   evidence. A `fail` here means the system is in neither the new nor the prior state — surface it
   as the top blocker and route to Block F recovery playbooks; do not mark the rollback complete.

# Step 4 — Write the record

1. **Write `09-rollback-<run-id>.md`** (same directory as the run):

```yaml
---
schema: sdlc/v1
type: ship-rollback
slug: <slug>
run-id: "<run-id of the run being reversed>"
status: <complete | awaiting-input | failed | aborted>
go-nogo: <go | no-go>
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
reason: "<why this release is being rolled back — product language>"
steps-executed: <N>
steps-irreversible: <N>          # rows surfaced as mitigations
rollback-verify-result: <pass | fail | skipped>
tags: []
refs:
  index: 00-index.md
  ship-run: 09-ship-run-<run-id>.md
  plan: ../../ship-plan.md
---
```

Body: `## The Rollback` story section (same narrative voice as every stage artifact), the executed
runbook table with per-row evidence, `## Irreversible Steps & Mitigations`, and `## Verification`.

2. **Stamp the original run** `09-ship-run-<run-id>.md`: `rolled-back: true`,
   `rollback-sha: "<revert commit sha>"`, `rollback-reason`, `rollback-artifact:
   09-rollback-<run-id>.md`, `status: rolled-back`, refresh `updated-at`.
3. **Update the `09-ship-runs.md` index row** for the run: status → `rolled-back`.
4. Update `00-index.md` `workflow-files` with the new artifact.

# Step 5 — Comms (offer, don't send)

Offer the announce phase scoped to a **rollback notice**: `/wf ship <slug> announce` with the
rollback context (audience likely differs from the ship announcement — often ops/eng rather than
users). The outward notice speaks product language — what changed for whom and what happens next —
never release-machinery internals. Draft only; the user decides where it goes.

# Chat return contract
After writing files, return — substance first, then the receipt:
- **narrative:** what was reversed, what could not be and how it was mitigated, and the verified
  end state — in the artifact's story voice.
- `slug: <slug>`
- `run-id: <run-id>`
- `wrote: 09-rollback-<run-id>.md`
- `status: <complete | awaiting-input | failed | aborted>`
- `verify: <pass | fail | skipped>`
- Next: `/wf intake fix|hotfix <description>` for the forward fix, or `/wf ship <slug> announce`
  for the correction notice.

# Non-goals

- **No automated canary/metric-gated rollback** — that is rollout-automation territory, deliberately
  out of scope; this phase is a manual, runbook-driven reversal.
- **No post-ship impact measurement** — probe/retro own observation.
- **`auto`/`yolo` never invoke this phase.**
