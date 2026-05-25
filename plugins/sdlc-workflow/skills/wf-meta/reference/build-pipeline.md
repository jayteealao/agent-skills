---
description: Reads `.ai/ship-plan.md` and audits the repo's GitHub Actions workflows for compliance. Creates missing workflows, adds missing jobs/steps to existing workflows (no file is ever overwritten), and brings the CI/CD configuration into full compliance with the plan. Each gap is shown to the user before any write occurs.
argument-hint: "[--dry-run]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`, `.ai/ship-plan.md`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language. Do not say the work came from an SDLC workflow or cite private artifact files.

You are running `wf-meta build-pipeline`. Your job: read the ship plan as the specification, measure the gap between what exists and what is required, confirm with the user, then implement only what is missing.

# Design contract

- **`.ai/ship-plan.md` is the specification.** What it says is right; what is in the repo is the current implementation. Your job is to close the gap.
- **No overwrites.** Never replace an existing file wholesale. For existing workflow files, use targeted edits — append jobs, add steps, extend env blocks, fix `on:` triggers. The existing file's structure and content are preserved.
- **Fully runnable output.** Generated YAML must be syntactically valid and produce a working pipeline given the plan's secrets and commands. Use pinned action versions (`actions/checkout@v4`, etc.). Include `permissions:` blocks. Substitute the plan's literal `publish-cmd`, `publish-dry-run-cmd`, and `required-secrets[]` — not placeholders.
- **Minimal diff.** Only add what is needed. Do not reorganize, rename, or reformat existing content.
- **GitHub Actions only.** Generate `.github/workflows/*.yml` files only.
- **Trace insertions.** When adding to an existing file, add a single-line comment above the inserted block: `# Added by wf-meta build-pipeline — plan v<N>, <YYYY-MM-DD>`. Never add this comment to content the user wrote themselves.

---

# Step 0 — Orient

1. Parse `$ARGUMENTS` for `--dry-run`. If present, run all audit steps and generate the full gap report but write nothing. Label every planned change `[DRY RUN — not written]`.
2. **Read `.ai/ship-plan.md`.** STOP if missing: *"No ship plan found at `.ai/ship-plan.md`. Run `/wf-meta init-ship-plan` first."* Parse all blocks A–G into in-memory state.
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
5. **Determine the base branch** from `plan.ship-environments[0].name` or default `main`.

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
```

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

**If a PR workflow exists but is missing jobs** — use Edit to append the missing jobs at the end of the `jobs:` block. Prefix the block with: `# Added by wf-meta build-pipeline — plan v<N>, <YYYY-MM-DD>`.

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
# Added by wf-meta build-pipeline — plan v<N>, <YYYY-MM-DD>
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

# Step 8 — Validate

After all writes, for each `.github/workflows/*.yml` file created or patched:

1. **YAML syntax:** run `python -c "import sys, yaml; yaml.safe_load(open(sys.argv[1]))" <file>`. If it fails: print the error, do NOT revert (show the user the file and the error), set `yaml-syntax: fail` in the compliance artifact.
2. **actionlint:** run `actionlint <file>` if available (`where actionlint` on Windows, `which actionlint` on Unix). If not installed: print *"actionlint not found — skip workflow linting. Install via `brew install actionlint` or `go install github.com/rhysd/actionlint/cmd/actionlint@latest` to validate locally."* Set `actionlint: skipped`.

---

# Step 9 — Write compliance artifact

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
secrets-to-set-manually:
  - { name: "<NAME>", purpose: "<from plan>", command: "gh secret set <NAME>" }
validation:
  yaml-syntax: <pass | fail>
  actionlint: <pass | fail | skipped>
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

## Validation
<yaml-syntax and actionlint results per file>

## Re-run compliance check

After setting secrets and pushing, re-run this command to verify full compliance:
```
/wf-meta build-pipeline --dry-run
```
```

---

# Step 10 — Chat return

Return ONLY:
- `wrote: <list of created/patched files>`
- `plan-version: <plan.plan-version>`
- `ecosystem: <detected>`
- `audits: <A–J final status>`
- `secrets-to-set-manually: <list of names with gh secret set commands>`
- `validation: yaml-syntax=<status>, actionlint=<status>`
- `next-steps:`
  - Set secrets: `gh secret set <NAME>` for each required secret (or via GitHub Settings → Secrets)
  - Push a PR to trigger the pre-merge workflow
  - Create a test tag or trigger `workflow_dispatch` to test the release workflow end-to-end
  - `/wf-meta build-pipeline --dry-run` to re-audit after making changes
  - `/wf ship <slug>` when ready for the first real release
