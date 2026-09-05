# Observability build — the compliance artifact (`observability/build.md` Step 8)

Load this file from `build.md` Step 8.

Write `.ai/observability-build.md`:

```yaml
---
schema: sdlc/v1
type: observability-build
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
plan-version-at-run: <plan.plan-version>
backend: <platform>
provisioning-ceiling: <ceiling>
files-created: [<list>]
files-patched: [<list>]
audits:
  A-emit-layer: <compliant | fixed | missing | skipped>   # per unit in the body
  B-pipeline:   <compliant | fixed | missing | skipped>
  C-backend:    <compliant | fixed | missing | skipped>
  D-dashboards: <compliant | fixed | missing | skipped>
backend-applied: <yes | printed | skipped | failed | n/a>
dashboards-published: <yes | printed | skipped | failed | n/a>
deps-to-install:
  - { unit: "<service>", name: "<package>", reason: "<emit adapter / OTel SDK>", command: "<install cmd>" }
credentials-to-set-manually:
  - { name: "<ENV_VAR>", purpose: "<backend auth — user sets this; build never enters it>", command: "<how to set>" }
validation:
  config-syntax: <pass | fail | skipped>
---

# Observability Build — <project-name>

## Files created / patched
<list with one-line descriptions>

## Emit adapters
<per unit: language, what was added, the reference-vs-idiomatic note>

## Provisioning (gated)
<for backend + dashboards: status; when printed/skipped, the exact commands + which env var carries the
credential the USER must set — never printed here as a value>

## Dev dependencies to install
<the OTel SDKs / logging libs the generated code references, per unit, with install commands>

## Re-run
After installing deps and setting credentials, re-run `/wf observability build --dry-run` to re-check, then
`/wf observability audit` for a soundness pass.
```
