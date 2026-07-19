---
template-kind: npm-public
description: Library published to the public npm registry. Tag-on-main triggers a publish workflow that runs npm publish with provenance.
---

# Seed values

```yaml
ship-meaning: publish
ship-environments:
  - { name: production, auto-promote: false }
ship-cadence: on-demand

version-scheme: semver
version-source-of-truth:
  - { path: package.json, field: version }
version-bump-rule: conventional-commits
version-bump-cmd: "npx changeset version"
prerelease-suffix: none
post-release-version: none
post-release-version-cmd: ""

ci-pipeline:
  pre-merge-checks: [build, test, lint, typecheck]
  release-trigger: tag-on-main
  release-workflow-file: ".github/workflows/release.yml"
  release-jobs: [build, test, publish]
  publish-dry-run-cmd: "npm pack --dry-run"
  publish-cmd: "npm publish --access public --provenance"
  required-secrets:
    - { name: NPM_TOKEN, purpose: "npm automation token with publish scope (https://docs.npmjs.com/creating-and-viewing-access-tokens)" }
  secrets-staleness-threshold-days: 365

post-publish-checks:
  - kind: registry-api
    cmd: "curl -s 'https://registry.npmjs.org/$PACKAGE/$VERSION' | jq -e '.name'"
    expect: ".name matches package"
  - kind: fresh-resolve
    cmd: |
      mkdir -p /tmp/$PACKAGE-smoke && cd /tmp/$PACKAGE-smoke && \
      npm init -y >/dev/null && npm install --no-save $PACKAGE@$VERSION
    expect: "install succeeds"
  - kind: github-release
    cmd: "gh release view v$VERSION"
    expect: "tag exists"
propagation-window-min-minutes: 1
propagation-window-max-minutes: 10
poll-interval-seconds: 30

rollout-strategy: immediate
rollback-mechanism: gh-release-yank
rollback-time-estimate-min: 5
db-migrations-reversible: n/a

recovery-playbooks:
  - id: token-401
    triggers: ["401 Unauthorized", "ENEEDAUTH", "incorrect or missing password"]
    steps:
      - "Token expired or revoked. Regenerate at https://www.npmjs.com/settings/<user>/tokens"
      - "Use 'Automation' token type for CI"
      - "Update GH secret: gh secret set NPM_TOKEN --body \"$NEW_TOKEN\""
      - "Re-run: gh run rerun $RUN_ID"
  - id: provenance-failure
    triggers: ["provenance generation failed", "OIDC token"]
    steps:
      - "Confirm workflow has 'id-token: write' permission"
      - "Confirm npm CLI ≥ 9.5.0 in CI"
      - "If using --provenance, the package must be public"

announcement:
  channels: []
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
    required-checks: [build, test, lint, typecheck]
    required-approvals: 1
    dismiss-stale-reviews: true
    require-up-to-date: true
    enforce-admins: false
    apply-via: manual
  codeowners:
    - { path: "*", owners: ["@<maintainer>"] }
  pr-template: true
  issue-templates: true
  dependency-automation: { tool: renovate, ecosystems: [npm, github-actions], schedule: "weekly" }
```

# Security & hardening seed values

```yaml
# Block C — ci-ergonomics (ci-pipeline.ci-ergonomics)
ci-ergonomics: { dep-cache: true, matrix: { os: ["ubuntu-latest"], versions: ["20", "22"] }, release-concurrency: true, path-filters: false }

# Block J — merge controls (governance.merge)
merge: { method: squash, auto-merge: true, merge-queue: false }

# Block K — security & supply-chain gates
security:
  sast:             { tool: codeql, cmd: "", schedule: "weekly" }
  dependency-audit: { tool: npm-audit, cmd: "npm audit --audit-level=high", fail-on: high }
  secret-scanning:  { tool: gitleaks, cmd: "gitleaks detect --no-banner", pre-commit: true }
  sbom:             { tool: none, format: spdx, publish-with-release: false }
  license-check:    { tool: license-checker, allow: ["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause"], deny: ["GPL-3.0"] }
```

# Notes for the author

- npm propagation is fast (typically <1 minute) but the unpkg/jsdelivr CDN mirrors lag a few minutes. The `fresh-resolve` check goes through the registry directly.
- npm provenance (`--provenance`) requires publishing from GitHub Actions with `id-token: write`. Drop the flag if you publish from elsewhere.
- npm allows version yanks via `npm deprecate` but does NOT allow republishing the same version after a yank. The rollback strategy here assumes "publish a fix release" rather than literal removal.
