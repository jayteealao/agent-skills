# Project-level handoff config

`/wf handoff` reads these optional keys from the workflow's `00-index.md` frontmatter. Each key's block is independent: handoff skips the corresponding step silently when the key is absent. Edit the keys directly in `00-index.md`.

```yaml
# Optional. Drives T3.6 — public-surface drift check.
# Pattern fits Kotlin .api dump, OpenAPI/Swagger, GraphQL SDL, exported TS .d.ts, SQL DDL.
public-surface:
  kind: <kotlin-api | openapi | graphql-schema | typescript-dts | sql-ddl>
  regen-cmd: "<command that regenerates the surface mirror>"
  files:
    - "<path to surface mirror>"

# Optional. Drives T3.7 — doc-mirror regen (user-facing docs generated from source,
# for example Docusaurus mirroring MDX → MD).
docs-mirror:
  regen-cmd: "<command that regenerates doc mirrors>"
  source-paths: ["<glob of doc sources>"]
  mirror-paths: ["<glob of generated mirrors>"]

# Optional. Overrides the default review-bots list used by T5.1 (PR comment triage)
# and the bot-settle wait in T5.0.
# Default if absent: [coderabbitai, greptile-dev, gemini-code-assist, "chatgpt-codex-connector[bot]"]
review-bots:
  - <login>

# Optional. Drives T5.0 / T5.3 — CI watch. Absent → the defaults shown.
ci-watch:
  poll-interval-seconds: 30      # how often to re-read statusCheckRollup
  max-wait-minutes: 30           # bound; on exceed → readiness-verdict: awaiting-input (resumable)
  max-fix-rounds: 2              # bounds PRODUCT-BUG rounds only. flaky-or-infra, converges:no, and
                                 # preexisting-unrelated reds consume a DECISION, not this budget;
                                 # local pre-push rounds (T3.8) never consume it either.

# Optional. Drives T5.0 — bot-review settle window. Absent → the defaults shown.
review-settle:
  settle-minutes: 5              # max time to wait for review-bots to post after CI goes green
  poll-interval-seconds: 30      # how often to re-read PR reviews/threads

# Optional. Drives T3.8 — the LOCAL pre-push gate (handoff step 5e).
# ABSENT → auto-detect from the repo's own PR-gate workflows, propose the derived
# list to the user ONCE, and persist their answer here (handoff step 5e.a).
# Present → run exactly these, no detection, no prompt.
pre-push-checks:
  checks:
    - { name: format, cmd: "pnpm exec prettier --check .",            blocking: true }
    - { name: lint,   cmd: "cd android && ./gradlew detekt ktlintCheck", blocking: true }
    - { name: unit,   cmd: "pnpm -r run test:unit",                    blocking: true }
  timeout-minutes: 15            # per-command bound; a check that exceeds it is `timed-out`, not `fail`
  on-fail: diagnose              # diagnose (route into the fix path) | stop (record and STOP)
# To decline the gate permanently in a repo where it cannot be useful:
#   pre-push-checks: { checks: [], declined-at: "<iso>", declined-reason: "<why>" }
```
