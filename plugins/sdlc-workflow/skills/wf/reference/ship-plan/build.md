---
description: Reads `.ai/ship-plan.md` and brings the repo's *entire* CI/CD + developer-experience pipeline into compliance with it. Audits and builds the outbound half (release + pre-merge GitHub Actions workflows, post-publish checks, rollback) AND the inbound half (code-quality CI gates, commit-message + PR-title convention enforcement, local git hooks, editorconfig/version files/task targets, CODEOWNERS, PR/issue templates, dependency automation, and branch protection). Creates missing files, adds missing jobs/steps to existing files (no file is ever overwritten), and — when the plan opts in via `apply-via: gh-api` — applies branch-protection settings to the remote repo behind an explicit confirm gate. Each gap is shown to the user before any write or remote mutation occurs.
argument-hint: "[--dry-run]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `wf ship-plan build`. Your job: read the ship plan as the specification, measure the gap between what exists and what is required, confirm with the user, then implement only what is missing.

# Design contract

- **`.ai/ship-plan.md` is the specification.** What it says is right; what is in the repo is the current implementation. Your job is to close the gap.
- **No overwrites.** Never replace an existing file wholesale. For existing workflow files, use targeted edits — append jobs, add steps, extend env blocks, fix `on:` triggers. The existing file's structure and content are preserved.
- **Fully runnable output.** Generated YAML must be syntactically valid and produce a working pipeline given the plan's secrets and commands. Use pinned action versions (`actions/checkout@v4`, etc.). Include `permissions:` blocks. Substitute the plan's literal `publish-cmd`, `publish-dry-run-cmd`, and `required-secrets[]` — not placeholders.
- **Minimal diff.** Only add what is needed. Do not reorganize, rename, or reformat existing content.
- **Two output classes.** (1) **Files** — `.github/workflows/*.yml` (outbound + inbound CI: release, pre-merge, code-quality, commit/PR-title, CodeQL, scheduled scans) plus inbound-DX config files at their conventional paths: commitlint config, git-hook framework config (`.husky/`, `lefthook.yml`, `.pre-commit-config.yaml`), `.editorconfig`, runtime-version files, task-runner targets, `CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/`, `.github/dependabot.yml` / `renovate.json`, `CONTRIBUTING.md`. (2) **Remote state** — branch protection (Step 12), GitHub Environment protection (Step 14), and repo merge settings (Step 15). Everything in class (1) follows the no-overwrite / minimal-diff / trace-insertion rules.
- **Remote mutation is gated and opt-in.** The remote state this command touches is limited to **branch protection, environment protection, and repo merge settings** — each only when the plan opts in (`apply-via: gh-api` / equivalent). Never apply silently: show the current-vs-desired diff and the exact `gh api` payload, then require an explicit confirm. A "print commands only" choice is always offered and writes the commands to the compliance artifact instead of executing them. This command never pushes code, opens PRs, sets secrets, or runs a release.
- **Trace insertions.** When adding to an existing file, add a single-line comment above the inserted block: `# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>`. Never add this comment to content the user wrote themselves. For non-YAML config files use that language's comment syntax; for files that cannot carry comments (JSON), record the provenance in the compliance artifact instead.

# What this command does NOT do

- It does not push commits, open or merge PRs, or run a release (`/wf ship` does that).
- It does not set secrets — it lists the required ones for the user to set via `gh secret set`.
- It does not install dependencies — generated hooks/CI reference dev-deps recorded in `deps-to-install`; the user installs them.
- It does not mutate any remote state beyond the three gated settings above, and never without an explicit confirm + a print-only fallback.
- It does not author or edit `.ai/ship-plan.md` — that is `/wf ship-plan init` / `/wf ship-plan edit`. This command only *reads* the plan and closes the repo gap against it.

> **Optional second opinion.** After the pipeline audit produces its findings, you
> may offer `/consult <second opinion on these pipeline compliance findings and the
> proposed remediation>` (or `/consult <provider> …`) — a read-only multi-model
> panel that checks the audit before you act on it. The model may run this itself when it clearly adds value (pin `codex`/`claude` to stay free); otherwise just offer it.

---

# Step 0 — Orient

1. Parse `$ARGUMENTS` for `--dry-run`. If present, run all audit steps and generate the full gap report but write nothing. Label every planned change `[DRY RUN — not written]`.
2. **Read `.ai/ship-plan.md`.** STOP if missing: *"No ship plan found at `.ai/ship-plan.md`. Run `/wf ship-plan init` first."* Parse all blocks A–K into in-memory state. (Plans authored before a given inbound block simply lack its key — `code-quality` / `local-dx` / `governance` / `security` plus the `ship-environments[].protection` and `ci-pipeline.ci-ergonomics` extensions — and the matching audits among K–S then skip.)
3. **Detect the language/runtime ecosystem** from the plan's `version-source-of-truth[]` paths and `publish-cmd` content:

   | Signal | Ecosystem |
   |---|---|
   | `package.json` in source-of-truth | Node.js |
   | `pyproject.toml` or `setup.py` | Python |
   | `build.gradle*` or `pom.xml` | JVM |
   | `Cargo.toml` | Rust |
   | `docker build` or `docker/build-push-action` in publish-cmd | Container |
   | `helm upgrade` or `kubectl` in publish-cmd | Kubernetes deploy |
   | Anything else | Unknown — generate shell-only steps with `# TODO:` markers |

4. **Glob `.github/workflows/*.yml`.** Read each file fully. Build an in-memory index: `filename → on-triggers → job-names → step-run-commands → secret-refs`. Secret refs are all `${{ secrets.<NAME> }}` patterns.
5. **Determine the base branch** from `plan.ship-environments[0].name` or default `main`. (Prefer `plan.governance.branch-protection.base-branch` when present.)
6. **Index inbound-DX state** (only for blocks the plan actually carries; plans authored before a block simply skip its audits — `code-quality` → K/L, `local-dx` → M/N, `governance` → O/R, `security` → P, env `protection` → Q, `ci-ergonomics` → S). Probe the conventional paths for existing config: commitlint config, hook framework (`.husky/`, `lefthook.{yml,yaml}`, `.pre-commit-config.yaml`, `simple-git-hooks` in `package.json`), `.editorconfig`, runtime-version files, task-runner files, `CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/`, `.github/dependabot.yml` / `renovate.json` / `.renovaterc*`, `CONTRIBUTING.md`, CodeQL/SAST + audit/secret/SBOM/license workflows. Build a `path → present?` index. Record `plan.governance.branch-protection.apply-via` (and any env `apply-via`) — it decides whether Steps 12/14/15 may call `gh api`.

---

# Step 1 — Compliance audit

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
- **Note — supersedes command-guessing.** Where Block H provides a literal `cmd`, it is authoritative: Audit A's pre-merge job and Step 3's derived-command table both use the Block-H `cmd` verbatim, falling back to the name→command heuristic table only for checks with no Block-H entry.

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
- **Compliant (stronger):** live protection exceeds the plan — report and do not weaken (see Step 12b stronger-than-plan guard).

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

---

# Step 2 — Gap report + confirmation

Present the audit results as a structured table, then confirm before writing anything:

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

Inbound audit rows (K–S) appear only when the plan carries the matching block. The plan-block → audit map: **H (code-quality) → K, L** · **I (local-dx) → M, N** · **J (governance + merge) → O, R** · **K (security) → P** · **A (env protection) → Q** · **C (ci-ergonomics) → S**.

Then AskUserQuestion:

```yaml
question: "Implement all missing/non-compliant items as listed above?"
header: "Build pipeline"
options:
  - label: "Implement all (Recommended)"
    description: "Create missing files; patch non-compliant files. No file is overwritten."
  - label: "Select items"
    description: "Choose which gaps to close now; defer the rest."
  - label: "Cancel"
    description: "Discard — make no changes."
multiSelect: false
```

If "Select items": present each non-Compliant audit row as a multi-select and proceed with only the selected set.

---

# Step 3 — Implement: pre-merge workflow (Audits A + D)

Skip if both Audit A and Audit D are Compliant.

Select the ecosystem-appropriate setup action and install command:

| Ecosystem | Setup action | Install command |
|---|---|---|
| Node.js | `actions/setup-node@v4` with `node-version: '20'` | `npm ci` |
| Python | `actions/setup-python@v5` with `python-version: '3.x'` | `pip install -r requirements.txt` or `poetry install` or `pip install -e .` |
| JVM | `actions/setup-java@v4` with `distribution: temurin`, `java-version: '17'` | `./gradlew dependencies --no-daemon` |
| Rust | `dtolnay/rust-toolchain@stable` | `cargo fetch` |
| Container / Kubernetes | none (docker buildx) | none |
| Unknown | none | `# TODO: add install step` |

**Derive each check job's `run:` command** from the check name using these conventions:

| Check name | Derived command |
|---|---|
| `build` | Node: `npm run build` / JVM: `./gradlew build` / Python: `python -m build` / Rust: `cargo build` |
| `test` | Node: `npm test` / JVM: `./gradlew test` / Python: `pytest` / Rust: `cargo test` |
| `lint` | Node: `npm run lint` / Python: `ruff check .` / Rust: `cargo clippy` |
| `type-check` | Node: `npm run type-check` or `npx tsc --noEmit` |
| `security-scan` | `gh api ... # TODO: configure security scanner` |
| other | AskUserQuestion: "What command runs `<check-name>`?" |

**If no PR workflow exists** — create `.github/workflows/pr-checks.yml`:

```yaml
name: PR Checks

on:
  pull_request:
    branches: [<base-branch>]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
<for each check in plan.ci-pipeline.pre-merge-checks[]:>
  <check-name>:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - <setup action if ecosystem requires it>
      - name: Install dependencies
        run: <install cmd>
      - name: <check-name>
        run: <derived command>

<if plan.ci-pipeline.publish-dry-run-cmd is non-empty:>
  dry-run:
    needs: [<all check-name job ids>]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - <setup action>
      - name: Install dependencies
        run: <install cmd>
      - name: Publish dry-run
        run: <plan.ci-pipeline.publish-dry-run-cmd>
<if any required-secrets appear in publish-dry-run-cmd:>
        env:
<          <NAME>: ${{ secrets.<NAME> }}>
```

**If a PR workflow exists but is missing jobs** — use Edit to append the missing jobs at the end of the `jobs:` block. Prefix the block with: `# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>`.

---

# Step 4 — Implement: release workflow (Audits B + C + E + F + G)

## 4a — Create or patch the release workflow file

**If `plan.release-workflow-file` does not exist** — create it with the full structure below.

**If it exists** — read it; apply only the targeted fixes identified in Audits B, C, E, F, G. Do not touch compliant sections.

Generate the `on:` block from `plan.ci-pipeline.release-trigger`:

```yaml
# tag-on-main:
on:
  push:
    tags: ['v[0-9]*']

# merge-to-main:
on:
  push:
    branches: [<base-branch>]

# manual-dispatch:
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (e.g. 1.2.3)'
        required: true

# branch-push:
on:
  push:
    branches: ['release/*']
```

Generate the `permissions:` block from `ship-meaning`:

```yaml
# publish (npm, pypi, cargo, maven-central):
permissions:
  contents: write
  id-token: write

# container / deploy:
permissions:
  contents: read
  packages: write

# merge-only:
permissions:
  contents: read
```

## 4b — Job templates

Generate one job per entry in `plan.ci-pipeline.release-jobs[]`, in order, with `needs:` chaining. Match job names to these templates:

**`build` job:**
```yaml
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - <setup action>
      - name: Install dependencies
        run: <install cmd>
      - name: Build
        run: <ecosystem build command>
```

**`test` job:**
```yaml
  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - <setup action>
      - name: Install dependencies
        run: <install cmd>
      - name: Test
        run: <ecosystem test command>
```

**`version-bump` job** (when `plan.version-bump-rule` requires an explicit bump step in the release workflow — i.e., not `release-please` or `changesets`, which have their own workflow):
```yaml
  version-bump:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          fetch-depth: 0
      - <setup action>
      - name: Bump version
        run: <plan.version-bump-cmd>
      - name: Commit version bump
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git diff --staged --quiet || git commit -m "chore: bump version"
          git push
```

**`publish` job — generated per `ship-meaning`:**

For `publish` (Node.js / npm):
```yaml
  publish:
    needs: [build, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - name: Install dependencies
        run: npm ci
      - name: Publish
        run: <plan.ci-pipeline.publish-cmd>
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
<for each additional secret in plan.required-secrets[] not already in env:>
          <NAME>: ${{ secrets.<NAME> }}
```

For `publish` (Python / PyPI — OIDC preferred):
```yaml
  publish:
    needs: [build, test]
    runs-on: ubuntu-latest
    environment: pypi
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.x'
      - name: Build distribution
        run: python -m build
      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
<if secrets.PYPI_TOKEN in required-secrets:>
        with:
          password: ${{ secrets.PYPI_TOKEN }}
```

For `publish` (JVM / Maven Central):
```yaml
  publish:
    needs: [build, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Publish
        run: <plan.ci-pipeline.publish-cmd>
        env:
<for each secret in plan.required-secrets[]:>
          <NAME>: ${{ secrets.<NAME> }}
```

For `publish` (container-image):
```yaml
  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: <registry-hostname from plan>/${{ github.repository }}
      - uses: docker/login-action@v3
        with:
          registry: <registry-hostname>
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

For `deploy-rolling` (Kubernetes / Helm) — generate one deploy job per environment in `plan.ship-environments[]`:
```yaml
  deploy-<env-name>:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: <env-name>
<if not first env or auto-promote is false: add `environment.url` and require manual approval via GitHub environment protection rules>
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to <env-name>
        run: <plan.ci-pipeline.publish-cmd>
        env:
<for each secret in plan.required-secrets[]:>
          <NAME>: ${{ secrets.<NAME> }}
```

For `deploy-immutable` (blue-green, Lambda, Fly, etc.):
```yaml
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: <plan.ship-environments[0].name>
    steps:
      - uses: actions/checkout@v4
      - name: Deploy immutable artifact
        run: <plan.ci-pipeline.publish-cmd>
        env:
<for each secret in plan.required-secrets[]:>
          <NAME>: ${{ secrets.<NAME> }}
```

## 4c — Version-bump-rule workflows (Audit G)

For `release-please`:
Create `.github/workflows/release-please.yml` if absent:
```yaml
name: Release Please

on:
  push:
    branches: [<base-branch>]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          release-type: <derive from ecosystem: node / python / java / rust / simple>
          token: ${{ secrets.GITHUB_TOKEN }}
```

For `changesets`:
Create `.github/workflows/changesets.yml` if absent:
```yaml
name: Changesets Release

on:
  push:
    branches: [<base-branch>]

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - <setup action>
      - name: Install dependencies
        run: <install cmd>
      - name: Create release pull request or publish
        uses: changesets/action@v1
        with:
          publish: <plan.ci-pipeline.publish-cmd>
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
<for each additional secret in plan.required-secrets[]:>
          <NAME>: ${{ secrets.<NAME> }}
```

---

# Step 5 — Implement: post-publish verification (Audit H)

Skip if `plan.post-publish-checks[]` is empty.

Add a `post-publish` job to `plan.release-workflow-file` after the publish job. If the job already exists, append only the missing check steps to it.

```yaml
# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>
  post-publish:
    needs: <publish-job-name>
    runs-on: ubuntu-latest
    steps:
      - name: Wait for propagation
        run: sleep <plan.propagation-window-min-minutes * 60>

<for each check in plan.post-publish-checks[]:>
      - name: Check <check.kind>
        run: |
          MAX_WAIT=$(( <plan.propagation-window-max-minutes> * 60 ))
          ELAPSED=0
          while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
            if <check.cmd — substitute $VERSION with the release tag>; then
              echo "Check passed"
              exit 0
            fi
            sleep <plan.poll-interval-seconds>
            ELAPSED=$(( ELAPSED + <plan.poll-interval-seconds> ))
          done
          echo "Check timed out after <plan.propagation-window-max-minutes> minutes"
          exit 1
```

Substitute template variables in `check.cmd`:
- `$VERSION` → `${{ github.ref_name }}` (strip leading `v` when needed with `${GITHUB_REF_NAME#v}`)
- `$PACKAGE` → package name from `version-source-of-truth[0]`
- `$IMAGE` → registry image path
- `$NAMESPACE` / `$DEPLOYMENT` → from publish-cmd or plan infra data

---

# Step 6 — Implement: rollback workflow (Audit I)

Skip if `plan.rollback-mechanism` ∈ {`feature-flag-off`, `git-revert`}.

If `.github/workflows/rollback.yml` does not exist, create it:

```yaml
name: Rollback

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to roll back to (e.g. 1.2.2)'
        required: true
      reason:
        description: 'Reason for rollback'
        required: true

permissions:
  contents: write

jobs:
  rollback:
    runs-on: ubuntu-latest
    environment: <plan.ship-environments[last].name or 'production'>
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

<derive steps from plan.rollback-mechanism:>

# gh-release-yank:
      - name: Yank GitHub release
        run: |
          gh release delete "v${{ inputs.version }}" --yes --cleanup-tag
          echo "Yanked v${{ inputs.version }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

# redeploy-prior:
      - name: Redeploy prior version
        run: <plan.ci-pipeline.publish-cmd — substitute version with inputs.version>
        env:
<for each secret in plan.required-secrets[]:>
          <NAME>: ${{ secrets.<NAME> }}

# blue-green-switch:
      - name: Switch traffic to prior slot
        run: |
          # TODO: implement blue-green switch for version ${{ inputs.version }}
          # Derive from plan publish-cmd and infra configuration
          echo "Switch to prior slot — implement this step"

# Any mechanism: record the rollback
      - name: Record rollback
        run: |
          echo "Rolled back to ${{ inputs.version }}: ${{ inputs.reason }}" \
            >> .rollback-history.txt || true
```

---

# Step 7 — Implement: runbook stubs (Audit J)

For each `{ id, triggers[], steps[] }` in `plan.recovery-playbooks[]` where `docs/runbooks/<id>.md` does not exist:

First ensure `docs/runbooks/` exists: `mkdir -p docs/runbooks`.

Create `docs/runbooks/<id>.md`:

```markdown
# Runbook: <id>

## When this fires

CI logs matching any of the following patterns trigger this runbook:

<for each trigger in triggers[]:>
- `<trigger>`

## Steps

<for each step numbered 1..N in steps[]:>
<N>. <step>

## Notes

_Seeded from ship plan `recovery-playbooks[<id>]`. Update this file as the playbook evolves._
_Last synced from plan version: <plan.plan-version>_
```

---

# Step 8 — Implement: code-quality CI gates (Audit K)

Skip if the plan has no `code-quality` block or every gate is Compliant.

For each gate (`format-check`, `lint`, `type-check`, `test-coverage`) with a non-empty `cmd`, ensure it runs as a step in the PR workflow (`pr-checks.yml` from Step 3, or the discovered PR workflow). Add a job per gate (or steps within a shared job), using the gate's **literal `cmd` from the plan** — do not re-derive it:

```yaml
# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>
  <gate-name>:                       # e.g. lint, type-check, format-check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - <ecosystem setup action (Step 3 table)>
      - name: Install dependencies
        run: <install cmd>
      - name: <gate-name>
        run: <plan.code-quality.<gate>.cmd>
```

For `test-coverage` with a `min-percent`, append the threshold to the command if the tool supports it (e.g. `pytest --cov --cov-fail-under=<min-percent>`, `jest --coverage --coverageThreshold=...`); otherwise add a `# TODO: enforce <min-percent>% threshold` comment next to the run step.

---

# Step 9 — Implement: commit + PR-title convention CI (Audit L)

Skip if `code-quality.commit-convention.spec == none` and `code-quality.pr-title-convention.spec == none`.

## 9a — Commitlint config (when `commit-convention.spec == conventional` and config absent)
Create `commitlint.config.js` (or the path in `commit-convention.config-path`):
```js
// Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>
module.exports = { extends: ['@commitlint/config-conventional'] };
```
Record in the compliance artifact that `@commitlint/config-conventional` + `@commitlint/cli` must be installed (do not run the install).

## 9b — Commitlint CI job (when `ci` ∈ `commit-convention.enforce`)
Add to the PR workflow:
```yaml
# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>
  commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - <node setup action>
      - run: npm ci
      - name: Lint commit messages
        run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }}
```
(For non-Node ecosystems, prefer the `wagoid/commitlint-github-action@v6` action instead of `npx`.)

## 9c — PR-title lint (when `pr-title-convention.spec == conventional`)
Create `.github/workflows/pr-title.yml` if absent:
```yaml
name: PR Title
on:
  pull_request:
    types: [opened, edited, synchronize]
permissions:
  pull-requests: read
jobs:
  lint-pr-title:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

# Step 10 — Implement: local git hooks (Audit M)

Skip if `local-dx.git-hooks.framework == none` or Compliant.

Generate the framework's config and wire each planned hook from `git-hooks.hooks`. Match the framework:

**husky** (Node): ensure `package.json` `scripts.prepare: "husky"`; create `.husky/<hook>` files, each running the planned commands. Default wiring: `.husky/pre-commit` → `npx lint-staged`; `.husky/commit-msg` → `npx --no -- commitlint --edit "$1"` (only if `commit-convention.spec ≠ none`). Note that `husky` + `lint-staged` must be installed.

**lefthook**: create/extend `lefthook.yml`:
```yaml
# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>
pre-commit:
  commands:
    lint-staged: { run: <plan pre-commit cmds> }
commit-msg:
  commands:
    commitlint: { run: "npx commitlint --edit {1}" }
```

**pre-commit** (Python-friendly): create `.pre-commit-config.yaml` with repos/hooks matching the planned commands; note `pre-commit install` must be run.

**simple-git-hooks**: add a `simple-git-hooks` block to `package.json` mapping each hook to its command.

If `lint-staged` is referenced and no `lint-staged` config exists, also write a minimal one from the format-check + lint commands in Block H.

**Inert-until-installed guard (applies to Steps 9 + 10).** A generated commit-msg hook or commitlint CI job that calls `commitlint`/`lint-staged` **fails or silently no-ops until the dev-deps are installed and the framework's install step is run**. For every config/hook generated here:
- Add an exact install command to `deps-to-install` in the compliance artifact (e.g. `npm i -D husky lint-staged @commitlint/{cli,config-conventional}`, `pipx install pre-commit`).
- Add the framework install step to the next-steps (`npm run prepare` for husky, `pre-commit install`, `lefthook install`).
- Emit a one-line **warning** in the chat return and the compliance artifact: *"git hooks / commit CI are inert until you run `<install>` + `<framework install>`."* Do not present the hook as working when it isn't yet.

## Idempotency (Steps 8–12)

Mirror the outbound steps' re-run safety: **read each target file first and skip the write if it already equals the desired content**; appends to existing workflows/configs go through the no-overwrite/targeted-edit rules. Husky `prepare` script and `lint-staged`/framework wiring are no-ops when already present. `gh api -X PUT`/`PATCH` calls (Steps 12, 14, 15) are inherently idempotent — re-applying the same desired state is safe. A second `build` run on an already-compliant repo writes nothing and mutates nothing.

---

# Step 11 — Implement: developer-experience files (Audit N)

Skip if no `local-dx` block.

- `editorconfig: true` and absent → create a baseline `.editorconfig` (root `[*]` with `charset=utf-8`, `end_of_line=lf`, `insert_final_newline=true`, `trim_trailing_whitespace=true`, `indent_style`/`indent_size` matching the ecosystem).
- For each `runtime-version-files[]` entry that is absent → create it pinned to the version discovered in Step 0 (or a `# TODO: pin version` if unknown).
- `task-runner.kind ≠ none` → create or extend the runner file with each planned target, especially a `setup`/`bootstrap` target running `local-dx.bootstrap-cmd`. Use targeted edits if the file exists.
- `contributing-doc: true` and absent → create a `CONTRIBUTING.md` stub covering: bootstrap command, how to run gates locally (the Block-H commands), commit-convention rules, and the PR process.

---

# Step 12 — Implement: repo governance + branch protection (Audit O)

Skip if no `governance` block.

## 12a — Governance files
- `codeowners[]` non-empty and absent → create `CODEOWNERS` (`.github/CODEOWNERS`) with one line per `{ path, owners }`.
- `pr-template: true` and absent → create `.github/PULL_REQUEST_TEMPLATE.md` (summary, linked issue, testing, checklist mirroring the Block-H gates).
- `issue-templates: true` and absent → create `.github/ISSUE_TEMPLATE/bug_report.md` + `feature_request.md` + `config.yml`.
- `dependency-automation.tool` → create the config covering `ecosystems[]`:
  - `dependabot` → `.github/dependabot.yml` with one `package-ecosystem` entry per ecosystem (+ `github-actions`), `schedule.interval` from `schedule`.
  - `renovate` → `renovate.json` extending `config:recommended`, schedule from `schedule`.

## 12b — Branch protection (gated remote mutation)

Compute the desired protection from `governance.branch-protection`. Read the current state — for `mechanism: branch-protection`, `gh api repos/<owner>/<repo>/branches/<base>/protection` (404 = none); for `mechanism: ruleset`, `gh api repos/<owner>/<repo>/rulesets`.

**Mechanism mismatch guard.** If the plan's `mechanism` differs from what the repo already uses (e.g. plan says `branch-protection` but the base branch is governed by a ruleset), do NOT create a conflicting second control — surface the mismatch and ask the user to reconcile (switch the plan's `mechanism`, or migrate the repo). Two overlapping controls is worse than one.

**Stronger-than-plan guard.** If live protection already *exceeds* the plan (more required checks, higher approval count, stricter flags), report Audit O as `compliant (stronger)` and do NOT propose weakening it. Only widen toward the plan; reducing requires the user to explicitly lower the plan first.

For `mechanism: branch-protection`, build the desired payload (use `checks` — the current shape; fall back to `contexts` if targeting an older GHES):

```jsonc
// PUT repos/<owner>/<repo>/branches/<base>/protection
{
  "required_status_checks": {
    "strict": <require-up-to-date>,
    "checks": [ { "context": "<required-check>" }, ... ]    // legacy: "contexts": [<required-check>, ...]
  },
  "enforce_admins": <enforce-admins>,
  "required_pull_request_reviews": {
    "required_approving_review_count": <required-approvals>,
    "dismiss_stale_reviews": <dismiss-stale-reviews>,
    "require_code_owner_reviews": <true when governance.codeowners[] is non-empty, else require-code-owner-reviews>
  },
  "required_conversation_resolution": <require-conversation-resolution>,
  "required_linear_history": <require-linear-history>,
  "allow_force_pushes": <allow-force-pushes>,    // default false
  "allow_deletions": <allow-deletions>,          // default false
  "restrictions": null
}
```

`require_code_owner_reviews` is load-bearing: without it the `CODEOWNERS` file generated in 12a is cosmetic. Set it `true` whenever `codeowners[]` is non-empty.

For `mechanism: ruleset`, build the equivalent repository ruleset (`POST` to create / `PUT repos/<owner>/<repo>/rulesets/<id>` to update) with rules `required_status_checks`, `pull_request` (`required_approving_review_count`, `dismiss_stale_reviews_on_push`, `require_code_owner_review`), `required_linear_history`, `non_fast_forward`, and `required_conversation_resolution`, targeting `refs/heads/<base>`.

Then branch on `apply-via`:
- **`apply-via: manual`** → never call the API. Write the ready-to-run `gh api -X PUT ... --input <payload>` command into the compliance artifact and the chat return. Set `branch-protection-applied: printed`.
- **`apply-via: gh-api`** → show the current-vs-desired diff and the exact command, then AskUserQuestion:

```yaml
question: "Apply branch protection to `<base>` on `<owner>/<repo>` now? This mutates the remote repository."
header: "Branch protection"
options:
  - { label: "Apply via gh api (Recommended)", description: "Run the PUT now. Requires repo admin; needs `gh auth` with admin scope." }
  - { label: "Print command only",             description: "Write the gh api command to the compliance artifact; don't mutate the remote." }
  - { label: "Skip",                            description: "Leave branch protection unchanged." }
multiSelect: false
```

  - "Apply" → run the `gh api -X PUT` call. On success set `branch-protection-applied: yes`; on failure (e.g. 403 — not admin) print the error + the manual command and set `branch-protection-applied: failed`.
  - "Print command only" → set `branch-protection-applied: printed`.
  - "Skip" → set `branch-protection-applied: skipped`.

Never apply silently and never without showing the payload first.

---

# Step 13 — Implement: security & supply-chain gates (Audit P)

Skip if no `security` block. For each non-`none` gate (align generated steps to the conventions in `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/review/supply-chain.md`):

- **SAST** — `codeql` → create `.github/workflows/codeql.yml` (`on: pull_request` + `schedule`, `github/codeql-action/{init,analyze}@v3`, languages auto-detected from the ecosystem). Other tools → add a CI step running `security.sast.cmd`.
- **Dependency audit** — add a step to the PR workflow running `dependency-audit.cmd` with the `fail-on` threshold (e.g. `npm audit --audit-level=high`, `pip-audit`, `cargo audit`, `osv-scanner -r .`).
- **Secret scanning** — add a CI step (e.g. `gitleaks/gitleaks-action@v2`); when `pre-commit: true`, also wire it into the Block-I hook framework (a `pre-commit` hook entry).
- **SBOM** — add a step to the release workflow generating the SBOM (`anchore/sbom-action` / `cyclonedx-*`), and when `publish-with-release` attach it to the GitHub release.
- **License check** — add a PR step enforcing `allow[]`/`deny[]` (e.g. `license-checker --onlyAllow`, `cargo-deny check licenses`).
- **Scheduled scans** — gates with a `schedule` also get an `on: schedule:` trigger (a `security-scan.yml` workflow) so they run independent of PR traffic.

Enabled PR-time gates that aren't already in `pre-merge-checks[]` are added there too (consistent with Blocks H/C).

# Step 14 — Implement: environment protection (Audit Q — gated remote mutation)

Skip envs without a `protection` block. For each, compute the desired rules and read live state via `gh api repos/<owner>/<repo>/environments/<name>`. Apply through the **same Apply / Print-only / Skip gate as Step 12b**, keyed off the environment's `apply-via` (inherit `governance.branch-protection.apply-via` when unset):

```
gh api -X PUT repos/<owner>/<repo>/environments/<name> \
  -F wait_timer=<wait-timer-minutes> \
  -F 'reviewers[][type]=Team' -F 'reviewers[][id]=<team-id>' ... \
  -F 'deployment_branch_policy[protected_branches]=<bool>' -F 'deployment_branch_policy[custom_branch_policies]=<bool>'
```

Record `environment-protection-applied: <yes | printed | skipped | failed | n/a>`. Same rules: show diff + payload first, never silent, print-only writes commands to the compliance artifact.

# Step 15 — Implement: merge controls (Audit R — gated remote mutation)

Skip if no `merge` block. Compute desired repo merge settings; read live via `gh api repos/<owner>/<repo>`. Apply through the Step-12b gate:

```
gh api -X PATCH repos/<owner>/<repo> \
  -F allow_squash_merge=<bool> -F allow_merge_commit=<bool> -F allow_rebase_merge=<bool> -F allow_auto_merge=<bool>
```

For `merge-queue: true`, configure the merge queue on the base branch (via ruleset/branch settings); **detect tier support first** — if the repo's plan tier doesn't offer merge queue, record a `warn` and skip rather than fail. Record `merge-settings-applied: <yes | printed | skipped | failed | n/a>`.

# Step 16 — Implement: CI ergonomics (Audit S)

Skip if no `ci-ergonomics` block. This step *modifies workflows produced by earlier steps* (3, 4, 8, 9, 13) — run it last among the file-generation steps, via targeted edits (no overwrite):

- `dep-cache: true` → add `cache:` to the `setup-*` action (e.g. `actions/setup-node` `cache: npm`) or an `actions/cache` step keyed on the lockfile.
- `matrix` → add `strategy.matrix` over the planned `os`/`versions` to the build/test jobs; reference `${{ matrix.* }}` in `runs-on`/setup.
- `release-concurrency: true` → add a `concurrency:` block to the release workflow (group by workflow + ref; do **not** `cancel-in-progress` for releases).
- `path-filters: true` → add `paths:`/`paths-ignore:` to PR workflow triggers where the plan scopes them.

When `repo-topology.monorepo` is true, scope matrix/path-filters per workspace and generate one dependency-automation entry per workspace (Step 12a).

---

# Step 17 — Validate

After all writes, for each `.github/workflows/*.yml` file created or patched:

1. **YAML syntax:** run `python -c "import sys, yaml; yaml.safe_load(open(sys.argv[1]))" <file>`. If it fails: print the error, do NOT revert (show the user the file and the error), set `yaml-syntax: fail` in the compliance artifact.
2. **actionlint:** run `actionlint <file>` if available (`where actionlint` on Windows, `which actionlint` on Unix). If not installed: print *"actionlint not found — skip workflow linting. Install via `brew install actionlint` or `go install github.com/rhysd/actionlint/cmd/actionlint@latest` to validate locally."* Set `actionlint: skipped`.

For each generated **inbound config file**:

3. **JSON files** (`renovate.json`, `dependabot` is YAML, commitlint `.json` variants): parse with `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`. **YAML files** (`lefthook.yml`, `.pre-commit-config.yaml`, `dependabot.yml`): `python -c "import sys,yaml; yaml.safe_load(open(sys.argv[1]))" <file>`. On failure: show the file + error, do not revert, set `config-syntax: fail`.

---

# Step 18 — Write compliance artifact

Write `.ai/pipeline-compliance.md`:

```yaml
---
schema: sdlc/v1
type: pipeline-compliance
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
plan-version-at-run: <plan.plan-version>
ship-meaning: <plan.ship-meaning>
ecosystem: <detected>
files-created: [<list>]
files-patched: [<list>]
files-compliant: [<list>]
audits:
  A-pre-merge-checks: <compliant | fixed | missing | skipped>
  B-release-trigger: <compliant | fixed | missing>
  C-release-jobs: <compliant | fixed | missing>
  D-dry-run-cmd: <compliant | fixed | missing | skipped>
  E-publish-cmd: <compliant | fixed | missing>
  F-required-secrets: <compliant | fixed | missing>
  G-version-bump: <compliant | fixed | missing>
  H-post-publish: <compliant | fixed | missing | skipped>
  I-rollback: <compliant | fixed | missing | skipped>
  J-runbooks: <compliant | fixed | missing | skipped>
  K-quality-gates: <compliant | fixed | missing | skipped>
  L-commit-pr-title: <compliant | fixed | missing | skipped>
  M-git-hooks: <compliant | fixed | missing | skipped>
  N-dx-files: <compliant | fixed | missing | skipped>
  O-governance: <compliant | fixed | missing | skipped>
  P-security: <compliant | fixed | missing | skipped>
  Q-env-protection: <compliant | fixed | missing | skipped>
  R-merge-controls: <compliant | fixed | missing | skipped | warn>
  S-ci-ergonomics: <compliant | fixed | missing | skipped>
branch-protection-applied: <yes | printed | skipped | failed | n/a>
environment-protection-applied: <yes | printed | skipped | failed | n/a>
merge-settings-applied: <yes | printed | skipped | failed | warn | n/a>
secrets-to-set-manually:
  - { name: "<NAME>", purpose: "<from plan>", command: "gh secret set <NAME>" }
deps-to-install:                       # dev-deps the generated config references but does not install
  - { name: "<package>", reason: "<commitlint / husky / lint-staged / etc.>", command: "<install cmd>" }
validation:
  yaml-syntax: <pass | fail>
  actionlint: <pass | fail | skipped>
  config-syntax: <pass | fail | skipped>
---

# Pipeline Compliance — <project-name>

## Files created
<list with one-line description>

## Files patched
<list with brief description of each edit>

## Secrets requiring manual configuration

These secrets are referenced in the generated workflows but must be set manually:

| Secret | Purpose | Command |
|---|---|---|
<for each required-secret: | NAME | purpose | `gh secret set NAME` |>

## Dev dependencies to install

The generated inbound-DX config references these but does not install them:

| Package | For | Command |
|---|---|---|
<for each dep in deps-to-install: | name | reason | `install cmd` |>

## Remote settings (gated)

For each of the three gated mutations, give the status and — when `printed`/`failed`/`manual` — the exact `gh api` command + payload so the user can apply it by hand:

- **Branch protection:** `<branch-protection-applied>` — `gh api -X PUT repos/<owner>/<repo>/branches/<base>/protection --input <payload>` (or the ruleset equivalent).
- **Environment protection:** `<environment-protection-applied>` — one `gh api -X PUT repos/<owner>/<repo>/environments/<name>` per protected env.
- **Merge settings:** `<merge-settings-applied>` — `gh api -X PATCH repos/<owner>/<repo>` (+ merge-queue note if the tier doesn't support it).

## Validation
<yaml-syntax, actionlint, and config-syntax results per file>

## Re-run compliance check

After setting secrets and pushing, re-run this command to verify full compliance:
```
/wf ship-plan build --dry-run
```
```

---

# Step 19 — Chat return

Return — lead with the substance first, then the receipt:
- **narrative:** a short prose paragraph (not bullets) telling the story of what this stage produced — what it *is* and how, the key decisions and counts, and the top risk or caveat. The router leads the chat summary with this paragraph; the fields below are the receipt beneath it.
- `wrote: <list of created/patched files>`
- `plan-version: <plan.plan-version>`
- `ecosystem: <detected>`
- `audits: <A–S final status>`
- `branch-protection-applied: <yes | printed | skipped | failed | n/a>`
- `environment-protection-applied: <yes | printed | skipped | failed | n/a>`
- `merge-settings-applied: <yes | printed | skipped | failed | warn | n/a>`
- `secrets-to-set-manually: <list of names with gh secret set commands>`
- `deps-to-install: <list of dev-deps the inbound config needs, with install commands>`
- `warnings: <inert-until-installed note; merge-queue tier unavailable; mechanism mismatch; etc.>`
- `validation: yaml-syntax=<status>, actionlint=<status>, config-syntax=<status>`
- `next-steps:`
  - Install dev deps the inbound config references: `<install cmd>` (commitlint/husky/lint-staged/etc.); then run the hook-framework install (e.g. `npm run prepare`, `pre-commit install`) — **hooks/CI are inert until this is done**
  - Set secrets: `gh secret set <NAME>` for each required secret (or via GitHub Settings → Secrets)
  - For any `*-applied` field that is `printed`/`skipped`/`failed`, run the `gh api` command from the compliance artifact (needs repo-admin auth)
  - Push a PR to trigger the pre-merge workflow (build/test/lint/type-check/coverage + commitlint + PR-title + security gates)
  - Create a test tag or trigger `workflow_dispatch` to test the release workflow end-to-end
  - `/wf ship-plan build --dry-run` to re-audit after making changes
  - `/wf ship <slug>` when ready for the first real release
