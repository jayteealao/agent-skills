---
template-kind: library-internal
description: Library shared inside a monorepo or internal registry. Merge-to-main = release; no public registry; consumers pin via internal registry or git ref.
---

# Seed values

```yaml
ship-meaning: merge-only
ship-environments:
  - { name: production, auto-promote: true }   # merge-to-main = released; no further gate
ship-cadence: per-merge

version-scheme: semver
version-source-of-truth:
  - { path: package.json, field: version }
  # Or: pyproject.toml, build.gradle.kts, Cargo.toml — match your project
version-bump-rule: conventional-commits
version-bump-cmd: ""
prerelease-suffix: none
post-release-version: none
post-release-version-cmd: ""

ci-pipeline:
  pre-merge-checks: [build, test, lint, typecheck, apiCheck]
  release-trigger: merge-to-main
  release-workflow-file: ".github/workflows/ci.yml"
  release-jobs: [build, test, publish-internal]
  publish-dry-run-cmd: "npm pack --dry-run"   # adapt to project type
  publish-cmd: "npm publish --registry=https://internal.example.com/"
  required-secrets:
    - { name: INTERNAL_REGISTRY_TOKEN, purpose: "Internal registry credentials" }
  secrets-staleness-threshold-days: 365

post-publish-checks:
  - kind: registry-api
    cmd: "curl -fsS -H 'Authorization: Bearer $INTERNAL_REGISTRY_TOKEN' 'https://internal.example.com/$PACKAGE/$VERSION'"
    expect: "200 OK"
  - kind: github-release
    cmd: "gh release view v$VERSION"
    expect: "tag exists (optional for internal libs)"
propagation-window-min-minutes: 1
propagation-window-max-minutes: 5
poll-interval-seconds: 30

rollout-strategy: immediate
rollback-mechanism: redeploy-prior
rollback-time-estimate-min: 5
db-migrations-reversible: n/a

recovery-playbooks:
  - id: registry-auth
    triggers: ["401 Unauthorized", "403 Forbidden"]
    steps:
      - "Confirm INTERNAL_REGISTRY_TOKEN is current"
      - "Confirm the token has publish scope on the package's namespace"

announcement:
  channels: []                                # internal libs often don't need announcements
  template-path: ".ai/release-announcement-template.md"
```

# Inbound DX seed values

```yaml
# Block H — code-quality gates
code-quality:
  format-check: { tool: prettier, cmd: "npx prettier --check ." }
  lint:         { tool: eslint,   cmd: "npm run lint" }
  type-check:   { tool: tsc,      cmd: "npx tsc --noEmit" }
  test-coverage: { min-percent: 80, cmd: "npm test -- --coverage" }
  commit-convention:   { spec: conventional, config-path: "commitlint.config.js", enforce: [local, ci] }
  pr-title-convention: { spec: conventional, enforce: [ci] }

# Block I — local developer experience
local-dx:
  git-hooks:
    framework: husky
    hooks:
      pre-commit: ['npx lint-staged']
      commit-msg: ['npx --no -- commitlint --edit "$1"']
      pre-push: []
  editorconfig: true
  runtime-version-files: [".nvmrc"]
  task-runner: { kind: npm-scripts, targets: { setup: "npm install", check: "npm run lint && npx tsc --noEmit && npm test" } }
  bootstrap-cmd: "npm install"
  contributing-doc: true

# Block J — repo governance
governance:
  branch-protection:
    base-branch: main
    required-checks: [build, test, lint, typecheck, apiCheck]
    required-approvals: 1
    dismiss-stale-reviews: true
    require-up-to-date: true
    enforce-admins: false
    apply-via: manual
  codeowners:
    - { path: "*", owners: ["@<team>"] }
  pr-template: true
  issue-templates: true
  dependency-automation: { tool: dependabot, ecosystems: [npm, github-actions], schedule: "weekly" }
```

# Security & hardening seed values

```yaml
# Block C — ci-ergonomics (ci-pipeline.ci-ergonomics)
ci-ergonomics: { dep-cache: true, matrix: { os: ["ubuntu-latest"], versions: ["18", "20", "22"] }, release-concurrency: true, path-filters: false }

# Block J — merge controls (governance.merge)
merge: { method: squash, auto-merge: true, merge-queue: false }

# Block K — security & supply-chain gates
security:
  sast:             { tool: codeql, cmd: "", schedule: "weekly" }
  dependency-audit: { tool: npm-audit, cmd: "npm audit --audit-level=high", fail-on: high }
  secret-scanning:  { tool: gitleaks, cmd: "gitleaks detect --no-banner", pre-commit: true }
  sbom:             { tool: none, format: spdx, publish-with-release: false }
  license-check:    { tool: license-checker, allow: ["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause"], deny: [] }
```

# Notes for the author

- Internal libraries often have a tighter loop than public libraries — release-on-merge is normal because consumers within the same org tend to update quickly.
- `auto-promote: true` on the single production environment matches "merge = released". If your org has a staging registry mirror, add it as a separate env with `auto-promote: false`.
- `apiCheck` in pre-merge-checks is the same Kotlin/JVM convention as the kotlin-maven-central template — drop it if your project doesn't dump API surface.
- For monorepo libs published via Changesets or Nx, replace `publish-cmd` with `npx changeset publish` or the Nx equivalent.
