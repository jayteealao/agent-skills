---
template-kind: server-deploy
description: Application deployed to long-running server infrastructure (Kubernetes, ECS, fly.io, Render). Merge-to-main or tag-on-main triggers a rolling deploy.
---

# Seed values

```yaml
ship-meaning: deploy-rolling
ship-environments:
  - { name: staging,    auto-promote: false }
  - { name: production, auto-promote: false }
ship-cadence: per-merge

version-scheme: sequential
version-source-of-truth: []   # SHA-tagged deploys; no version literal in repo
version-bump-rule: fixed
version-bump-cmd: "git rev-parse --short HEAD"
prerelease-suffix: none
post-release-version: none
post-release-version-cmd: ""

ci-pipeline:
  pre-merge-checks: [build, test, lint, image-scan, db-migrate-dry-run]
  release-trigger: merge-to-main
  release-workflow-file: ".github/workflows/deploy.yml"
  release-jobs: [build-image, push-image, deploy-staging, smoke-test, deploy-production]
  publish-dry-run-cmd: "kubectl diff -f k8s/production/ || true"
  publish-cmd: "kubectl apply -f k8s/production/"
  required-secrets:
    - { name: KUBECONFIG,         purpose: "Base64-encoded kubeconfig for the production cluster" }
    - { name: REGISTRY_TOKEN,     purpose: "Image registry pull credentials, mirrored to ImagePullSecret" }
  secrets-staleness-threshold-days: 90

post-publish-checks:
  - kind: k8s-rollout-status
    cmd: "kubectl -n $NAMESPACE rollout status deployment/$DEPLOYMENT --timeout=10m"
    expect: "rollout complete"
  - kind: smoke-test
    cmd: "curl -fsS https://$HOST/health"
    expect: "200 + { status: 'ok' }"
  - kind: github-release
    cmd: "gh release view $SHA"
    expect: "release exists (optional — skip for SHA-only deploys)"
propagation-window-min-minutes: 2
propagation-window-max-minutes: 15
poll-interval-seconds: 30

rollout-strategy: staged
rollout-stages: ["canary-1pod", "10%", "50%", "100%"]
rollback-mechanism: redeploy-prior
rollback-time-estimate-min: 3
db-migrations-reversible: false

recovery-playbooks:
  - id: failed-rollout
    triggers: ["rollout: deployment ", "ProgressDeadlineExceeded"]
    steps:
      - "Capture pod logs: kubectl -n $NAMESPACE logs -l app=$APP --tail=200"
      - "Roll back: kubectl -n $NAMESPACE rollout undo deployment/$DEPLOYMENT"
      - "Confirm pods return to Ready"
      - "Open an incident; do NOT re-deploy until the cause is understood"
  - id: migration-failure
    triggers: ["migration failed", "alembic.exc", "Liquibase", "Flyway"]
    steps:
      - "Migrations are NOT auto-reversible per this plan"
      - "If schema change is forward-only and broke prod: scale to zero, run hotfix migration, redeploy"
      - "If reversible: run the down migration manually before rolling back code"

announcement:
  channels: ["#deploys"]
  template-path: ".ai/release-announcement-template.md"
```

# Notes for the author

- This template assumes Kubernetes — swap `kubectl` commands for `aws ecs update-service` (ECS), `flyctl deploy` (fly.io), or `render deploys create` (Render) as appropriate.
- `db-migrations-reversible: false` is the safer default. Set to `true` only if you have an established convention of reversible migrations and CI enforces it.
- The `rollout-stages` list (`canary-1pod → 10% → 50% → 100%`) is a starting point — tune to your cluster sizing.
- For per-merge cadence, every merge to main triggers a deploy. If you want manual gating, switch `release-trigger` to `manual-dispatch`.
