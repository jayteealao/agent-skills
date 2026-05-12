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

# Notes for the author

- The template defaults to **GHCR** (GitHub Container Registry) since it works out of the box with GITHUB_TOKEN. Swap secrets for ECR or Docker Hub.
- For multi-arch images, `docker buildx` is required. The dry-run + publish commands above produce identical builds with/without `--push`.
- Image rollback is fast because clients pull a tag — repointing the `latest` or `<channel>` tag to the prior version takes seconds.
- If you sign images (cosign, sigstore), add the signing step to `release-jobs` and the corresponding playbook.
