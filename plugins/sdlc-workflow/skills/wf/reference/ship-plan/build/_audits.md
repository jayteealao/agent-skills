# Ship-plan build — the compliance audits and the gap report table (`ship-plan/build.md` Steps 1 and 2)

Load this file from `build.md` Step 1. Run every audit below, then render the Step 2 gap report in the table shape at the end.

## The audits (Step 1)

Evaluate each requirement as **Compliant / Missing / Non-compliant** and record the exact delta needed.

## Audit A — Pre-merge checks (`plan.ci-pipeline.pre-merge-checks[]`)
Skip if the list is empty.
- Does any workflow have `on: pull_request:` that includes each check name as a job?
- **Missing:** no PR workflow exists at all.
- **Non-compliant:** PR workflow exists but one or more check names are absent as jobs.

## Audit B — Release trigger and workflow file (`plan.ci-pipeline.release-trigger`, `plan.ci-pipeline.release-workflow-file`)
- Does `plan.release-workflow-file` exist?
- If yes: does its `on:` block match the trigger?
  - `tag-on-main` → `push: tags: ['v[0-9]*']`
  - `merge-to-main` → `push: branches: [<base-branch>]`
  - `manual-dispatch` → `workflow_dispatch:`
  - `branch-push` → `push: branches: [<release-branch-pattern>]`
- **Missing:** file does not exist.
- **Non-compliant:** file exists but `on:` does not match.

## Audit C — Release jobs (`plan.ci-pipeline.release-jobs[]`)
- Does `plan.release-workflow-file` contain each job in `release-jobs[]`?
- **Missing:** one or more jobs absent.
- **Non-compliant:** jobs present but `needs:` wiring does not reflect the implied sequential order.

## Audit D — Publish dry-run (`plan.ci-pipeline.publish-dry-run-cmd`)
Skip if `publish-dry-run-cmd` is empty.
- Does a PR workflow contain a step running `publish-dry-run-cmd`?
- **Missing:** command does not appear in any PR workflow.

## Audit E — Publish command (`plan.ci-pipeline.publish-cmd`)
- Does `plan.release-workflow-file` contain a step running `publish-cmd`?
- **Missing:** command does not appear in the release workflow.

## Audit F — Required secrets (`plan.ci-pipeline.required-secrets[]`)
- For each `{ name, purpose }`: does `${{ secrets.<name> }}` appear in the release workflow?
- **Missing:** secret is not referenced anywhere in the release workflow.

## Audit G — Version bump (`plan.version-bump-rule`, `plan.version-bump-cmd`)
- `release-please` → does a `release-please.yml` workflow exist?
- `changesets` → does a `changesets.yml` or equivalent exist?
- `git-cliff` / `manual` / `conventional-commits` → does the release workflow contain a step running `version-bump-cmd`?
- **Missing:** no version bump step or workflow found.

## Audit H — Post-publish checks (`plan.post-publish-checks[]`)
Skip if `post-publish-checks` is empty.
- Does the release workflow contain a job or steps that execute the `cmd:` for each check, downstream of the publish step?
- **Missing:** check command does not appear after the publish step.

## Audit I — Rollback workflow (`plan.rollback-mechanism`)
Skip if `rollback-mechanism` ∈ {`feature-flag-off`, `git-revert`} — those are manual; no CI workflow is needed.
- Does `.github/workflows/rollback.yml` (or equivalent) exist with `on: workflow_dispatch:`?
- **Missing:** no `workflow_dispatch`-triggered rollback workflow found.

## Audit J — Runbook stubs (`plan.recovery-playbooks[]`)
- For each playbook `{ id }`: does `docs/runbooks/<id>.md` exist?
- **Missing:** file does not exist.

---

The remaining audits cover the **inbound** half of the plan. Run them only when the plan has the corresponding block (`code-quality` / `local-dx` / `governance`); skip silently otherwise.

## Audit K — Code-quality CI gates (`plan.code-quality`)
For each of `format-check`, `lint`, `type-check`, `test-coverage` whose `cmd` is non-empty:
- Does a PR workflow (`on: pull_request:`) contain a step running that literal `cmd`?
- **Missing:** the command does not appear in any PR workflow.
- **Note — supersedes command-guessing.** Where Block H provides a literal `cmd`, it is authoritative: Audit A's pre-merge job and Step 3's derived-command table ([pre-merge.md](pre-merge.md)) both use the Block-H `cmd` verbatim, falling back to the name→command heuristic table only for checks with no Block-H entry.

## Audit L — Commit + PR-title convention CI (`plan.code-quality.commit-convention`, `plan.code-quality.pr-title-convention`)
- If `commit-convention.spec ≠ none` and `ci` ∈ `commit-convention.enforce`: does a config file exist (`commitlint.config.*` / `.commitlintrc*`) **and** does a PR workflow run commitlint against the PR's commits?
- If `pr-title-convention.spec ≠ none`: does a workflow job run a PR-title linter (e.g. `amannn/action-semantic-pull-request`) on `pull_request` `types: [opened, edited, synchronize]`?
- **Missing:** config absent, or no CI job enforces the convention.
- **Non-compliant:** config present but no CI job (or vice versa).

## Audit M — Local git hooks (`plan.local-dx.git-hooks`)
Skip if `framework: none`.
- Does the framework's config exist (`.husky/` dir, `lefthook.{yml,yaml}`, `.pre-commit-config.yaml`, or `simple-git-hooks` block)?
- Does it wire each planned hook in `git-hooks.hooks` (the `pre-commit` / `commit-msg` / `pre-push` commands)?
- For Node frameworks: is the install hook present (`package.json` `scripts.prepare` for husky, or the framework's install step)?
- **Missing:** framework config absent.
- **Non-compliant:** config present but a planned hook command is not wired.

## Audit N — Developer-experience files (`plan.local-dx`)
- `editorconfig: true` → does `.editorconfig` exist?
- `runtime-version-files[]` → does each named file exist?
- `task-runner.kind ≠ none` → does the runner file exist and contain each named target (especially the `setup`/`bootstrap` target and `bootstrap-cmd`)?
- `contributing-doc: true` → does `CONTRIBUTING.md` (or `.github/CONTRIBUTING.md`) exist?
- **Missing:** the named file/target does not exist.

## Audit O — Repo governance (`plan.governance`)
- `codeowners[]` non-empty → does `CODEOWNERS` exist covering each planned `path`?
- `pr-template: true` → does `.github/PULL_REQUEST_TEMPLATE.md` exist?
- `issue-templates: true` → does `.github/ISSUE_TEMPLATE/` exist with at least one template?
- `dependency-automation.tool ≠ none` → does the tool's config exist (`.github/dependabot.yml` or `renovate.json`) covering the planned `ecosystems[]`?
- `branch-protection` → compare the live protection (read via the mechanism's API — `branches/<base>/protection` or `rulesets`) against planned `required-checks[]`, `required-approvals`, `dismiss-stale-reviews`, `enforce-admins`, `require-conversation-resolution`, `require-linear-history`, `allow-force-pushes`, `allow-deletions`.
  - **Code-owner enforcement:** if `codeowners[]` is non-empty but live protection does NOT set `require_code_owner_reviews`, flag **Non-compliant** — the CODEOWNERS file is otherwise cosmetic.
- **Missing:** config file absent, or live branch protection is unset / weaker than planned.
- **Non-compliant:** present but diverges from the plan (e.g. fewer required checks, code-owner review not required, mechanism mismatch).
- **Compliant (stronger):** live protection exceeds the plan — report and do not weaken (see Step 12b in [governance.md](governance.md)).

## Audit P — Security & supply-chain gates (`plan.security`)
For each gate that isn't `none`:
- `sast` → does a SAST workflow exist (CodeQL `.github/workflows/codeql*.yml`, or the configured tool as a CI step) running on PR and/or schedule?
- `dependency-audit` → does a PR workflow run the audit `cmd` with the planned `fail-on` threshold?
- `secret-scanning` → does a CI step (and, when `pre-commit: true`, a Block-I hook) run the scanner?
- `sbom` → does the release workflow generate the SBOM (and attach it when `publish-with-release`)?
- `license-check` → does a PR step enforce the allow/deny policy?
- **Missing:** the gate's tool/step does not appear where the plan requires it.

## Audit Q — Environment protection (`plan.ship-environments[].protection`)
Skip envs without a `protection` block.
- For each env with protection, compare live `gh api repos/<owner>/<repo>/environments/<name>` against planned `required-reviewers`, `wait-timer-minutes`, `deployment-branch-policy`.
- **Missing:** environment unprotected or weaker than planned.
- **Non-compliant:** present but diverges.

## Audit R — Merge controls (`plan.governance.merge`)
Skip if no `merge` block.
- Compare live repo merge settings (`gh api repos/<owner>/<repo>` → `allow_*_merge`, `allow_auto_merge`) against planned `method` + `auto-merge`.
- `merge-queue: true` → is a merge queue configured for the base branch? (Detect tier support; if unavailable, this is a **warn**, not a failure.)
- **Missing/Non-compliant:** settings diverge from the plan.

## Audit S — CI ergonomics (`plan.ci-pipeline.ci-ergonomics`)
Skip if no `ci-ergonomics` block.
- `dep-cache` → do the generated/existing workflows use `actions/cache` or the setup-action cache?
- `matrix` → does the PR/build job fan out over the planned `os`/`versions`?
- `release-concurrency` → does the release workflow have a `concurrency:` block?
- `path-filters` → do PR workflows scope with `paths:` where the plan asks?
- **Missing:** the requested ergonomic isn't present in the relevant workflow.

## Gap report table (Step 2)

```
Pipeline compliance audit — .ai/ship-plan.md v<plan-version>
Ecosystem: <detected>   Ship meaning: <plan.ship-meaning>

| Audit | Requirement                        | Status        | Planned action                           |
|-------|------------------------------------|---------------|------------------------------------------|
| A     | pre-merge: <checks>                | MISSING       | Create .github/workflows/pr-checks.yml   |
| B     | trigger: <release-trigger>         | NON-COMPLIANT | Fix `on:` in <release-workflow-file>     |
| C     | jobs: <release-jobs>               | COMPLIANT     | —                                        |
| D     | publish-dry-run-cmd                | MISSING       | Add step to pr-checks.yml               |
| E     | publish-cmd                        | COMPLIANT     | —                                        |
| F     | secrets: <names>                   | MISSING       | Add env refs to publish job              |
| G     | version-bump: <rule>               | MISSING       | Add version-bump step to release.yml     |
| H     | post-publish: <check kinds>        | MISSING       | Add post-publish job to release.yml      |
| I     | rollback: <mechanism>              | MISSING       | Create .github/workflows/rollback.yml    |
| J     | runbooks: <ids>                    | MISSING       | Create docs/runbooks/<id>.md             |
| K     | quality gates: <format/lint/type/cov> | MISSING    | Add gate steps to pr-checks.yml          |
| L     | commit + PR-title convention       | MISSING       | Add commitlint + semantic-PR jobs + config |
| M     | git hooks: <framework>             | MISSING       | Create hook config; wire pre-commit/commit-msg |
| N     | dx files: editorconfig/version/task | MISSING       | Create .editorconfig, version files, targets |
| O     | governance + branch protection     | NON-COMPLIANT | Create CODEOWNERS/templates/deps; apply protection (gated) |
| P     | security: <sast/audit/secret/sbom> | MISSING       | Add CodeQL + audit/scan/license steps; SBOM in release |
| Q     | env protection: <envs>             | MISSING       | Apply environment rules via gh api (gated) |
| R     | merge controls: <method/queue>     | NON-COMPLIANT | Set merge methods/auto-merge via gh api (gated) |
| S     | ci-ergonomics: <cache/matrix/conc> | MISSING       | Fold cache/matrix/concurrency into workflows |
```
