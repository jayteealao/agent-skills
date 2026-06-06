---
template-kind: pypi
description: Library published to PyPI via Trusted Publisher (OIDC) or API token. Tag-on-main triggers build + twine upload.
---

# Seed values

```yaml
ship-meaning: publish
ship-environments:
  - { name: production, auto-promote: false }
ship-cadence: on-demand

version-scheme: semver
version-source-of-truth:
  - { path: pyproject.toml, field: project.version }
version-bump-rule: manual
version-bump-cmd: ""
prerelease-suffix: none
post-release-version: none
post-release-version-cmd: ""

ci-pipeline:
  pre-merge-checks: [build, test, lint, mypy]
  release-trigger: tag-on-main
  release-workflow-file: ".github/workflows/release.yml"
  release-jobs: [build, test, publish]
  publish-dry-run-cmd: "python -m build && twine check dist/*"
  publish-cmd: "twine upload dist/*"
  required-secrets:
    - { name: PYPI_API_TOKEN, purpose: "PyPI API token with project scope (or unset if using Trusted Publisher OIDC)" }
  secrets-staleness-threshold-days: 365

post-publish-checks:
  - kind: registry-api
    cmd: "curl -s 'https://pypi.org/pypi/$PACKAGE/$VERSION/json' | jq -e '.info.version'"
    expect: ".info.version matches"
  - kind: fresh-resolve
    cmd: |
      python -m venv /tmp/$PACKAGE-smoke && \
      /tmp/$PACKAGE-smoke/bin/pip install $PACKAGE==$VERSION
    expect: "install succeeds"
  - kind: github-release
    cmd: "gh release view v$VERSION"
    expect: "tag exists"
propagation-window-min-minutes: 1
propagation-window-max-minutes: 15
poll-interval-seconds: 30

rollout-strategy: immediate
rollback-mechanism: redeploy-prior
rollback-time-estimate-min: 10
db-migrations-reversible: n/a

recovery-playbooks:
  - id: trusted-publisher-misconfig
    triggers: ["invalid-publisher", "OIDC", "id-token"]
    steps:
      - "Confirm pypi.org Trusted Publisher matches: owner/repo, workflow filename, environment name"
      - "Confirm GH workflow has 'id-token: write' permission"
      - "If using API token instead, set PYPI_API_TOKEN secret"
  - id: version-already-uploaded
    triggers: ["File already exists", "400 Bad Request"]
    steps:
      - "PyPI does not allow re-uploading the same version. Bump version and re-tag."
      - "Delete the broken tag: git tag -d v$VERSION && git push origin :v$VERSION"
      - "Re-run with bumped version"

announcement:
  channels: []
  template-path: ".ai/release-announcement-template.md"
```

# Inbound DX seed values

```yaml
# Block H — code-quality gates
code-quality:
  format-check: { tool: ruff, cmd: "ruff format --check ." }
  lint:         { tool: ruff, cmd: "ruff check ." }
  type-check:   { tool: mypy, cmd: "mypy ." }
  test-coverage: { min-percent: null, cmd: "pytest --cov" }
  commit-convention:   { spec: none, config-path: "", enforce: [] }   # Python projects rarely use conventional commits; flip to conventional if you do
  pr-title-convention: { spec: none, enforce: [] }

# Block I — local developer experience
local-dx:
  git-hooks:
    framework: pre-commit
    hooks:
      pre-commit: ["ruff check --fix", "ruff format", "mypy"]
      commit-msg: []
      pre-push: []
  editorconfig: true
  runtime-version-files: [".python-version"]
  task-runner: { kind: make, targets: { setup: "pip install -e '.[dev]'", check: "ruff check . && mypy . && pytest" } }
  bootstrap-cmd: "pip install -e '.[dev]' && pre-commit install"
  contributing-doc: true

# Block J — repo governance
governance:
  branch-protection:
    base-branch: main
    required-checks: [build, test, lint, mypy]
    required-approvals: 1
    dismiss-stale-reviews: true
    require-up-to-date: true
    enforce-admins: false
    apply-via: manual
  codeowners:
    - { path: "*", owners: ["@<maintainer>"] }
  pr-template: true
  issue-templates: true
  dependency-automation: { tool: dependabot, ecosystems: [pip, github-actions], schedule: "weekly" }
```

# Security & hardening seed values

```yaml
# Block C — ci-ergonomics (ci-pipeline.ci-ergonomics)
ci-ergonomics: { dep-cache: true, matrix: { os: ["ubuntu-latest"], versions: ["3.10", "3.11", "3.12"] }, release-concurrency: true, path-filters: false }

# Block J — merge controls (governance.merge)
merge: { method: squash, auto-merge: false, merge-queue: false }

# Block K — security & supply-chain gates
security:
  sast:             { tool: codeql, cmd: "", schedule: "weekly" }
  dependency-audit: { tool: pip-audit, cmd: "pip-audit", fail-on: high }
  secret-scanning:  { tool: detect-secrets, cmd: "detect-secrets scan --baseline .secrets.baseline", pre-commit: true }
  sbom:             { tool: none, format: spdx, publish-with-release: false }
  license-check:    { tool: pip-licenses, allow: ["MIT", "Apache-2.0", "BSD-3-Clause"], deny: ["GPL-3.0"] }
```

# Notes for the author

- Prefer **Trusted Publisher** (OIDC) over long-lived API tokens. If you use Trusted Publisher, you can drop `PYPI_API_TOKEN` from `required-secrets`.
- PyPI **never permits** re-uploading the same version, even after deletion. The `version-already-uploaded` playbook captures this.
- `version-bump-rule: manual` is the safest default — Python projects rarely use conventional commits. Switch to `git-cliff` if you do.
