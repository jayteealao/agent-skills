---
description: Author the project-level `.ai/ship-plan.md` — a one-time, repo-scoped contract that captures what "ship" means for this project (publishing, version scheme, CI/CD wiring, post-publish verification, rollout/rollback, recovery playbooks, announcements). Works by **discovery → hypothesis → confirm**: reads what's already in the repo (CI workflows, infra-as-code, package manifests, runbooks), proposes a ship-shape hypothesis, then lets the user confirm or correct each contract. Optional `--from-template <kind>` biases the hypothesis toward a known shape; the template is a *seed*, not a control-flow branch. Read by every subsequent `/wf ship <slug>` invocation.
argument-hint: "[--from-template <kotlin-maven-central|npm-public|pypi|container-image|server-deploy|library-internal>]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`, `.ai/ship-plan.md`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language. Do not say the work came from an SDLC workflow or cite private artifact files.

You are running `wf-meta init-ship-plan`, a **one-time project-level setup utility**. The plan you author here is consumed by every `/wf ship <slug>` invocation thereafter.

# Design intent

The plan is a *contract* between this project and `/wf ship`. Authoring it well means **understanding how this specific repo actually ships**, not picking the nearest preset and filling blanks.

This command therefore runs three loops:
1. **Discovery** — read what the repo already says (CI workflows, infra-as-code, package manifests, runbooks). Don't ask before reading.
2. **Hypothesis** — propose an inferred ship-shape and let the user confirm, correct, or replace each piece. AskUserQuestion options are *prompts to refine a hypothesis*, not multiple-choice quizzes — `Other (describe)` is always available.
3. **Codify** — write a schema with a small **required core** (the fields `/wf ship` reads) plus **open extensions** (`additional-contracts[]`) for project-specific shape.

Templates are **exemplar text** you can show the user when it helps. They are not branches in the control flow.

# What this command produces

A single file: **`.ai/ship-plan.md`** at the **repo root** (not under `.ai/workflows/`). The plan is per-project, not per-workflow.

# What this command does NOT do

- It does not run a release.
- It does not modify workflow artifacts under `.ai/workflows/`.
- It does not author `09-ship-run-*.md` files (those are written per-release by `/wf ship`).
- It does not duplicate work already in `08-handoff.md` (handoff is per-PR readiness; this plan is per-release).
- It does not run any of the commands it discovers (no `gradle publish --dry-run`, no `terraform plan`, etc.). Discovery is read-only.

# CRITICAL — execution discipline

You are a **plan author**, not a problem solver.
- Do NOT make code changes, run builds, or modify CI files.
- Do NOT overwrite an existing `.ai/ship-plan.md`. If one exists, STOP and tell the user: *"Plan exists at `.ai/ship-plan.md`. Use `/wf-meta amend ship-plan` to edit one block."*
- Do NOT skip discovery (Step 1) even when `--from-template` is passed. The template biases the hypothesis; discovery decides whether the hypothesis is actually right for this repo.
- Follow the numbered steps below exactly in order.

---

# Step 0 — Orient

1. Parse `$ARGUMENTS` for `--from-template <kind>`. If present, validate `<kind>` ∈ {`kotlin-maven-central`, `npm-public`, `pypi`, `container-image`, `server-deploy`, `library-internal`}. Record it as `template-hint`. If an unknown kind, STOP and list the valid kinds. **Do not read the template file yet** — discovery comes first; you'll use the template as a seed during the hypothesis pass (Step 2).
2. STOP if `.ai/ship-plan.md` already exists. Tell the user to amend instead.
3. Detect repo basics: `git remote get-url origin`, derive `<owner>/<repo>` and `project-name`.

---

# Step 1 — Discovery pass

Read the repo, in parallel, to understand what's actually there. **No questions yet.** Surface findings to the user as a *discovery report* at the end of this step.

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

  additional-contracts-suggested:
    - { id: data-migration,        reason: "<file evidence>" }   # e.g. liquibase/ found, alembic in pyproject
    - { id: feature-flag-rollout,  reason: "<file evidence>" }
    - { id: infrastructure-as-code, reason: "<file evidence>" }
    - { id: mobile-app-store,      reason: "<file evidence>" }
    - { id: schema-registry,       reason: "<file evidence>" }
```

## 1.3 Present discovery report

Show the user the discovery report as a compact bullet summary (no AskUserQuestion yet). Make it skimmable:

```
Discovered:
- Ship shape looks like: deploy-rolling to k8s (helm/ + .github/workflows/deploy.yml on:push:main)
- Version source-of-truth candidates: helm/Chart.yaml (version: 0.4.2), package.json (version: 0.4.2)
- Bump tooling found: release-please (release-please-config.json)
- Release workflow: .github/workflows/release.yml (jobs: build, test, publish-image, helm-upgrade)
- Secret refs in workflows: GHCR_TOKEN, KUBECONFIG_PROD, KUBECONFIG_STAGING
- Registry hostnames: ghcr.io
- Runbook material: docs/runbooks/rollout-stuck.md, docs/runbooks/image-pull-failure.md → seed playbook candidates
- Additional contracts suggested: data-migration (liquibase/ found)
```

Then ask the user (free-form, not AskUserQuestion):
> *"Does this match how the project actually ships? Anything to add, correct, or ignore before we move on?"*

Apply the user's corrections to the in-memory discovery state. If the user says *"the helm dir is dead code, ignore it"*, mark that evidence as `discarded`.

---

# Step 2 — Hypothesis pass: confirm each contract

For each required-core contract below, present a **hypothesis derived from discovery** and let the user confirm, refine, or replace it. The structure is uniform:

1. State the inferred value + the evidence (1–2 lines, quoting Step 1's findings).
2. AskUserQuestion with **options derived from discovery**, ranked by confidence, plus `Other (describe)` always present.
3. If `template-hint` was set in Step 0 *and* the template's seed for this field differs from the inferred value, surface both: *"Discovery suggests X; the `<template-hint>` template usually uses Y. Which fits this project?"*
4. Capture the answer in the in-memory plan state.

If discovery had nothing to go on (e.g., the project has no `.github/workflows/`), say so, and ask from a generic option list. Don't pretend you inferred when you didn't.

Run the contracts in this order:

## Block A — What ship means + environments + cadence

Hypothesis from `inferred.ship-meaning`. Confirm:
- `ship-meaning` (one of: `publish`, `merge-only`, `deploy-immutable`, `deploy-rolling`, `feature-flag-flip`, or freeform)
- `ship-environments[]` — present discovered deploy targets first (e.g., from `k8s/`, `fly.toml`, multiple workflow envs); multi-select, with order capturing the promotion path.
- For each environment, ask: `auto-promote: <true | false>`.
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
- `release-trigger` (tag-on-main, merge-to-main, manual-dispatch, branch-push, or freeform) — derive from the chosen workflow's `on:` block.
- `release-workflow-file` — present candidates; if multiple workflows look release-y, ask which one.
- `release-jobs[]` — pre-fill from the workflow file's job names, in order.
- `publish-dry-run-cmd` — propose a sensible dry-run for the inferred ship-meaning (e.g., `./gradlew publishToMavenLocal`, `npm pack --dry-run`, `python -m build && twine check dist/*`, `kubectl diff -f k8s/<env>/`). Confirm or replace.
- `publish-cmd` — capture even if it only ever runs in CI; it's useful for reference and recovery.
- `required-secrets[]` — pre-fill from `inferred.ci.secret-refs-seen`. For each, ask the user for a one-sentence `purpose`. Allow freeform additions.
- `secrets-staleness-threshold-days` — default `90`, freeform override.

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

If no seeds and no template defaults, leave the list empty. The list grows as runs hit failures and `/wf-meta amend ship-plan` adds new playbooks.

## Block G — Stakeholder + announcement contract

Freeform:
- `announcement.channels[]` (e.g., `["#releases", "release-notes@example.com"]`)
- `announcement.template-path` (default `.ai/release-announcement-template.md`)

---

# Step 3 — Additional contracts (open extensions)

Ask the user (AskUserQuestion, multi-select), seeded by `inferred.additional-contracts-suggested`:

```yaml
question: "Does this project have any of these contracts that the standard plan doesn't cover?"
header: "Additional contracts"
options:
  - { label: "data-migration",          description: "Schema migrations have their own cadence + reversibility policy (Liquibase/Flyway/Alembic/Prisma/etc.)." }
  - { label: "feature-flag-rollout",    description: "Feature flags gate the rollout (LaunchDarkly/Statsig/Unleash/etc.). Flip cadence + cleanup policy." }
  - { label: "infrastructure-as-code",  description: "Terraform/Pulumi state has its own apply policy and drift-check cadence." }
  - { label: "mobile-app-store",        description: "TestFlight / Play Store review windows + phased rollout %." }
  - { label: "compliance-gate",         description: "SOC2 / PCI / HIPAA evidence collection required per release." }
  - { label: "data-pipeline",           description: "Airflow / dbt / Dagster orchestration with its own promotion cadence." }
  - { label: "schema-registry",         description: "Proto / Avro / OpenAPI registry with compatibility rules." }
  - { label: "Other (describe)",        description: "Project-specific contract not on this list." }
multiSelect: true
```

For each picked, run a small sub-loop (3–5 freeform questions) capturing: `id`, `purpose`, `fields:` (key/value pairs the user names), `enforced-by:` (which command or human checks this).

Each becomes an entry in `additional-contracts[]`. `/wf ship` ignores these by default; consumers that want them must read them by `id`.

---

# Step 4 — Exemplar pass (on request)

If, during Steps 2 or 3, the user asks *"what does a typical X plan look like?"* — or if they pick a `template-hint` they're unfamiliar with — open the relevant file under `${CLAUDE_PLUGIN_ROOT}/skills/wf-meta/reference/ship-plan-templates/<kind>.md` and show the seed values as **reference reading**, not a fill-in form.

Templates also exist for stealing single fields. If the user is happy with their Block A but wants the `signing-failure` playbook from `kotlin-maven-central`, pull only that block.

---

# Step 5 — Confirmation

Present a summary table to the user using AskUserQuestion. Surface the required-core values inline and list additional-contract `id`s by name:

```yaml
question: "Plan summary — confirm before writing `.ai/ship-plan.md`?"
header: "Confirm"
options:
  - { label: "Confirm",  description: "Write the plan as summarised." }
  - { label: "Adjust",   description: "Go back and edit a block." }
  - { label: "Cancel",   description: "Discard." }
multiSelect: false
```

If `Adjust`, ask which block (A–G or an additional-contract `id`) and re-run only that block's questions.

---

# Step 6 — Write `.ai/ship-plan.md`

Schema split:
- **Required core** (top of frontmatter) — fixed fields that `/wf ship` reads. Schema-stable; downstream code relies on these names.
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

# === Required core — read by /wf ship ===

# Block A — what ship means
ship-meaning: <publish | merge-only | deploy-immutable | deploy-rolling | feature-flag-flip | <freeform>>
ship-environments:
  - { name: "<env>", auto-promote: <true|false> }
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

# === Extensions — open schema, not read by /wf ship unless a consumer opts in by id ===

additional-contracts:
  - id: <short-id>
    purpose: "<one short sentence>"
    fields:
      <key>: <value>
    enforced-by: "<command, hook, or human role>"
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

## Additional contracts
<one subsection per additional-contracts[] entry: purpose, fields, who enforces.>
```

---

# Step 7 — Chat return

Return only:
- `wrote: .ai/ship-plan.md`
- `template-hint: <kind | none>`
- `plan-version: 1`
- `additional-contracts: [<id>, ...]` (or `[]`)
- `next-steps:`
  - `/wf ship <slug>` — run a release using this plan
  - `/wf-meta amend ship-plan` — edit any block

---

# Notes on amendment vs. init

- **init**: this command. One-time. Errors if a plan exists. Always runs discovery first.
- **amend**: `/wf-meta amend ship-plan` — opens the existing plan, lets the user pick which block to edit (A–G, or an additional-contract `id`), runs the relevant questions for that block only, bumps `plan-version`. Used when CI/CD changes, secrets rotate, post-publish checks evolve, recovery playbooks are added, or a new additional-contract is introduced.

The plan is intentionally project-scoped — every workflow on the same repo ships through the same pipeline, so the plan only needs to be authored once per project. Run history accumulates per workflow under `.ai/workflows/<slug>/09-ship-run-*.md`.
