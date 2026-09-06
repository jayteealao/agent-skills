---
description: Run a release using the project's `.ai/ship-plan.md`. Reads the plan, generates a run-id, and walks the 13-step idempotent ship sequence (pre-flight → publish dry-run → rollout → freshness delta → go/no-go → merge → tag → workflow watch → post-publish poll → post-release bump → index update → write run artifact). Replayable: re-running after a partial failure resumes at the failed step. A `pr#N`/branch first argument ships EVERY slug on the branch atomically as one run (all-or-nothing). Refuses to start unless readiness is `ready`.
argument-hint: <slug|pr#N|branch> [environment|announce|rollback] [<run-id>] [--init-plan]
---

Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf ship`, **stage 9 of 10**: 1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → `9·ship` → 10·retro.

| | Detail |
|---|---|
| Requires | `.ai/ship-plan.md` (project-level; author it via `/wf ship-plan init` once per project) AND `08-handoff.md` with `readiness-verdict: ready` (single-slug) or `pr-readiness-verdict: ready` (batch, the branch-level AND). |
| Conditional inputs (required when present) | `augmentations:` in `00-index.md` (union across the roster in batch mode): every entry gets a changelog entry in user language. A prior `09-ship-run-*.md` with `status: awaiting-input`: offer to resume rather than start fresh. |
| Produces | `09-ship-run-<run-id>.md` (per release, on the lead slug) with its sibling `09-ship-run-<run-id>.yaml` and `09-ship-run-<run-id>.html.fragment`, plus a refreshed `09-ship-runs.md` per roster slug (followers carry a `shipped-via` pointer). Legacy `09-ship.md` is read-only. Schemas: [ship/_run-artifact.md](ship/_run-artifact.md). |
| Phases | `ship/announce.md` (post-publish comms), `ship/rollback.md` (user-gated reversal). |
| Next | `/wf retro <slug>` (go) or `/wf implement <slug> <slice>` (blockers) |

**Auto second opinion (objective triggers).** At the Go/No-Go gate, before the irreversible merge, auto-invoke `/consult codex <risk-review this release: pre-flight, dry-run, freshness delta, and any deferred findings>` (pinning `codex`/`claude` keeps it free) when ANY of: (a) any deferred review finding or runtime-evidence-deferral rides the release; (b) the freshness delta shows the base branch moved since verify; (c) pre-flight or the dry-run surfaced a warning that was overridden. Skip only when none of the triggers hold.

# Role

You are a **workflow orchestrator**, not a problem solver.
- Do not fix code; when blockers require code changes, recommend `/wf implement <slug> <slice>`.
- Do not modify `.ai/ship-plan.md`; to edit the plan, run `/wf ship-plan edit`. Runs follow the plan as a contract.
- Your job: **read the plan, generate or resume a run, execute the 13 idempotent steps, write the run artifact**.
- Each step is independently re-runnable. Re-running step N when N already completed is a no-op plus a note, not a duplicate side effect.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Workflow rules

Apply [_workflow-rules.md](_workflow-rules.md). Ship-specific rules:
- Run artifacts live under `.ai/workflows/<slug>/`; `09-ship-runs.md` is the per-workflow run index. The ship plan lives at `.ai/ship-plan.md` (repo root), not under `.ai/workflows/`: project-scoped, shared across workflows.
- If a step cannot finish, set `status: awaiting-input`, record what is blocking, and STOP. The next invocation resumes from there.
- **Idempotency invariants per step.** Pre-flight is a no-op if the version is already applied. Merge is a no-op if the PR is merged. Tag is a no-op if the tag exists. Polling resumes from the last `pending` check.
- **Backwards compatibility.** A legacy `09-ship.md` is read for context, never written; `/wf status` and `/wf recap` treat both shapes as valid. To migrate, author a plan via `/wf ship-plan init` and run `/wf ship <slug>` for the next release; the legacy file stays as historical record.

# Step 0 — Orient
1. **Resolve the first positional**, polymorphic, in the same order as `/wf handoff` (first match wins): an **exact slug** (`.ai/workflows/<arg>/00-index.md` exists) → single-slug ship, `ship-scope: slug`; a **PR reference** `pr#N` / `#N` / bare integer → resolve the branch via `gh pr view <N> --json headRefName -q .headRefName` → the branch path, `ship-scope: branch`; a **branch name** (matches a `branch:` in some `00-index.md`) → batch ship, `ship-scope: branch`; **absent** → infer the most recent active workflow, single-slug; if ambiguous, ask. **Build the roster** (`branch-slugs`): single-slug → `[<slug>]`; batch → every slug whose `00-index.md` `branch:` equals the resolved branch. **Elect the lead**: reuse the `handoff-lead:` recorded at handoff; if absent, the first roster slug alphabetically. The lead owns the single `09-ship-run-<run-id>.md`; followers get a `shipped-via` pointer. The second-positional shortcuts (`announce`, `rollback`) resolve against the lead slug's run in batch mode: one run per branch.
1.5. **Announce re-run shortcut.** If the second positional is exactly `announce` (not a valid environment, so no collision with step 0.3): load `ship/announce.md`, run only the announce phase for `<slug>`, then STOP. Do not run the 13-step sequence.
1.6. **Rollback shortcut.** If the second positional is exactly `rollback` (not a valid environment): load `ship/rollback.md`, run only that phase for `<slug>`, then STOP. Do not run the 13-step sequence. The optional third positional is `<run-id>`; the default is the most recent `status: complete` run in `09-ship-runs.md`. A paused (`awaiting-input`) run is refused; resume or fail it instead.
2. **Detect `--init-plan` flag.** If present, print and STOP: "The plan-author flow is `/wf ship-plan init`, not `/wf ship --init-plan`. Run: `/wf ship-plan init [--from-template <kind>]`."
3. **Resolve the environment** (optional second positional, `staging` or `production`). It overrides the plan's default; otherwise use the first entry in `ship-plan.ship-environments[]`.
4. **Read `.ai/ship-plan.md` and run the ship-plan readiness pre-check.** Load [_ship-plan-readiness.md](_ship-plan-readiness.md) and follow it exactly (caller = `ship`, commit range = the release HEAD). It resolves the **missing-plan** gate and the **plan-drift** gate before the run proceeds: a missing plan, unacknowledged drift, or a cancel all STOP here, before the 13-step sequence. Only `ok`, `acknowledged`, or `amended-inline` continue. Stamp the returned `ship-plan-readiness` into the run artifact (Step 13). On a continuing verdict, parse all blocks (A–G) into in-memory state; on `amended-inline`, parse the post-amendment plan (its `plan-version` was bumped by the scoped edit). Ship never authors the plan by hand; the gate offers an amendment only for findings an amendment can clear (`clears-on: amend`). A missing plan routes to `/wf ship-plan init --from-template <kotlin-maven-central | npm-public | pypi | container-image | server-deploy | library-internal>`.
5. **Read `00-index.md`** for each roster slug: `current-stage`, `status`, `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `augmentations:`, `handoff-lead:`. In batch mode the PR/branch fields must agree across the roster (they share one branch/PR); if they disagree, STOP and report the inconsistency.
6. **Readiness gate, all-or-nothing across the roster.** Ship is atomic per PR: every roster slug is shippable or none ship.
   - **Single-slug**: read `08-handoff.md`, parse `readiness-verdict`. If missing or `≠ ready`, STOP: "Handoff readiness-verdict is `<verdict>`. Ship requires `ready`. Run: `/wf handoff <slug>`."
   - **Batch**: read the lead's `08-handoff.md` and parse `pr-readiness-verdict` (the branch-level AND). If `≠ ready`, STOP and print the roster report (which slugs are ready and which are not, from the lead's `branch-slugs` and each slug's state): "Ship is all-or-nothing per PR. `pr-readiness-verdict` is `<verdict>` — bring every slug ready first: `/wf handoff pr#N`." Do not ship the ready subset.
   - Parse `pr-url`, `pr-number`, `branch`, `base-branch`, `has-deferred-comments` from the lead handoff. If `has-deferred-comments: true`, WARN before continuing.
6.5. **Runtime-evidence deferral gate (hard block).** Parse `runtime-evidence-deferrals` from every roster slug's `00-index.md` (absent → empty). An entry is **open** when `cleared-by: null` and it carries no `ship-override-authorization`; one open entry on any roster slug blocks the whole atomic run. If any entry is still open, STOP with: "Ship is blocked: <N> open runtime-evidence deferral(s). The following slices passed verify only because runtime evidence was deferred; ship requires evidence: <slice-slug>: <reason> (deferred-at: <iso>) … Clear each deferral by (a) running `/wf probe <slug> <target-matching-the-deferred-AC>` to capture evidence, then re-running verify (sets `cleared-by` to the probe/evidence descriptor), (b) re-running `/wf verify <slug> <slice-slug>` in an environment that supports the interactive checks, or (c) recording an explicit PO risk-acceptance as `ship-override-authorization: {by, at, reason}` on the entry, for genuinely deploy-time-circular cases only." **`cleared-by` is for evidence, never risk-acceptance**: it holds a probe/evidence descriptor proving the AC was observed. PO risk-acceptance goes in the distinct `ship-override-authorization` field and is listed as an explicit override in the ship summary. A multi-AC deferral may log partial progress in `cleared-acs: [...]` while `cleared-by` stays null.
6.6. **Intent-risk (RIM) gate (hard block, mirrors 6.5).** Parse `intent-risks` from every roster slug's `00-index.md` (absent → empty). An entry is open when `status: open`; one open entry on any roster slug blocks the run. If any entry is still open, STOP with: "Ship is blocked: <N> open intent-risk(s) (RIM). Shape never resolved a load-bearing ambiguity for the following — ship requires each adjudicated: <RIM-id> (<severity>): <risk> … Adjudicate each by running `/wf shape <slug>`; shape sets every open entry to `adjudicated` or `carried`. Ship never adjudicates; it detects and routes." `carried` RIMs are legal and do not block, but list every `carried` entry distinctly in the ship summary.
7. **Read every `07-review-*.md` and `po-answers.md`** for changelog and release-notes context, across all roster slugs in batch mode.
8. **Resume detection.** Search `.ai/workflows/<slug>/09-ship-run-*.md` for `status: awaiting-input`. For any hit, ask a gate question per [_gate-question.md](_gate-question.md) (header "Prior run"): `Resume <run-id> (Recommended)` (continue from the failed step), `Start fresh` (new run-id; the prior run stays paused), `Mark prior as failed and start fresh`. On resume, load that run's frontmatter and skip to the first step with an empty evidence field. On start fresh, leave the prior run untouched (or set `failed`) and generate a new `run-id`.
9. **Batch the load-bearing questions; ask them HERE, before the sequence starts.** A ship run is atomic: once step 1 begins, the run holds open until it finishes or is explicitly paused. Ask these together, in one round, presenting the derived default and asking only for confirmation or override:

   | Question | Where the default comes from | Which step consumes it |
   |---|---|---|
   | **Scope** — which slugs/PR ship in this run | the resolved roster (step 0.1) | the whole run |
   | **Version** — the computed bump, confirmed | `plan.version-bump-rule` + the commit log | Step 1.2 |
   | **Rollout strategy** | `plan.rollout-strategy` | Step 3.1 |
   | **Release window** — timing, blackout, on-call | freeform | Step 3.2 |
   | **Stakeholder/compliance overrides** | `plan`'s sign-off list | Step 3.3 |
   | **Post-release base push** — go/no-go for `git push origin <base-branch>` | `plan.post-release-version != none` | Step 10.3 |

   Record every answer in `po-answers.md` (`stage: ship`, with the `run-id`) and stamp them into the run's frontmatter as `prefetched-answers:`. Steps 1.2, 3.1–3.3, and 10.3 consume those answers instead of re-asking. What stays where it is: the **Go/No-Go** after pre-flight and CI, a merge-path fallback after a failed merge, and any recovery-playbook step offered on a step-8 failure are decisions about something that has happened.
9b. **Generate `run-id`** (UTC compact ISO-8601 `<yyyymmdd>T<hhmm>Z`, real time per [_timestamp.md](_timestamp.md)); it is the filename suffix and the `run-id` field. In batch mode there is ONE run-id for the whole branch.
10. **Carry forward** `open-questions` from the index (union across roster slugs in batch mode).

# Batch ship (scope: branch)

The 13-step sequence acts on the branch/PR, which is shared, so it runs exactly once per branch, owned by the lead slug. Do not loop the sequence per slug. The single `09-ship-run-<run-id>.md` is written under the lead slug with `ship-scope: branch` and `branch-slugs: [...]`. Aggregation points read the whole roster: the changelog and release notes (step 7 + `augmentations:`) cover every slug; the announce phase (step 14) covers the branch; rollback resolves through the lead. Each follower slug gets a pointer row in its own `09-ship-runs.md` (`shipped-via: <lead>/09-ship-run-<run-id>.md`) and its `00-index.md` advances to shipped.

# Chat return contract

After writing files, return per [_chat-return.md](_chat-return.md): a narrative lead in the artifact's `## The Ship` voice, then this receipt:
- `slug: <slug>`
- `run-id: <run-id>`
- `wrote: <path>`
- `status: <complete | awaiting-input | failed | rolled-back>`
- `options:` (all viable next options per Adaptive routing)
- ≤3 short blocker bullets if needed

# The 13-step run sequence

Each step is independently re-runnable: detect the already-done state before performing the side effect.

## Step 1 — Pre-flight

1.1 **Branch + tree state.** Confirm you are on `<branch>`. `git status --porcelain` must be empty. If dirty, do not stop outright — **classify every dirty path first** and only STOP on what needs a human:

   1. **Plugin-seeded files** — `CLAUDE.md` whose diff is entirely inside the `<!-- sdlc:wf-rules-import -->` fence, an untracked `AGENTS.md` containing only the `<!-- sdlc:wf-rules -->` fence, `.ai/.wf-rules-seeded`. These are the memory-seed kernel's own writes (verify mechanically: nothing outside the fences). Offer one-keystroke resolution as a gate question per [_gate-question.md](_gate-question.md): commit as `chore(sdlc): seed wf rules` (recommended) or gitignore the marker file; never a bare "go commit/stash it yourself".
   2. **`.ai/` workflow bookkeeping** — resolve per the repo's recorded `artifact-tracking` policy (`.ai/sdlc-config.json`; see `/wf ship-plan init`). `tracked` → offer "commit bookkeeping now" (`chore(sdlc): workflow artifacts`); `ignored` → these paths should not be dirty at all, so surface the policy violation (likely a missing `.gitignore` block) instead of committing; unset → ask once for this run and recommend recording it via `ship-plan edit`.
   3. **`ship-plan build` output** — files whose diff carries the `# Added by wf ship-plan build` provenance comment. Never silently commit-and-include. Offer: route to a review slice first (recommended; STOP with the `/wf intake <slug> fix …` seed), or explicitly accept as-is (recorded in `## Pre-flight` as `unreviewed-build-output-accepted` with the file list).
   4. **Everything else** — STOP and ask the user to commit/stash. Unknown always fails closed.

   When the tree is clean or resolved, record `branch` and `head-sha-at-start: <git rev-parse HEAD>`.

1.2 **Determine version.** Per `plan.version-bump-rule`:
   - `git-cliff` → run `plan.version-bump-cmd` (default `git cliff --bumped-version`).
   - `conventional-commits` → the project's bump tooling (`npx changeset version`, `npm version`; captured in `plan.version-bump-cmd`).
   - `manual` → the version confirmed in Step 0.9's batched round. Only if that round did not run (a resumed run predating it), fall back to a gate question per [_gate-question.md](_gate-question.md) with three suggested bumps from the commit log: patch, minor, major.
   - `fixed` → the literal version from the plan.
   **Tag-collision check (before confirming):** `git tag -l "v<version>" "<version>"` must return nothing, and `gh release view` for the matching tag form must 404. A hit means the branch's release identity is stale: STOP with the collision named and route to the bump decision rather than re-release an existing identity. Confirm with the user before applying. Record `version` and `prior-version: <git describe --tags --abbrev=0 || echo "none">`.

1.3 **Apply the version to every `version-source-of-truth` file.** Read each file first; skip if it already equals `version`. If any diff exists, commit `git commit -am "build: bump version to <version>"`.

1.4 **Verify required secrets.** For each `plan.required-secrets[]`: confirm it exists (`gh secret list | grep -q "^<NAME>\b"`); read `updatedAt` (`gh secret list --json name,updatedAt | jq -r '.[] | select(.name=="<NAME>") | .updatedAt'`); if `(now - updatedAt).days > plan.secrets-staleness-threshold-days`, WARN (the user may proceed; the warning is recorded in the run).

1.5 **Regenerate the changelog** per `plan.version-bump-rule`. If the changelog already includes `<version>`, skip. For `git-cliff`, check for a `cliff.toml` first: with no repo config, `git cliff --output CHANGELOG.md` replaces the whole file with a default-format commit dump. No `cliff.toml` plus an existing curated CHANGELOG → do not regenerate the full file; prepend a hand-written entry in the file's own style (`git cliff --unreleased --strip header` is safe input for drafting it). Then commit `git commit -am "docs: update changelog for <version>"`. Record `pre-flight-status: pass` (or `warn` with reasons when a secret was stale).

## Step 2 — Publish dry-run (when `plan.publish-dry-run-cmd` is set)

If the plan has no `publish-dry-run-cmd`, set `publish-dry-run-passed: skipped` and skip to step 3. Re-running step 2 is always safe.
2.1 Execute `plan.publish-dry-run-cmd`; capture stdout and stderr.
2.2 Verify artifact post-conditions per `ship-meaning`: `publish` (Maven Central / Sonatype) → the POM has groupId, artifactId, version, name, description, url, licenses, developers, scm, and `.asc` signature files exist; `publish` (npm) → `package.json` has `name`, `version`, `repository`, `license`, and `npm pkg fix --dry-run` finds no manifest issue; `publish` (pypi) → `twine check dist/*` passes; `publish` (container-image) → `docker manifest inspect` returns a multi-arch list when expected; `merge-only` / `deploy-*` → no manifest check; the build command succeeded.
2.3 Record `publish-dry-run-passed: true` (or `false` with the failing post-condition + STOP — set `status: awaiting-input`).

## Step 3 — Rollout questions (per run, never re-asked)

Skip if `go-nogo`, `rollout-strategy`, and `merge-strategy` are already set. 3.1–3.3 consume Step 0.9's `prefetched-answers:`; ask here only when Step 0.9 did not run (a run resumed from before it existed) or a pre-flight outcome materially invalidated an answer, and then re-ask just that one.

3.1 **Rollout-strategy.** Default is `plan.rollout-strategy`. Fallback: a single-select gate question per [_gate-question.md](_gate-question.md), header "Rollout", question "Confirm rollout strategy for this release?", options built from the plan plus an "Override" choice.
3.2 **Release window** (freeform): timing, blackout windows, on-call coverage.
3.3 **Stakeholder/compliance overrides for this run** (freeform): sign-off required beyond the plan's list? Append all answers to `po-answers.md` with `stage: ship` and the `run-id`.

## Step 4 — Freshness pass, delta only

Read-only; re-running is always safe. 4.1 Find the last successful run (`09-ship-run-*.md` with `status: complete`, most recent `created-at`) and read its `## Freshness Research`. 4.2 Diff the delta since that run and re-run web-research sub-agents only for areas that changed: **platform health** only on a deployment-target change or >30 days since the last run; **dependency security** only when `package.json`, `pyproject.toml`, `Cargo.toml`, or the equivalent changed since the last run's `head-sha-at-start`; **CI/CD config** only when `.github/workflows/*.yml` or related CI files changed. 4.3 With no prior successful run, run the full pass (all three). Merge findings into `## Freshness Research`.

## Step 5 — Go/No-Go

Skip if `go-nogo` is already set. Ask a gate question per [_gate-question.md](_gate-question.md), header "Go/No-Go", question "Based on readiness, dry-run, and freshness, what is the go/no-go decision?", options `Go` (proceed with merge and deployment; all checks pass), `Conditional go` (proceed with caveats, recorded below), `No-go` (do not merge; return to fix blockers). If `no-go`: set `status: complete`, `go-nogo: no-go`; skip steps 6–10; write the run artifact (step 13). The PR stays open.

## Step 6 — Merge (when `plan.ship-meaning` includes merging and go-nogo ≠ no-go)

Skip this step entirely when `branch-strategy ≠ dedicated`. Idempotency: `gh pr view <pr-number> --json state,mergeCommit,mergedAt`; if `state` is `MERGED`, set `merge-sha: <mergeCommit.oid>` and skip to step 7 (there is no `merged` boolean field on this endpoint; requesting it errors).
6.0 **Re-verify GitHub's own merge gate before attempting.** `gh pr view <pr-number> --json mergeable,mergeStateStatus`. `BLOCKED` (usually unresolved review threads under `required_conversation_resolution`) or `CONFLICTING` → STOP with the cause named and route back to handoff's thread-triage and rebase machinery.
6.1 Confirm with the user: "Ready to merge `<branch>` into `<base-branch>` using `<merge-strategy>` strategy. Proceed? (yes/no)"
6.2 Per `merge-strategy`: `rebase` → `gh pr merge <pr-number> --rebase`; `squash` → `--squash`; `merge` → `--merge`. If GitHub refuses the configured strategy despite a clean gate ("This branch can't be rebased": the rebase engine can refuse a long linear branch it cannot replay), do not silently switch strategy. Report the refusal, then offer the equivalent-outcome fallbacks explicitly: for `rebase` on an already-linear branch, a fast-forward push of `HEAD` to `<base-branch>` produces the identical history (GitHub auto-marks the PR merged); otherwise the other enabled merge methods with their history consequences named. Any fallback needs the user's explicit go.
6.3 Record `merge-sha: <git rev-parse HEAD on base-branch after merge>` and `merge-strategy: <strategy>`.

## Step 7 — Tag + release (when `plan.release-trigger == tag-on-main` and `ship-meaning != merge-only`)

Idempotency: if `git rev-parse "v<version>"` finds the tag, skip to step 8 with `release-tag: v<version>`. 7.1 Generate release notes: `git cliff --latest --strip header > /tmp/release-notes-<run-id>.md` (or the project's notes generator from the plan). 7.2 `gh release create v<version> --target <base-branch> --notes-file /tmp/release-notes-<run-id>.md`. 7.3 Record `release-tag: v<version>`.

## Step 8 — Release workflow watch (when `plan.release-workflow-file` is set)

Skip if `release-workflow-conclusion: success` is already set. 8.1 Locate the run: `gh run list --workflow=<plan.release-workflow-file> --branch=<base-branch> --limit 5 --json databaseId,event,headSha,status,conclusion`, filtered to the run whose `headSha` matches `merge-sha` (or the tag's commit). 8.2 `gh run watch <run-id>`. 8.3 Record `release-workflow-run-id: <id>` and `release-workflow-conclusion: <success | failure | cancelled>`.

8.4 **On failure:** match the failure log against `plan.recovery-playbooks[].triggers[]` (regex, case-insensitive). For matched playbooks, present each step as a gate question per [_gate-question.md](_gate-question.md) (`Apply this step?`). Record `recovery-actions-taken: [<playbook-id>, ...]`. Re-running step 8 after recovery is allowed. If no playbook matches: WARN and ask whether to abort or proceed manually.

## Step 9 — Post-publish polling loop (when `plan.post-publish-checks` is non-empty)

Each check has its own `status` (`pass | fail | skip | pending`); resume from the last `pending` check and never re-poll `pass`, `fail`, or `skip`. 9.1 For each check not yet `pass`: substitute env vars (`$VERSION`, `$PACKAGE`, `$IMAGE`, `$GROUP`, `$ARTIFACT`, `$NAMESPACE`, `$DEPLOYMENT`, `$HOST`) from run state; execute `cmd`; compare against `expect`; record `{ kind, status, observed-at, evidence }`. **A check that did not actually run records `skip`, never `pass`**, regardless of exit code: a smoke script that exits 0 printing "…not set — skipping" is a skip; a check not applicable to this ship is a skip with the reason in `evidence`. `pass` requires positive evidence of the checked behavior, and skips are listed distinctly in the ship summary. 9.2 Loop with `plan.poll-interval-seconds` between iterations, bounded by `plan.propagation-window-max-minutes`. 9.3 All checks `pass` → done; bound exceeded → set `status: awaiting-input` with the still-pending checks listed and stop; the next invocation resumes polling.

## Step 10 — Post-release version bump (when `plan.post-release-version != none`)

Skip each `version-source-of-truth` file already at the post-release version. 10.1 Compute the next dev version per `plan.post-release-version-cmd`. 10.2 Apply it to every `version-source-of-truth` file and commit `git commit -am "build: bump to <next-dev-version>"`.
10.3 Push: `git push origin <base-branch>`, **gated exactly like the Step 6 merge**: pushing to the base branch is an irreversible external action, so it requires the user's go. Consume the answer from Step 0.9's `prefetched-answers:`; ask here only when that round did not run or a pre-flight outcome invalidated the answer. On the go, push and record `post-release-bump-sha: <git rev-parse HEAD>`.

## Steps 11–14 — Index, routing, artifact, announce

11. **Update `09-ship-runs.md`** (schema in [ship/_run-artifact.md](ship/_run-artifact.md)). Batch mode: the lead slug's index gets the real run row; each follower's index gets a pointer row with `shipped-via: <lead>/09-ship-run-<run-id>.md` (same run-id, no duplicate artifact).
12. **Adaptive routing.** Write ALL viable options into the run artifact's `## Recommended Next Stage` and update `00-index.md` (`current-stage`, `recommended-next-command`, `recommended-next-invocation`).
13. **Write `09-ship-run-<run-id>.md`** per [ship/_run-artifact.md](ship/_run-artifact.md), then its Step Z sibling `.yaml` and `.html.fragment` (managed-artifact enforcement blocks the `.md` write when the sibling `.yaml` is missing). A run paused before the Go/No-Go gate is representable; record it honestly: a ship at STOP after pre-flight or dry-run (awaiting a user decision, resumable) writes `status: awaiting-input` with `go-nogo: pending`, never `no-go`, which is a decision the gate never reached. `release-workflow-conclusion: ""` likewise means not-reached. In `00-index.md`, a paused ship is `progress.ship: in-progress`.
14. **Announce.** Only when `go-nogo` is `go` or `conditional-go`. Load `ship/announce.md` and run it for `<slug>` (the lead in batch mode): it drafts audience- and channel-tailored announcements from the run artifact, writes `announce.md`, and stamps `announcements-sent` onto the run; in batch mode the announcement covers the whole branch. The phase is interactive; if the user declines or defers comms, note it and move on. To regenerate comms later without re-shipping, run `/wf ship <slug> announce` (the step 0.1.5 shortcut).

# Adaptive routing

Present ALL viable options and write them into `## Recommended Next Stage`:
- **Option A (default): Retro** → `/wf retro <slug>` when `status: complete` and `go-nogo` is `go` or `conditional-go`.
- **Option B: Fix and re-implement** → `/wf implement <slug> <selected-slice>` when ship found blockers requiring code changes, the rebase had conflicts, or a recovery playbook required code-side fixes.
- **Option C: Re-verify** → `/wf verify <slug> <selected-slice>` when the freshness delta surfaced new CVEs verify did not see.
- **Option D: Resume the paused run** → `/wf ship <slug>` when `status: awaiting-input` (answers missing, poll bound exceeded, or a recovery playbook incomplete).
- **Option E: Roll back** → `/wf ship <slug> rollback [<run-id>]` when post-publish checks failed or a shipped release must be reversed. The rollback phase (`ship/rollback.md`) authors a reversal runbook (each step marked reversible or irreversible; irreversible steps surface as mitigations), gates on an explicit Go/No-Go, executes, verifies the prior state via `rollback-verify-cmd`, and writes `09-rollback-<run-id>.md`, stamping this run `rolled-back: true` and `rollback-artifact`. For in-flight emergencies during post-publish polling, Block F recovery playbooks apply first.
