---
name: review:security
description: Security-focused review running 5 security review commands in parallel
---

# Security Code Review

Run 5 security review commands in parallel, then merge findings.

## Execution

Spawn these review commands as parallel Task agents. Each agent must:
1. Read the command file at the given path
2. Follow its WORKFLOW exactly
3. Return the complete review report

### Parallel Commands
1. `commands/review/security.md` — Vulnerabilities, insecure defaults, missing controls
2. `commands/review/privacy.md` — PII handling, data minimization, compliance
3. `commands/review/infra-security.md` — IAM, networking, secrets, configuration
4. `commands/review/data-integrity.md` — Data correctness over time, failures, concurrency
5. `commands/review/supply-chain.md` — Dependency risks, lockfiles, build integrity

## Task Agent Prompt Template

For each command, spawn a Task agent with this prompt:
"Read and execute the review command at `${CLAUDE_PLUGIN_ROOT}/commands/review/{name}.md`. Follow its WORKFLOW exactly. Review the current working tree changes (`git diff`). Return the complete review report as specified in the command's OUTPUT FORMAT."

## After All Complete: Merge

Combine all 5 agent reports into a single security review:
- Deduplicate findings that appear in multiple reports
- Sort by severity (BLOCKER > HIGH > MED > LOW > NIT)
- Merge file summaries across all reports
- Include threat surface analysis from the security command
- Produce unified assessment: Secure / Not Secure
