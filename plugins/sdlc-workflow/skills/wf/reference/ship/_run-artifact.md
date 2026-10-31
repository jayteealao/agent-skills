# Ship run artifacts

`ship.md` Steps 11 and 13 write these records. Write the draft `<wf-dir>/.draft/<name>`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](../_records.md). Frontmatter is the source of truth; every body table is regenerated from it.

## `09-ship-run-<run-id>.md` (Step 13)

```yaml
---
schema: sdlc/v1
type: ship-run
slug: <slug>                # the LEAD slug in batch mode
run-id: "<YYYYMMDDTHHMMZ>"
status: <complete | awaiting-input | failed | rolled-back>
plan-ref: ../../ship-plan.md
plan-version-at-run: <integer copied from plan at run-start>
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
ship-scope: <slug | branch>          # branch = one atomic run for every slug on the branch
branch-slugs: [<slug-1>, <slug-2>, ...]   # the roster released together (present when ship-scope: branch)
environment: <env name>
version: "<chosen version>"
prior-version: "<last release tag, or 'none'>"
prefetched-answers:                 # Step 0.9 — asked BEFORE the atomic sequence opened; consumed by 1.2 / 3.1–3.3 / 10.3
  scope: "<slug|branch — the roster this run ships>"
  version: "<confirmed version>"
  rollout-strategy: "<confirmed strategy>"
  release-window: "<timing / blackout / on-call>"
  compliance-overrides: "<sign-off beyond the plan's list, or none>"
go-nogo: <go | conditional-go | no-go | pending>   # pending = paused before the step-5 gate (status: awaiting-input)
merge-strategy: <rebase | squash | merge | none>
ship-plan-readiness: <ok | acknowledged | amended-inline>   # ship-plan pre-check verdict (Step 0.4); missing/drift STOP before a run is written
ship-plan-amended-blocks: [<letter>, ...]   # amended-inline only — blocks the scoped inline edit touched
ship-plan-version-before-after: "<N>→<M>"   # amended-inline only
head-sha-at-start: "<sha>"                  # evidence fields are set as steps complete; absent = not yet run
pre-flight-status: <pass | warn | fail>
publish-dry-run-passed: <true | false | skipped>
merge-sha: "<sha or empty>"
release-tag: "<vX.Y.Z or empty>"
release-workflow-run-id: "<gh run id or empty>"
release-workflow-conclusion: <success | failure | cancelled | "">   # not-reached is the EMPTY STRING "" — never the literal word `empty`
post-publish-checks:
  - { kind: <kind>, status: <pass|fail|skip|pending>, observed-at: "<iso>", evidence: "<short>" }   # skip = did not run / not applicable — never recorded as pass
post-release-bump-sha: "<sha or empty>"
recovery-actions-taken: [<playbook-id>, ...]
rolled-back: <true | false>
rollback-sha: "<sha or empty>"
rollback-reason: ""
rollback-artifact: "<09-rollback-<run-id>.md or empty>"   # stamped by the rollback phase
announcements-sent: [<channel>, ...]
tags: []
refs:
  index: 00-index.md
  handoff: 08-handoff.md
  plan: ../../ship-plan.md
  reviews: [07-review-<slice-1>.md, ...]
next-command: retro
next-invocation: "/wf retro <slug>"   # the default route
recommended-routes:                  # every viable option from ship.md Adaptive routing; one default
  - invocation: "/wf retro <slug>"
    reason: "<one phrase>"
    default: true
---
```

Body, as `# Ship Run — <slug> @ <version> @ <environment>`, in order:
- `## Pre-flight` — ship-plan readiness (`ok` | `acknowledged`, with the drift signals and reason), branch + tree clean, version chosen (and prior), source-of-truth files updated, secrets verified (with staleness flags), changelog regenerated (yes/no, commit sha).
- `## Publish dry-run` — command, result, post-conditions checked with outcomes.
- `## Rollout decision` — strategy, release window, stakeholders, caveats.
- `## Freshness research delta` — platforms checked, new advisories since the prior run, CI/CD changes since the prior run.
- `## Go / No-Go` — decision and a one-paragraph rationale.
- `## Merge` — pr-number, merge-strategy, merge-sha.
- `## Tag + release` — tag, release URL, notes source.
- `## Release workflow watch` — workflow file, run id, conclusion, jobs with conclusions.
- `## Post-publish polling` — each check with kind, status, observed-at, evidence; the propagation window elapsed of max. Skips are listed distinctly.
- `## Post-release version bump` — next dev version, commit sha.
- `## Recovery actions taken` — `<playbook-id>`: steps confirmed by the user.
- `## Announcements` — channels notified.

## `09-ship-runs.md` (Step 11, append or refresh on every run)

```yaml
---
schema: sdlc/v1
type: ship-runs-index
slug: <slug>
updated-at: "<iso>"
runs:
  - { run-id: <id>, version: <ver>, environment: <env>, status: <status>, go-nogo: <go|conditional-go|no-go|pending>, notes: "<short — max 160 chars; the schema enforces the cap, so author within it>" }
  # follower slug in a batch ship — a pointer row, no local run artifact:
  - { run-id: <id>, version: <ver>, environment: <env>, status: <status>, go-nogo: <decision>, shipped-via: "<lead>/09-ship-run-<id>.md", notes: "shipped with <lead>" }
---

# Ship Runs

| Run | Version | Env | Status | Go/No-Go | Notes |
|---|---|---|---|---|---|
| <id> | <ver> | <env> | <status> | <decision> | <notes> |
```
