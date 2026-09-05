# Ship-plan init — the eleven contract blocks (`ship-plan/init.md` Step 2)

Load this file from `init.md` Step 2. Run Blocks A–K in order; each states its hypothesis source and its gate question.

## Block A — What ship means + environments + cadence

Hypothesis from `inferred.ship-meaning`. Confirm:
- `ship-meaning` (one of: `publish`, `merge-only`, `deploy-immutable`, `deploy-rolling`, `feature-flag-flip`, or freeform)
- `ship-environments[]` — present discovered deploy targets first (e.g., from `k8s/`, `fly.toml`, multiple workflow envs); multi-select, with order capturing the promotion path.
- For each environment, ask: `auto-promote: <true | false>`.
- For each environment, optionally capture GitHub **`protection`** (seeded from `inferred.environments`): `{ required-reviewers: [<@team>], wait-timer-minutes: <int>, deployment-branch-policy: <protected | custom | any> }`. Leave empty when the env has no gate. `/wf ship-plan build` applies these via `gh api` (gated, like branch protection).
- `ship-cadence` (on-demand, per-merge, weekly, release-train, or freeform).

## Block B — Versioning contract

Hypothesis from `inferred.version`. Confirm:
- `version-scheme` (semver, calver, sequential, none — biased by what discovery found).
- `version-source-of-truth[]` — present the candidates from discovery; multi-select; allow freeform additions; remind the user *every selected file must be bumped together on every release*.
- `version-bump-rule` (git-cliff, conventional-commits, changesets, release-please, manual, fixed) — biased by `bump-tooling-found`.
- `version-bump-cmd` — pre-fill from the tool's conventional command:
  - `git-cliff` → `git cliff --bumped-version`
  - `changesets` → `npx changeset version`
  - `release-please` → `npx release-please release-pr` (capture the project-specific invocation)
  - `manual` → empty
- `prerelease-suffix` (freeform; common: `none`, `-SNAPSHOT`, `-alpha`, `-beta`, `-rc`)
- `post-release-version` (freeform; common: `next-snapshot`, `next-dev`, `none`) + `post-release-version-cmd`

## Block C — CI/CD contract

Hypothesis from `inferred.ci`. Confirm:
- `ci-pipeline.pre-merge-checks[]` — required checks that must pass before a PR merges. Pre-fill from `inferred.ci.pre-merge-checks-candidates` (discovered from `on: pull_request:` workflow job names). Also try `gh api repos/<owner>/<repo>/branches/<base-branch>/protection --jq '.required_status_checks.contexts[]' 2>/dev/null` for enforced branch-protection checks. Confirm or adjust. If none are discoverable, leave empty — this field is informational; `/wf ship` does not enforce it but records it for retro analysis.
- `release-trigger` (tag-on-main, merge-to-main, manual-dispatch, branch-push, or freeform) — derive from the chosen workflow's `on:` block.
- `release-workflow-file` — present candidates; if multiple workflows look release-y, ask which one.
- `release-jobs[]` — pre-fill from the workflow file's job names, in order.
- `publish-dry-run-cmd` — propose a sensible dry-run for the inferred ship-meaning (e.g., `./gradlew publishToMavenLocal`, `npm pack --dry-run`, `python -m build && twine check dist/*`, `kubectl diff -f k8s/<env>/`). Confirm or replace.
- `publish-cmd` — capture even if it only ever runs in CI; it's useful for reference and recovery.
- `required-secrets[]` — pre-fill from `inferred.ci.secret-refs-seen`. For each, ask the user for a one-sentence `purpose`. Allow freeform additions.
- `secrets-staleness-threshold-days` — default `90`, freeform override.
- `ci-ergonomics` — how the generated workflows should be tuned: `{ dep-cache: <true|false>, matrix: { os: [<runner>, ...], versions: [<version>, ...] }, release-concurrency: <true|false>, path-filters: <true|false> }`. Defaults: `dep-cache: true`, single-target matrix (no fan-out), `release-concurrency: true`, `path-filters: false`. `/wf ship-plan build` folds these into the workflows it generates/patches.

## Block D — Post-publish verification contract

Hypothesis from `inferred.post-publish-check-candidates`. Confirm:
- `post-publish-checks[]` — multi-select from the candidates plus the standard kinds (`registry-api`, `fresh-resolve`, `github-release`, `smoke-test`, `k8s-rollout-status`). For each picked, capture `cmd:` and `expect:`. If `template-hint` provides seed commands for the chosen kind, offer them.
- `propagation-window-min-minutes`, `propagation-window-max-minutes`, `poll-interval-seconds` — defaults 5 / 30 / 60.

## Block E — Rollout + rollback contract

Hypothesis from `inferred.infra`. Confirm:
- `rollout-strategy` (immediate, staged, canary, feature-flag, blue-green, or freeform).
- `rollout-stages[]` — only when `staged` / `canary`.
- `rollback-mechanism` (git-revert, gh-release-yank, feature-flag-off, blue-green-switch, redeploy-prior, or freeform).
- `rollback-time-estimate-min` — freeform.
- `rollback-cmd` — the concrete command that redeploys the prior artifact (empty when the mechanism is pure git-revert).
- `rollback-verify-cmd` — the health check that confirms the prior state is live after a rollback (falls back to Block D's post-publish checks when empty).
- `prior-artifact-retention` — how many prior releases stay deployable (registry retention, image-tag policy); the rollback phase checks the target version is still within it.
- `irreversible-steps[]` — actions a rollback cannot undo, declared up front (e.g., "DB migrations are forward-only", "published packages cannot be unpublished"). Rollback runbooks pre-seed their mitigations list from this.
- `db-migrations-reversible` — `true | false | n/a`. If discovery surfaced a migration tool (Liquibase, Flyway, Alembic, Prisma, knex), default to `false` and surface a follow-up for Block-F playbooks.

These rollback fields are read by the `/wf ship <slug> rollback` phase (`reference/ship/rollback.md`); when they are absent, that phase degrades to a git-level runbook (revert-merge + tag supersede) and says so.

## Block F — Recovery playbooks

Seed from `inferred.recovery-playbook-seeds` *plus* any defaults the chosen `template-hint` provides (e.g., the `kotlin-maven-central` template ships `signing-failure` and `registry-token-401`). For each:
- `id` (short slug)
- `triggers[]` (regex strings — case-insensitive, designed to match CI failure logs)
- `steps[]` (numbered, executable)

If no seeds and no template defaults, leave the list empty. The list grows as runs hit failures and `/wf ship-plan edit` adds new playbooks.

## Block G — Stakeholder + announcement contract

Freeform:
- `announcement.channels[]` (e.g., `["#releases", "release-notes@example.com"]`)
- `announcement.template-path` (default `.ai/release-announcement-template.md`)

## Block G follow-up — Announcement template

If `announcement.channels[]` is non-empty and `announcement.template-path` does not already exist as a file, offer to create it now:

```yaml
question: "Create a seed announcement template at `<announcement.template-path>`?"
header: "Announcement template"
options:
  - label: "Create seed template (Recommended)"
    description: "Write a markdown template with {{version}}, {{project-name}}, {{release-url}}, {{changelog-summary}} placeholders. /wf announce will fill these at release time."
  - label: "Skip — I'll create it manually"
    description: "The file must exist before /wf announce runs. You can create it at any time before the next ship run."
multiSelect: false
```

If "Create seed template", write `<announcement.template-path>` with this content (adjust tone/format to match the project's discovered channel conventions):

```markdown
## {{project-name}} {{version}} released

{{changelog-summary}}

**Full release notes:** {{release-url}}

---
*Released by the {{project-name}} team.*
```

If `announcement.channels[]` is empty, skip this follow-up entirely.

---

The remaining required-core blocks are the **inbound** half — the developer experience a contributor hits on every commit and PR. Run them with the same hypothesis pattern as A–G: state the inferred value + evidence, ask a gate question with discovery-ranked options plus `Other`, fold in the `template-hint` seed when it differs, capture the answer.

## Block H — Code-quality gates (inbound CI contract)

Hypothesis from `inferred.inbound-dx`. These are the gates that must pass before a PR can merge. Confirm each (a gate can be `none` — don't invent one the project doesn't want):
- `format-check` — `{ tool, cmd }`. Pre-fill `cmd` from discovery (e.g. `prettier --check .`, `black --check .`, `cargo fmt --check`, `./gradlew ktlintCheck`, `gofmt -l .`).
- `lint` — `{ tool, cmd }` (e.g. `eslint .`, `ruff check .`, `golangci-lint run`, `cargo clippy -- -D warnings`).
- `type-check` — `{ tool, cmd }` (e.g. `tsc --noEmit`, `mypy .`, `pyright`). `n/a` for untyped languages.
- `test-coverage` — `{ min-percent, cmd }`. Pre-fill `min-percent` from a discovered threshold; if none, ask whether to set one (default `none` — do not impose a gate the repo lacks).
- `commit-convention` — `{ spec, config-path, enforce }`. `spec` ∈ {`conventional`, `gitmoji`, `custom`, `none`}. `enforce` is a multi-select of `[local, ci]` — where the convention is checked. If a commitlint config was discovered, pre-fill `spec: conventional` and the path. **This is the field `/wf handoff`'s local commit-lint gate already honors via config-file detection; CI enforcement is added by `/wf ship-plan build`.**
- `pr-title-convention` — `{ spec, enforce }`. `spec` ∈ {`conventional`, `none`}. Typically `enforce: [ci]` via a PR-title-lint action.

After confirming, **derive `ci-pipeline.pre-merge-checks[]` (Block C) from the enabled gates here** — every gate with a non-empty `cmd` and every enforced convention becomes a named pre-merge check. Block H is the canonical source of each check's command; Block C holds the derived name list. Tell the user this linkage so they don't double-enter.

## Block I — Local developer experience (pre-CI)

Hypothesis from `inferred.local-dx`. The fast feedback loop a contributor runs locally before pushing. Confirm:
- `git-hooks` — `{ framework, hooks }`. `framework` ∈ {`husky`, `lefthook`, `pre-commit`, `simple-git-hooks`, `none`}. For each of `pre-commit` / `commit-msg` / `pre-push`, ask which commands run. Sensible default wiring: `pre-commit` → `lint-staged` (format + lint changed files), `commit-msg` → commitlint (only if Block H `commit-convention.spec ≠ none`), `pre-push` → fast test subset. If no framework is discovered, ask whether to introduce one (offer the ecosystem default; `none` is valid).
- `editorconfig` — `<true | false>`. Whether to ship a `.editorconfig` (pre-fill `true` if one exists).
- `runtime-version-files` — `[...]`. Which version-pin files the project standardizes on (pre-fill from discovery).
- `task-runner` — `{ kind, targets }`. `kind` ∈ {`make`, `just`, `task`, `npm-scripts`, `mise`, `none`}. Capture key targets, especially a `setup`/`bootstrap` target.
- `bootstrap-cmd` — the single command a new contributor runs to get a working checkout (freeform; e.g. `make setup`, `npm install && npm run prepare`).
- `contributing-doc` — `<true | false>`. Whether to ship/maintain a `CONTRIBUTING.md`.

## Block J — Repo governance

Hypothesis from `inferred.governance`. The collaboration + protection rules. Confirm:
- `branch-protection` — `{ base-branch, required-checks[], required-approvals, dismiss-stale-reviews, require-up-to-date, enforce-admins, require-code-owner-reviews, require-conversation-resolution, require-linear-history, allow-force-pushes, allow-deletions, mechanism, apply-via }`. Pre-fill `required-checks[]` from Block H's derived pre-merge checks and `branch-protection-current`.
  - `require-code-owner-reviews` — default `true` whenever `codeowners[]` (below) is non-empty; otherwise the CODEOWNERS file is cosmetic. `false` only if the user opts out.
  - `require-conversation-resolution`, `require-linear-history` — defaults `true` / `false`; confirm.
  - `allow-force-pushes`, `allow-deletions` — defaults `false` / `false` (locked).
  - `mechanism` ∈ {`branch-protection`, `ruleset`} — which GitHub control to apply. Default `branch-protection` (universal); pre-fill `ruleset` only if discovery saw the repo already governs via rulesets.
  - `apply-via` ∈ {`gh-api`, `manual`} — **whether `/wf ship-plan build` is permitted to apply these settings to the remote repo via `gh api` (behind its own confirm gate), or only print the commands.** Default `gh-api` only if the user explicitly opts in; otherwise `manual`.
- `codeowners` — `[{ path, owners[] }]`. Ownership rules. Seed from a discovered `CODEOWNERS`; freeform additions allowed. Empty list = don't ship one.
- `pr-template` — `<true | false>`. Whether to ship/maintain `.github/PULL_REQUEST_TEMPLATE.md`.
- `issue-templates` — `<true | false>`. Whether to ship `.github/ISSUE_TEMPLATE/`.
- `dependency-automation` — `{ tool, ecosystems[], schedule }`. `tool` ∈ {`dependabot`, `renovate`, `none`}. `ecosystems[]` from the project's package managers (e.g. `npm`, `pip`, `gradle`, `github-actions`). When `inferred.repo-topology.monorepo` is true, seed one ecosystem entry per workspace. `schedule` freeform (default `weekly`).
- `merge` — `{ method, auto-merge, merge-queue }`. `method` ∈ {`squash`, `merge`, `rebase`, `any`} (pre-fill from `inferred.governance.merge-current`). `auto-merge` `<true|false>`. `merge-queue` `<true|false>` — note it requires specific GitHub plan tiers; `/wf ship-plan build` detects and warns if unavailable.

## Block K — Security & supply-chain gates

Hypothesis from `inferred.security`. The scanning + policy layer (align to `../review/supply-chain.md`). Each gate can be `none` — don't impose one the project doesn't want:
- `sast` — `{ tool, cmd, schedule }`. `tool` ∈ {`codeql`, `semgrep`, `sonar`, `none`}. CodeQL runs as its own workflow (PR + scheduled); others as a CI step. `schedule` freeform (default `weekly`).
- `dependency-audit` — `{ tool, cmd, fail-on }`. e.g. `npm audit --audit-level=high`, `pip-audit`, `cargo audit`, `govulncheck ./...`, `osv-scanner`. `fail-on` ∈ {`critical`, `high`, `moderate`, `low`}.
- `secret-scanning` — `{ tool, cmd, pre-commit }`. e.g. gitleaks, trufflehog, detect-secrets. `pre-commit: <true|false>` — also wire it as a Block-I `pre-commit` hook when true.
- `sbom` — `{ tool, format, publish-with-release }`. `tool` ∈ {`syft`, `cyclonedx`, `none`}; `format` ∈ {`spdx`, `cyclonedx`}; `publish-with-release` attaches the SBOM to the GitHub release.
- `license-check` — `{ tool, allow[], deny[] }`. Allowed/denied SPDX license lists enforced in CI.

These become pre-merge and/or scheduled CI gates built by `/wf ship-plan build` (Audit P). Enabled PR-time gates also feed `ci-pipeline.pre-merge-checks[]` (Block C), same as Block H.
