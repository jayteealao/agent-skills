# Ship-plan init — discovery pass (`ship-plan/init.md` Step 1)

Load this file from `init.md` Step 1. Read every source group in 1.1, then build the discovery report fields in 1.2.

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
- **Commit / PR-title convention:** `.commitlintrc*`, `commitlint.config.{js,cjs,mjs,ts}`, `.czrc`, `.versionrc`; grep `.github/workflows/*` for any PR-title / semantic-PR linter — `amannn/action-semantic-pull-request`, `semantic-pull-request`, `release-drafter` (with title check), or a `commitlint`-on-PR-title job.
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

Group H — **Security & supply-chain tooling** (align categories to `../review/supply-chain.md`):
- **SAST:** `.github/workflows/codeql*.yml` / `github/codeql-action`, `.semgrep.yml` / `semgrep` in CI, `sonar-project.properties`.
- **Dependency audit / CVE scan:** `npm audit` / `pnpm audit`, `pip-audit` / `safety`, `cargo audit` / `cargo-deny`, `govulncheck`, `bundler-audit`, `osv-scanner`; Snyk/Dependabot alerts.
- **Secret scanning:** `.gitleaks.toml` / gitleaks in CI, `trufflehog`, `.secrets.baseline` (detect-secrets), GitHub push protection.
- **SBOM:** syft / `cyclonedx-*` / `anchore/sbom-action`, `spdx` artifacts.
- **License policy:** `license-checker`, `pip-licenses`, `cargo-deny` license rules, FOSSA, `.licenserc`.

Group I — **Repo topology** (one read; affects ecosystems, lint scoping, matrix):
- Detect monorepo/workspaces: `workspaces` in `package.json`, `pnpm-workspace.yaml`, `nx.json`, `turbo.json`, `lerna.json`, Gradle `settings.gradle*` `include(...)`, Cargo `[workspace]`, `go.work`. Record `{ monorepo: bool, tool, workspaces: [...] }`.

**Remote reads only.** Groups G–I issue read-only `gh api` calls and config reads; **none of them ever writes.** Applying remote settings is `/wf ship-plan build`'s job.

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
    pre-merge-checks-candidates: [<job-or-check-name>]   # from on:pull_request: job names + gh api branch protection required_status_checks
    publish-step-evidence: ["<file>:<line> → <command>"]
    registry-hostnames-seen: [<host>, ...]
    secret-refs-seen: [<NAME>, ...]   # from `${{ secrets.X }}` patterns

  infra:
    deploy-targets-seen: [<k8s | ecs | fly | render | vercel | netlify | lambda | none>]
    state-backends-seen: [<terraform-s3 | terraform-cloud | pulumi-service | none>]

  post-publish-check-candidates:
    - { kind: <derived>, suggested-cmd: "<command>", evidence: "<host or file>" }

  recovery-playbook-seeds:
    - { source: "<file>", suggested-id: "<short-id>", triggers-hint: "<from-doc>" }

  inbound-dx:                                  # Block H seed — from Group F
    format-check:  { tool: "<prettier|black|ktlint|rustfmt|gofmt|biome|none>", cmd: "<observed or empty>", evidence: "<file>", confidence: <high|medium|low> }
    lint:          { tool: "<eslint|ruff|flake8|golangci|detekt|clippy|biome|none>", cmd: "<observed or empty>", evidence: "<file>", confidence: <high|medium|low> }
    type-check:    { tool: "<tsc|mypy|pyright|none>", cmd: "<observed or empty>", evidence: "<file>", confidence: <high|medium|low> }
    test-coverage: { min-percent: <observed-threshold or null>, cmd: "<observed or empty>", evidence: "<file>" }
    commit-convention:   { spec: "<conventional|gitmoji|custom|none>", config-path: "<file or empty>", enforced-where: [<local | ci>], evidence: "<file>" }
    pr-title-convention: { spec: "<conventional|none>", action: "<workflow job or empty>", evidence: "<file>" }

  local-dx:                                    # Block I seed — from Group F
    git-hooks: { framework: "<husky|lefthook|pre-commit|simple-git-hooks|none>", config-path: "<file/dir or empty>", hooks-seen: [<pre-commit | commit-msg | pre-push>], evidence: "<file>" }
    editorconfig-present: <true | false>
    runtime-version-files: [<".nvmrc" | ".tool-versions" | ".python-version" | ...>]
    task-runner: { kind: "<make|just|task|npm-scripts|mise|none>", setup-target-seen: "<target or empty>", evidence: "<file>" }
    contributing-doc-present: <true | false>

  governance:                                  # Block J seed — from Group G
    codeowners-present: <true | false>
    pr-template-present: <true | false>
    issue-templates-present: <true | false>
    dependency-automation: { tool: "<dependabot|renovate|none>", config-path: "<file or empty>", evidence: "<file>" }
    branch-protection-current:                 # from read-only gh api; `none` if unset/unauthenticated
      base-branch: "<branch>"
      required-checks: [<context>, ...]
      required-approvals: <int or null>
      dismiss-stale-reviews: <true | false | unknown>
      enforce-admins: <true | false | unknown>
      require-code-owner-reviews: <true | false | unknown>
      require-conversation-resolution: <true | false | unknown>
      require-linear-history: <true | false | unknown>
      mechanism: <branch-protection | ruleset | none>
    merge-current: { method-allowed: [<merge|squash|rebase>], auto-merge: <true | false | unknown> }   # from Group G

  environments:                                # Block A protection seed — from Group G
    - { name: "<env>", required-reviewers: [<@team>], wait-timer-minutes: <int>, branch-policy: "<protected|custom|any>", evidence: "gh api environments" }

  security:                                    # Block K seed — from Group H
    sast:             { tool: "<codeql|semgrep|sonar|none>", evidence: "<file>" }
    dependency-audit: { tool: "<npm-audit|pip-audit|cargo-audit|govulncheck|osv-scanner|none>", evidence: "<file>" }
    secret-scanning:  { tool: "<gitleaks|trufflehog|detect-secrets|github-push-protection|none>", evidence: "<file>" }
    sbom:             { tool: "<syft|cyclonedx|none>", evidence: "<file>" }
    license-check:    { tool: "<license-checker|pip-licenses|cargo-deny|fossa|none>", evidence: "<file>" }

  repo-topology:                               # from Group I
    monorepo: <true | false>
    tool: "<pnpm|yarn|npm|nx|turbo|lerna|gradle|cargo|go-work|none>"
    workspaces: [<path>, ...]

  additional-contracts-suggested:
    - { id: data-migration,        reason: "<file evidence>" }   # e.g. liquibase/ found, alembic in pyproject
    - { id: feature-flag-rollout,  reason: "<file evidence>" }
    - { id: infrastructure-as-code, reason: "<file evidence>" }
    - { id: mobile-app-store,      reason: "<file evidence>" }
    - { id: schema-registry,       reason: "<file evidence>" }
```
