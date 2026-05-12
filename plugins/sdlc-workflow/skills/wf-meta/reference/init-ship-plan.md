---
description: Author the project-level `.ai/ship-plan.md` — a one-time, repo-scoped contract that captures what "ship" means for this project (publishing, version scheme, CI/CD wiring, post-publish verification, rollout/rollback, recovery playbooks, announcements). Optional `--from-template <kind>` seeds the plan from a known shape (kotlin-maven-central, npm-public, pypi, container-image, server-deploy, library-internal). Read by every subsequent `/wf ship <slug>` invocation.
argument-hint: "[--from-template <kotlin-maven-central|npm-public|pypi|container-image|server-deploy|library-internal>]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`, `.ai/ship-plan.md`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language. Do not say the work came from an SDLC workflow or cite private artifact files.

You are running `wf-meta init-ship-plan`, a **one-time project-level setup utility**. The plan you author here is consumed by every `/wf ship <slug>` invocation thereafter.

# What this command produces

A single file: **`.ai/ship-plan.md`** at the **repo root** (not under `.ai/workflows/`). The plan is per-project, not per-workflow. It captures the orthogonal contracts that releases share: ship-meaning, versioning, CI/CD, post-publish verification, rollout/rollback, recovery playbooks, announcements.

# What this command does NOT do

- It does not run a release.
- It does not modify workflow artifacts under `.ai/workflows/`.
- It does not author `09-ship-run-*.md` files (those are written per-release by `/wf ship`).
- It does not duplicate work already in `08-handoff.md` (handoff is per-PR readiness; this plan is per-release).

# CRITICAL — execution discipline

You are a **plan author**, not a problem solver.
- Do NOT make code changes, run builds, or modify CI files.
- Do NOT overwrite an existing `.ai/ship-plan.md`. If one exists, STOP and tell the user: *"Plan exists at `.ai/ship-plan.md`. Use `/wf-meta amend ship-plan` to edit one block."*
- Follow the numbered steps below exactly in order.

---

# Step 0 — Orient

1. Detect template: parse `$ARGUMENTS` for `--from-template <kind>`. If present, validate `<kind>` ∈ {`kotlin-maven-central`, `npm-public`, `pypi`, `container-image`, `server-deploy`, `library-internal`}. Read `${CLAUDE_PLUGIN_ROOT}/skills/wf-meta/reference/ship-plan-templates/<kind>.md` and use it as the seed for Blocks A–G. If the user passed an unknown kind, STOP and list the valid kinds.
2. If no template is given, ask the user (AskUserQuestion):
   ```
   question: "Which template best matches your project's ship shape?"
   header: "Template"
   options:
     - { label: "kotlin-maven-central", description: "Library published to Maven Central via Sonatype + GPG signing" }
     - { label: "npm-public",          description: "Library published to the public npm registry" }
     - { label: "pypi",                description: "Library published to PyPI" }
     - { label: "container-image",     description: "Image published to a container registry (GHCR, ECR, Docker Hub)" }
   multiSelect: false
   ```
   Add a follow-up if needed for `server-deploy` or `library-internal`.
3. STOP if `.ai/ship-plan.md` already exists. Tell the user to amend instead.
4. Detect repo basics: read `git remote get-url origin`, derive `<owner>/<repo>` and `project-name`. Confirm with the user.

---

# Step 1 — Block A: Ship meaning

```yaml
question: "What does \"ship\" mean for this project?"
header: "Ship meaning"
options:
  - { label: "Publish",              description: "Release an artifact to a registry users pull from (Maven, npm, PyPI, container registry)." }
  - { label: "Merge-only",           description: "Merging the PR is the release (e.g., monorepo apps deployed elsewhere)." }
  - { label: "Deploy (immutable)",   description: "Deploy to a target environment with immutable artifacts (Lambda, container)." }
  - { label: "Deploy (rolling)",     description: "Rolling/canary deploy to long-running infra (k8s, ECS, fly.io)." }
multiSelect: false
```

Add `feature-flag-flip` as a freeform follow-up if none of the above fit.

---

# Step 2 — Block A: Ship environments + cadence

Use AskUserQuestion (multiSelect) for environments. Common: `staging`, `production`. Capture order (deploy-to-staging-then-production is the default promotion path). Then ask cadence:

```yaml
question: "How often does this project ship?"
header: "Cadence"
options:
  - { label: "On-demand",       description: "Whenever a PR is ready; no fixed cadence." }
  - { label: "Per-merge",       description: "Every merge to main triggers a release." }
  - { label: "Weekly",          description: "Weekly release train." }
  - { label: "Release-train",   description: "Custom cadence; coordinated cuts." }
multiSelect: false
```

For each environment, ask if `auto-promote: true` (next env runs without human gate) or `false`.

---

# Step 3 — Block B: Version scheme

```yaml
question: "What versioning scheme does this project use?"
header: "Version scheme"
options:
  - { label: "Semver",      description: "Semantic versioning (major.minor.patch). Most libraries." }
  - { label: "Calver",      description: "Calendar versioning (YY.MM.PATCH or similar)." }
  - { label: "Sequential",  description: "Monotonically increasing single number." }
  - { label: "None",        description: "No versioning — services that deploy by SHA, internal tools." }
multiSelect: false
```

---

# Step 4 — Block B: Version source-of-truth files

Discover candidates by reading repo-root files via Glob:
- `package.json` → `version` field
- `pyproject.toml` → `project.version`
- `build.gradle.kts` / `build.gradle` → `version` block
- `Cargo.toml` → `package.version`
- `*.csproj` → `<Version>` element
- `Chart.yaml` → `version`
- `gradle.properties` → `VERSION_NAME` (Android convention)

Present found files to the user; let them confirm which are sources of truth (each must be updated together on every bump). Allow freeform additions for project-specific files.

---

# Step 5 — Block B: Version bump rule

```yaml
question: "How are versions bumped?"
header: "Version bump"
options:
  - { label: "git-cliff",                description: "git-cliff computes the next version from conventional commits since last tag." }
  - { label: "Conventional commits",     description: "Bump rule derived from commit prefixes (fix → patch, feat → minor, BREAKING → major)." }
  - { label: "Manual",                   description: "Author chooses the version per release." }
  - { label: "Fixed",                    description: "Single static version (rare; e.g., always 1.0.0 for internal services)." }
multiSelect: false
```

If `git-cliff`, capture the bump command (default: `git cliff --bumped-version`). If `conventional-commits`, capture the commitlint config path.

Then ask about prerelease and post-release handling:
- Freeform: prerelease suffix (`none` / `-SNAPSHOT` / `-alpha` / `-beta` / `-rc`)
- Freeform: post-release-version handling (`next-snapshot` / `next-dev` / `none`) and the command to compute it

---

# Step 6 — Block C: Release trigger + workflow file

```yaml
question: "How is the release pipeline triggered?"
header: "Release trigger"
options:
  - { label: "Tag on main",         description: "A pushed tag like v1.4.0 triggers the release workflow." }
  - { label: "Merge to main",       description: "A merge to main triggers the release workflow." }
  - { label: "Manual dispatch",     description: "Human runs the workflow via the CI UI or CLI." }
  - { label: "Branch push",         description: "Push to a release/* branch triggers it." }
multiSelect: false
```

Discover release workflows: Glob `.github/workflows/*.yml`. Present the results, ask which one is the release workflow (one might be `release.yml`, `publish.yml`, `deploy.yml`).

Then capture:
- `release-jobs:` — list of job names in order (read from the workflow file)
- `publish-dry-run-cmd:` — command to validate the build artifact locally without uploading (e.g., `./gradlew publishToMavenLocal`, `npm pack --dry-run`, `python -m build && twine check dist/*`)
- `publish-cmd:` — the actual publish command (often invoked only inside CI, but capture for reference)

---

# Step 7 — Block C: Required secrets

For the chosen template, pre-fill the secrets list. For `kotlin-maven-central`:
- `MAVEN_CENTRAL_USERNAME` — Sonatype user token username
- `MAVEN_CENTRAL_PASSWORD` — Sonatype user token password
- `SIGNING_KEY` — ASCII-armored GPG private key (single-line)
- `SIGNING_KEY_ID` — last 8 chars of GPG fingerprint
- `SIGNING_KEY_PASSWORD` — GPG passphrase

Use AskUserQuestion to confirm/edit. Allow freeform additions. For each, capture `purpose:` (one short sentence).

Ask: `secrets-staleness-threshold-days:` — how many days before the run warns that secrets need rotation. Default `90`.

---

# Step 8 — Block D: Post-publish verification

```yaml
question: "How does this project verify a successful publish?"
header: "Post-publish checks"
options:
  - { label: "Registry API",         description: "Hit the registry's API to confirm the version exists." }
  - { label: "Fresh resolve",        description: "Spin up a clean environment and resolve the new version." }
  - { label: "GitHub release",       description: "Confirm a tag + release object exists." }
  - { label: "Smoke test",           description: "Run a smoke test against a live endpoint or CLI." }
multiSelect: true
```

For each picked: capture the `cmd:` and the `expect:` clause (what signal counts as pass). Use the chosen template's seed values when available. For `kubernetes` deploys, also offer `k8s-rollout-status` (`kubectl rollout status deployment/<name>`).

Ask freeform: `propagation-window-min-minutes`, `propagation-window-max-minutes`, `poll-interval-seconds`. Defaults: 5 / 30 / 60.

---

# Step 9 — Block E: Rollout strategy + rollback

```yaml
question: "What rollout strategy does this project use by default?"
header: "Rollout"
options:
  - { label: "Immediate",       description: "Deploy to 100% of users at once." }
  - { label: "Staged",          description: "Roll out incrementally (10% → 50% → 100%)." }
  - { label: "Canary",          description: "Promote one canary, then full." }
  - { label: "Feature flag",    description: "Deploy code; gate behind a flag." }
multiSelect: false
```

If `staged` or `canary`, capture `rollout-stages:` (e.g., `["10%", "50%", "100%"]`).

```yaml
question: "How do you roll back a bad release?"
header: "Rollback"
options:
  - { label: "git revert",         description: "Revert the merge commit and re-deploy." }
  - { label: "gh release yank",    description: "Yank the published version from the registry (where supported)." }
  - { label: "Feature flag off",   description: "Toggle the gate flag to off." }
  - { label: "Blue-green switch",  description: "Switch traffic back to the prior color." }
  - { label: "Redeploy prior",     description: "Redeploy the prior version's artifact." }
multiSelect: false
```

Ask freeform: `rollback-time-estimate-min:` and `db-migrations-reversible:` (`true` / `false` / `n/a`).

---

# Step 10 — Block G: Announcement channels

Freeform questions:
- `announcement.channels:` — list of channels (e.g., `["#releases", "release-notes@example.com"]`)
- `announcement.template-path:` — optional path to a template file (`.ai/release-announcement-template.md` is conventional)

---

# Step 11 — Block F: Recovery playbooks

Recovery playbooks are **distilled from past failures** — they are seeded empty for new plans, and grow as runs hit failures and amend the plan via `/wf-meta amend ship-plan`.

For templates that ship with example playbooks (`kotlin-maven-central` includes `signing-failure` and `registry-token-401`), include those defaults; otherwise leave the list empty.

---

# Step 12 — Confirmation + write

Present a summary table to the user using AskUserQuestion:

```yaml
question: "Plan summary — confirm before writing `.ai/ship-plan.md`?"
header: "Confirm"
options:
  - { label: "Confirm",  description: "Write the plan as summarised." }
  - { label: "Adjust",   description: "Go back and edit a block." }
  - { label: "Cancel",   description: "Discard." }
multiSelect: false
```

If `Adjust`, ask which block (A–G) and re-run only that step.

If `Confirm`, write `.ai/ship-plan.md` with this structure:

```yaml
---
schema: sdlc/v1
type: ship-plan
slug: <project-name-as-slug>
plan-version: 1
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
project-name: "<repo or product name>"

# Block A — what ship means
ship-meaning: <publish | merge-only | deploy-immutable | deploy-rolling | feature-flag-flip>
ship-environments:
  - { name: "<env>", auto-promote: <true|false> }
ship-cadence: <on-demand | per-merge | weekly | release-train>

# Block B — versioning contract
version-scheme: <semver | calver | sequential | none>
version-source-of-truth:
  - { path: "<file>", field: "<dotted-path>" }
version-bump-rule: <git-cliff | conventional-commits | manual | fixed>
version-bump-cmd: "<command>"
prerelease-suffix: <none | -SNAPSHOT | -alpha | -beta | -rc>
post-release-version: <next-snapshot | next-dev | none>
post-release-version-cmd: "<command or empty>"

# Block C — CI/CD contract
ci-pipeline:
  pre-merge-checks: [<check>, ...]
  release-trigger: <tag-on-main | merge-to-main | manual-dispatch | branch-push>
  release-workflow-file: ".github/workflows/<file>.yml"
  release-jobs: [<job>, ...]
  publish-dry-run-cmd: "<command>"
  publish-cmd: "<command>"
  required-secrets:
    - { name: "<NAME>", purpose: "<short description>" }
  secrets-staleness-threshold-days: 90

# Block D — post-publish verification contract
post-publish-checks:
  - { kind: registry-api,    cmd: "<command>", expect: "<signal>" }
  - { kind: fresh-resolve,   cmd: "<command>", expect: "<signal>" }
  - { kind: github-release,  cmd: "<command>", expect: "<signal>" }
propagation-window-min-minutes: 5
propagation-window-max-minutes: 30
poll-interval-seconds: 60

# Block E — rollout + rollback contract
rollout-strategy: <immediate | staged | canary | feature-flag>
rollout-stages: ["10%", "50%", "100%"]   # only when staged/canary
rollback-mechanism: <git-revert | gh-release-yank | feature-flag-off | blue-green-switch | redeploy-prior>
rollback-time-estimate-min: 5
db-migrations-reversible: <true | false | n/a>

# Block F — recovery playbooks
recovery-playbooks:
  - id: <short-id>
    triggers: ["<regex>", "..."]
    steps:
      - "<step>"

# Block G — stakeholder + announcement contract
announcement:
  channels: ["<channel>", ...]
  template-path: ".ai/release-announcement-template.md"
---

# Ship Plan — <project-name>

## What "ship" means here
<one paragraph: what artifact reaches what audience? does ship publish, merge, deploy, or flip a flag?>

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
<each known failure mode + steps>

## Stakeholder + announcement
<who needs to know, what channel, what template>
```

---

# Step 13 — Chat return

Return only:
- `wrote: .ai/ship-plan.md`
- `template-used: <kind>`
- `plan-version: 1`
- `next-steps:`
  - `/wf ship <slug>` — run a release using this plan
  - `/wf-meta amend ship-plan` — edit any block

---

# Notes on amendment vs. init

- **init**: this command. One-time. Errors if a plan exists.
- **amend**: `/wf-meta amend ship-plan` — opens the existing plan, lets the user pick which block to edit (A–G), runs the relevant questions for that block only, bumps `plan-version`. Used when CI/CD changes, secrets rotate, post-publish checks evolve, or a recovery playbook is added.

The plan is intentionally project-scoped — every workflow on the same repo ships through the same pipeline, so the plan only needs to be authored once per project. Run history accumulates per workflow under `.ai/workflows/<slug>/09-ship-run-*.md`.
