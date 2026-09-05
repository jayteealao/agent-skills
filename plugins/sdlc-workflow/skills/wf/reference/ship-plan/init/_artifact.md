# Ship-plan init — the `.ai/ship-plan.md` template (`ship-plan/init.md` Step 6)

Load this file from `init.md` Step 6. Write the file with this frontmatter (required core, inbound half, extensions) and this body.

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

# === Inbound half — read by /wf ship-plan build (and the local gate in /wf handoff) ===

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
