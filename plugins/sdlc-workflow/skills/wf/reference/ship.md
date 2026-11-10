---
description: The last mile. Run the PR phase (the handoff package, the PR and the CI watch), then a release by the project's `.ai/ship-plan.md`. Reads the plan, makes a run-id, and walks the idempotent 13-step run sequence (pre-flight → publish dry-run → rollout → freshness delta → go/no-go → merge → tag → workflow watch → post-publish poll → post-release bump → index update → run artifact). A run that stopped part way resumes at the step that failed. A `pr#N` or branch first argument ships every slug on the branch as one run, all or nothing. Refuses to start unless readiness is `ready`.
argument-hint: <slug|pr#N|branch> [environment|announce|rollback] [<run-id>]
---

You are running `/wf ship`, stage 8 of 9: 1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → `8·ship` → 9·retro.

Ship runs in three parts, in one run: the PR phase ([handoff.md](handoff.md)) packages the work, opens the PR and watches CI; the go/no-go gate (Step 5) waits for the person; then ship merges and releases by the ship plan. A second `/wf ship` call resumes at the gate. `<wf>` below is `node "<skill-dir>/scripts/wf.mjs"`.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). The PR phase writes `08-handoff.md`; the gate needs its `readiness-verdict: ready` (single slug) or `pr-readiness-verdict: ready` (batch). |
| Produces | `08-handoff.md` (the PR phase), `09-ship-run-<run-id>.md` (one per release, on the lead slug), and a refreshed `09-ship-runs.md` for each roster slug (a follower carries a `shipped-via` pointer). An old `09-ship.md` is read-only. The schemas are in [ship/_run-artifact.md](ship/_run-artifact.md). |
| Next | `/wf retro <slug>` (go) or `/wf implement <slug> <slice>` (blockers) |

## Card

- Run the PR phase first ([handoff.md](handoff.md)). Its fingerprint guard makes an unchanged, ready package a no-op.
- Follow `.ai/ship-plan.md` as a contract. Do not edit it. To change the plan, the person runs `/wf project ship-plan edit`.
- Each step can run again. A step that is already done is a no-op and a note, never a second side effect.
- Do not fix code. When a blocker needs a code change, route to `/wf implement <slug> <slice>`.
- Do not ship while a runtime-evidence deferral is open.

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `/.ai/ship-plan.md` | artifact | if-present | |
| `00-index.md` | artifact | always | |
| `08-handoff.md` | artifact | always | |
| `findings.yaml` | artifact | always | |
| `decisions.yaml` | artifact | if-present | |
| `09-ship-run-*.md` | artifact | on-resume | |
| `_ship-plan-readiness.md` | procedure | always | |
| `ship/_run-artifact.md` | procedure | always | |
| `ship/announce.md` | procedure | mode:announce | |
| `ship/rollback.md` | procedure | mode:rollback | |
| `09-ship-run-*.md` | writes | | |

Read only the frontmatter of `08-handoff.md` and of each review master.

# Workflow rules

Apply [_workflow-rules.md](_workflow-rules.md), and these rules of ship:
- The run artifacts live under `<wf-dir>/`; `09-ship-runs.md` is the run index of the workflow. The ship plan is `.ai/ship-plan.md` at the repo root, not under `.ai/workflows/`: one plan serves the whole project.
- When a step cannot finish, set `status: awaiting-input`, record what blocks it, and stop. The next invocation resumes there.
- Each step checks its done state first: pre-flight is a no-op when the version is applied, the merge when the PR is merged, the tag when the tag exists; polling resumes from the last `pending` check.
- A `09-ship.md` of an old workflow is read-only history. The next release writes a `09-ship-run-<run-id>.md`.

# Step 0 — Orient

1. **Resolve the first positional** (a slug, `pr#N`, a branch name, or none) with `<wf> target "<root>" <arg> --json`, as the PR phase does ([handoff.md](handoff.md) Step 0): `scope: slug` is a single-slug ship, `ship-scope: slug`; `scope: branch` is a batch ship, `ship-scope: branch`; with `ambiguous: true`, ask which of its `slugs`; on an `error`, stop and show it. The roster (`branch-slugs`) is the `slugs` of the output. The lead is the `handoff-lead:` that the PR phase recorded, else the first roster slug in alphabetical order. The lead owns the one `09-ship-run-<run-id>.md`; each follower gets a `shipped-via` pointer. In batch mode the shortcuts `announce` and `rollback` act on the lead's run: one run per branch.
1.5. **The announce shortcut.** When the second positional is exactly `announce`, load [ship/announce.md](ship/announce.md), run only the announce phase for `<slug>`, and stop. Do not run the run sequence.
1.6. **The rollback shortcut.** When the second positional is exactly `rollback`, load [ship/rollback.md](ship/rollback.md), run only that phase for `<slug>`, and stop. Do not run the run sequence. The optional third positional is `<run-id>`; the default is the latest run in `09-ship-runs.md` with `status: complete` and a `go-nogo` that is not `no-go`. The rollback phase refuses a paused (`awaiting-input`) run.
1.7. **The merge facts.** Run `<wf> ship facts "<root>" --base <base-branch> --json`, with the `base-branch` of the index. It reads the rulesets, the branch protection and the merge methods of the repo:
   - `method` is the default method of Step 6: the plan's method when the repo allows it, else the first allowed of `merge`, `rebase` and `squash`.
   - `allowed` lists the methods that the person can pick instead.
   - `deleteBranchOnMerge: true`: GitHub deletes the remote branch at the merge, whatever ship does.
   - `direct: false`: a required review or a merge queue is in the way, so Step 6 gives the person the one command.
   - `planMethodAllowed: false`: the plan merges by a method that the repo refuses; item 4 reports it as a gap.
2. **The plan is the person's.** Ship never writes `.ai/ship-plan.md`. To author it, the person runs `/wf project ship-plan init [--from-template <kind>]`.
3. **Resolve the environment**: the optional second positional `staging` or `production` overrides the plan's default; otherwise use the first entry of `ship-plan.ship-environments[]` when the plan exists.
4. **The scripted gaps, with no plan gate.** Run Step R0 of [_ship-plan-readiness.md](_ship-plan-readiness.md) with the no-plan gap left out: `<wf> ship ready "<root>" <slug> --allow-no-plan` (the `allowNoPlan` option of `readyGaps`). Every other gap is a gate: stop with the gap and its person task. A missing plan is not a gap here. The PR phase (item 6) runs the plan gates once, in its Step 0 item 6.7: the missing-plan gate, with *Shipping is external*, and the plan-drift gate. A missing plan routes to `/wf project ship-plan init --from-template <kotlin-maven-central | npm-public | pypi | container-image | server-deploy | library-internal>`.
5. **Read `00-index.md`** of each roster slug with `<wf> record get "<root>" <slug> index`: `current-stage`, `status`, `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `augmentations:` and `handoff-lead:`. In batch mode the roster shares one branch and one PR, so these fields must agree; when they differ, stop and report it.
6. **The PR phase, then the readiness gate, all or nothing across the roster.** Ship acts on one PR: every roster slug ships, or none does.
   - **A resumed run first.** Run the resume detection of item 8 now, before the PR phase. A resumed run that already has `merge-sha` is merged, and `ship finish` may have deleted the branch: skip the PR phase, the readiness gate, item 6.5 and the questions of item 9 (the run holds their answers), keep its `run-id`, and continue at its first step with an empty evidence field (Step 7 or later). A resumed run that has `merge-strategy` and no `merge-sha` stopped at the merge of 6.2: skip the same parts, and continue at Step 6. Its first check finds a PR that the person or a merge queue merged since; the PR phase would stop on that PR as a merged one.
   - **The PR phase.** Load [handoff.md](handoff.md) and run it now, in this run, with the same first positional. Its fingerprint guard (handoff Step 0, item 6) skips the packaging of an unchanged range; when the stored verdict is not `ready`, the CI watch and the readiness check still run again. Then read `08-handoff.md` again with `<wf> record get "<root>" <slug> 08-handoff.md` (in batch mode, the lead's: `record get "<root>" <lead> 08-handoff.md`).
   - **The readiness gate.** Read `readiness-verdict` (single slug), or `pr-readiness-verdict` of the lead (batch: the AND over the branch):

     | Verdict | Do |
     |---|---|
     | `ready` | Go on. |
     | `not-applicable` | The PR phase recorded no `pr-number` (`branch-strategy: none`, or `shared` with no PR), so there is no PR to merge. Stop, write no run artifact, and run `record set "<root>" <slug> index next-command=retro "next-invocation=/wf retro <slug>"`. |
     | missing or another value, single slug | Stop with the receipt of the PR phase: "The PR is not ready: readiness-verdict is `<verdict>`. Resolve the blockers above, then type `/wf ship <slug>`." |
     | another value, batch | Stop, and print the roster report (which slugs are ready, from the lead's `branch-slugs` and the state of each slug). Say: "Ship is all-or-nothing per PR. `pr-readiness-verdict` is `<verdict>` — bring every slug ready first: `/wf ship pr#N`." Do not ship the ready subset. |
   - Parse `pr-url`, `pr-number`, `branch`, `base-branch` and `has-deferred-comments` from the lead's handoff. When `has-deferred-comments` is `true`, warn the person before you go on.
   - **The plan verdict.** Parse `ship-plan-readiness` from the lead's handoff. When this run wrote or re-checked `08-handoff.md` (the fingerprint guard did not skip it), that stamp is the readiness stamp of this run: use it, and do not run the plan gates a second time. When the stamp is from an earlier run, run Steps R1 to R4 of [_ship-plan-readiness.md](_ship-plan-readiness.md) now, with caller `ship` and the release HEAD as the commit range. One exception: a stamp `not-applicable` stands while `.ai/ship-plan.md` is still missing, because the person chose it.
   - **`not-applicable`: stop after the PR is ready.** The work ships outside `/wf ship`. Write no run artifact. Run `record set "<root>" <slug> index next-command=retro "next-invocation=/wf retro <slug>"`, and tell the person: "The PR is ready. Shipping is external: merge and release it by the process of the repo, then type `/wf retro <slug>`."
   - **`missing`, `drift` or a cancel: stop** before the run sequence. Only `ok`, `acknowledged` and `amended-inline` go on. Stamp the verdict into the run artifact (Step 13). Parse blocks A–G of `.ai/ship-plan.md` into memory; on `amended-inline`, parse the plan after the amendment.
6.5. **The runtime-evidence deferral gate.** Parse `runtime-evidence-deferrals` from the index of every roster slug (absent is empty). An entry is open when it has `cleared-by: null` and no `ship-override-authorization`. One open entry on any roster slug blocks the whole run: stop with "Ship is blocked: <N> open runtime-evidence deferral(s). The following slices passed verify only because runtime evidence was deferred; ship requires evidence: <slice-slug>: <reason> (deferred-at: <iso>) … Clear each deferral by (a) running `/wf probe <slug> <target-matching-the-deferred-AC>` (probe sets `cleared-by` to its descriptor when the evidence matches), (b) re-running `/wf verify <slug> <slice-slug>` in an environment that supports the interactive checks, or (c) recording an explicit risk acceptance of the person as `ship-override-authorization: {by, at, reason}` on the entry, for genuinely deploy-time-circular cases only."
   - `cleared-by` holds evidence only: a probe or evidence descriptor that proves that the AC was observed. A risk acceptance goes in `ship-override-authorization`, and the ship summary lists it as an explicit override.
   - A deferral with several ACs may log partial progress in `cleared-acs: [...]` while `cleared-by` stays null.
7. **The release-notes inputs.** Take the open findings from `<wf> findings list "<root>" <slug> --open`, and what review fixed from `metric-findings-fixed` in the frontmatter of each review master. Give every `augmentations:` entry a changelog entry in the user's words. List every `carried` intent-risk (RIM) entry of each roster slug distinctly in the ship summary.
8. **Resume detection.** Item 6 runs this item before the PR phase; ask its question once. Run `<wf> record list "<root>" <slug>`, and read each `09-ship-run-<run-id>.md` with `record get`. For each run with `status: awaiting-input`, ask a gate question per [_gate-question.md](_gate-question.md), header "Prior run", with the options `Resume <run-id> (Recommended)` (continue from the step that failed), `Start fresh` (a new run-id; the prior run stays paused) and `Mark prior as failed and start fresh`.
   - On resume, load that run's frontmatter, and go to its first step with an empty evidence field.
   - On a fresh start, leave the prior run as it is, or set it failed with `<wf> record set "<root>" <slug> 09-ship-run-<run-id>.md status=failed` per [_records.md](_records.md). Then make a new `run-id`.
9. **Ask the load-bearing questions now, in one round, before the run sequence starts**: once Step 1 begins, the run holds open until it finishes or pauses on purpose. Show the default of each, and ask only for a confirmation or an override:

   | Question | The default comes from | The step that uses it |
   |---|---|---|
   | Scope: which slugs and PR ship in this run | the roster of item 1 | the whole run |
   | Version: the computed bump, confirmed | `plan.version-bump-rule` and the commit log | Step 1.2 |
   | Rollout strategy | `plan.rollout-strategy` | Step 3.1 |
   | Release window: timing, blackout, on-call | free text | Step 3.2 |
   | Stakeholder and compliance overrides | the sign-off list of the plan | Step 3.3 |
   | Post-release base push: go or no-go for `git push origin <base-branch>`, asked only when `plan.post-release-version` is not `none` | `plan.post-release-version` | Step 10.3 |

   Record every answer with `decide add --stage ship` per [_decisions.md](_decisions.md), with the `run-id` in the answer text, and stamp the answers into the frontmatter of the run as `prefetched-answers:`. Steps 1.2, 3.1–3.3 and 10.3 use these answers and do not ask again. These questions stay at their steps, because each one is about something that has happened by then: the Go/No-Go after pre-flight and CI (Step 5), the merge question (Step 6.1), a fallback after a failed merge (Step 6.2), and each recovery-playbook step after a failure of Step 8.
9b. **Make the `run-id`**: UTC compact ISO 8601, `<yyyymmdd>T<hhmm>Z`, from the real time per [_timestamp.md](_timestamp.md). It is the file-name suffix and the `run-id` field; in batch mode one run-id covers the whole branch.
10. **Carry forward** `open-questions` from the index (in batch mode, the union across the roster).

# Batch ship (scope: branch)

The run sequence acts on the shared branch and PR, so it runs once per branch, owned by the lead slug, never once per slug. Write the one `09-ship-run-<run-id>.md` under the lead slug, with `ship-scope: branch` and `branch-slugs: [...]`.
- The changelog and the release notes (item 7 and `augmentations:`) cover every roster slug.
- The announce phase (Step 14) covers the branch.
- A rollback resolves through the lead.
- Each follower gets a pointer row in its own `09-ship-runs.md`: `shipped-via: <lead>/09-ship-run-<run-id>.md`. Its `00-index.md` moves to shipped: `ship finish` (Step 6.4) marks every slug of the lead's `branch-slugs` that is on the branch.

# Chat return contract

After you write the files, return per [_chat-return.md](_chat-return.md): lead with the narrative (section *The narrative* of that file), then give this receipt:
- `slug: <slug>`
- `run-id: <run-id>`
- `wrote: <path>`
- `status: <complete | awaiting-input | failed | rolled-back>`
- `options:` (every viable next option, per Adaptive routing)
- up to 3 short blocker bullets, when there are blockers

# The 13-step run sequence

Each step can run again on its own: detect the done state before you make the side effect.

## Step 1 — Pre-flight

1.1 **The branch and the tree.** Check that you are on `<branch>`, and that `git status --porcelain` is empty. When the tree is dirty, sort each dirty path into a class, and stop only on a path that needs the person:

   | Dirty path | Do |
   |---|---|
   | A file that the plugin seeded: a `CLAUDE.md` whose diff lies entirely inside the `<!-- sdlc:wf-rules-import -->` fence, an untracked `AGENTS.md` that holds only the `<!-- sdlc:wf-rules -->` fence, or `.ai/.wf-rules-seeded` | The memory seed wrote these; check by the diff that nothing lies outside the fences. Ask a gate question per [_gate-question.md](_gate-question.md): commit as `chore(sdlc): seed wf rules` (Recommended), or gitignore the marker file. Do not just tell the person to commit or stash. |
   | The `.ai/` bookkeeping of the workflow | Follow the `artifactTracking` setting of `.ai/sdlc-config.json` (see `/wf project ship-plan init`). `tracked`: offer to commit the bookkeeping now as `chore(sdlc): workflow artifacts`. `ignored`: these paths should not be dirty; report the policy breach (likely a missing `.gitignore` block), and do not commit. Not set: ask once for this run, and write the answer (`tracked` or `ignored`) under `artifactTracking` in `.ai/sdlc-config.json`, as `ship-plan init` Step 3.5 does. |
   | The output of `ship-plan build`: a file whose diff carries the `# Added by wf ship-plan build` provenance comment | Do not commit it silently. Offer: route it to a review slice first (Recommended; stop with the `/wf intake <slug> fix …` seed), or accept it as it is, recorded in `## Pre-flight` as `unreviewed-build-output-accepted` with the file list. |
   | Anything else | Stop, and ask the person to commit or stash it. An unknown path always fails closed. |

   When the tree is clean, or every path is resolved, record `branch` and `head-sha-at-start: <git rev-parse HEAD>`.

1.2 **The version**, by `plan.version-bump-rule`:

   | Rule | The version |
   |---|---|
   | `git-cliff` | The output of `plan.version-bump-cmd` (default `git cliff --bumped-version`). |
   | `conventional-commits` | The project's bump tooling, held in `plan.version-bump-cmd` (for example `npx changeset version` or `npm version`). |
   | `manual` | The version confirmed in the round of Step 0 item 9. When that round did not run (a resumed run from before it), ask a gate question per [_gate-question.md](_gate-question.md) with three bumps from the commit log: patch, minor and major. |
   | `fixed` | The output of `plan.version-bump-cmd` (for a deploy tagged by SHA, the short SHA). |
   | `changesets` or `release-please` | The tool's own workflow owns the version: read the version it made, and skip 1.3 and 1.5. |

   Check for a tag collision before the version is confirmed: `git tag -l "v<version>" "<version>"` returns nothing, and `gh release view` for the matching tag form returns 404. A hit means that the release identity of the branch is stale: stop, name the collision, and route to the bump decision rather than release an existing identity again. The answer of Step 0 item 9 confirms the version; when that round did not run, confirm it with the person before you apply it. Record `version` and `prior-version: <git describe --tags --abbrev=0 || echo "none">`.

1.3 **Apply the version** to every `version-source-of-truth` file. Read each file first, and skip it when it already holds `version`. When a file changed, stage each file that this step changed by its path, `git add -- <file> ...`, then commit with `git commit -m "build: bump version to <version>"`.

1.4 **Check the required secrets.** For each entry of `plan.ci-pipeline.required-secrets[]`, read its `updatedAt` with `gh secret list --json name,updatedAt --jq '.[] | select(.name=="<NAME>") | .updatedAt'` (gh's own `--jq`; no `jq` or `grep` is needed). An empty output means that the secret does not exist. When `(now - updatedAt).days` is above `plan.ci-pipeline.secrets-staleness-threshold-days`, warn the person; the person may go on, and the run records the warning.

1.5 **Regenerate the changelog** by `plan.version-bump-rule`. Skip it when the changelog already holds `<version>`. For `git-cliff`, look for a `cliff.toml` first: with no repo config, `git cliff --output CHANGELOG.md` replaces the whole file with a default-format commit dump. With no `cliff.toml` and an existing curated CHANGELOG, prepend an entry in the file's own style instead of regenerating the file; `git cliff --unreleased --strip header` is safe input for the draft. Then stage the changelog by its path, `git add -- <changelog-file>`, and commit with `git commit -m "docs: update changelog for <version>"`. Record `pre-flight-status: pass`, or `warn` with the reasons when a secret was stale.

1.6 **Push the release commits.** The PR phase pushed the branch before 1.3 and 1.5, so the merge of Step 6 would leave their commits out. Skip this item when `branch-strategy` is `none`.
   - Run `git fetch origin <branch>` and `git rev-list --count origin/<branch>..<branch>`. When the count is `0` and `release-commits-sha` is empty, 1.3 and 1.5 made no commit: record `release-commits-ci: skipped` and go on.
   - When the count is not `0`, run `git push origin <branch>` (never a force push), and record `release-commits-sha: <git rev-parse <branch>>`.
   - With a `pr-number`, and when `release-commits-ci` is not `green`, watch CI on the PR again with the `# CI watch procedure` of [_pr-ci-handoff.md](handoff/_pr-ci-handoff.md), as T5.3 of the PR phase does. The pushed commits start CI again, so do not reuse the result of the PR phase. Record `release-commits-ci: <green | red | timed-out>`.
   - green: go on. timed-out: set `status: awaiting-input`, list the pending checks, and stop; the next `/wf ship <slug>` resumes here and does not push again. red: set `status: awaiting-input` and stop with the failing checks, because the Go/No-Go of Step 5 needs green CI. Do not fix code here.

## Step 2 — Publish dry-run (when `plan.ci-pipeline.publish-dry-run-cmd` is set)

When the plan has no `ci-pipeline.publish-dry-run-cmd`, set `publish-dry-run-passed: skipped` and go to Step 3. Step 2 is always safe to run again.

2.1 Run `plan.ci-pipeline.publish-dry-run-cmd`, and capture stdout and stderr.

2.2 Check the post-conditions of the artifact by `ship-meaning`:

   | `ship-meaning` | Post-condition |
   |---|---|
   | `publish` (Maven Central, Sonatype) | The POM has groupId, artifactId, version, name, description, url, licenses, developers and scm, and the `.asc` signature files exist. |
   | `publish` (npm) | `package.json` has `name`, `version`, `repository` and `license`, and `npm pkg fix --dry-run` finds no manifest issue. |
   | `publish` (pypi) | `twine check dist/*` passes. |
   | `publish` (container-image) | `docker manifest inspect` returns a multi-arch list when one is expected. |
   | `merge-only`, `deploy-*` | No manifest check: the build command succeeded. |

2.3 Record `publish-dry-run-passed: true`. On a failed post-condition, record `false` with the post-condition, set `status: awaiting-input`, and stop.

## Step 3 — Rollout questions (per run, never asked again)

Skip this step when `go-nogo`, `rollout-strategy` and `merge-strategy` are already set. 3.1–3.3 use the `prefetched-answers:` of Step 0 item 9. Ask here only when that round did not run (a run resumed from before it), or a pre-flight result made an answer wrong, and then only that one.

3.1 **The rollout strategy.** The default is `plan.rollout-strategy`. The fallback is a single-select gate question per [_gate-question.md](_gate-question.md), header "Rollout", question "Confirm rollout strategy for this release?", with options built from the plan and an "Override" choice.

3.2 **The release window** (free text): timing, blackout windows, on-call coverage.

3.3 **The stakeholder and compliance overrides of this run** (free text): a sign-off beyond the plan's list? Record every answer with `decide add --stage ship` per [_decisions.md](_decisions.md), with the `run-id` in the answer text.

## Step 4 — Freshness pass, delta only

Step 4 only reads, so it is safe to run again.

4.1 Find the last successful run: of the `09-ship-run-*.md` records (`record list`, then `record get`), the latest `created-at` with `status: complete` and a `go-nogo` that is not `no-go`. Read its `## Freshness research delta`.

4.2 Run web-research sub-agents again only for the areas that changed since that run:
   - platform health: only on a change of the deployment target, or when the last run is more than 30 days old;
   - dependency security: only when `package.json`, `pyproject.toml`, `Cargo.toml` or the equivalent changed since the `head-sha-at-start` of the last run;
   - CI/CD config: only when `.github/workflows/*.yml` or other CI files changed.

4.3 With no prior successful run, run all three. Merge the findings into `## Freshness research delta`.

## Step 5 — Go/No-Go

Skip this step when `go-nogo` is already set. Ask a gate question per [_gate-question.md](_gate-question.md), header "Go/No-Go", question "Based on readiness, dry-run, and freshness, what is the go/no-go decision?", with the options `Go` (proceed with merge and deployment; all checks pass), `Conditional go` (proceed with caveats, recorded below) and `No-go` (do not merge; return to fix blockers). On `no-go`, set `status: complete` and `go-nogo: no-go`, skip Steps 6–10, and write the run artifact (Step 13). The PR stays open.

## Step 6 — Merge (when `plan.ship-meaning` includes merging and `go-nogo` is not `no-go`)

Skip this step when `branch-strategy` is not `dedicated`. First check whether the PR is merged: `gh pr view <pr-number> --json state,mergeCommit,mergedAt`. When `state` is `MERGED`, set `merge-sha` to its `mergeCommit.oid`, and go to 6.4: the person or a merge queue merged it, and the local end is still open. On this path, when `branch-after-merge` is not set, run 6.4 with `--keep-branch` and say that the branch stays, because nobody chose to delete it. This endpoint has no `merged` field; asking for one is an error.

6.0 **Check GitHub's own merge gate first**: `gh pr view <pr-number> --json mergeable,mergeStateStatus`. On `BLOCKED` (usually unresolved review threads under `required_conversation_resolution`) or `CONFLICTING`, stop, name the cause, and route back to the thread triage and the rebase of the PR phase.

6.1 **How to merge.** Skip this item when `merge-strategy` and `branch-after-merge` are already set. The question has the standing-answer key `ship-merge`, so follow "Standing answers" of [_gate-question.md](_gate-question.md) before you ask:
   - **A live answer of this workflow.** When `<wf> decide answered "<root>" <slug> --key ship-merge` exits 0, use that answer and do not ask.
   - **A standing answer.** Otherwise run `<wf> standing check "<root>" ship-merge`. When it exits 0, use the method and the branch choice of the standing answer, and do not ask. Record it with `decide add --key ship-merge --kind answer --stage ship --by "standing rule"`, and report it to the person in one chat line, as that section says.
   - When the method of the answer is not in `allowed` of Step 0 item 1.7, the answer cannot apply: ask the question, and say why.
   - **Otherwise ask** a gate question per [_gate-question.md](_gate-question.md), header "Merge", question "How should `<branch>` merge into `<base-branch>`, and what happens to `<branch>` after?". The options: first `method` of Step 0 item 1.7 with the branch deleted here and on GitHub (Recommended); then the same method with the branch kept; then each other method of `allowed`, with the branch deleted. When `deleteBranchOnMerge` is `true`, the keep option says that GitHub still deletes the remote branch and only the local branch stays. The Go/No-Go answer does not answer this question: ask it even after a Go. Record the answer with `decide add --key ship-merge --stage ship`, then make the standing-answer offer of that section.

   Set `merge-strategy: <method>`, one of `merge`, `rebase` and `squash`, and `branch-after-merge: <delete | keep>` in the run artifact.

6.2 **Merge.** Run `<wf> ship merge "<root>" <slug> --method <merge-strategy>`. It merges by that method and never deletes the branch.
   - Exit 3: it printed the one command that merges the PR, because a review is required or a merge queue merges it. Give the person that command, set `status: awaiting-input`, and stop. The next `/wf ship <slug>` resumes here.
   - A stacked list ([campaign.md](campaign.md), "Ship") merges its stack with `gh stack merge <top pr-number> --yes --<method>`. That merge is all or nothing over every layer below the top.
   - When GitHub refuses the method despite a clean gate ("This branch can't be rebased"), do not switch silently. Report the refusal, and offer the fallbacks: for `rebase` on a linear branch, a fast-forward push of `HEAD` to `<base-branch>` gives the same history, and GitHub marks the PR merged; otherwise another enabled method, with its effect on the history named. Each fallback needs the person's explicit go.
   - Another failure: follow the failure rule of [_host-invocation.md](_host-invocation.md).

6.3 **Record `merge-sha`.** Run `gh pr view <pr-number> --json mergeCommit`, and record `merge-sha: <mergeCommit.oid>`. Read it from the PR, not from the local base: the local base moves to the merge only in 6.4.

6.4 **The local end.** Run `<wf> ship finish "<root>" <slug>`, with `--keep-branch` when `branch-after-merge` is `keep`. It checks that the PR is merged, fast-forwards the local base, switches to it, deletes the branch here and on the remote when GitHub did not (with `--keep-branch`, neither), and marks each roster slug `shipped`, with `/wf retro <slug>` next. When it prints `not finished`, show the reason; the base and the branch stay as they are.

## Step 7 — Tag + release (when `plan.ci-pipeline.release-trigger == tag-on-main`, `ship-meaning != merge-only`, and `merge-sha` is set)

Tag only merged work. When `branch-strategy` is not `dedicated`, Step 6 did not run: when a `pr-number` is recorded and `gh pr view <pr-number> --json state,mergeCommit` gives `MERGED`, set `merge-sha` to its `mergeCommit.oid`. With no `merge-sha`, skip Steps 7 and 8, and say that the work is not merged yet.

When `git rev-parse "v<version>"` finds the tag, record `release-tag: v<version>` and go to Step 8.

7.1 Write the release notes into a file in the system's temp folder (`node -p "require('os').tmpdir()"`; do not assume `/tmp`): `git cliff --latest --strip header > <tmp>/release-notes-<run-id>.md`, or the notes generator that the plan names.

7.2 Run `gh release create v<version> --target <base-branch> --notes-file <tmp>/release-notes-<run-id>.md`.

7.3 Record `release-tag: v<version>`.

## Step 8 — Release workflow watch (when `plan.ci-pipeline.release-workflow-file` is set)

Skip this step when `release-workflow-conclusion: success` is already set.

8.1 Find the run: `gh run list --workflow=<plan.ci-pipeline.release-workflow-file> --limit 10 --json databaseId,event,headSha,headBranch,status,conclusion`, and take the run whose `headSha` is the commit of the tag or `merge-sha`. Do not filter by `--branch`: a run that a tag push starts has the tag as its head branch.

8.2 Run `gh run watch <databaseId> --exit-status` (the `databaseId` of that workflow run, not the ship `run-id`), bounded by the `ci-watch` wait setting of the index ([_handoff-config.md](handoff/_handoff-config.md)). On the bound, set `status: awaiting-input` and stop; the next `/wf ship <slug>` resumes the watch.

8.3 Record `release-workflow-run-id: <id>` and `release-workflow-conclusion: <success | failure | cancelled>`.

8.4 **On a failure**, match the failure log against `plan.recovery-playbooks[].triggers[]` (regex, case-insensitive). Ask each step of a matched playbook as a gate question per [_gate-question.md](_gate-question.md) ("Apply this step?"). Record `recovery-actions-taken: [<playbook-id>, ...]`. Step 8 may run again after the recovery. When no playbook matches, warn the person, and ask whether to abort or to go on by hand.

## Step 9 — Post-publish polling loop (when `plan.post-publish-checks` is non-empty)

Each check has its own `status`: `pass`, `fail`, `skip` or `pending`. Resume from the last `pending` check, and do not poll a `pass`, `fail` or `skip` check again.

9.1 For each check that is not yet `pass`, fill in the variables from the run state: `$VERSION`, `$PACKAGE`, `$IMAGE`, `$GROUP`, `$ARTIFACT`, `$NAMESPACE`, `$DEPLOYMENT`, `$HOST`, and `$SHA`, the short form of `merge-sha`. Run `cmd`, compare the result with `expect`, and record `{ kind, status, observed-at, evidence }`.
   - A check that did not run records `skip`, never `pass`, whatever its exit code: a smoke script that exits 0 and prints "…not set — skipping" is a skip, and so is a check that does not apply to this ship, with the reason in `evidence`.
   - `pass` needs positive evidence of the checked behaviour. The ship summary lists the skips on their own.

9.2 Loop with `plan.poll-interval-seconds` between the passes, bounded by `plan.propagation-window-max-minutes`.

9.3 When every check is `pass`, the step is done. When the bound runs out, set `status: awaiting-input`, list the pending checks, and stop; the next invocation resumes the polling.

## Step 10 — Post-release version bump (when `plan.post-release-version != none`)

Skip each `version-source-of-truth` file that already holds the post-release version.

10.1 Compute the next development version with `plan.post-release-version-cmd`.

10.2 Apply it to every `version-source-of-truth` file. Stage each file that this step changed by its path, `git add -- <file> ...`, then commit with `git commit -m "build: bump to <next-dev-version>"`.

10.3 **Push** with `git push origin <base-branch>`, gated like the merge of Step 6: a push to the base branch cannot be taken back, so it needs the person's go. Use `prefetched-answers.post-release-push` of Step 0 item 9, and push only on `go`. Ask here only when that round did not run, or a pre-flight result made the answer wrong. After the push, record `post-release-bump-sha: <git rev-parse HEAD>`.

## Steps 11–14 — Index, routing, artifact, announce

11. **Update `09-ship-runs.md`** (the schema is in [ship/_run-artifact.md](ship/_run-artifact.md)): get the record, add the row, write its draft and put it. In batch mode the lead slug's run index gets the real run row, and each follower's run index gets a pointer row with `shipped-via: <lead>/09-ship-run-<run-id>.md`: the same run-id, and no second run artifact.
12. **Adaptive routing.** Write every viable option into the `recommended-routes` frontmatter of the run artifact, and update the index: `<wf> record set "<root>" <slug> index current-stage=<stage> next-command=<command> next-invocation=<invocation>`.
13. **Write the draft of `09-ship-run-<run-id>.md`** per [ship/_run-artifact.md](ship/_run-artifact.md), and run `<wf> record put "<root>" <slug>`. Record a paused run as it is: a ship that stopped after pre-flight or the dry-run, waiting for the person and able to resume, writes `status: awaiting-input` with `go-nogo: pending`, never `no-go`, a decision that the gate did not reach. In the same way, `release-workflow-conclusion: ""` means not reached. For a paused ship, run `record set "<root>" <slug> index progress.ship=in-progress "next-invocation=/wf ship <slug>"`.
14. **Announce**, only when `go-nogo` is `go` or `conditional-go`. Load [ship/announce.md](ship/announce.md) and run it for `<slug>` (the lead in batch mode). It drafts announcements for each audience and channel from the run artifact, writes `announce.md`, and stamps `announcements-sent` onto the run; in batch mode it covers the whole branch. The phase asks the person; when the person declines or defers the comms, note it and go on. To write the comms again later without shipping again, the person runs `/wf ship <slug> announce` (the shortcut of Step 0 item 1.5).

# Adaptive routing

Offer every option that applies, and write them into `recommended-routes`:
- **Option A (default): retro**, `/wf retro <slug>`, when `status: complete` and `go-nogo` is `go` or `conditional-go`.
- **Option B: fix and implement again**, `/wf implement <slug> <selected-slice>`, when ship found blockers that need code changes, the rebase had conflicts, or a recovery playbook needed fixes in the code.
- **Option C: verify again**, `/wf verify <slug> <selected-slice>`, when the freshness delta found new CVEs that verify did not see.
- **Option D: resume the paused run**, `/wf ship <slug>`, when `status: awaiting-input` (answers missing, the poll bound reached, or a recovery playbook not finished).
- **Option E: roll back**, `/wf ship <slug> rollback [<run-id>]`, when the post-publish checks failed or a shipped release must be reversed. The rollback phase ([ship/rollback.md](ship/rollback.md)) writes a reversal runbook (each step reversible or irreversible; an irreversible step shows its mitigation), gates on an explicit Go/No-Go, runs it, checks the prior state with `rollback-verify-cmd`, and writes `09-rollback-<run-id>.md`, stamping this run `rolled-back: true` and `rollback-artifact`. For an emergency during the post-publish polling, the recovery playbooks of Block F apply first.
