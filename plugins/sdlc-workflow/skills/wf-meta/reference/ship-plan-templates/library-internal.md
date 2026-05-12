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

# Notes for the author

- Internal libraries often have a tighter loop than public libraries — release-on-merge is normal because consumers within the same org tend to update quickly.
- `auto-promote: true` on the single production environment matches "merge = released". If your org has a staging registry mirror, add it as a separate env with `auto-promote: false`.
- `apiCheck` in pre-merge-checks is the same Kotlin/JVM convention as the kotlin-maven-central template — drop it if your project doesn't dump API surface.
- For monorepo libs published via Changesets or Nx, replace `publish-cmd` with `npx changeset publish` or the Nx equivalent.
