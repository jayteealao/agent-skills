# Ship-plan readiness — drift signals (Step R2 of `_ship-plan-readiness.md`)

Run all three groups. Every finding is `{ signal, detail, suggested-block, clears-on }`; take `clears-on` from the table in [../_ship-plan-readiness.md](../_ship-plan-readiness.md) when you raise it, never derive it.

## Shell portability — the commands below are POSIX sketches, not literals

Every command in this file is written in POSIX shell for readability. On Windows the caller may be in PowerShell, where several of them are wrong or silently different. Translate before running; a gate whose own prescribed command produces unusable output makes the operator re-run everything by hand and distrust the gate (one run reported "the `tee` trick produced whitespace noise — let me re-run each check cleanly").

| Written here | PowerShell equivalent |
|---|---|
| `test -f <path>` | `Test-Path <path>` |
| `cmd 2>/dev/null` | `cmd 2>$null` |
| `` VAR=`cmd` `` | `$VAR = cmd` |
| `a && b` | `a; if ($?) { b }` (PowerShell 7 supports `&&`) |
| `cmd \| grep -q X` | `cmd \| Select-String -Quiet X` |

Three standing rules regardless of shell:
1. **One command, one purpose.** Do not chain a check through `tee`, a pager, or a formatter to "capture it too". Run it, read the exit status, run the next. Output-capture pipelines are where whitespace noise and swallowed exit codes come from.
2. **Never let a pipeline mask an exit code.** In POSIX shells a pipeline reports the *last* command's status, so `cmd | tee log` succeeds when `cmd` fails. If output must be captured, redirect (`cmd > log 2>&1`) and test the status directly.
3. **Quote paths.** Windows paths contain spaces far more often than the examples suggest.

## Group 1 — Version sources, secrets, workflow files (plan-vs-repo mismatch)

1. **Version source-of-truth files.** For each path in `plan.version-source-of-truth[]`: `test -f <path>`. A path that no longer exists → finding `{ signal: version-source-missing, detail: "<path> in the plan no longer exists", suggested-block: B }`. Then glob the repo for version-bearing manifests not covered by the plan (`package.json`, `pyproject.toml`, `setup.py`, `Cargo.toml`, `build.gradle*`, `pom.xml`, `*.gemspec`, `go.mod`, `*.csproj`); for any that is version-bearing but absent from `version-source-of-truth[]` → finding `{ signal: version-source-new, detail: "<path> carries a version but the plan does not list it", suggested-block: B }`. In a monorepo a new package is the common trigger.
2. **Required secrets.** Collect every `${{ secrets.NAME }}` reference across `.github/workflows/*.y*ml` (exclude the auto-provided `GITHUB_TOKEN`). Diff against `plan.ci-pipeline.required-secrets[].name`:
   - referenced in a workflow but **absent from the plan** → finding `{ signal: secret-unplanned, detail: "<NAME> is used by <workflow> but not in required-secrets[]", suggested-block: C }`.
   - listed in the plan but **referenced nowhere** → soft finding `{ signal: secret-orphaned, detail: "<NAME> is in the plan but no workflow references it", suggested-block: C }` (advisory; never the sole blocker).
3. **Workflow files.** Confirm `plan.ci-pipeline.release-workflow-file` (and `plan.release-workflow-file`) still exist on disk; missing → finding `{ signal: workflow-missing, detail: "<file> named by the plan does not exist", suggested-block: C }`. Then list `.github/workflows/*.y*ml` files added since the plan's `updated-at` (`git log --since="<plan.updated-at>" --name-only --diff-filter=A -- .github/workflows`); for each → finding `{ signal: workflow-new, detail: "<file> was added after the plan was last updated", suggested-block: C }`.
4. **Version already released.** For each path in `plan.version-source-of-truth[]`, read the version it carries and check it against existing release identities: `git tag -l "v<version>" "<version>"` and, when a remote exists, `gh release view <tag> --json tagName` for the matching tag form. A working-tree version that already has a tag or release → finding `{ signal: version-already-released, detail: "<path> carries <version> but tag <tag> already exists (released <date>) — the branch's release identity is stale", suggested-block: B }`. This is the collision a handoff once certified as "release identity frozen" four days after that identity had shipped; nothing structural caught it.
5. **Compliance record staleness (advisory).** If `.ai/pipeline-compliance.md` exists and its `plan-version` is lower than the plan's current `plan-version` → soft finding `{ signal: compliance-stale, detail: "pipeline-compliance.md records build state for plan v<M> but the plan is v<N> — re-run /wf ship-plan build --dry-run to re-verify", suggested-block: C }` (advisory; never the sole blocker). The compliance file is a build **receipt**, not trusted state: it can survive branch resets and keep asserting "done" for infrastructure that no longer exists. This finding is only the cheap nudge to re-verify against the live repo and remote.

## Group 2 — Release-relevant change surface (the packaged diff)

Diff the caller's commit range name-only (`git diff --name-only <range>`). Raise findings when the change touches release-shaping surface the plan may not yet reflect:
- Any path under `.github/workflows/`, or a CI/build config (`Dockerfile`, `docker-compose*`, `*.tf`, `helm/`, `k8s/`, `.github/`, build config for the ecosystem) → `{ signal: release-surface-touched, detail: "the packaged change edits <path> — the shipping pipeline moved", suggested-block: C }`.
- A dependency manifest or lockfile changed (`package.json`/`package-lock.json`/`pnpm-lock.yaml`/`yarn.lock`, `pyproject.toml`/`poetry.lock`, `Cargo.toml`/`Cargo.lock`, `go.mod`/`go.sum`, `*.gradle*`, `pom.xml`) → `{ signal: dependencies-changed, detail: "dependencies changed in <path> — a new registry/target may need planning", suggested-block: C }`.
- `has-migration: true` on the workflow **and** no `plan.recovery-playbooks[]` entry whose `id`/`triggers` covers a migration or rollback path → `{ signal: migration-without-rollback, detail: "this change carries a migration but the plan has no matching rollback playbook", suggested-block: F }`.

Each Group-2 finding means "the plan should be revisited", not necessarily "the plan is wrong". The first two are `clears-on: merge`: they describe the *packaged diff*, so no edit to the plan can falsify them while the branch is open. `migration-without-rollback` is `clears-on: amend`, because adding the playbook to block F does falsify it. The gate's remedy menu is built from that tag.

## Group 3 — Plan staleness heuristic

Count infra-touching commits since the plan was last updated:
`git log --since="<plan.updated-at>" --oneline -- .github/workflows package.json pyproject.toml Cargo.toml build.gradle build.gradle.kts pom.xml go.mod`
If the count is `≥ 5` (and no more-specific Group-1/2 finding already fired for the same surface) → finding `{ signal: plan-stale, detail: "<N> pipeline/manifest commits since the plan was last updated (plan-version <v>, updated <date>) — the plan may be stale", suggested-block: C }`. This is a heuristic nudge: it flags "a lot moved under the plan" even when nothing mismatches exactly.

**Deeper than drift.** This pre-check only catches *mechanical mismatch* (a file moved, a secret unplanned). When a lot has moved, or before a first real release, the plan may be drift-free yet still **unsound** (ordering hazards, a rollback that is not a rollback, over-broad permissions). That is `/wf ship-plan audit`'s job, not this gate's. When `plan-stale` fires, suggest `/wf ship-plan audit` for a soundness pass; this pre-check never blocks on it.
