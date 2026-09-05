# Ship-plan build — the compliance artifact (`ship-plan/build.md` Step 18)

Load this file from `build.md` Step 18. Write `.ai/pipeline-compliance.md` with this frontmatter and body.

```yaml
---
schema: sdlc/v1
type: pipeline-compliance
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
plan-version-at-run: <plan.plan-version>
ship-meaning: <plan.ship-meaning>
ecosystem: <detected>
files-created: [<list>]
files-patched: [<list>]
files-compliant: [<list>]
audits:
  A-pre-merge-checks: <compliant | fixed | missing | skipped>
  B-release-trigger: <compliant | fixed | missing>
  C-release-jobs: <compliant | fixed | missing>
  D-dry-run-cmd: <compliant | fixed | missing | skipped>
  E-publish-cmd: <compliant | fixed | missing>
  F-required-secrets: <compliant | fixed | missing>
  G-version-bump: <compliant | fixed | missing>
  H-post-publish: <compliant | fixed | missing | skipped>
  I-rollback: <compliant | fixed | missing | skipped>
  J-runbooks: <compliant | fixed | missing | skipped>
  K-quality-gates: <compliant | fixed | missing | skipped>
  L-commit-pr-title: <compliant | fixed | missing | skipped>
  M-git-hooks: <compliant | fixed | missing | skipped>
  N-dx-files: <compliant | fixed | missing | skipped>
  O-governance: <compliant | fixed | missing | skipped>
  P-security: <compliant | fixed | missing | skipped>
  Q-env-protection: <compliant | fixed | missing | skipped>
  R-merge-controls: <compliant | fixed | missing | skipped | warn>
  S-ci-ergonomics: <compliant | fixed | missing | skipped>
branch-protection-applied: <yes | printed | skipped | failed | n/a>
environment-protection-applied: <yes | printed | skipped | failed | n/a>
merge-settings-applied: <yes | printed | skipped | failed | warn | n/a>
secrets-to-set-manually:
  - { name: "<NAME>", purpose: "<from plan>", command: "gh secret set <NAME>" }
deps-to-install:                       # dev-deps the generated config references but does not install
  - { name: "<package>", reason: "<commitlint / husky / lint-staged / etc.>", command: "<install cmd>" }
gates-to-activate:                     # gates scaffolded inert (Step 17.7) — the pipeline goes live per-gate via these, never as a build side effect
  - { gate: "<SDLC_GATE_NAME>", blocked-on: "<the missing infrastructure>", activation: "gh variable set SDLC_GATE_<NAME> --body true (after <provisioning step>)" }
routing: <committed | sliced | left-uncommitted>   # Step 18.5 outcome
uncommitted-outputs: [<paths — only when routing: left-uncommitted>]
validation:
  yaml-syntax: <pass | fail>
  actionlint: <pass | fail | skipped>
  config-syntax: <pass | fail | skipped>
  version-consistency: <pass | fixed | fail>
  graph-integrity: <pass | fail>
  repo-gates: <pass | fixed | skipped>
  provisioning: <pass | scaffolded-inert | fail>
---

# Pipeline Compliance — <project-name>

## Files created
<list with one-line description>

## Files patched
<list with brief description of each edit>

## Secrets requiring manual configuration

These secrets are referenced in the generated workflows but must be set manually:

| Secret | Purpose | Command |
|---|---|---|
<for each required-secret: | NAME | purpose | `gh secret set NAME` |>

## Dev dependencies to install

The generated inbound-DX config references these but does not install them:

| Package | For | Command |
|---|---|---|
<for each dep in deps-to-install: | name | reason | `install cmd` |>

## Remote settings (gated)

For each of the three gated mutations, give the status and — when `printed`/`failed`/`manual` — the exact `gh api` command + payload so the user can apply it by hand:

- **Branch protection:** `<branch-protection-applied>` — `gh api -X PUT repos/<owner>/<repo>/branches/<base>/protection --input <payload>` (or the ruleset equivalent).
- **Environment protection:** `<environment-protection-applied>` — one `gh api -X PUT repos/<owner>/<repo>/environments/<name>` per protected env.
- **Merge settings:** `<merge-settings-applied>` — `gh api -X PATCH repos/<owner>/<repo>` (+ merge-queue note if the tier doesn't support it).

## Validation
<yaml-syntax, actionlint, and config-syntax results per file>

## Gates scaffolded inert

For each `gates-to-activate:` entry: what it gates, what infrastructure it is blocked on, and the exact activation command. A `--dry-run` re-audit reports these as `scaffolded-inert`, not missing.

## Re-run compliance check

After setting secrets and pushing, re-run this command to verify full compliance:
```
/wf ship-plan build --dry-run
```
```
