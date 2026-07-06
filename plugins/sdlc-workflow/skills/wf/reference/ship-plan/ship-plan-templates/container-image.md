---
template-kind: container-image
description: Container image published to a registry (GHCR, ECR, Docker Hub). Tag-on-main triggers build + push with signed images.
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
  # Alternatives — uncomment whichever the project uses:
  # - { path: VERSION, field: "" }
  # - { path: Cargo.toml, field: package.version }
  # - { path: pyproject.toml, field: project.version }
version-bump-rule: conventional-commits
version-bump-cmd: ""
prerelease-suffix: none
post-release-version: none
post-release-version-cmd: ""

ci-pipeline:
  pre-merge-checks: [build, test, lint, image-scan]
  release-trigger: tag-on-main
  release-workflow-file: ".github/workflows/release.yml"
  release-jobs: [build-image, scan-image, sign-image, push-image]
  publish-dry-run-cmd: "docker buildx build --platform linux/amd64,linux/arm64 -t $IMAGE:$VERSION ."
  publish-cmd: "docker buildx build --platform linux/amd64,linux/arm64 -t $IMAGE:$VERSION --push ."
  required-secrets:
    - { name: GHCR_TOKEN,  purpose: "GHCR PAT with write:packages (or use GITHUB_TOKEN with packages: write)" }
    # For ECR, replace with:
    # - { name: AWS_ACCESS_KEY_ID,     purpose: "ECR push credentials" }
    # - { name: AWS_SECRET_ACCESS_KEY, purpose: "..." }
    # For Docker Hub:
    # - { name: DOCKERHUB_TOKEN,       purpose: "Docker Hub access token" }
  secrets-staleness-threshold-days: 90

post-publish-checks:
  - kind: registry-api
    cmd: "docker manifest inspect $IMAGE:$VERSION"
    expect: "manifest returns multi-arch list"
  - kind: fresh-resolve
    cmd: "docker pull $IMAGE:$VERSION && docker run --rm $IMAGE:$VERSION --version"
    expect: "container runs and reports version"
  - kind: github-release
    cmd: "gh release view v$VERSION"
    expect: "tag exists"
propagation-window-min-minutes: 1
propagation-window-max-minutes: 5
poll-interval-seconds: 20

rollout-strategy: immediate
rollback-mechanism: redeploy-prior
rollback-time-estimate-min: 5
db-migrations-reversible: n/a

recovery-playbooks:
  - id: registry-auth
    triggers: ["denied: requested access to the resource is denied", "unauthorized"]
    steps:
      - "Token expired or scoped too narrowly"
      - "For GHCR: regenerate PAT with write:packages, or use GITHUB_TOKEN with permissions: packages: write"
      - "For ECR: confirm IAM role has ecr:BatchCheckLayerAvailability + ecr:PutImage"
      - "Re-run: gh run rerun $RUN_ID"
  - id: signing-failure
    triggers: ["cosign", "signature verification failed"]
    steps:
      - "If using cosign keyless, confirm OIDC permissions (id-token: write)"
      - "If using key-based, confirm COSIGN_PRIVATE_KEY + COSIGN_PASSWORD secrets"

announcement:
  channels: []
  template-path: ".ai/release-announcement-template.md"
```

# Inbound DX seed values

```yaml
# Block H — code-quality gates
code-quality:
  format-check: { tool: prettier, cmd: "npx prettier --check ." }
  lint:         { tool: hadolint, cmd: "hadolint Dockerfile" }
  type-check:   { tool: "n/a", cmd: "" }
  test-coverage: { min-percent: null, cmd: "" }
  commit-convention:   { spec: conventional, config-path: "commitlint.config.js", enforce: [local, ci] }   # feeds version-bump-rule: conventional-commits
  pr-title-convention: { spec: conventional, enforce: [ci] }

# Block I — local developer experience
local-dx:
  git-hooks:
    framework: lefthook
    hooks:
      pre-commit: ["hadolint Dockerfile"]
      commit-msg: ['npx commitlint --edit {1}']
      pre-push: []
  editorconfig: true
  runtime-version-files: []                    # polyglot — pin the language used by the app image
  task-runner: { kind: make, targets: { build: "docker buildx build .", scan: "trivy image $IMAGE:$VERSION" } }
  bootstrap-cmd: ""
  contributing-doc: true

# Block J — repo governance
governance:
  branch-protection:
    base-branch: main
    required-checks: [build, test, lint, image-scan]
    required-approvals: 1
    dismiss-stale-reviews: true
    require-up-to-date: true
    enforce-admins: false
    apply-via: manual
  codeowners:
    - { path: "Dockerfile*", owners: ["@<maintainer>"] }
  pr-template: true
  issue-templates: true
  dependency-automation: { tool: renovate, ecosystems: [docker, github-actions], schedule: "weekly" }
```

# Security & hardening seed values

```yaml
# Block C — ci-ergonomics (ci-pipeline.ci-ergonomics) — buildx already uses gha cache
ci-ergonomics: { dep-cache: true, matrix: { os: ["ubuntu-latest"], versions: [] }, release-concurrency: true, path-filters: false }

# Block J — merge controls (governance.merge)
merge: { method: squash, auto-merge: false, merge-queue: false }

# Block K — security & supply-chain gates
security:
  sast:             { tool: codeql, cmd: "", schedule: "weekly" }
  dependency-audit: { tool: trivy, cmd: "trivy image --exit-code 1 --severity HIGH,CRITICAL $IMAGE:$VERSION", fail-on: high }
  secret-scanning:  { tool: gitleaks, cmd: "gitleaks detect --no-banner", pre-commit: true }
  sbom:             { tool: syft, format: spdx, publish-with-release: true }
  license-check:    { tool: none, allow: [], deny: [] }
```

# Notes for the author

- The template defaults to **GHCR** (GitHub Container Registry) since it works out of the box with GITHUB_TOKEN. Swap secrets for ECR or Docker Hub.
- For multi-arch images, `docker buildx` is required. The dry-run + publish commands above produce identical builds with/without `--push`.
- Image rollback is fast because clients pull a tag — repointing the `latest` or `<channel>` tag to the prior version takes seconds.
- If you sign images (cosign, sigstore), add the signing step to `release-jobs` and the corresponding playbook.
