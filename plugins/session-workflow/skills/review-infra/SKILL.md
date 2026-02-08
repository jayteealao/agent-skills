---
name: review:infra
description: Infrastructure-focused review running 6 infrastructure review commands in parallel
---

# Infrastructure Code Review

Run 6 infrastructure review commands in parallel, then merge findings.

## Execution

Spawn these review commands as parallel Task agents. Each agent must:
1. Read the command file at the given path
2. Follow its WORKFLOW exactly
3. Return the complete review report

### Parallel Commands
1. `commands/review/infra.md` — Deployment config, least privilege, operational clarity
2. `commands/review/ci.md` — Pipeline security, deployment safety
3. `commands/review/release.md` — Versioning, rollout, migration, rollback
4. `commands/review/migrations.md` — Database migration safety
5. `commands/review/logging.md` — Secrets exposure, PII leaks, wide-events
6. `commands/review/observability.md` — Logs, metrics, tracing, alertability

## Task Agent Prompt Template

For each command, spawn a Task agent with this prompt:
"Read and execute the review command at `${CLAUDE_PLUGIN_ROOT}/commands/review/{name}.md`. Follow its WORKFLOW exactly. Review the current working tree changes (`git diff`). Return the complete review report as specified in the command's OUTPUT FORMAT."

## After All Complete: Merge

Combine all 6 agent reports into a single infrastructure review:
- Deduplicate findings that appear in multiple reports
- Sort by severity (BLOCKER > HIGH > MED > LOW > NIT)
- Merge file summaries across all reports
- Include operational readiness assessment
- Produce unified assessment: Production readiness recommendation
