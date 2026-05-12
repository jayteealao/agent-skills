---
template-kind: kotlin-maven-central
description: Library published to Maven Central via Sonatype Central with GPG signing. Tag-on-main release trigger; gradle publish workflow.
---

# Seed values

```yaml
ship-meaning: publish
ship-environments:
  - { name: production, auto-promote: false }
ship-cadence: on-demand

version-scheme: semver
version-source-of-truth:
  - { path: gradle.properties, field: VERSION_NAME }
version-bump-rule: git-cliff
version-bump-cmd: "git cliff --bumped-version"
prerelease-suffix: -SNAPSHOT
post-release-version: next-snapshot
post-release-version-cmd: "echo \"$(git cliff --bumped-version | sed 's/^v//')-SNAPSHOT\""

ci-pipeline:
  pre-merge-checks: [build, test, lint, apiCheck]
  release-trigger: tag-on-main
  release-workflow-file: ".github/workflows/release.yml"
  release-jobs: [validate-version, build-and-test, publish]
  publish-dry-run-cmd: "./gradlew publishToMavenLocal"
  publish-cmd: "./gradlew publishAndReleaseToMavenCentral"
  required-secrets:
    - { name: MAVEN_CENTRAL_USERNAME, purpose: "Sonatype user token username (https://central.sonatype.com/account)" }
    - { name: MAVEN_CENTRAL_PASSWORD, purpose: "Sonatype user token password" }
    - { name: SIGNING_KEY,            purpose: "ASCII-armored GPG private key, single line (newlines stripped)" }
    - { name: SIGNING_KEY_ID,         purpose: "Last 8 chars of GPG fingerprint" }
    - { name: SIGNING_KEY_PASSWORD,   purpose: "GPG passphrase" }
  secrets-staleness-threshold-days: 90

post-publish-checks:
  - kind: registry-api
    cmd: "curl -s 'https://central.sonatype.com/api/v1/publisher/published?namespace=$GROUP&name=$ARTIFACT&version=$VERSION'"
    expect: "published==true"
  - kind: fresh-resolve
    cmd: |
      mkdir -p /tmp/$ARTIFACT-smoke && cat > /tmp/$ARTIFACT-smoke/build.gradle.kts <<EOF
      repositories { mavenCentral() }
      configurations { create("smoke") }
      dependencies { "smoke"("$GROUP:$ARTIFACT:$VERSION") }
      EOF
      cd /tmp/$ARTIFACT-smoke && gradle dependencies --no-daemon --configuration smoke
    expect: "resolves cleanly"
  - kind: github-release
    cmd: "gh release view v$VERSION"
    expect: "tag exists"
propagation-window-min-minutes: 5
propagation-window-max-minutes: 30
poll-interval-seconds: 60

rollout-strategy: immediate
rollback-mechanism: redeploy-prior
rollback-time-estimate-min: 15
db-migrations-reversible: n/a

recovery-playbooks:
  - id: signing-failure
    triggers: ["gpg signing failed", "InvalidSignatureException", "no secret key"]
    steps:
      - "Re-export key (single-line): gpg --export-secret-keys --armor $KEY_ID | grep -v '^-----' | grep -v '^=' | tr -d '\\n'"
      - "Re-upload: gh secret set SIGNING_KEY --body \"$KEY\""
      - "Confirm SIGNING_KEY_ID matches the last 8 chars of the fingerprint"
      - "Re-run failed workflow: gh run rerun $RUN_ID"
  - id: registry-token-401
    triggers: ["401 Unauthorized", "authentication failed", "invalid credentials"]
    steps:
      - "Token likely expired — Sonatype tokens expire periodically"
      - "Regenerate at https://central.sonatype.com/account"
      - "Update both username and password secrets"
      - "Re-run failed workflow"

announcement:
  channels: []
  template-path: ".ai/release-announcement-template.md"
```

# Notes for the author

- The `gradle.properties` `VERSION_NAME` convention is from the standard Android/Kotlin library template. If your project uses `version` in `build.gradle.kts` instead, change `version-source-of-truth` accordingly.
- The post-release `next-snapshot` step is what keeps the working tree on a `-SNAPSHOT` version between releases. Drop it if you don't want that pattern.
- Maven Central publishes go through a propagation window (typically 5–30 minutes) before they appear in the public index. The `fresh-resolve` check is the strongest signal that propagation completed.
