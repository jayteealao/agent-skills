---
description: Author the project-level `.ai/ship-plan.md` — a one-time, repo-scoped contract that captures the project's *entire* CI/CD + developer-experience pipeline. The outbound half is what "ship" means (publishing, version scheme, release CI/CD wiring, post-publish verification, rollout/rollback, recovery playbooks, announcements). The inbound half is the contributor experience (code-quality gates: commit-message + PR-title convention, format/lint/type-check/coverage; local developer experience: git hooks, editorconfig, runtime-version files, task runner; repo governance: branch protection, CODEOWNERS, PR/issue templates, dependency automation). Works by **discovery → hypothesis → confirm**: reads what's already in the repo (CI workflows, infra-as-code, package manifests, runbooks, linters, hook frameworks, governance files), proposes a pipeline-shape hypothesis, then lets the user confirm or correct each contract. Optional `--from-template <kind>` biases the hypothesis toward a known shape; the template is a *seed*, not a control-flow branch. Read by every subsequent `$wf ship <slug>` invocation and built by `$wf-meta build-pipeline`.
argument-hint: "[--from-template <kotlin-maven-central|npm-public|pypi|container-image|server-deploy|library-internal>]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.ai/dep-updates/...`, `.ai/ship-plan.md`), stage names or numbers, skill names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language. Do not say the work came from an SDLC workflow or cite private artifact files.

You are running `wf-meta init-ship-plan`, a **one-time project-level setup utility**. The plan you author here is consumed by every `$wf ship <slug>` invocation thereafter.

# Design intent

The plan is a *contract* between this project and the pipeline skills (`$wf ship` reads the outbound half; `$wf-meta build-pipeline` builds both halves). Authoring it well means **understanding how this specific repo actually ships *and* how a contributor actually works in it** — not picking the nearest preset and filling blanks.

The contract has two halves. The **outbound** half (Blocks A–G) is the release: what ship means, versioning, release CI/CD, post-publish, rollout/rollback, recovery, announce. The **inbound** half (Blocks H–K) is the developer experience hit on every commit and PR: code-quality gates, local git hooks + dev-setup, repo governance, and security/supply-chain gates. Both are authored here so the pipeline is built whole.

This skill therefore runs three loops:
1. **Discovery** — read what the repo already says (CI workflows, infra-as-code, package manifests, runbooks). Don't ask before reading.
2. **Hypothesis** — propose an inferred ship-shape and let the user confirm, correct, or replace each piece. Options presented to the user are *prompts to refine a hypothesis*, not multiple-choice quizzes — "Other (describe)" is always available.
3. **Codify** — write a schema with a small **required core** (the fields `$wf ship` reads) plus **open extensions** (`additional-contracts[]`) for project-specific shape.

Templates are **exemplar text** you can show the user when it helps. They are not branches in the control flow.

# What this skill produces

A single file: **`.ai/ship-plan.md`** at the **repo root** (not under `.ai/workflows/`). The plan is per-project, not per-workflow.

# What this skill does NOT do

- It does not run a release.
- It does not modify workflow artifacts under `.ai/workflows/`.
- It does not author `09-ship-run-*.md` files (those are written per-release by `$wf ship`).
- It does not duplicate work already in `08-handoff.md` (handoff is per-PR readiness; this plan is per-release).
- It does not run any of the commands it discovers (no `gradle publish --dry-run`, no `terraform plan`, etc.). Discovery is read-only.
- It does not **apply** anything to the repo or remote. Authoring the contract is all this skill does; generating workflows/config and applying remote settings (branch protection, environment protection, merge settings) is `$wf-meta build-pipeline`'s job, behind its own confirm gates.

> **Optional second opinion.** Before you lock the pipeline contract, you may offer
> `$consult <critique this proposed ship / CI-CD pipeline shape — gaps, risky
> ordering, missing gates>` (or `$consult <provider> …`) — a read-only multi-model
> panel whose repo-aware oracles can check the hypothesis against the repo's actual
> CI before you commit to it. Opt-in, sends content to external models, gated by
> `externalDispatch.enabled`; offer it, never run it automatically.

# CRITICAL — execution discipline

You are a **plan author**, not a problem solver.
- Do NOT make code changes, run builds, or modify CI files.
- Do NOT overwrite an existing `.ai/ship-plan.md`. If one exists, STOP and tell the user: *"Plan exists at `.ai/ship-plan.md`. Use `$wf-meta amend ship-plan` to edit one block."*
- Do NOT skip discovery (Step 1) even when `--from-template` is passed. The template biases the hypothesis; discovery decides whether the hypothesis is actually right for this repo.
- Follow the numbered steps below exactly in order.

---

# Step 0 — Orient

1. Parse `$ARGUMENTS` for `--from-template <kind>`. If present, validate `<kind>` ∈ {`kotlin-maven-central`, `npm-public`, `pypi`, `container-image`, `server-deploy`, `library-internal`}. Record it as `template-hint`. If an unknown kind, STOP and list the valid kinds. **Do not read the template file yet** — discovery comes first; you'll use the template as a seed during the hypothesis pass (Step 2).
2. STOP if `.ai/ship-plan.md` already exists. Tell the user to amend instead.
3. Detect repo basics: `git remote get-url origin`, derive `<owner>/<repo>` and `project-name`.

---

# Step 1 — Discovery pass

Read the repo to understand what's actually there. **No questions yet.** Surface findings to the user as a *discovery report* at the end of this step.

## 1.1 What to read

Group A — **CI/CD definitions** (read full contents, not just filenames):
- `.github/workflows/*.yml` — extract per file: `on:` triggers, job names + order, `uses:` actions, `secrets.<NAME>` references, registry hostnames in `push`/`publish`/`deploy` steps.
- `.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`, `Jenkinsfile`, `.buildkite/`, `.drone.yml`, `bitbucket-pipelines.yml` (whichever exist).

Group B — **Infrastructure-as-code / deploy targets** (read frontmatter / top-level keys):
- `Dockerfile*`, `docker-compose*.yml`
- `k8s/`, `helm/`, `charts/`, `kustomize/` (note presence + chart names)
- `terraform/`, `pulumi/`, `cdk.json`, `cdktf.json`
- `serverless.yml`, `sst.config.*`, `sam.yaml`
- `fly.toml`, `render.yaml`, `app.yaml`, `vercel.json`, `netlify.toml`, `railway.json`
- `ansible/`, `playbooks/`

Group C — **Package manifests + release tooling**:
- `package.json` — `version`, `publishConfig`, `scripts.{publish,release,deploy,prepublishOnly,postpublish}`
- `pyproject.toml` — `[project].version`, `[tool.poetry]`, `[tool.setuptools]`, `[tool.hatch.version]`
- `build.gradle*`, `gradle.properties`, `settings.gradle*` — `VERSION_NAME`, `group`, `version`, applied plugins (look for `maven-publish`, `signing`, vanniktech publish plugin)
- `Cargo.toml` — `[package].version`, `[workspace.metadata.release]`
- `*.csproj`, `Directory.Build.props` — `<Version>`, `<PackageVersion>`
- `Chart.yaml` — `version`, `appVersion`
- `mix.exs` (Elixir), `go.mod` (Go — no version field, but presence matters), `composer.json`
- `.releaserc*`, `release-please-config.json`, `release-please-manifest.json`, `.changeset/`, `goreleaser.yml`, `cliff.toml`, `commitlint.config.*`
- `CHANGELOG.md` — note presence + last-entry format (clues for `git-cliff` vs `changesets`)

Group D — **Recovery / runbook material** (for seeding playbooks):
- `docs/runbooks/*`, `RUNBOOK*.md`, `runbook/`, `runbooks/`
- `docs/incidents/*`, `incidents/`, `postmortems/`
- `SECURITY.md` (sometimes documents key rotation)
- `.github/ISSUE_TEMPLATE/incident*.md`

Group E — **Release history**:
- `git tag --sort=-creatordate` (first 20)
- `git log --tags --simplify-by-decoration --pretty="%ai %d" | head -20`
- Latest 5 GitHub releases via `gh release list --limit 5` (if `gh auth status` succeeds)

Group F — **Inbound code-quality tooling** (the contributor-facing gate layer — read configs, don't run them):
- **Commit / PR-title convention:** `.commitlintrc*`, `commitlint.config.{js,cjs,mjs,ts}`, `.czrc`, `.versionrc`; search `.github/workflows/*` for any PR-title / semantic-PR linter — `amannn/action-semantic-pull-request`, `semantic-pull-request`, `release-drafter` (with title check), or a `commitlint`-on-PR-title job.
- **Formatters:** `.prettierrc*` / `prettier` key in `package.json`, `.editorconfig`, `rustfmt.toml` / `.rustfmt.toml`, `.ktlint` / `.editorconfig` ktlint section, `[tool.black]` / `[tool.ruff.format]` in `pyproject.toml`, `gofmt`/`gofumpt` usage, `biome.json` (formatter).
- **Linters:** `.eslintrc*` / `eslint.config.*`, `biome.json` (linter), `[tool.ruff]` / `ruff.toml`, `.flake8` / `setup.cfg [flake8]`, `.golangci.yml`, `detekt.yml`, `.rubocop.yml`, `clippy` in CI.
- **Pre-commit staging:** `lint-staged` config (in `package.json`, `.lintstagedrc*`), `nano-staged`.
- **Coverage thresholds:** jest `coverageThreshold` in `package.json`/`jest.config.*`, `[tool.coverage]` / `.coveragerc`, `codecov.yml` / `.codecov.yml`, `nyc` config, `tarpaulin.toml`.
- **Runtime version pins:** `.nvmrc`, `.node-version`, `.tool-versions` (asdf/mise), `.python-version`, `.ruby-version`, `go.mod` `toolchain`/`go` directive, `rust-toolchain.toml`, `.sdkmanrc`.
- **Task runners / bootstrap:** `Makefile`, `justfile` / `Justfile`, `Taskfile.yml`, `package.json` `scripts` (note `setup`/`bootstrap`/`dev`/`prepare`), `mise.toml` tasks, `bin/setup` / `script/bootstrap`.

Group G — **Repo governance** (collaboration + protection layer):
- **Ownership:** `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`.
- **Templates:** `.github/PULL_REQUEST_TEMPLATE.md` / `.github/PULL_REQUEST_TEMPLATE/`, `.github/ISSUE_TEMPLATE/` (note configs + `config.yml`).
- **Dependency automation:** `.github/dependabot.yml`, `renovate.json` / `.renovaterc*` / `renovate` key in `package.json`.
- **Contribution docs:** `CONTRIBUTING.md`, `.github/CONTRIBUTING.md`.
- **Merge settings (read-only):** `gh api repos/<owner>/<repo> --jq '{merge:.allow_merge_commit, squash:.allow_squash_merge, rebase:.allow_rebase_merge, auto:.allow_auto_merge}' 2>/dev/null`.
- **Branch protection (read-only):** `gh api repos/<owner>/<repo>/branches/<base-branch>/protection 2>/dev/null` and `gh api repos/<owner>/<repo>/rulesets 2>/dev/null` — capture which mechanism is in use plus required checks, approvals, stale-dismissal, admin enforcement, code-owner review, conversation resolution, linear history. If `gh` is unauthenticated or the call 404s, record `none`.
- **Environments (read-only):** `gh api repos/<owner>/<repo>/environments 2>/dev/null` — capture env names + protection rules (required reviewers, wait timer, branch policy) to seed Block A.

Group H — **Security & supply-chain tooling** (align categories to `../../review/reference/supply-chain.md`):
- **SAST:** `.github/workflows/codeql*.yml` / `github/codeql-action`, `.semgrep.yml` / `semgrep` in CI, `sonar-project.properties`.
- **Dependency audit / CVE scan:** `npm audit` / `pnpm audit`, `pip-audit` / `safety`, `cargo audit` / `cargo-deny`, `govulncheck`, `bundler-audit`, `osv-scanner`; Snyk/Dependabot alerts.
- **Secret scanning:** `.gitleaks.toml` / gitleaks in CI, `trufflehog`, `.secrets.baseline` (detect-secrets), GitHub push protection.
- **SBOM:** syft / `cyclonedx-*` / `anchore/sbom-action`, `spdx` artifacts.
- **License policy:** `license-checker`, `pip-licenses`, `cargo-deny` license rules, FOSSA, `.licenserc`.

Group I — **Repo topology** (one read; affects ecosystems, lint scoping, matrix):
- Detect monorepo/workspaces: `workspaces` in `package.json`, `pnpm-workspace.yaml`, `nx.json`, `turbo.json`, `lerna.json`, Gradle `settings.gradle*` `include(...)`, Cargo `[workspace]`, `go.work`. Record `{ monorepo: bool, tool, workspaces: [...] }`.

**Remote reads only.** Groups G–I issue read-only `gh api` calls and config reads; **none of them ever writes.** Applying remote settings is `$wf-meta build-pipeline`'s job.

## 1.2 What to extract

From the reads above, build a discovery report with these inferred fields (each tagged with the source file it came from, and a confidence: `high | medium | low`):

```yaml
inferred:
  ship-meaning:
    value: <publish | merge-only | deploy-immutable | deploy-rolling | feature-flag-flip | unknown>
    evidence: ["<file>: <quoted snippet>", ...]
    confidence: <high | medium | low>
    alternatives: [<other plausible values given the evidence>]

  version:
    scheme-hint: <semver | calver | sequential | none>
    source-of-truth-candidates:
      - { path: "<file>", field: "<dotted-path>", current-value: "<observed>" }
    bump-tooling-found: [<git-cliff | changesets | release-please | semantic-release | bumpversion | cargo-release | manual>]

  ci:
    release-workflow-candidates:
      - { path: ".github/workflows/<file>.yml", trigger: "<on: ...>", jobs: [<name>, ...] }
    pre-merge-checks-candidates: [<job-or-check-name>]
    publish-step-evidence: ["<file>:<line> → <command>"]
    registry-hostnames-seen: [<host>, ...]
    secret-refs-seen: [<NAME>, ...]

  infra:
    deploy-targets-seen: [<k8s | ecs | fly | render | vercel | netlify | lambda | none>]
    state-backends-seen: [<terraform-s3 | terraform-cloud | pulumi-service | none>]

  post-publish-check-candidates:
    - { kind: <derived>, suggested-cmd: "<command>", evidence: "<host or file>" }

  recovery-playbook-seeds:
    - { source: "<file>", suggested-id: "<short-id>", triggers-hint: "<from-doc>" }

  inbound-dx:
    format-check:  { tool: "<prettier|black|ktlint|rustfmt|gofmt|biome|none>", cmd: "<observed or empty>", evidence: "<file>", confidence: <high|medium|low> }
    lint:          { tool: "<eslint|ruff|flake8|golangci|detekt|clippy|biome|none>", cmd: "<observed or empty>", evidence: "<file>", confidence: <high|medium|low> }
    type-check:    { tool: "<tsc|mypy|pyright|none>", cmd: "<observed or empty>", evidence: "<file>", confidence: <high|medium|low> }
    test-coverage: { min-percent: <observed-threshold or null>, cmd: "<observed or empty>", evidence: "<file>" }
    commit-convention:   { spec: "<conventional|gitmoji|custom|none>", config-path: "<file or empty>", enforced-where: [<local | ci>], evidence: "<file>" }
    pr-title-convention: { spec: "<conventional|none>", action: "<workflow job or empty>", evidence: "<file>" }

  local-dx:
    git-hooks: { framework: "<husky|lefthook|pre-commit|simple-git-hooks|none>", config-path: "<file/dir or empty>", hooks-seen: [<pre-commit | commit-msg | pre-push>], evidence: "<file>" }
    editorconfig-present: <true | false>
    runtime-version-files: [<".nvmrc" | ".tool-versions" | ".python-version" | ...>]
    task-runner: { kind: "<make|just|task|npm-scripts|mise|none>", setup-target-seen: "<target or empty>", evidence: "<file>" }
    contributing-doc-present: <true | false>

  governance:
    codeowners-present: <true | false>
    pr-template-present: <true | false>
    issue-templates-present: <true | false>
    dependency-automation: { tool: "<dependabot|renovate|none>", config-path: "<file or empty>", evidence: "<file>" }
    branch-protection-current:
      base-branch: "<branch>"
      required-checks: [<context>, ...]
      required-approvals: <int or null>
      dismiss-stale-reviews: <true | false | unknown>
      enforce-admins: <true | false | unknown>
      require-code-owner-reviews: <true | false | unknown>
      require-conversation-resolution: <true | false | unknown>
      require-linear-history: <true | false | unknown>
      mechanism: <branch-protection | ruleset | none>
    merge-current: { method-allowed: [<merge|squash|rebase>], auto-merge: <true | false | unknown> }

  environments:
    - { name: "<env>", required-reviewers: [<@team>], wait-timer-minutes: <int>, branch-policy: "<protected|custom|any>", evidence: "gh api environments" }

  security:
    sast:             { tool: "<codeql|semgrep|sonar|none>", evidence: "<file>" }
    dependency-audit: { tool: "<npm-audit|pip-audit|cargo-audit|govulncheck|osv-scanner|none>", evidence: "<file>" }
    secret-scanning:  { tool: "<gitleaks|trufflehog|detect-secrets|github-push-protection|none>", evidence: "<file>" }
    sbom:             { tool: "<syft|cyclonedx|none>", evidence: "<file>" }
    license-check:    { tool: "<license-checker|pip-licenses|cargo-deny|fossa|none>", evidence: "<file>" }

  repo-topology:
    monorepo: <true | false>
    tool: "<pnpm|yarn|npm|nx|turbo|lerna|gradle|cargo|go-work|none>"
    workspaces: [<path>, ...]

  additional-contracts-suggested:
    - { id: data-migration,        reason: "<file evidence>" }
    - { id: feature-flag-rollout,  reason: "<file evidence>" }
    - { id: infrastructure-as-code, reason: "<file evidence>" }
    - { id: mobile-app-store,      reason: "<file evidence>" }
    - { id: schema-registry,       reason: "<file evidence>" }
```

## 1.3 Present discovery report

Show the user the discovery report as a compact bullet summary (no question yet). Make it skimmable:

```
Discovered:
- Ship shape looks like: deploy-rolling to k8s (helm/ + .github/workflows/deploy.yml on:push:main)
- Version source-of-truth candidates: helm/Chart.yaml (version: 0.4.2), package.json (version: 0.4.2)
- Bump tooling found: release-please (release-please-config.json)
- Release workflow: .github/workflows/release.yml (jobs: build, test, publish-image, helm-upgrade)
- Secret refs in workflows: GHCR_TOKEN, KUBECONFIG_PROD, KUBECONFIG_STAGING
- Registry hostnames: ghcr.io
- Runbook material: docs/runbooks/rollout-stuck.md, docs/runbooks/image-pull-failure.md → seed playbook candidates
- Inbound DX: commitlint (commitlint.config.js) + husky (.husky/) found; lint=eslint, format=prettier, type-check=tsc; coverage threshold 80% (jest); .nvmrc pins node 20; PR-title lint NOT found
- Governance: CODEOWNERS present; renovate.json found; branch protection on main = 1 approval + required checks [build, test] (gh api); code-owner review NOT required; merge = squash-only; 1 environment (production, no reviewers)
- Security: CodeQL workflow found; dependency-audit NOT run in CI; gitleaks NOT found; no SBOM; no license policy
- Topology: monorepo (pnpm workspaces, 4 packages)
- Additional contracts suggested: data-migration (liquibase/ found)
```

Then ask the user in chat (free-form):
> *"Does this match how the project actually ships? Anything to add, correct, or ignore before we move on?"*

Apply the user's corrections to the in-memory discovery state. If the user says *"the helm dir is dead code, ignore it"*, mark that evidence as `discarded`.

---

# Step 2 — Hypothesis pass: confirm each contract

For each required-core contract below, present a **hypothesis derived from discovery** and let the user confirm, refine, or replace it. The structure is uniform:

1. State the inferred value + the evidence (1–2 lines, quoting Step 1's findings).
2. Ask the user in chat with **options derived from discovery**, ranked by confidence, presenting them as a short numbered list; always include "Other (describe)" as the last option.
3. If `template-hint` was set in Step 0 *and* the template's seed for this field differs from the inferred value, surface both: *"Discovery suggests X; the `<template-hint>` template usually uses Y. Which fits this project?"*
4. Capture the answer in the in-memory plan state.

If discovery had nothing to go on (e.g., the project has no `.github/workflows/`), say so, and ask from a generic option list. Don't pretend you inferred when you didn't.

Run the contracts in this order:

## Block A — What ship means + environments + cadence

Hypothesis from `inferred.ship-meaning`. Confirm:
- `ship-meaning` (one of: `publish`, `merge-only`, `deploy-immutable`, `deploy-rolling`, `feature-flag-flip`, or freeform)
- `ship-environments[]` — present discovered deploy targets first (e.g., from `k8s/`, `fly.toml`, multiple workflow envs); multi-select, with order capturing the promotion path.
- For each environment, ask: `auto-promote: <true | false>`.
- For each environment, optionally capture GitHub **`protection`** (seeded from `inferred.environments`): `{ required-reviewers: [<@team>], wait-timer-minutes: <int>, deployment-branch-policy: <protected | custom | any> }`. Leave empty when the env has no gate. `$wf-meta build-pipeline` applies these via `gh api` (gated, like branch protection).
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
- `ci-pipeline.pre-merge-checks[]` — required checks that must pass before a PR merges. Pre-fill from `inferred.ci.pre-merge-checks-candidates` (discovered from `on: pull_request:` workflow job names). Also try `gh api repos/<owner>/<repo>/branches/<base-branch>/protection --jq '.required_status_checks.contexts[]' 2>/dev/null` for enforced branch-protection checks. Confirm or adjust. If none are discoverable, leave empty — this field is informational; `$wf ship` does not enforce it but records it for retro analysis.
- `release-trigger` (tag-on-main, merge-to-main, manual-dispatch, branch-push, or freeform) — derive from the chosen workflow's `on:` block.
- `release-workflow-file` — present candidates; if multiple workflows look release-y, ask which one.
- `release-jobs[]` — pre-fill from the workflow file's job names, in order.
- `publish-dry-run-cmd` — propose a sensible dry-run for the inferred ship-meaning (e.g., `./gradlew publishToMavenLocal`, `npm pack --dry-run`, `python -m build && twine check dist/*`, `kubectl diff -f k8s/<env>/`). Confirm or replace.
- `publish-cmd` — capture even if it only ever runs in CI; it's useful for reference and recovery.
- `required-secrets[]` — pre-fill from `inferred.ci.secret-refs-seen`. For each, ask the user for a one-sentence `purpose`. Allow freeform additions.
- `secrets-staleness-threshold-days` — default `90`, freeform override.
- `ci-ergonomics` — how the generated workflows should be tuned: `{ dep-cache: <true|false>, matrix: { os: [<runner>, ...], versions: [<version>, ...] }, release-concurrency: <true|false>, path-filters: <true|false> }`. Defaults: `dep-cache: true`, single-target matrix (no fan-out), `release-concurrency: true`, `path-filters: false`. `$wf-meta build-pipeline` folds these into the workflows it generates/patches.

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
- `db-migrations-reversible` — `true | false | n/a`. If discovery surfaced a migration tool (Liquibase, Flyway, Alembic, Prisma, knex), default to `false` and surface a follow-up for Block-F playbooks.

## Block F — Recovery playbooks

Seed from `inferred.recovery-playbook-seeds` *plus* any defaults the chosen `template-hint` provides (e.g., the `kotlin-maven-central` template ships `signing-failure` and `registry-token-401`). For each:
- `id` (short slug)
- `triggers[]` (regex strings — case-insensitive, designed to match CI failure logs)
- `steps[]` (numbered, executable)

If no seeds and no template defaults, leave the list empty. The list grows as runs hit failures and `$wf-meta amend ship-plan` adds new playbooks.

## Block G — Stakeholder + announcement contract

Freeform:
- `announcement.channels[]` (e.g., `["#releases", "release-notes@example.com"]`)
- `announcement.template-path` (default `.ai/release-announcement-template.md`)

## Block G follow-up — Announcement template

If `announcement.channels[]` is non-empty and `announcement.template-path` does not already exist as a file, offer to create it now. Ask in chat:

> Create a seed announcement template at `<announcement.template-path>`?
> 1. Create seed template (Recommended) — write a markdown template with `{{version}}`, `{{project-name}}`, `{{release-url}}`, `{{changelog-summary}}` placeholders. `$wf-meta announce` will fill these at release time.
> 2. Skip — I'll create it manually. The file must exist before `$wf-meta announce` runs.

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

The remaining required-core blocks are the **inbound** half — the developer experience a contributor hits on every commit and PR. Run them with the same hypothesis pattern as A–G: state the inferred value + evidence, ask in chat with discovery-ranked options plus "Other", fold in the `template-hint` seed when it differs, capture the answer.

## Block H — Code-quality gates (inbound CI contract)

Hypothesis from `inferred.inbound-dx`. These are the gates that must pass before a PR can merge. Confirm each (a gate can be `none` — don't invent one the project doesn't want):
- `format-check` — `{ tool, cmd }`. Pre-fill `cmd` from discovery (e.g. `prettier --check .`, `black --check .`, `cargo fmt --check`, `./gradlew ktlintCheck`, `gofmt -l .`).
- `lint` — `{ tool, cmd }` (e.g. `eslint .`, `ruff check .`, `golangci-lint run`, `cargo clippy -- -D warnings`).
- `type-check` — `{ tool, cmd }` (e.g. `tsc --noEmit`, `mypy .`, `pyright`). `n/a` for untyped languages.
- `test-coverage` — `{ min-percent, cmd }`. Pre-fill `min-percent` from a discovered threshold; if none, ask whether to set one (default `none` — do not impose a gate the repo lacks).
- `commit-convention` — `{ spec, config-path, enforce }`. `spec` ∈ {`conventional`, `gitmoji`, `custom`, `none`}. `enforce` is a multi-select of `[local, ci]` — where the convention is checked. If a commitlint config was discovered, pre-fill `spec: conventional` and the path. **This is the field `$wf handoff`'s local commit-lint gate already honors via config-file detection; CI enforcement is added by `$wf-meta build-pipeline`.**
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
  - `apply-via` ∈ {`gh-api`, `manual`} — **whether `$wf-meta build-pipeline` is permitted to apply these settings to the remote repo via `gh api` (behind its own confirm gate), or only print the commands.** Default `gh-api` only if the user explicitly opts in; otherwise `manual`.
- `codeowners` — `[{ path, owners[] }]`. Ownership rules. Seed from a discovered `CODEOWNERS`; freeform additions allowed. Empty list = don't ship one.
- `pr-template` — `<true | false>`. Whether to ship/maintain `.github/PULL_REQUEST_TEMPLATE.md`.
- `issue-templates` — `<true | false>`. Whether to ship `.github/ISSUE_TEMPLATE/`.
- `dependency-automation` — `{ tool, ecosystems[], schedule }`. `tool` ∈ {`dependabot`, `renovate`, `none`}. `ecosystems[]` from the project's package managers (e.g. `npm`, `pip`, `gradle`, `github-actions`). When `inferred.repo-topology.monorepo` is true, seed one ecosystem entry per workspace. `schedule` freeform (default `weekly`).
- `merge` — `{ method, auto-merge, merge-queue }`. `method` ∈ {`squash`, `merge`, `rebase`, `any`} (pre-fill from `inferred.governance.merge-current`). `auto-merge` `<true|false>`. `merge-queue` `<true|false>` — note it requires specific GitHub plan tiers; `$wf-meta build-pipeline` detects and warns if unavailable.

## Block K — Security & supply-chain gates

Hypothesis from `inferred.security`. The scanning + policy layer (align to `../../review/reference/supply-chain.md`). Each gate can be `none` — don't impose one the project doesn't want:
- `sast` — `{ tool, cmd, schedule }`. `tool` ∈ {`codeql`, `semgrep`, `sonar`, `none`}. CodeQL runs as its own workflow (PR + scheduled); others as a CI step. `schedule` freeform (default `weekly`).
- `dependency-audit` — `{ tool, cmd, fail-on }`. e.g. `npm audit --audit-level=high`, `pip-audit`, `cargo audit`, `govulncheck ./...`, `osv-scanner`. `fail-on` ∈ {`critical`, `high`, `moderate`, `low`}.
- `secret-scanning` — `{ tool, cmd, pre-commit }`. e.g. gitleaks, trufflehog, detect-secrets. `pre-commit: <true|false>` — also wire it as a Block-I `pre-commit` hook when true.
- `sbom` — `{ tool, format, publish-with-release }`. `tool` ∈ {`syft`, `cyclonedx`, `none`}; `format` ∈ {`spdx`, `cyclonedx`}; `publish-with-release` attaches the SBOM to the GitHub release.
- `license-check` — `{ tool, allow[], deny[] }`. Allowed/denied SPDX license lists enforced in CI.

These become pre-merge and/or scheduled CI gates built by `$wf-meta build-pipeline` (Audit P). Enabled PR-time gates also feed `ci-pipeline.pre-merge-checks[]` (Block C), same as Block H.

---

# Step 3 — Additional contracts (open extensions)

Ask the user in chat (multi-select), seeded by `inferred.additional-contracts-suggested`. Present as a numbered list:

> Does this project have any of these contracts that the standard plan doesn't cover? (Select all that apply)
> 1. data-migration — schema migrations have their own cadence + reversibility policy (Liquibase/Flyway/Alembic/Prisma/etc.)
> 2. feature-flag-rollout — feature flags gate the rollout (LaunchDarkly/Statsig/Unleash/etc.). Flip cadence + cleanup policy.
> 3. infrastructure-as-code — Terraform/Pulumi state has its own apply policy and drift-check cadence.
> 4. mobile-app-store — TestFlight / Play Store review windows + phased rollout %.
> 5. compliance-gate — SOC2 / PCI / HIPAA evidence collection required per release.
> 6. data-pipeline — Airflow / dbt / Dagster orchestration with its own promotion cadence.
> 7. schema-registry — Proto / Avro / OpenAPI registry with compatibility rules.
> 8. Other (describe) — project-specific contract not on this list.

For each picked, run a small sub-loop (3–5 freeform questions in chat) capturing: `id`, `purpose`, `fields:` (key/value pairs the user names), `enforced-by:` (which skill or human checks this).

Each becomes an entry in `additional-contracts[]`. `$wf ship` ignores these by default; consumers that want them must read them by `id`.

---

# Step 4 — Exemplar pass (on request)

If, during Steps 2 or 3, the user asks *"what does a typical X plan look like?"* — or if they pick a `template-hint` they're unfamiliar with — open the relevant file under `ship-plan-templates/<kind>.md` (same wf-meta router) and show the seed values as **reference reading**, not a fill-in form.

Templates also exist for stealing single fields. If the user is happy with their Block A but wants the `signing-failure` playbook from `kotlin-maven-central`, pull only that block. Each template carries both a `# Seed values` block (outbound Blocks A–G) and a `# Inbound DX seed values` block (Blocks H–K) — surface whichever half the user is asking about.

---

# Step 5 — Confirmation

Present a summary table to the user in chat. Surface the required-core values inline and list additional-contract `id`s by name:

> Plan summary — confirm before writing `.ai/ship-plan.md`?
> 1. Confirm — write the plan as summarised.
> 2. Adjust — go back and edit a block.
> 3. Cancel — discard.

If "Adjust", ask which block (A–K or an additional-contract `id`) and re-run only that block's questions.

---

# Step 6 — Write `.ai/ship-plan.md`

Schema split:
- **Required core** (top of frontmatter) — fixed fields that `$wf ship` reads. Schema-stable; downstream code relies on these names.
- **Extensions** (`additional-contracts[]`) — typed list, open content. Each entry is `{ id, purpose, fields: { ... }, enforced-by: "..." }`.

```yaml
---
schema: sdlc/v1
type: ship-plan
slug: <project-name-as-slug>
plan-version: 1
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
project-name: "<repo or product name>"
template-hint: <kind | none>     # records the seed used during authoring; informational only

# === Required core — read by $wf ship ===

# Block A — what ship means
ship-meaning: <publish | merge-only | deploy-immutable | deploy-rolling | feature-flag-flip | <freeform>>
ship-environments:
  - name: "<env>"
    auto-promote: <true|false>
    protection:                                  # optional — GitHub Environment rules; omit for ungated envs
      required-reviewers: ["@<team>", ...]
      wait-timer-minutes: <int>
      deployment-branch-policy: <protected | custom | any>
ship-cadence: <on-demand | per-merge | weekly | release-train | <freeform>>

# Block B — versioning contract
version-scheme: <semver | calver | sequential | none>
version-source-of-truth:
  - { path: "<file>", field: "<dotted-path>" }
version-bump-rule: <git-cliff | conventional-commits | changesets | release-please | manual | fixed>
version-bump-cmd: "<command>"
prerelease-suffix: <none | -SNAPSHOT | -alpha | -beta | -rc | <freeform>>
post-release-version: <next-snapshot | next-dev | none | <freeform>>
post-release-version-cmd: "<command or empty>"

# Block C — CI/CD contract
ci-pipeline:
  pre-merge-checks: [<check>, ...]
  release-trigger: <tag-on-main | merge-to-main | manual-dispatch | branch-push | <freeform>>
  release-workflow-file: ".github/workflows/<file>.yml"
  release-jobs: [<job>, ...]
  publish-dry-run-cmd: "<command>"
  publish-cmd: "<command>"
  required-secrets:
    - { name: "<NAME>", purpose: "<short description>" }
  secrets-staleness-threshold-days: 90
  ci-ergonomics:
    dep-cache: <true | false>
    matrix: { os: ["<runner>", ...], versions: ["<version>", ...] }
    release-concurrency: <true | false>
    path-filters: <true | false>

# Block D — post-publish verification contract
post-publish-checks:
  - { kind: <kind>, cmd: "<command>", expect: "<signal>" }
propagation-window-min-minutes: 5
propagation-window-max-minutes: 30
poll-interval-seconds: 60

# Block E — rollout + rollback contract
rollout-strategy: <immediate | staged | canary | feature-flag | blue-green | <freeform>>
rollout-stages: ["10%", "50%", "100%"]   # only when staged/canary
rollback-mechanism: <git-revert | gh-release-yank | feature-flag-off | blue-green-switch | redeploy-prior | <freeform>>
rollback-time-estimate-min: 5
db-migrations-reversible: <true | false | n/a>

# Block F — recovery playbooks
recovery-playbooks:
  - id: <short-id>
    triggers: ["<regex>", ...]
    steps:
      - "<step>"

# Block G — stakeholder + announcement contract
announcement:
  channels: ["<channel>", ...]
  template-path: ".ai/release-announcement-template.md"

# === Inbound half — read by $wf-meta build-pipeline (and the local gate in $wf handoff) ===

# Block H — code-quality gates
code-quality:
  format-check: { tool: "<tool|none>", cmd: "<command or empty>" }
  lint:         { tool: "<tool|none>", cmd: "<command or empty>" }
  type-check:   { tool: "<tool|n/a>", cmd: "<command or empty>" }
  test-coverage: { min-percent: <int or null>, cmd: "<command or empty>" }
  commit-convention:   { spec: <conventional | gitmoji | custom | none>, config-path: "<file or empty>", enforce: [<local | ci>] }
  pr-title-convention: { spec: <conventional | none>, enforce: [<ci>] }

# Block I — local developer experience
local-dx:
  git-hooks:
    framework: <husky | lefthook | pre-commit | simple-git-hooks | none>
    hooks:
      pre-commit: ["<command>", ...]
      commit-msg: ["<command>", ...]
      pre-push:   ["<command>", ...]
  editorconfig: <true | false>
  runtime-version-files: ["<file>", ...]
  task-runner: { kind: <make | just | task | npm-scripts | mise | none>, targets: { <name>: "<command>" } }
  bootstrap-cmd: "<command or empty>"
  contributing-doc: <true | false>

# Block J — repo governance
governance:
  branch-protection:
    base-branch: "<branch>"
    mechanism: <branch-protection | ruleset>
    required-checks: ["<context>", ...]
    required-approvals: <int>
    dismiss-stale-reviews: <true | false>
    require-up-to-date: <true | false>
    enforce-admins: <true | false>
    require-code-owner-reviews: <true | false>   # default true when codeowners[] non-empty
    require-conversation-resolution: <true | false>
    require-linear-history: <true | false>
    allow-force-pushes: <true | false>           # default false
    allow-deletions: <true | false>              # default false
    apply-via: <gh-api | manual>
  codeowners:
    - { path: "<glob>", owners: ["@<owner>", ...] }
  pr-template: <true | false>
  issue-templates: <true | false>
  dependency-automation: { tool: <dependabot | renovate | none>, ecosystems: ["<ecosystem>", ...], schedule: "<cadence>" }
  merge: { method: <squash | merge | rebase | any>, auto-merge: <true | false>, merge-queue: <true | false> }

# Block K — security & supply-chain gates
security:
  sast:             { tool: <codeql | semgrep | sonar | none>, cmd: "<command or empty>", schedule: "<cadence>" }
  dependency-audit: { tool: "<npm-audit | pip-audit | cargo-audit | govulncheck | osv-scanner | none>", cmd: "<command>", fail-on: <critical | high | moderate | low> }
  secret-scanning:  { tool: <gitleaks | trufflehog | detect-secrets | none>, cmd: "<command>", pre-commit: <true | false> }
  sbom:             { tool: <syft | cyclonedx | none>, format: <spdx | cyclonedx>, publish-with-release: <true | false> }
  license-check:    { tool: "<license-checker | pip-licenses | cargo-deny | fossa | none>", allow: ["<SPDX>", ...], deny: ["<SPDX>", ...] }

# === Extensions — open schema, not read by $wf ship unless a consumer opts in by id ===

additional-contracts:
  - id: <short-id>
    purpose: "<one short sentence>"
    fields:
      <key>: <value>
    enforced-by: "<skill, hook, or human role>"
---

# Ship Plan — <project-name>

## What "ship" means here
<one paragraph: what artifact reaches what audience? does ship publish, merge, deploy, or flip a flag? cite the discovery evidence.>

## Versioning
<prose walkthrough of scheme, source-of-truth files, bump rule, prerelease/postrelease handling>

## CI/CD pipeline
<pre-merge checks, release trigger, workflow file, jobs in order, required secrets and where they come from>

## Post-publish verification
<each check + expected signal + how long to wait>

## Rollout strategy
<default + when to vary>

## Rollback playbook
<detection signals, rollback steps, time estimate>

## Recovery playbooks
<each known failure mode + steps. Reference the runbook file each was seeded from, where applicable.>

## Stakeholder + announcement
<who needs to know, what channel, what template>

## Code-quality gates
<each gate (format/lint/type-check/coverage) + its command; the commit-message and PR-title conventions and where they're enforced. Note which gates feed the pre-merge checks above.>

## Local developer experience
<the git-hook framework and what runs at each hook; the bootstrap command a new contributor runs; runtime version pins; task-runner targets; whether an editorconfig / CONTRIBUTING is shipped.>

## Repo governance
<branch-protection rules for the base branch (required checks, approvals, stale-dismissal, code-owner review, conversation resolution, linear history) and the mechanism (branch-protection vs ruleset) + whether applied via API or by hand; CODEOWNERS rules; PR/issue templates; dependency-automation tool + cadence; merge controls (method, auto-merge, queue); per-environment GitHub protection where set.>

## Security & supply-chain gates
<which scanners run and where (SAST, dependency-audit, secret-scanning), the fail-on threshold, SBOM generation + publishing, and the license allow/deny policy. Note which run at PR time (feeding pre-merge checks) vs on a schedule.>

## Additional contracts
<one subsection per additional-contracts[] entry: purpose, fields, who enforces.>
```

---

# Step 7 — Chat return

Return — lead with the substance first, then the receipt:
- **narrative:** a short prose paragraph (not bullets) telling the story of what this stage produced — what it *is* and how, the key decisions and counts, and the top risk or caveat. The router leads the chat summary with this paragraph; the fields below are the receipt beneath it.
- `wrote: .ai/ship-plan.md`
- `template-hint: <kind | none>`
- `plan-version: 1`
- `additional-contracts: [<id>, ...]` (or `[]`)
- `announcement-template-created: <true | false | skipped>` (from Block G follow-up)
- `inbound-coverage:` one line summarizing Blocks H–K — e.g. `gates: lint+type-check+coverage(80%); commit-convention: conventional (local+ci); hooks: husky; branch-protection: gh-api (1 approval, code-owner req); merge: squash+auto; security: codeql+npm-audit(high)+gitleaks; deps: renovate; topology: monorepo(pnpm,4)`
- `next-steps:`
  - `$wf-meta build-pipeline` — audit and implement the **entire** pipeline from this plan: release + pre-merge workflows, code-quality + commit/PR-title CI, local git hooks, dev-experience files, and repo governance (CODEOWNERS, templates, dependency automation, and branch protection via `gh api` when `apply-via: gh-api`). Creates missing files, patches non-compliant ones.
  - `$wf ship <slug>` — run a release using this plan (requires the pipeline to be in place)
  - `$wf-meta announce <slug>` — send release announcement to configured channels (run after ship completes; requires `announcement.channels[]` to be set in the plan)
  - `$wf-meta amend ship-plan` — edit any block

---

# Notes on amendment vs. init

- **init**: this skill. One-time. Errors if a plan exists. Always runs discovery first.
- **amend**: `$wf-meta amend ship-plan` — opens the existing plan, lets the user pick which block to edit (A–K, or an additional-contract `id`), runs the relevant questions for that block only, bumps `plan-version`. Used when CI/CD changes, secrets rotate, post-publish checks evolve, recovery playbooks are added, code-quality/security gates or governance rules change, or a new additional-contract is introduced.

The plan is intentionally project-scoped — every workflow on the same repo ships through the same pipeline, so the plan only needs to be authored once per project. Run history accumulates per workflow under `.ai/workflows/<slug>/09-ship-run-*.md`.
